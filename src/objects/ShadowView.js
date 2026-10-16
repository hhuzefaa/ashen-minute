import * as THREE from 'three';

// Pooled visual for one cast shadow: a straight plank of constant width with a rounded tip
// (a gnomon blade casts a plank-like shadow), a soft penumbra and a rim coloured by the light
// that casts it. Geometry is built at unit length; the body is scaled to the shadow's length.
const W = 1.4;
let BODY = null, TIP = null, SIDE = null, TIPRIM = null;

function geos() {
  if (BODY) return;
  BODY = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);             // x ∈ ±0.5, z ∈ ±0.5
  TIP = new THREE.CircleGeometry(0.5, 16, Math.PI, Math.PI).rotateX(-Math.PI / 2); // half-disc toward −z
  SIDE = new THREE.PlaneGeometry(0.09, 1).rotateX(-Math.PI / 2);
  TIPRIM = new THREE.RingGeometry(0.455, 0.545, 16, 1, Math.PI, Math.PI).rotateX(-Math.PI / 2);
}

export class ShadowView {
  constructor(parent, { preview = false } = {}) {
    geos();
    this.preview = preview;
    this.group = new THREE.Group();
    this.group.visible = false;
    parent.add(this.group);
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0x050310, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.softMat = new THREE.MeshBasicMaterial({ color: 0x050310, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    this.rimMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const mk = (geo, mat, order) => { const m = new THREE.Mesh(geo, mat); m.renderOrder = order; this.group.add(m); return m; };
    this.soft = mk(BODY, this.softMat, 1);
    this.softTip = mk(TIP, this.softMat, 1);
    this.body = mk(BODY, this.coreMat, 2);
    this.tip = mk(TIP, this.coreMat, 2);
    this.sideL = mk(SIDE, this.rimMat, 3);
    this.sideR = mk(SIDE, this.rimMat, 3);
    this.tipRim = mk(TIPRIM, this.rimMat, 3);
    this.color = new THREE.Color();
  }

  /** start: distance from the stone where the shadow begins; len: where it ends. */
  set(base, yaw, start, len, strength, rimColor, rimBoost, widthScale = 1) {
    const g = this.group;
    g.visible = strength > 0.004;
    if (!g.visible) return;
    g.position.set(base.x, base.y + 0.04, base.z);
    g.rotation.y = yaw;
    g.scale.x = widthScale;
    const L = Math.max(0.05, len - start);
    const mid = -(start + L / 2);
    this.body.scale.set(W, 1, L); this.body.position.z = mid;
    this.soft.scale.set(W * 1.32, 1, L + 0.2); this.soft.position.set(0, -0.004, mid);
    this.tip.scale.set(W, 1, W); this.tip.position.z = -len;
    this.softTip.scale.set(W * 1.32, 1, W * 1.32); this.softTip.position.set(0, -0.004, -len);
    this.sideL.scale.z = L; this.sideL.position.set(-W / 2, 0.003, mid);
    this.sideR.scale.z = L; this.sideR.position.set(W / 2, 0.003, mid);
    this.tipRim.scale.set(W, 1, W); this.tipRim.position.set(0, 0.003, -len);
    this.coreMat.opacity = (this.preview ? 0.3 : 0.86) * strength;
    this.softMat.opacity = (this.preview ? 0 : 0.32) * strength;
    this.rimMat.color.copy(rimColor).multiplyScalar(0.9 + rimBoost * 1.6);
    this.rimMat.opacity = Math.min(1, strength * (0.55 + rimBoost * 0.45));
  }

  hide() { this.group.visible = false; }
}
