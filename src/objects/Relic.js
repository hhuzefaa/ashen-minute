import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS, stoneMaterial } from '../game/Palette.js';
import { LightSource } from '../game/LightPool.js';
import { emblemTexture } from './Glyphs.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergeGroup } from './Environment.js';

let TICKS = null, TICK_MAT = null;

// A gnomon stone: a floating sundial on a pedestal — a stone ring, an upright gnomon blade and a
// dark ember core. It never turns; every fire near it casts its shadow (ShadowSystem). The core
// glows gold while one of its shadows rests on a rune that knows it.
// Yaw convention = Three.js rotation.y; forward (gnomon direction) = (-sin yaw, 0, -cos yaw).
export class Relic {
  constructor({ position, pedestalHeight = 0.95, startYaw = 0, emblem = null }) {
    this.group = new THREE.Group();
    this.group.name = 'Relic';
    this.base = new THREE.Vector3(position.x, position.y || 0, position.z);
    this.pedestalHeight = pedestalHeight;
    this.group.position.copy(this.base);
    this.base = this.group.position;
    this.yaw = startYaw;
    this.litAmount = 0;
    this.time = 0;
    this.glow = 0;

    // --- pedestal ---
    const ped = new THREE.Group();
    const stone = stoneMaterial(0x4a4a5e);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.78, 0.22, 8), stone);
    foot.position.y = 0.11;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.46, pedestalHeight - 0.42, 8), stone);
    shaft.position.y = 0.22 + (pedestalHeight - 0.42) / 2;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.2, 8), stone);
    top.position.y = pedestalHeight - 0.1;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.035, 4, 16), stoneMaterial(0x2a2a34));
    band.rotation.x = Math.PI / 2;
    band.position.y = pedestalHeight * 0.55;
    ped.add(foot, shaft, top, band);
    const pedMerged = mergeGroup(ped, stone);
    this.group.add(pedMerged);
    if (emblem) {
      // the relic's sign, carved on four faces of the shaft (matches gate keystones)
      const em = new THREE.MeshBasicMaterial({ map: emblemTexture(emblem), transparent: true, depthWrite: false, color: new THREE.Color(COLORS.target).multiplyScalar(1.1), toneMapped: false });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), em);
        pl.position.set(Math.sin(a) * 0.43, pedestalHeight * 0.56, Math.cos(a) * 0.43);
        pl.rotation.y = a;
        this.group.add(pl);
      }
    }

    // dial tick marks on the pedestal top (time/sundial motif)
    if (!TICKS) {
      const parts = [];
      for (let i = 0; i < 12; i++) {
        const g = new THREE.BoxGeometry(0.04, 0.012, i % 3 ? 0.08 : 0.14);
        const a = (i / 12) * Math.PI * 2;
        g.applyMatrix4(new THREE.Matrix4().makeRotationY(a).setPosition(Math.sin(a) * 0.53, 0.006, Math.cos(a) * 0.53));
        parts.push(g);
      }
      TICKS = mergeGeometries(parts);
      TICK_MAT = new THREE.MeshBasicMaterial({ color: 0x8a7a5a });
    }
    const ticks = new THREE.Mesh(TICKS, TICK_MAT);
    ticks.position.y = pedestalHeight;
    this.group.add(ticks);

    // --- rotating relic ---
    this.pivot = new THREE.Group();
    this.pivot.position.y = pedestalHeight + 0.42;
    this.group.add(this.pivot);
    this.visual = this._buildRelicVisual();
    this.pivot.add(this.visual);

    this.light = new LightSource(COLORS.fire, 0, 11, 1.4);
    this.light.position.set(0, pedestalHeight + 0.6, 0);
    this.group.add(this.light);

    this.applyYaw();
  }

  _buildRelicVisual() {
    const g = new THREE.Group();
    const dark = stoneMaterial(0x2c2b36, { metalness: 0.25, roughness: 0.6 });
    // dial ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.055, 5, 12), dark);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    // gnomon blade: a right-triangle prism pointing toward -Z (forward)
    const shape = new THREE.Shape();
    shape.moveTo(-0.08, 0); shape.lineTo(-0.62, 0); shape.lineTo(-0.08, 0.6); shape.lineTo(-0.08, 0);
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false }), dark);
    blade.rotation.y = -Math.PI / 2;
    blade.position.set(0.03, 0, 0);
    g.add(blade);
    // pointer fin at the tip so the facing is readable from any angle
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 4), dark);
    tip.rotation.x = -Math.PI / 2;
    tip.position.set(0, 0, -0.56);
    g.add(tip);
    // ember core
    const coreGeo = new THREE.OctahedronGeometry(0.16, 0);
    coreGeo.scale(1, 1.5, 1);
    {
      this.coreMat = new THREE.MeshStandardMaterial({ color: 0x1b1716, emissive: new THREE.Color(COLORS.fire), emissiveIntensity: 0, roughness: 0.4, flatShading: true });
      this.core = new THREE.Mesh(coreGeo, this.coreMat);
      this.core.position.y = 0.12;
      g.add(this.core);
      // rune band on the ring (glows when lit)
      this.runeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.fire).multiplyScalar(0.05), toneMapped: false });
      const runeBand = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 3, 24), this.runeMat);
      runeBand.rotation.x = Math.PI / 2;
      runeBand.position.y = 0.05;
      g.add(runeBand);
      // gnomon edge highlight
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.78), this.runeMat);
      edge.position.set(0, 0.31, -0.35);
      edge.rotation.x = -Math.PI / 4 + 0.03;
      g.add(edge);
      g.traverse((o) => { if (o.isMesh && o.material !== this.runeMat) o.castShadow = true; });
    }
    return g;
  }

  get position() { return this.group.position; }
  get flamePoint() { return (this._fp || (this._fp = new THREE.Vector3())).set(this.group.position.x, this.group.position.y + this.pivot.position.y + 0.2, this.group.position.z); }

  forward(yaw = this.yaw) { return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)); }

  applyYaw() {
    this.pivot.rotation.y = this.yaw;
  }

  /** Gnomon stone: dark ember core that glows gold while one of its shadows rests on a valid rune. */
  updateStone(dt) {
    this.litAmount += (this.glow - this.litAmount) * Math.min(1, dt / 0.15);
    if (dt === 0) this.litAmount = this.glow;
    const g = this.litAmount;
    const flicker = 0.9 + Math.sin(this.time * 11) * 0.1;
    this.coreMat.emissive.set(COLORS.target);
    this.coreMat.emissiveIntensity = g * 4 * flicker;
    this.runeMat.color.set(COLORS.target).multiplyScalar(0.06 + g * 2 * flicker);
    this.light.color.set(COLORS.target);
    this.light.intensity = g * 4;
    this.core.rotation.y += dt * (0.3 + g * 2);
  }

  update(dt) {
    this.time += dt;
    this.updateStone(dt);
  }
}
