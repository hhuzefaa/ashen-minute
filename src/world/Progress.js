// Persistent world progression: completed levels, opened gates, story beats, discoveries.
const KEY = 'ashen-minutes.save.v3';

// finished: the run reached the ending (it is no longer resumable)
// playTime: seconds of play (playing + cutscenes; never pause, menus or fades), carried by Continue
// finalTime: playTime frozen at the ending, shown on the completion screen
const fresh = () => ({ v: 3, completed: [], gates: [], story: [], secrets: [], lostMinutes: [], abilities: { echo: false }, echoesMade: 0, embers: 0, checkpoint: null, started: false, finished: false, playTime: 0, finalTime: null });

const uniq = (a, ok) => (Array.isArray(a) ? [...new Set(a.filter(ok))] : []);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isStr = (s) => typeof s === 'string' && s.length < 64;

/** Repair whatever came out of storage: wrong types, duplicates, unknown ids and impossible values
 *  are dropped, so a stale or hand-edited save can never produce impossible counters. */
function sanitize(s, validLevelIds, finaleId) {
  const d = fresh();
  if (!s || typeof s !== 'object' || s.v !== 3) return d;
  d.completed = uniq(s.completed, (id) => isNum(id) && (!validLevelIds || validLevelIds.has(id)));
  d.gates = uniq(s.gates, isStr);
  d.story = uniq(s.story, isStr);
  d.secrets = uniq(s.secrets, isStr);
  d.lostMinutes = uniq(s.lostMinutes, isStr);
  d.abilities = { echo: !!s.abilities?.echo };
  d.embers = isNum(s.embers) && s.embers >= 0 ? Math.floor(s.embers) : 0;
  d.echoesMade = isNum(s.echoesMade) && s.echoesMade >= 0 ? Math.floor(s.echoesMade) : 0;
  const c = s.checkpoint;
  d.checkpoint = c && isNum(c.x) && isNum(c.z) && isNum(c.yaw) ? { x: c.x, z: c.z, yaw: c.yaw } : null;
  d.started = !!s.started;
  // saves from before the `finished` flag: a run whose finale was completed is finished
  d.finished = !!s.finished || (finaleId != null && d.completed.includes(finaleId));
  d.playTime = isNum(s.playTime) && s.playTime >= 0 ? s.playTime : 0;
  d.finalTime = isNum(s.finalTime) && s.finalTime >= 0 ? s.finalTime : null;
  return d;
}

export class Progress {
  /** validLevelIds: the level ids that exist in this build (unknown ids in a save are ignored). */
  constructor(validLevelIds = null, finaleId = null) {
    this.valid = validLevelIds;
    this.data = fresh();
    try {
      this.data = sanitize(JSON.parse(localStorage.getItem(KEY) || 'null'), validLevelIds, finaleId);
    } catch { /* storage unavailable or corrupt: start clean */ }
  }

  /** A run that can be resumed: started, not finished. (A run is started the moment New Game
   *  begins, so pausing → Main Menu right away still offers Continue.) */
  get hasSave() { return this.data.started && !this.data.finished; }

  reset() { this.data = fresh(); this.save(); }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  }

  mark(list, id) {
    if (!this.data[list].includes(id)) { this.data[list].push(id); this.save(); return true; }
    return false;
  }
}
