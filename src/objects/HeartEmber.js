import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS, stoneMaterial } from '../game/Palette.js';
import { runeTexture } from './Glyphs.js';
import { LightSource } from '../game/LightPool.js';

// OBJ_Heart_Ember: stepped altar of the same civilisation as the relic pedestal, with a separate
// suspended core that can glow independently, three empty ember sockets and a floor seal
// (VFX_Finale_Rune) whose three sections light up as embers converge.
export class HeartEmber {
  constructor(position) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.time = 0;
    this.awake = 0;      // 0..1 core brightness
    this.sealLevel = 0;  // 0..3
    const stone = stoneMaterial(0x4a4a5e);
    const dark = stoneMaterial(0x2c2b36);

    const tiers = [[1.7, 0.3], [1.3, 0.3], [0.9, 0.5]];
    let y = 0;
    for (const [r, h] of tiers) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, h, 8), stone);
      m.position.y = y + h / 2;
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      y += h;
    }
    this.topY = y;
    // four short horn pillars
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
      const p = new THREE.Mesh(new RoundedBoxGeometry(0.28, 1.5, 0.28, 1, 0.04), dark);
      p.position.set(Math.cos(a) * 1.25, 0.6 + 0.75, Math.sin(a) * 1.25);
      p.rotation.y = -a;
      p.rotation.z = Math.cos(a) * 0.12;
      p.rotation.x = -Math.sin(a) * 0.12;
      p.castShadow = true;
      this.group.add(p);
    }

    // core: separate mesh + material
    const coreGeo = new THREE.IcosahedronGeometry(0.42, 0);
    coreGeo.scale(1, 1.35, 1);
    this.coreMat = new THREE.MeshStandardMaterial({ color: 0x1a1210, emissive: new THREE.Color(COLORS.fire), emissiveIntensity: 0.15, roughness: 0.5, flatShading: true });
    this.core = new THREE.Mesh(coreGeo, this.coreMat);
    this.core.position.y = y + 1.1;
    this.group.add(this.core);
    this.coreShellMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.hot), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), this.coreShellMat);
    shell.position.copy(this.core.position);
    this.shell = shell;
    this.group.add(shell);

    // three ember sockets orbiting the core
    this.sockets = [];
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: 0x241a16, toneMapped: false }));
      this.group.add(s);
      this.sockets.push(s);
    }

    // floor seal
    this.sealMat = new THREE.MeshBasicMaterial({ map: runeTexture('finale', 4), transparent: true, depthWrite: false, color: new THREE.Color(COLORS.fire).multiplyScalar(0.12), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const seal = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), this.sealMat);
    seal.rotation.x = -Math.PI / 2;
    seal.position.y = 0.035;
    seal.renderOrder = 3;
    this.group.add(seal);

    this.light = new LightSource(COLORS.fire, 1.2, 14, 1.4);
    this.light.position.y = y + 1.1;
    this.group.add(this.light);
  }

  socketWorld(i, out = new THREE.Vector3()) {
    this.sockets[i].getWorldPosition(out);
    return out;
  }

  addCollider(world) {
    const p = this.group.position;
    world.add({ cx: p.x, cy: 0.6, cz: p.z, hx: 1.6, hy: 0.6, hz: 1.6, tag: 'wall' });
  }

  update(dt) {
    this.time += dt;
    const cy = this.core.position.y;
    this.sockets.forEach((s, i) => {
      const a = this.time * (0.5 + this.awake) + (i / 3) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.95, cy + Math.sin(this.time * 1.3 + i) * 0.12, Math.sin(a) * 0.95);
      s.rotation.y += dt * 2;
      const lit = i < this.sealLevel;
      s.material.color.set(lit ? COLORS.hot : 0x241a16).multiplyScalar(lit ? 2.5 : 1);
    });
    const flicker = 0.9 + Math.sin(this.time * 11) * 0.05 + Math.sin(this.time * 6.7) * 0.05;
    this.coreMat.emissiveIntensity = (0.15 + this.awake * 6) * flicker;
    this.coreShellMat.opacity = this.awake * 0.22 * flicker;
    this.shell.scale.setScalar(1 + this.awake * 0.4 + Math.sin(this.time * 3) * 0.04 * this.awake);
    this.core.rotation.y += dt * (0.2 + this.awake * 1.2);
    this.light.intensity = (1.0 + this.awake * 16) * flicker;
    this.light.distance = 14 + this.awake * 20;
    const seal = Math.min(1, this.sealLevel / 3);
    this.sealMat.color.set(COLORS.fire).multiplyScalar(0.12 + seal * 0.8 + this.awake * 1.6);
  }
}
