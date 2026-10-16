import * as THREE from 'three';
import { COLORS } from '../game/Palette.js';

// VFX_Shadow_Projection + VFX_Shadow_Endpoint + VFX_Time_Trail + focus lines.
// A designed, deterministic guide — never derived from renderer shadow maps (doc §4.2).
// The detached shadow lies on the floor plane (y≈0) and keeps that height over the abyss,
// previewing where the bridge will become solid.
/** Closed flat ribbon (on the XZ plane) of width w along a polyline. */
function ribbon(pts, w) {
  const pos = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = (-dz / l) * w / 2, nz = (dx / l) * w / 2;
    const y = a.y;
    pos.push(a.x - nx, y, a.z - nz, a.x + nx, y, a.z + nz, b.x + nx, y, b.z + nz);
    pos.push(a.x - nx, y, a.z - nz, b.x + nx, y, b.z + nz, b.x - nx, y, b.z - nz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

export class ShadowGuide {
  constructor(relic, length) {
    this.relic = relic;
    this.length = length;
    this.group = new THREE.Group();
    this.group.position.set(relic.base.x, relic.base.y + 0.035, relic.base.z);
    this.visibility = 0;
    this.alignment = 0; // 0..1 closeness
    this.time = 0;

    // wedge silhouette pointing toward local -Z
    const L = length;
    const shape = new THREE.Shape();
    shape.moveTo(-0.32, 0);
    shape.lineTo(-0.55, L * 0.25);
    shape.lineTo(-0.36, L * 0.7);
    shape.lineTo(0, L);
    shape.lineTo(0.36, L * 0.7);
    shape.lineTo(0.55, L * 0.25);
    shape.lineTo(0.32, 0);
    shape.lineTo(-0.32, 0);
    const geo = new THREE.ShapeGeometry(shape, 4);
    geo.rotateX(Math.PI / 2); // shape Y -> world -Z ... (rotateX(+90): y -> z) then flip below
    geo.scale(1, 1, -1);
    this.mainMat = new THREE.MeshBasicMaterial({ color: 0x050310, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
    this.main = new THREE.Mesh(geo, this.mainMat);
    this.main.renderOrder = 2;
    // soft penumbra: slightly larger copy
    const soft = geo.clone();
    soft.scale(1.45, 1, 1.02);
    this.softMat = this.mainMat.clone();
    this.soft = new THREE.Mesh(soft, this.softMat);
    this.soft.position.y = -0.005;
    this.soft.renderOrder = 1;
    // edge glow line (thin amber rim that turns gold when aligned)
    const edgePts = shape.getPoints().map((p) => new THREE.Vector3(p.x, 0.004, -p.y));
    this.edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.fire), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending });
    this.edge = new THREE.Mesh(ribbon(edgePts, 0.07), this.edgeMat);
    this.edge.renderOrder = 3;

    this.rotor = new THREE.Group();
    this.rotor.add(this.soft, this.main, this.edge);
    this.group.add(this.rotor);

    // endpoint marker (diamond)
    this.endMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.fire), transparent: true, opacity: 0, toneMapped: false });
    const eg = new THREE.OctahedronGeometry(0.22, 0);
    eg.scale(1, 0.35, 1);
    this.endpoint = new THREE.Mesh(eg, this.endMat);
    this.endpoint.position.set(0, 0.12, -L);
    this.rotor.add(this.endpoint);

    // focus line along the guide (Q)
    this.focusMat = new THREE.LineBasicMaterial({ color: new THREE.Color(COLORS.hot).multiplyScalar(1.5), transparent: true, opacity: 0, toneMapped: false });
    this.focusLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, 0.05, -L)]), this.focusMat);
    this.rotor.add(this.focusLine);

    // echo (Room 2/3 hint): a faint cyan copy at a remembered yaw
    this.echoMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.time).multiplyScalar(0.35), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.echoRimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.time).multiplyScalar(1.1), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending });
    this.echo = new THREE.Group();
    this.echo.add(new THREE.Mesh(geo, this.echoMat), new THREE.Mesh(ribbon(edgePts, 0.05), this.echoRimMat));
    this.echo.position.y = 0.01;
    this.echoYaw = null;
    this.echoOn = false;
    this.group.add(this.echo);

    // time trail: positions of past endpoints (VFX_Time_Trail)
    this.trailMax = 90;
    this.trailPos = new Float32Array(this.trailMax * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setDrawRange(0, 0);
    this.trailMat = new THREE.LineBasicMaterial({ color: new THREE.Color(COLORS.time).multiplyScalar(1.6), transparent: true, opacity: 0, toneMapped: false });
    this.trail = new THREE.Line(tg, this.trailMat);
    this.trail.frustumCulled = false;
    this.trail.position.y = 0.06;
    this.group.add(this.trail);
    this.trailOn = false;
  }

  setEcho(yaw) { this.echoYaw = yaw; }

  updateTrail(samples) {
    const n = Math.min(samples.length, this.trailMax);
    const start = samples.length - n;
    for (let i = 0; i < n; i++) {
      const y = samples[start + i];
      this.trailPos[i * 3] = -Math.sin(y) * this.length;
      this.trailPos[i * 3 + 1] = 0;
      this.trailPos[i * 3 + 2] = -Math.cos(y) * this.length;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, n);
  }

  /** alignment: 0..1 (1 = exactly aligned); solved: bridge formed */
  update(dt, { lit, yaw, alignment, solved, focus, rewinding }) {
    this.time += dt;
    const vis = lit ? 1 : 0;
    this.visibility += (vis - this.visibility) * Math.min(1, dt * 3);
    this.rotor.rotation.y = yaw;
    const v = this.visibility;
    this.mainMat.opacity = 0.88 * v;
    this.softMat.opacity = 0.4 * v;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (4 + alignment * 8));
    const edgeCol = solved ? COLORS.target : rewinding ? COLORS.time : COLORS.fire;
    this.edgeMat.color.set(edgeCol).multiplyScalar(0.9 + alignment * 1.6 + (solved ? 0.6 : 0));
    this.edgeMat.opacity = v * (solved ? 0.2 : 0.55 + alignment * 0.35 + pulse * 0.1);
    this.endMat.color.set(solved ? COLORS.target : rewinding ? COLORS.time : COLORS.fire).multiplyScalar(1.2 + alignment * 2 + pulse * 0.6);
    this.endMat.opacity = v;
    this.endpoint.rotation.y += dt * 2;
    this.endpoint.scale.setScalar(1 + (focus ? 0.6 : 0) + alignment * 0.3);
    this.focusMat.opacity += ((focus && lit ? 0.9 : 0) - this.focusMat.opacity) * Math.min(1, dt * 10);
    // echo
    const echoTarget = this.echoOn && lit && !solved && this.echoYaw !== null ? 0.22 + 0.1 * Math.sin(this.time * 2.2) : 0;
    this.echoRimMat.opacity += (echoTarget * 2.2 - this.echoRimMat.opacity) * Math.min(1, dt * 3);
    this.echoMat.opacity = this.echoRimMat.opacity * 0.25;
    if (this.echoYaw !== null) this.echo.rotation.y = this.echoYaw;
    // trail
    const tOn = (this.trailOn || focus) && lit ? (rewinding ? 0.9 : 0.45) : 0;
    this.trailMat.opacity += (tOn - this.trailMat.opacity) * Math.min(1, dt * 8);
    // skip drawing entirely while invisible (draw-call budget)
    this.rotor.visible = this.visibility > 0.004;
    this.echo.visible = this.echoRimMat.opacity > 0.004;
    this.trail.visible = this.trailMat.opacity > 0.004;
    this.focusLine.visible = this.focusMat.opacity > 0.004;
  }
}
