// All sound is synthesised at runtime with the Web Audio API — no audio files, no licensing.
// Names mirror the asset bible (§7.4): sfx_relic_ignite, sfx_shadow_align, sfx_time_rewind, ...
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.loops = {};
    this.ready = false;
  }

  /** Must be called from a user gesture (Play button). Safe to call repeatedly. */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.85; this.sfx.connect(this.master);
    this.amb = c.createGain(); this.amb.gain.value = 0.55; this.amb.connect(this.master);
    // reverb send: generated impulse response (stone hall)
    this.reverb = c.createConvolver();
    this.reverb.buffer = this._impulse(2.6, 2.4);
    this.revSend = c.createGain(); this.revSend.gain.value = 0.35;
    this.revSend.connect(this.reverb).connect(this.master);
    this.noise = this._noiseBuffer(2, 'white');
    this.brown = this._noiseBuffer(4, 'brown');
    this.crackleBuf = this._crackleBuffer(3);
    this.ready = true;
    this._startAmbience();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  // ---------- buffers ----------
  _noiseBuffer(sec, kind) {
    const c = this.ctx;
    const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }

  _crackleBuffer(sec) {
    const c = this.ctx;
    const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate);
    const d = b.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < d.length; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.08; d[i] = lp * 0.25; }
    const pops = 70 * sec;
    for (let k = 0; k < pops; k++) {
      const at = Math.floor(Math.random() * (d.length - 2000));
      const amp = 0.2 + Math.random() * 0.8;
      const len = 80 + Math.floor(Math.random() * 600);
      for (let j = 0; j < len; j++) d[at + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / (len * 0.25));
    }
    return b;
  }

  _impulse(sec, decay) {
    const c = this.ctx;
    const len = c.sampleRate * sec;
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  // ---------- building blocks ----------
  _env(gainNode, t, a, peak, dcy, sustainEnd = null) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(0.0001, (sustainEnd ?? t + a) + dcy);
  }

  _tone(freq, t, dur, { type = 'sine', gain = 0.2, attack = 0.005, rev = 0.3, dest = null, detune = 0, glideTo = null } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    o.detune.value = detune;
    const g = c.createGain();
    this._env(g, t, attack, gain, dur);
    o.connect(g);
    g.connect(dest || this.sfx);
    if (rev) { const s = c.createGain(); s.gain.value = rev; g.connect(s).connect(this.revSend); }
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }

  _noise(t, dur, { gain = 0.3, type = 'bandpass', f0 = 800, f1 = null, q = 1, attack = 0.005, buf = null, rev = 0.3, dest = null } = {}) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = buf || this.noise;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    this._env(g, t, attack, gain, dur);
    s.connect(f).connect(g).connect(dest || this.sfx);
    if (rev) { const r = c.createGain(); r.gain.value = rev; g.connect(r).connect(this.revSend); }
    s.start(t, Math.random());
    s.stop(t + attack + dur + 0.05);
  }

  // ---------- one-shots ----------
  play(name, opts = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case 'sfx_relic_ignite':
        this._noise(t, 0.6, { gain: 0.5, f0: 300, f1: 3200, q: 0.8, attack: 0.02 });
        this._noise(t + 0.05, 1.2, { gain: 0.25, type: 'lowpass', f0: 900, f1: 200, buf: this.brown, attack: 0.05 });
        this._tone(70, t, 0.7, { type: 'sine', gain: 0.5, glideTo: 40, rev: 0.2 });
        this._tone(220, t + 0.05, 1.4, { type: 'triangle', gain: 0.08, attack: 0.15, rev: 0.6 });
        this._tone(330, t + 0.12, 1.4, { type: 'triangle', gain: 0.06, attack: 0.2, rev: 0.6 });
        break;
      case 'sfx_shadow_align': {
        const notes = [440, 659.25, 880, 1108.7, 1318.5];
        notes.forEach((f, i) => this._tone(f, t + i * 0.055, 2.6, { type: 'sine', gain: 0.12 - i * 0.012, rev: 0.8 }));
        this._tone(220, t, 2.5, { type: 'triangle', gain: 0.1, rev: 0.6 });
        this._noise(t, 1.5, { gain: 0.06, type: 'highpass', f0: 5000, rev: 0.6, attack: 0.3 });
        break;
      }
      case 'sfx_bridge_form': {
        this._noise(t, 1.3, { gain: 0.45, type: 'lowpass', f0: 380, f1: 120, buf: this.brown, attack: 0.08, rev: 0.4 });
        const n = opts.count || 6;
        for (let i = 0; i < n; i++) {
          const tt = t + 0.08 + i * 0.05 + 0.25;
          this._tone(95 - i * 4, tt, 0.18, { type: 'sine', gain: 0.35, rev: 0.3 });
          this._noise(tt, 0.06, { gain: 0.25, f0: 1400, q: 2, rev: 0.2 });
        }
        break;
      }
      case 'sfx_bridge_warning':
        this._tone(880, t, 0.12, { type: 'square', gain: 0.05, rev: 0.4 });
        this._tone(660, t + 0.16, 0.18, { type: 'square', gain: 0.05, rev: 0.4 });
        break;
      case 'tick':
        this._tone(1320, t, 0.05, { type: 'triangle', gain: 0.06, rev: 0.2 });
        break;
      case 'sfx_bridge_fade':
        this._noise(t, 0.9, { gain: 0.3, type: 'lowpass', f0: 600, f1: 80, buf: this.brown, attack: 0.02 });
        this._tone(196, t, 0.8, { type: 'triangle', gain: 0.08, glideTo: 98, rev: 0.6 });
        break;
      case 'sfx_ember_collect': {
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this._tone(f, t + i * 0.07, 0.9, { type: 'triangle', gain: 0.1, rev: 0.7 }));
        this._noise(t, 0.8, { gain: 0.08, type: 'highpass', f0: 6000, rev: 0.5 });
        break;
      }
      case 'sfx_heart_ignite': {
        const c = this.ctx;
        const chord = [73.42, 110, 146.83, 220, 293.66, 369.99, 440];
        chord.forEach((f, i) => {
          const o = c.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = (Math.random() - 0.5) * 12;
          const flt = c.createBiquadFilter();
          flt.type = 'lowpass';
          flt.frequency.setValueAtTime(150, t);
          flt.frequency.exponentialRampToValueAtTime(3500, t + 2.2);
          const g = c.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.05, t + 1.6);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 6.5);
          o.connect(flt).connect(g);
          g.connect(this.sfx);
          const r = c.createGain(); r.gain.value = 0.7; g.connect(r).connect(this.revSend);
          o.start(t + i * 0.04); o.stop(t + 7);
        });
        this._tone(55, t, 2.0, { type: 'sine', gain: 0.5, glideTo: 36, rev: 0.4 });
        this._noise(t, 2.5, { gain: 0.3, f0: 200, f1: 4000, q: 0.6, attack: 1.2, rev: 0.5 });
        break;
      }
      case 'sfx_ui_click':
        this._tone(1400, t, 0.04, { type: 'triangle', gain: 0.06, rev: 0.1 });
        break;
      case 'sfx_no_memory':
        this._tone(180, t, 0.35, { type: 'triangle', gain: 0.12, glideTo: 120, rev: 0.4 });
        break;
      case 'sfx_collar_stop':
        this._tone(110, t, 0.12, { type: 'sine', gain: 0.25, rev: 0.2 });
        this._noise(t, 0.05, { gain: 0.15, f0: 900, q: 3, rev: 0.1 });
        break;
      case 'sfx_jolt':
        this._noise(t, 1.0, { gain: 0.35, f0: 2000, f1: 300, q: 1.2, attack: 0.02, rev: 0.5 });
        this._tone(160, t, 1.0, { type: 'sawtooth', gain: 0.05, glideTo: 60, rev: 0.5 });
        break;
      case 'sfx_fall':
        this._noise(t, 0.7, { gain: 0.2, f0: 1500, f1: 200, q: 1, rev: 0.5 });
        break;
      case 'step':
        this._noise(t, 0.07, { gain: 0.07 + Math.random() * 0.03, type: 'lowpass', f0: 500 + Math.random() * 300, rev: 0.25 });
        break;
      case 'sfx_door':
        this._noise(t, 2.2, { gain: 0.35, type: 'lowpass', f0: 260, f1: 140, buf: this.brown, attack: 0.3, rev: 0.5 });
        break;
      case 'whoosh':
        this._noise(t, 1.2, { gain: 0.15, f0: 300, f1: 2400, q: 0.7, attack: 0.6, rev: 0.6 });
        break;
      default: break;
    }
  }

  // ---------- loops ----------
  _startAmbience() {
    const c = this.ctx;
    // amb_temple_wind: brown noise through an LFO-swept lowpass
    const s = c.createBufferSource(); s.buffer = this.brown; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.7;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.06;
    const lfoG = c.createGain(); lfoG.gain.value = 260;
    lfo.connect(lfoG).connect(f.frequency);
    const g = c.createGain(); g.gain.value = 0.32;
    s.connect(f).connect(g).connect(this.amb);
    s.start(); lfo.start();
    // temple drone pad; warms as embers return
    this.drone = [];
    const droneG = c.createGain(); droneG.gain.value = 0.0;
    const droneF = c.createBiquadFilter(); droneF.type = 'lowpass'; droneF.frequency.value = 380;
    droneF.connect(droneG).connect(this.amb);
    const r = c.createGain(); r.gain.value = 0.5; droneG.connect(r).connect(this.revSend);
    [55, 82.41, 110.0, 164.81].forEach((fr, i) => {
      const o = c.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = fr; o.detune.value = (i - 1.5) * 4;
      o.connect(droneF); o.start(); this.drone.push(o);
    });
    this.droneGain = droneG; this.droneFilter = droneF;
    droneG.gain.setTargetAtTime(0.09, c.currentTime, 3);
  }

  setWarmth(level) { // 0..3 embers
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.droneFilter.frequency.setTargetAtTime(380 + level * 260, t, 1.5);
    this.droneGain.gain.setTargetAtTime(0.09 + level * 0.025, t, 1.5);
  }

  startLoop(name) {
    if (!this.ready || this.loops[name]) return;
    const c = this.ctx;
    const t = c.currentTime;
    if (name === 'amb_fire_crackle') {
      const s = c.createBufferSource(); s.buffer = this.crackleBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 500;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.6);
      s.connect(f).connect(g).connect(this.amb);
      s.start();
      this.loops[name] = { stop: (tt) => { g.gain.setTargetAtTime(0.0001, tt, 0.15); s.stop(tt + 0.8); } };
    } else if (name === 'sfx_time_rewind') {
      // reversed-whoosh texture + falling detuned tones with tremolo
      const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.5; f.frequency.value = 1200;
      const lfo = c.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 2.2;
      const lfoG = c.createGain(); lfoG.gain.value = -800; lfo.connect(lfoG).connect(f.frequency);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.12);
      s.connect(f).connect(g).connect(this.sfx);
      const rv = c.createGain(); rv.gain.value = 0.6; g.connect(rv).connect(this.revSend);
      const o1 = c.createOscillator(); o1.type = 'triangle'; o1.frequency.value = 440;
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 659;
      const pitchLfo = c.createOscillator(); pitchLfo.type = 'sawtooth'; pitchLfo.frequency.value = 2.2;
      const pg = c.createGain(); pg.gain.value = 120; pitchLfo.connect(pg); pg.connect(o1.frequency); pg.connect(o2.frequency);
      const og = c.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.05, t + 0.12);
      o1.connect(og); o2.connect(og); og.connect(this.sfx); og.connect(rv);
      [s, lfo, o1, o2, pitchLfo].forEach((n) => n.start());
      this.loops[name] = { stop: (tt) => { g.gain.setTargetAtTime(0.0001, tt, 0.06); og.gain.setTargetAtTime(0.0001, tt, 0.06); [s, lfo, o1, o2, pitchLfo].forEach((n) => n.stop(tt + 0.5)); } };
    } else if (name === 'near_tone') {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 329.63;
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 493.88;
      const g = c.createGain(); g.gain.value = 0.0001;
      o.connect(g); o2.connect(g); g.connect(this.sfx);
      const rv = c.createGain(); rv.gain.value = 0.6; g.connect(rv).connect(this.revSend);
      o.start(); o2.start();
      this.loops[name] = { gain: g, stop: (tt) => { g.gain.setTargetAtTime(0.0001, tt, 0.1); o.stop(tt + 0.6); o2.stop(tt + 0.6); } };
    }
  }

  setLoopLevel(name, v) {
    const l = this.loops[name];
    if (l && l.gain) l.gain.gain.setTargetAtTime(Math.max(0.0001, v), this.ctx.currentTime, 0.08);
  }

  stopLoop(name) {
    const l = this.loops[name];
    if (!l) return;
    l.stop(this.ctx.currentTime);
    delete this.loops[name];
  }

  stopAllLoops() { Object.keys(this.loops).forEach((k) => this.stopLoop(k)); }
}
