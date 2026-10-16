import * as THREE from 'three';
import { SHADOW, coverDistance, tipDistance } from './ShadowSystem.js';
import { angleDiff, DEG } from './Palette.js';

// A room built on the five rules ("You are the light"). Data-driven from levels.js (`v2: true`).
//  • Stones never turn; their shadows come from every fire near them (ShadowSystem).
//  • Runes v2: covered by an eligible stone's shadow (cover or tip test) by the SAME shadow for
//    SHADOW.SETTLE seconds → the effect fires and latches (bridge / gate / relay). Sockets hold
//    only while covered. A shadow of a stone the rune does not know flashes red, once per entry.
//  • Sconces: E kindles from the lantern (it never runs out); a lit sconce burns `burn` seconds
//    and is a fire like any other. A shadow touching an unlit sconce for SHADOW.RELAY s lights it.
export const LIGHT_PROMPTS = {
  kindle: '[E] KINDLE THE SCONCE',
  rekindle: '[E] FEED THE SCONCE',
  lever: '[E] SLIDE THE STONE',
  read: '[E] READ',
  aligned: 'THE SHADOW REMEMBERS',
  wrongSign: 'THE TEMPLE DOES NOT KNOW THIS SIGN',
};
const KINDLE_R = 2.4;

export class LightPuzzle {
  constructor(game, level, parts) {
    this.isLight = true;
    this.game = game;
    this.level = level;
    this.stones = parts.stones;         // [{ id, spec, relic, base, collider, dormant, awake, shadows: Map, glow }]
    this.stoneById = new Map(this.stones.map((s) => [s.id, s]));
    this.runes = parts.runes;           // Map id → { spec, view, pos, lit, bridge, coverKey, coverT, wrong, covered }
    this.sconces = parts.sconces;       // brazier objects with { sconce, id, burn, burnT, lit, lightId }
    this.braziers = parts.braziers;     // every brazier of the room (decor + sconces)
    this.decor = parts.braziers.filter((b) => !b.sconce);
    this.ember = parts.ember;
    this.readables = parts.readables || [];
    this.relics = new Map();            // (old-puzzle API: no turnable relics here)
    this.completed = false;
    this.flash = null;
    this.scheduled = [];
    this.selected = null;
    this.focus = false;
    this.stats = { rewinds: 0 };
    this.trails = [];
    this.prompt0 = null;
    this.progressT = 0;                 // seconds since the last progress event (hints, later)
    this.events = { firstShadow: false, ownFall: false, sconceHold: false };
    this._v = new THREE.Vector3();
  }

  later(t, fn) { this.scheduled.push({ t, fn }); }
  showFlash(text, cls = '', dur = 1.8) { this.flash = { text, cls, t: dur }; }
  get hudTimer() { return null; }
  alignmentOf() { return 0; }
  bestCloseness() { return 0; }
  endRewind() {}

  // -------------------------------------------------------------------------------------------
  update(dt, input, player, camera, active) {
    if (this.flash) { this.flash.t -= dt; if (this.flash.t <= 0) this.flash = null; }
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      const s = this.scheduled[i];
      s.t -= dt;
      if (s.t <= 0) { this.scheduled.splice(i, 1); s.fn(); }
    }
    this.focus = active && input.isDown('KeyQ');
    this.progressT += dt;

    if (active && !this.completed) { this.updateInteraction(input, player); this.updateBarks(); }
    this.updateSconces(dt);
    this.updateRunes(dt, active);
    this.updateTrails(dt);

    if (active && this.ember && !this.completed && this.ember.touches(player.pos)) {
      this.completed = true;
      this.ember.collected = true;
      this.game.world.onLevelComplete(this);
    }

