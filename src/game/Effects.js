import * as THREE from 'three';

// Capped, reused particle pool (doc §12.3: no unbounded allocation). One draw call per pool.
const VERT = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */`
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * (0.6 + a), a * vAlpha);
  }`;

export class ParticlePool {
  constructor(scene, max = 400, { additive = true } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.buoy = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uScale: { value: 260 } },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  setPixelScale(h) { this.mat.uniforms.uScale.value = h * 0.36; }

  /** spawn one particle */
  emit(x, y, z, vx, vy, vz, color, size, life, buoyancy = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const j = i * 3;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
    this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.col[j] = color.r; this.col[j + 1] = color.g; this.col[j + 2] = color.b;
    this.baseSize[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.buoy[i] = buoyancy;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  update(dt, t) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const j = i * 3;
      this.vel[j + 1] += this.buoy[i] * dt;
      // gentle swirl
      this.vel[j] += Math.sin(t * 2 + i) * 0.15 * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      const f = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, f * 2.2) * Math.min(1, (1 - f) * 8 + 0.2);
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * f);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }
}

/** Convenience emitters shared by the game. */
export class Effects {
  constructor(scene) {
    this.fire = new ParticlePool(scene, 500, { additive: true });
    this.time = new ParticlePool(scene, 260, { additive: true });
    this.ash = new ParticlePool(scene, 260, { additive: false });
    this.ash.mat.blending = THREE.NormalBlending;
    this.t = 0;
    this.ashBounds = null; // { x0, x1, z0, z1, y }
    this.ashAcc = 0;
    this.c = {
      fire: new THREE.Color(0xff8a32).multiplyScalar(1.6),
      hot: new THREE.Color(0xffd17a).multiplyScalar(1.8),
      ember: new THREE.Color(0xff5a1e).multiplyScalar(1.4),
      time: new THREE.Color(0x69d9e8).multiplyScalar(1.5),
      gold: new THREE.Color(0xf0c76a).multiplyScalar(1.6),
      ash: new THREE.Color(0x8a8a98),
    };
  }

  setPixelScale(h) { [this.fire, this.time, this.ash].forEach((p) => p.setPixelScale(h)); }

  clear() { [this.fire, this.time, this.ash].forEach((p) => p.clear()); }

  flame(p, rate, dt, spread = 0.12, intensity = 1) {
    // rate: particles per second
    const n = rate * dt + Math.random();
    for (let i = 0; i < Math.floor(n); i++) {
      const r = Math.random();
      const col = r < 0.25 ? this.c.hot : r < 0.75 ? this.c.fire : this.c.ember;
      this.fire.emit(
        p.x + (Math.random() - 0.5) * spread, p.y + Math.random() * 0.05, p.z + (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.6 * intensity, (Math.random() - 0.5) * 0.3,
        col, 0.09 + Math.random() * 0.12 * intensity, 0.6 + Math.random() * 0.9, 0.6,
      );
    }
  }

  burst(p, count, color, speed = 2.5, size = 0.12, life = 1.0, pool = this.fire) {
    for (let i = 0; i < count; i++) {
      const th = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const s = Math.sqrt(1 - u * u);
      const v = speed * (0.4 + Math.random() * 0.6);
      pool.emit(p.x, p.y, p.z, Math.cos(th) * s * v, u * v * 0.7 + 0.8, Math.sin(th) * s * v, color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), -1.2);
    }
  }

  timeSpark(p, n = 1) {
    for (let i = 0; i < n; i++) {
      this.time.emit(p.x + (Math.random() - 0.5) * 0.5, p.y + (Math.random() - 0.5) * 0.5, p.z + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, this.c.time, 0.08 + Math.random() * 0.08, 0.5 + Math.random() * 0.5, 0);
    }
  }

  update(dt) {
    this.t += dt;
    // ambient falling ash ("Ashen")
    if (this.ashBounds) {
      const b = this.ashBounds;
      this.ashAcc += dt * 22;
      while (this.ashAcc >= 1) {
        this.ashAcc -= 1;
        this.ash.emit(b.x0 + Math.random() * (b.x1 - b.x0), b.y, b.z0 + Math.random() * (b.z1 - b.z0),
          (Math.random() - 0.5) * 0.25, -0.25 - Math.random() * 0.25, (Math.random() - 0.5) * 0.25,
          this.c.ash, 0.05 + Math.random() * 0.05, 9 + Math.random() * 5, 0);
      }
    }
    this.fire.update(dt, this.t);
    this.time.update(dt, this.t);
    this.ash.update(dt, this.t);
  }
}
