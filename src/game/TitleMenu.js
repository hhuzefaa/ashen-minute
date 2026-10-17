import { artReady } from './uiArt.js';

// Title screen → main menu as ONE composition.
//
//   splash  : the Sanctuary fills the screen, the title sits in the centre, "Press any button".
//   morph   : any key / click / pad button. The SAME #title-lockup element is interpolated from the
//             centre to the top (position + scale on one eased curve) while the prompt dissolves,
//             the camera eases in and the rune buttons kindle one after another beneath the title.
//   menu    : keyboard (↑↓/WS, Enter/Space/E), mouse (hover + click) and gamepad (d-pad/stick, A, B).
//   confirm / overlay / farewell / leaving : sub-states that own input while they are up.
//   ('confirm' = one of the title's dialogs is up: the New Game confirmation or the tutorial choice.)
//
// Everything is driven from Game.step(dt) (fixed step), so the timeline pauses with the game loop
// and stays deterministic in the headless tests. Input during the morph is ignored, never queued.

const MORPH = 1.75;                 // s — whole transition
const TITLE_END = 1.3;              // s — title glide (position + scale share one curve)
const PROMPT_OUT = 0.4;             // s — prompt dissolves first
const BTN_START = 0.62, BTN_STAGGER = 0.1, BTN_DUR = 0.7;
const DIRECT_BTN_START = 0.15;      // returning from the game: title already up, buttons kindle in
const INTRO = 1.6;                  // s — title fades in over the temple on first launch
const PRESS_HOLD = 0.24;            // s — clicked-state art shows before the action runs
const ART_RATIO = 1092 / 400;
const HEART_TOP = 0.49;              // fraction of screen height where the Heart altar's glow begins

// keys that never count as "any button" (modifiers, OS keys, the mute key)
const IGNORED = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
  'Tab', 'CapsLock', 'NumLock', 'ScrollLock', 'PrintScreen', 'ContextMenu', 'KeyM', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8',
  'F9', 'F10', 'F11', 'F12']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Enter', 'NumpadEnter', 'Space', 'KeyE']);

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outCubic = (t) => 1 - Math.pow(1 - t, 3);
const outQuart = (t) => 1 - Math.pow(1 - t, 4);
const lerp = (a, b, t) => a + (b - a) * t;
// the title's glide: leaves promptly (no sluggish ease-in), then settles long and soft into place
const glide = (t) => 0.55 * inOutCubic(t) + 0.45 * outQuart(t);

export class TitleMenu {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.root = $('screen-title');
    this.lockup = $('title-lockup');
    this.prompt = $('title-prompt');
    this.menuEl = $('main-menu');
    this.menuVeil = this.root.querySelector('.menu-veil');
    this.hints = this.root.querySelector('.menu-hints');
    this.farewellEl = $('title-farewell');
    this.slots = [...this.menuEl.querySelectorAll('.rb-slot')];
    this.items = this.slots.map((slot) => {
      const el = slot.querySelector('.rune-btn');
      return { slot, el, action: el.dataset.action, enabled: true };
    });
    // dialogs over the menu: confirm (New Game over a save) and choice (play or skip the tutorial)
    const dialog = (id, def) => {
      const el = $(id);
      return { el, def, items: [...el.querySelectorAll('.rune-btn')].map((b) => ({ el: b, action: b.dataset.confirm, enabled: true })) };
    };
    this.dialogs = { confirm: dialog('title-confirm', 1), choice: dialog('title-choice', 0) };
    this.dlg = this.dialogs.confirm;

    this.phase = 'hidden';
    this.t = 0;          // time in the current phase
    this.introT = 0;     // title fade-in on first launch
    this.direct = false; // entered from the game (no splash)
    this.sel = 0;
    this.confirmSel = 1;
    this.camK = 0;       // 0 → 1 over the morph, read by Game's title camera
    this.pad = { prev: [], axisHeld: 0, axisT: 0 };
    this.layoutCache = null;
    this.wasOverlay = false;

