import * as THREE from 'three';
import level1 from '../levels/level1.js';
import level2 from '../levels/level2.js';
import level3 from '../levels/level3.js';
import { yawTo, onLineAtZ } from '../levels/helpers.js';
import { makeRng, DEG, COLORS } from './Palette.js';
import { Relic } from '../objects/Relic.js';
import { ShadowGuide } from '../objects/ShadowGuide.js';
import { TargetRune } from '../objects/TargetRune.js';
import { ShadowBridge } from '../objects/ShadowBridge.js';
import { EmberPickup, emberMesh } from '../objects/EmberPickup.js';
import { HeartEmber } from '../objects/HeartEmber.js';
import { PuzzleManager, ROOM } from './PuzzleManager.js';

export const LEVELS = [level1, level2, level3];

// Room loading/reset, checkpoint, ember count, finale and victory (doc §11.2, §12.2).
export class LevelManager {
  constructor(game) {
    this.game = game;
    this.index = 0;
    this.room = null;     // { group, puzzle, level, ... }
    this.emberCount = 0;
    this.awarded = new Set();
    this.finale = null;
    this.runStart = 0;
    this.totalRewinds = 0;
  }

  get puzzle() { return this.room?.puzzle; }
  get level() { return this.room?.level; }

  newRun() {
    this.emberCount = 0;
    this.awarded.clear();
    this.totalRewinds = 0;
    this.runStart = performance.now();
    this.game.player.keeper.setEmberLevel(0);
    this.game.audio.setWarmth(0);
    this.game.setWarmth(0);
    this.load(0);
  }

