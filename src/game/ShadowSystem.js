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
  TIP: 0.35,         // m the walkable collider extends past len (the rounded tip)
  FADE_IN: 0.25,     // s
  FADE_OUT: 1.0,     // s — never vanish instantly under the player
  YAW_SMOOTH: 20,    // 1/s — removes lantern sway jitter without noticeable lag
  CARRY: true,       // a turning shadow carries whoever stands on it
  CARRY_MAX: 3,      // m/s
  POOL: 16,
  COVER: 0.8,        // m: rune / sconce "touch" radius around the shadow's centre line
  SETTLE: 0.4,       // s a rune must be covered by the same shadow before it wakes
  RELAY: 0.25,       // s a shadow must touch an unlit sconce before it catches
});

const RIM = {
  ilen: new THREE.Color(COLORS.fire),
  echo: new THREE.Color(COLORS.time),
  marrow: new THREE.Color(0xc8f4ff),
  sconce: new THREE.Color(COLORS.target),
  sun: new THREE.Color(0xfff0c8),
};
const BLOCK_LOS = ['wall', 'gate'];
const CLIP_START = 0.85; // > 0.55·√2: outside a stone's square collider in every direction

/** Lateral distance from (x,z) to a shadow's centre line, or Infinity if outside its length. */
export function coverDistance(s, x, z) {
  const dx = x - s.stone.base.x, dz = z - s.stone.base.z;
  const along = dx * s.ux + dz * s.uz;
  if (along < SHADOW.START || along > s.len + 0.3) return Infinity;
  return Math.abs(-dx * s.uz + dz * s.ux);
}

/** Tip test (rail-stone length puzzles): the tip lands on (x,z) within tol. */
export function tipDistance(s, x, z, tol) {
  const dx = x - s.stone.base.x, dz = z - s.stone.base.z;
  if (dx * s.ux + dz * s.uz <= 0) return Infinity; // the tip is ahead of the stone, never behind it
  if (Math.abs(Math.hypot(dx, dz) - s.len) > tol) return Infinity;
  return Math.abs(-dx * s.uz + dz * s.ux);
}

