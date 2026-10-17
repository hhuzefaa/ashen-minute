"""
Title screen → main menu: transition, input lock, button art, navigation and every menu action.

Real keyboard and mouse events go through the page; the render loop is stopped and the game is
stepped explicitly (1/30 s), exactly like tests/playthrough.py.

    npm run build && npx vite preview --port 4173 &
    python3 tests/title_menu.py [--url ...] [--shots dir]
"""
import argparse, os, sys, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--url', default='http://localhost:4173/?test&lowfx')
ap.add_argument('--shots', default='')
args = ap.parse_args()
if args.shots: os.makedirs(args.shots, exist_ok=True)

S = 'window.__ashen'
T = f'{S}.titleMenu'
results, errors = [], []

def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''), flush=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(args.url)
    page.wait_for_function(f'{S} && {S}.state === "title"', timeout=120000)
    page.evaluate(f'''(() => {{
      const g = {S};
      g.renderer.setAnimationLoop(null);
      localStorage.clear(); g.world.progress.reset(); g.titleMenu.refreshContinue();
      window.__adv = (sec) => {{
        const n = Math.max(1, Math.round(sec * 30));
        for (let i = 0; i < n; i++) {{ g.step(1/30); g.input.pressed.clear(); }}
        g.input.endFrame();
      }};
      window.__lock = () => {{
        const r = document.getElementById('title-lockup').getBoundingClientRect();
        return {{ cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height }};
      }};
    }})()''')
    page.evaluate('document.fonts.ready')
    ev = page.evaluate
    def adv(sec): ev(f'window.__adv({sec})')
    def shot(name):
        if not args.shots: return
        ev(f'{S}.render()'); time.sleep(0.35)
        page.screenshot(path=os.path.join(args.shots, name + '.png'))
    phase = lambda: ev(f'{T}.phase')
    sel_action = lambda: ev(f'{T}.items[{T}.sel].action')
    VW, VH = 1280, 720

    # ------------------------------------------------------------------ splash
    adv(2.8)
    check('title state on launch', ev(f'{S}.state') == 'title' and phase() == 'splash')
    check('menu hidden on the splash', ev(f'[...document.querySelectorAll("#main-menu .rb-slot")].every(s => +getComputedStyle(s).opacity === 0)'))
    check('"press any button" prompt visible', ev('+getComputedStyle(document.getElementById("title-prompt")).opacity') > 0.9)
    L0 = ev('window.__lock()')
    check('title centred horizontally', abs(L0['cx'] - VW / 2) < 2, f"cx={L0['cx']:.1f}")
    check('title in the upper-middle of the screen', 0.25 * VH < L0['cy'] < 0.5 * VH, f"cy={L0['cy']:.0f}")
    check('keeper hidden for the title shot', ev(f'{S}.player.keeper.group.visible') is False)
    check('camera in the Sanctuary, facing the Heart', ev(f'{S}.camera.position.z') > 15 and abs(ev(f'{S}.camera.position.x')) < 3)
    check('hub braziers kindled for the title', ev(f'{S}.world.hubZone.ctx.progressBraziers.every(b => b.lit)'))
    shot('01_splash')

    # ------------------------------------------------------------------ morph
    el_id = ev('(() => { window.__lockEl = document.getElementById("title-lockup"); return 1; })()')
    page.keyboard.press('KeyM')  # mute key is not "any button"
    adv(0.1)
    check('mute key does not start the transition', phase() == 'splash')
    page.keyboard.press('KeyG')
    adv(1 / 30)
    check('any key starts the transition', phase() == 'morph')
    samples = []
    for _ in range(8):
        adv(0.2)
        samples.append(ev('window.__lock()'))
        # spam input mid-transition: must neither restart it nor trigger a menu action
        page.keyboard.press('Enter'); page.keyboard.press('ArrowDown'); page.keyboard.press('KeyX')
    check('input during the transition is ignored', ev(f'{S}.state') == 'title' and phase() in ('morph', 'menu') and ev(f'{T}.sel') == 1)
    ys = [s['cy'] for s in samples]; ws = [s['w'] for s in samples]
    check('the same title element glides upward', all(b <= a + 0.01 for a, b in zip(ys, ys[1:])) and ys[-1] < L0['cy'] - 100, f'{[round(y) for y in ys]}')
    check('…and scales down continuously', all(b <= a + 0.01 for a, b in zip(ws, ws[1:])) and ws[-1] < L0['w'] * 0.7, f'{[round(w) for w in ws]}')
    check('it is the very same DOM node (no swap)', ev('window.__lockEl === document.getElementById("title-lockup") && window.__lockEl.isConnected'))
    check('prompt faded away', ev('+getComputedStyle(document.getElementById("title-prompt")).opacity') < 0.02)
    adv(0.6)
    check('transition settles into the menu', phase() == 'menu')
    L1 = ev('window.__lock()')
    check('menu title at the top-centre', abs(L1['cx'] - VW / 2) < 2 and L1['cy'] < 0.2 * VH, f"cy={L1['cy']:.0f}")
    shot('02_menu')

    # ------------------------------------------------------------------ layout + art
    rects = ev('[...document.querySelectorAll("#main-menu .rune-btn")].filter(b => b.offsetParent).map(b => { const r = b.getBoundingClientRect(); return [r.left, r.top, r.width, r.height, b.offsetWidth, b.offsetHeight]; })')
    ratios = [r[4] / r[5] for r in rects]
    check('buttons keep the artwork ratio 1092:400', all(abs(x - 1092 / 400) < 0.02 for x in ratios), f'{[round(x, 3) for x in ratios]}')
    widths = {r[4] for r in rects}
    check('all buttons share one size', len(widths) == 1, f'{widths}')
    centres = [r[0] + r[2] / 2 for r in rects]
    check('buttons centred on one axis', all(abs(c - VW / 2) < 1.5 for c in centres), f'{[round(c, 1) for c in centres]}')
    gaps = [round(rects[i + 1][1] - rects[i][1], 1) for i in range(len(rects) - 1)]
    unsel = [i for i in range(len(rects)) if i not in (1,)]
    check('even vertical rhythm', max(gaps) - min(gaps) < rects[0][5] * 0.08, f'{gaps}')
    check('menu below the title, inside the screen', rects[0][1] > L1['cy'] + L1['h'] / 2 and rects[-1][1] + rects[-1][3] < VH)
    arts = ev('[...new Set([...document.querySelectorAll("#main-menu .rb-art")].map(e => getComputedStyle(e).backgroundImage))]')
    check('provided artwork used for normal / hover / pressed', len(arts) == 3 and all('button-' in a for a in arts), f'{len(arts)}')
    check('art decoded (no pop-in)', ev(f'{T}.artReady.then(() => true)'))

    # ------------------------------------------------------------------ selection
    check('Continue not offered without a save (no empty slot: 4 buttons)', ev('document.getElementById("btn-continue").offsetParent === null') and len(rects) == 4)
    check('default selection is New Game', sel_action() == 'new-game')
    check('selected button is visibly different', ev('(() => { const a = document.querySelector(".rune-btn.is-selected .rb-hover"); return +getComputedStyle(a).opacity > 0.8; })()') and ev('getComputedStyle(document.querySelector(".rune-btn.is-selected")).transform') != 'none')
    page.keyboard.press('ArrowDown'); adv(0.05)
    check('ArrowDown moves the selection', sel_action() == 'settings')
    page.keyboard.press('KeyS'); adv(0.05)
    check('S moves the selection', sel_action() == 'credits')
    page.keyboard.press('ArrowUp'); page.keyboard.press('ArrowUp'); adv(0.05)
    check('ArrowUp back to New Game', sel_action() == 'new-game')
    page.keyboard.press('ArrowUp'); adv(0.05)
    check('navigation wraps (Continue absent)', sel_action() == 'quit')
    check('exactly one selected button', ev('document.querySelectorAll("#main-menu .rune-btn.is-selected").length') == 1)
    # mouse
    b = rects[1]
    page.mouse.move(b[0] + b[2] / 2, b[1] + b[3] / 2); adv(0.05)
    check('mouse hover selects', sel_action() == 'settings')

    # ------------------------------------------------------------------ settings / controls / credits
    page.mouse.move(b[0] + b[2] / 2, b[1] + b[3] / 2); adv(0.05)
    page.keyboard.press('Enter'); adv(0.05)
    # (headless Chromium may hold a CSS transition pending while no frame is produced, so read the
    #  state's resolved style with transitions switched off for this one check)
    check('pressed state shows the clicked artwork', ev('''(() => {
      const st = document.createElement('style'); st.textContent = '* { transition: none !important; }'; document.head.appendChild(st);
      const p = document.querySelector('.rune-btn.is-pressed .rb-pressed'); const o = p ? +getComputedStyle(p).opacity : 0;
      st.remove(); return o; })()''') > 0.99)
    adv(0.3)
    check('Settings opens', ev('!document.getElementById("screen-settings").classList.contains("hidden")') and phase() == 'overlay')
    page.keyboard.press('ArrowDown'); adv(0.05)
    check('menu keys are inert while Settings is open', sel_action() == 'settings')
    page.click('#screen-settings button[data-action="controls"]'); adv(0.05)
    check('Settings → Controls', ev('!document.getElementById("screen-controls").classList.contains("hidden")'))
    page.keyboard.press('Escape'); adv(0.05)
    check('Esc from Controls returns to Settings', ev('!document.getElementById("screen-settings").classList.contains("hidden") && document.getElementById("screen-controls").classList.contains("hidden")'))
    page.keyboard.press('Escape'); adv(0.1)
    check('Esc from Settings returns to the menu', phase() == 'menu' and not ev(f'{S}.ui.overlayOpen') and sel_action() == 'settings')
    page.keyboard.press('ArrowDown'); page.keyboard.press('Enter'); adv(0.35)
    check('Credits opens', ev('!document.getElementById("screen-credits").classList.contains("hidden")'))
    page.keyboard.press('Enter'); adv(0.1)  # focus sits on Back
    check('Enter on Back closes Credits', phase() == 'menu' and not ev(f'{S}.ui.overlayOpen'))

    # ------------------------------------------------------------------ quit
    page.keyboard.press('ArrowDown'); page.keyboard.press('Enter'); adv(0.35)
    check('Quit shows the farewell (web: the tab is the window)', phase() == 'farewell' and ev('!document.getElementById("title-farewell").classList.contains("hidden")'))
    shot('03_farewell')
    adv(0.6); page.keyboard.press('KeyQ'); adv(0.1)
    check('any button returns from the farewell', phase() == 'menu' and ev('document.getElementById("title-farewell").classList.contains("hidden")'))

    # ------------------------------------------------------------------ new game (no save: no confirmation)
    page.keyboard.press('Home'); adv(0.05)
    check('Home selects the first available item', sel_action() == 'new-game')
    page.keyboard.press('Enter'); adv(0.35)
    check('New Game asks: Play Tutorial / Skip Tutorial', phase() == 'confirm' and ev(f'{T}.dlg.el.id') == 'title-choice')
    page.keyboard.press('ArrowDown'); page.keyboard.press('Enter'); adv(0.35)
    check('Skip Tutorial leaves the title', ev(f'{S}.state') != 'title' and phase() == 'leaving')
    time.sleep(0.8); adv(1.0)
    check('opening cutscene starts', ev(f'{S}.state') == 'cutscene' and ev(f'{S}.story.scene && {S}.story.scene.id') == 'opening')
    check('title dressing undone (no fake progress)', ev(f'{S}.world.hubZone.ctx.progressBraziers.every(b => !b.lit)') and ev(f'{S}.world.heart.awake') == 0)
    check('keeper visible again', ev(f'{S}.player.keeper.group.visible'))
    page.keyboard.press('Escape'); adv(1.5)
    check('gameplay begins', ev(f'{S}.state') == 'playing')
    # no checkpoint reached yet: starting the run alone must make it resumable from the main menu
    ev(f'{S}.pause()'); adv(0.05)
    page.click('#screen-pause button[data-action="main-menu"]'); time.sleep(0.9); adv(0.1)
    check('Main Menu from pause returns to the title', ev(f'{S}.state') == 'title')
    adv(0.2)
    check('returning skips the splash: the menu forms directly', phase() in ('morph', 'menu') and ev('+getComputedStyle(document.getElementById("title-prompt")).opacity') < 0.02)
    adv(1.2)
    check('menu ready', phase() == 'menu')
    check('Continue offered once a run has started, and selected first', ev('document.getElementById("btn-continue").offsetParent !== null') and sel_action() == 'continue')

    # ------------------------------------------------------------------ new game over a save asks first
    page.keyboard.press('ArrowDown'); page.keyboard.press('Enter'); adv(0.35)
    check('New Game over a save asks for confirmation', phase() == 'confirm' and ev('!document.getElementById("title-confirm").classList.contains("hidden")'))
    check('safe default is "Keep It"', ev(f'{T}.confirmItems[{T}.confirmSel].action') == 'no')
    shot('04_confirm')
    page.keyboard.press('Escape'); adv(0.05)
    check('Esc cancels and keeps the save', phase() == 'menu' and ev(f'{S}.world.progress.hasSave') and ev(f'{S}.state') == 'title')

    # ------------------------------------------------------------------ resize keeps the composition
    page.set_viewport_size({'width': 1000, 'height': 760}); adv(0.05); time.sleep(0.2)
    L2 = ev('window.__lock()')
    rects2 = ev('[...document.querySelectorAll("#main-menu .rune-btn")].filter(b => b.offsetParent).map(b => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top, r.bottom, b.offsetWidth / b.offsetHeight]; })')
    check('after resize: title and buttons still centred', abs(L2['cx'] - 500) < 2 and all(abs(r[0] - 500) < 1.5 for r in rects2))
    check('after resize: everything on screen, ratio kept', rects2[-1][2] < 760 and rects2[0][1] > L2['cy'] and all(abs(r[3] - 1092 / 400) < 0.02 for r in rects2))
    page.set_viewport_size({'width': 1280, 'height': 720}); adv(0.05)

    # ------------------------------------------------------------------ continue
    page.keyboard.press('Home'); adv(0.05)
    check('Home selects Continue when available', sel_action() == 'continue')
    page.keyboard.press('Enter'); adv(0.35); time.sleep(0.7); adv(0.3)
    check('Continue resumes play at the checkpoint', ev(f'{S}.state') == 'playing' and abs(ev(f'{S}.player.pos.z') - 75.5) < 1.5)
    check('title hidden during play', ev('document.getElementById("screen-title").classList.contains("hidden")'))

    check('no console errors', not errors, '; '.join(errors[:3]))
    browser.close()

passed = sum(1 for r in results if r[1])
print(f'\n{passed}/{len(results)} checks passed')
sys.exit(0 if passed == len(results) else 1)
