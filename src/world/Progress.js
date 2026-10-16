// Persistent world progression: completed levels, opened gates, story beats, discoveries.
const KEY = 'ashen-minutes.save.v2';

const fresh = () => ({ v: 2, completed: [], gates: [], story: [], secrets: [], embers: 0, checkpoint: null, started: false });

export class Progress {
  constructor() {
    this.data = fresh();
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.v === 2) this.data = { ...fresh(), ...s };
    } catch { /* storage unavailable */ }
  }

  get hasSave() { return this.data.started && (this.data.completed.length > 0 || !!this.data.checkpoint); }

  reset() { this.data = fresh(); this.save(); }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  }

  mark(list, id) {
    if (!this.data[list].includes(id)) { this.data[list].push(id); this.save(); return true; }
    return false;
  }
}
