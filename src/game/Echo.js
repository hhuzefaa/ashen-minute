import * as THREE from 'three';
import { COLORS } from './Palette.js';
import { LightSource } from './LightPool.js';
import { Keeper } from '../objects/Keeper.js';

// Rule 5 — Ilen can mark a minute. Her echo walks that minute again carrying its own fire,
// holds the light for a while, then crumbles to ash. Echo lanterns are lights (ShadowSystem).
// Marrow's echo (Room III) is the same ghost driven by a looping waypoint path.
export const ECHO = Object.freeze({
  RATE: 30,          // samples per second
  MAX_SEC: 8,        // longest minute you can mark
  MIN_SEC: 0.5,      // shorter recordings are cancelled
  HOLD: 12,          // s an echo holds its last pose with the lantern raised
  WARN: 3,           // s of flicker before it crumbles
  STRIDE: 5,         // x, y, z, facing, speed
});
const CAP = ECHO.RATE * ECHO.MAX_SEC;

let ghostMat = null, marrowMat = null;
function ghostMaterial(marrow) {
  if (!ghostMat) {
    ghostMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.time).multiplyScalar(1.1), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    marrowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc8f4ff).multiplyScalar(0.9), transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  }
  return marrow ? marrowMat : ghostMat;
}

/** A ghost Keeper: no collision, additive cyan body, a LightSource lantern (no real light). */
export class Ghost {
  constructor(scene, { marrow = false } = {}) {
    this.keeper = new Keeper();
    const k = this.keeper;
    const mat = ghostMaterial(marrow);
    k.group.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; } });
    k.lanternPivot.remove(k.lanternLight);       // no extra real light: shader cost stays fixed
    k.lanternLight = { intensity: 0 };
    if (marrow) k.group.scale.setScalar(0.94);
    this.light = new LightSource(marrow ? 0xc8f4ff : 0xbff6ff, 0, 9, 1.4);
    this.light.position.y = -0.24;
    k.lanternPivot.add(this.light);
    k.group.visible = false;
    scene.add(k.group);
    this.lightRec = { id: '', kind: marrow ? 'marrow' : 'echo', pos: new THREE.Vector3() };
    this.alpha = 0;
  }

  place(x, y, z, facing) {
    const g = this.keeper.group;
    g.position.set(x, y, z);
    g.rotation.y = facing;
  }

  lanternPos() { this.keeper.group.updateMatrixWorld(true); return this.keeper.lanternCore.getWorldPosition(this.lightRec.pos); }
}

export class EchoSystem {
  constructor(game) {
    this.game = game;
    this.ghosts = [new Ghost(game.scene), new Ghost(game.scene)];
    this.echoes = [];                  // live player echoes
    this.rec = null;                   // recording in progress
    this.bufs = [new Float32Array(CAP * ECHO.STRIDE), new Float32Array(CAP * ECHO.STRIDE), new Float32Array(CAP * ECHO.STRIDE)];
    this.nextId = 1;
    this.made = 0;                     // echoes released this run (victory stats)
    this.sigil = this.makeSigil();
    game.scene.add(this.sigil);
    this.marrow = null;                // scripted Marrow echo (Room III)
    this._v = new THREE.Vector3();
  }

