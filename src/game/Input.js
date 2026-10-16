// Keyboard + mouse state with edge-triggered presses and blur cleanup (doc §5.3, §11.2).
const PREVENT = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace', 'Tab']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.dragging = false;
    this.locked = false;
    this.onBlur = null; // callback set by Game

    window.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!e.repeat && !this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.clear(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(true); });

    // Mouse look: pointer lock when available, otherwise drag with any button.
    canvas.addEventListener('mousedown', () => { this.dragging = true; });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (this.locked || this.dragging) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }

  requestLock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch { /* pointer lock unavailable — drag-look still works */ }
  }

  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  isDown(...codes) { return codes.some((c) => this.down.has(c)); }
  wasPressed(...codes) { return codes.some((c) => this.pressed.has(c)); }

  clear(fromBlur = false) {
    this.down.clear();
    this.pressed.clear();
    this.mouseDX = this.mouseDY = 0;
    this.dragging = false;
    if (fromBlur && this.onBlur) this.onBlur();
  }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