    this.artReady = artReady; // the button art is shared with the pause and completion menus

    window.addEventListener('keydown', (e) => this.onKey(e), true);
    window.addEventListener('resize', () => this.layout());
    // the lockup is measured in its real typeface: re-measure once the display fonts arrive
    document.fonts?.ready.then(() => this.layout());
    document.fonts?.load('700 1em "Cinzel Decorative"').then(() => this.layout()).catch(() => {});
    this.root.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    // Hover only selects after the mouse really moves: a cursor resting where a button appears
    // (or a keyboard player's idle mouse) must not steal the selection.
    this.mouse = { x: -1, y: -1, armed: false };
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && (e.clientX !== this.mouse.x || e.clientY !== this.mouse.y)) {
        this.mouse.armed = true;
        this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      }
    }, true);
    const bindPointer = (list, dlg) => list.forEach((it, i) => {
      const mine = () => !dlg || this.dlg === dlg; // a dialog's buttons answer only while it is up
      it.el.addEventListener('pointermove', (e) => { if ((e.pointerType !== 'mouse' || this.mouse.armed) && mine()) this.onHover(i, !!dlg); });
      it.el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.detail === 0 || !mine()) return; // keyboard-synthesised click: keys are handled in onKey
        if (dlg) { if (this.phase === 'confirm') this.activateConfirm(i); } else if (this.phase === 'menu') this.activate(i);
      });
    });
    bindPointer(this.items, null);
    for (const d of Object.values(this.dialogs)) bindPointer(d.items, d);
  }

  // ------------------------------------------------------------------ lifecycle
  /** Show the title. direct = coming back from the game: skip the splash, the menu forms at once. */
  enter(direct = false) {
    this.direct = direct;
    this.root.classList.remove('hidden');
    for (const d of Object.values(this.dialogs)) d.el.classList.add('hidden');
    this.farewellEl.classList.add('hidden');
    this.root.classList.remove('is-confirming');
    this.prompt.style.opacity = '0';
    this.prompt.dataset.from = '1';
    this.lockup.classList.remove('animating');
    this.layout();
    this.refreshContinue();
    this.sel = this.firstEnabled(0); // Continue when there is a save, otherwise New Game
    this.paint(this.items, -1);
    this.t = 0;
    this.camK = direct ? 1 : 0;
    if (direct) {
      this.introT = INTRO;
      this.setPhase('morph');
      this.lockup.style.opacity = '1';
    } else {
      this.introT = 0;
      this.setPhase('splash');
      this.lockup.style.opacity = '0';
    }
    this.applyMorph(direct ? 1 : 0, 0);
  }

  /** Leaving for gameplay (New Game / Continue): input closes; the game's fade covers the rest. */
  leave() {
    if (this.phase === 'hidden') return;
    this.setPhase('leaving');
  }

  hide() { this.setPhase('hidden'); }

  setPhase(p) {
    this.phase = p;
    this.t = 0;
    this.root.dataset.phase = p;
  }

  get active() { return this.game.state === 'title' && this.phase !== 'hidden'; }

  // ------------------------------------------------------------------ layout (responsive)
  /** All positions derive from the viewport and the lockup's measured size: no fixed resolution. */
  layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const w0 = this.lockup.offsetWidth || 1, h0 = this.lockup.offsetHeight || 1;
    const n = this.items.filter((it) => it.enabled).length;
    // splash: the title sits over the temple with its flourish resting just above the Heart altar.
    // (The title camera's vertical framing does not depend on aspect, so the altar's top is at a
    // fixed fraction of the height; the lockup's own height varies with the viewport.)
    const y0 = Math.max(vh * 0.12 + h0 / 2, Math.min(vh * 0.42, vh * HEART_TOP - h0 / 2));
    // menu: title scaled down to the top-centre
    const s1 = Math.min(0.56, (vh * 0.2) / h0, (vw * 0.86) / w0);
    const top = Math.max(14, vh * 0.045);
    const y1 = top + (h0 * s1) / 2;
    // buttons: fill the space between the title and the hints, keeping the artwork's ratio
    const gapK = 0.1;
    const menuTop0 = y1 + (h0 * s1) / 2 + Math.max(10, vh * 0.03);
    const bottom = vh - Math.max(30, vh * 0.075);
    const avail = Math.max(60, bottom - menuTop0);
    let bh = avail / (n + (n - 1) * gapK);
    bh = Math.min(bh, vh * 0.125);
    let bw = bh * ART_RATIO;
    bw = Math.min(bw, vw * 0.84, 430);
    bh = bw / ART_RATIO;
    const gap = Math.round(bh * gapK);
    const used = n * bh + (n - 1) * gap;
    // centre the column in the free space, nudged toward the title so the two read as one group
    const menuTop = menuTop0 + Math.max(0, (avail - used) * 0.35);
    this.root.style.setProperty('--btn-w', `${Math.round(bw)}px`);
    this.root.style.setProperty('--btn-gap', `${gap}px`);
    this.root.style.setProperty('--menu-top', `${Math.round(menuTop)}px`);
    this.layoutCache = { y0, y1, s1 };
    // (during the morph the next step re-applies the timeline with the new layout)
    if (this.phase === 'splash' || this.phase === 'hidden') this.applyMorph(0, 0);
    else if (this.phase !== 'morph') this.applyMorph(TITLE_END, 1e3);
  }

  // ------------------------------------------------------------------ per-step update
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    if (this.introT < INTRO) {
      this.introT += dt;
      const k = clamp01(this.introT / INTRO);
      this.lockup.style.opacity = String(outCubic(clamp01(k * 1.25)));
      if (this.phase === 'splash') this.prompt.style.opacity = String(clamp01((this.introT - 0.8) / (INTRO - 0.8)));
    }
    this.pollPad(dt);
    switch (this.phase) {
      case 'morph': {
        this.applyMorph(this.direct ? 1 : this.t, this.t);
        if (this.t >= (this.direct ? DIRECT_BTN_START + BTN_STAGGER * (this.items.length - 1) + BTN_DUR : MORPH)) this.finishMorph(); // (fixed length: a hidden item only ends it a beat later)
        break;
      }
      case 'pressing':
        if (this.t >= PRESS_HOLD) this.runPending();
        break;
      case 'overlay':
        if (!this.game.ui.overlayOpen) { this.setPhase('menu'); this.paint(this.items, this.sel); }
        break;
      default: break;
    }
  }

  /**
   * One timeline for the whole morph. tTitle drives the title (seconds), tBtn the buttons.
   * The title's translation and scale share a single eased progress value, so it glides along
   * one curve instead of sliding and then shrinking.
   */
  applyMorph(tTitle, tBtn) {
    const L = this.layoutCache;
    if (!L) return;
    const p = this.direct ? 1 : glide(clamp01(tTitle / TITLE_END));
    const y = lerp(L.y0, L.y1, p);
    const s = lerp(1, L.s1, p);
    this.lockup.style.transform = `translate(-50%, -50%) translate3d(0, ${y.toFixed(2)}px, 0) scale(${s.toFixed(4)})`;
    this.camK = this.direct ? 1 : inOutCubic(clamp01(tTitle / MORPH));
    // the prompt dissolves upward into the title's wake
    const pk = this.direct ? 1 : clamp01(tTitle / PROMPT_OUT);
    if (this.phase !== 'splash') {
      this.prompt.style.opacity = String((1 - outCubic(pk)) * (parseFloat(this.prompt.dataset.from || '1')));
      this.prompt.style.transform = `translateY(${(-pk * 14).toFixed(1)}px)`;
    } else {
      this.prompt.style.transform = '';
    }
    this.menuVeil.style.opacity = String(this.direct ? clamp01(tBtn / 0.4) : outCubic(clamp01((tTitle - 0.2) / 1.2)));
    // buttons kindle one after another: rise, unblur, and flash with the hover art as they catch
    const start = this.direct ? DIRECT_BTN_START : BTN_START;
    let order = 0;
    for (let i = 0; i < this.slots.length; i++) {
      if (!this.items[i].enabled) continue;
      const k = clamp01((tBtn - start - order++ * BTN_STAGGER) / BTN_DUR);
      const e = outQuart(k);
      const slot = this.slots[i];
      slot.style.opacity = String(clamp01(k * 1.6));
      slot.style.transform = k >= 1 ? '' : `translate3d(0, ${((1 - e) * 26).toFixed(2)}px, 0) scale(${(0.94 + 0.06 * e).toFixed(4)})`;
      slot.style.filter = k >= 1 ? '' : `blur(${((1 - e) * 5).toFixed(2)}px)`;
      const hover = this.items[i].el.children[1];
      const flash = k > 0 && k < 1 ? Math.sin(k * Math.PI) * 0.75 : 0;
      hover.style.opacity = flash > 0.01 ? flash.toFixed(3) : '';
    }
    const hk = clamp01((tBtn - (start + BTN_STAGGER * Math.max(0, order - 1) + BTN_DUR * 0.6)) / 0.5);
    this.hints.style.opacity = String(hk * 0.9);
  }

  finishMorph() {
    this.mouse.armed = false;
    this.applyMorph(TITLE_END, 1e3);
    this.lockup.classList.remove('animating');
    for (const it of this.items) it.el.children[1].style.opacity = '';
    this.setPhase('menu');
    this.paint(this.items, this.sel);
  }

  /** Any button on the splash starts the morph — once. */
  beginMorph() {
    if (this.phase !== 'splash' || this.introT < 0.35) return;
    this.game.audio.init(); // the press is the user gesture that lets the browser start sound
    this.game.audio.play('ui_wake');
    this.prompt.dataset.from = this.prompt.style.opacity || '1';
    this.lockup.classList.add('animating');
    this.setPhase('morph');
  }

  // ------------------------------------------------------------------ selection + activation
  refreshContinue() {
    const has = this.game.world.progress.hasSave;
    const it = this.items.find((x) => x.action === 'continue');
    // no resumable run: Continue is not offered at all, and the column re-centres on what is left
    it.enabled = has;
    it.slot.classList.toggle('hidden', !has);
    it.el.setAttribute('aria-disabled', String(!has));
    if (!has && this.sel === this.items.indexOf(it)) this.sel = this.firstEnabled(0);
    this.layout();
  }

  firstEnabled(from) {
    for (let k = 0; k < this.items.length; k++) {
      const i = (from + k) % this.items.length;
      if (this.items[i].enabled) return i;
    }
    return 0;
  }

  move(dir, list = this.items) {
    this.mouse.armed = false; // keyboard / pad take over until the mouse moves again
    const isConfirm = list === this.confirmItems;
    let i = isConfirm ? this.confirmSel : this.sel;
    for (let k = 0; k < list.length; k++) {
      i = (i + dir + list.length) % list.length;
      if (list[i].enabled) break;
    }
    if (isConfirm) { if (i === this.confirmSel) return; this.confirmSel = i; } else { if (i === this.sel) return; this.sel = i; }
    this.paint(list, i);
    this.game.audio.play('ui_move');
  }

  paint(list, sel) {
    list.forEach((it, i) => it.el.classList.toggle('is-selected', i === sel));
    const el = list[sel]?.el;
    if (el && document.activeElement !== el) el.focus({ preventScroll: true });
  }

  onHover(i, isConfirm) {
    if (isConfirm) {
      if (this.phase !== 'confirm' || i === this.confirmSel) return;
      this.confirmSel = i; this.paint(this.confirmItems, i); this.game.audio.play('ui_move');
      return;
    }
    if (this.phase !== 'menu' || i === this.sel) return;
    if (!this.items[i].enabled) return;
    this.sel = i;
    this.paint(this.items, i);
    this.game.audio.play('ui_move');
  }

  activate(i) {
    if (this.phase !== 'menu') return;
    const it = this.items[i];
    if (!it.enabled) {
      // say why instead of doing nothing
      it.el.classList.remove('denied'); void it.el.offsetWidth; it.el.classList.add('denied');
      this.game.audio.play('sfx_no_memory');
      return;
    }
    if (i !== this.sel) { this.sel = i; this.paint(this.items, i); }
    it.el.classList.add('is-pressed');
    this.game.audio.play('ui_confirm');
    this.pending = { list: this.items, i, run: () => this.runAction(it.action) };
    this.setPhase('pressing');
  }

  runPending() {
    const p = this.pending;
    this.pending = null;
    p.list[p.i].el.classList.remove('is-pressed');
    this.setPhase(p.list === this.confirmItems ? 'confirm' : 'menu');
    p.run();
  }

  runAction(action) {
    const g = this.game;
    switch (action) {
      case 'new-game':
        // a saved journey asks first; then (or straight away) the tutorial choice
        this.openDialog(g.world.progress.hasSave ? 'confirm' : 'choice');
        break;
      case 'continue': g.onAction('continue'); break;
      case 'settings':
      case 'credits':
        g.onAction(action);
        this.setPhase('overlay');
        break;
      case 'quit': this.quit(); break;
      default: g.onAction(action);
    }
  }

  // ------------------------------------------------------------------ dialogs (New Game)
  get confirmEl() { return this.dlg.el; }
  get confirmItems() { return this.dlg.items; }

  /** confirm: New Game over a save ("Keep it" is the safe default) · choice: play or skip the tutorial. */
  openDialog(name) {
    for (const d of Object.values(this.dialogs)) d.el.classList.add('hidden');
    this.dlg = this.dialogs[name];
    this.confirmSel = this.dlg.def;
    this.dlg.el.classList.remove('hidden');
    this.root.classList.add('is-confirming');
    this.setPhase('confirm');
    this.paint(this.confirmItems, this.confirmSel);
  }

  openConfirm() { this.openDialog('confirm'); }

  closeConfirm() {
    for (const d of Object.values(this.dialogs)) d.el.classList.add('hidden');
    this.root.classList.remove('is-confirming');
    this.setPhase('menu');
    this.paint(this.items, this.sel);
  }

  activateConfirm(i) {
    if (this.phase !== 'confirm') return;
    const it = this.confirmItems[i];
    this.confirmSel = i;
    this.paint(this.confirmItems, i);
    it.el.classList.add('is-pressed');
    this.game.audio.play('ui_confirm');
    this.pending = {
      list: this.confirmItems, i,
      run: () => {
        switch (it.action) {
          case 'yes': this.openDialog('choice'); break;                          // begin anew → choose
          case 'play': this.setPhase('menu'); this.game.onAction('tutorial'); break;
          case 'skip': this.setPhase('menu'); this.game.onAction('new-game'); break; // today's New Game
          default: this.closeConfirm();                                         // keep it / back
        }
      },
    };
    this.setPhase('pressing');
  }

  // ------------------------------------------------------------------ quit (web build)
  /** A browser tab can only be closed by the page that opened it, so Quit tries, and otherwise
   *  says plainly that the journey is saved and the tab can be closed. */
  quit() {
    this.game.input.exitLock();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    try { window.close(); } catch { /* not allowed for tabs the user opened */ }
    const sub = document.getElementById('farewell-sub');
    sub.textContent = this.game.world.progress.hasSave ? 'Your journey is saved. You can close this tab.' : 'You can close this tab.';
    this.farewellEl.classList.remove('hidden');
    this.setPhase('farewell');
    if (this.game.audio.ctx) this.game.audio.ctx.suspend();
  }

  returnFromFarewell() {
    if (this.t < 0.5) return; // the same press that chose Quit must not undo it
    this.farewellEl.classList.add('hidden');
    if (this.game.audio.ctx) this.game.audio.ctx.resume();
    this.setPhase('menu');
    this.paint(this.items, this.sel);
  }

  // ------------------------------------------------------------------ input
  onKey(e) {
    if (!this.active) return;
    const code = e.code;
    switch (this.phase) {
      case 'splash':
        if (e.repeat || IGNORED.has(code) || code === 'Escape') return;
        e.preventDefault();
        this.beginMorph();
        return;
      case 'morph': case 'pressing': case 'leaving':
        // swallow everything so a held or repeated key cannot trigger a menu action
        if (CONFIRM.has(code) || UP.has(code) || DOWN.has(code)) e.preventDefault();
        return;
      case 'menu':
        if (UP.has(code) || LEFT.has(code)) { e.preventDefault(); this.move(-1); } else if (DOWN.has(code) || RIGHT.has(code)) { e.preventDefault(); this.move(1); } else if (code === 'Home') { e.preventDefault(); this.sel = this.firstEnabled(0); this.paint(this.items, this.sel); } else if (code === 'End') { e.preventDefault(); this.sel = this.items.length - 1; this.paint(this.items, this.sel); } else if (CONFIRM.has(code)) {
          e.preventDefault();
          if (!e.repeat) this.activate(this.sel);
        }
        return;
      case 'confirm':
        if (UP.has(code) || LEFT.has(code)) { e.preventDefault(); this.move(-1, this.confirmItems); } else if (DOWN.has(code) || RIGHT.has(code)) { e.preventDefault(); this.move(1, this.confirmItems); } else if (CONFIRM.has(code)) { e.preventDefault(); if (!e.repeat) this.activateConfirm(this.confirmSel); } else if (code === 'Escape' || code === 'Backspace') { e.preventDefault(); this.closeConfirm(); }
        return;
      case 'farewell':
        if (e.repeat || IGNORED.has(code)) return;
        e.preventDefault();
        this.returnFromFarewell();
        return;
      default: break; // overlay: the overlay's own controls and Game's Esc handling apply
    }
  }

  onPointerDown(e) {
    if (!this.active) return;
    if (this.phase === 'splash') { e.preventDefault(); this.beginMorph(); } else if (this.phase === 'farewell') this.returnFromFarewell();
    else if (this.phase === 'confirm' && e.target === this.confirmEl) this.closeConfirm();
  }

  /** Gamepad: any button continues; d-pad / left stick move; A confirms; B backs out. */
  pollPad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : null;
    if (!pads) return;
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) return;
    const prev = this.pad.prev;
    const pressed = (i) => !!gp.buttons[i]?.pressed && !prev[i];
    let any = false;
    for (let i = 0; i < gp.buttons.length; i++) if (pressed(i)) { any = true; break; }
    // stick with repeat
    const ay = gp.axes[1] || 0;
    let stick = 0;
    if (Math.abs(ay) > 0.55) {
      const d = Math.sign(ay);
      if (this.pad.axisHeld !== d) { stick = d; this.pad.axisHeld = d; this.pad.axisT = 0.38; } else if ((this.pad.axisT -= dt) <= 0) { stick = d; this.pad.axisT = 0.14; }
    } else this.pad.axisHeld = 0;
    const up = pressed(12) || stick < 0, down = pressed(13) || stick > 0;
    const left = pressed(14), right = pressed(15);
    switch (this.phase) {
      case 'splash': if (any) this.beginMorph(); break;
      case 'menu':
        if (up || left) this.move(-1); else if (down || right) this.move(1);
        else if (pressed(0) || pressed(9)) this.activate(this.sel);
        break;
      case 'confirm':
        if (up || left) this.move(-1, this.confirmItems); else if (down || right) this.move(1, this.confirmItems);
        else if (pressed(0)) this.activateConfirm(this.confirmSel); else if (pressed(1)) this.closeConfirm();
        break;
      case 'overlay': if (pressed(1)) this.game.ui.closeOverlay(true); break;
      case 'farewell': if (any) this.returnFromFarewell(); break;
      default: break;
    }
    for (let i = 0; i < gp.buttons.length; i++) prev[i] = !!gp.buttons[i]?.pressed;
  }
}
