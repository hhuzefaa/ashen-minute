import * as THREE from 'three';
import { COLORS, angleDiff } from './Palette.js';
import { ShadowView } from '../objects/ShadowView.js';

// "You are the light." Every fire casts every nearby stone's shadow directly away from itself
// (rule 1); a shadow over the abyss is solid ground while it lasts (rule 2).
// Length is a designed curve (farther light → longer shadow, like a low sun), not physics:
// the lantern hangs below the gnomon's top, so real physics would give an infinite shadow.
export const SHADOW = Object.freeze({
  REACH: 9,          // m: lights farther than this cast nothing
  NEAR: 0.5,         // m: a light inside the stone casts nothing
  LEN_MIN: 3,        // m
  LEN_K: 1.6,        // m of shadow per m of light distance
  LEN_MAX: 16,       // m (also limits shadow skips)
  WIDTH: 1.4,        // m
  START: 0.7,        // m from the stone's centre where the shadow begins
  FADE_IN: 0.25,     // s
  FADE_OUT: 1.0,     // s — never vanish instantly under the player
  YAW_SMOOTH: 20,    // 1/s — removes lantern sway jitter without noticeable lag
  CARRY: true,       // a turning shadow carries whoever stands on it
  CARRY_MAX: 3,      // m/s
  POOL: 16,
});

const RIM = {
  ilen: new THREE.Color(COLORS.fire),
  echo: new THREE.Color(COLORS.time),
  marrow: new THREE.Color(0xc8f4ff),
  sconce: new THREE.Color(COLORS.target),
  sun: new THREE.Color(0xfff0c8),
};
const BLOCK_LOS = ['wall', 'gate'];

