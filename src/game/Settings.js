// Graphics / control settings with Low · Medium · High presets, persisted in localStorage.
const KEY = 'ashen-minutes.settings.v2';

export const PRESETS = {
  low: { renderScale: 0.75, shadows: false, shadowRes: 1024, bloom: false, particles: 0.5, lights: 3, fogFar: 46 },
  medium: { renderScale: 1.0, shadows: true, shadowRes: 1024, bloom: true, particles: 0.8, lights: 4, fogFar: 54 },
  high: { renderScale: 1.5, shadows: true, shadowRes: 2048, bloom: true, particles: 1.0, lights: 6, fogFar: 62 },
};

const DEFAULTS = { preset: 'medium', ...PRESETS.medium, sensitivity: 1.0, invertY: false, showFps: false };

export class Settings {
  constructor() {
    this.v = { ...DEFAULTS };
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s) Object.assign(this.v, s);
    } catch { /* storage unavailable — defaults */ }
    const q = new URLSearchParams(location.search);
    if (q.has('lowfx')) this.applyPreset('low', false);
    if (q.has('highfx')) this.applyPreset('high', false);
  }

  get(k) { return this.v[k]; }

  set(k, val) {
    this.v[k] = val;
    if (k in PRESETS.medium) this.v.preset = 'custom';
    this.save();
  }

  applyPreset(name, persist = true) {
    if (!PRESETS[name]) return;
    Object.assign(this.v, PRESETS[name], { preset: name });
    if (persist) this.save();
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch { /* ignore */ }
  }
}
