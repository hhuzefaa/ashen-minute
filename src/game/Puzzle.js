import * as THREE from 'three';
import { angleDiff, DEG } from './Palette.js';
import { BRIDGE } from '../objects/ShadowBridge.js';

// One puzzle = one level of the temple. It owns several relics, runes and bridges and is fully
// data-driven (see src/world/levels.js). Rules, all deterministic:
//  • A lit relic casts a fixed-length shadow along its yaw (never from renderer shadow maps).
//  • A rune is satisfied when an eligible relic's angle error ≤ tol (and, if the rune has lenTol,
//    the shadow's length matches the relic→rune distance — used by rail relics).
//  • On satisfaction the relic locks exactly onto the rune and the rune's effects fire:
//    bridge (optionally timed) · relay (fire runs along the shadow and lights another relic) ·
//    gate (opens a temple door) · socket (final trial: all sockets must hold at once).
//  • A shadow tip landing on a rune it may not use flashes red ("wrong sign") and has no effect.
//  • Every failure is recoverable: timed spans slip the relic (rewind it back), sockets drift,
//    flames can be re-taken from an eternal hearth, and Backspace restarts the puzzle.

export const PROMPTS = {
  ignite: '[E] IGNITE RELIC',
  kindle: '[E] KINDLE THE RELIC',
  cold: 'THIS RELIC IS COLD — IT NEEDS A FLAME',
  coldRelay: 'THIS RELIC WAITS FOR ANOTHER\'S FIRE',
  takeFlame: '[E] TAKE THE FLAME',
  lever: '[E] SLIDE THE RELIC',
  read: '[E] READ',
  turn: 'TURN THE RELIC TO ALIGN ITS SHADOW',
  rewindHint: 'HOLD [R] TO REWIND THE RELIC',
  near: 'THE SHADOW IS NEAR',
  aligned: 'THE SHADOW REMEMBERS',
  holds: 'THE SHADOW HOLDS',
  noMemory: 'NO RECENT MEMORY',
  wrongSign: 'THE TEMPLE DOES NOT KNOW THIS SIGN',
};

const RADIUS = 2.5;

export class RelicState {
  constructor(spec, relic, guide, collider) {
    this.spec = spec;
    this.id = spec.id;
    this.relic = relic;
    this.guide = guide;
    this.collider = collider;
    this.len = guide.length;
    this.jolt = null;
    this.anchor = relic.yaw;
    this.rewinding = false;
    this.usedRewind = false;
    this.rotSign = 0;
    this.rotHeld = 0;
    this.atLimit = false;
    this.lockedOn = null;   // rune id
    this.holdT = 0;
    this.slot = spec.rail ? spec.rail.start ?? 0 : 0;
    this.moving = null;     // rail slide animation
    this.lastSweep = new Map();
    this.oldestWarned = false;
  }
  get lit() { return this.relic.lit; }
  get busy() { return !!this.jolt || !!this.moving; }
}

export class Puzzle {
  constructor(game, level, parts) {
    this.game = game;
    this.level = level;
    this.relics = parts.relics;     // Map id → RelicState
    this.runes = parts.runes;       // Map id → { spec, view, lit, bridge, timer }
    this.ember = parts.ember;
    this.braziers = parts.braziers;
    this.readables = parts.readables || [];
    this.completed = false;
    this.flash = null;
    this.scheduled = [];
    this.selected = null;           // relic the Keeper is operating
    this.focus = false;
    this.stats = { rewinds: 0 };
    this.trails = [];               // relay fire trails
    this.prompt0 = null;
    this._v = new THREE.Vector3();
    this._r = new THREE.Vector3();
  }

  later(t, fn) { this.scheduled.push({ t, fn }); }
  showFlash(text, cls = '', dur = 1.8) { this.flash = { text, cls, t: dur }; }

  // -------------------------------------------------------------------------------------------
  /** active = the Keeper is inside this level's zone (input + logic). Visuals always tick. */
  update(dt, input, player, camera, active) {
    if (this.flash) { this.flash.t -= dt; if (this.flash.t <= 0) this.flash = null; }
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      const s = this.scheduled[i];
      s.t -= dt;
      if (s.t <= 0) { this.scheduled.splice(i, 1); s.fn(); }
    }
    this.focus = active && input.isDown('KeyQ');

