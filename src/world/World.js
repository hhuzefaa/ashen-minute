import * as THREE from 'three';
import { GATES, ZONES, LEVELS } from './levels.js';
import { makeRng, DEG } from '../game/Palette.js';
import { Relic } from '../objects/Relic.js';
import { ShadowGuide } from '../objects/ShadowGuide.js';
import { TargetRune } from '../objects/TargetRune.js';
import { ShadowBridge } from '../objects/ShadowBridge.js';
import { EmberPickup } from '../objects/EmberPickup.js';
import { HeartEmber } from '../objects/HeartEmber.js';
import { Gate } from '../objects/Gate.js';
import { rail as railVisual } from '../objects/Environment.js';
import { Puzzle, RelicState, railPoint } from '../game/Puzzle.js';
import { Progress } from './Progress.js';

// The whole temple, built once and kept alive for the entire game. Progress (opened gates,
// completed levels, story beats, discoveries) persists in localStorage and is re-applied on load.
const CULL_MARGIN = 28;

export class World {
  constructor(game) {
    this.game = game;
    this.collision = game.collision;
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.zones = [];
    this.gates = new Map();
    this.puzzles = [];
    this.levelById = new Map();
    this.progress = new Progress();
    this.activePuzzle = null;
    this.checkpoint = { x: 0, z: 75.5, yaw: 0 };
    this.zoneOfPlayer = null;
    this.l10 = null;
    this._built = false;
  }

  // ------------------------------------------------------------------------------------------
  build() {
    if (this._built) return;
    this._built = true;
    const mk = (key, rect) => {
      const group = new THREE.Group();
      group.name = key;
      this.root.add(group);
      const ctx = { group, world: this.collision, rng: makeRng(hash(key)), braziers: [], readables: [] };
      const z = { key, rect, group, ctx };
      this.zones.push(z);
      return z;
    };
    for (const zd of ZONES) {
      const z = mk(zd.key, zd.rect);
      zd.build(z.ctx);
      if (zd.key === 'hub') {
        this.hubZone = z;
        this.heart = new HeartEmber(new THREE.Vector3(0, 0, 0));
        z.group.add(this.heart.group);
        this.heart.addCollider(this.collision);
      }
    }
    // gates live in whichever zone contains them (for culling); default to the hub
    for (const gd of GATES) {
      const zone = this.zones.find((z) => inRect(z.rect, gd.x, gd.z, 1)) || this.hubZone;
      const g = new Gate(zone.ctx, gd);
      this.gates.set(gd.id, g);
    }
    for (const L of LEVELS) this.buildLevel(L);
    this.applyProgress();
  }

  buildLevel(L) {
    const zone = L.hub ? this.hubZone : this.zones.find((z) => z.key === 'L' + L.id) || this.makeLevelZone(L);
    const ctx = zone.ctx;
    const prevBraziers = ctx.braziers.length;
    const prevRead = ctx.readables.length;
    L.build(ctx);
    const runeSpecs = new Map(L.runes.map((r) => [r.id, r]));
    const relics = new Map();
    for (const sp of L.relics) {
      const start = sp.rail ? railPoint(sp.rail, sp.rail.start ?? 0) : new THREE.Vector3(sp.at[0], sp.y || 0, sp.at[1]);
      const aimRune = runeSpecs.get(sp.aim);
      const aimYaw = Math.atan2(-(aimRune.at[0] - start.x), -(aimRune.at[1] - start.z));
      const relic = new Relic({ position: start, pedestalHeight: sp.ped ?? 0.95, startYaw: aimYaw + (sp.startDeg ?? 30) * DEG, emblem: sp.emblem, memorySeconds: sp.memory ?? 4 });
      ctx.group.add(relic.group);
      const len = sp.len ?? Math.hypot(aimRune.at[0] - start.x, aimRune.at[1] - start.z);
      const guide = new ShadowGuide(relic, len);
      ctx.group.add(guide.group);
      const collider = this.collision.add({ cx: start.x, cy: (sp.ped ?? 0.95) / 2, cz: start.z, hx: 0.55, hy: (sp.ped ?? 0.95) / 2, hz: 0.55, tag: 'wall', dynamic: !!sp.rail });
      if (sp.rail) railVisual(ctx, { x: sp.rail.from[0], z: sp.rail.from[1] }, { x: sp.rail.to[0], z: sp.rail.to[1] }, sp.rail.slots, { x: sp.rail.lever[0], z: sp.rail.lever[1] });
      const rs = new RelicState(sp, relic, guide, collider);
      rs.aimYaw = aimYaw;
      if (sp.echo) guide.setEcho(relic.yaw);
      relics.set(sp.id, rs);
    }
    const runes = new Map();
    for (const rp of L.runes) {
      const pos = new THREE.Vector3(rp.at[0], rp.y || 0, rp.at[1]);
      const ownerSpec = L.relics.find((r) => r.id === rp.relics[0]);
      const origin = rp.origin ? { x: rp.origin[0], z: rp.origin[1] }
        : ownerSpec?.at ? { x: ownerSpec.at[0], z: ownerSpec.at[1] } : { x: pos.x, z: pos.z + 1 };
      const facing = Math.atan2(-(pos.x - origin.x), -(pos.z - origin.z));
      const view = new TargetRune(pos, facing, { stele: rp.stele !== false, emblem: rp.emblem });
      ctx.group.add(view.group);
      view.addCollider(this.collision);
      let bridge = null;
      if (rp.bridge) {
        const a = pointOnLine(origin, pos, rp.bridge.axis, rp.bridge.from, pos.y);
        const b = pointOnLine(origin, pos, rp.bridge.axis, rp.bridge.to, pos.y);
        bridge = new ShadowBridge(a, b, this.collision);
        ctx.group.add(bridge.group);
      }
      runes.set(rp.id, { spec: rp, view, pos, lit: false, bridge, timer: null });
    }
    let ember = null;
    if (L.ember) {
      ember = new EmberPickup(new THREE.Vector3(L.ember[0], L.emberY ?? 1.1, L.ember[1]));
      ctx.group.add(ember.group);
    }
    const p = new Puzzle(this.game, L, {
      relics, runes, ember,
      braziers: ctx.braziers.slice(prevBraziers),
      readables: ctx.readables.slice(prevRead),
    });
    p.zone = zone;
    this.puzzles.push(p);
    this.levelById.set(L.id, p);
    if (L.hub) {
      this.l10 = p;
      const fb = L.finalBridge;
      this.finalBridge = new ShadowBridge(new THREE.Vector3(fb.from[0], 0, fb.from[1]), new THREE.Vector3(fb.to[0], 0, fb.to[1]), this.collision);
      zone.group.add(this.finalBridge.group);
      this.ringHearth = ctx.ringHearth;
    }
  }