export class ShadowSystem {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.name = 'Shadows';
    game.scene.add(this.root);
    this.views = [];
    this.colliders = [];
    for (let i = 0; i < SHADOW.POOL; i++) {
      this.views.push(new ShadowView(this.root));
      this.colliders.push(game.collision.add({ cx: 0, cy: -0.1, cz: 0, hx: SHADOW.WIDTH / 2, hy: 0.1, hz: 0.5, tag: 'shadow', dynamic: true, enabled: false }));
    }
    this.free = [];
    for (let i = SHADOW.POOL - 1; i >= 0; i--) this.free.push(i);
    this.list = [];              // live shadow records (alive or fading)
    this.byIdx = new Array(SHADOW.POOL).fill(null);
    this.lights = [];            // reused { id, kind, pos } (pos is a reused vector)
    this._lightPool = [];
    this.stones = [];            // reused list of stones considered this step
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._o = { yaw: 0, len: 0, ux: 0, uz: 0, d: 0 };
    this.ilenActive = false;
    this.playerOnShadow = null;
    this.extraLights = [];       // { id, kind, pos } registered by echoes and Marrow
    // Focus (hold Q): faint previews of where each unlit sconce would cast if kindled
    this.focus = false;
    this.previews = [];
    for (let i = 0; i < 6; i++) this.previews.push(new ShadowView(this.root, { preview: true }));
    this._po = { yaw: 0, len: 0, ux: 0, uz: 0, d: 0 };
  }

  updatePreviews() {
    let n = 0;
    const p = this.game.world.activePuzzle;
    if (this.focus && p) {
      const pulse = 0.55 + 0.35 * Math.sin(this.game.time * 5);
      for (const sc of p.sconces) {
        if (sc.lit) continue;
        for (const st of p.stones) {
          if (n >= this.previews.length) break;
          if (st.dormant && !st.awake) continue;
          if (!ShadowSystem.compute(this.game.collision, st.base, sc.pos.x, sc.pos.z, this._po, this._a, this._b)) continue;
          this.previews[n++].set(st.base, this._po.yaw, SHADOW.START, this._po.len, 0.35 * pulse, RIM.sconce, 0.6);
        }
      }
    }
    for (let i = n; i < this.previews.length; i++) this.previews[i].hide();
  }

  // ------------------------------------------------------------------ lights + stones
  _light(i) {
    let l = this._lightPool[i];
    if (!l) { l = { id: '', kind: '', pos: new THREE.Vector3() }; this._lightPool[i] = l; }
    return l;
  }

  gather() {
    const L = this.lights, S = this.stones;
    L.length = 0; S.length = 0;
    let n = 0;
    if (this.ilenActive) {
      const l = this._light(n++);
      l.id = 'ilen'; l.kind = 'ilen';
      this.game.player.keeper.lanternCore.getWorldPosition(l.pos);
      L.push(l);
    }
    for (const e of this.extraLights) { const l = this._light(n++); l.id = e.id; l.kind = e.kind; l.pos.copy(e.pos); L.push(l); }
    // every light puzzle whose zone is on screen contributes its stones and lit sconces
    for (const p of this.game.world.lightPuzzles) {
      if (!p.zone.group.visible && p !== this.game.world.activePuzzle) continue;
      for (const st of p.stones) if (!st.dormant || st.awake) S.push(st);
      for (const sc of p.sconces) {
        if (!sc.lit) continue;
        const l = this._light(n++);
        l.id = sc.lightId; l.kind = 'sconce';
        l.pos.copy(sc.pos);
        L.push(l);
      }
    }
  }

  // ------------------------------------------------------------------ geometry
  /**
   * Shadow of a stone at `base` cast by a light at (lx, lz). Writes yaw/len/u/d into `out`.
   * Returns false when there is no shadow. Static so the light map and tests use exactly the
   * same rule as the game.
   */
  static compute(collision, base, lx, lz, out, a, b) {
    const vx = base.x - lx, vz = base.z - lz;
    const d = Math.hypot(vx, vz);
    if (d > SHADOW.REACH || d < SHADOW.NEAR) return false;
    const ux = vx / d, uz = vz / d;
    // line of sight: light → a point 0.8 m short of the stone (so its own collider doesn't block)
    if (d > 0.9) {
      a.set(lx, base.y + 1.0, lz);
      b.set(base.x - ux * 0.8, base.y + 1.0, base.z - uz * 0.8);
      if (collision.raycastFraction(a, b, BLOCK_LOS) < 1) return false;
    }
    const raw = Math.min(SHADOW.LEN_MAX, Math.max(SHADOW.LEN_MIN, SHADOW.LEN_MIN + SHADOW.LEN_K * d));
    // a wall or gate stops the shadow (ray starts outside the stone's own box, even diagonally)
    const r0 = CLIP_START;
    a.set(base.x + ux * r0, base.y + 0.4, base.z + uz * r0);
    b.set(base.x + ux * raw, base.y + 0.4, base.z + uz * raw);
    const f = collision.raycastFraction(a, b, BLOCK_LOS);
    out.len = f < 1 ? Math.max(SHADOW.START, r0 + f * (raw - r0)) : raw;
    out.ux = ux; out.uz = uz; out.d = d;
    out.yaw = Math.atan2(-ux, -uz); // forward convention: (−sin yaw, −cos yaw) = u
    return true;
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    this.gather();
    for (let i = 0; i < this.list.length; i++) this.list[i].alive = false;
    const o = this._o;
    const k = 1 - Math.exp(-SHADOW.YAW_SMOOTH * dt);
    for (const st of this.stones) {
      for (const l of this.lights) {
        if (!ShadowSystem.compute(this.game.collision, st.base, l.pos.x, l.pos.z, o, this._a, this._b)) continue;
        let s = st.shadows.get(l.id);
        if (!s) {
          if (!this.free.length) continue;
          const idx = this.free.pop();
          s = { key: st.id + '|' + l.id, stone: st, lightId: l.id, kind: l.kind, yaw: o.yaw, prevYaw: o.yaw, len: o.len, ux: o.ux, uz: o.uz, d: o.d, strength: 0, alive: true, idx, warned: false, boost: 0 };
          st.shadows.set(l.id, s);
          this.byIdx[idx] = s;
          this.list.push(s);
        }
        s.alive = true;
        s.warned = false;
        s.prevYaw = s.yaw;
        s.yaw += angleDiff(o.yaw, s.yaw) * k;
        s.ux = -Math.sin(s.yaw); s.uz = -Math.cos(s.yaw);
        s.len += (o.len - s.len) * k;
        s.d = o.d;
      }
    }
    // fade in / out, sync visuals + colliders
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      if (s.alive) s.strength = Math.min(1, s.strength + dt / SHADOW.FADE_IN);
      else {
        s.prevYaw = s.yaw;
        if (!s.warned && s.strength > 0.6) { s.warned = true; this.game.audio.play('sfx_shadow_crack'); }
        s.strength -= dt / SHADOW.FADE_OUT;
      }
      if (s.strength <= 0) { this.release(s, i); continue; }
      const flicker = s.alive ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(this.game.time * 22));
      s.boost = Math.max(this.focus ? 0.8 : 0, s.boost - dt * 2);
      this.views[s.idx].set(s.stone.base, s.yaw, SHADOW.START, s.len, s.strength * flicker, RIM[s.kind] || RIM.sconce, s.boost);
      const c = this.colliders[s.idx];
      const half = (s.len + SHADOW.TIP - SHADOW.START) / 2;
      this.game.collision.setTransform(c, s.stone.base.x + s.ux * (SHADOW.START + half), s.stone.base.z + s.uz * (SHADOW.START + half), s.yaw);
      c.hz = Math.max(0.05, half);
      c.cy = s.stone.base.y - 0.1;
      c.enabled = true;
    }
    this.carry(dt);
    this.updatePreviews();
  }

  /** Is Ilen's lantern casting a shadow of a stone within `r` m of p? (camera assist) */
  ilenNear(p, r) {
    for (let i = 0; i < this.list.length; i++) {
      const s = this.list[i];
      if (s.kind !== 'ilen' || !s.alive) continue;
      const dx = s.stone.base.x - p.x, dz = s.stone.base.z - p.z;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  release(s, i = this.list.indexOf(s)) {
    this.views[s.idx].hide();
    this.colliders[s.idx].enabled = false;
    this.byIdx[s.idx] = null;
    this.free.push(s.idx);
    s.stone.shadows.delete(s.lightId);
    const last = this.list.length - 1;
    if (i >= 0) { this.list[i] = this.list[last]; this.list.length = last; }
  }

  clear() { while (this.list.length) this.release(this.list[this.list.length - 1], this.list.length - 1); }

  /** Moving shadows carry the player (rotation about the stone, capped). */
  carry(dt) {
    const pl = this.game.player;
    this.playerOnShadow = null;
    if (!pl.grounded) return;
    const c = this.game.collision.standingOn(pl.pos.x, pl.pos.z, pl.pos.y, 'shadow');
    if (!c) return;
    const s = this.byIdx[this.colliders.indexOf(c)];
    if (!s) return;
    this.playerOnShadow = s;
    if (!SHADOW.CARRY) return;
    const dy = angleDiff(s.yaw, s.prevYaw);
    if (Math.abs(dy) < 1e-5) return;
    const bx = s.stone.base.x, bz = s.stone.base.z;
    const rx = pl.pos.x - bx, rz = pl.pos.z - bz;
    const cs = Math.cos(dy), sn = Math.sin(dy);
    // rotation by +dy about the vertical axis (Three.js convention)
    let mx = rx * cs + rz * sn - rx, mz = -rx * sn + rz * cs - rz;
    const m = Math.hypot(mx, mz), cap = SHADOW.CARRY_MAX * dt;
    if (m > cap) { mx *= cap / m; mz *= cap / m; }
    pl.pos.x += mx; pl.pos.z += mz;
  }
}
