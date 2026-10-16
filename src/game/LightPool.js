import * as THREE from 'three';

// Every fire in the temple is a LightSource (a plain Object3D with light-like fields). Only a
// small, fixed pool of real PointLights exists; each frame they are assigned to the sources that
// matter most near the player. Fixed light count = no shader recompiles and bounded GPU cost.
export class LightSource extends THREE.Object3D {
  constructor(color = 0xffffff, intensity = 1, distance = 8, decay = 1.6) {
    super();
    this.isLightSource = true;
    this.color = new THREE.Color(color);
    this.intensity = intensity;
    this.distance = distance;
    this.decay = decay;
    LightSource.registry.add(this);
  }

  dispose() { LightSource.registry.delete(this); }
}
LightSource.registry = new Set();

export class LightPool {
  constructor(scene, size = 4) {
    this.scene = scene;
    this.lights = [];
    this.setSize(size);
    this._p = new THREE.Vector3();
    this._scored = [];
  }

  setSize(n) {
    // Light count changes force a shader recompile, so this only happens from the settings menu.
    while (this.lights.length > n) this.scene.remove(this.lights.pop());
    while (this.lights.length < n) {
      const l = new THREE.PointLight(0xffffff, 0, 8, 1.6);
      this.scene.add(l);
      this.lights.push(l);
    }
  }

  update(focus) {
    const scored = this._scored;
    scored.length = 0;
    for (const s of LightSource.registry) {
      if (s.intensity <= 0.02 || !s.parent) continue;
      if (!isVisible(s)) continue;
      s.getWorldPosition(this._p);
      const d2 = this._p.distanceToSquared(focus);
      const reach = s.distance + 14;
      if (d2 > reach * reach) continue;
      scored.push({ s, score: s.intensity / (1 + d2 / (s.distance * s.distance)), x: this._p.x, y: this._p.y, z: this._p.z });
    }
    scored.sort((a, b) => b.score - a.score);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const e = scored[i];
      if (!e) { l.intensity = 0; continue; }
      l.position.set(e.x, e.y, e.z);
      l.color.copy(e.s.color);
      l.intensity = e.s.intensity;
      l.distance = e.s.distance;
      l.decay = e.s.decay;
    }
  }
}

function isVisible(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