  makeLevelZone(L) {
    const group = new THREE.Group();
    group.name = 'L' + L.id;
    this.root.add(group);
    const ctx = { group, world: this.collision, rng: makeRng(L.id * 101 + 7), braziers: [], readables: [] };
    const z = { key: 'L' + L.id, rect: L.rect, group, ctx, level: L };
    this.zones.push(z);
    return z;
  }

  // ------------------------------------------------------------------------------------------
  /** Gates, solved puzzles and hub warmth from the saved progress (no animations). */
  applyProgress() {
    const pr = this.progress.data;
    for (const g of this.gates.values()) g.setOpenInstant(pr.gates.includes(g.id) || !!GATES.find((d) => d.id === g.id).open);
    for (const p of this.puzzles) {
      if (pr.completed.includes(p.level.id)) p.applyCompleted();
    }
    if (pr.completed.includes(9)) this.wakeRing(false);
    this.updateHubBraziers(true);
    if (pr.checkpoint) this.checkpoint = { ...pr.checkpoint };
  }

  resetAll() {
    this.progress.reset();
    for (const p of this.puzzles) {
      p.completed = false;
      if (p.ember) { p.ember.collected = false; p.ember.group.visible = true; }
      p.reset();
      for (const b of p.braziers) if (!b.eternal) { b.lit = false; b.level = 0; }
      for (const rs of p.relics.values()) rs.awake = false;
    }
    p10Reset(this);
    this.checkpoint = { x: 0, z: 75.5, yaw: 0 };
    this.applyProgress();
  }

  openGate(id, animate = true) {
    const g = this.gates.get(id);
    if (!g) return;
    if (!this.progress.data.gates.includes(id)) { this.progress.data.gates.push(id); this.progress.save(); }
    if (g.isOpen) return;
    if (animate) { g.open(); this.game.audio.play('sfx_door'); }
    else g.setOpenInstant(true);
  }

  onLevelComplete(puzzle) {
    const L = puzzle.level;
    const pr = this.progress.data;
    const game = this.game;
    if (!pr.completed.includes(L.id)) pr.completed.push(L.id);
    pr.embers = pr.completed.length;
    this.progress.save();
    game.audio.play('sfx_ember_collect');
    game.effects.burst(puzzle.ember.base, 60, game.effects.c.hot, 3.2, 0.15, 1.2);
    puzzle.ember.group.visible = false;
    game.onEmbers(pr.completed.length);
    this.updateHubBraziers(false);
    for (const id of L.onComplete.gates || []) this.openGate(id, true);
    game.story.onLevelComplete(L);
    if (L.id === 9) this.wakeRing(true);
  }

  /** After the Mirror Hall: the three ring relics and the hub's hearth awaken (Level X). */
  wakeRing(animate) {
    if (!this.l10) return;
    for (const rs of this.l10.relics.values()) rs.awake = true;
    if (this.ringHearth) { this.ringHearth.lit = true; this.ringHearth.level = 1; }
    if (animate) this.game.audio.play('sfx_heart_ignite');
  }

