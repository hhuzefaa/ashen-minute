// Title / HUD / pause / controls / credits / victory (doc §7.1). Every button routes to Game.
const $ = (id) => document.getElementById(id);

export class UIManager {
  constructor(game) {
    this.game = game;
    this.el = {
      hud: $('hud'), prompt: $('prompt'), sub: $('subprompt'), objective: $('objective'),
      emberCount: $('ember-count'), slots: [...document.querySelectorAll('.ember-slot')],
      timer: $('timer'), timerRing: $('timer-ring'), timerText: $('timer-text'),
      memory: $('memory'), memoryFill: $('memory-fill'),
      card: $('card'), cardKicker: $('card-kicker'), cardTitle: $('card-title'),
      flash: $('flash-text'), fade: $('fade'), loading: $('loading'),
      vRewind: $('vignette-rewind'), vWarn: $('vignette-warn'),
      title: $('screen-title'), pause: $('screen-pause'), victory: $('screen-victory'),
      controls: $('screen-controls'), credits: $('screen-credits'), stats: $('victory-stats'),
      fire: $('theme-fire'), shadow: $('theme-shadow'), time: $('theme-time'),
    };
    this.cardTimer = null;
    this.flashTimer = null;
    this.lastPrompt = '';
    document.querySelectorAll('button[data-action]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        game.audio.play('sfx_ui_click');
        game.onAction(b.dataset.action);
      });
    });
  }

  show(name) {
    for (const k of ['title', 'pause', 'victory']) this.el[k].classList.toggle('hidden', k !== name);
    this.el.hud.classList.toggle('hidden', name !== 'hud');
  }

  overlay(name) {
    this.el.controls.classList.toggle('hidden', name !== 'controls');
    this.el.credits.classList.toggle('hidden', name !== 'credits');
  }

  get overlayOpen() { return !this.el.controls.classList.contains('hidden') || !this.el.credits.classList.contains('hidden'); }

  setMuted(m) {
    document.querySelectorAll('.mute-btn').forEach((b) => { b.textContent = m ? 'Sound: Off' : 'Sound: On'; });
  }

  fadeTo(opacity, seconds = 0.6) {
    this.el.fade.style.transitionDuration = `${seconds}s`;
    this.el.fade.style.opacity = String(opacity);
  }

  hideLoading() { this.el.loading.classList.add('hidden'); }

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

  setEmbers(n) {
    this.el.slots.forEach((s, i) => s.classList.toggle('lit', i < n));
    this.el.emberCount.textContent = `${n}/3`;
  }

  /** Called every frame while playing. */
  updateHUD(p) {
    if (!p) return;
    const pr = p.prompt();
    const text = pr ? pr.text : '';
    if (text !== this.lastPrompt) {
      this.el.prompt.textContent = text;
      this.lastPrompt = text;
    }
    this.el.prompt.className = pr ? pr.cls : '';
    const sub = p.subprompt();
    if (this.el.sub.textContent !== sub) this.el.sub.textContent = sub;
    const obj = p.objective();
    if (this.el.objective.textContent !== obj) this.el.objective.textContent = obj;

    // timer ring (Room 3)
    const showTimer = p.timerRunning;
    this.el.timer.classList.toggle('hidden', !showTimer);
    if (showTimer) {
      const d = p.level.bridgeDuration;
      const f = Math.max(0, p.timer / d);
      this.el.timerRing.style.strokeDashoffset = String(169.6 * (1 - f));
      this.el.timerText.textContent = String(Math.max(0, Math.ceil(p.timer)));
      this.el.timer.classList.toggle('warn', p.timer <= 3);
      this.el.timer.classList.toggle('paused', !!p.timerPaused);
    }
    this.el.vWarn.classList.toggle('on', showTimer && p.timer <= 3 && !p.timerPaused);

    // memory bar (rewind)
    const showMem = p.rewinding || (p.level.mode === 'collar' && p.state === 'ALIGNING' && p.nearRelic && !p.jolt);
    this.el.memory.classList.toggle('hidden', !showMem);
    if (showMem) {
      const h = p.relic.history;
      const frac = p.rewinding ? Math.max(0, h.cursor) / Math.max(1, h.capacity) : h.fill;
      this.el.memoryFill.style.width = `${Math.round(frac * 100)}%`;
    }
    this.el.vRewind.classList.toggle('on', p.rewinding);

    // theme indicators
    this.el.fire.classList.toggle('active', p.relic.lit);
    this.el.shadow.classList.toggle('active', p.relic.lit && (p.alignment > 0.6 || p.solved || p.focus));
    this.el.time.classList.toggle('active', p.rewinding);
  }

  clearHUD() {
    this.el.prompt.textContent = '';
    this.el.sub.textContent = '';
    this.lastPrompt = '';
    this.el.timer.classList.add('hidden');
    this.el.memory.classList.add('hidden');
    this.el.vRewind.classList.remove('on');
    this.el.vWarn.classList.remove('on');
  }

  setVictoryStats(seconds, rewinds) {
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    this.el.stats.textContent = `Run time ${m}:${String(s).padStart(2, '0')}   ·   Memories rewound ${rewinds}`;
  }
}
