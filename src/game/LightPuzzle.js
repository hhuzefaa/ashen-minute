import * as THREE from 'three';
import { SHADOW, coverDistance, tipDistance } from './ShadowSystem.js';
import { angleDiff, DEG } from './Palette.js';
import { MarrowEcho } from './Echo.js';

// One room of the temple, built on the five rules ("You are the light"). Data-driven (levels.js).
//  • Stones never turn; their shadows come from every fire near them (ShadowSystem). Rail stones
//    slide between slots with a lever (E) and their shadows simply recompute.
//  • Runes: covered by an eligible stone's shadow (cover or tip test) by the SAME shadow for
//    SHADOW.SETTLE s → the effect fires and latches (bridge / gate / relay). Sockets hold only
//    while covered. A shadow of a stone the rune does not know flashes red, once per entry.
//  • Sconces: E kindles from the lantern (it never runs out); a lit sconce burns `burn` s and is a
//    fire like any other. A shadow touching an unlit sconce for SHADOW.RELAY s lights it (rule 4).
//  • Passages (`passage: true`) have no ember, card or objective; they only carry stones/sconces
//    for the optional Lost Minutes.
export const LIGHT_PROMPTS = {
  kindle: '[E] KINDLE THE SCONCE',
  rekindle: '[E] FEED THE SCONCE',
  lever: '[E] SLIDE THE STONE',
  read: '[E] READ',
  aligned: 'THE SHADOW REMEMBERS',
  holds: 'THE SHADOW HOLDS',
  wrongSign: 'THE TEMPLE DOES NOT KNOW THIS SIGN',
  echoKeys: '[R] MARK A MINUTE   ·   [R] AGAIN TO LET IT WALK',
};
const KINDLE_R = 2.4;
const LEVER_R = 1.9;
const GRANT_R = 1.0;
const SOCKETS_HOLD = 1.0; // s all sockets must be held together
const HINT_T = [60, 120];  // s without progress before Marrow's hints (quiet rooms: ×1.5)

export class LightPuzzle {
  constructor(game, level, parts) {
    this.isLight = true;
    this.game = game;
    this.level = level;
    this.stones = parts.stones;         // [{ id, spec, relic, base, collider, dormant, awake, shadows, glow, rail }]
    this.stoneById = new Map(this.stones.map((s) => [s.id, s]));
    this.runes = parts.runes;           // Map id → { spec, view, pos, lit, bridge, coverKey, coverT, wrongKey, covered, near }
    this.sconces = parts.sconces;       // brazier objects with { sconce, id, burn, burnT, lit, lightId }
    this.braziers = parts.braziers;     // every brazier of the room (decor + sconces)
    this.decor = parts.braziers.filter((b) => !b.sconce);
    this.ember = parts.ember;
    this.readables = parts.readables || [];
    this.grant = parts.grant || null;   // { spec, mesh }
    this.pickups = parts.pickups || []; // Lost Minutes
    this.passage = !!level.passage;
    this.completed = false;
    this.flash = null;
    this.scheduled = [];
    this.focus = false;
    this.trails = [];
    this.prompt0 = null;
    this.progressT = 0;
    this.hintsGiven = 0;
    this.events = {};
    this.socketsT = 0;
    this.socketsDone = false;
    this.keysShown = false;
    this._v = new THREE.Vector3();
    // old dial-puzzle API, kept only while rooms on the old system remain (removed in Phase 6)
    this.relics = new Map(); this.selected = null; this.stats = { rewinds: 0 }; this.hudTimer = null;
    this.marrow = level.marrow ? new MarrowEcho(game, level.marrow.path, { speed: level.marrow.speed ?? 1.6 }) : null;
  }

  later(t, fn) { this.scheduled.push({ t, fn }); }
  showFlash(text, cls = '', dur = 1.8) { this.flash = { text, cls, t: dur }; }

  // -------------------------------------------------------------------------------------------
  update(dt, input, player, camera, active) {
    if (this.flash) { this.flash.t -= dt; if (this.flash.t <= 0) this.flash = null; }
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      const s = this.scheduled[i];
      s.t -= dt;
      if (s.t <= 0) { this.scheduled.splice(i, 1); s.fn(); }
    }
    this.focus = active && input.isDown('KeyQ');
    if (this.marrow) {
      if (this.zone.group.visible) { this.marrow.start(); this.marrow.update(dt); } else this.marrow.stop();
    }

