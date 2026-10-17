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
import { TitleMenu } from './TitleMenu.js';
import { RuneMenu } from './RuneMenu.js';
import { Tutorial } from './Tutorial.js';
import { runeTexture } from '../objects/Glyphs.js';
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
import { EchoSystem } from './Echo.js';
import { lightMap } from './LightMap.js';
import { Story } from '../story/Story.js';
import { emberMesh } from '../objects/EmberPickup.js';

// Lifecycle, fixed-step update order and top-level states.
export const STATE = { TITLE: 'title', PLAYING: 'playing', PAUSED: 'paused', CUTSCENE: 'cutscene', VICTORY: 'victory', LOADING: 'loading', TUTORIAL_DONE: 'tutorialDone' };

const COLD = { fog: new THREE.Color(0x1d2236), hemiSky: new THREE.Color(0x6a7d9c), hemiGround: new THREE.Color(0x221f2a), moon: new THREE.Color(0x9fb5d8) };
const WARM = { fog: new THREE.Color(0x2a1a1c), hemiSky: new THREE.Color(0x9a7058), hemiGround: new THREE.Color(0x2a1810), moon: new THREE.Color(0xffc49a) };
// Title shot: the Sanctuary from its south walkway, across the chasm to the Heart altar.
const TITLE_FOCUS = new THREE.Vector3(0, 0, -4);  // real lights go to the fires the camera sees
const TITLE_PARK = [0, 15.5];                       // the (hidden) Keeper waits on the walkway
// six hub braziers kindle in mirrored pairs, far side first: [index pair, delay s]
const TITLE_KINDLE = [[[4, 5], 0.7], [[2, 3], 1.05], [[0, 1], 1.4]];

