import * as THREE from 'three';

/** Yaw (Three.js rotation.y convention) that points from a toward b. */
export function yawTo(a, b) {
  return Math.atan2(-(b.x - a.x), -(b.z - a.z));
}

/** Point on the line a→b whose z equals `z` (used to lay bridges exactly under the shadow). */
export function onLineAtZ(a, b, z) {
  const t = (z - a.z) / (b.z - a.z);
  return new THREE.Vector3(a.x + (b.x - a.x) * t, 0, z);
}

export const v3 = (x, z, y = 0) => new THREE.Vector3(x, y, z);