    if (active) {
      this.updateInteraction(input, player);
      if (!this.completed) { this.updateBarks(); this.updateHints(dt); }
      this.updateGrant(player);
      for (const lm of this.pickups) if (!lm.collected && lm.touches(player.pos)) this.game.world.collectLostMinute(lm);
    }
    this.updateRails(dt);
    this.updateSconces(dt);
    this.updateRunes(dt, active);
    this.updateTrails(dt);

    if (active && this.ember && !this.completed && this.ember.group.visible && this.ember.touches(player.pos)) {
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
      const awake = !ru.spec.socket || this.stones.some((s) => !s.dormant || s.awake);
      ru.view.update(dt, { lit: awake, alignment: ru.lit ? 1 : Math.max(settling, ru.near * 0.6), solved: ru.lit });
      ru.bridge?.update(dt);
    }
    this.ember?.update(dt);
    for (const lm of this.pickups) lm.update(dt);
    if (this.grant) this.grant.mesh.rotation.y += dt * 0.4;
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
    else if (target.type === 'lever') this.slide(target.st);
    else if (target.type === 'read') this.game.read(target.r);
  }

  nearestInteractable(p) {
    let best = null, bd = Infinity;
    const consider = (type, x, z, r, extra) => {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < r * r && d < bd) { bd = d; best = { type, ...extra }; }
    };
    for (const b of this.sconces) if (!b.warded) consider('sconce', b.pos.x, b.pos.z, KINDLE_R, { b });
    for (const st of this.stones) if (st.rail && !st.moving && (!st.dormant || st.awake)) consider('lever', st.rail.lever[0], st.rail.lever[1], LEVER_R, { st });
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
    this.progress();
    if (fresh) this.lightDecor();
  }

  /** Rail stone: slide to the next slot (wraps). Its shadows recompute from the new base. */
  slide(st) {
    const rl = st.rail;
    st.slot = (st.slot + 1) % rl.slots;
    st.moving = { from: st.base.clone(), to: railPoint(rl, st.slot), t: 0 };
    this.game.audio.play('sfx_door');
  }

  updateRails(dt) {
    for (const st of this.stones) {
      const m = st.moving;
      if (!m) continue;
      m.t = Math.min(1, m.t + dt / 0.9);
      const e = m.t * m.t * (3 - 2 * m.t);
      st.base.lerpVectors(m.from, m.to, e);
      this.game.collision.move(st.collider, st.base.x, st.base.z);
      if (m.t >= 1) { st.moving = null; this.game.audio.play('sfx_stone_thud'); }
    }
  }

  /** The Keeper steps onto Marrow's sigil: she can mark minutes from now on. */
  updateGrant(player) {
    const g = this.grant;
    if (!g || this.game.world.progress.data.abilities[g.spec.ability]) { if (g) g.mesh.visible = false; return; }
    g.mesh.visible = true;
    if (Math.hypot(player.pos.x - g.spec.at[0], player.pos.z - g.spec.at[1]) > GRANT_R) return;
    const pr = this.game.world.progress;
    pr.data.abilities[g.spec.ability] = true;
    pr.save();
    g.mesh.visible = false;
    this.game.audio.play('sfx_echo_release');
    this.game.effects.burst(this._v.set(g.spec.at[0], 0.4, g.spec.at[1]), 60, this.game.effects.c.time, 2.4, 0.12, 1.2, this.game.effects.time);
    this.bark('grant');
    this.showFlash(LIGHT_PROMPTS.echoKeys, 'cyan', 6);
    this.progress();
  }

  // -------------------------------------------------------------------------------------------
  progress() { this.progressT = 0; }

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
        else if (Math.abs(angleDiff(s.yaw, st.firstYaw)) > 30 * DEG) { this.events.firstShadow = true; this.bark('firstShadow'); this.game.story.onFirstShadow(this.level); }
      }
    }
    const on = sh.playerOnShadow;
    if (on && on.kind !== 'ilen' && !this.events.sconceHold) { this.events.sconceHold = true; this.bark('sconceHold'); }
  }

  /** Hints on demand: Marrow speaks after a while without progress (never the solution first). */
  updateHints(dt) {
    const hints = this.level.hints;
    if (!hints || this.passage) return;
    this.progressT += dt;
    const k = this.level.quiet ? 1.5 : 1;
    if (this.hintsGiven < hints.length && this.progressT > HINT_T[this.hintsGiven] * k) {
      this.game.story.say('MARROW', hints[this.hintsGiven], 6);
      this.hintsGiven++;
    }
  }

  onFall() {
    if (!this.events.ownFall) { this.events.ownFall = true; this.bark('ownFall'); }
  }

  onEchoReleased() { this.progress(); }

  // -------------------------------------------------------------------------------------------
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
    let sockets = 0, held = 0;
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
          const off = sp.tip ? Math.abs(Math.hypot(dx, dz) - s.len) : Math.max(0, along - s.len);
          ru.near = Math.max(ru.near, along > 0 ? Math.max(0, 1 - (latAny + off) / 3) : 0);
        }
        if (lat > (sp.lat ?? SHADOW.COVER)) continue;
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
      if (sp.socket) {
        if (ru.lit && !cover) { ru.lit = false; this.game.audio.play('sfx_bridge_fade'); } // held only while covered
        sockets++;
        if (ru.lit) held++;
      }
    }
    if (sockets) this.updateSockets(dt, held, sockets);
  }

  /** The Heart: every socket held together for SOCKETS_HOLD s. */
  updateSockets(dt, held, total) {
    this.game.world.heart.sealLevel = this.socketsDone ? total : held;
    if (this.socketsDone) return;
    this.socketsT = held === total ? this.socketsT + dt : 0;
    if (this.socketsT >= SOCKETS_HOLD) {
      this.socketsDone = true;
      this.game.world.onAllSockets(this);
    }
  }

  trigger(ru, s) {
    const a = this.game.audio;
    ru.lit = true;
    ru.view.flash();
    s.boost = 1;
    this.progress();
    a.play('sfx_shadow_align');
    this.showFlash(ru.spec.socket ? LIGHT_PROMPTS.holds : LIGHT_PROMPTS.aligned, 'gold', 1.2);
    this.game.lockFeedback(ru.pos);
    const fx = ru.spec;
    if (ru.bridge) {
      ru.bridge.appear();
      this.later(0.12, () => a.play('sfx_bridge_form', { count: ru.bridge.slabs.length }));
    }
    if (fx.gate) this.later(0.3, () => this.game.world.openGate(fx.gate, true));
    if (fx.relay) {
      const b = this.sconces.find((x) => x.id === fx.relay);
      if (b && !b.lit) {
        this.trails.push({ from: ru.pos.clone().setY(0.2), to: b.pos.clone(), t: 0, dur: 1.0, done: () => { if (!b.lit) this.kindle(b); } });
        a.play('whoosh');
      }
    }
    if (fx.reveal) this.game.world.revealLostMinute(fx.reveal);
    if (!fx.socket) this.lightDecor();
  }

  /** Decorative braziers (all farther than REACH from every stone) catch when the room answers. */
  lightDecor() {
    if (this.decorLit || this.passage) return;
    this.decorLit = true;
    this.decor.forEach((b, i) => { if (!b.lit) this.later(0.45 + i * 0.26, () => { b.lit = true; this.game.audio.play('whoosh'); }); });
  }

  // -------------------------------------------------------------------------------------------
  /** Loading a save: the room is already restored. */
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

  /** Backspace: the room as it was (gates already opened stay open). */
  reset() {
    this.flash = null;
    this.scheduled.length = 0;
    this.trails.length = 0;
    this.progressT = 0;
    this.socketsT = 0;
    this.socketsDone = false;
    if (!this.completed) { this.decorLit = false; for (const b of this.decor) { b.lit = false; b.level = 0; } }
    for (const ru of this.runes.values()) {
      ru.lit = false; ru.coverKey = null; ru.coverT = 0; ru.wrongKey = null;
      if (ru.bridge && !ru.spec.keep) ru.bridge.hideImmediate();
    }
    for (const b of this.sconces) { b.lit = false; b.level = 0; b.burnT = 0; b.relayT = 0; b.relaying = false; }
    for (const st of this.stones) {
      if (!st.rail) continue;
      st.moving = null;
      st.slot = st.rail.start ?? 0;
      st.base.copy(railPoint(st.rail, st.slot));
      this.game.collision.move(st.collider, st.base.x, st.base.z);
    }
    this.marrow?.reset();
  }
}

export function railPoint(rl, i) {
  const t = rl.slots === 1 ? 0 : i / (rl.slots - 1);
  return new THREE.Vector3(rl.from[0] + (rl.to[0] - rl.from[0]) * t, rl.y ?? 0, rl.from[1] + (rl.to[1] - rl.from[1]) * t);
}
