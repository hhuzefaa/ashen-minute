import * as THREE from 'three';
import { SCENES, COMPLETE_LINES, ENTER_LINES, READINGS, SECRETS, SPEAKERS, LOST_MINUTES, OPENING_BARKS } from './script.js';

// Story director: decides when scenes and barks play, runs in-engine cutscenes, and records
// which beats have been seen (persisted with the save). Cutscenes are skippable (Esc) and always
// restore input + camera control when they end.
export class Story {
  constructor(game) {
    this.game = game;
    this.scene = null;    // running cutscene
    this.barkQueue = [];
    this.bark = null;
  }

  get progress() { return this.game.world.progress; }
  seen(id) { return this.progress.data.story.includes(id); }

  // ---------------------------------------------------------------- triggers
  trigger(id) {
    if (this.seen(id)) return;
    this.progress.mark('story', id);
    if (SCENES[id]) this.play(id);
    else if (id === 'sockets_done') this.say('ILEN', 'Three shadows. One heart. Hold.');
  }

  /** The cold open's remaining lines, as barks once the Keeper walks. */
  openingBarks() {
    OPENING_BARKS.forEach((l, i) => this.game.delay(3 + i * 7, () => this.say(l[0], l[1], 5.5)));
  }

  /** First time the Keeper's own lantern visibly swings a stone's shadow in a room. */
  onFirstShadow(L) { /* room barks are data-driven (levels.js `barks.firstShadow`) */ }

  onLevelComplete(L) {
    if (L.onComplete.story) { this.game.delay(1.2, () => this.trigger(L.onComplete.story)); return; }
    const c = COMPLETE_LINES[L.id];
    if (c) this.say(c[0], c[1], 5);
  }

  onEnterLevel(L) {
    const k = 'enter_' + L.id;
    if (ENTER_LINES[L.id] && !this.seen(k)) { this.progress.mark('story', k); this.say(...ENTER_LINES[L.id], 5); }
  }

  /** A Lost Minute: a two-line memory in the reading panel. */
  lostMinute(id) {
    const text = LOST_MINUTES[id];
    if (!text) return;
    this.game.ui.showReading(text, `Lost Minutes ${this.progress.data.lostMinutes.length}/6`);
  }

  reading(id) {
    const text = READINGS[id];
    if (!text) return;
    const isSecret = SECRETS.includes(id);
    const fresh = isSecret && this.progress.mark('secrets', id);
    this.game.ui.showReading(text, isSecret ? `${fresh ? 'Discovered' : 'Discovered'} ${this.progress.data.secrets.length}/3` : '');
    if (fresh) this.game.audio.play('sfx_ember_collect');
  }

  // ---------------------------------------------------------------- barks (non-blocking)
  say(speaker, text, dur = 4.5) {
    this.barkQueue.push({ speaker, text, dur });
  }

  // ---------------------------------------------------------------- cutscenes
  play(id) {
    const steps = SCENES[id];
    if (!steps) return;
    this.scene = { id, steps, i: -1, t: 0, step: null, waitingInput: false };
    this.game.enterCutscene();
    this.next();
  }

  next() {
    const s = this.scene;
    if (!s) return;
    s.i++;
    s.t = 0;
    const step = s.steps[s.i];
    s.step = step;
    if (!step) { this.end(); return; }
    const ui = this.game.ui;
    const cam = this.game.cameraCtl;
    if (step.cam) {
      const [px, py, pz, lx, ly, lz] = step.cam;
      const o = { pos: new THREE.Vector3(px, py, pz), look: new THREE.Vector3(lx, ly, lz), speed: step.speed ?? 1.2 };
      if (!cam.override || step.speed >= 99) { cam.override = o; cam.first = true; } else cam.override = o;
      this.next();
      return;
    }
    if (step.fade !== undefined) {
      ui.fadeTo(step.fade, step.instant ? 0.01 : step.dur ?? 1, step.color);
      if (step.instant) { this.next(); return; }
      s.waitFor = step.dur ?? 1;
      return;
    }
    if (step.card) { ui.card(step.card[0], step.card[1], step.dur - 0.6, step.card[0] === ''); s.waitFor = step.dur; return; }
    if (step.say) {
      const [sp, text] = step.say;
      ui.dialogue(SPEAKERS[sp] || sp, text, sp);
      s.waitingInput = true;
      s.autoAfter = 2.2 + text.length * 0.055;
      this.game.audio.play('sfx_ui_click');
      return;
    }
    if (step.do) { this.game.sceneAction(step.do); s.waitFor = step.wait ?? 0; if (!s.waitFor) this.next(); return; }
    if (step.wait) { s.waitFor = step.wait; return; }
    this.next();
  }

  /** Esc: run the remaining state-changing actions instantly, then end. */
  skip() {
    const s = this.scene;
    if (!s) return;
    for (let i = s.i + 1; i < s.steps.length; i++) {
      const st = s.steps[i];
      if (st.do && st.do !== 'embersConverge' && st.do !== 'ashRises') this.game.sceneAction(st.do, true);
    }
    if (s.step && s.step.do === 'victory') return;
    this.end();
  }

  end() {
    const id = this.scene?.id;
    this.scene = null;
    this.game.ui.hideDialogue();
    this.game.ui.hideCard();
    this.game.ui.fadeTo(0, 0.6);
    if (id !== 'finale') this.game.exitCutscene();
  }

  update(dt, input) {
    // barks
    if (this.bark) {
      this.bark.t -= dt;
      if (this.bark.t <= 0) { this.bark = null; this.game.ui.hideSubtitle(); }
    }
    if (!this.bark && this.barkQueue.length && !this.scene) {
      this.bark = this.barkQueue.shift();
      this.bark.t = this.bark.dur;
      this.game.ui.subtitle(SPEAKERS[this.bark.speaker] || this.bark.speaker, this.bark.text, this.bark.speaker);
    }
    const s = this.scene;
    if (!s) return;
    s.t += dt;
    if (input.wasPressed('Escape')) { this.skip(); return; }
    if (s.waitingInput) {
      const adv = input.wasPressed('Space', 'Enter', 'KeyE') || input.clicked;
      if (adv && s.t > 0.25) {
        if (this.game.ui.typing) this.game.ui.finishTyping();
        else { s.waitingInput = false; this.game.ui.hideDialogue(); this.next(); }
      } else if (s.t > s.autoAfter + 4) { s.waitingInput = false; this.next(); }
      return;
    }
    if (s.waitFor !== undefined) {
      if (s.t >= s.waitFor) { s.waitFor = undefined; this.next(); }
    }
  }
}
