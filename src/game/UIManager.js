// Title / HUD / pause / settings / controls / credits / victory + dialogue, subtitles, readings.
const $ = (id) => document.getElementById(id);

export class UIManager {
  constructor(game) {
    this.game = game;
    this.el = {
      hud: $('hud'), prompt: $('prompt'), sub: $('subprompt'), objective: $('objective'),
      emberCount: $('ember-count'), levelName: $('level-name'),
      timer: $('timer'), flame: $('flame'),
      memory: $('memory'), memoryFill: $('memory-fill'),
      card: $('card'), cardKicker: $('card-kicker'), cardTitle: $('card-title'),
      flash: $('flash-text'), fade: $('fade'), loading: $('loading'),
      vRewind: $('vignette-rewind'), vWarn: $('vignette-warn'), letterbox: $('letterbox'),
      title: $('screen-title'), pause: $('screen-pause'), victory: $('screen-victory'),
      controls: $('screen-controls'), credits: $('screen-credits'), settings: $('screen-settings'),
      stats: $('victory-stats'), cont: $('btn-continue'),
      fire: $('theme-fire'), shadow: $('theme-shadow'), time: $('theme-time'),
      dialogue: $('dialogue'), subtitle: $('subtitle'), reading: $('reading'), fps: $('fps'),
    };
    this.cardTimer = null;
    this.flashTimer = null;
    this.readTimer = null;
    this.lastPrompt = '';
    this.typing = false;
    document.querySelectorAll('button[data-action]').forEach((b) => {
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
    for (const k of ['title', 'pause', 'victory']) this.el[k].classList.toggle('hidden', k !== name);
    this.el.hud.classList.toggle('hidden', name !== 'hud');
  }

  overlay(name) {
    for (const k of ['controls', 'credits', 'settings']) this.el[k].classList.toggle('hidden', k !== name);
    if (name === 'settings') this.syncSettings();
  }

  get overlayOpen() { return ['controls', 'credits', 'settings'].some((k) => !this.el[k].classList.contains('hidden')); }

  setContinue(show) { this.el.cont.classList.toggle('hidden', !show); }

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
  setEmbers(n) { this.el.emberCount.textContent = `${n}/10`; }
  setLevelName(t) { this.el.levelName.textContent = t; }

  ring(el, frac, text, warn = false, paused = false) {
    el.classList.remove('hidden');
    el.querySelector('.ring').style.strokeDashoffset = String(169.6 * (1 - Math.max(0, Math.min(1, frac))));
    el.querySelector('.ring-text').textContent = text;
    el.classList.toggle('warn', warn);
    el.classList.toggle('paused', paused);
  }

  /** p = active puzzle (or null when walking corridors) */
  updateHUD(p, player, extraPrompt, objective) {
    if (p?.isLight) { this.updateLightHUD(p, player, extraPrompt, objective); return; }
    let pr = null, sub = '';
    if (p) { pr = this.promptFor(p); sub = this.subFor(p); }
    if (!pr && extraPrompt) pr = extraPrompt;
    const text = pr ? pr.text : '';
    if (text !== this.lastPrompt) { this.el.prompt.textContent = text; this.lastPrompt = text; }
    this.el.prompt.className = pr ? pr.cls || '' : '';
    if (this.el.sub.textContent !== sub) this.el.sub.textContent = sub;
    if (this.el.objective.textContent !== objective) this.el.objective.textContent = objective;

    const tm = p ? p.hudTimer : null;
    if (tm) this.ring(this.el.timer, tm.t / tm.max, String(Math.max(0, Math.ceil(tm.t))), tm.t <= 3, tm.paused);
    else this.el.timer.classList.add('hidden');
    this.el.vWarn.classList.toggle('on', !!tm && tm.t <= 3 && !tm.paused);

    if (player.flame) this.ring(this.el.flame, player.flame.t / player.flame.max, String(Math.ceil(player.flame.t)), player.flame.t < 3);
    else this.el.flame.classList.add('hidden');

    const rs = p?.selected;
    const showMem = !!rs && rs.lit && !rs.lockedOn && (rs.rewinding || rs.spec.mode === 'collar') && !rs.busy;
    this.el.memory.classList.toggle('hidden', !showMem);
    if (showMem) {
      const h = rs.relic.history;
      const frac = rs.rewinding ? Math.max(0, h.cursor) / Math.max(1, h.capacity) : h.fill;
      this.el.memoryFill.style.width = `${Math.round(frac * 100)}%`;
    }
    const rewinding = !!rs?.rewinding;
    this.el.vRewind.classList.toggle('on', rewinding);
    const anyLit = p ? [...p.relics.values()].some((r) => r.lit) : false;
    this.el.fire.classList.toggle('active', anyLit || !!player.flame);
    this.el.shadow.classList.toggle('active', !!p && ([...p.runes.values()].some((r) => r.lit) || (rs && p.alignmentOf(rs) > 0.6) || p.focus));
    this.el.time.classList.toggle('active', rewinding);
  }

  /** Time: the minute being marked, then the echo's hold (reuses the #timer ring). */
  echoRing(h) {
    const lbl = this.el.timer.querySelector('.ring-label');
    if (!h) { this.el.timer.classList.remove('echo'); this.el.vRewind.classList.remove('faint'); return; }
    this.ring(this.el.timer, h.t / h.max, String(Math.max(0, Math.ceil(h.t))), h.warn, false);
    this.el.timer.classList.add('echo');
    if (lbl.textContent !== h.label) lbl.textContent = h.label;
    this.el.vRewind.classList.toggle('on', h.label === 'MINUTE');
    this.el.vRewind.classList.add('faint');
    this.el.time.classList.add('active');
  }

  /** HUD for rooms built on the five rules: no turning, no memory bar, no carried flame. */
  updateLightHUD(p, player, extraPrompt, objective) {
    let pr = null;
    if (p.flash) pr = { text: p.flash.text, cls: p.flash.cls };
    else if (p.prompt0) {
      const t = p.prompt0;
      if (t.type === 'sconce') pr = t.b.lit ? { text: LIGHT_UI.rekindle, cls: 'fire' } : { text: LIGHT_UI.kindle, cls: 'fire' };
      else if (t.type === 'lever') pr = { text: LIGHT_UI.lever, cls: 'gold' };
      else if (t.type === 'read') pr = { text: LIGHT_UI.read, cls: 'cyan' };
    }
    if (!pr && extraPrompt) pr = extraPrompt;
    const text = pr ? pr.text : '';
    if (text !== this.lastPrompt) { this.el.prompt.textContent = text; this.lastPrompt = text; }
    this.el.prompt.className = pr ? pr.cls || '' : '';
    if (this.el.sub.textContent !== '') this.el.sub.textContent = '';
    if (this.el.objective.textContent !== objective) this.el.objective.textContent = objective;
    this.el.timer.classList.add('hidden');
    this.el.flame.classList.add('hidden');
    this.el.memory.classList.add('hidden');
    this.el.vRewind.classList.remove('on');
    this.el.vWarn.classList.remove('on');
    let anyLit = false, onRune = false;
    for (const b of p.sconces) if (b.lit) { anyLit = true; break; }
    for (const ru of p.runes.values()) if (ru.covered || ru.lit) { onRune = true; break; }
    this.el.fire.classList.toggle('active', anyLit);
    this.el.shadow.classList.toggle('active', onRune || !!this.game.shadows.playerOnShadow);
    this.el.time.classList.toggle('active', false);
  }

  promptFor(p) {
    if (p.flash) return { text: p.flash.text, cls: p.flash.cls };
    const t = p.prompt0;
    const P = PROMPTS_UI;
    const player = this.game.player;
    if (t) {
      if (t.type === 'relic') {
        const sp = t.rs.spec;
        if (sp.relayOnly) return { text: P.coldRelay, cls: '' };
        if (sp.cold) return player.flame ? { text: P.kindle, cls: 'fire' } : { text: P.cold, cls: '' };
        return { text: P.ignite, cls: 'fire' };
      }
      if (t.type === 'lever') return { text: P.lever, cls: 'gold' };
      if (t.type === 'hearth') return { text: P.takeFlame, cls: 'fire' };
      if (t.type === 'read') return { text: P.read, cls: 'cyan' };
    }
    const rs = p.selected;
    if (!rs || !rs.lit || rs.busy) return null;
    if (rs.lockedOn) return { text: P.holds, cls: 'gold' };
    if (rs.rewinding) return { text: '◀◀', cls: 'cyan' };
    if (p.bestCloseness(rs) > 0.6) return { text: P.near, cls: 'gold' };
    if (rs.spec.mode === 'collar' && !rs.usedRewind && !p.level.quiet) return { text: P.rewindHint, cls: 'cyan' };
    if (p.level.quiet && p.level.id !== 1) return null;
    return { text: P.turn, cls: '' };
  }

  subFor(p) {
    const rs = p.selected;
    if (!rs || !rs.lit || rs.lockedOn || rs.busy) return '';
    if (p.level.quiet && p.level.id !== 1) return '';
    const parts = [rs.spec.mode === 'collar' ? '[A] [D] NUDGE' : '[A] [D] TURN'];
    parts.push('HOLD [R] REWIND');
    if (rs.spec.rail) parts.push('[E] AT THE LEVER: SLIDE');
    parts.push('HOLD [Q] FOCUS');
    return parts.join('   ·   ');
  }

  clearHUD() {
    this.el.prompt.textContent = '';
    this.el.sub.textContent = '';
    this.lastPrompt = '';
    this.el.timer.classList.add('hidden');
    this.el.flame.classList.add('hidden');
    this.el.memory.classList.add('hidden');
    this.el.vRewind.classList.remove('on');
    this.el.vWarn.classList.remove('on');
  }

  setVictoryStats(seconds, rewinds, secrets) {
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    this.el.stats.textContent = `Time ${m}:${String(s).padStart(2, '0')}   ·   Memories rewound ${rewinds}   ·   Inscriptions found ${secrets}/3`;
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
const PROMPTS_UI = {
  ignite: '[E] IGNITE RELIC', kindle: '[E] KINDLE THE RELIC', cold: 'THIS RELIC IS COLD — IT NEEDS A FLAME',
  coldRelay: 'THIS RELIC WAITS FOR ANOTHER’S FIRE', takeFlame: '[E] TAKE THE FLAME', lever: '[E] SLIDE THE RELIC',
  read: '[E] READ', turn: 'TURN THE RELIC TO ALIGN ITS SHADOW', rewindHint: 'HOLD [R] TO REWIND THE RELIC',
  near: 'THE SHADOW IS NEAR', holds: 'THE SHADOW HOLDS',
};
