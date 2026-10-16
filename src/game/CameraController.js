import * as THREE from 'three';

// Spring-arm third-person camera (doc §3.3 + the user's RDR2 / Witcher-style brief):
// - mouse drives yaw/pitch (control rotation); the Keeper's body turns toward its movement
// - the arm's pivot follows the Keeper with a short positional lag
// - a 5-ray probe pulls the camera in front of walls/ceilings; it eases back out slowly
// - over-the-shoulder offset shrinks as the arm shortens (narrow corridors)
// - the look direction is derived from yaw/pitch only, so "forward" on screen is always
//   exactly the direction W moves the Keeper
const PIVOT_H = 1.5;
const SHOULDER = 0.55;
const MIN_PITCH = -0.55;
const MAX_PITCH = 1.15;
const MIN_DIST = 0.3;
const BASE_SENS = 0.0022;

export class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.3;
    this.armLength = 4.2;   // desired distance (mouse wheel adjusts 2.5–6.5)
    this.dist = 4.2;        // current distance after collision
    this.sensitivity = 1;
    this.invertY = false;
    this.override = null;   // { pos, look, speed } — cinematic shots only
    this.pivot = new THREE.Vector3();
    this.smoothPos = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.first = true;
    // scratch vectors (no allocation per frame)
    this._back = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }

  /** Put the camera directly behind a yaw, no smoothing (respawn / end of cutscene). */
  snap(yaw, pitch = 0.3) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.first = true;
    this.override = null;
  }

  clearOverride() {
    this.override = null;
    this.first = true;
  }

  zoom(delta) {
    this.armLength = Math.max(2.5, Math.min(6.5, this.armLength + delta));
  }

  update(dt, input, playerPos, world, allowLook = true) {
    if (allowLook) {
      const s = BASE_SENS * this.sensitivity;
      this.yaw -= input.mouseDX * s;
      this.pitch += input.mouseDY * s * (this.invertY ? -1 : 1);
      this.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.pitch));
      if (input.wheel) this.zoom(input.wheel * 0.004);
    }

    if (this.override) {
      const k = 1 - Math.exp(-(this.override.speed ?? 3) * dt);
      if (this.first) { this.smoothPos.copy(this.override.pos); this.lookAt.copy(this.override.look); this.first = false; }
      this.smoothPos.lerp(this.override.pos, k);
      this.lookAt.lerp(this.override.look, k);
      this.camera.position.copy(this.smoothPos);
      this.camera.lookAt(this.lookAt);
      return;
    }

    // pivot follows the Keeper with a short lag (vertical lag slightly longer to soften hops)
    const tx = playerPos.x, ty = playerPos.y + PIVOT_H, tz = playerPos.z;
    if (this.first) this.pivot.set(tx, ty, tz);
    else {
      const kh = 1 - Math.exp(-22 * dt), kv = 1 - Math.exp(-12 * dt);
      this.pivot.x += (tx - this.pivot.x) * kh;
      this.pivot.z += (tz - this.pivot.z) * kh;
      this.pivot.y += (ty - this.pivot.y) * kv;
    }

    const cp = Math.cos(this.pitch);
    const back = this._back.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const right = this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const up = this._up.crossVectors(back, right).normalize();

    // collision probe: centre + 4 offset rays from the pivot toward the desired arm end
    const L = this.armLength;
    let frac = 1;
    const offs = [[0, 0], [0.28, 0], [-0.28, 0], [0, 0.22], [0, -0.22]];
    for (const [ox, oy] of offs) {
      const a = this._a.copy(this.pivot).addScaledVector(right, ox * 0.4).addScaledVector(up, oy * 0.4);
      const b = this._b.copy(this.pivot).addScaledVector(right, SHOULDER + ox).addScaledVector(up, oy).addScaledVector(back, L);
      const f = world.raycastFraction(a, b, CAMERA_BLOCKERS);
      if (f < frac) frac = f;
    }
    const want = frac < 1 ? Math.max(MIN_DIST, L * frac - 0.35) : L;
    if (this.first) this.dist = want;
    else if (want < this.dist) this.dist = want;                   // pull in immediately
    else this.dist += (want - this.dist) * (1 - Math.exp(-3 * dt)); // ease back out

    const shoulder = SHOULDER * Math.min(1, this.dist / 2.5);
    const pos = this._t.copy(this.pivot).addScaledVector(right, shoulder).addScaledVector(back, this.dist);
    this.camera.position.copy(pos);
    this.tooClose = this.dist < 0.75; // Game hides the Keeper so the view is never inside the hood
    // look straight along the arm (exact yaw/pitch → movement always matches the view)
    this.lookAt.copy(pos).addScaledVector(back, -10);
    this.camera.lookAt(this.lookAt);
    this.smoothPos.copy(pos);
    this.first = false;
  }

  /** Unit vector pointing to screen-right on the ground plane. */
  rightVector(out = new THREE.Vector3()) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }
}

const CAMERA_BLOCKERS = ['wall', 'floor', 'solid', 'gate'];
