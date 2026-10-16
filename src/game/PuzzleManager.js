import * as THREE from 'three';
import { angleDiff, DEG } from './Palette.js';
import { BRIDGE } from '../objects/ShadowBridge.js';

// One authoritative state per room (doc §5.2).
export const ROOM = {
  INTRO: 'INTRO',
  UNLIT: 'UNLIT',
  IGNITING: 'IGNITING',           // flare + scripted jolt (part of LIT; controls locked)
  ALIGNING: 'ALIGNING',           // LIT/ALIGNING: rotate, rewind, alignment checked continuously
  BRIDGE_APPEARING: 'BRIDGE_APPEARING',
  BRIDGE_ACTIVE: 'BRIDGE_ACTIVE',
  EXIT_REACHED: 'EXIT_REACHED',
  COMPLETE: 'COMPLETE',
};

const INTERACT_RADIUS = 2.4;
const FLARE_TIME = 0.55;

// Exact prompt copy from the design bible §7.2
export const PROMPTS = {
  ignite: '[E] IGNITE RELIC',
  turn: 'TURN THE RELIC TO ALIGN ITS SHADOW',
  rewindHint: 'HOLD [R] TO REWIND THE RELIC',
  near: 'THE SHADOW IS NEAR',
  aligned: 'THE SHADOW REMEMBERS',
  room3: 'ALIGN THE SHADOW. CROSS BEFORE THE SPAN FADES.',
  noMemory: 'NO RECENT MEMORY',
};

export class PuzzleManager {
  constructor(game, level, objs) {
    this.game = game;
    this.level = level;
    this.relic = objs.relic;
    this.guide = objs.guide;
    this.target = objs.target;
    this.bridge = objs.bridge;
    this.ember = objs.ember;
    this.braziers = objs.braziers;
    this.echoTablet = objs.echoTablet;
    this.targetYaw = objs.targetYaw;
    this.tolerance = level.toleranceDeg * DEG;
    this.state = ROOM.INTRO;
    this.stateTime = 0;
    this.jolt = null;
    this.anchor = this.relic.yaw;
    this.rotSign = 0;
    this.rotHeld = 0;
    this.atLimit = false;
    this.rewinding = false;
    this.usedRewind = false;
    this.timer = 0;
    this.timerRunning = false;
    this.warned = false;
    this.lastTick = 0;
    this.crossed = false;
    this.flash = null; // { text, cls, t }
    this.alignment = 0;
    this.nearRelic = false;
    this.focus = false;
    this.stats = { rewinds: 0 };
    this.scheduled = []; // game-time callbacks (pause-safe, die with the room)
  }

  later(delay, fn) { this.scheduled.push({ t: delay, fn }); }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  showFlash(text, cls = '', dur = 1.8) { this.flash = { text, cls, t: dur }; }

  get lit() { return this.relic.lit; }
  get solved() { return this.state === ROOM.BRIDGE_APPEARING || this.state === ROOM.BRIDGE_ACTIVE || this.state === ROOM.EXIT_REACHED || this.state === ROOM.COMPLETE; }

  // ---------------------------------------------------------------------------------------
  update(dt, input, player, camera) {
    const audio = this.game.audio;
    this.stateTime += dt;
    if (this.flash) { this.flash.t -= dt; if (this.flash.t <= 0) this.flash = null; }
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      const s = this.scheduled[i];
      s.t -= dt;
      if (s.t <= 0) { this.scheduled.splice(i, 1); s.fn(); }
    }

    const rp = this.relic.base;
    const dx = player.pos.x - rp.x, dz = player.pos.z - rp.z;
    this.nearRelic = dx * dx + dz * dz < INTERACT_RADIUS * INTERACT_RADIUS && Math.abs(player.pos.y) < 1;
    this.focus = input.isDown('KeyQ');

    switch (this.state) {
      case ROOM.INTRO:
        if (this.stateTime > 0.3) this.setState(ROOM.UNLIT);
        break;

      case ROOM.UNLIT:
        if (this.nearRelic && input.wasPressed('KeyE')) this.ignite();
        break;

      case ROOM.IGNITING:
        this.updateJolt(dt);
        break;

      case ROOM.ALIGNING:
        if (this.jolt) { this.updateJolt(dt); break; }
        this.updateControls(dt, input, camera);
        this.checkAlignment();
        break;

      case ROOM.BRIDGE_APPEARING:
        if (this.bridge.state === BRIDGE.ACTIVE) {
          this.setState(ROOM.BRIDGE_ACTIVE);
          if (this.level.bridgeDuration) {
            this.timer = this.level.bridgeDuration;
            this.timerRunning = true;
            this.warned = false;
            this.lastTick = Math.ceil(this.timer);
          }
        }
        break;

      case ROOM.BRIDGE_ACTIVE:
        this.updateTimer(dt, player);
        break;

      default: break;
    }

