import { angleDiff } from './Palette.js';
import { TUTORIAL_LEVELS, TUTORIAL_GATES, SECTION_GATES, COLUMN_Z, ECHO_SPOT, FINISH, FINISH_R } from '../world/tutorial.js';

// The optional tutorial (New Game → Play Tutorial): a step director over the training court.
// It teaches the game's real controls and rules one at a time; each step stays up until the player
// has actually done the thing (detected from the game's own state), then turns gold with a chime.
// The court's rooms are ordinary LightPuzzles, so movement, shadows, runes, sconces, levers and the
// echo are exactly the story's systems. Nothing here touches the save, the story or the play clock.

const DONE_HOLD = 1.15;     // s the gold "done" line shows before the next step
const k = (key) => `<kbd>${key}</kbd>`;

/** One step: section (room id) · text (HTML) · note (optional) · done(t) · info steps auto-advance after `read` s. */
const STEPS = [
  // ---- A · The Novice Court
  { s: 101, text: `Move the mouse to look around.`, note: `Click the game first to capture the mouse. ${k('Esc')} pauses: you can leave or skip the training from there.`,
    done: (t) => t.look > 1.2, ok: 'You can look around.' },
  { s: 101, text: `Walk with ${k('W')} ${k('A')} ${k('S')} ${k('D')}. You move the way the camera faces.`,
    done: (t) => t.walked > 4, ok: 'Walking.' },
  { s: 101, text: `Hold ${k('Shift')} while walking to run.`,
    done: (t) => t.sprintT > 0.8, ok: 'Running.' },
  { s: 101, text: `A fallen column blocks the corridor. Press ${k('Space')} to hop over it.`, note: 'A hop is small: it clears a low obstacle, never a gap.',
    done: (t) => t.player.pos.z < COLUMN_Z - 0.75 && t.player.grounded, ok: 'Over the column.' },
  // ---- B · Fire and Shadow
  { s: 102, text: 'Your lantern is a fire. Every stone’s shadow falls away from it. Walk around the stone and watch.',
    done: (t) => t.swing > 1.2 || t.rune(102, 'r1').lit, ok: 'Where you stand decides where the shadow falls.' },
  { s: 102, text: 'Lay the stone’s shadow across the gold rune and hold it there.', note: 'Step back from the stone and its shadow grows longer.',
    done: (t) => t.rune(102, 'r1').lit, ok: 'The rune wakes. The gate opens.' },
  { s: 102, text: `Stand beside the sconce and press ${k('E')} to kindle it.`,
    done: (t) => t.sconce(102, 'k1').lit || t.crossedB, ok: 'A sconce is a fire too.' },
  { s: 102, text: 'A shadow lying over the abyss is solid ground while it lasts. Cross the gap on the stone’s shadow.',
    note: `The sconce burns for 20 seconds; press ${k('E')} beside it again to feed it. Falling is safe: you return to solid ground.`,
    done: (t) => t.crossedB, ok: 'Across.' },
  // ---- C · Echo of Yourself (the echo is usable from here on)
  { s: 103, text: `Press ${k('R')} to mark a minute. The ring on the floor shows where it began.`,
    done: (t) => t.game.echoes.recording || t.game.echoes.echoes.length > 0, ok: 'The minute is being marked.' },
  { s: 103, text: `Walk a few steps, then press ${k('R')} again. Your echo will walk that minute again.`, note: 'A minute lasts at most 8 seconds.',
    done: (t) => t.game.echoes.echoes.length > 0, ok: 'Your echo walks your path.' },
  { s: 103, text: 'Your echo carries its own lantern: another fire. When its walk ends it holds the light up, then crumbles to ash.',
    note: 'The ring at the top right counts the 12 seconds it holds.',
    done: (t) => t.game.echoes.echoes.some((e) => e.state === 'hold'), ok: 'It holds the light where you left it.' },
  { s: 103, text: `One echo at a time: marking a new minute dismisses the old one.`, note: `Stuck anywhere? ${k('Backspace')} resets the part of the court you are in.`,
    read: 6, enter: (t) => t.game.world.openGate('g_t2', true), ok: 'The gate opens.' },
  { s: 103, text: 'You can never walk your own shadow: to step onto it you must pass the stone, and then the light is behind you.',
    done: (t) => t.player.pos.z < -71.2, ok: '' },
  { s: 103, text: `Stand in the ring behind the stone. Press ${k('R')}, wait a moment, press ${k('R')} again.`, note: 'Leave yourself there, holding the light.',
    done: (t) => t.echoBridge(), ok: 'Your echo holds the light behind the stone.' },
  { s: 103, text: 'Cross on the shadow before your echo crumbles.',
    undo: (t) => !t.echoBridge() && !t.crossedC, undoNote: `Your echo is gone. Leave another minute in the ring (${k('R')}).`,
    done: (t) => t.crossedC, ok: 'You crossed on light you left behind.' },
  // ---- D · The Last Lessons
  { s: 104, text: `Hold ${k('Q')} to focus: you see every shadow’s edge, and where each unlit sconce would cast.`,
    done: (t) => t.focusT > 0.8, ok: 'Focus shows what a fire would do before you light it.' },
  { s: 104, text: `Kindle the sconce whose shadow would wake the rune (${k('E')}).`,
    wrong: (t) => t.sconce(104, 'ke').lit && !t.rune(104, 'r5').lit, wrongNote: `Not that one: its shadow points away from the rune. Hold ${k('Q')} and look again.`,
    done: (t) => t.rune(104, 'r5').lit, ok: 'The rune wakes. The gate opens.' },
  { s: 104, text: `Kindle the sconce, then press ${k('E')} at the lever to slide the stone along its rail.`,
    done: (t) => t.railMoved || t.rune(104, 'r6').lit, ok: 'The stone slides; its shadow moves with it.' },
  { s: 104, text: 'Slide the stone until its shadow wakes the rune.',
    done: (t) => t.rune(104, 'r6').lit, ok: 'The last gate opens.' },
  { s: 104, text: 'Walk into the light beneath the arch to finish your training.',
    done: (t) => Math.hypot(t.player.pos.x - FINISH[0], t.player.pos.z - FINISH[1]) < FINISH_R && t.player.grounded, ok: 'Training complete.' },
];

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.el = document.getElementById('tutorial-hint');
    this.elStep = this.el.querySelector('.th-step');
    this.elText = this.el.querySelector('.th-text');
    this.elNote = this.el.querySelector('.th-note');
    this.steps = STEPS;
    this.levels = new Map(TUTORIAL_LEVELS.map((L) => [L.id, L]));
  }

  get player() { return this.game.player; }
  get allowsEcho() { return this.active && this.sectionReached >= 103; }
  get checkpoint() {
    const [x, z, yaw] = this.levels.get(this.section).spawn;
    return { x, z, yaw };
  }

  get objective() { return this.levels.get(this.section)?.objective || ''; }

  puzzle(id) { return this.game.world.levelById.get(id); }
  rune(id, r) { return this.puzzle(id).runes.get(r); }
  sconce(id, b) { return this.puzzle(id).sconces.find((x) => x.id === b); }
  get crossedB() { const p = this.player.pos; return p.z < -56.6 && p.y > -0.5 && this.player.grounded; }
  get crossedC() { const p = this.player.pos; return p.z < -84.1 && p.y > -0.5 && this.player.grounded; }

  /** An echo holds stone T4's shadow across the gap (long enough to reach the far platform). */
  echoBridge() {
    const st = this.puzzle(103).stoneById.get('T4');
    for (const s of st.shadows.values()) if (s.kind === 'echo' && s.alive && s.strength > 0.5 && s.len > 4.6 && s.uz < -0.8) return true;
    return false;
  }

  // ------------------------------------------------------------------ lifecycle
  /** A fresh run of the court: every room, gate, sconce and rail as built; step one. */
  begin() {
    const w = this.game.world;
    for (const id of this.levels.keys()) { const p = this.puzzle(id); p.reset(); p.completed = false; p.events = {}; }
    for (const g of TUTORIAL_GATES) w.gates.get(g.id).setOpenInstant(false);
    this.active = true;
    this.section = 101;
    this.sectionReached = 101;
    this.i = 0;
    this.doneT = 0;
    this.stepT = 0;
    this.noteOverride = null;
    this.noteT = 0;
    this.resetCounters();
    this.lastYaw = this.game.cameraCtl.yaw;
    this.lastPitch = this.game.cameraCtl.pitch;
    this.el.classList.remove('hidden');
    this.game.ui.el.hud.classList.add('tutorial');
    this.enterStep();
  }

  end() {
    if (!this.active) return;
    this.active = false;
    this.el.classList.add('hidden');
    this.game.ui.el.hud.classList.remove('tutorial');
    this.game.echoes.clear();
  }

  resetCounters() {
    this.look = 0; this.walked = 0; this.sprintT = 0; this.swing = 0; this.focusT = 0;
    this.railMoved = false; this.swingYaw = null;
  }

  // ------------------------------------------------------------------ hooks from the game
  onEnterSection(p) {
    this.section = p.level.id;
    if (this.section > this.sectionReached) this.sectionReached = this.section;
  }

  /** Backspace (or Restart Section): the room as built, its gates closed, its first step again. */
  onSectionRestart(p) {
    const id = p.level.id;
    for (const g of SECTION_GATES[id] || []) this.game.world.gates.get(g).setOpenInstant(false);
    const first = this.steps.findIndex((st) => st.s === id);
    if (first >= 0 && first <= this.i) { this.i = first; this.resetCounters(); this.enterStep(); }
  }

  onFall() {
    if (this.game.echoes.echoes.length) return; // (the step text already says what to do)
    this.say('You fell. The temple puts you back on solid ground: try again.', 3.5);
  }

  /** A short secondary line (feedback) that replaces the step's note for a while. */
  say(text, seconds = 3) { this.noteOverride = text; this.noteT = seconds; this.render(); }

  // ------------------------------------------------------------------ steps
  enterStep() {
    const st = this.steps[this.i];
    this.doneT = 0;
    this.stepT = 0;
    if (!st) return;
    st.enter?.(this);
    this.render();
  }

  render() {
    const st = this.steps[this.i];
    if (!st) return;
    const done = this.doneT > 0;
    this.el.classList.toggle('done', done && !!st.ok);
    const wrong = !done && st.wrong?.(this);
    const step = `Training ${Math.min(this.i + 1, this.steps.length)} / ${this.steps.length}`;
    const text = done && st.ok ? `✓ ${st.ok}` : st.text;
    const note = done ? '' : this.noteOverride || (wrong ? st.wrongNote : st.note || '');
    // (render can run every step for the wrong-choice note: only touch the DOM when something changed)
    if (this._step !== step) { this._step = step; this.elStep.textContent = step; }
    if (this._text !== text) { this._text = text; this.elText.innerHTML = text; }
    if (this._note !== note) { this._note = note; this.elNote.innerHTML = note; }
  }

  /** Per step while playing (Game.updatePlaying). */
  update(dt, input) {
    const g = this.game, cam = g.cameraCtl, pl = this.player;
    // counters fed by real input and state
    this.look += Math.abs(angleDiff(cam.yaw, this.lastYaw)) + Math.abs(cam.pitch - this.lastPitch);
    this.lastYaw = cam.yaw; this.lastPitch = cam.pitch;
    if (pl.grounded && input.isDown('KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown')) this.walked += pl.horizontalSpeed * dt;
    if (input.isDown('ShiftLeft', 'ShiftRight') && pl.horizontalSpeed > 5) this.sprintT += dt;
    if (input.isDown('KeyQ') && this.section === 104) this.focusT += dt;
    const sh = this.puzzle(102).stoneById.get('T1').shadows.get('ilen');
    if (sh && sh.alive) {
      if (this.swingYaw !== null) this.swing += Math.abs(angleDiff(sh.yaw, this.swingYaw));
      this.swingYaw = sh.yaw;
    }
    const rail = this.puzzle(104).stoneById.get('T6');
    if (rail.moving || rail.slot !== 0) this.railMoved = true;

    if (this.noteT > 0) { this.noteT -= dt; if (this.noteT <= 0) { this.noteOverride = null; this.render(); } }

    const st = this.steps[this.i];
    if (!st) return;
    this.stepT += dt;
    if (this.doneT > 0) {
      this.doneT += dt;
      if (this.doneT >= (st.ok ? DONE_HOLD : 0.01)) { this.i++; this.enterStep(); if (!this.steps[this.i]) this.finish(); }
      return;
    }
    // a step whose precondition was lost goes back one (the echo crumbled before you crossed)
    if (st.undo?.(this)) { this.i--; this.enterStep(); this.say(st.undoNote, 4); return; }
    const ok = st.read ? this.stepT >= st.read : st.done(this);
    if (ok) {
      this.doneT = 1e-6;
      if (st.ok) g.audio.play('tut_step');
      this.render();
      return;
    }
    if (st.wrong) this.render(); // the wrong-choice note follows the state
  }

  finish() {
    this.el.classList.add('hidden');
    this.game.showTutorialDone();
  }
}