  makeSigil() {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.time).multiplyScalar(1.6), transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 32).rotateX(-Math.PI / 2), m);
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 3).rotateX(-Math.PI / 2), m);
    g.add(ring, inner);
    g.position.y = 0.05;
    g.visible = false;
    g.userData.mat = m;
    return g;
  }

  get level() { return this.game.world.activePuzzle?.level; }
  get maxEchoes() { return this.level?.maxEchoes ?? 1; }
  get permanent() { return !!this.level?.echoPermanent; }
  get recording() { return !!this.rec; }
  get canUse() { return !!this.game.world.progress.data.abilities?.echo; }

  /** R: start a recording, or release the one in progress. */
  press() {
    if (!this.canUse) return;
    if (this.rec) { this.release(); return; }
    // one at a time (two in the finale): R dismisses the oldest echo when at the limit
    const live = this.echoes.filter((e) => e.state !== 'crumble');
    if (live.length >= this.maxEchoes) this.crumble(live[0]);
    const buf = this.bufs.find((b) => !this.echoes.some((e) => e.buf === b));
    const p = this.game.player;
    this.rec = { buf, n: 0, acc: 0, t: 0 };
    this.sample();
    this.sigil.position.set(p.pos.x, p.pos.y + 0.05, p.pos.z);
    this.sigil.visible = true;
    this.game.audio.play('sfx_echo_mark');
  }

  sample() {
    const r = this.rec, p = this.game.player;
    if (r.n >= CAP) return;
    const o = r.n * ECHO.STRIDE;
    r.buf[o] = p.pos.x; r.buf[o + 1] = p.pos.y; r.buf[o + 2] = p.pos.z; r.buf[o + 3] = p.facing; r.buf[o + 4] = p.horizontalSpeed;
    r.n++;
  }

  cancelRecording() {
    if (!this.rec) return;
    this.rec = null;
    this.sigil.visible = false;
  }

  release() {
    const r = this.rec;
    this.rec = null;
    this.sigil.visible = false;
    if (!r || r.n / ECHO.RATE < ECHO.MIN_SEC) { this.game.audio.play('sfx_no_memory'); return; }
    const ghost = this.ghosts.find((g) => !this.echoes.some((e) => e.ghost === g));
    if (!ghost) return;
    const e = { id: 'echo:' + this.nextId++, ghost, buf: r.buf, n: r.n, t: 0, state: 'replay', holdT: 0, permanent: this.permanent, warned: false };
    ghost.lightRec.id = e.id;
    ghost.keeper.group.visible = true;
    ghost.alpha = 0;
    this.echoes.push(e);
    this.game.shadows.extraLights.push(ghost.lightRec);
    this.made++;
    this.pose(e, 0);
    this.game.audio.play('sfx_echo_release');
    const fx = this.game.effects, gp = ghost.keeper.group.position;
    fx.burst(this._v.set(gp.x, gp.y + 1, gp.z), 30, fx.c.time, 2, 0.1, 0.9, fx.time);
    this.game.onEchoReleased?.(e);
  }

  pose(e, dt) {
    const f = Math.min(e.t * ECHO.RATE, e.n - 1);
    const i = Math.floor(f), j = Math.min(i + 1, e.n - 1), k = f - i;
    const b = e.buf, oi = i * ECHO.STRIDE, oj = j * ECHO.STRIDE;
    const x = b[oi] + (b[oj] - b[oi]) * k, y = b[oi + 1] + (b[oj + 1] - b[oi + 1]) * k, z = b[oi + 2] + (b[oj + 2] - b[oi + 2]) * k;
    const d = Math.atan2(Math.sin(b[oj + 3] - b[oi + 3]), Math.cos(b[oj + 3] - b[oi + 3]));
    e.ghost.place(x, y, z, b[oi + 3] + d * k);
    const kp = e.ghost.keeper;
    kp.animate(dt, e.state === 'replay' ? b[oi + 4] : 0, true);
    if (e.state === 'hold') kp.lanternPivot.rotation.x = 2.6; // lantern raised: "I'll hold the light"
    e.ghost.lanternPos();
  }

  crumble(e) {
    if (e.state === 'crumble') return;
    e.state = 'crumble';
    const g = e.ghost;
    const fx = this.game.effects, gp = g.keeper.group.position;
    fx.burst(this._v.set(gp.x, gp.y + 0.9, gp.z), 80, fx.c.ash, 2.2, 0.12, 1.6, fx.ash);
    this.game.audio.play('sfx_echo_crumble');
    g.keeper.group.visible = false;
    g.light.intensity = 0;
    const L = this.game.shadows.extraLights;
    const i = L.indexOf(g.lightRec);
    if (i >= 0) L.splice(i, 1);
    this.echoes.splice(this.echoes.indexOf(e), 1);
  }

  /** Backspace / new game: every echo gone, no recording. */
  clear(keepPermanent = false) {
    this.cancelRecording();
    for (const e of [...this.echoes]) if (!(keepPermanent && e.permanent)) this.crumble(e);
  }

  update(dt) {
    const r = this.rec;
    if (r) {
      r.t += dt;
      r.acc += dt;
      while (r.acc >= 1 / ECHO.RATE) { r.acc -= 1 / ECHO.RATE; this.sample(); }
      this.sigil.userData.mat.opacity = 0.55 + 0.3 * Math.sin(this.game.time * 8);
      if (r.t >= ECHO.MAX_SEC) this.release();
    }
    for (let i = this.echoes.length - 1; i >= 0; i--) {
      const e = this.echoes[i];
      const g = e.ghost;
      g.alpha = Math.min(1, g.alpha + dt * 3);
      if (e.state === 'replay') {
        e.t += dt;
        if (e.t * ECHO.RATE >= e.n - 1) { e.state = 'hold'; e.holdT = 0; }
      } else if (e.state === 'hold' && !e.permanent) {
        e.holdT += dt;
        const left = ECHO.HOLD - e.holdT;
        if (left <= ECHO.WARN && !e.warned) { e.warned = true; this.game.audio.play('sfx_bridge_warning'); }
        if (left <= 0) { this.crumble(e); continue; }
      }
      this.pose(e, dt);
      const left = e.state === 'hold' && !e.permanent ? ECHO.HOLD - e.holdT : 99;
      const flick = left < ECHO.WARN ? 0.35 + 0.65 * Math.abs(Math.sin(this.game.time * 18)) : 1;
      g.keeper.group.visible = flick > 0.45 || left > ECHO.WARN;
      g.light.intensity = 4 * g.alpha * flick;
    }
    this.marrow?.update(dt);
  }

  /** For the HUD ring: { label, t, max, warn } or null. */
  get hud() {
    if (this.rec) return { label: 'MINUTE', t: ECHO.MAX_SEC - this.rec.t, max: ECHO.MAX_SEC, warn: ECHO.MAX_SEC - this.rec.t < 2 };
    const e = this.echoes.find((x) => x.state !== 'crumble' && !x.permanent);
    if (!e) return null;
    if (e.state === 'replay') return { label: 'ECHO', t: ECHO.HOLD, max: ECHO.HOLD, warn: false };
    const left = ECHO.HOLD - e.holdT;
    return { label: 'ECHO', t: left, max: ECHO.HOLD, warn: left <= ECHO.WARN };
  }

  get alive() { return this.echoes.length > 0 || !!this.marrow?.active; }
}

