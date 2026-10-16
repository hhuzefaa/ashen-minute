import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS, stoneMaterial } from '../game/Palette.js';
import { runeTexture, emblemTexture } from './Glyphs.js';
import { LightSource } from '../game/LightPool.js';

// OBJ_Target_Rune: a floor sigil where a shadow must land, plus an optional standing stele so the
// target reads from a low third-person camera.
// Visual states: dormant → lit relic nearby (pulse, brighter as the shadow nears) → solved (gold).
// Extra feedback: reject() flashes red (wrong sign), sweep() blinks when a shadow passes over it.
const RED = new THREE.Color(0xff3a2a);
let steleMat = null;

export class TargetRune {
  constructor(position, facingYaw, { stele = true, emblem = null, color = COLORS.target, size = 1.9 } = {}) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.time = 0;
    this.solvedFlash = 0;
    this.rejectT = 0;
    this.sweepT = 0;
    this.baseColor = new THREE.Color(color);
    const tex = emblem ? emblemTexture(emblem) : runeTexture('target', 3);

    this.floorMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: this.baseColor.clone(), opacity: 0.25, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.04;
    floor.renderOrder = 3;
    this.group.add(floor);

    this.steleHolder = new THREE.Group();
    this.steleHolder.rotation.y = facingYaw;
    this.group.add(this.steleHolder);
    this.steleMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: this.baseColor.clone().multiplyScalar(0.4), toneMapped: false });
    if (stele) {
      if (!steleMat) steleMat = stoneMaterial(0x45455a);
      this.stele = new THREE.Group();
      const slab = new THREE.Mesh(new RoundedBoxGeometry(0.95, 2.0, 0.32, 1, 0.06), steleMat);
      slab.position.y = 1.0;
      slab.castShadow = true;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.45, 4), steleMat);
      cap.position.y = 2.2; cap.rotation.y = Math.PI / 4; cap.scale.set(1, 1, 0.45);
      const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.78), this.steleMat);
      glyph.position.set(0, 1.25, 0.17);
      this.stele.add(slab, cap, glyph);
      this.stele.position.set(0, 0, -1.25);
      this.steleHolder.add(this.stele);
    }

    this.ringMat = new THREE.MeshBasicMaterial({ color: this.baseColor.clone().multiplyScalar(2), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 40), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.group.add(this.ring);

    this.light = new LightSource(color, 0, 5, 2);
    this.light.position.set(0, 0.8, 0);
    this.group.add(this.light);
  }

  addCollider(world) {
    if (!this.stele) return;
    const p = new THREE.Vector3();
    this.group.updateMatrixWorld(true);
    this.stele.getWorldPosition(p);
    world.add({ cx: p.x, cy: p.y + 1.1, cz: p.z, hx: 0.5, hy: 1.1, hz: 0.2, yaw: this.steleHolder.rotation.y, tag: 'wall' });
  }

  flash() { this.solvedFlash = 1; this.ringMat.color.copy(this.baseColor).multiplyScalar(2); }
  reject() { this.rejectT = 1; this.solvedFlash = 1; this.ringMat.color.copy(RED).multiplyScalar(2); }
  sweep() { this.sweepT = 1; }

  /** lit: any relic that can reach it is burning; alignment 0..1; solved: rune is satisfied */
  update(dt, { lit, alignment, solved }) {
    this.time += dt;
    const base = !lit ? 0.16 : solved ? 1 : 0.35 + alignment * 0.5;
    const pulse = lit && !solved ? 0.5 + 0.5 * Math.sin(this.time * (3 + alignment * 9)) : 1;
    let glow = base * (0.75 + 0.25 * pulse);
    if (this.sweepT > 0) { this.sweepT = Math.max(0, this.sweepT - dt * 2.5); glow += this.sweepT * 1.2; }
    this.floorMat.opacity = Math.min(1, 0.2 + glow);
    const col = this.rejectT > 0 ? RED : this.baseColor;
    this.floorMat.color.copy(col).multiplyScalar(0.6 + glow * 1.8);
    this.steleMat.color.copy(col).multiplyScalar(0.25 + glow * 2.2);
    this.light.intensity = lit || this.sweepT > 0 ? glow * 3 : 0;
    if (this.rejectT > 0) this.rejectT = Math.max(0, this.rejectT - dt * 1.5);
    if (this.solvedFlash > 0) {
      this.solvedFlash = Math.max(0, this.solvedFlash - dt * 1.1);
      this.ring.scale.setScalar(1 + (1 - this.solvedFlash) * 4);
      this.ringMat.opacity = this.solvedFlash;
    }
    this.ring.visible = this.solvedFlash > 0;
  }
}
