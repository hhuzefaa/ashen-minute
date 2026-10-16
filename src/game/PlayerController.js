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
const COYOTE = 0.12;     // s after leaving ground (or a shadow sliding away) when a hop still works
const JUMP_BUFFER = 0.12; // s a hop pressed just before landing is remembered
const SAFE_EVERY = 0.2;   // s between "last safe ground" samples
const SAFE_PROBE = 0.8;   // m of floor required on all four sides of a safe spot

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
    this.killY = -7;   // ≈0.8 s of falling, then a quick fade back to the last safe ground
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.lastSafe = new THREE.Vector3();
    this.lastSafeYaw = 0;
    this.hasSafe = false;
    this.safeT = 0;
    this.lastStepSign = 0;
    this.onFootstep = null;
    this.onFall = null;
    this.flame = null; // carried flame { t, max }
  }

  setSpawn(p, yaw) {
    this.spawn.copy(p);
    this.spawnYaw = yaw;
  }

  /** Where a fall puts the Keeper back: the last safe ground if known, else the spawn. */
  setSafe(x, y, z, yaw) { this.lastSafe.set(x, y, z); this.lastSafeYaw = yaw; this.hasSafe = true; this.safeT = 0; }
  clearSafe() { this.hasSafe = false; }

  respawn() {
    this.coyote = 0; this.jumpBuffer = 0;
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

    // hop: coyote time + jump buffer
    if (this.grounded) this.coyote = COYOTE; else this.coyote = Math.max(0, this.coyote - dt);
    if (opts.canMove && input.wasPressed('Space')) this.jumpBuffer = JUMP_BUFFER;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (opts.canMove && this.jumpBuffer > 0 && this.coyote > 0 && this.vel.y <= 0.01) {
      this.vel.y = JUMP_V;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
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

    // last safe ground: solid floor with floor 0.8 m away on every side
    if (this.grounded && opts.canMove !== false) {
      this.safeT += dt;
      if (this.safeT >= SAFE_EVERY) {
        this.safeT = 0;
        const x = this.pos.x, z = this.pos.z, y = this.pos.y;
        if (world.standingOn(x, z, y, 'floor') && world.standingOn(x + SAFE_PROBE, z, y, 'floor') && world.standingOn(x - SAFE_PROBE, z, y, 'floor')
          && world.standingOn(x, z + SAFE_PROBE, y, 'floor') && world.standingOn(x, z - SAFE_PROBE, y, 'floor')) {
          this.lastSafe.set(x, y, z); this.lastSafeYaw = this.facing; this.hasSafe = true;
        }
      }
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