    if (active && !this.completed) this.updateInteraction(dt, input, player, camera);

    for (const rs of this.relics.values()) this.updateRelic(dt, rs, player);
    this.updateRunes(dt, player);
    this.tickPendingTimers();
    this.updateTrails(dt);

    // completion trigger
    if (active && this.ember && !this.completed && this.ember.touches(player.pos)) {
      this.completed = true;
      this.ember.collected = true;
      this.game.world.onLevelComplete(this);
    }

    // visuals
    for (const rs of this.relics.values()) {
      const r = rs.relic;
      const sel = rs === this.selected;
      r.ghost.visible = rs.rewinding;
      if (rs.rewinding) { const gy = r.history.peekBack(10); if (gy !== null) r.ghostPivot.rotation.y = gy; }
      rs.guide.trailOn = rs.rewinding;
      if (rs.rewinding || (this.focus && sel)) rs.guide.updateTrail(r.history.samples);
      rs.guide.echoOn = rs.spec.echo && r.lit && !rs.lockedOn;
      r.collarVisible = rs.spec.mode === 'collar' && r.lit && !rs.lockedOn && !rs.busy;
      r.update(dt);
      r.applyYaw();
      const al = this.alignmentOf(rs);
      rs.guide.update(dt, { lit: r.lit, yaw: r.yaw, alignment: al, solved: !!rs.lockedOn, focus: this.focus && sel, rewinding: rs.rewinding });
    }
    for (const ru of this.runes.values()) {
      const lit = ru.spec.relics.some((id) => this.relics.get(id)?.lit);
      let al = 0;
      for (const id of ru.spec.relics) { const rs = this.relics.get(id); if (rs?.lit) al = Math.max(al, this.closeness(rs, ru)); }
      ru.view.update(dt, { lit, alignment: al, solved: ru.lit });
      ru.bridge?.update(dt);
    }
    this.ember?.update(dt);
    const near = active && this.selected && this.selected.lit && !this.selected.lockedOn ? this.bestCloseness(this.selected) : 0;
    this.game.audio.setLoopLevel('near_tone', active && near > 0.4 ? (near - 0.4) * 0.08 : 0.0001);
  }

  // -------------------------------------------------------------------------------------------
  updateInteraction(dt, input, player, camera) {
    const audio = this.game.audio;
    const p = player.pos;
    // nearest relic within reach becomes "selected" (A/D/R operate it)
    let best = null, bd = RADIUS * RADIUS;
    for (const rs of this.relics.values()) {
      if (rs.spec.dormant && !rs.awake) continue;
      const b = rs.relic.base;
      const d = (p.x - b.x) ** 2 + (p.z - b.z) ** 2;
      if (d < bd && Math.abs(p.y - b.y) < 1.2) { bd = d; best = rs; }
    }
    if (best !== this.selected && this.selected?.rewinding) this.endRewind(this.selected);
    this.selected = best;

    // E: interactions by priority (nearest thing first)
    const ePressed = input.wasPressed('KeyE');
    const target = this.nearestInteractable(p);
    this.prompt0 = target;
    if (ePressed && target) {
      if (target.type === 'relic') this.tryIgnite(target.rs, player);
      else if (target.type === 'lever') this.slideRail(target.rs);
      else if (target.type === 'hearth') this.takeFlame(player, target.b);
      else if (target.type === 'read') this.game.read(target.r);
    }

    const rs = this.selected;
    if (!rs || !rs.lit || rs.lockedOn || rs.busy) { if (rs?.rewinding) this.endRewind(rs); return; }

    // R: rewind
    const wantRewind = input.isDown('KeyR');
    if (wantRewind && !rs.rewinding) {
      if (rs.relic.history.beginRewind(rs.relic.yaw)) {
        rs.rewinding = true;
        rs.usedRewind = true;
        this.stats.rewinds++;
        if (this.flash && this.flash.text === PROMPTS.rewindHint) this.flash = null;
        audio.startLoop('sfx_time_rewind');
      } else if (input.wasPressed('KeyR')) {
        this.showFlash(PROMPTS.noMemory, 'cyan', 1.4);
        audio.play('sfx_no_memory');
      }
    }
    if (rs.rewinding) {
      if (!wantRewind) this.endRewind(rs);
      else {
        const y = rs.relic.history.stepRewind(dt, rs.spec.rewindSpeed ?? 1.4);
        if (y !== null) rs.relic.yaw = y;
        if (Math.random() < 0.6) this.game.effects.timeSpark(rs.relic.flamePoint, 1);
        if (rs.relic.history.atOldest && !rs.oldestWarned) {
          rs.oldestWarned = true;
          audio.play('sfx_collar_stop');
          // if the answer lies in the middle of the memory and was passed, say how to replay it
          if (rs.spec.rewindSolves === false && this.bestCloseness(rs) < 0.5) this.showFlash('THE MEMORY ENDS — [BACKSPACE] TO RELIVE IT', 'cyan', 3);
        }
      }
      return;
    }

    // A/D or arrows: turn (direction latched at key press so it never flips mid-turn)
    const right = input.isDown('KeyD', 'ArrowRight');
    const left = input.isDown('KeyA', 'ArrowLeft');
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    if (dir === 0) { rs.rotSign = 0; rs.rotHeld = 0; rs.atLimit = false; return; }
    if (rs.rotSign === 0 || input.wasPressed('KeyD', 'ArrowRight', 'KeyA', 'ArrowLeft')) {
      const y = rs.relic.yaw;
      const cr = camera.rightVector(this._r);
      rs.rotSign = (-Math.cos(y)) * cr.x + Math.sin(y) * cr.z >= 0 ? 1 : -1;
    }
    rs.rotHeld += dt;
    const speed = (rs.spec.speed ?? 45) * DEG * Math.min(1, 0.35 + rs.rotHeld * 1.3);
    let next = rs.relic.yaw + dir * rs.rotSign * speed * dt;
    if (rs.spec.mode === 'collar') {
      const half = (rs.spec.collar ?? 15) * DEG;
      const lo = rs.anchor - half, hi = rs.anchor + half;
      if (next <= lo || next >= hi) {
        next = Math.max(lo, Math.min(hi, next));
        if (!rs.atLimit) { rs.atLimit = true; audio.play('sfx_collar_stop'); }
      } else rs.atLimit = false;
    }
    rs.relic.yaw = next;
  }

  nearestInteractable(p) {
    let best = null, bd = Infinity;
    const consider = (type, x, z, r, extra) => {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < r * r && d < bd) { bd = d; best = { type, ...extra }; }
    };
    for (const rs of this.relics.values()) {
      if (rs.spec.dormant && !rs.awake) continue;
      if (!rs.lit) consider('relic', rs.relic.base.x, rs.relic.base.z, RADIUS, { rs });
      if (rs.spec.rail && !rs.moving) consider('lever', rs.spec.rail.lever[0], rs.spec.rail.lever[1], 1.9, { rs });
    }
    for (const b of this.braziers) if (b.eternal && b.lit) consider('hearth', b.pos.x, b.pos.z, 2.4, { b });
    for (const r of this.readables) consider('read', r.x, r.z, 2.2, { r });
    return best;
  }

  tryIgnite(rs, player) {
    const sp = rs.spec;
    if (sp.relayOnly) { this.showFlash(PROMPTS.coldRelay, '', 2.2); this.game.audio.play('sfx_no_memory'); return; }
    if (sp.cold) {
      if (!player.flame) { this.showFlash(PROMPTS.cold, '', 2.2); this.game.audio.play('sfx_no_memory'); return; }
      player.flame = null;
    }
    this.ignite(rs);
  }

  takeFlame(player, b) {
    player.flame = { t: this.level.flameSeconds ?? 12, max: this.level.flameSeconds ?? 12 };
    this.game.audio.play('sfx_relic_ignite');
    this.game.effects.burst(b.pos, 30, this.game.effects.c.hot, 2.4, 0.12, 0.9);
    this.showFlash('THE LANTERN CARRIES THE FLAME', 'fire', 1.6);
  }

  ignite(rs) {
    const r = rs.relic;
    if (!r.ignite()) return;
    r.history.pinned = !!rs.spec.echo;
    const a = this.game.audio;
    a.play('sfx_relic_ignite');
    a.startLoop('amb_fire_crackle');
    a.startLoop('near_tone');
    this.game.effects.burst(r.flamePoint, 40, this.game.effects.c.hot, 2.8, 0.14, 1.1);
    this.braziers.forEach((b, i) => { if (!b.lit) this.later(0.45 + i * 0.26, () => { b.lit = true; a.play('whoosh'); }); });
    if (rs.spec.jolt) this.startJolt(rs, rs.spec.jolt, 0.55);
    else rs.anchor = r.yaw;
    if (rs.spec.mode === 'collar') r.setCollar(rs.anchor, (rs.spec.collar ?? 15) * DEG, true);
    this.game.story.onRelicLit(this.level, rs);
  }

  startJolt(rs, segs, delay = 0) {
    rs.jolt = { segs, i: 0, t: 0, delay, from: rs.relic.yaw };
    if (segs.length) this.later(delay, () => this.game.audio.play('sfx_jolt'));
  }

  slideRail(rs) {
    const rl = rs.spec.rail;
    if (rs.lockedOn || rs.rewinding) return;
    rs.slot = (rs.slot + 1) % rl.slots;
    const to = railPoint(rl, rs.slot);
    rs.moving = { from: rs.relic.base.clone(), to, t: 0 };
    this.game.audio.play('sfx_door');
  }

  endRewind(rs) {
    if (!rs.rewinding) return;
    rs.relic.history.endRewind(rs.relic.yaw);
    rs.rewinding = false;
    rs.oldestWarned = false;
    this.game.audio.stopLoop('sfx_time_rewind');
    rs.anchor = rs.relic.yaw;
    if (rs.spec.mode === 'collar') rs.relic.setCollar(rs.anchor, (rs.spec.collar ?? 15) * DEG, true);
  }

  // -------------------------------------------------------------------------------------------
  updateRelic(dt, rs, player) {
    const r = rs.relic;
    // scripted jolt (recorded into memory)
    if (rs.jolt) {
      const j = rs.jolt;
      if (j.delay > 0) j.delay -= dt;
      else {
        const seg = j.segs[j.i];
        if (!seg) {
          rs.jolt = null;
          rs.anchor = r.yaw;
          if (rs.spec.mode === 'collar') {
            r.setCollar(rs.anchor, (rs.spec.collar ?? 15) * DEG, true);
            if (!rs.usedRewind && !this.level.quiet) this.showFlash(PROMPTS.rewindHint, 'cyan', 3);
          }
        } else {
          j.t += dt;
          const f = Math.min(1, j.t / seg.dur);
          const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
          const to = rs.aimYaw + seg.toDeg * DEG;
          r.yaw = j.from + (to - j.from) * e + Math.sin(j.t * 60) * 0.01 * (1 - f);
          this.game.effects.flame(r.flamePoint, 60, dt, 0.3, 1.3);
          if (f >= 1) { r.yaw = to; j.from = to; j.t = 0; j.i++; }
        }
      }
    }
    // rail slide
    if (rs.moving) {
      const m = rs.moving;
      m.t = Math.min(1, m.t + dt / 0.9);
      const e = m.t * m.t * (3 - 2 * m.t);
      r.base.lerpVectors(m.from, m.to, e);
      rs.guide.group.position.set(r.base.x, r.base.y + 0.035, r.base.z);
      if (rs.collider) this.game.world.collision.move(rs.collider, r.base.x, r.base.z);
      if (m.t >= 1) rs.moving = null;
    }
    // memory: record while lit and not rewinding (scripted jolts included)
    if (r.lit && !rs.rewinding && !rs.lockedOn) r.history.record(dt, r.yaw);
    if (r.lit) this.game.effects.flame(r.flamePoint, 30 * this.game.fxScale, dt, 0.16, 1);

    // sockets (final trial): a held alignment fades unless every socket is held together
    if (rs.lockedOn && rs.spec.hold) {
      const ru = this.runes.get(rs.lockedOn);
      if (!this.level.allSocketsDone) {
        rs.holdT += dt;
        if (rs.holdT > rs.spec.hold) {
          this.unlockRelic(rs, ru);
          this.showFlash('A SHADOW FADES — THE MINUTES SLIP', 'cyan', 2.4);
          this.startJolt(rs, rs.spec.slip || [{ toDeg: 50, dur: 0.6 }], 0.2);
        }
      }
    }
  }

  unlockRelic(rs, ru) {
    rs.lockedOn = null;
    rs.holdT = 0;
    if (ru) ru.lit = false;
    rs.relic.history.reset();
    rs.relic.history.pinned = true; // the aligned angle becomes the remembered angle
    rs.relic.history.push(rs.relic.yaw);
  }

  aimYawFor(rs, ru) {
    const b = rs.relic.base;
    return Math.atan2(-(ru.pos.x - b.x), -(ru.pos.z - b.z));
  }

  /** 0..1 closeness of a relic's shadow to a rune (for glow / tone feedback). */
  closeness(rs, ru) {
    const err = Math.abs(angleDiff(rs.relic.yaw, this.aimYawFor(rs, ru)));
    let c = Math.max(0, 1 - err / ((ru.spec.tol ?? 6) * DEG * 5));
    if (ru.spec.lenTol) {
      const d = Math.hypot(ru.pos.x - rs.relic.base.x, ru.pos.z - rs.relic.base.z);
      c *= Math.max(0, 1 - Math.abs(d - rs.len) / 6);
    }
    return c;
  }

  alignmentOf(rs) {
    if (rs.lockedOn) return 1;
    if (!rs.lit) return 0;
    return this.bestCloseness(rs);
  }

  bestCloseness(rs) {
    let best = 0;
    for (const ru of this.runes.values()) if (ru.spec.relics.includes(rs.id)) best = Math.max(best, this.closeness(rs, ru));
    return best;
  }

  /** world position of the relic's shadow tip */
  tip(rs, out) {
    const b = rs.relic.base, y = rs.relic.yaw;
    return out.set(b.x - Math.sin(y) * rs.len, b.y, b.z - Math.cos(y) * rs.len);
  }

  updateRunes(dt, player) {
    for (const ru of this.runes.values()) {
      // timed spans (doc §6.4): count only while the Keeper is off the span and hasn't crossed
      if (ru.timer && ru.timer.running) this.updateSpanTimer(dt, ru, player);
      if (ru.lit) continue;
      for (const id of ru.spec.relics) {
        const rs = this.relics.get(id);
        if (!rs || !rs.lit || rs.lockedOn || rs.moving) continue;
        if (rs.jolt) { this.sweepCheck(rs, ru); continue; }
        if (rs.rewinding && rs.spec.rewindSolves === false) { this.sweepCheck(rs, ru); continue; }
        const err = Math.abs(angleDiff(rs.relic.yaw, this.aimYawFor(rs, ru)));
        let ok = err <= (ru.spec.tol ?? 6) * DEG;
        if (ok && ru.spec.lenTol) {
          const d = Math.hypot(ru.pos.x - rs.relic.base.x, ru.pos.z - rs.relic.base.z);
          ok = Math.abs(d - rs.len) <= ru.spec.lenTol;
        }
        if (ok) { this.satisfy(rs, ru); break; }
        if (rs.spec.sweepFlash) this.sweepCheck(rs, ru);
      }
    }
    // wrong-sign feedback: any shadow tip landing on a rune it may not use
    for (const rs of this.relics.values()) {
      if (!rs.lit || rs.lockedOn || rs.busy) continue;
      const t = this.tip(rs, this._v);
      for (const ru of this.runes.values()) {
        if (ru.spec.relics.includes(rs.id) || ru.lit) continue;
        const d2 = (t.x - ru.pos.x) ** 2 + (t.z - ru.pos.z) ** 2;
        const was = rs.lastSweep.get('x' + ru.spec.id);
        if (d2 < 0.7 && !was) {
          ru.view.reject();
          this.showFlash(PROMPTS.wrongSign, '', 1.8);
          this.game.audio.play('sfx_no_memory');
        }
        rs.lastSweep.set('x' + ru.spec.id, d2 < 0.7);
      }
    }
  }

  /** Blink the rune when a moving shadow passes over it (L5 clue: "watch where it has been"). */
  sweepCheck(rs, ru) {
    if (!rs.spec.sweepFlash) return;
    const err = Math.abs(angleDiff(rs.relic.yaw, this.aimYawFor(rs, ru)));
    const on = err < 4 * DEG;
    if (on && !rs.lastSweep.get(ru.spec.id)) { ru.view.sweep(); this.game.audio.play('tick'); }
    rs.lastSweep.set(ru.spec.id, on);
  }

  satisfy(rs, ru) {
    const a = this.game.audio;
    if (rs.rewinding) this.endRewind(rs);
    rs.relic.yaw = rs.relic.yaw - angleDiff(rs.relic.yaw, this.aimYawFor(rs, ru)); // snap exactly
    rs.lockedOn = ru.spec.id;
    rs.holdT = 0;
    ru.lit = true;
    ru.view.flash();
    a.play('sfx_shadow_align');
    a.setLoopLevel('near_tone', 0.0001);
    this.showFlash(ru.spec.socket ? PROMPTS.holds : PROMPTS.aligned, 'gold', 2.0);
    this.game.effects.burst(this._v.copy(ru.pos).setY(ru.pos.y + 0.3), 50, this.game.effects.c.gold, 3, 0.14, 1.2);
    const fx = ru.spec;
    if (ru.bridge) {
      ru.bridge.appear();
      this.later(0.12, () => a.play('sfx_bridge_form', { count: ru.bridge.slabs.length }));
      if (fx.bridge.duration) ru.timer = { running: false, pending: true, t: fx.bridge.duration, warned: false, last: 0, crossed: false };
    }
    if (fx.relay) this.relay(ru, this.relics.get(fx.relay));
    if (fx.gate) this.later(0.3, () => this.game.world.openGate(fx.gate, true));
    if (fx.socket) this.game.world.onSocket(this);
  }

  relay(ru, target) {
    if (!target || target.lit) return;
    // fire runs along the shadow, then through a channel to the cold relic
    const from = ru.pos.clone().setY(ru.pos.y + 0.2);
    const to = target.relic.flamePoint.clone();
    this.trails.push({ from, to, t: 0, done: () => this.ignite(target) });
    this.game.audio.play('whoosh');
  }

  updateTrails(dt) {
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i];
      tr.t += dt / 1.2;
      const k = Math.min(1, tr.t);
      const p = this._v.lerpVectors(tr.from, tr.to, k);
      p.y += Math.sin(k * Math.PI) * 1.2;
      this.game.effects.flame(p, 140, dt, 0.25, 1.4);
      if (tr.t >= 1) { this.trails.splice(i, 1); tr.done(); }
    }
  }

  updateSpanTimer(dt, ru, player) {
    const tm = ru.timer;
    const br = ru.bridge;
    const w = this.game.world.collision;
    const onBridge = !!w.standingOn(player.pos.x, player.pos.z, player.pos.y, 'bridge') && br.collider.enabled
      && Math.hypot(player.pos.x - br.group.position.x, player.pos.z - br.group.position.z) < br.length / 2 + 1.5;
    // crossed = standing on solid ground beyond the bridge's far end
    const fx = br.end.x - br.start.x, fz = br.end.z - br.start.z;
    const along = ((player.pos.x - br.start.x) * fx + (player.pos.z - br.start.z) * fz) / (br.length * br.length);
    if (!onBridge && player.grounded && along > 1.02 && Math.abs(player.pos.y - br.group.position.y) < 0.5) {
      tm.running = false; tm.crossed = true; br.setWarning(false);
      return;
    }
    tm.paused = onBridge;
    if (onBridge) return;
    tm.t -= dt;
    const c = Math.ceil(tm.t);
    if (c !== tm.last && c > 0) { tm.last = c; this.game.audio.play('tick'); }
    if (tm.t <= 3 && !tm.warned) { tm.warned = true; br.setWarning(true); this.game.audio.play('sfx_bridge_warning'); }
    if (tm.t <= 0) {
      tm.running = false;
      br.fade();
      this.game.audio.play('sfx_bridge_fade');
      const rs = [...this.relics.values()].find((r) => r.lockedOn === ru.spec.id);
      if (rs) {
        this.unlockRelic(rs, ru);
        this.startJolt(rs, rs.spec.slip || [{ toDeg: 60, dur: 0.6 }], 0.35);
      } else ru.lit = false;
      ru.timer = null;
      this.showFlash('THE SPAN FADES — REWIND THE RELIC', 'cyan', 2.6);
    }
  }

  /** Start pending span timers once their bridge is fully formed. */
  tickPendingTimers() {
    for (const ru of this.runes.values()) {
      const tm = ru.timer;
      if (tm && tm.pending && ru.bridge.state === BRIDGE.ACTIVE) { tm.pending = false; tm.running = true; tm.last = Math.ceil(tm.t); }
    }
  }

  /** The timer to show on the HUD (first running span). */
  get hudTimer() {
    for (const ru of this.runes.values()) if (ru.timer && ru.timer.running) return { t: ru.timer.t, max: ru.spec.bridge.duration, paused: ru.timer.paused };
    return null;
  }

  // -------------------------------------------------------------------------------------------
  /** Put the puzzle in its solved state instantly (loading a save). */
  applyCompleted() {
    this.completed = true;
    if (this.ember) { this.ember.collected = true; this.ember.group.visible = false; }
    for (const ru of this.runes.values()) {
      if (ru.spec.socket || (ru.spec.bridge && ru.spec.bridge.duration)) continue;
      const rs = this.relics.get(ru.spec.relics[0]);
      if (!rs) continue;
      if (!rs.relic.lit) { rs.relic.lit = true; rs.relic.history.reset(); }
      if (rs.spec.rail && rs.spec.rail.solve !== undefined) {
        rs.slot = rs.spec.rail.solve;
        rs.relic.base.copy(railPoint(rs.spec.rail, rs.slot));
        rs.guide.group.position.set(rs.relic.base.x, rs.relic.base.y + 0.035, rs.relic.base.z);
        if (rs.collider) this.game.world.collision.move(rs.collider, rs.relic.base.x, rs.relic.base.z);
      }
      rs.relic.yaw = this.aimYawFor(rs, ru);
      rs.lockedOn = ru.spec.id;
      ru.lit = true;
      if (ru.bridge) { ru.bridge.appear(); }
    }
    for (const b of this.braziers) { b.lit = true; b.level = 1; }
  }

  /** Reset everything this puzzle owns (Backspace). Gates already opened stay open. */
  reset() {
    this.flash = null;
    this.scheduled.length = 0;
    this.trails.length = 0;
    for (const rs of this.relics.values()) {
      if (rs.rewinding) this.endRewind(rs);
      const r = rs.relic;
      rs.jolt = null; rs.lockedOn = null; rs.holdT = 0; rs.moving = null; rs.usedRewind = false;
      if (rs.spec.rail) {
        rs.slot = rs.spec.rail.start ?? 0;
        r.base.copy(railPoint(rs.spec.rail, rs.slot));
        rs.guide.group.position.set(r.base.x, r.base.y + 0.035, r.base.z);
        if (rs.collider) this.game.world.collision.move(rs.collider, r.base.x, r.base.z);
      }
      r.reset();
      rs.anchor = r.yaw;
    }
    for (const ru of this.runes.values()) {
      ru.lit = false;
      ru.timer = null;
      if (ru.bridge) ru.bridge.hideImmediate();
    }
    this.game.audio.stopLoop('sfx_time_rewind');
  }

  dispose() {
    this.game.audio.stopLoop('sfx_time_rewind');
  }
}

export function railPoint(rl, i) {
  const t = rl.slots === 1 ? 0 : i / (rl.slots - 1);
  return new THREE.Vector3(rl.from[0] + (rl.to[0] - rl.from[0]) * t, rl.y ?? 0, rl.from[1] + (rl.to[1] - rl.from[1]) * t);
}
