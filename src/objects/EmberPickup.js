import * as THREE from 'three';
import { COLORS } from '../game/Palette.js';
import { LightSource } from '../game/LightPool.js';

// OBJ_Ember_Pickup: a small faceted flame-crystal (~0.3 units) that hovers and spins.
export function emberMesh(scale = 1) {
  const g = new THREE.Group();
  const geo = new THREE.OctahedronGeometry(0.13 * scale, 0);
  geo.scale(1, 1.7, 1);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.fire).multiplyScalar(2.2), toneMapped: false });
  const core = new THREE.Mesh(geo, mat);
  const shellGeo = new THREE.OctahedronGeometry(0.2 * scale, 0);
  shellGeo.scale(1, 1.6, 1);
  const shell = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.hot).multiplyScalar(0.9), transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  g.add(core, shell);
  g.userData.core = core;
  g.userData.shell = shell;
  return g;
}

export class EmberPickup {
  constructor(position) {
    this.group = emberMesh(1.15);
    this.base = position.clone();
    this.group.position.copy(position);
    this.light = new LightSource(COLORS.fire, 2.5, 4, 2);
    this.group.add(this.light);
    this.collected = false;
    this.time = Math.random() * 10;
    this.radius = 1.0;
  }

  update(dt) {
    this.time += dt;
    if (this.collected) return;
    this.group.position.y = this.base.y + Math.sin(this.time * 2.2) * 0.12;
    this.group.rotation.y += dt * 1.6;
    this.group.userData.shell.rotation.y -= dt * 3;
  }

  /** Player feet position → in range? */
  touches(p) {
    const dx = p.x - this.base.x, dz = p.z - this.base.z;
    return !this.collected && dx * dx + dz * dz < this.radius * this.radius && Math.abs(p.y + 0.9 - this.base.y) < 1.6;
  }
}
