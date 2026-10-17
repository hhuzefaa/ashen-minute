// Keyboard / mouse / gamepad navigation for a vertical list of rune buttons (pause menu and the
// completion screen). Same feel as the title menu: one selected button, hover only after the mouse
// really moves, the clicked-state art flashes before the action runs, repeats and held keys ignored.
// It runs on real time (not the game step), because the game step is frozen while paused.

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Enter', 'NumpadEnter', 'Space', 'KeyE']);
const PRESS_MS = 220;

export class RuneMenu {
  /**
   * @param {object} game
   * @param {HTMLElement} root   element containing the .rune-btn[data-action] buttons
   * @param {(action:string)=>void} run
   * @param {()=>void} [back]  gamepad B
   */
  constructor(game, root, run, back = null) {
    this.back = back;
    this.game = game;
    this.root = root;
    this.run = run;
    this.all = [...root.querySelectorAll('.rune-btn[data-action]')];
    this.items = this.all; // the buttons on show (recomputed on open: some menus swap buttons by mode)
    this.active = false;
    this.busy = false;
    this.sel = 0;
    this.mouse = { x: -1, y: -1, armed: false };
    this.pad = { prev: [], held: 0, t: 0 };
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && (e.clientX !== this.mouse.x || e.clientY !== this.mouse.y)) {
        this.mouse.armed = true; this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      }
    }, true);
    this.all.forEach((el) => {
      el.addEventListener('pointermove', (e) => { const i = this.items.indexOf(el); if (i >= 0 && (e.pointerType !== 'mouse' || this.mouse.armed)) this.select(i, true); });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = this.items.indexOf(el);
        if (e.detail === 0 || i < 0) return; // keyboard-synthesised: handled in onKey
        this.activate(i);
      });
    });
  }

  get blocked() { return !this.active || this.busy || this.game.ui.overlayOpen || this.root.classList.contains('hidden'); }

  open(sel = 0) {
    this.active = true;
    this.busy = false;
    this.mouse.armed = false;
    this.pad.prev.length = 0;
    this.items = this.all.filter((el) => !el.classList.contains('hidden'));
    this.sel = Math.min(sel, this.items.length - 1);
    this.fitLabels();
    this.paint();
  }

  close() {
    this.active = false;
    this.busy = false;
    for (const el of this.all) el.classList.remove('is-pressed');
  }

  /** Long labels shrink until they fit inside the frame (never below 72 % of the base size). */
  fitLabels() {
    for (const el of this.items) {
      const lab = el.querySelector('.rb-label');
      if (!lab) continue;
      lab.style.fontSize = '';
      const max = el.clientWidth * 0.72; // clear of the corner runes, even at the selected scale
      if (!max) continue;
      const range = document.createRange();
      range.selectNodeContents(lab);
      const tw = range.getBoundingClientRect().width;
      if (tw > max) lab.style.fontSize = `${Math.max(0.72, max / tw) * parseFloat(getComputedStyle(lab).fontSize)}px`;
    }
  }

  select(i, fromMouse = false) {
    if (this.blocked || i === this.sel) return;
    this.sel = i;
    if (!fromMouse) this.mouse.armed = false;
    this.paint();
    this.game.audio.play('ui_move');
  }

  paint() {
    const cur = this.items[this.sel];
    this.all.forEach((el) => el.classList.toggle('is-selected', el === cur));
    const el = this.items[this.sel];
    if (el && document.activeElement !== el) el.focus({ preventScroll: true });
  }

  activate(i) {
    if (this.blocked) return;
    this.sel = i;
    this.paint();
    const el = this.items[i];
    el.classList.add('is-pressed');
    this.busy = true;
    this.game.audio.play('ui_confirm');
    setTimeout(() => {
      el.classList.remove('is-pressed');
      this.busy = false;
      if (this.active) this.run(el.dataset.action);
    }, PRESS_MS);
  }

  onKey(e) {
    if (this.blocked) return;
    const c = e.code;
    if (UP.has(c)) { e.preventDefault(); this.select((this.sel - 1 + this.items.length) % this.items.length); } else if (DOWN.has(c)) { e.preventDefault(); this.select((this.sel + 1) % this.items.length); } else if (c === 'Home') { e.preventDefault(); this.select(0); } else if (c === 'End') { e.preventDefault(); this.select(this.items.length - 1); } else if (CONFIRM.has(c)) {
      e.preventDefault();
      if (!e.repeat) this.activate(this.sel);
    }
  }

  /** Gamepad: d-pad / left stick move, A confirms. Called once per rendered frame by Game. */
  poll(dt) {
    if (!this.active || !navigator.getGamepads) return;
    let gp = null;
    for (const p of navigator.getGamepads()) if (p && p.connected) { gp = p; break; }
    if (!gp) return;
    const prev = this.pad.prev;
    const hit = (i) => !!gp.buttons[i]?.pressed && !prev[i];
    let stick = 0;
    const ay = gp.axes[1] || 0;
    if (Math.abs(ay) > 0.55) {
      const d = Math.sign(ay);
      if (this.pad.held !== d) { stick = d; this.pad.held = d; this.pad.t = 0.38; } else if ((this.pad.t -= dt) <= 0) { stick = d; this.pad.t = 0.14; }
    } else this.pad.held = 0;
    if (!this.blocked) {
      if (hit(12) || stick < 0) this.select((this.sel - 1 + this.items.length) % this.items.length);
      else if (hit(13) || stick > 0) this.select((this.sel + 1) % this.items.length);
      else if (hit(0)) this.activate(this.sel);
      else if (hit(1) && this.back) this.back();
    }
    for (let i = 0; i < gp.buttons.length; i++) prev[i] = !!gp.buttons[i]?.pressed;
  }
}
