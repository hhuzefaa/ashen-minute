import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Input } from './Input.js';
import { CollisionWorld } from './CollisionWorld.js';
import { PlayerController } from './PlayerController.js';
import { CameraController } from './CameraController.js';
import { LevelManager } from './LevelManager.js';
import { UIManager } from './UIManager.js';
import { AudioManager } from './AudioManager.js';
import { Effects } from './Effects.js';
import { COLORS, glowTexture } from './Palette.js';
import { ROOM } from './PuzzleManager.js';

// Lifecycle, update order and top-level states (doc §11.2–11.3).
export const STATE = { TITLE: 'title', INTRO: 'intro', PLAYING: 'playing', PAUSED: 'paused', TRANSITION: 'transition', FINALE: 'finale', VICTORY: 'victory' };

const COLD = { fog: new THREE.Color(0x1d2236), hemiSky: new THREE.Color(0x6a7d9c), hemiGround: new THREE.Color(0x221f2a), moon: new THREE.Color(0x9fb5d8) };
const WARM = { fog: new THREE.Color(0x2a1a1c), hemiSky: new THREE.Color(0x9a7058), hemiGround: new THREE.Color(0x2a1810), moon: new THREE.Color(0xffc49a) };

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.params = new URLSearchParams(location.search);
    this.lowFx = this.params.has('lowfx');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = !this.lowFx;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.bg);
    this.scene.fog = new THREE.Fog(COLD.fog.clone(), 16, 52);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 160);
    this.glowTex = glowTexture();

    // lighting: cold moonlight (one shadow caster) + hemisphere; warm lights come from fire
    this.hemi = new THREE.HemisphereLight(COLD.hemiSky.clone(), COLD.hemiGround.clone(), 1.7);
    this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(COLD.moon.clone(), 1.9);
    this.moon.position.set(-8, 18, 10);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    this.moon.shadow.bias = -0.0006;
    this.moon.shadow.normalBias = 0.03;
    this.scene.add(this.moon, this.moon.target);
    this.warmth = 0;
    this.warmthTarget = 0;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.85, 0.55, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.useBloom = !this.lowFx;

    this.input = new Input(canvas);
    this.world = new CollisionWorld();
    this.audio = new AudioManager();
    this.effects = new Effects(this.scene);
    this.player = new PlayerController(this.scene);
    this.cameraCtl = new CameraController(this.camera);
    this.ui = new UIManager(this);
    this.levels = new LevelManager(this);

    this.player.onFootstep = () => this.audio.play('step');
    this.player.onFall = () => { this.audio.play('sfx_fall'); this.ui.fadeTo(1, 0.05); setTimeout(() => this.ui.fadeTo(0, 0.5), 80); };
    this.input.onBlur = () => { if (this.state === STATE.PLAYING) this.pause(); };
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.wasLocked && this.state === STATE.PLAYING) this.pause();
      this.wasLocked = this.input.locked;
    });
    canvas.addEventListener('click', () => { if (this.state === STATE.PLAYING) this.input.requestLock(); });

    this.state = STATE.TITLE;
    this.time = 0;
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.perf = { acc: 0, frames: 0, checked: false };
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  start() {
    this.levels.load(0);
    this.toTitle();
    this.ui.hideLoading();
    this.ui.fadeTo(0, 1.2);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.effects.setPixelScale(h * this.pixelRatio);
  }

  fitShadowCamera(level) {
    const b = level.ash;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const r = Math.max(b.x1 - b.x0, b.z1 - b.z0) * 0.62;
    this.moon.target.position.set(cx, 0, cz);
    this.moon.position.set(cx - 8, 20, cz + 10);
    const sc = this.moon.shadow.camera;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 1; sc.far = 60;
    sc.updateProjectionMatrix();
  }

  setWarmth(n) { this.warmthTarget = Math.min(1, n / 4); }

  // ------------------------------------------------------------------ states / actions
  toTitle() {
    this.state = STATE.TITLE;
    this.input.exitLock();
    this.ui.show('title');
    this.ui.overlay(null);
    this.ui.clearHUD();
    this.audio.stopAllLoops();
    this.titleT = 0;
  }

  play() {
    this.audio.init();
    this.ui.overlay(null);
    this.state = STATE.TRANSITION;
    this.ui.fadeTo(1, 0.5);
    setTimeout(() => {
      this.levels.newRun();
      this.ui.setEmbers(0);
      this.ui.show(null);
      this.ui.card('', 'The temple remembers what the world has forgotten.', 2.6, true);
      this.state = STATE.INTRO;
      this.introT = 0;
      this.ui.fadeTo(0, 1.4);
      this.input.requestLock();
    }, 550);
  }

  beginPlaying() {
    this.state = STATE.PLAYING;
    this.ui.show('hud');
    this.ui.card(this.levels.level.numeral, this.levels.level.name, 2.6);
  }

  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this.input.clear();
    this.input.exitLock();
    this.ui.show('pause');
    this.levels.puzzle?.endRewind();
    if (this.audio.ctx) this.audio.ctx.suspend();
  }

  resume() {
    if (this.state !== STATE.PAUSED) return;
    if (this.audio.ctx) this.audio.ctx.resume();
    this.ui.overlay(null);
    this.ui.show('hud');
    this.input.clear();
    this.state = STATE.PLAYING;
    this.input.requestLock();
  }

  transitionTo(fn) {
    this.state = STATE.TRANSITION;
    this.input.clear();
    this.ui.clearHUD();
    this.ui.fadeTo(1, 0.7);
    setTimeout(() => {
      fn();
      this.ui.fadeTo(0, 0.9);
      this.state = STATE.PLAYING;
    }, 800);
  }

  startFinale() {
    this.state = STATE.FINALE;
    this.input.clear();
    this.ui.clearHUD();
    const heart = this.levels.room.heart;
    const hp = heart.group.position;
    this.cameraCtl.override = { pos: new THREE.Vector3(hp.x + 6.5, 3.6, hp.z + 6.5), look: new THREE.Vector3(hp.x, 2.2, hp.z), speed: 2.2 };
    this.cameraCtl.smoothPos.copy(this.camera.position);
    this.levels.puzzle.dispose();
    this.levels.startFinale();
  }

  showVictory() {
    this.state = STATE.VICTORY;
    this.input.exitLock();
    this.ui.el.flash.classList.remove('show');
    this.ui.setVictoryStats((performance.now() - this.levels.runStart) / 1000, this.levels.totalRewinds);
    this.ui.show('victory');
  }

  onAction(a) {
    switch (a) {
      case 'play': this.play(); break;
      case 'play-again': this.cameraCtl.override = null; this.play(); break;
      case 'resume': this.resume(); break;
      case 'restart-room':
        if (this.state === STATE.PAUSED) {
          if (this.audio.ctx) this.audio.ctx.resume();
          this.ui.show('hud');
          this.state = STATE.PLAYING;
          this.input.requestLock();
        }
        this.restartRoom();
        break;
      case 'main-menu':
        if (this.audio.ctx) this.audio.ctx.resume();
        this.cameraCtl.override = null;
        this.ui.fadeTo(1, 0.4);
        setTimeout(() => {
          this.levels.emberCount = 0;
          this.player.keeper.setEmberLevel(0);
          this.setWarmth(0);
          this.audio.setWarmth(0);
          this.levels.load(0);
          this.toTitle();
          this.ui.fadeTo(0, 0.8);
        }, 420);
        break;
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

  restartRoom() {
    if (this.state !== STATE.PLAYING) return;
    const p = this.levels.puzzle;
    if (p && (p.state === ROOM.EXIT_REACHED || p.state === ROOM.COMPLETE)) return;
    this.transitionTo(() => this.levels.restartRoom());
  }

  // ------------------------------------------------------------------ main loop
  frame() {
    this.timer.update();
    const raw = this.timer.getDelta();
    // Clamp long hitches, then simulate in fixed-size sub-steps so slow machines keep real-time
    // speed without tunnelling through colliders.
    const maxDt = this.params.has('test') ? 0.3 : 0.1;
    const dt = Math.min(raw, maxDt);
    const steps = Math.max(1, Math.ceil(dt / (1 / 30)));
    for (let i = 0; i < steps; i++) {
      this.step(dt / steps);
      if (i === 0) { this.input.pressed.clear(); this.input.mouseDX = this.input.mouseDY = 0; }
    }
    this.render();
    this.adaptQuality(raw);
    this.input.endFrame();
  }

  step(dt) {
    if (this.state !== STATE.PAUSED) this.time += dt;
    const input = this.input;

    // global keys
    if (input.wasPressed('KeyM')) this.toggleMute();
    if (input.wasPressed('Escape')) {
      if (this.ui.overlayOpen) this.ui.overlay(null);
      else if (this.state === STATE.PLAYING) this.pause();
      else if (this.state === STATE.PAUSED) this.resume();
    }

    // warmth (embers restore colour to the temple)
    this.warmth += (this.warmthTarget - this.warmth) * Math.min(1, dt * 0.8);
    this.scene.fog.color.copy(COLD.fog).lerp(WARM.fog, this.warmth);
    this.scene.background.copy(this.scene.fog.color).multiplyScalar(0.9);
    this.hemi.color.copy(COLD.hemiSky).lerp(WARM.hemiSky, this.warmth);
    this.hemi.groundColor.copy(COLD.hemiGround).lerp(WARM.hemiGround, this.warmth);
    this.moon.color.copy(COLD.moon).lerp(WARM.moon, this.warmth * 0.6);

    switch (this.state) {
      case STATE.TITLE: this.updateTitle(dt); break;
      case STATE.INTRO:
        this.introT += dt;
        this.cameraCtl.update(dt, input, this.player.pos, this.world, false);
        this.player.update(dt, input, this.cameraCtl.yaw, this.world, { canMove: false });
        this.levels.puzzle.update(dt, input, this.player, this.cameraCtl);
        if (this.introT > 2.4 || input.wasPressed('Space', 'Enter', 'KeyE')) this.beginPlaying();
        break;
      case STATE.PLAYING: this.updatePlaying(dt); break;
      case STATE.FINALE:
        this.player.update(dt, input, this.cameraCtl.yaw, this.world, { canMove: false });
        this.cameraCtl.update(dt, input, this.player.pos, this.world, false);
        break;
      case STATE.TRANSITION:
      case STATE.VICTORY:
        this.cameraCtl.update(dt, input, this.player.pos, this.world, false);
        break;
      case STATE.PAUSED: break; // simulation and timers frozen
      default: break;
    }

    if (this.state !== STATE.PAUSED) {
      this.levels.update(dt);
      this.effects.update(dt);
      if (this.levels.room?.ctx.floaters) this.levels.room.ctx.floaters.rotation.y += dt * 0.004;
    }
  }

  updatePlaying(dt) {
    const input = this.input;
    const puzzle = this.levels.puzzle;
    if (input.wasPressed('Backspace')) { this.restartRoom(); return; }
    // 1–2: input handled above; 3: player
    const rotating = puzzle.relic.lit && puzzle.nearRelic && puzzle.state === ROOM.ALIGNING && !puzzle.jolt;
    this.player.update(dt, input, this.cameraCtl.yaw, this.world, { canMove: true, suppressStrafe: rotating });
    // 4: camera
    this.cameraCtl.update(dt, input, this.player.pos, this.world, true);
    // 5–8: relic, alignment, bridge, triggers
    puzzle.update(dt, input, this.player, this.cameraCtl);
    this.ui.updateHUD(puzzle);
  }

  updateTitle(dt) {
    this.titleT += dt;
    const r = this.levels.room;
    const c = r.relic.base;
    const a = 0.9 + Math.sin(this.titleT * 0.08) * 0.5;
    this.cameraCtl.override = { pos: new THREE.Vector3(c.x + Math.sin(a) * 7, 3.2 + Math.sin(this.titleT * 0.2) * 0.4, c.z + Math.cos(a) * 7), look: new THREE.Vector3(c.x - 1, 1.2, c.z - 3), speed: 1.5 };
    if (this.titleT < 0.1) { this.cameraCtl.smoothPos.copy(this.cameraCtl.override.pos); this.cameraCtl.lookAt.copy(this.cameraCtl.override.look); }
    this.player.update(dt, this.input, 0, this.world, { canMove: false });
    this.cameraCtl.update(dt, this.input, this.player.pos, this.world, false);
    r.relic.update(dt);
  }

  render() {
    if (this.useBloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** If the first seconds of play run slowly, drop resolution, then bloom. */
  adaptQuality(dt) {
    if (this.perf.checked || this.state !== STATE.PLAYING || this.params.has('nofallback')) return;
    this.perf.acc += dt;
    this.perf.frames++;
    if (this.perf.acc < 3) return;
    const avg = this.perf.acc / this.perf.frames;
    this.perf.acc = 0; this.perf.frames = 0;
    if (avg > 1 / 35) {
      if (this.pixelRatio > 1) { this.pixelRatio = 1; this.renderer.setPixelRatio(1); this.resize(); return; }
      if (this.useBloom) { this.useBloom = false; return; }
    }
    this.perf.checked = true;
  }
}
