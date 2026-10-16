import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Input } from './Input.js';
import { CollisionWorld } from './CollisionWorld.js';
import { PlayerController } from './PlayerController.js';
import { CameraController } from './CameraController.js';
import { UIManager } from './UIManager.js';
import { AudioManager } from './AudioManager.js';
import { Effects } from './Effects.js';
import { Settings } from './Settings.js';
import { LightPool } from './LightPool.js';
import { COLORS, glowTexture } from './Palette.js';
import { World } from '../world/World.js';
import { ROOM_COUNT } from '../world/levels.js';
import { FEATURES } from './Features.js';
import { LightSource } from './LightPool.js';
import { ShadowSystem } from './ShadowSystem.js';
import { EchoSystem, Ghost } from './Echo.js';
import { lightMap } from './LightMap.js';
import { Story } from '../story/Story.js';
import { emberMesh } from '../objects/EmberPickup.js';

// Lifecycle, fixed-step update order and top-level states.
export const STATE = { TITLE: 'title', PLAYING: 'playing', PAUSED: 'paused', CUTSCENE: 'cutscene', VICTORY: 'victory', LOADING: 'loading' };

const COLD = { fog: new THREE.Color(0x1d2236), hemiSky: new THREE.Color(0x6a7d9c), hemiGround: new THREE.Color(0x221f2a), moon: new THREE.Color(0x9fb5d8) };
const WARM = { fog: new THREE.Color(0x2a1a1c), hemiSky: new THREE.Color(0x9a7058), hemiGround: new THREE.Color(0x2a1810), moon: new THREE.Color(0xffc49a) };

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.params = new URLSearchParams(location.search);
    this.settings = new Settings();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false; // count every pass of a frame (bloom renders several)

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.bg);
    this.scene.fog = new THREE.Fog(COLD.fog.clone(), 18, 54);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 140);
    this.glowTex = glowTexture();

    this.hemi = new THREE.HemisphereLight(COLD.hemiSky.clone(), COLD.hemiGround.clone(), 1.7);
    this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(COLD.moon.clone(), 1.9);
    this.moon.shadow.bias = -0.0006;
    this.moon.shadow.normalBias = 0.04;
    const sc = this.moon.shadow.camera;
    sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 70;
    this.scene.add(this.moon, this.moon.target);
    this.lightPool = new LightPool(this.scene, this.settings.get('lights'));
    this.warmth = 0;
    this.warmthTarget = 0;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.input = new Input(canvas);
    this.collision = new CollisionWorld();
    this.audio = new AudioManager();
    this.effects = new Effects(this.scene);
    this.player = new PlayerController(this.scene);
    this.cameraCtl = new CameraController(this.camera);
    this.ui = new UIManager(this);
    this.world = new World(this);
    this.shadows = new ShadowSystem(this);
    this.echoes = new EchoSystem(this);
    this.story = new Story(this);
    this.debug = { lightMap: (levelId, opts) => lightMap(this, levelId, opts) };

    this.player.onFootstep = () => this.audio.play('step');
    this.player.onFall = () => this.onFall();
    this.input.onBlur = () => { if (this.state === STATE.PLAYING) this.pause(); };
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.wasLocked && this.state === STATE.PLAYING) this.pause();
      this.wasLocked = this.input.locked;
    });
    canvas.addEventListener('click', () => { if (this.state === STATE.PLAYING) this.input.requestLock(); this.input.clicked = true; });

    this.state = STATE.LOADING;
    this.time = 0;
    this.timers = [];
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.fps = { acc: 0, n: 0, shown: 0 };
    this.runStart = 0;
    window.addEventListener('resize', () => this.resize());
    this.applySettings(false);
  }

  start() {
    this.world.build();
    this.toTitle();
    this.renderer.compile(this.scene, this.camera);
    this.ui.hideLoading();
    this.ui.fadeTo(0, 1.2);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------------ settings / quality
  applySettings(recompile) {
    const s = this.settings;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2) * s.get('renderScale');
    this.pixelRatio = Math.max(0.4, Math.min(2, this.pixelRatio));
    this.useBloom = s.get('bloom');
    const shadows = s.get('shadows');
    this.renderer.shadowMap.enabled = shadows;
    this.moon.castShadow = shadows;
    const res = s.get('shadowRes') || 1024;
    if (this.moon.shadow.mapSize.x !== res) { this.moon.shadow.mapSize.set(res, res); this.moon.shadow.map?.dispose(); this.moon.shadow.map = null; }
    this.fxScale = s.get('particles');
    this.lightPool.setSize(s.get('lights'));
    this.cameraCtl.sensitivity = s.get('sensitivity');
    this.cameraCtl.invertY = s.get('invertY');
    this.cameraCtl.assistEnabled = s.get('cameraAssist') !== false;
    this.scene.fog.far = s.get('fogFar') || 54;
    this.ui?.el.fps.classList.toggle('hidden', !s.get('showFps'));
    if (recompile) this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(Math.round(w * this.pixelRatio / 2), Math.round(h * this.pixelRatio / 2));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.effects.setPixelScale(h * this.pixelRatio);
  }

  /** Game-time callback (pauses with the game). */
  delay(t, fn) { this.timers.push({ t, fn }); }

  setWarmth(n) { this.warmthTarget = Math.min(1, n / ROOM_COUNT); }

  // ------------------------------------------------------------------ states
  toTitle() {
    this.state = STATE.TITLE;
    this.input.exitLock();
    this.ui.show('title');
    this.ui.overlay(null);
    this.ui.clearHUD();
    this.ui.letterbox(false);
    this.ui.hideDialogue();
    this.ui.hideSubtitle();
    this.ui.setContinue(this.world.progress.hasSave);
    this.audio.stopAllLoops();
    this.story.scene = null;
    this.echoes.clear();
    this.unmaking = null;
    if (this.sun?.on) this.setSun(false);
    if (this.doorMarrow) { this.doorMarrow.keeper.group.visible = false; this.doorMarrow.light.intensity = 0; }
    this.shadows.ilenActive = false;
    this.shadows.clear();
    this.titleT = 0;
    this.placePlayer(0, 75.5, 0); // park the Keeper on the entrance terrace for the title shot
  }

  placePlayer(x, z, yaw) {
    this.player.setSpawn(new THREE.Vector3(x, 0, z), yaw);
    this.player.respawn();
    this.player.setSafe(x, 0, z, yaw);
    this.cameraCtl.snap(yaw, 0.3);
  }

  newGame() {
    this.audio.init();
    this.ui.overlay(null);
    this.state = STATE.LOADING;
    this.ui.fadeTo(1, 0.5);
    setTimeout(() => {
      this.world.resetAll();
      this.echoes.clear();
      this.echoes.made = 0;
      this.shadows.clear();
      this.world.progress.data.started = true;
      this.world.progress.save();
      this.finaleOrbs = null; this.heartBackwards = false; this.ashRising = 0;
      this.runStart = performance.now();
      this.onEmbers(0, true);
      this.placePlayer(0, 75.5, 0);
      this.cameraCtl.clearOverride();
      this.ui.show(null);
      this.story.trigger('opening');
    }, 550);
  }

  continueGame() {
    this.audio.init();
    this.ui.overlay(null);
    this.state = STATE.LOADING;
    this.ui.fadeTo(1, 0.4);
    setTimeout(() => {
      const cp = this.world.checkpoint;
      this.runStart = performance.now();
      this.onEmbers(this.world.progress.data.completed.length, true);
      this.placePlayer(cp.x, cp.z, cp.yaw);
      this.beginPlaying();
      this.ui.fadeTo(0, 0.8);
    }, 450);
  }

  beginPlaying() {
    this.state = STATE.PLAYING;
    this.cameraCtl.clearOverride(); // never let a cinematic camera leak into play
    this.ui.show('hud');
    this.ui.letterbox(false);
    this.input.clear();
    this.input.requestLock();
  }

  enterCutscene() {
    this.echoes.cancelRecording();
    this.state = STATE.CUTSCENE;
    this.input.clear();
    this.ui.clearHUD();
    this.ui.show(null);
    this.ui.hideSubtitle();
    this.ui.letterbox(true);
  }

  exitCutscene() {
    this.ui.letterbox(false);
    this.cameraCtl.snap(this.player.facing, 0.3);
    this.beginPlaying();
  }

  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this.input.clear();
    this.input.exitLock();
    this.ui.show('pause');
    if (this.audio.ctx) this.audio.ctx.suspend();
  }

  resume() {
    if (this.state !== STATE.PAUSED) return;
    if (this.audio.ctx) this.audio.ctx.resume();
    this.ui.overlay(null);
    this.beginPlaying();
  }

  showVictory() {
    this.state = STATE.VICTORY;
    this.input.exitLock();
    this.ui.letterbox(false);
    this.ui.el.flash.classList.remove('show');
    const pr = this.world.progress.data;
    this.ui.setVictoryStats((performance.now() - this.runStart) / 1000, pr.echoesMade || 0, pr.secrets.length, pr.lostMinutes.length);
    this.ui.show('victory');
    this.ui.fadeTo(0, 1.5);
  }

  onAction(a) {
    switch (a) {
      case 'new-game': this.newGame(); break;
      case 'continue': this.continueGame(); break;
      case 'resume': this.resume(); break;
      case 'restart-room':
        if (this.state === STATE.PAUSED) { if (this.audio.ctx) this.audio.ctx.resume(); this.beginPlaying(); }
        this.restartPuzzle();
        break;
      case 'respawn':
        if (this.state === STATE.PAUSED) { if (this.audio.ctx) this.audio.ctx.resume(); this.beginPlaying(); }
        this.respawn();
        break;
      case 'main-menu':
        if (this.audio.ctx) this.audio.ctx.resume();
        this.ui.fadeTo(1, 0.4);
        setTimeout(() => { this.toTitle(); this.ui.fadeTo(0, 0.8); }, 420);
        break;
      case 'settings': this.audio.init(); this.ui.overlay('settings'); break;
      case 'controls': this.audio.init(); this.ui.overlay('controls'); break;
      case 'credits': this.audio.init(); this.ui.overlay('credits'); break;
      case 'close-overlay': this.ui.overlay(null); break;
      case 'mute': this.toggleMute(); break;
      default: break;
    }
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    this.ui.setMuted(this.audio.muted);
  }

  // ------------------------------------------------------------------ world callbacks
  onEmbers(n, instant = false) {
    this.ui.setEmbers(n);
    this.player.keeper.setEmberLevel(Math.min(3, Math.ceil(n / 2)));
    this.audio.setWarmth(Math.min(3, n / 2));
    this.setWarmth(n);
    if (instant) this.warmth = this.warmthTarget;
  }

  onEnterLevel(L, p) {
    if (L.hub) {
      if (!this.story.seen('hub_first')) { this.story.trigger('hub_first'); return; }
      if (!p.completed && this.world.ringAwake && !this.story.seen('card_10')) {
        this.world.progress.mark('story', 'card_10');
        this.ui.card(L.numeral, L.name, 2.6);
      }
      return;
    }
    if (!p.completed && !p.passage) this.ui.card(L.numeral, L.name, 2.6);
    this.story.onEnterLevel(L);
  }

  read(r) { this.story.reading(r.id); }

  onFall() {
    this.audio.play('sfx_fall');
    this.ui.fadeTo(1, 0.05);
    setTimeout(() => this.ui.fadeTo(0, 0.5), 80);
    const pl = this.player;
    if (pl.hasSafe) pl.setSpawn(pl.lastSafe, pl.lastSafeYaw); // back to the last safe ground
    else { const cp = this.world.checkpoint; pl.setSpawn(new THREE.Vector3(cp.x, 0, cp.z), cp.yaw); }
    this.echoes.cancelRecording(); // falling cancels a minute being marked
    if (this.unmaking) { this.restartUnmaking(); return; }
    this.falls = (this.falls || 0) + 1;
    this.lastFallAt = this.time;
    this.cameraCtl.snap(pl.spawnYaw, 0.3);
    this.world.activePuzzle?.onFall?.();
  }

  respawn() {
    const cp = this.world.checkpoint;
    this.placePlayer(cp.x, cp.z, cp.yaw);
  }

  restartPuzzle() {
    if (this.state !== STATE.PLAYING) return;
    if (this.unmaking) { this.restartUnmaking(); return; }
    const p = this.world.activePuzzle;
    if (!p || (p.level.hub && !this.world.progress.data.completed.includes(9))) { this.respawn(); return; }
    this.ui.fadeTo(1, 0.25);
    setTimeout(() => {
      this.echoes.clear();
      this.world.restartActivePuzzle();
      const [x, z, yaw] = p.level.spawn;
      this.placePlayer(x, z, yaw);
      this.ui.fadeTo(0, 0.5);
    }, 260);
  }

  /** Lock feedback on every rune trigger: hit-stop, a camera tremor, a stone thud and dust. */
  lockFeedback(pos) {
    this.hitstop = 0.06;
    this.cameraCtl.shake(0.06, 0.15);
    this.audio.play('sfx_stone_thud');
    const fx = this.effects;
    fx.burst(this._lf || (this._lf = new THREE.Vector3()).set(pos.x, pos.y + 0.15, pos.z), 40, fx.c.ash, 1.6, 0.1, 1.0, fx.ash);
    fx.burst(this._lf.set(pos.x, pos.y + 0.3, pos.z), 50, fx.c.gold, 3, 0.14, 1.2);
  }

  /** A released echo counts as progress in the room, and Ilen notices the first one. */
  onEchoReleased(e) {
    this.world.activePuzzle?.onEchoReleased?.();
    if (e?.permanent) {
      // the minutes you leave (finale): these echoes never crumble
      const n = this.echoes.echoes.filter((x) => x.permanent).length;
      if (n === 1) this.story.say('ILEN', 'That one stays.', 3.5);
      if (n === 2) this.story.say('ILEN', '…So does that one.', 3.5);
    } else if (!this.story.seen('bark_first_echo')) { this.world.progress.mark('story', 'bark_first_echo'); this.story.say('ILEN', 'That’s me. Eight seconds ago.', 4.5); }
    this.world.progress.data.echoesMade = (this.world.progress.data.echoesMade || 0) + 1;
    this.world.progress.save();
  }

  /** Cutscene actions (also run instantly when a scene is skipped). */
  sceneAction(name, skipping = false) {
    const w = this.world;
    if (name === 'wakeRing') w.wakeRing(!skipping);
    else if (name === 'openingBarks') this.story.openingBarks();
    else if (name === 'unmakingStart') this.startUnmaking();
    else if (name === 'embersConverge') {
      const from = this.player.keeper.lanternCore.getWorldPosition(new THREE.Vector3());
      this.finaleOrbs = [];
      for (let i = 0; i < 3; i++) {
        const m = emberMesh(0.9);
        m.position.copy(from);
        w.hubZone.group.add(m);
        this.finaleOrbs.push({ m, i, start: from.clone().add(new THREE.Vector3((i - 1) * 0.6, 0.6, 0)), t: -i * 0.3 });
      }
      w.heart.sealLevel = 3;
    } else if (name === 'heartBackwards') {
      this.heartBackwards = true;
      this.audio.play('sfx_heart_ignite');
      this.effects.burst(w.heart.core.getWorldPosition(new THREE.Vector3()), 180, this.effects.c.hot, 6, 0.2, 2.2);
      this.setWarmth(10);
    } else if (name === 'ashRises') {
      this.ashRising = 4;
    } else if (name === 'victory') {
      this.world.progress.mark('completed', 10);
      this.showVictory();
    }
  }

  /** SUNDIAL_HUB: after the ring wakes, a sun orbits the Sanctuary once a minute; hold E at the
   *  Heart altar to run it backwards. It is a light (kind 'sun'), so it sweeps the ring's shadows. */
  updateSun(dt, input) {
    const w = this.world;
    if (!w.ringAwake || this.unmaking) { if (this.sun?.on) this.setSun(false); return; }
    if (!this.sun) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0c8).multiplyScalar(2.2), toneMapped: false }));
      const light = new LightSource(0xfff0c8, 0, 14, 1.2);
      m.add(light);
      this.scene.add(m);
      this.sun = { mesh: m, light, a: 0, on: false, rec: { id: 'sun', kind: 'sun', pos: new THREE.Vector3() } };
    }
    if (!this.sun.on) this.setSun(true);
    const back = input.isDown('KeyE') && Math.hypot(this.player.pos.x, this.player.pos.z) < 3.2;
    this.sun.a += (back ? -3 : 1) * dt * (Math.PI * 2 / 60);
    this.sun.mesh.position.set(Math.sin(this.sun.a) * 8, 6, Math.cos(this.sun.a) * 8);
    this.sun.rec.pos.copy(this.sun.mesh.position);
  }

  setSun(on) {
    const s = this.sun;
    s.on = on;
    s.mesh.visible = on;
    s.light.intensity = on ? 6 : 0;
    const L = this.shadows.extraLights, i = L.indexOf(s.rec);
    if (on && i < 0) L.push(s.rec);
    if (!on && i >= 0) L.splice(i, 1);
  }

  storyCondition(name) {
    if (name === 'allLostMinutes') return this.world.progress.data.lostMinutes.length >= 6;
    return true;
  }

  // ------------------------------------------------------------------ the Unmaking (escape)
  /** "The shadows are returning to their stones": run from the island to the south gallery door. */
  startUnmaking() {
    const w = this.world;
    this.unmaking = { t: 0, crackT: 0, dissolving: false, slept: 0 };
    if (!this.doorMarrow) this.doorMarrow = new Ghost(this.scene, { marrow: true });
    const g = this.doorMarrow;
    g.place(0, 0, 21.4, 0);
    g.keeper.animate(0, 0, true);
    g.keeper.lanternPivot.rotation.x = 2.6;
    g.keeper.group.visible = true;
    g.light.intensity = 4;
    w.finalBridge.showImmediate();
    this.placePlayer(0, -2.2, 0);
    this.setWarmth(10);
    this.audio.setWarmth(3);
    this.ashRising = 60;
  }

  updateUnmaking(dt) {
    const u = this.unmaking, w = this.world;
    u.t += dt;
    if (!u.dissolving && u.t > 1.2) { u.dissolving = true; w.finalBridge.dissolve(1.2); this.audio.play('sfx_bridge_fade'); }
    // the ring's shadows go home one by one: rail stone first, then west, then east
    const order = ['S', 'W', 'E'];
    while (u.slept < 3 && u.t > 0.6 + u.slept * 1.6) {
      const st = w.l10.stoneById.get(order[u.slept++]);
      st.awake = false;
      this.audio.play('sfx_shadow_crack');
    }
    u.crackT -= dt;
    if (u.crackT <= 0) { u.crackT = 1.1 + Math.random() * 0.8; this.audio.play('sfx_shadow_crack'); this.cameraCtl.shake(0.04, 0.3); }
    const p = this.player.pos;
    if (Math.hypot(p.x, p.z - 21.4) < 1.8) this.endUnmaking();
  }

  /** Falling in the Unmaking restarts only the escape, from the island. */
  restartUnmaking() {
    for (const st of this.world.l10.stones) st.awake = true;
    this.startUnmaking();
  }

  endUnmaking() {
    this.unmaking = null;
    this.story.play('ending');
  }

  updateFinaleFX(dt) {
    const w = this.world;
    if (this.finaleOrbs) {
      const tgt = new THREE.Vector3();
      for (const o of this.finaleOrbs) {
        o.t += dt / 1.4;
        if (o.t < 0) continue;
        const k = Math.min(1, o.t);
        w.heart.socketWorld(o.i, tgt);
        const e = k * k * (3 - 2 * k);
        o.m.position.lerpVectors(o.start, tgt, e);
        o.m.position.y += Math.sin(e * Math.PI) * 2;
        if (k >= 1 && o.m.visible) { o.m.visible = false; this.audio.play('sfx_ember_collect'); this.effects.burst(tgt, 30, this.effects.c.hot, 2, 0.12, 0.9); }
      }
    }
    if (this.heartBackwards) w.heart.awake = Math.min(1, w.heart.awake + dt / 1.4);
    if (this.ashRising > 0) {
      this.ashRising -= dt;
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 18;
        this.effects.fire.emit(Math.cos(a) * r, -2 + Math.random() * 3, Math.sin(a) * r, 0, 2 + Math.random() * 2, 0, this.effects.c.hot, 0.1 + Math.random() * 0.1, 3, 0.4);
      }
    }
  }

  // ------------------------------------------------------------------ main loop
  frame() {
    this.timer.update();
    const raw = this.timer.getDelta();
    const maxDt = this.params.has('test') ? 0.3 : 0.1;
    const dt = Math.min(raw, maxDt);
    const steps = Math.max(1, Math.ceil(dt / (1 / 30)));
    for (let i = 0; i < steps; i++) {
      this.step(dt / steps);
      if (i === 0) { this.input.pressed.clear(); this.input.mouseDX = this.input.mouseDY = 0; this.input.wheel = 0; this.input.clicked = false; }
    }
    this.lightPool.update(this.player.pos);
    this.renderer.info.reset();
    this.render();
    this.trackFps(raw);
    this.input.endFrame();
    this.input.clicked = false;
  }

  step(dt) {
    const input = this.input;
    if (this.state !== STATE.PAUSED) this.time += dt;

    if (input.wasPressed('KeyM')) this.toggleMute();
    if (input.wasPressed('Escape') && this.state !== STATE.CUTSCENE) {
      if (this.ui.overlayOpen) this.ui.overlay(null);
      else if (this.state === STATE.PLAYING) this.pause();
      else if (this.state === STATE.PAUSED) this.resume();
    }

    // warmth: every restored ember brings colour back to the temple
    this.warmth += (this.warmthTarget - this.warmth) * Math.min(1, dt * 0.8);
    this.scene.fog.color.copy(COLD.fog).lerp(WARM.fog, this.warmth);
    this.scene.background.copy(this.scene.fog.color).multiplyScalar(0.9);
    this.hemi.color.copy(COLD.hemiSky).lerp(WARM.hemiSky, this.warmth);
    this.hemi.groundColor.copy(COLD.hemiGround).lerp(WARM.hemiGround, this.warmth);
    this.moon.color.copy(COLD.moon).lerp(WARM.moon, this.warmth * 0.6);

    if (this.state === STATE.PAUSED) return;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }

    switch (this.state) {
      case STATE.TITLE: this.updateTitle(dt); break;
      case STATE.PLAYING:
        // hit-stop: a rune locking freezes the world for a beat (rendering and particles continue)
        if (this.hitstop > 0) { this.hitstop -= dt; this.input.pressed.clear(); }
        else this.updatePlaying(dt);
        break;
      default:
        this.player.update(dt, input, this.cameraCtl.yaw, this.collision, { canMove: false });
        this.cameraCtl.update(dt, input, this.player.pos, this.collision, false);
        this.world.update(dt, input, this.player, this.cameraCtl, false);
        this.updateFinaleFX(dt);
        break;
    }
    this.story.update(dt, input);
    const pp = this.player.pos;
    const ab = this.effects.ashBounds || (this.effects.ashBounds = { x0: 0, x1: 0, z0: 0, z1: 0, y: 0 });
    ab.x0 = pp.x - 14; ab.x1 = pp.x + 14; ab.z0 = pp.z - 14; ab.z1 = pp.z + 14; ab.y = pp.y + 9;
    this.effects.update(dt);
    // the single shadow-casting light follows the Keeper (tight frustum = sharp, cheap shadows)
    this.moon.target.position.set(pp.x, 0, pp.z);
    this.moon.position.set(pp.x - 9, 22, pp.z + 11);
  }

  updatePlaying(dt) {
    const input = this.input;
    if (this.cameraCtl.override) this.cameraCtl.clearOverride();
    if (input.wasPressed('Backspace')) { this.restartPuzzle(); return; }
    // 1. player (A/D always strafe: aiming is walking)
    this.player.update(dt, input, this.cameraCtl.yaw, this.collision, { canMove: true, sprint: input.isDown('ShiftLeft', 'ShiftRight') });
    // 2. time: R marks a minute / releases the echo; echoes replay and hold their light
    if (input.wasPressed('KeyR')) this.echoes.press();
    this.echoes.update(dt);
    // ASH_DARK: inside the Forgetting the lantern dims and reaches only 5 m
    const room = this.world.activePuzzle;
    const ash = !!room?.ashZones?.length && room.inAsh(this.player.pos.x, this.player.pos.z);
    this.player.keeper.lanternDim += ((ash ? 0.4 : 1) - this.player.keeper.lanternDim) * Math.min(1, dt * 4);
    this.shadows.ilenReach = ash ? 5 : 9;
    if (ash && Math.random() < 0.5) { const pp = this.player.pos; this.effects.ash.emit(pp.x + (Math.random() - 0.5) * 8, pp.y + 5, pp.z + (Math.random() - 0.5) * 8, 0, -0.6, 0, this.effects.c.ash, 0.07, 8, 0); }
    if (FEATURES.SUNDIAL_HUB) this.updateSun(dt, input);
    // 2b. light: every fire casts every nearby stone's shadow (Ilen's lantern is a fire)
    this.shadows.ilenActive = true;
    this.shadows.focus = input.isDown('KeyQ');
    this.shadows.update(dt);
    // 3. camera (assist: near a stone Ilen is shadowing, look down at the floor a little more)
    this.cameraCtl.assistTarget = this.shadows.ilenNear(this.player.pos, 7) ? 1 : 0;
    this.cameraCtl.update(dt, input, this.player.pos, this.collision, true);
    this.player.keeper.group.visible = !this.cameraCtl.tooClose;
    // 4. world: rooms, gates, triggers
    this.world.update(dt, input, this.player, this.cameraCtl, true);
    if (this.unmaking) { this.updateUnmaking(dt); this.updateFinaleFX(dt); }
    const cur = this.world.activePuzzle;
    this.ui.updateHUD(this.unmaking ? null : cur, this.player, this.unmaking ? '' : this.objectiveText(cur));
    this.ui.echoRing(this.echoes.hud);
    const ringAwake = this.world.ringAwake;
    this.ui.setLevelName(!cur || this.unmaking ? '' : cur.level.hub ? (ringAwake ? cur.level.name : 'The Sanctuary of Minutes') : cur.passage ? '' : `${cur.level.numeral} · ${cur.level.name}`);
    if (input.wasPressed('KeyE') && !cur?.prompt0) this.ui.hideReading();
  }

  objectiveText(p) {
    const done = this.world.progress.data.completed;
    const ringAwake = this.world.ringAwake;
    if (p && !p.passage && !p.completed && (!p.level.hub || ringAwake)) return p.level.objective;
    if (p && p.completed && !p.level.hub) return 'Restored. The way onward is open.';
    if (!done.includes(1)) return 'Enter the temple.';
    if (!done.includes(3)) return 'Follow Marrow’s embers through the west wing.';
    if (!done.includes(6)) return 'The north wing is open.';
    if (!ringAwake) return 'The east wing is open.';
    return 'Return to the Sanctuary. The ring has woken.';
  }

  updateTitle(dt) {
    this.titleT += dt;
    const a = this.titleT * 0.05;
    const o = this._titleShot || (this._titleShot = { pos: new THREE.Vector3(), look: new THREE.Vector3(0, 3.5, 44), speed: 1.2 });
    o.pos.set(Math.sin(a) * 8, 4.2 + Math.sin(this.titleT * 0.2) * 0.4, 70 + Math.cos(a) * 4);
    this.cameraCtl.override = o;
    if (this.titleT < 0.05) this.cameraCtl.first = true;
    this.player.update(dt, this.input, 0, this.collision, { canMove: false });
    this.cameraCtl.update(dt, this.input, this.player.pos, this.collision, false);
    this.world.update(dt, this.input, this.player, this.cameraCtl, false);
  }

  render() {
    if (this.useBloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  trackFps(raw) {
    const f = this.fps;
    f.acc += raw; f.n++;
    if (f.acc >= 0.5) {
      f.shown = f.n / f.acc;
      f.acc = 0; f.n = 0;
      if (this.settings.get('showFps')) {
        const i = this.renderer.info.render;
        this.ui.el.fps.textContent = `${f.shown.toFixed(0)} fps · ${i.calls} calls · ${Math.round(i.triangles / 1000)}k tris`;
      }
    }
  }
}
