import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS, stoneMaterial } from '../game/Palette.js';
import { runeTexture } from './Glyphs.js';

// OBJ_Target_Rune: a floor sigil where the shadow must land, plus a standing stele carrying the
// same glyph so the target reads from a low third-person camera. States: dim → near (pulse) → solved.
export class TargetRune {
  constructor(position, facingYaw) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.time = 0;
    this.level = 0; // 0 dim, 1 lit
    this.solvedFlash = 0;
    const tex = runeTexture('target', 3);

    this.floorMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(COLORS.target), opacity: 0.25, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.04;
    floor.renderOrder = 3;
    this.group.add(floor);

    // stele behind the sigil, facing the relic
    this.stele = new THREE.Group();
    const slab = new THREE.Mesh(new RoundedBoxGeometry(0.95, 2.0, 0.32, 1, 0.06), stoneMaterial(0x45455a));
    slab.position.y = 1.0;
    slab.castShadow = true;
    const capGeo = new THREE.ConeGeometry(0.62, 0.45, 4);
    const cap = new THREE.Mesh(capGeo, stoneMaterial(0x45455a));
    cap.position.y = 2.2;
    cap.rotation.y = Math.PI / 4;
    cap.scale.set(1, 1, 0.45);
    this.steleMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(COLORS.target).multiplyScalar(0.4), toneMapped: false });
    const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.78), this.steleMat);
    glyph.position.set(0, 1.25, 0.17);
    this.stele.add(slab, cap, glyph);
    this.stele.position.set(0, 0, -1.25);
    this.steleHolder = new THREE.Group();
    this.steleHolder.rotation.y = facingYaw;
    this.steleHolder.add(this.stele);
    this.group.add(this.steleHolder);

    // flash ring (success)
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.target).multiplyScalar(2), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 40), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.group.add(this.ring);

    this.light = new THREE.PointLight(COLORS.target, 0, 5, 2);
    this.light.position.set(0, 0.8, 0);
    this.group.add(this.light);
  }

  /** Collider for the stele (so the player cannot walk through it). */
  addCollider(world) {
    const p = new THREE.Vector3();
    this.stele.getWorldPosition(p);
    world.add({ cx: p.x, cy: 1.1, cz: p.z, hx: 0.5, hy: 1.1, hz: 0.2, yaw: this.steleHolder.rotation.y, tag: 'wall' });
  }

  flash() { this.solvedFlash = 1; }

  update(dt, { lit, alignment, solved }) {
    this.time += dt;
    const base = !lit ? 0.18 : solved ? 1 : 0.35 + alignment * 0.5;
    const pulse = lit && !solved ? 0.5 + 0.5 * Math.sin(this.time * (3 + alignment * 9)) : 1;
    const glow = base * (0.75 + 0.25 * pulse);
    this.floorMat.opacity = Math.min(1, 0.2 + glow);
    this.floorMat.color.set(COLORS.target).multiplyScalar(0.6 + glow * 1.8);
    this.steleMat.color.set(COLORS.target).multiplyScalar(0.25 + glow * 2.2);
    this.light.intensity = lit ? glow * 3 : 0;
    if (this.solvedFlash > 0) {
      this.solvedFlash = Math.max(0, this.solvedFlash - dt * 1.1);
      const t = 1 - this.solvedFlash;
      this.ring.scale.setScalar(1 + t * 4);
      this.ringMat.opacity = this.solvedFlash;
    }
  }
}
