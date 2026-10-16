import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS, stoneMaterial } from '../game/Palette.js';

// ENV_Bridge_Slab_A / _Cracked assembled into a predefined bridge (doc §4.4).
// The collider is authoritative for walking and is only enabled once the slabs are fully in place.
// States: HIDDEN → APPEARING → ACTIVE → (WARNING) → FADING → HIDDEN.
export const BRIDGE = { HIDDEN: 'HIDDEN', APPEARING: 'APPEARING', ACTIVE: 'ACTIVE', WARNING: 'WARNING', FADING: 'FADING' };

const APPEAR_TIME = 0.4;
const STAGGER = 0.05;
const FADE_TIME = 0.5;
const WIDTH = 2.0;
const THICK = 0.42;

export class ShadowBridge {
  constructor(start, end, world) {
    this.start = start.clone();
    this.end = end.clone();
    const dir = end.clone().sub(start);
    this.length = Math.hypot(dir.x, dir.z);
    this.yaw = Math.atan2(-dir.x, -dir.z); // slabs run along local -Z
    this.group = new THREE.Group();
    this.group.position.set((start.x + end.x) / 2, start.y || 0, (start.z + end.z) / 2);
    this.group.rotation.y = this.yaw;
    this.state = BRIDGE.HIDDEN;
    this.t = 0;
    this.time = 0;
    this.outlineOn = false;

    const n = Math.max(3, Math.round(this.length / 0.9));
    const segLen = this.length / n;
    this.slabs = [];
    for (let i = 0; i < n; i++) {
      const cracked = i % 3 === 1;
      const mat = stoneMaterial(cracked ? 0x4a4555 : 0x5a5466, { transparent: true, opacity: 0, emissive: new THREE.Color(0xff7a2a), emissiveIntensity: 0.22 });
      const geo = new RoundedBoxGeometry(WIDTH, THICK, segLen - 0.05, 1, 0.05);
      if (cracked) {
        // ENV_Bridge_Slab_Cracked: visual variant only (same collision)
        const p = geo.attributes.position;
        for (let k = 0; k < p.count; k++) if (p.getY(k) < 0) p.setY(k, p.getY(k) - Math.abs(Math.sin(p.getX(k) * 7 + p.getZ(k) * 3)) * 0.08);
        geo.computeVertexNormals();
      }
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      m.castShadow = true;
      m.visible = false;
      const z = this.length / 2 - (i + 0.5) * segLen;
      m.userData.restY = -THICK / 2;
      m.userData.z = z;
      m.position.set(0, -THICK / 2 - 1.5, z);
      this.group.add(m);
      this.slabs.push(m);
    }

    // VFX_Bridge_Seam: glowing edges along both sides
    this.seamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.fire).multiplyScalar(2), transparent: true, opacity: 0, toneMapped: false });
    for (const sx of [-WIDTH / 2, WIDTH / 2]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, this.length), this.seamMat);
      seam.position.set(sx, 0.005, 0);
      this.group.add(seam);
    }

    for (let i = 1; i < n; i++) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(WIDTH - 0.1, 0.03, 0.035), this.seamMat);
      cross.position.set(0, 0.004, this.length / 2 - i * segLen);
      this.group.add(cross);
    }

    // faint outline of the possible path while hidden
    const hw = WIDTH / 2, hl = this.length / 2;
    const outline = [new THREE.Vector3(-hw, 0.03, hl), new THREE.Vector3(-hw, 0.03, -hl), new THREE.Vector3(hw, 0.03, -hl), new THREE.Vector3(hw, 0.03, hl)];
    this.outlineMat = new THREE.LineDashedMaterial({ color: new THREE.Color(COLORS.fire).multiplyScalar(0.9), dashSize: 0.3, gapSize: 0.22, transparent: true, opacity: 0, toneMapped: false });
    this.outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outline), this.outlineMat);
    this.outline.computeLineDistances();
    this.group.add(this.outline);

    this.collider = world.add({
      cx: this.group.position.x, cy: this.group.position.y - THICK / 2, cz: this.group.position.z,
      hx: WIDTH / 2, hy: THICK / 2, hz: this.length / 2 + 0.05, yaw: this.yaw, tag: 'bridge', enabled: false,
    });
  }

  get walkable() { return this.collider.enabled; }
  get isVisible() { return this.state !== BRIDGE.HIDDEN; }

  appear() {
    if (this.state === BRIDGE.APPEARING || this.state === BRIDGE.ACTIVE || this.state === BRIDGE.WARNING) return;
    this.state = BRIDGE.APPEARING;
    this.t = 0;
    for (const s of this.slabs) { s.visible = true; s.material.transparent = true; }
  }

  fade() {
    if (this.state === BRIDGE.HIDDEN || this.state === BRIDGE.FADING) return;
    this.state = BRIDGE.FADING;
    this.t = 0;
    this.collider.enabled = false; // never walkable while fading
    for (const s of this.slabs) s.material.transparent = true;
  }

  setWarning(on) {
    if (on && this.state === BRIDGE.ACTIVE) this.state = BRIDGE.WARNING;
    if (!on && this.state === BRIDGE.WARNING) this.state = BRIDGE.ACTIVE;
  }

  /** Formed at once (loading a save / restarting the Unmaking). */
  showImmediate() {
    this.state = BRIDGE.ACTIVE;
    this.t = 0;
    for (const s of this.slabs) { s.visible = true; s.material.opacity = 1; s.material.transparent = false; s.position.y = s.userData.restY; }
    this.seamMat.opacity = 1;
    this._setCollider(this.slabs.length);
    this.collider.enabled = true;
  }

  /** The Unmaking: slabs crumble one by one from the END (`rate` slabs/s); the walkable part shrinks with them. */
  dissolve(rate = 1.2) {
    if (this.state === BRIDGE.HIDDEN) return;
    this.state = 'DISSOLVING';
    this.t = 0;
    this.dRate = rate;
    for (const s of this.slabs) s.material.transparent = true;
  }

  _setCollider(k) {
    const n = this.slabs.length, seg = this.length / n;
    const c = this.collider;
    if (k <= 0) { c.enabled = false; return; }
    const lz = this.length / 2 - (k * seg) / 2; // local centre of the remaining slabs (start side)
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    c.cx = this.group.position.x + lz * sn; c.cz = this.group.position.z + lz * cs;
    c.hz = (k * seg) / 2 + 0.05;
  }

  hideImmediate() {
    this.state = BRIDGE.HIDDEN;
    this.collider.enabled = false;
    for (const s of this.slabs) {
      s.visible = false;
      s.material.opacity = 0;
      s.position.y = s.userData.restY - 1.5;
    }
    this.seamMat.opacity = 0;
  }

  update(dt) {
    this.time += dt;
    this.t += dt;
    const n = this.slabs.length;
    if (this.state === BRIDGE.APPEARING) {
      let done = true;
      this.slabs.forEach((s, i) => {
        const local = Math.min(1, Math.max(0, (this.t - i * STAGGER) / APPEAR_TIME));
        if (local < 1) done = false;
        const e = 1 - Math.pow(1 - local, 3);
        s.position.y = s.userData.restY - 1.5 * (1 - e);
        s.material.opacity = e;
      });
      this.seamMat.opacity = Math.min(1, this.t / (APPEAR_TIME + n * STAGGER));
      if (done) {
        this.state = BRIDGE.ACTIVE;
        for (const s of this.slabs) { s.material.opacity = 1; s.material.transparent = false; s.position.y = s.userData.restY; }
        this.collider.enabled = true; // only now is it safe to step on
      }
    } else if (this.state === BRIDGE.FADING) {
      const f = Math.min(1, this.t / FADE_TIME);
      this.slabs.forEach((s) => { s.material.opacity = 1 - f; s.position.y = s.userData.restY - f * 0.6; });
      this.seamMat.opacity = 1 - f;
      if (f >= 1) this.hideImmediate();
    } else if (this.state === 'DISSOLVING') {
      const gone = this.t * this.dRate;
      for (let i = 0; i < n; i++) {
        const rank = n - 1 - i; // the end slab goes first
        const s = this.slabs[i];
        const f = Math.min(1, Math.max(0, gone - rank));
        s.material.opacity = 1 - f;
        s.position.y = s.userData.restY - f * 2.5 + (f === 0 && gone > rank - 1 ? Math.sin(this.time * 40) * 0.02 : 0);
        s.visible = f < 1;
      }
      this._setCollider(n - Math.min(n, Math.floor(gone + 0.25)));
      this.seamMat.opacity = Math.max(0, 1 - gone / n);
      if (gone >= n + 1) this.hideImmediate();
    } else if (this.state === BRIDGE.ACTIVE || this.state === BRIDGE.WARNING) {
      const warn = this.state === BRIDGE.WARNING;
      const p = warn ? 0.5 + 0.5 * Math.sin(this.time * 14) : 0.85 + 0.15 * Math.sin(this.time * 2.5);
      this.seamMat.color.set(warn ? 0xff4a20 : COLORS.fire).multiplyScalar(1 + p * 1.6);
      this.seamMat.opacity = warn ? 0.4 + 0.6 * p : 1;
    }
    const outlineTarget = this.outlineOn && this.state === BRIDGE.HIDDEN ? 0.35 + 0.15 * Math.sin(this.time * 2) : 0;
    this.outlineMat.opacity += (outlineTarget - this.outlineMat.opacity) * Math.min(1, dt * 4);
    this.outline.visible = this.outlineMat.opacity > 0.004;
    this.group.visible = this.state !== BRIDGE.HIDDEN || this.outline.visible;
  }
}