  onSocket(puzzle) {
    if (puzzle !== this.l10) return;
    const all = [...puzzle.runes.values()].every((r) => r.lit);
    if (all && !puzzle.level.allSocketsDone) {
      puzzle.level.allSocketsDone = true;
      this.finalBridge.appear();
      this.game.audio.play('sfx_bridge_form', { count: this.finalBridge.slabs.length });
      this.heart.sealLevel = 3;
      this.heart.awake = 0.25;
      puzzle.showFlash('THE HEART REMEMBERS THE WAY', 'gold', 3);
      this.game.story.trigger('sockets_done');
    } else if (!all) {
      const n = [...puzzle.runes.values()].filter((r) => r.lit).length;
      this.heart.sealLevel = n;
    }
  }

  updateHubBraziers(instant) {
    const n = this.progress.data.completed.length;
    const list = this.hubZone.ctx.progressBraziers || [];
    list.forEach((b, i) => {
      const on = i < n;
      if (on && !b.lit) { b.lit = true; if (instant) b.level = 1; }
      if (!on) { b.lit = false; b.level = 0; }
    });
  }

  // ------------------------------------------------------------------------------------------
  levelAt(x, z) {
    for (const p of this.puzzles) {
      if (p.level.hub) continue;
      if (inRect(p.level.rect, x, z, 0)) return p;
    }
    if (inRect(this.l10.level.rect, x, z, 0)) return this.l10;
    return null;
  }

  update(dt, input, player, camera, playing) {
    const p = player.pos;
    // zone visibility (cheap distance culling; fog hides the edge)
    for (const z of this.zones) {
      const [x0, x1, z0, z1] = z.rect;
      const dx = Math.max(x0 - p.x, 0, p.x - x1), dz = Math.max(z0 - p.z, 0, p.z - z1);
      z.group.visible = dx * dx + dz * dz < CULL_MARGIN * CULL_MARGIN;
    }
    const active = playing ? this.levelAt(p.x, p.z) : null;
    if (active !== this.activePuzzle) {
      if (this.activePuzzle) this.activePuzzle.selected = null;
      this.activePuzzle = active;
      if (active && playing) this.enterLevel(active);
    }
    for (const g of this.gates.values()) g.update(dt);
    for (const pz of this.puzzles) {
      if (!pz.zone.group.visible && pz !== active) continue;
      pz.update(dt, input, player, camera, pz === active);
    }
    this.finalBridge?.update(dt);
    this.heart.update(dt);
    // braziers in visible zones burn
    for (const z of this.zones) {
      if (!z.group.visible) continue;
      for (const b of z.ctx.braziers) {
        if (b.lit) b.level = Math.min(1, b.level + dt * 1.5);
        const lv = b.lit ? b.level : 0;
        if (lv > 0) this.game.effects.flame(b.pos, (b.eternal ? 40 : 22) * lv * this.game.fxScale, dt, b.eternal ? 0.5 : 0.35, b.eternal ? 1.3 : 0.9);
        const t = this.game.time;
        const flick = 0.85 + Math.sin(t * 13 + b.pos.x) * 0.08 + Math.sin(t * 7.7 + b.pos.z) * 0.07;
        b.light.intensity = lv * (b.eternal ? 8 : 5) * flick;
        b.coalsMat.color.set(lv > 0 ? 0xff8a32 : 0x1a1210).multiplyScalar(lv > 0 ? 0.6 + lv * 1.4 * flick : 1);
      }
    }
  }

  enterLevel(p) {
    const L = p.level;
    if (!p.completed) {
      this.checkpoint = { x: L.spawn[0], z: L.spawn[1], yaw: L.spawn[2] };
      this.progress.data.checkpoint = this.checkpoint;
      this.progress.save();
    }
    this.game.onEnterLevel(L, p);
  }

  /** Re-seat the checkpoint when the Keeper reaches the hub or a corridor safely. */
  setCheckpoint(x, z, yaw) {
    this.checkpoint = { x, z, yaw };
    this.progress.data.checkpoint = this.checkpoint;
    this.progress.save();
  }

  restartActivePuzzle() {
    const p = this.activePuzzle;
    if (!p || p.completed) return false;
    if (p === this.l10) p.level.allSocketsDone = false;
    p.reset();
    if (p === this.l10) for (const rs of p.relics.values()) rs.awake = true;
    return true;
  }
}

function p10Reset(world) {
  if (!world.l10) return;
  world.l10.level.allSocketsDone = false;
  world.finalBridge.hideImmediate();
  world.heart.sealLevel = 0;
  world.heart.awake = 0;
  if (world.ringHearth) { world.ringHearth.lit = false; world.ringHearth.level = 0; }
}

function inRect(r, x, z, m) { return x >= r[0] - m && x <= r[1] + m && z >= r[2] - m && z <= r[3] + m; }

function pointOnLine(a, b, axis, v, y = 0) {
  if (axis === 'z') { const t = (v - a.z) / (b.z - a.z); return new THREE.Vector3(a.x + (b.x - a.x) * t, y, v); }
  const t = (v - a.x) / (b.x - a.x);
  return new THREE.Vector3(v, y, a.z + (b.z - a.z) * t);
}

function hash(s) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) + 1; }