/** Marrow's echo: walks a looping waypoint path forever ([{ x, z, wait }]), lantern is a light. */
export class MarrowEcho {
  constructor(game, path, { speed = 1.6 } = {}) {
    this.game = game;
    this.ghost = new Ghost(game.scene, { marrow: true });
    this.ghost.lightRec.id = 'marrow';
    this.path = path;
    this.speed = speed;
    this.seg = 0;      // index of the waypoint we are leaving
    this.u = 0;        // metres travelled along the current segment
    this.wait = path[0].wait || 0;
    this.active = false;
    this.facing = 0;
    this.stepAcc = 0;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.ghost.keeper.group.visible = true;
    this.ghost.light.intensity = 4;
    this.game.shadows.extraLights.push(this.ghost.lightRec);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.ghost.keeper.group.visible = false;
    this.ghost.light.intensity = 0;
    const L = this.game.shadows.extraLights;
    const i = L.indexOf(this.ghost.lightRec);
    if (i >= 0) L.splice(i, 1);
  }

  /** Advance the patrol by dt (also used by the light map to simulate a loop). */
  advance(dt) {
    const P = this.path;
    let moving = 0;
    while (dt > 0) {
      if (this.wait > 0) { const w = Math.min(this.wait, dt); this.wait -= w; dt -= w; continue; }
      const a = P[this.seg], b = P[(this.seg + 1) % P.length];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const step = Math.min(L - this.u, this.speed * dt);
      this.u += step; dt -= step / this.speed; moving = this.speed;
      this.facing = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      if (this.u >= L - 1e-6) { this.seg = (this.seg + 1) % P.length; this.u = 0; this.wait = P[this.seg].wait || 0; }
      if (step <= 0 && this.wait <= 0 && L < 1e-6) break;
    }
    return moving;
  }

  position(out) {
    const P = this.path, a = P[this.seg], b = P[(this.seg + 1) % P.length];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const k = this.u / L;
    return out.set(a.x + (b.x - a.x) * k, 0, a.z + (b.z - a.z) * k);
  }

  reset() { this.seg = 0; this.u = 0; this.wait = this.path[0].wait || 0; }

  update(dt) {
    if (!this.active) return;
    const moving = this.advance(dt);
    const p = this.position(this.ghost.keeper.group.position);
    this.ghost.place(p.x, 0, p.z, this.facing);
    this.ghost.keeper.animate(dt, moving ? this.speed : 0, true);
    if (!moving) this.ghost.keeper.lanternPivot.rotation.x = 2.6;
    this.ghost.lanternPos();
    // her footsteps: quieter, only when near
    if (moving) {
      this.stepAcc += dt;
      const d = this.game.player.pos.distanceTo(p);
      if (this.stepAcc > 0.42 && d < 14) { this.stepAcc = 0; this.game.audio.play('step', { gain: 0.35 }); }
    }
  }
}
