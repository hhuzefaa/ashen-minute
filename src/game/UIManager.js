import { ROOM_COUNT } from '../world/levels.js';
// Title / HUD / pause / settings / controls / credits / victory + dialogue, subtitles, readings.
const $ = (id) => document.getElementById(id);

export class UIManager {
  constructor(game) {
    this.game = game;
    this.el = {
      hud: $('hud'), prompt: $('prompt'), sub: $('subprompt'), objective: $('objective'),
      emberCount: $('ember-count'), levelName: $('level-name'),
      timer: $('timer'),
      card: $('card'), cardKicker: $('card-kicker'), cardTitle: $('card-title'),
      flash: $('flash-text'), fade: $('fade'), loading: $('loading'),
      vRewind: $('vignette-rewind'), vWarn: $('vignette-warn'), letterbox: $('letterbox'),
      title: $('screen-title'), pause: $('screen-pause'), victory: $('screen-victory'), tdone: $('screen-tutorial-done'),
      controls: $('screen-controls'), credits: $('screen-credits'), settings: $('screen-settings'),
      stats: $('victory-stats'), cont: $('btn-continue'),
      fire: $('theme-fire'), shadow: $('theme-shadow'), time: $('theme-time'),
      dialogue: $('dialogue'), subtitle: $('subtitle'), reading: $('reading'), fps: $('fps'),
    };
    // per-frame HUD lookups are cached once (the echo ring updates every frame while it shows)
    this.el.ringArc = this.el.timer.querySelector('.ring');
    this.el.ringText = this.el.timer.querySelector('.ring-text');
    this.el.ringLabel = this.el.timer.querySelector('.ring-label');
    this.cardTimer = null;
    this.flashTimer = null;
    this.readTimer = null;
    this.lastPrompt = '';
    this.typing = false;
    // the title's rune buttons are driven by TitleMenu (selection, pressed state, input lock)
    document.querySelectorAll('button[data-action]:not(.rune-btn)').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        game.audio.play('sfx_ui_click');
        game.onAction(b.dataset.action);
      });
    });
    this.bindSettings();
  }

  // ---------------------------------------------------------------- screens
  show(name) {
    for (const k of ['title', 'pause', 'victory', 'tdone']) this.el[k].classList.toggle('hidden', k !== name);
    this.el.hud.classList.toggle('hidden', name !== 'hud');
  }

  overlay(name, back = false) {
    const cur = this.currentOverlay;
    // Settings → Controls remembers where it came from, so Back returns to Settings
    if (!back) this.prevOverlay = name && cur && cur !== name ? cur : null;
    for (const k of ['controls', 'credits', 'settings']) this.el[k].classList.toggle('hidden', k !== name);
    if (name === 'settings') this.syncSettings();
    // keyboard: the panel's Back button takes focus, so Enter / Space close it
    if (name) this.el[name].querySelector('button.primary')?.focus({ preventScroll: true });
  }

  /** Back: return to the overlay this one was opened from, or close. all = close everything. */
  closeOverlay(all = false) {
    const prev = this.prevOverlay;
    this.prevOverlay = null;
    this.overlay(prev && !all ? prev : null, true);
  }

  get currentOverlay() { return ['controls', 'credits', 'settings'].find((k) => !this.el[k].classList.contains('hidden')) || null; }

  get overlayOpen() { return !!this.currentOverlay; }

  /** Continue is always shown on the title; without a save it is visibly unavailable. */
  setContinue() { this.game.titleMenu?.refreshContinue(); }

  setMuted(m) { document.querySelectorAll('.mute-btn').forEach((b) => { b.textContent = m ? 'Sound: Off' : 'Sound: On'; }); }

  fadeTo(opacity, seconds = 0.6, color = '#05060b') {
    const f = this.el.fade;
    f.style.background = color;
    f.style.transitionDuration = `${seconds}s`;
    clearTimeout(this.fadeHide);
    if (opacity > 0) { f.classList.remove('gone'); requestAnimationFrame(() => { f.style.opacity = String(opacity); }); }
    else {
      f.style.opacity = '0';
      // fully transparent overlays still cost compositing time on weak GPUs — remove it
      this.fadeHide = setTimeout(() => f.classList.add('gone'), seconds * 1000 + 50);
    }
  }

  hideLoading() { this.el.loading.classList.add('hidden'); }
  letterbox(on) { this.el.letterbox.classList.toggle('on', on); }

  card(kicker, title, seconds = 2.5, quote = false) {
    const c = this.el.card;
    this.el.cardKicker.textContent = kicker;
    this.el.cardTitle.textContent = title;
    c.classList.remove('hidden');
    c.classList.toggle('quote', quote);
    requestAnimationFrame(() => c.classList.add('show'));
    clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(() => c.classList.remove('show'), seconds * 1000);
  }

  hideCard() { clearTimeout(this.cardTimer); this.el.card.classList.remove('show'); }

  flashText(text, seconds = 3) {
    const f = this.el.flash;
    f.textContent = text;
    f.classList.remove('hidden');
    requestAnimationFrame(() => f.classList.add('show'));
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => f.classList.remove('show'), seconds * 1000);
  }

  // ---------------------------------------------------------------- dialogue
  dialogue(who, text, key) {
    const d = this.el.dialogue;
    d.classList.remove('hidden');
    d.className = key === 'MARROW' ? 'marrow' : key === 'TEMPLE' ? 'temple' : '';
    d.querySelector('.who').textContent = who;
    const what = d.querySelector('.what');
    this.fullText = text;
    this.typed = 0;
    this.typing = true;
    what.textContent = '';
    clearInterval(this.typeTimer);
    this.typeTimer = setInterval(() => {
      this.typed += 2;
      what.textContent = text.slice(0, this.typed);
      if (this.typed >= text.length) this.finishTyping();
    }, 22);
  }

  finishTyping() {
    clearInterval(this.typeTimer);
    this.typing = false;
    this.el.dialogue.querySelector('.what').textContent = this.fullText || '';
  }

  hideDialogue() { this.finishTyping(); this.el.dialogue.classList.add('hidden'); }

  subtitle(who, text, key) {
    const s = this.el.subtitle;
    s.classList.remove('hidden');
    s.className = key === 'MARROW' ? 'marrow' : '';
    s.querySelector('.who').textContent = who;
    s.querySelector('.what').textContent = text;
  }

  hideSubtitle() { this.el.subtitle.classList.add('hidden'); }

  showReading(text, foot = '') {
    const r = this.el.reading;
    r.querySelector('.text').textContent = text;
    r.querySelector('.foot').textContent = foot;
    r.classList.remove('hidden');
    clearTimeout(this.readTimer);
    this.readTimer = setTimeout(() => r.classList.add('hidden'), 7000);
  }

  hideReading() { clearTimeout(this.readTimer); this.el.reading.classList.add('hidden'); }

  // ---------------------------------------------------------------- HUD
  setEmbers(n) { this.el.emberCount.textContent = `${Math.max(0, Math.min(ROOM_COUNT, n | 0))}/${ROOM_COUNT}`; }
  setLevelName(t) { if (this.el.levelName.textContent !== t) this.el.levelName.textContent = t; }

  ring(el, frac, text, warn = false) {
    el.classList.remove('hidden');
    const arc = el === this.el.timer ? this.el.ringArc : el.querySelector('.ring');
    arc.style.strokeDashoffset = String(169.6 * (1 - Math.max(0, Math.min(1, frac))));
    const t = el === this.el.timer ? this.el.ringText : el.querySelector('.ring-text');
    if (t.textContent !== text) t.textContent = text;
    el.classList.toggle('warn', warn);
  }

  /** p = active room (or null in corridors). Prompts only when an interaction exists. */
  updateHUD(p, player, objective) {
    let pr = null;
    if (p?.flash) pr = { text: p.flash.text, cls: p.flash.cls };
    else if (p?.prompt0) {
      const t = p.prompt0;
      if (t.type === 'sconce') pr = { text: t.b.lit ? LIGHT_UI.rekindle : LIGHT_UI.kindle, cls: 'fire' };
      else if (t.type === 'lever') pr = { text: LIGHT_UI.lever, cls: 'gold' };
      else if (t.type === 'read') pr = { text: LIGHT_UI.read, cls: 'cyan' };
    }
    const text = pr ? pr.text : '';
    if (text !== this.lastPrompt) { this.el.prompt.textContent = text; this.lastPrompt = text; }
    const cls = pr ? pr.cls || '' : '';
    if (this.el.prompt.className !== cls) this.el.prompt.className = cls;
    const sub = this.subFor(p);
    if (this.el.sub.textContent !== sub) this.el.sub.textContent = sub;
    if (this.el.objective.textContent !== objective) this.el.objective.textContent = objective;
    this.el.timer.classList.add('hidden');
    this.el.vRewind.classList.remove('on');
    // theme icons: Fire = a sconce burns · Shadow = a shadow rests on a rune or carries you · Time = echoes
    let fire = false, shadow = !!this.game.shadows.playerOnShadow;
    if (p) {
      for (const b of p.sconces) if (b.lit) { fire = true; break; }
      if (!shadow) for (const ru of p.runes.values()) if (ru.covered || (ru.lit && !ru.spec.socket)) { shadow = true; break; }
    }
    this.el.fire.classList.toggle('active', fire);
    this.el.shadow.classList.toggle('active', shadow);
    this.el.time.classList.toggle('active', this.game.echoes.alive || this.game.echoes.recording);
  }

  /** The key list, shown only the first time in each room (and never in quiet rooms). */
  subFor(p) {
    if (!p || p.passage || p.level.quiet || p.level.tutorial || p.completed) return ''; // (the court teaches its own keys)
    const seen = this.game.world.progress.data.story;
    const key = 'keys_' + p.level.id;
    if (seen.includes(key)) return '';
    if (!this.keysT) this.keysT = { id: null, t0: 0 };
    if (this.keysT.id !== p.level.id) { this.keysT.id = p.level.id; this.keysT.t0 = this.game.time; }
    if (this.game.time - this.keysT.t0 > 10) { this.game.world.progress.mark('story', key); return ''; }
    const parts = ['[W A S D] WALK', '[SHIFT] RUN'];
    if (p.sconces.some((b) => !b.warded)) parts.push('[E] KINDLE');
    if (p.stones.some((s) => s.rail)) parts.push('[E] AT A LEVER: SLIDE');
    if (this.game.echoes.canUse) parts.push('[R] MARK A MINUTE');
    parts.push('HOLD [Q] FOCUS');
    return parts.join('   ·   ');
  }

  /** Time: the minute being marked, then the echo's hold (reuses the #timer ring). */
  echoRing(h) {
    const lbl = this.el.ringLabel;
    if (!h) { this.el.timer.classList.remove('echo'); this.el.vRewind.classList.remove('faint'); return; }
    this.ring(this.el.timer, h.t / h.max, String(Math.max(0, Math.ceil(h.t))), h.warn);
    this.el.timer.classList.add('echo');
    if (lbl.textContent !== h.label) lbl.textContent = h.label;
    this.el.vRewind.classList.toggle('on', h.label === 'MINUTE');
    this.el.vRewind.classList.add('faint');
  }

  clearHUD() {
    this.el.prompt.textContent = '';
    this.el.sub.textContent = '';
    this.lastPrompt = '';
    this.el.timer.classList.add('hidden');
    this.el.vRewind.classList.remove('on');
    this.el.vWarn.classList.remove('on');
  }

  setVictoryStats(seconds, echoes, secrets, lost) {
    document.getElementById('victory-time').textContent = formatTime(seconds);
    this.el.stats.textContent = `Minutes left behind ${echoes}   ·   Inscriptions ${secrets}/3   ·   Lost Minutes ${lost}/6`;
  }

  // ---------------------------------------------------------------- settings
  bindSettings() {
    const st = this.game.settings;
    document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      st.applyPreset(b.dataset.preset);
      this.game.applySettings(true);
      this.syncSettings();
    }));
    document.querySelectorAll('#screen-settings input[data-key]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.key;
        const v = inp.type === 'checkbox' ? inp.checked : parseFloat(inp.value);
        st.set(k, v);
        this.game.applySettings(k === 'lights' || k === 'shadows');
        this.syncSettings();
      });
    });
  }

  syncSettings() {
    const st = this.game.settings;
    document.querySelectorAll('#screen-settings input[data-key]').forEach((inp) => {
      const v = st.get(inp.dataset.key);
      if (inp.type === 'checkbox') inp.checked = !!v; else inp.value = v;
    });
    document.querySelectorAll('[data-out]').forEach((o) => {
      const v = st.get(o.dataset.out);
      o.textContent = typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : '';
    });
    document.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('active', st.get('preset') === b.dataset.preset));
    const info = this.game.renderer.info.render;
    $('perf-readout').textContent = `Last frame: ${info.calls} draw calls · ${Math.round(info.triangles / 1000)}k triangles`;
  }
}

const LIGHT_UI = { kindle: '[E] KINDLE THE SCONCE', rekindle: '[E] FEED THE SCONCE', lever: '[E] SLIDE THE STONE', read: '[E] READ' };

/** 754.2 → "12:34"; 4000 → "1:06:40" (play-clock seconds, rounded down). */
export function formatTime(seconds) {
  const t = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
