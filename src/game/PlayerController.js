import * as THREE from 'three';
import { Keeper } from '../objects/Keeper.js';

// Camera-relative movement, simple cylinder collision, grounded/fall state (doc §3.3, §12.1).
const SPEED = 3.7;
const ACCEL = 16;
const DECEL = 20;
const GRAVITY = 22;
const JUMP_V = 5.6;
const RADIUS = 0.34;
const HEIGHT = 1.7;
const STEP = 0.4;

export class PlayerController {
  constructor(scene) {
    this.keeper = new Keeper();
    scene.add(this.keeper.group);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.grounded = false;
    this.spawn = new THREE.Vector3();
    this.spawnYaw = 0;
    this.killY = -12;
    this.lastStepSign = 0;
    this.onFootstep = null;
    this.onFall = null;
    this.flame = null; // carried flame { t, max }
  }

  setSpawn(p, yaw) {
    this.spawn.copy(p);
    this.spawnYaw = yaw;
  }

  respawn() {
    this.pos.copy(this.spawn);
    this.vel.set(0, 0, 0);
    this.facing = this.spawnYaw;
    this.grounded = true;
    this.syncVisual();
  }

  /**
   * @param input Input
   * @param camYaw camera yaw (radians; 0 looks toward -Z)
   * @param opts { canMove, suppressStrafe }
   */
  update(dt, input, camYaw, world, opts = {}) {
    let fwd = 0, strafe = 0;
    if (opts.canMove) {
      fwd = (input.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (input.isDown('KeyS', 'ArrowDown') ? 1 : 0);
      if (!opts.suppressStrafe) strafe = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    }
    // camera forward / right on the ground plane
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let wx = fx * fwd + rx * strafe;
    let wz = fz * fwd + rz * strafe;
    const len = Math.hypot(wx, wz);
    if (len > 1) { wx /= len; wz /= len; } // diagonal is never faster

    const spd = SPEED * (opts.sprint ? 1.7 : 1);
    const tx = wx * spd, tz = wz * spd;
    const k = 1 - Math.exp(-(len > 0.01 ? ACCEL : DECEL) * dt);
    const airK = this.grounded ? 1 : 0.35;
    this.vel.x += (tx - this.vel.x) * k * airK;
    this.vel.z += (tz - this.vel.z) * k * airK;

    if (opts.canMove && this.grounded && input.wasPressed('Space')) {
      this.vel.y = JUMP_V;
      this.grounded = false;
    }
    this.vel.y -= GRAVITY * dt;
    if (this.vel.y < -30) this.vel.y = -30;

    // horizontal move + wall resolve
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    world.resolveCylinder(this.pos, RADIUS, HEIGHT, STEP);

    // vertical
    this.pos.y += this.vel.y * dt;
    const ground = world.groundHeight(this.pos.x, this.pos.z, this.pos.y - this.vel.y * dt, STEP);
    if (ground > -Infinity && this.pos.y <= ground + 0.001 && this.vel.y <= 0) {
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    } else if (ground > -Infinity && this.grounded && this.pos.y - ground < STEP && this.vel.y <= 0) {
      // stick to gentle step-downs
      this.pos.y = ground;
      this.vel.y = 0;
    } else {
      this.grounded = false;
    }

    // fall recovery
    if (this.pos.y < this.killY) {
      if (this.onFall) this.onFall();
      this.respawn();
      return;
    }

    // face movement direction
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.25) {
      const want = Math.atan2(-this.vel.x, -this.vel.z);
      let d = want - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-14 * dt));
    }
    const s = this.keeper.animate(dt, hs, this.grounded);
    const sign = Math.sign(s);
    if (sign !== 0 && sign !== this.lastStepSign && hs > 0.5 && this.onFootstep) this.onFootstep();
    this.lastStepSign = sign;
    this.syncVisual();
  }

  syncVisual() {
    this.keeper.group.position.copy(this.pos);
    this.keeper.group.rotation.y = this.facing;
  }

  get horizontalSpeed() { return Math.hypot(this.vel.x, this.vel.z); }
}