    // visuals
    for (const st of this.stones) {
      st.relic.glow = st.glow;
      st.relic.update(dt);
    }
    for (const ru of this.runes.values()) {
      const settling = ru.coverT > 0 && !ru.lit ? Math.min(1, ru.coverT / SHADOW.SETTLE) : 0;
      ru.view.update(dt, { lit: true, alignment: ru.lit ? 1 : Math.max(settling, ru.near * 0.6), solved: ru.lit });
      ru.bridge?.update(dt);
    }
    this.ember?.update(dt);
    let near = 0;
    if (active) for (const ru of this.runes.values()) if (!ru.lit) near = Math.max(near, ru.near);
    this.game.audio.setLoopLevel('near_tone', active && near > 0.4 ? (near - 0.4) * 0.08 : 0.0001);
  }

  // -------------------------------------------------------------------------------------------
  updateInteraction(input, player) {
    const target = this.nearestInteractable(player.pos);
    this.prompt0 = target;
    if (!target || !input.wasPressed('KeyE')) return;
    if (target.type === 'sconce') this.kindle(target.b, true);
    else if (target.type === 'read') this.game.read(target.r);
  }

  nearestInteractable(p) {
    let best = null, bd = Infinity;
    const consider = (type, x, z, r, extra) => {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < r * r && d < bd) { bd = d; best = { type, ...extra }; }
    };
    for (const b of this.sconces) consider('sconce', b.pos.x, b.pos.z, KINDLE_R, { b });
    for (const r of this.readables) consider('read', r.x, r.z, 2.2, { r });
    return best;
  }

  kindle(b, byHand = false) {
    const fresh = !b.lit;
    b.lit = true;
    b.burnT = b.burn;
    b.warned = false;
    if (fresh) b.level = Math.min(b.level, 0.2);
    const a = this.game.audio;
    a.play('sfx_relic_ignite');
    if (fresh) a.startLoop('amb_fire_crackle');
    this.game.effects.burst(b.pos, byHand ? 30 : 40, this.game.effects.c.hot, 2.4, 0.12, 0.9);
    this.progressT = 0;
    if (fresh) this.lightDecor();
  }

  // -------------------------------------------------------------------------------------------
  /** One-time, non-blocking lines tied to what the player just discovered (levels.js `barks`). */
  bark(name) {
    const line = this.level.barks?.[name];
    const story = this.game.story;
    const key = `bark_${this.level.id}_${name}`;
    if (!line || story.seen(key)) return;
    story.progress.mark('story', key);
    story.say(line[0], line[1], 5);
  }

  updateBarks() {
    const sh = this.game.shadows;
    if (this.level.barks?.firstShadow && !this.events.firstShadow) {
      for (const st of this.stones) {
        const s = st.shadows.get('ilen');
        if (!s || !s.alive) continue;
        if (st.firstYaw === undefined) st.firstYaw = s.yaw;
        else if (Math.abs(angleDiff(s.yaw, st.firstYaw)) > 30 * DEG) { this.events.firstShadow = true; this.bark('firstShadow'); }
      }
    }
    const on = sh.playerOnShadow;
    if (on && on.kind !== 'ilen' && !this.events.sconceHold) { this.events.sconceHold = true; this.bark('sconceHold'); }
  }

  /** Game calls this when the Keeper falls while in this room. */
  onFall() {
    if (!this.events.ownFall) { this.events.ownFall = true; this.bark('ownFall'); }
  }

  updateSconces(dt) {
    const list = this.game.shadows.list;
    for (const b of this.sconces) {
      if (b.lit) {
        if (!Number.isFinite(b.burn)) continue;
        b.burnT -= dt;
        if (b.burnT <= 3 && !b.warned) { b.warned = true; this.game.audio.play('sfx_bridge_warning'); }
        if (b.burnT <= 0) { b.lit = false; b.burnT = 0; this.game.audio.play('sfx_bridge_fade'); }
        continue;
      }
      // rule 4: a shadow touching an unlit sconce sets it alight
      let touching = null;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (!s.alive || s.strength < 0.5) continue;
        if (coverDistance(s, b.pos.x, b.pos.z) <= SHADOW.COVER) { touching = s; break; }
      }
      if (!touching) { b.relayT = 0; continue; }
      b.relayT = (b.relayT || 0) + dt;
      if (b.relayT >= SHADOW.RELAY && !b.relaying) {
        b.relaying = true;
        const s = touching;
        const along = (b.pos.x - s.stone.base.x) * s.ux + (b.pos.z - s.stone.base.z) * s.uz;
        const from = new THREE.Vector3(s.stone.base.x + s.ux * along, 0.2, s.stone.base.z + s.uz * along);
        this.trails.push({ from, to: b.pos.clone(), t: 0, dur: 0.45, done: () => { b.relaying = false; if (!b.lit) this.kindle(b); } });
        this.game.audio.play('whoosh');
      }
    }
  }

  updateTrails(dt) {
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i];
      tr.t += dt / (tr.dur || 1.2);
      const k = Math.min(1, tr.t);
      const p = this._v.lerpVectors(tr.from, tr.to, k);
      p.y += Math.sin(k * Math.PI) * 0.6;
      this.game.effects.flame(p, 140, dt, 0.25, 1.4);
      if (tr.t >= 1) { this.trails.splice(i, 1); tr.done(); }
    }
  }

  // -------------------------------------------------------------------------------------------
  updateRunes(dt, active) {
    const list = this.game.shadows.list;
    for (const st of this.stones) st.glow = 0;
    for (const ru of this.runes.values()) {
      const sp = ru.spec;
      let cover = null, wrong = null;
      ru.near = 0;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (!s.alive || s.strength < 0.5 || !this.stoneById.has(s.stone.id)) continue;
        const valid = sp.stones.includes(s.stone.id);
        const lat = sp.tip ? tipDistance(s, ru.pos.x, ru.pos.z, sp.tol ?? 0.7) : coverDistance(s, ru.pos.x, ru.pos.z);
        if (valid && s.kind === 'ilen' && !ru.lit) {
          // near-tone feedback for Ilen's own shadows approaching a valid rune
          const dx = ru.pos.x - s.stone.base.x, dz = ru.pos.z - s.stone.base.z;
          const along = dx * s.ux + dz * s.uz;
          const latAny = Math.abs(-dx * s.uz + dz * s.ux);
          const short = Math.max(0, along - s.len);
          ru.near = Math.max(ru.near, along > 0 ? Math.max(0, 1 - (latAny + short) / 3) : 0);
        }
        if (lat > SHADOW.COVER) continue;
        if (valid) { if (!cover || s.key === ru.coverKey) cover = s; }
        else if (!wrong) wrong = s;
      }
      // wrong sign: red flash once per entry
      if (wrong && ru.wrongKey !== wrong.key && !ru.lit) {
        ru.view.reject();
        if (active) { this.showFlash(LIGHT_PROMPTS.wrongSign, '', 1.8); this.game.audio.play('sfx_no_memory'); }
      }
      ru.wrongKey = wrong ? wrong.key : null;

      ru.covered = !!cover;
      if (cover) {
        cover.stone.glow = 1;
        cover.boost = Math.max(cover.boost, Math.min(1, ru.coverT / SHADOW.SETTLE));
        if (ru.coverKey !== cover.key) { ru.coverKey = cover.key; ru.coverT = 0; }
        ru.coverT += dt;
        if (!ru.lit && ru.coverT >= SHADOW.SETTLE) this.trigger(ru, cover);
      } else { ru.coverKey = null; ru.coverT = 0; }
      if (sp.socket && ru.lit && !cover) ru.lit = false; // sockets hold only while covered
    }
  }

  trigger(ru, s) {
    const a = this.game.audio;
    ru.lit = true;
    ru.view.flash();
    s.boost = 1;
    this.progressT = 0;
    a.play('sfx_shadow_align');
    this.showFlash(LIGHT_PROMPTS.aligned, 'gold', 1.2);
    this.game.effects.burst(this._v.copy(ru.pos).setY(ru.pos.y + 0.3), 50, this.game.effects.c.gold, 3, 0.14, 1.2);
    const fx = ru.spec;
    if (ru.bridge) {
      ru.bridge.appear();
      this.later(0.12, () => a.play('sfx_bridge_form', { count: ru.bridge.slabs.length }));
    }
    if (fx.gate) this.later(0.3, () => this.game.world.openGate(fx.gate, true));
    if (fx.relay) { const b = this.sconces.find((x) => x.id === fx.relay); if (b && !b.lit) this.kindle(b); }
    if (fx.lights !== false) this.lightDecor();
  }

  /** Decorative braziers (all farther than REACH from every stone) catch when the room answers. */
  lightDecor() {
    if (this.decorLit) return;
    this.decorLit = true;
    this.decor.forEach((b, i) => { if (!b.lit) this.later(0.45 + i * 0.26, () => { b.lit = true; this.game.audio.play('whoosh'); }); });
  }

  // -------------------------------------------------------------------------------------------
  applyCompleted() {
    this.completed = true;
    if (this.ember) { this.ember.collected = true; this.ember.group.visible = false; }
    for (const ru of this.runes.values()) {
      if (ru.spec.socket) continue;
      ru.lit = true;
      if (ru.bridge) ru.bridge.appear();
    }
    for (const b of this.decor) { b.lit = true; b.level = 1; }
    this.decorLit = true;
  }

  reset() {
    this.flash = null;
    this.scheduled.length = 0;
    this.trails.length = 0;
    this.progressT = 0;
    if (!this.completed) { this.decorLit = false; for (const b of this.decor) { b.lit = false; b.level = 0; } }
    for (const ru of this.runes.values()) {
      ru.lit = false; ru.coverKey = null; ru.coverT = 0; ru.wrongKey = null;
      if (ru.bridge) ru.bridge.hideImmediate();
    }
    for (const b of this.sconces) { b.lit = false; b.level = 0; b.burnT = 0; b.relayT = 0; b.relaying = false; }
  }

  dispose() {}
}