export class ShadowSystem {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.views = [];
    this.colliders = [];
    for (let i = 0; i < SHADOW.POOL; i++) {
      this.views.push(new ShadowView(this.root));
      this.colliders.push(game.collision.add({ cx: 0, cy: -0.1, cz: 0, hx: SHADOW.WIDTH / 2, hy: 0.1, hz: 0.5, tag: 'shadow', dynamic: true, enabled: false }));
    }
    this.freeViews = this.views.map((_, i) => i);
    this.shadows = new Map();    // key → shadow record (persists while visible)
    this.lights = [];            // reused { id, kind, pos }
    this._lightPool = [];
    this.stones = [];            // reused list of stones considered this step
    this.byCollider = new Map(); // collider → shadow (for carry)
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._o = { yaw: 0, len: 0, ux: 0, uz: 0, d: 0 };
    this.ilenActive = false;
    this.playerOnShadow = null;
  }

  // ------------------------------------------------------------------ lights
  _light(i) {
    let l = this._lightPool[i];
    if (!l) { l = { id: '', kind: '', pos: new THREE.Vector3() }; this._lightPool[i] = l; }
    return l;
  }

  gatherLights() {
    const L = this.lights;
    L.length = 0;
    let n = 0;
    if (this.ilenActive) {
      const l = this._light(n++);
      l.id = 'ilen'; l.kind = 'ilen';
      this.game.player.keeper.lanternCore.getWorldPosition(l.pos);
      L.push(l);
    }
    const p = this.game.world.activePuzzle;
    if (p && p.isLight) {
      for (const s of p.sconces) {
        if (!s.lit) continue;
        const l = this._light(n++);
        l.id = 's:' + s.id; l.kind = 'sconce';
        l.pos.set(s.pos.x, s.pos.y, s.pos.z);
        L.push(l);
      }
      for (const e of p.extraLights || []) { const l = this._light(n++); l.id = e.id; l.kind = e.kind; l.pos.copy(e.pos); L.push(l); }
    }
  }

  // ------------------------------------------------------------------ geometry
  /**
   * Shadow of `stone` cast by a light at (lx, ly, lz). Writes yaw/len/u into `out`; false = none.
   * Static so dev tools (light map) and tests use exactly the same rule as the game.
   */
  static compute(collision, base, lx, lz, out, a, b) {
    const vx = base.x - lx, vz = base.z - lz;
    const d = Math.hypot(vx, vz);
    if (d > SHADOW.REACH || d < SHADOW.NEAR) return false;
    const ux = vx / d, uz = vz / d;
    // line of sight: light → a point 0.8 m short of the stone (so its own collider doesn't block)
    a.set(lx, base.y + 1.0, lz);
    b.set(base.x - ux * 0.8, base.y + 1.0, base.z - uz * 0.8);
    if (d > 0.9 && collision.raycastFraction(a, b, BLOCK_LOS) < 1) return false;
    const raw = Math.min(SHADOW.LEN_MAX, Math.max(SHADOW.LEN_MIN, SHADOW.LEN_MIN + SHADOW.LEN_K * d));
    // a wall or gate stops the shadow
    a.set(base.x + ux * SHADOW.START, base.y + 0.4, base.z + uz * SHADOW.START);
    b.set(base.x + ux * raw, base.y + 0.4, base.z + uz * raw);
    const f = collision.raycastFraction(a, b, BLOCK_LOS);
    out.len = f < 1 ? SHADOW.START + f * (raw - SHADOW.START) : raw;
    out.ux = ux; out.uz = uz; out.d = d;
    out.yaw = Math.atan2(-ux, -uz); // forward convention: (−sin yaw, −cos yaw) = u
    return true;
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    this.gatherLights();
    const p = this.game.world.activePuzzle;
    const stones = p && p.isLight ? p.stones : EMPTY;
    for (const s of this.shadows.values()) s.alive = false;
    const o = this._o;
    for (const st of stones) {
      if (st.dormant && !st.awake) continue;
      for (const l of this.lights) {
        if (!ShadowSystem.compute(this.game.collision, st.base, l.pos.x, l.pos.z, o, this._a, this._b)) continue;
        const key = st.id + '|' + l.id;
        let s = this.shadows.get(key);
        if (!s) {
          if (!this.freeViews.length) continue;
          const idx = this.freeViews.pop();
          s = { key, stone: st, lightId: l.id, kind: l.kind, yaw: o.yaw, prevYaw: o.yaw, len: o.len, ux: o.ux, uz: o.uz, d: o.d, strength: 0, alive: true, idx, warned: false, boost: 0 };
          this.shadows.set(key, s);
          this.byCollider.set(this.colliders[idx], s);
        }
        s.alive = true;
        s.warned = false;
        s.prevYaw = s.yaw;
        const k = 1 - Math.exp(-SHADOW.YAW_SMOOTH * dt);
        s.yaw += angleDiff(o.yaw, s.yaw) * k;
        s.ux = -Math.sin(s.yaw); s.uz = -Math.cos(s.yaw);
        s.len += (o.len - s.len) * k;
        s.d = o.d;
      }
    }
    // fade in / out, sync visuals + colliders
    for (const s of this.shadows.values()) {
      if (s.alive) s.strength = Math.min(1, s.strength + dt / SHADOW.FADE_IN);
      else {
        s.prevYaw = s.yaw;
        if (!s.warned && s.strength > 0.6) { s.warned = true; this.game.audio.play('sfx_shadow_crack'); }
        s.strength -= dt / SHADOW.FADE_OUT;
      }
      if (s.strength <= 0) { this.release(s); continue; }
      const flicker = s.alive ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(this.game.time * 22));
      s.boost = Math.max(0, s.boost - dt * 2);
      this.views[s.idx].set(s.stone.base, s.yaw, SHADOW.START, s.len, s.strength * flicker, RIM[s.kind] || RIM.sconce, s.boost);
      const c = this.colliders[s.idx];
      const half = (s.len - SHADOW.START) / 2;
      this.game.collision.setTransform(c, s.stone.base.x + s.ux * (SHADOW.START + half), s.stone.base.z + s.uz * (SHADOW.START + half), s.yaw);
      c.hz = Math.max(0.05, half + 0.35); // include the rounded tip
      c.cy = s.stone.base.y - 0.1;
      c.enabled = true;
    }
    this.carry(dt);
  }

  release(s) {
    this.views[s.idx].hide();
    const c = this.colliders[s.idx];
    c.enabled = false;
    this.byCollider.delete(c);
    this.freeViews.push(s.idx);
    this.shadows.delete(s.key);
  }

  clear() { for (const s of [...this.shadows.values()]) this.release(s); }

  /** Moving shadows carry the player (rotation about the stone, capped). */
  carry(dt) {
    const pl = this.game.player;
    this.playerOnShadow = null;
    if (!pl.grounded) return;
    const c = this.game.collision.standingOn(pl.pos.x, pl.pos.z, pl.pos.y, 'shadow');
    if (!c) return;
    const s = this.byCollider.get(c);
    if (!s) return;
    this.playerOnShadow = s;
    if (!SHADOW.CARRY) return;
    const dy = angleDiff(s.yaw, s.prevYaw);
    if (Math.abs(dy) < 1e-5) return;
    const bx = s.stone.base.x, bz = s.stone.base.z;
    const rx = pl.pos.x - bx, rz = pl.pos.z - bz;
    const cs = Math.cos(dy), sn = Math.sin(dy);
    let mx = rx * cs + rz * sn - rx, mz = -rx * sn + rz * cs - rz;
    const m = Math.hypot(mx, mz), cap = SHADOW.CARRY_MAX * dt;
    if (m > cap) { mx *= cap / m; mz *= cap / m; }
    pl.pos.x += mx; pl.pos.z += mz;
  }

  /** Shadows currently cast by the given stone ids (for rune tests). */
  forStone(id, out) {
    out.length = 0;
    for (const s of this.shadows.values()) if (s.stone.id === id) out.push(s);
    return out;
  }
}
const EMPTY = [];