/** The game's sundial rune (Glyphs.js), recoloured gold, for the menus' rune rings. */
function goldRune() {
  const src = runeTexture('target', 9).image;
  const cv = document.createElement('canvas');
  cv.width = src.width; cv.height = src.height;
  const g = cv.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#f0b866';
  g.fillRect(0, 0, cv.width, cv.height);
  return cv.toDataURL();
}

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
    this.titleMenu = new TitleMenu(this);
    // pause + completion: rune-button menus with keyboard / mouse / gamepad (actions unchanged)
    this.pauseMenu = new RuneMenu(this, document.getElementById('screen-pause'), (a) => this.onAction(a), () => this.resume());
    this.victoryMenu = new RuneMenu(this, document.getElementById('screen-victory'), (a) => this.onAction(a));
    this.tutorialMenu = new RuneMenu(this, document.getElementById('screen-tutorial-done'), (a) => this.onAction(a));
    this.tutorial = new Tutorial(this); // the optional training court (New Game → Play Tutorial)
    document.documentElement.style.setProperty('--rune-ring', `url("${goldRune()}")`);
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
    this.playTime = 0; // seconds of play this run (playing + cutscenes), saved with progress
    window.addEventListener('resize', () => this.resize());
    // keep the play clock when the tab is hidden or closed mid-run
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.saveClock(); });
    window.addEventListener('pagehide', () => this.saveClock());
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
    this.needsRender = true; // resizing clears the canvas (matters while paused)
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
  /** direct = returning from the game: the menu forms at once instead of the splash. */
  toTitle(direct = false) {
    this.state = STATE.TITLE;
    this.input.exitLock();
    this.ui.show('title');
    this.ui.overlay(null);
    this.ui.clearHUD();
    this.ui.letterbox(false);
    this.ui.hideDialogue();
    this.ui.hideSubtitle();
    this.ui.setContinue(this.world.progress.hasSave);
    this.story.scene = null;
    this.story.clearBarks();
    this.tutorial.end();
    this.echoes.clear();
    this.clearRunState();
    this.shadows.ilenActive = false;
    this.shadows.clear();
    this.titleT = 0;
    this.placePlayer(TITLE_PARK[0], TITLE_PARK[1], 0); // park the Keeper in the Sanctuary for the title shot
    this.player.keeper.group.visible = false;
    this.titleScene(true, direct);
    this.titleMenu.enter(direct);
  }

  /** Title-only dressing: the hub braziers kindle and the Heart glows faintly. Undone (back to the
   *  saved state) before play begins, behind the fade, so progress is never misrepresented. */
  titleScene(on, instant = false) {
    const w = this.world, list = w.hubZone.ctx.progressBraziers || [];
    if (on) {
      if (!this._titleDress) this._titleDress = { heart: w.heart.awake };
      w.heart.awake = Math.max(w.heart.awake, 0.2);
      this._kindle = instant ? null : TITLE_KINDLE.map(([pair, at]) => ({ pair, at, done: false }));
      if (instant) for (const b of list) { b.lit = true; b.level = 1; }
    } else if (this._titleDress) {
      w.heart.awake = this._titleDress.heart;
      this._titleDress = null;
      this._kindle = null;
      w.updateHubBraziers(true);
    }
  }

  placePlayer(x, z, yaw) {
    this.player.keeper.group.visible = true;
    this.player.setSpawn(new THREE.Vector3(x, 0, z), yaw);
    this.player.respawn();
    this.player.setSafe(x, 0, z, yaw);
    this.cameraCtl.snap(yaw, 0.3);
  }

  newGame() {
    if (this.state === STATE.LOADING) return; // a new run is already starting
    this.audio.init();
    this.ui.overlay(null);
    this.titleMenu.leave();
    this.victoryMenu?.close();
    this.pauseMenu.close();
    this.tutorialMenu.close();
    this.state = STATE.LOADING;
    this.ui.fadeTo(1, 0.5);
    setTimeout(() => {
      this.titleScene(false);
      this.titleMenu.hide();
      this.tutorial.end(); // from the training court (finished or skipped): the story starts clean
      this.world.resetAll();
      this.echoes.clear();
      this.echoes.made = 0;
      this.shadows.clear();
      this.world.progress.data.started = true;
      this.playTime = 0;
      this.world.progress.data.playTime = 0;
      this.world.progress.save();
      this.clearRunState();
      this.story.clearBarks();
      this.onEmbers(0, true);
      this.placePlayer(0, 75.5, 0);
      this.cameraCtl.clearOverride();
      this.ui.show(null);
      this.story.trigger('opening');
    }, 550);
  }

  /** New Game → Play Tutorial (also Restart Tutorial). The court is a separate place; the save, the
   *  story and the play clock are untouched until the story itself begins (Begin the Story / Skip). */
  startTutorial() {
    if (this.state === STATE.LOADING) return;
    this.audio.init();
    this.ui.overlay(null);
    this.titleMenu.leave();
    this.pauseMenu.close();
    this.tutorialMenu.close();
    this.state = STATE.LOADING;
    this.ui.fadeTo(1, 0.5);
    setTimeout(() => {
      this.titleScene(false);
      this.titleMenu.hide();
      this.story.scene = null;
      this.story.clearBarks();
      this.tutorial.end();
      this.echoes.clear();
      this.shadows.clear();
      this.clearRunState();
      this.onEmbers(0, true); // the court is cold and unlit, like a first visit
      this.tutorial.begin();
      const cp = this.tutorial.checkpoint;
      this.placePlayer(cp.x, cp.z, cp.yaw);
      this.world.activePuzzle = null; // entering the first section shows its card
      this.ui.clearHUD();
      this.beginPlaying();
      this.ui.fadeTo(0, 0.8);
    }, 550);
  }

  /** The end of the court: Begin the Story / Main Menu. */
  showTutorialDone() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.TUTORIAL_DONE;
    this.echoes.cancelRecording();
    this.input.clear();
    this.input.exitLock();
    this.ui.clearHUD();
    this.ui.show('tdone');
    this.tutorialMenu.open(0);
    this.audio.play('sfx_ember_collect');
  }

  /** Where Return to Checkpoint and a fall without safe ground lead: the court or the story. */
  get activeCheckpoint() { return this.tutorial.active ? this.tutorial.checkpoint : this.world.checkpoint; }

  /** Everything a finished (or abandoned) run leaves behind outside the saved progress. */
  clearRunState() {
    if (this.finaleOrbs) for (const o of this.finaleOrbs) { o.m.parent?.remove(o.m); o.m.traverse((x) => { x.geometry?.dispose(); x.material?.dispose(); }); }
    this.finaleOrbs = null;
    this.heartBackwards = false;
    this.ashRising = 0;
    this.hitstop = 0;
    this.timers.length = 0; // delayed story beats of the old run
    if (this.sun?.on) this.setSun(false);
    this.audio.stopAllLoops();
  }

  continueGame() {
    if (!this.world.progress.hasSave) return; // nothing to resume: the menu shows Continue as unavailable
    this.audio.init();
    this.ui.overlay(null);
    this.titleMenu.leave();
    this.state = STATE.LOADING;
    this.ui.fadeTo(1, 0.4);
    setTimeout(() => {
      this.titleScene(false);
      this.titleMenu.hide();
      const cp = this.world.checkpoint;
      this.playTime = this.world.progress.data.playTime || 0;
      // rooms restored — not completed.length, which also counts the Heart and passages (the 7/6 bug)
      this.onEmbers(this.world.roomsDone, true);
      this.placePlayer(cp.x, cp.z, cp.yaw);
      this.beginPlaying();
      this.ui.fadeTo(0, 0.8);
    }, 450);
  }

  beginPlaying() {
    this.state = STATE.PLAYING;
    this.pauseMenu.close(); // its keys (W/S, Space, E) must never be captured during play
    this.tutorialMenu.close();
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
    // in the training court the pause menu offers the court's own options (still six buttons)
    const tut = this.tutorial.active, pauseEl = this.ui.el.pause;
    for (const b of pauseEl.querySelectorAll('.tut-only')) b.classList.toggle('hidden', !tut);
    for (const b of pauseEl.querySelectorAll('.story-only')) b.classList.toggle('hidden', tut);
    this.pauseMenu.open(0);
    this.saveClock();
    if (this.audio.ctx) this.audio.ctx.suspend();
  }

  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.pauseMenu.close();
    if (this.audio.ctx) this.audio.ctx.resume();
    this.ui.overlay(null);
    this.beginPlaying();
  }

  /** The completion screen. Runs once per run: the clock stops here and the run is marked finished,
   *  so Continue never resumes a completed game. */
  showVictory() {
    if (this.state === STATE.VICTORY) return;
    this.state = STATE.VICTORY;
    this.input.clear();
    this.input.exitLock();
    this.ui.letterbox(false);
    this.ui.hideSubtitle();
    this.ui.hideDialogue();
    this.ui.hideCard(); // the last ending card must not linger behind the completion screen
    this.ui.el.flash.classList.remove('show');
    const pr = this.world.progress.data;
    if (!pr.finished) { pr.finished = true; pr.finalTime = this.playTime; pr.playTime = this.playTime; this.world.progress.save(); }
    this.ui.setVictoryStats(pr.finalTime ?? this.playTime, pr.echoesMade || 0, pr.secrets.length, pr.lostMinutes.length);
    this.ui.show('victory');
    this.victoryMenu?.open();
    this.ui.fadeTo(0, 1.5);
  }

  /** Persist the play clock (pause, main menu, tab hidden). */
  saveClock() {
    const pr = this.world.progress;
    if (this.tutorial.active || !pr.data.started || pr.data.finished) return; // the court is never saved
    pr.data.playTime = this.playTime;
    pr.save();
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
        if (this.state === STATE.LOADING) break; // already leaving
        this.saveClock();
        this.state = STATE.LOADING; // gameplay stops at once; nothing runs behind the fade
        this.victoryMenu?.close();
        this.pauseMenu?.close();
        this.tutorialMenu.close();
        if (this.audio.ctx) this.audio.ctx.resume();
        this.ui.fadeTo(1, 0.4);
        setTimeout(() => { this.toTitle(true); this.ui.fadeTo(0, 0.8); }, 420);
        break;
      case 'quit': if (this.state === STATE.TITLE) this.titleMenu.quit(); break;
      case 'quit-game': // pause → Quit Game: leave the run (it stays saved) and say goodbye on the title
        if (this.state !== STATE.PAUSED) break;
        this.saveClock();
        this.state = STATE.LOADING;
        this.pauseMenu.close();
        this.ui.fadeTo(1, 0.4);
        setTimeout(() => { this.toTitle(true); this.titleMenu.finishMorph(); this.titleMenu.quit(); this.ui.fadeTo(0, 0.6); }, 420);
        break;
      case 'restart': // completion screen → a fresh run from the cold open
        if (this.state === STATE.VICTORY) this.newGame();
        break;
      case 'tutorial': this.startTutorial(); break;                                       // title: Play Tutorial
      case 'tutorial-restart': if (this.tutorial.active) this.startTutorial(); break;      // pause: from the start
      case 'tutorial-skip': if (this.tutorial.active) this.newGame(); break;               // pause: straight into the story
      case 'tutorial-story': if (this.state === STATE.TUTORIAL_DONE) this.newGame(); break; // Training Complete
      case 'settings': this.audio.init(); this.ui.overlay('settings'); break;
      case 'controls': this.audio.init(); this.ui.overlay('controls'); break;
      case 'credits': this.audio.init(); this.ui.overlay('credits'); break;
      case 'close-overlay': this.ui.closeOverlay(); break;
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
    else { const cp = this.activeCheckpoint; pl.setSpawn(new THREE.Vector3(cp.x, 0, cp.z), cp.yaw); }
    this.echoes.cancelRecording(); // falling cancels a minute being marked
    this.falls = (this.falls || 0) + 1;
    this.lastFallAt = this.time;
    this.cameraCtl.snap(pl.spawnYaw, 0.3);
    this.world.activePuzzle?.onFall?.();
    if (this.tutorial.active) this.tutorial.onFall();
  }

  respawn() {
    const cp = this.activeCheckpoint;
    this.placePlayer(cp.x, cp.z, cp.yaw);
  }

  restartPuzzle() {
    if (this.state !== STATE.PLAYING) return;
    const p = this.world.activePuzzle;
    if (!p || (p.level.hub && !this.world.progress.data.completed.includes(9))) { this.respawn(); return; }
    this.ui.fadeTo(1, 0.25);
    setTimeout(() => {
      this.echoes.clear();
      this.world.restartActivePuzzle();
      if (this.tutorial.active) this.tutorial.onSectionRestart(p);
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
    if (this.tutorial.active) return; // the court never touches the story's barks or the run's stats
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
    if (!w.ringAwake) { if (this.sun?.on) this.setSun(false); return; }
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
    // the Heart of Minutes: every ember the finale sends has landed in its socket on the Heart
    if (name === 'heartEmbersIn') return !this.finaleOrbs || this.finaleOrbs.every((o) => o.t >= 1);
    return true;
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
    this.pauseMenu.poll(raw);
    this.victoryMenu.poll(raw);
    this.tutorialMenu.poll(raw);
    // While paused the world is frozen, so the last frame stays on the canvas: skip the light pool
    // and the whole render (scene + bloom) unless the canvas was resized or settings changed.
    if (this.state !== STATE.PAUSED || this.needsRender) {
      this.needsRender = false;
      this.lightPool.update(this.state === STATE.TITLE ? TITLE_FOCUS : this.player.pos);
      this.renderer.info.reset();
      this.render();
    }
    this.trackFps(raw);
    this.input.endFrame();
    this.input.clicked = false;
  }

  step(dt) {
    const input = this.input;
    if (this.state !== STATE.PAUSED) this.time += dt;
    // play clock: only time spent playing (cutscenes included); never pause, menus, fades or the end screen
    if ((this.state === STATE.PLAYING || this.state === STATE.CUTSCENE) && !this.tutorial.active) { this.playTime += dt; this.world.progress.data.playTime = this.playTime; }

    if (input.wasPressed('KeyM')) this.toggleMute();
    // trailer camera (dev builds only): F9 hides the whole HUD for clean footage
    if (import.meta.env.DEV && input.wasPressed('F9')) { const h = document.getElementById('hud'); h.style.visibility = h.style.visibility === 'hidden' ? '' : 'hidden'; }
    if (input.wasPressed('Escape') && this.state !== STATE.CUTSCENE) {
      if (this.ui.overlayOpen) this.ui.closeOverlay();
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
    // fire ambience follows the nearest burning fire (full within ~2 m, gone beyond ~16 m)
    this._fireT = (this._fireT || 0) - dt;
    if (this._fireT <= 0) {
      this._fireT = 0.15;
      const d = this.world.nearestFire;
      this.audio.setFireLevel(Number.isFinite(d) ? Math.max(0, Math.min(1, (16 - d) / 14)) : 0);
    }
    const cur = this.world.activePuzzle;
    if (this.tutorial.active) this.tutorial.update(dt, input);
    this.ui.updateHUD(cur, this.player, this.objectiveText(cur));
    this.ui.echoRing(this.echoes.hud);
    const ringAwake = this.world.ringAwake;
    this.ui.setLevelName(!cur ? '' : cur.level.hub ? (ringAwake ? cur.level.name : 'The Sanctuary of Minutes') : cur.passage ? '' : `${cur.level.numeral} · ${cur.level.name}`);
    if (input.wasPressed('KeyE') && !cur?.prompt0) this.ui.hideReading();
  }

  objectiveText(p) {
    if (this.tutorial.active) return this.tutorial.objective;
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

  /** The title shot: a slow drift across the Sanctuary; during the menu morph the camera eases a
   *  little closer and higher so the temple moves with the composition instead of cutting. */
  updateTitle(dt) {
    this.titleT += dt;
    const t = this.titleT, k = this.titleMenu.camK;
    const o = this._titleShot || (this._titleShot = { pos: new THREE.Vector3(), look: new THREE.Vector3(), speed: 2.2 });
    o.pos.set(Math.sin(t * 0.07) * 1.3, 4.6 + Math.sin(t * 0.23) * 0.12 + k * 0.45, 21.5 - k * 1.8);
    o.look.set(Math.sin(t * 0.05) * 0.35, 3.1 + k * 0.4, -6);
    this.cameraCtl.override = o;
    if (t < 0.05) this.cameraCtl.first = true;
    // the hub braziers catch, pair by pair
    if (this._kindle) {
      const list = this.world.hubZone.ctx.progressBraziers;
      for (const kd of this._kindle) {
        if (kd.done || t < kd.at) continue;
        kd.done = true;
        for (const i of kd.pair) {
          const b = list[i];
          if (!b.lit) { b.lit = true; b.level = 0; }
          this.effects.burst(b.pos, 14, this.effects.c.hot, 1.4, 0.1, 0.8);
        }
      }
    }
    // a few slow embers drift up through the shot (cheap: pooled particles, ~3 per second)
    this._moteT = (this._moteT || 0) - dt;
    if (this._moteT <= 0) {
      this._moteT = 0.25 + Math.random() * 0.35;
      this.effects.fire.emit((Math.random() - 0.5) * 16, -1 + Math.random() * 2.5, 2 + Math.random() * 13,
        (Math.random() - 0.5) * 0.2, 0.35 + Math.random() * 0.35, -0.05, this.effects.c.hot, 0.05 + Math.random() * 0.05, 7, 0.05);
    }
    this.player.update(dt, this.input, 0, this.collision, { canMove: false });
    this.cameraCtl.update(dt, this.input, this.player.pos, this.collision, false);
    this.world.update(dt, this.input, this.player, this.cameraCtl, false);
    this.titleMenu.update(dt);
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
