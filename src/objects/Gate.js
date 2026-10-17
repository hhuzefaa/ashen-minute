import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS, stoneMaterial } from '../game/Palette.js';
import { runeTexture, emblemTexture } from './Glyphs.js';
import { mergeGroup } from './Environment.js';

// A sealed temple gate (ENV_Exit_Arch + ENV_Door_Slab). The door slab has a real collider; when
// opened it grinds down into the floor and its collider is removed once the way is clear.
// axis 'x' = the gate spans along X (sits in a wall that runs east-west); 'z' = spans along Z.
let _postMat = null; // one shared material for every gate frame (was one per gate)
const postMat = () => _postMat || (_postMat = stoneMaterial(0x4b4a5e));
let doorMat = null;

export class Gate {
  constructor(ctx, { id, x, z, axis = 'x', width = 3.2, height = 4.2, emblem = null, open = false }) {
    this.id = id;
    this.width = width;
    this.height = height;
    this.state = open ? 'open' : 'closed';
    this.t = open ? 1 : 0;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    if (axis === 'z') this.group.rotation.y = Math.PI / 2;
    const pm = postMat();
    const post = new RoundedBoxGeometry(1.0, height + 0.6, 1.2, 1, 0.06);
    const l = new THREE.Mesh(post, pm); l.position.set(-width / 2 - 0.5, (height + 0.6) / 2, 0);
    const r = new THREE.Mesh(post, pm); r.position.set(width / 2 + 0.5, (height + 0.6) / 2, 0);
    const lintel = new THREE.Mesh(new RoundedBoxGeometry(width + 2.6, 0.9, 1.4, 1, 0.08), pm);
    lintel.position.y = height + 0.9;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.8, 4), pm);
    crown.position.y = height + 1.75; crown.rotation.y = Math.PI / 4;
    const frame = new THREE.Group();
    frame.add(l, r, lintel, crown);
    this.group.add(mergeGroup(frame, pm));
    // keystone sigil (gold when the gate is open; an emblem if this door is "keyed")
    this.signMat = new THREE.MeshBasicMaterial({ map: emblem ? emblemTexture(emblem) : runeTexture('target', 9), transparent: true, depthWrite: false, color: new THREE.Color(COLORS.target).multiplyScalar(emblem ? 1.2 : 0.35), side: THREE.DoubleSide });
    for (const side of [1, -1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), this.signMat);
      sign.position.set(0, height + 0.9, side * 0.72);
      if (side < 0) sign.rotation.y = Math.PI;
      this.group.add(sign);
    }
    if (!doorMat) doorMat = stoneMaterial(0x2a2934);
    this.door = new THREE.Mesh(new RoundedBoxGeometry(width + 0.1, height, 0.45, 1, 0.05), doorMat);
    this.door.position.y = height / 2;
    // glowing seam down the middle of the door
    this.seamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.fire).multiplyScalar(0.4) });
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.06, height * 0.9, 0.5), this.seamMat);
    this.door.add(seam);
    this.group.add(this.door);
    this.group.traverse((o) => { if (o.isMesh && o.material !== this.signMat) { o.castShadow = true; o.receiveShadow = true; } });
    ctx.group.add(this.group);

    // colliders: posts always, door while closed
    const w = ctx.world;
    if (axis === 'x') {
      w.addBox(x - width / 2 - 1.0, 0, z - 0.6, x - width / 2, height + 0.6, z + 0.6, 'wall');
      w.addBox(x + width / 2, 0, z - 0.6, x + width / 2 + 1.0, height + 0.6, z + 0.6, 'wall');
      this.collider = w.addBox(x - width / 2, 0, z - 0.25, x + width / 2, height, z + 0.25, 'gate');
    } else {
      w.addBox(x - 0.6, 0, z - width / 2 - 1.0, x + 0.6, height + 0.6, z - width / 2, 'wall');
      w.addBox(x - 0.6, 0, z + width / 2, x + 0.6, height + 0.6, z + width / 2 + 1.0, 'wall');
      this.collider = w.addBox(x - 0.25, 0, z - width / 2, x + 0.25, height, z + width / 2, 'gate');
    }
    this.setOpenInstant(open);
  }

  get isOpen() { return this.state !== 'closed'; }

  open() {
    if (this.state !== 'closed') return false;
    this.state = 'opening';
    return true;
  }

  setOpenInstant(open) {
    this.state = open ? 'open' : 'closed';
    this.t = open ? 1 : 0;
    this.collider.enabled = !open;
    this.door.position.y = this.height / 2 - this.t * (this.height + 0.1);
    this.door.visible = !open;
    this.signMat.color.set(COLORS.target).multiplyScalar(open ? 1.6 : 0.5);
    this.seamMat.color.set(COLORS.fire).multiplyScalar(open ? 0 : 0.4);
  }

  update(dt) {
    if (this.state !== 'opening') return;
    this.t = Math.min(1, this.t + dt / 2.2);
    const e = this.t * this.t * (3 - 2 * this.t);
    this.door.position.y = this.height / 2 - e * (this.height + 0.1);
    this.door.position.x = Math.sin(this.t * 60) * 0.02 * (1 - this.t); // grinding shudder
    this.seamMat.color.set(COLORS.fire).multiplyScalar(0.4 + Math.sin(this.t * Math.PI) * 2.5);
    if (this.t > 0.55) this.collider.enabled = false; // passable once the slab is mostly down
    if (this.t >= 1) this.setOpenInstant(true);
  }
}
