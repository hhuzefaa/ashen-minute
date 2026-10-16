import * as THREE from 'three';
import { COLORS, stoneMaterial, makeRng } from '../game/Palette.js';

// CHR_Keeper — original procedural hooded figure, ~1.72 units tall, feet at origin, faces -Z.
// Carries an ember lantern whose glow grows with each ember restored.
export class Keeper {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'CHR_Keeper';
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.walkPhase = 0;
    this.time = 0;

    const cloakMat = new THREE.MeshStandardMaterial({ color: COLORS.cloak, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
    const innerMat = new THREE.MeshStandardMaterial({ color: 0x1a1922, roughness: 1, flatShading: true });
    const trimMat = new THREE.MeshStandardMaterial({ color: COLORS.rust, roughness: 0.8, flatShading: true });
    const voidMat = new THREE.MeshBasicMaterial({ color: 0x030306 });

    // Cloak: lathe bell with a ragged hem
    const pts = [
      new THREE.Vector2(0.0, 0.06), new THREE.Vector2(0.44, 0.06), new THREE.Vector2(0.4, 0.35),
      new THREE.Vector2(0.33, 0.75), new THREE.Vector2(0.27, 1.05), new THREE.Vector2(0.24, 1.22),
      new THREE.Vector2(0.14, 1.32), new THREE.Vector2(0.0, 1.34),
    ];
    const cloakGeo = new THREE.LatheGeometry(pts, 9);
    const rng = makeRng(7);
    const p = cloakGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < 0.1 && Math.hypot(p.getX(i), p.getZ(i)) > 0.3) p.setY(i, 0.06 + rng() * 0.12);
    }
    cloakGeo.computeVertexNormals();
    this.cloak = new THREE.Mesh(cloakGeo, cloakMat);
    this.cloak.castShadow = true;
    this.body.add(this.cloak);

    // Shoulder mantle
    const mantle = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.42, 9, 1, true), cloakMat);
    mantle.position.y = 1.16;
    mantle.castShadow = true;
    this.body.add(mantle);

    // Rust scarf band
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.055, 5, 10), trimMat);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.33;
    this.body.add(scarf);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.03), trimMat);
    tail.position.set(0.12, 1.12, 0.2);
    tail.rotation.set(0.25, 0, -0.15);
    this.body.add(tail);
    this.scarfTail = tail;

    // Hood
    this.head = new THREE.Group();
    this.head.position.y = 1.46;
    this.body.add(this.head);
    const hoodGeo = new THREE.IcosahedronGeometry(0.235, 1);
    hoodGeo.scale(1, 1.08, 1.12);
    const hood = new THREE.Mesh(hoodGeo, cloakMat);
    hood.castShadow = true;
    this.head.add(hood);
    const peak = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 6), cloakMat);
    peak.position.set(0, 0.12, 0.17);
    peak.rotation.x = -2.1;
    this.head.add(peak);
    // Face opening: dark void with two ember eyes
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.15, 10), voidMat);
    face.position.set(0, -0.02, -0.255);
    face.rotation.y = Math.PI;
    face.scale.set(1, 1.15, 1);
    this.head.add(face);
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.hot).multiplyScalar(3), toneMapped: false });
    for (const sx of [-0.055, 0.055]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), eyeMat);
      eye.position.set(sx, -0.01, -0.26);
      this.head.add(eye);
    }

    // Feet peeking from the hem
    this.feet = [];
    for (const sx of [-0.12, 0.12]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.24), innerMat);
      f.position.set(sx, 0.04, -0.05);
      f.castShadow = true;
      this.group.add(f);
      this.feet.push(f);
    }

    // Ember lantern at the hip
    this.lanternPivot = new THREE.Group();
    this.lanternPivot.position.set(0.38, 0.9, -0.05);
    this.body.add(this.lanternPivot);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 4), stoneMaterial(0x222228));
    chain.position.y = -0.09;
    this.lanternPivot.add(chain);
    const cage = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshStandardMaterial({ color: 0x2a2a30, wireframe: true }));
    cage.position.y = -0.24;
    cage.scale.set(1, 1.4, 1);
    this.lanternPivot.add(cage);
    this.lanternCoreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.fire), toneMapped: false });
    this.lanternCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), this.lanternCoreMat);
    this.lanternCore.position.y = -0.24;
    this.lanternPivot.add(this.lanternCore);
    this.lanternLight = new THREE.PointLight(COLORS.fire, 10, 12, 1.4); // Ilen is the light: a real pool on the floor
    this.lanternLight.position.y = -0.24;
    this.lanternPivot.add(this.lanternLight);
    this.setEmberLevel(0);
  }

  /** Lantern brightens as embers are restored (0..3). */
  setEmberLevel(n) {
    this.emberLevel = n;
    this.lanternBase = 10 + n * 1.2;
    this.lanternCoreMat.color.set(COLORS.fire).multiplyScalar(1.4 + n * 0.9);
  }

  /** speed: horizontal speed in u/s; grounded: bool */
  animate(dt, speed, grounded) {
    this.time += dt;
    const moving = speed > 0.3 && grounded;
    const k = Math.min(speed / 3.6, 1.2);
    if (moving) this.walkPhase += dt * (6 + speed * 1.6);
    const s = Math.sin(this.walkPhase);
    const bob = moving ? Math.abs(Math.cos(this.walkPhase)) * 0.045 * k : Math.sin(this.time * 1.6) * 0.008;
    this.body.position.y = bob;
    this.body.rotation.x = moving ? -0.06 * k : 0;
    this.cloak.rotation.z = moving ? s * 0.045 : Math.sin(this.time * 0.9) * 0.01;
    this.feet[0].position.z = -0.05 + (moving ? s * 0.16 * k : 0);
    this.feet[1].position.z = -0.05 - (moving ? s * 0.16 * k : 0);
    this.feet[0].position.y = 0.04 + (moving ? Math.max(0, s) * 0.06 : 0);
    this.feet[1].position.y = 0.04 + (moving ? Math.max(0, -s) * 0.06 : 0);
    this.lanternPivot.rotation.x = moving ? Math.sin(this.walkPhase * 2) * 0.25 + 0.25 * k : Math.sin(this.time * 1.3) * 0.05;
    this.scarfTail.rotation.x = 0.25 + (moving ? 0.35 * k + s * 0.08 : 0);
    const flicker = 0.85 + Math.sin(this.time * 13) * 0.08 + Math.sin(this.time * 7.3) * 0.07;
    this.lanternLight.intensity = (this.lanternBase + (this.lanternBoost || 0)) * flicker;
    this.lanternCoreMat.color.set(0xff8a32).multiplyScalar((1.4 + this.emberLevel * 0.9 + (this.lanternBoost || 0) * 1.5) * flicker);
    return moving ? s : 0;
  }
}
