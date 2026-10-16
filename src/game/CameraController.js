import * as THREE from 'three';

// Over-the-shoulder follow camera with damping, pitch clamp and simple wall avoidance (doc §3.3).
const DIST = 3.9;
const PIVOT_H = 1.55;
const SHOULDER = 0.45;
const MIN_PITCH = -0.45;
const MAX_PITCH = 1.05;
const SENS = 0.0023;

export class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.32;
    this.dist = DIST;
    this.pivot = new THREE.Vector3();
    this.smoothPos = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.override = null; // { pos, look } for cinematic shots
    this._tmpA = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();
    this.first = true;
  }

  snap(yaw, pitch = 0.32) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.first = true;
  }

  update(dt, input, playerPos, world, allowLook = true) {
    if (allowLook) {
      this.yaw -= input.mouseDX * SENS;
      this.pitch += input.mouseDY * SENS;
      this.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.pitch));
    }

    if (this.override) {
      const k = 1 - Math.exp(-(this.override.speed ?? 3) * dt);
      this.smoothPos.lerp(this.override.pos, k);
      this.lookAt.lerp(this.override.look, k);
      this.camera.position.copy(this.smoothPos);
      this.camera.lookAt(this.lookAt);
      return;
    }

    this.pivot.set(playerPos.x, playerPos.y + PIVOT_H, playerPos.z);
    const cp = Math.cos(this.pitch);
    const back = this._tmpA.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const right = this._tmpB.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const shoulderPivot = this.pivot.clone().addScaledVector(right, SHOULDER);
    const desired = shoulderPivot.clone().addScaledVector(back, DIST);

    // keep the camera out of walls/floor: pull in toward the pivot
    const frac = world.raycastFraction(shoulderPivot, desired, ['wall', 'floor', 'solid']);
    const want = frac < 1 ? Math.max(0.6, DIST * frac - 0.25) : DIST;
    this.dist += (want - this.dist) * (want < this.dist ? 1 : 1 - Math.exp(-4 * dt));
    const target = shoulderPivot.clone().addScaledVector(back, this.dist);

    if (this.first) {
      this.smoothPos.copy(target);
      this.lookAt.copy(this.pivot);
      this.first = false;
    } else {
      const k = 1 - Math.exp(-16 * dt);
      this.smoothPos.lerp(target, k);
    }
    const lookTarget = shoulderPivot.clone().addScaledVector(back, -3);
    lookTarget.y -= 0.35;
    this.lookAt.lerp(lookTarget, 1 - Math.exp(-20 * dt));
    this.camera.position.copy(this.smoothPos);
    this.camera.lookAt(this.lookAt);
  }

  /** Unit vector pointing to the screen-right on the ground plane. */
  rightVector() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }
}
