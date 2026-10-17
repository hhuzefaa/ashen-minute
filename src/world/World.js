import * as THREE from 'three';
import { GATES, ZONES, LEVELS, ROOMS, ROOM_COUNT } from './levels.js';
import { makeRng, DEG, COLORS } from '../game/Palette.js';
import { Relic } from '../objects/Relic.js';
import { TargetRune } from '../objects/TargetRune.js';
import { ShadowBridge } from '../objects/ShadowBridge.js';
import { EmberPickup } from '../objects/EmberPickup.js';
import { HeartEmber } from '../objects/HeartEmber.js';
import { Gate } from '../objects/Gate.js';
import { rail as railVisual, brazier } from '../objects/Environment.js';
import { LightPuzzle, railPoint } from '../game/LightPuzzle.js';
import { SHADOW } from '../game/ShadowSystem.js';
import { Progress } from './Progress.js';
import { FEATURES } from '../game/Features.js';
import { TUTORIAL_ZONES, TUTORIAL_LEVELS, TUTORIAL_GATES } from './tutorial.js';

// The whole temple, built once and kept alive for the entire game. Progress (opened gates,
// restored rooms, story beats, discoveries, Lost Minutes) persists in localStorage.
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
    this.lightPuzzles = this.puzzles; // every room is a light room now
    this.lostMinutes = [];
    this.levelById = new Map();
    this.progress = new Progress(new Set(LEVELS.map((L) => L.id)), LEVELS.find((L) => L.hub)?.id);
    this.activePuzzle = null;
    this.checkpoint = { x: 0, z: 75.5, yaw: 0 };
    this.l10 = null;
    this._built = false;
  }

  // ------------------------------------------------------------------------------------------
  build() {
    if (this._built) return;
    this._built = true;
    // the story's temple, then the training court (the optional tutorial, far out in the void)
    for (const zd of [...ZONES, ...TUTORIAL_ZONES]) {
      const z = this.makeZone(zd.key, zd.rect);
      zd.build(z.ctx);
      if (zd.key === 'hub') {
        this.hubZone = z;
        this.heart = new HeartEmber(new THREE.Vector3(0, 0, 0));
        z.group.add(this.heart.group);
        this.heart.addCollider(this.collision);
      }
    }
    // gates live in whichever zone contains them (for culling); default to the hub
    for (const gd of [...GATES, ...TUTORIAL_GATES]) {
      const zone = this.zones.find((z) => inRect(z.rect, gd.x, gd.z, 1)) || this.hubZone;
      const gate = new Gate(zone.ctx, gd);
      gate.tutorial = !!gd.tutorial; // a training-court gate: never saved
      this.gates.set(gd.id, gate);
    }
    for (const L of [...LEVELS, ...TUTORIAL_LEVELS]) this.buildLevel(L);
    this.checkRuleTruth();
    this.applyProgress();
  }

  makeZone(key, rect, seed = key) {
    const group = new THREE.Group();
    group.name = key;
    this.root.add(group);
    const ctx = { group, world: this.collision, rng: makeRng(hash(String(seed))), braziers: [], readables: [] };
    const z = { key, rect, group, ctx };
    this.zones.push(z);
    return z;
  }

  /** Rule 1 must never lie: no decorative fire (brazier or ember) within REACH of any stone. */
  checkRuleTruth() {
    const stones = this.puzzles.flatMap((p) => p.stones);
    this.ruleWarnings = [];
    const fires = [];
    for (const z of this.zones) for (const b of z.ctx.braziers) if (!b.sconce) fires.push(['brazier', b.pos]);
    for (const p of this.puzzles) if (p.ember) fires.push(['ember', p.ember.base]);
    for (const [kind, pos] of fires) {
      for (const st of stones) {
        const d = Math.hypot(pos.x - st.base.x, pos.z - st.base.z);
        if (d <= SHADOW.REACH) {
          const w = `decorative ${kind} at (${pos.x}, ${pos.z}) is ${d.toFixed(1)} m from stone ${st.id} of level ${st.level} — rule 1 would lie`;
          this.ruleWarnings.push(w);
          console.warn('[rules]', w);
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  buildLevel(L) {
    const zone = L.hub ? this.hubZone : this.makeZone('L' + L.id, L.rect, L.id * 101 + 7);
    const ctx = zone.ctx;
    const prevBraziers = ctx.braziers.length;
    const prevRead = ctx.readables.length;
    L.build(ctx);
    const stones = [];
    for (const sp of L.stones) {
      const base = sp.rail ? railPoint(sp.rail, sp.rail.start ?? 0) : new THREE.Vector3(sp.at[0], sp.y || 0, sp.at[1]);
      const ped = sp.ped ?? 0.95;
      const relic = new Relic({ position: base, pedestalHeight: ped, startYaw: (sp.faceDeg ?? 0) * DEG });
      relic.group.traverse((o) => { o.castShadow = false; }); // only fires cast a stone's shadow (no moon shadow)
      ctx.group.add(relic.group);
      // 'stone': solid to walk into, but never blocks light or other stones' shadows
      const collider = this.collision.add({ cx: base.x, cy: ped / 2, cz: base.z, hx: 0.55, hy: ped / 2, hz: 0.55, tag: 'stone', dynamic: !!sp.rail });
      if (sp.rail) railVisual(ctx, { x: sp.rail.from[0], z: sp.rail.from[1] }, { x: sp.rail.to[0], z: sp.rail.to[1] }, sp.rail.slots, { x: sp.rail.lever[0], z: sp.rail.lever[1] });
      stones.push({ id: sp.id, level: L.id, spec: sp, relic, base: relic.base, collider, dormant: !!sp.dormant, awake: false, shadows: new Map(), glow: 0, rail: sp.rail || null, slot: sp.rail ? sp.rail.start ?? 0 : 0, moving: null });
    }
    const runes = new Map();
    for (const rp of L.runes) {
      const pos = new THREE.Vector3(rp.at[0], rp.y || 0, rp.at[1]);
      const owner = stones.find((s) => s.id === rp.stones[0]);
      const facing = owner ? Math.atan2(-(pos.x - owner.base.x), -(pos.z - owner.base.z)) : 0;
      const view = new TargetRune(pos, facing, { stele: rp.stele !== false, emblem: rp.emblem });
      ctx.group.add(view.group);
      view.addCollider(this.collision);
      let bridge = null;
      if (rp.bridge) {
        bridge = new ShadowBridge(new THREE.Vector3(rp.bridge.from[0], 0, rp.bridge.from[1]), new THREE.Vector3(rp.bridge.to[0], 0, rp.bridge.to[1]), this.collision);
        ctx.group.add(bridge.group);
      }
      runes.set(rp.id, { spec: rp, view, pos, lit: false, bridge, coverKey: null, coverT: 0, wrongKey: null, covered: false, near: 0 });
    }
    const sconces = [];
    for (const sc of L.sconces || []) {
      const b = brazier(ctx, sc.at[0], sc.at[1], { sconce: true, id: sc.id, burn: sc.burn ?? 20 });
      b.lightId = 's:' + sc.id;
      b.relayT = 0;
      b.warded = !!sc.warded; // out of reach (grille / balustrade / abyss): only a shadow can light it
      b.reveal = sc.reveal || null; // a Lost Minute appears when this fire first catches
      sconces.push(b);
    }
    let ember = null;
    if (L.ember) {
      ember = new EmberPickup(new THREE.Vector3(L.ember[0], L.emberY ?? 1.1, L.ember[1]));
      ctx.group.add(ember.group);
      if (L.emberAfterSockets) ember.group.visible = false;
    }
    let grant = null;
    if (L.grant) {
      // Marrow's sigil: a cyan ring on the floor; stepping onto it grants the minute-mark
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.time).multiplyScalar(1.4), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(new THREE.RingGeometry(0.75, 0.9, 40).rotateX(-Math.PI / 2), m));
      mesh.add(new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 3).rotateX(-Math.PI / 2), m));
      mesh.position.set(L.grant.at[0], 0.05, L.grant.at[1]);
      ctx.group.add(mesh);
      grant = { spec: L.grant, mesh };
    }
    const pickups = (L.lostMinutes || []).map((lm) => this.makeLostMinute(ctx, lm));
    // BACKWARD_ECHO: warm reversed sigils (a recording started on one replays end → start)
    const backSigils = FEATURES.BACKWARD_ECHO ? (L.backSigils || []).map((b) => {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.fire).multiplyScalar(1.5), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.RingGeometry(0.62, 0.74, 32).rotateX(-Math.PI / 2), m));
      g.add(new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 3, 1, Math.PI, Math.PI * 2).rotateX(-Math.PI / 2).rotateY(Math.PI), m));
      g.position.set(b.at[0], 0.05, b.at[1]);
      ctx.group.add(g);
      return { x: b.at[0], z: b.at[1] };
    }) : [];
    const p = new LightPuzzle(this.game, L, {
      stones, runes, sconces, ember, grant, pickups, backSigils,
      braziers: ctx.braziers.slice(prevBraziers),
      readables: ctx.readables.slice(prevRead),
    });
    // a passage's main crossing: a permanent slab bridge, formed once its wing is open
    p.bridges = (L.bridges || []).map((b) => {
      const br = new ShadowBridge(new THREE.Vector3(b.from[0], 0, b.from[1]), new THREE.Vector3(b.to[0], 0, b.to[1]), this.collision);
      ctx.group.add(br.group);
      return br;
    });
    p.zone = zone;
    this.puzzles.push(p);
    this.levelById.set(L.id, p);
    if (L.hub) {
      this.l10 = p;
      const fb = L.finalBridge;
      this.finalBridge = new ShadowBridge(new THREE.Vector3(fb.from[0], 0, fb.from[1]), new THREE.Vector3(fb.to[0], 0, fb.to[1]), this.collision);
      zone.group.add(this.finalBridge.group);
    }
  }

  /** Optional fragment of Ilen's past (Lost Minute). `hidden` ones appear when a rune reveals them. */
  makeLostMinute(ctx, lm) {
    const e = new EmberPickup(new THREE.Vector3(lm.at[0], lm.y ?? 1.1, lm.at[1]), { lost: true });
    e.id = lm.id;
    e.hiddenAtStart = !!lm.hidden;
    e.hidden = !!lm.hidden;
    e.radius = 0.9;
    ctx.group.add(e.group);
    this.lostMinutes.push(e);
    return e;
  }

  syncLostMinutes() {
    const got = this.progress.data.lostMinutes;
    for (const e of this.lostMinutes) {
      e.collected = got.includes(e.id);
      e.hidden = e.hiddenAtStart;
      e.group.visible = !e.collected && !e.hidden;
    }
  }

  revealLostMinute(id) {
    const e = this.lostMinutes.find((x) => x.id === id);
    if (!e || e.collected || !e.hidden) return;
    e.hidden = false;
    e.group.visible = true;
    this.game.audio.play('sfx_echo_release');
  }

  collectLostMinute(e) {
    if (e.collected || e.hidden) return;
    e.collected = true;
    e.group.visible = false;
    this.progress.mark('lostMinutes', e.id);
    this.game.audio.play('sfx_ember_collect');
    this.game.effects.burst(e.base, 50, this.game.effects.c.time, 2.6, 0.12, 1.2, this.game.effects.time);
    this.game.story.lostMinute(e.id);
  }

  // ------------------------------------------------------------------------------------------
  get roomsDone() { return this.progress.data.completed.filter((id) => ROOMS.includes(id)).length; }
  get ringAwake() { return this.progress.data.completed.includes(9); }

  /** Gates, restored rooms, passages and hub warmth from the saved progress (no animations). */
  applyProgress() {
    const pr = this.progress.data;
    for (const g of this.gates.values()) {
      if (g.tutorial) { g.setOpenInstant(false); continue; } // the court's gates belong to the court
      g.setOpenInstant(pr.gates.includes(g.id) || !!GATES.find((d) => d.id === g.id).open);
    }
    for (const p of this.puzzles) {
      if (pr.completed.includes(p.level.id) && !p.level.hub) p.applyCompleted();
      if (p.passage) this.openPassage(p, pr.completed.includes(p.level.openWith), false);
    }
    this.ringSleep();
    if (this.ringAwake) this.wakeRing(false);
    this.syncLostMinutes();
    this.updateHubBraziers(true);
    if (pr.checkpoint) this.checkpoint = { ...pr.checkpoint };
  }

  /** A passage wakes with the room before it: its bridge stands formed, its fires burn. */
  openPassage(p, open, animate) {
    for (const br of p.bridges) {
      if (open && br.state === 'HIDDEN') { if (animate) br.appear(); else br.appear(); }
      if (!open) br.hideImmediate();
    }
    for (const b of p.decor) { b.lit = open; b.level = open && !animate ? 1 : b.level; }
  }

  resetAll() {
    this.progress.reset();
    for (const p of this.puzzles) {
      p.completed = false;
      if (p.ember) { p.ember.collected = false; p.ember.group.visible = !p.level.emberAfterSockets; }
      p.reset();
      for (const b of p.braziers) if (!b.eternal) { b.lit = false; b.level = 0; }
    }
    this.finalBridge.hideImmediate();
    this.heart.sealLevel = 0;
    this.heart.awake = 0;
    this.checkpoint = { x: 0, z: 75.5, yaw: 0 };
    this.applyProgress();
  }

  openGate(id, animate = true) {
    const g = this.gates.get(id);
    if (!g) return;
    if (!g.tutorial && !this.progress.data.gates.includes(id)) { this.progress.data.gates.push(id); this.progress.save(); }
    if (g.isOpen) return;
    if (animate) { g.open(); this.game.audio.play('sfx_door'); }
    else g.setOpenInstant(true);
  }

  onLevelComplete(puzzle) {
    const L = puzzle.level;
    const pr = this.progress.data;
    const game = this.game;
    if (!pr.completed.includes(L.id)) pr.completed.push(L.id);
    pr.embers = this.roomsDone;
    this.progress.save();
    game.audio.play('sfx_ember_collect');
    game.effects.burst(puzzle.ember.base, 60, game.effects.c.hot, 3.2, 0.15, 1.2);
    puzzle.ember.group.visible = false;
    if (L.hub) { game.story.onLevelComplete(L); return; }
    game.onEmbers(this.roomsDone);
    this.updateHubBraziers(false);
    for (const id of L.onComplete.gates || []) this.openGate(id, true);
    for (const p of this.puzzles) if (p.passage && p.level.openWith === L.id) this.openPassage(p, true, true);
    game.story.onLevelComplete(L);
    if (L.id === 9) this.wakeRing(true);
  }

  ringSleep() {
    for (const st of this.l10.stones) st.awake = false;
  }

  /** After the Mirror Hall: the three ring stones wake (the Heart of Minutes). */
  wakeRing(animate) {
    for (const st of this.l10.stones) st.awake = true;
    if (animate) this.game.audio.play('sfx_heart_ignite');
  }

  /** The Heart: all three ring shadows held together. */
  onAllSockets(puzzle) {
    this.finalBridge.appear();
    this.game.audio.play('sfx_bridge_form', { count: this.finalBridge.slabs.length });
    this.heart.sealLevel = 3;
    this.heart.awake = 0.25;
    if (puzzle.ember) puzzle.ember.group.visible = true;
    puzzle.showFlash('THE HEART REMEMBERS THE WAY', 'gold', 3);
    this.game.story.trigger('sockets_done');
  }

  updateHubBraziers(instant) {
    const n = this.roomsDone;
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
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i], r = z.rect, x0 = r[0], x1 = r[1], z0 = r[2], z1 = r[3]; // (no destructuring: runs every step)
      const dx = Math.max(x0 - p.x, 0, p.x - x1), dz = Math.max(z0 - p.z, 0, p.z - z1);
      z.group.visible = dx * dx + dz * dz < CULL_MARGIN * CULL_MARGIN;
    }
    const active = playing ? this.levelAt(p.x, p.z) : null;
    if (active !== this.activePuzzle) {
      this.activePuzzle = active;
      if (active && playing) this.enterLevel(active);
    }
    for (const g of this.gates.values()) g.update(dt);
    for (const pz of this.puzzles) {
      if (!pz.zone.group.visible && pz !== active) continue;
      pz.update(dt, input, player, camera, pz === active);
      for (const br of pz.bridges) br.update(dt);
    }
    this.finalBridge.update(dt);
    this.heart.update(dt);
    // braziers in visible zones burn (and the nearest burning one sets the fire ambience level)
    const t = this.game.time;
    let near2 = Infinity;
    for (const z of this.zones) {
      if (!z.group.visible) continue;
      for (const b of z.ctx.braziers) {
        if (b.lit) b.level = Math.min(1, b.level + dt * 1.5);
        let lv = b.lit ? b.level : 0;
        let flick = 0.85 + Math.sin(t * 13 + b.pos.x) * 0.08 + Math.sin(t * 7.7 + b.pos.z) * 0.07;
        if (b.sconce) {
          if (b.lit && Number.isFinite(b.burn)) {
            lv *= 0.45 + 0.55 * Math.min(1, b.burnT / b.burn);          // burns down
            if (b.burnT < 3) flick *= 0.45 + 0.55 * Math.abs(Math.sin(t * 19)); // gutters before it dies
          } else if (!b.lit && Math.sin(t * 3.1 + b.pos.x) > 0.6) this.game.effects.flame(b.pos, 3 * this.game.fxScale, dt, 0.12, 0.35);
        }
        if (lv > 0) {
          this.game.effects.flame(b.pos, (b.eternal ? 40 : 22) * lv * this.game.fxScale, dt, b.eternal ? 0.5 : 0.35, b.eternal ? 1.3 : 0.9);
          const dx = b.pos.x - p.x, dz = b.pos.z - p.z, d2 = dx * dx + dz * dz;
          if (d2 < near2) near2 = d2;
        }
        b.light.intensity = lv * (b.eternal ? 8 : 5) * flick;
        b.coalsMat.color.set(lv > 0 ? 0xff8a32 : 0x1a1210).multiplyScalar(lv > 0 ? 0.6 + lv * 1.4 * flick : 1);
      }
    }
    this.nearestFire = Math.sqrt(near2); // Infinity when nothing burns nearby
  }

  enterLevel(p) {
    const L = p.level;
    if (L.tutorial) { this.game.tutorial.onEnterSection(p); this.game.onEnterLevel(L, p); return; } // never a story checkpoint
    if (!p.completed && !p.passage) {
      this.checkpoint = { x: L.spawn[0], z: L.spawn[1], yaw: L.spawn[2] };
      this.progress.data.checkpoint = this.checkpoint;
      this.progress.save();
    }
    this.game.onEnterLevel(L, p);
  }

  setCheckpoint(x, z, yaw) {
    this.checkpoint = { x, z, yaw };
    this.progress.data.checkpoint = this.checkpoint;
    this.progress.save();
  }

  /** Backspace: reset the current room. Works on restored rooms too (to replay / re-record);
   *  world progress — opened gates, earned embers, Lost Minutes — is never taken away. */
  restartActivePuzzle() {
    const p = this.activePuzzle;
    if (!p || p.passage) return false;
    if (p === this.l10) {
      if (!this.ringAwake || p.completed) return false;
      this.finalBridge.hideImmediate();
      this.heart.sealLevel = 0;
      this.heart.awake = 0;
      if (p.ember) { p.ember.collected = false; p.ember.group.visible = false; }
      p.reset();
      return true;
    }
    p.reset();
    p.completed = false;
    if (p.ember) { p.ember.collected = false; p.ember.group.visible = true; }
    return true;
  }
}

function inRect(r, x, z, m) { return x >= r[0] - m && x <= r[1] + m && z >= r[2] - m && z <= r[3] + m; }

function hash(s) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) + 1; }

export { ROOM_COUNT };