    // ember / exit trigger (awarded once: state guard)
    if (this.state !== ROOM.EXIT_REACHED && this.state !== ROOM.COMPLETE && this.ember.touches(player.pos)) {
      this.setState(ROOM.EXIT_REACHED);
      this.ember.collected = true;
      this.timerRunning = false;
      this.bridge.setWarning(false);
      this.game.levels.onEmberReached(this);
    }

    // relic history: record while lit and not rewinding (includes scripted jolts)
    if (this.relic.lit && !this.rewinding && (this.state === ROOM.IGNITING || this.state === ROOM.ALIGNING)) {
      this.relic.history.record(dt, this.relic.yaw);
    }

    // alignment value for feedback
    const err = Math.abs(angleDiff(this.relic.yaw, this.targetYaw));
    this.alignment = this.relic.lit ? Math.max(0, 1 - err / (this.tolerance * 5)) : 0;
    if (this.solved) this.alignment = 1;

    // near-alignment tone
    const nearTone = this.state === ROOM.ALIGNING && err < this.tolerance * 3 ? (1 - err / (this.tolerance * 3)) * 0.05 : 0.0001;
    audio.setLoopLevel('near_tone', nearTone);

    // braziers catch fire after the relic
    for (const b of this.braziers) {
      if (b.lit) b.level = Math.min(1, b.level + dt * 1.5);
    }

