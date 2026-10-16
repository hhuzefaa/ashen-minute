// Fixed-rate transform history for ONE relic (doc §4.3).
// - 20 samples/s, capacity 4 s (80 samples).
// - Samples are stored only when the yaw actually changes, so a relic standing still does not
//   push its own past out of memory (prevents an unsolvable state after waiting).
// - Rewind plays the history backward; releasing discards the abandoned future branch.
// - In Rooms 2–3 the first sample (the angle shown by the cyan echo) is pinned, so fiddling with
//   the relic can never erase the memory the puzzle depends on (no softlock).
export class TimeRecorder {
  constructor(rate = 20, seconds = 4) {
    this.rate = rate;
    this.capacity = Math.round(rate * seconds);
    this.samples = [];
    this.acc = 0;
    this.cursor = -1; // float index while rewinding
    this.rewinding = false;
    this.pinned = false; // when true, sample 0 (the relic's remembered angle) is never evicted
  }

  reset() {
    this.samples.length = 0;
    this.acc = 0;
    this.cursor = -1;
    this.rewinding = false;
  }

  get length() { return this.samples.length; }
  get fill() { return this.samples.length / this.capacity; }

  push(yaw) {
    const last = this.samples[this.samples.length - 1];
    if (last !== undefined && Math.abs(last - yaw) < 1e-4) return;
    this.samples.push(yaw);
    if (this.samples.length > this.capacity) {
      if (this.pinned) this.samples.splice(1, 1); else this.samples.shift();
    }
  }

  /** Call every frame while the relic is lit and NOT rewinding. */
  record(dt, yaw) {
    this.acc += dt;
    const step = 1 / this.rate;
    while (this.acc >= step) {
      this.acc -= step;
      this.push(yaw);
    }
  }

  /** Begin a rewind. Returns false if there is nothing to rewind to. */
  beginRewind(currentYaw) {
    this.push(currentYaw);
    if (this.samples.length < 2) return false;
    this.rewinding = true;
    this.cursor = this.samples.length - 1;
    return true;
  }

  /** Advance backwards; returns the yaw to display. speed = playback multiplier. */
  stepRewind(dt, speed = 1.6) {
    if (!this.rewinding) return null;
    this.cursor = Math.max(0, this.cursor - dt * this.rate * speed);
    const i0 = Math.floor(this.cursor);
    const i1 = Math.min(i0 + 1, this.samples.length - 1);
    const f = this.cursor - i0;
    return this.samples[i0] + (this.samples[i1] - this.samples[i0]) * f;
  }

  get atOldest() { return this.rewinding && this.cursor <= 0; }

  /** Yaw a few samples further back than the cursor — used to place the cyan ghost. */
  peekBack(n = 8) {
    if (!this.samples.length) return null;
    const i = Math.max(0, Math.floor(this.cursor >= 0 ? this.cursor : this.samples.length - 1) - n);
    return this.samples[i];
  }

  /** Stop rewinding at `yaw`, discarding the abandoned future. */
  endRewind(yaw) {
    if (!this.rewinding) return;
    const keep = Math.max(0, Math.floor(this.cursor));
    this.samples.length = keep + 1;
    this.samples[keep] = yaw;
    this.rewinding = false;
    this.cursor = -1;
    this.acc = 0;
  }
}