  // -----------------------------------------------------------------------------------------
  load(index) {
    this.unload();
    const game = this.game;
    const level = LEVELS[index];
    this.index = index;
    const group = new THREE.Group();
    group.name = `Room${level.id}`;
    game.scene.add(group);
    game.world.clear();
    const ctx = { group, world: game.world, rng: makeRng(level.id * 101 + 7), braziers: [], lights: [] };
    level.build(ctx);

    // puzzle objects
    const relicPos = new THREE.Vector3(level.relic.x, 0, level.relic.z);
    const targetPos = new THREE.Vector3(level.target.x, 0, level.target.z);
    const targetYaw = yawTo(relicPos, targetPos);
    const startYaw = targetYaw + level.relic.startOffsetDeg * DEG;
    const relic = new Relic({ position: relicPos, pedestalHeight: level.relic.pedestalHeight, startYaw });
    group.add(relic.group);
    game.world.add({ cx: relicPos.x, cy: level.relic.pedestalHeight / 2, cz: relicPos.z, hx: 0.55, hy: level.relic.pedestalHeight / 2, hz: 0.55, tag: 'wall' });

    const dist = relicPos.distanceTo(targetPos);
    const guide = new ShadowGuide(relic, dist);
    group.add(guide.group);
    if (level.mode === 'collar') guide.setEcho(startYaw);

    const target = new TargetRune(targetPos, targetYaw);
    group.add(target.group);
    target.addCollider(game.world);

    const bStart = onLineAtZ(relicPos, targetPos, level.bridgeZ[0]);
    const bEnd = onLineAtZ(relicPos, targetPos, level.bridgeZ[1]);
    const bridge = new ShadowBridge(bStart, bEnd, game.world);
    group.add(bridge.group);

    const ember = new EmberPickup(level.ember);
    group.add(ember.group);

    let heart = null;
    if (level.heart) {
      heart = new HeartEmber(level.heart);
      group.add(heart.group);
      heart.addCollider(game.world);
      heart.sealLevel = 0;
    }

    // abyss glow far below the gaps (fire still burning in the depths)
    const abyssMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.fire).multiplyScalar(0.35), transparent: true, opacity: 0.5, depthWrite: false, map: game.glowTex });
    const abyss = new THREE.Mesh(new THREE.PlaneGeometry(level.abyss.w, level.abyss.d * 2.2), abyssMat);
    abyss.rotation.x = -Math.PI / 2;
    abyss.position.set(level.abyss.x, -16, level.abyss.z);
    group.add(abyss);

    const puzzle = new PuzzleManager(game, level, { relic, guide, target, bridge, ember, braziers: ctx.braziers, echoTablet: ctx.echoTablet, targetYaw });
    this.room = { group, level, puzzle, relic, guide, target, bridge, ember, heart, braziers: ctx.braziers, exit: ctx.exit, abyss, ctx };

    // player + camera
    const sp = new THREE.Vector3(level.spawn.x, 0, level.spawn.z);
    game.player.setSpawn(sp, level.spawn.yaw);
    game.player.killY = level.killY;
    game.player.respawn();
    game.cameraCtl.snap(level.spawn.yaw, 0.3);
    game.effects.clear();
    game.effects.ashBounds = level.ash;
    game.fitShadowCamera(level);
  }

  unload() {
    if (!this.room) return;
    this.room.puzzle.dispose();
    const g = this.room.group;
    this.game.scene.remove(g);
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (!m.userData.shared) m.dispose(); });
      }
    });
    this.room = null;
  }

  restartRoom() {
    // previously earned embers remain; everything room-owned is rebuilt from data
    this.load(this.index);
    this.game.ui.card(`${this.level.numeral}`, this.level.name, 2.2);
  }

  // -----------------------------------------------------------------------------------------
  onEmberReached(puzzle) {
    const game = this.game;
    const id = puzzle.level.id;
    if (this.awarded.has(id)) return; // award each ember once
    this.awarded.add(id);
    this.emberCount = this.awarded.size;
    this.totalRewinds += puzzle.stats.rewinds;
    game.audio.play('sfx_ember_collect');
    game.effects.burst(puzzle.ember.base, 60, game.effects.c.hot, 3.2, 0.15, 1.2);
    puzzle.ember.group.visible = false;
    game.player.keeper.setEmberLevel(this.emberCount);
    game.audio.setWarmth(this.emberCount);
    game.ui.setEmbers(this.emberCount);

    if (id === 3) {
      game.startFinale();
      return;
    }
    puzzle.setState(ROOM.COMPLETE);
    game.setWarmth(this.emberCount);
    game.transitionTo(() => {
      this.load(this.index + 1);
      game.ui.card(this.level.numeral, this.level.name, 2.6);
    });
  }

  // -----------------------------------------------------------------------------------------
  update(dt) {
    const r = this.room;
    if (!r) return;
    const fx = this.game.effects;
    for (const b of r.braziers) {
      const lv = b.lit ? b.level : 0;
      if (lv > 0) fx.flame(b.pos, 26 * lv, dt, 0.35, 0.9);
      const flick = 0.85 + Math.sin(this.game.time * 13 + b.pos.x) * 0.08 + Math.sin(this.game.time * 7.7 + b.pos.z) * 0.07;
      b.light.intensity = lv * 6 * flick;
      b.coalsMat.color.set(lv > 0 ? COLORS.fire : 0x1a1210).multiplyScalar(lv > 0 ? 0.6 + lv * 1.4 * flick : 1);
    }
    if (r.relic.lit) fx.flame(r.relic.flamePoint, 34, dt, 0.16, 1);
    if (r.heart) r.heart.update(dt);
    if (this.finale) this.updateFinale(dt);
  }

  // -----------------------------------------------------------------------------------------
  /** Heart Ember finale (doc §6.5): three embers converge, seal completes, arch opens. */
  startFinale() {
    const r = this.room;
    const heart = r.heart;
    const from = this.game.player.keeper.lanternCore.getWorldPosition(new THREE.Vector3());
    const orbs = [0, 1, 2].map((i) => {
      const m = emberMesh(0.9);
      m.position.copy(from);
      r.group.add(m);
      return { m, i, start: from.clone().add(new THREE.Vector3((i - 1) * 0.6, 0.6 + i * 0.1, 0)), delay: 0.3 + i * 0.35, done: false };
    });
    this.finale = { t: 0, orbs, heart, phase: 0, doorStart: r.exit?.door?.position.y ?? 0 };
  }

  updateFinale(dt) {
    const f = this.finale;
    const game = this.game;
    f.t += dt;
    const tgt = new THREE.Vector3();
    for (const o of f.orbs) {
      if (o.done) continue;
      const k = Math.min(1, Math.max(0, (f.t - o.delay) / 1.5));
      f.heart.socketWorld(o.i, tgt);
      const e = k * k * (3 - 2 * k);
      const mid = o.start.clone().lerp(tgt, 0.5).add(new THREE.Vector3(0, 2.2, 0));
      // quadratic bezier arc
      const a = o.start.clone().lerp(mid, e), b = mid.clone().lerp(tgt, e);
      o.m.position.copy(a.lerp(b, e));
      o.m.rotation.y += dt * 4;
      if (k > 0 && Math.random() < 0.7) game.effects.flame(o.m.position, 30, dt, 0.05, 0.5);
      if (k >= 1) {
        o.done = true;
        o.m.visible = false;
        f.heart.sealLevel = o.i + 1;
        game.audio.play('sfx_ember_collect');
        game.effects.burst(tgt, 30, game.effects.c.hot, 2, 0.12, 0.9);
      }
    }
    // Heart ignites after the third ember arrives (~2.0 s)
    if (f.phase === 0 && f.t > 2.2) {
      f.phase = 1;
      game.audio.play('sfx_heart_ignite');
      game.effects.burst(f.heart.core.getWorldPosition(new THREE.Vector3()), 160, game.effects.c.hot, 6, 0.2, 2.2);
      game.setWarmth(4);
      for (const b of this.room.braziers) b.lit = true;
    }
    if (f.phase >= 1) f.heart.awake = Math.min(1, f.heart.awake + dt / 1.2);
    if (f.phase === 1 && f.t > 3.4) {
      f.phase = 2;
      game.ui.flashText('THE TEMPLE REMEMBERS', 4.5);
      game.audio.play('sfx_door');
    }
    if (f.phase >= 2) {
      const door = this.room.exit?.door;
      if (door) door.position.y = f.doorStart - Math.min(1, (f.t - 3.4) / 2.2) * 4.0; // sinks into the floor
    }
    if (f.phase === 2 && f.t > 7.6) {
      f.phase = 3;
      this.finale = null;
      game.showVictory();
    }
  }
}