    // visuals
    this.relic.ghost.visible = this.rewinding;
    if (this.rewinding) {
      const gy = this.relic.history.peekBack(10);
      if (gy !== null) this.relic.ghostPivot.rotation.y = gy;
    }
    this.guide.trailOn = this.rewinding;
    if (this.rewinding || this.focus) this.guide.updateTrail(this.relic.history.samples);
    this.guide.echoOn = this.level.mode === 'collar' && this.state === ROOM.ALIGNING;
    this.relic.collarVisible = this.level.mode === 'collar' && this.state === ROOM.ALIGNING && !this.jolt;
    this.bridge.outlineOn = this.relic.lit && !this.solved;
    this.relic.update(dt);
    this.relic.applyYaw();
    this.guide.update(dt, { lit: this.relic.lit, yaw: this.relic.yaw, alignment: this.alignment, solved: this.solved, focus: this.focus, rewinding: this.rewinding });
    this.target.update(dt, { lit: this.relic.lit, alignment: this.alignment, solved: this.solved });
    this.bridge.update(dt);
    this.ember.update(dt);
  }

  ignite() {
    if (!this.relic.ignite()) return;
    this.relic.history.pinned = this.level.mode === 'collar';
    const audio = this.game.audio;
    audio.play('sfx_relic_ignite');
    audio.startLoop('amb_fire_crackle');
    audio.startLoop('near_tone');
    this.game.effects.burst(this.relic.flamePoint, 40, this.game.effects.c.hot, 2.8, 0.14, 1.1);
    this.braziers.forEach((b, i) => this.later(0.45 + i * 0.26, () => { b.lit = true; this.game.audio.play('whoosh'); }));
    this.setState(ROOM.IGNITING);
    if (this.level.jolt) {
      this.startJolt(this.level.jolt, FLARE_TIME);
    } else {
      this.jolt = { segs: [], i: 0, t: 0, delay: FLARE_TIME, from: this.relic.yaw };
    }
  }

  startJolt(segs, delay = 0) {
    this.jolt = { segs, i: 0, t: 0, delay, from: this.relic.yaw };
    if (segs.length) this.later(delay, () => this.game.audio.play('sfx_jolt'));
  }

  updateJolt(dt) {
    const j = this.jolt;
    if (!j) return;
    if (j.delay > 0) { j.delay -= dt; return; }
    const seg = j.segs[j.i];
    if (!seg) {
      this.jolt = null;
      this.anchor = this.relic.yaw;
      if (this.state === ROOM.IGNITING) this.setState(ROOM.ALIGNING);
      if (this.level.mode === 'collar') {
        this.relic.setCollar(this.anchor, this.level.collarHalfDeg * DEG, true);
        if (!this.usedRewind) this.showFlash(PROMPTS.rewindHint, 'cyan', 3.2);
      }
      return;
    }
    j.t += dt;
    const f = Math.min(1, j.t / seg.dur);
    const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
    const to = this.targetYaw + seg.toDeg * DEG;
    this.relic.yaw = j.from + (to - j.from) * e;
    // shudder
    this.relic.yaw += Math.sin(j.t * 60) * 0.01 * (1 - f);
    this.game.effects.flame(this.relic.flamePoint, 80, dt, 0.3, 1.4);
    if (f >= 1) {
      this.relic.yaw = to;
      j.from = to;
      j.t = 0;
      j.i++;
    }
  }

  updateControls(dt, input, camera) {
    const audio = this.game.audio;
    const canUse = this.nearRelic;

    // --- rewind (hold R) ---
    const wantRewind = canUse && input.isDown('KeyR');
    if (wantRewind && !this.rewinding) {
      if (this.relic.history.beginRewind(this.relic.yaw)) {
        this.rewinding = true;
        this.usedRewind = true;
        this.stats.rewinds++;
        audio.startLoop('sfx_time_rewind');
      } else if (input.wasPressed('KeyR')) {
        this.showFlash(PROMPTS.noMemory, 'cyan', 1.4);
        audio.play('sfx_no_memory');
      }
    }
    if (this.rewinding) {
      if (!wantRewind) {
        this.endRewind();
      } else {
        const y = this.relic.history.stepRewind(dt, 1.6);
        if (y !== null) this.relic.yaw = y;
        if (Math.random() < 0.6) this.game.effects.timeSpark(this.relic.flamePoint, 1);
        if (this.relic.history.atOldest && !this._oldestWarned) {
          this._oldestWarned = true;
          audio.play('sfx_collar_stop');
        }
      }
      return; // never rotate and rewind in the same frame
    }

    // --- rotate (A/D or arrows), camera-relative direction latched at key press ---
    if (!canUse) { this.rotSign = 0; this.rotHeld = 0; return; }
    const right = input.isDown('KeyD', 'ArrowRight');
    const left = input.isDown('KeyA', 'ArrowLeft');
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    if (dir === 0) { this.rotSign = 0; this.rotHeld = 0; this.atLimit = false; return; }
    if (this.rotSign === 0 || input.wasPressed('KeyD', 'ArrowRight', 'KeyA', 'ArrowLeft')) {
      // which yaw direction moves the shadow's endpoint toward screen-right?
      const y = this.relic.yaw;
      const dEnd = new THREE.Vector3(-Math.cos(y), 0, Math.sin(y)); // d(forward)/d(yaw)
      this.rotSign = dEnd.dot(camera.rightVector()) >= 0 ? 1 : -1;
    }
    this.rotHeld += dt;
    const speed = this.level.rotateSpeedDeg * DEG * Math.min(1, 0.35 + this.rotHeld * 1.3); // gentle ramp for precision
    let next = this.relic.yaw + dir * this.rotSign * speed * dt;
    if (this.level.mode === 'collar') {
      const half = this.level.collarHalfDeg * DEG;
      const lo = this.anchor - half, hi = this.anchor + half;
      if (next <= lo || next >= hi) {
        next = Math.max(lo, Math.min(hi, next));
        if (!this.atLimit) { this.atLimit = true; audio.play('sfx_collar_stop'); }
      } else this.atLimit = false;
    }
    this.relic.yaw = next;
  }

  endRewind() {
    if (!this.rewinding) return;
    this.relic.history.endRewind(this.relic.yaw);
    this.rewinding = false;
    this._oldestWarned = false;
    this.game.audio.stopLoop('sfx_time_rewind');
    this.anchor = this.relic.yaw; // the collar re-seats where time left the relic
    if (this.level.mode === 'collar') this.relic.setCollar(this.anchor, this.level.collarHalfDeg * DEG, true);
  }

  checkAlignment() {
    const err = Math.abs(angleDiff(this.relic.yaw, this.targetYaw));
    if (err > this.tolerance) return;
    // aligned → lock the relic exactly on target and raise the bridge
    if (this.rewinding) this.endRewind();
    this.relic.yaw = this.relic.yaw - angleDiff(this.relic.yaw, this.targetYaw);
    this.setState(ROOM.BRIDGE_APPEARING);
    this.bridge.appear();
    this.target.flash();
    const a = this.game.audio;
    a.play('sfx_shadow_align');
    this.later(0.12, () => a.play('sfx_bridge_form', { count: this.bridge.slabs.length }));
    a.setLoopLevel('near_tone', 0.0001);
    this.showFlash(PROMPTS.aligned, 'gold', 2.2);
    this.game.effects.burst(this.target.group.position.clone().setY(0.3), 50, this.game.effects.c.gold, 3, 0.14, 1.2);
  }

  updateTimer(dt, player) {
    if (!this.timerRunning) return;
    const onBridge = !!this.game.world.standingOn(player.pos.x, player.pos.z, player.pos.y, 'bridge');
    if (!this.crossed && player.pos.z < this.level.crossZ && player.grounded && !onBridge) {
      this.crossed = true;
      this.timerRunning = false;
      this.bridge.setWarning(false);
      return;
    }
    this.timerPaused = onBridge; // timer pauses while the Keeper stands on the span
    if (onBridge) return;
    this.timer -= dt;
    const c = Math.ceil(this.timer);
    if (c !== this.lastTick && c > 0) { this.lastTick = c; this.game.audio.play('tick'); }
    if (this.timer <= 3 && !this.warned) {
      this.warned = true;
      this.bridge.setWarning(true);
      this.game.audio.play('sfx_bridge_warning');
    }
    if (this.timer <= 0) {
      // span fades (never under the player — we only get here when not on it); relic slips
      this.timerRunning = false;
      this.bridge.fade();
      this.game.audio.play('sfx_bridge_fade');
      this.relic.history.reset();
      this.relic.history.push(this.relic.yaw);
      this.setState(ROOM.ALIGNING);
      this.startJolt(this.level.slip || [{ toDeg: 60, dur: 0.6 }], 0.35);
      this.showFlash('THE SPAN FADES — REWIND THE RELIC', 'cyan', 2.6);
    }
  }

  /** Text for the HUD prompt this frame. */
  prompt() {
    if (this.flash) return { text: this.flash.text, cls: this.flash.cls };
    switch (this.state) {
      case ROOM.UNLIT:
        return this.nearRelic ? { text: PROMPTS.ignite, cls: 'fire' } : null;
      case ROOM.ALIGNING: {
        if (this.jolt) return null;
        if (!this.nearRelic) return null;
        if (this.rewinding) return { text: '◀◀', cls: 'cyan' };
        const err = Math.abs(angleDiff(this.relic.yaw, this.targetYaw));
        if (err < this.tolerance * 2.5) return { text: PROMPTS.near, cls: 'gold' };
        if (this.level.mode === 'collar' && !this.usedRewind) return { text: PROMPTS.rewindHint, cls: 'cyan' };
        return { text: PROMPTS.turn, cls: '' };
      }
      default: return null;
    }
  }

  subprompt() {
    if (this.state === ROOM.ALIGNING && this.nearRelic && !this.jolt) {
      return this.level.mode === 'collar' ? '[A] [D] NUDGE   ·   HOLD [R] REWIND   ·   HOLD [Q] FOCUS' : '[A] [D] TURN   ·   HOLD [Q] FOCUS';
    }
    if (this.state === ROOM.ALIGNING && !this.nearRelic && !this.jolt) return 'RETURN TO THE RELIC';
    return '';
  }

  objective() {
    switch (this.state) {
      case ROOM.INTRO:
      case ROOM.UNLIT: return this.level.objective;
      case ROOM.IGNITING:
      case ROOM.ALIGNING:
        if (this.level.id === 3) return PROMPTS.room3;
        return this.level.mode === 'collar' ? 'Rewind the relic to its remembered angle, then align its shadow.' : 'Turn the relic until its shadow meets the golden rune.';
      case ROOM.BRIDGE_APPEARING:
      case ROOM.BRIDGE_ACTIVE: return this.level.id === 3 ? (this.crossed ? 'Restore the Heart Ember.' : PROMPTS.room3) : 'Cross the shadow bridge. Claim the ember.';
      default: return '';
    }
  }

  dispose() {
    this.game.audio.stopLoop('sfx_time_rewind');
    this.game.audio.stopLoop('amb_fire_crackle');
    this.game.audio.stopLoop('near_tone');
  }
}
