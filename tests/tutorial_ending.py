"""
The optional tutorial (choice screen, the whole training court on foot, pause options, save
isolation) and the Heart of Minutes ending trigger (victory as soon as every ember is in and the
final line has finished, wherever the Keeper stands).

Real keyboard and mouse events; the simulation is stepped explicitly (1/30 s) like playthrough.py.

    npm run build && npx vite preview --port 4173 &
    python3 tests/tutorial_ending.py [--url ...] [--shots dir]
"""
import argparse, json, math, os, sys, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--url', default='http://localhost:4173/?test&lowfx')
ap.add_argument('--shots', default='')
args = ap.parse_args()
if args.shots: os.makedirs(args.shots, exist_ok=True)
S = 'window.__ashen'
T = f'{S}.tutorial'
KEY = 'ashen-minutes.save.v3'
TX = 240
results, errors = [], []

def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''), flush=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(120000)
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    ev = page.evaluate

    def adv(sec):
        ev(f'window.__adv({sec})')

    def boot(save=None):
        page.goto(args.url)
        page.wait_for_function(f'{S} && {S}.state === "title"')
        ev(f'{S}.saveClock = () => {{}}; localStorage.removeItem("{KEY}")')
        if save is not None: ev(f'localStorage.setItem("{KEY}", {json.dumps(json.dumps(save))})')
        page.reload()
        page.wait_for_function(f'{S} && {S}.state === "title"')
        ev(f'''(() => {{ const g = {S}; g.renderer.setAnimationLoop(null);
          window.__falls = 0; const of = g.player.onFall; g.player.onFall = () => {{ window.__falls++; of(); }};
          window.__adv = (sec) => {{ const n = Math.max(1, Math.round(sec * 30));
            for (let i = 0; i < n; i++) {{ g.step(1/30); if (i === 0) {{ g.input.pressed.clear(); g.input.mouseDX = g.input.mouseDY = 0; }} }}
            g.input.endFrame(); }}; }})()''')
        adv(2.5); page.keyboard.press('KeyG'); adv(2.2)

    def st(): return ev(f'{S}.state')
    def step_i(): return ev(f'{T}.i')
    def hint(): return ev('document.querySelector("#tutorial-hint .th-text").innerText')
    def note(): return ev('document.querySelector("#tutorial-hint .th-note").innerText')
    def press(k, hold=0.1): page.keyboard.down(k); adv(hold); page.keyboard.up(k); adv(1 / 30)
    def pos(): return ev(f'[{S}.player.pos.x, {S}.player.pos.z, {S}.player.grounded]')
    def shot(name):
        if not args.shots: return
        ev(f'{S}.lightPool.update({S}.player.pos); {S}.render()'); time.sleep(0.4)
        page.screenshot(path=os.path.join(args.shots, name + '.png'))
    def wait_until(js, max_sec=5.0, dt=0.1):
        for _ in range(int(max_sec / dt)):
            if ev(js): return True
            adv(dt)
        return bool(ev(js))
    def wait_step(n, max_sec=4): return wait_until(f'{T}.i >= {n}', max_sec)
    def stand_at(x, z, yaw=None):
        ev(f'{S}.player.pos.set({x}, 0, {z}); {S}.player.vel.set(0,0,0);' + (f'{S}.player.facing = {yaw}; {S}.cameraCtl.yaw = {yaw};' if yaw is not None else ''))
        adv(1 / 30)
    def lantern_at(x, z, yaw=0.0):
        for _ in range(4):
            ev(f'''(() => {{ const g={S}, v=new g.player.pos.constructor(); g.player.facing={yaw}; g.player.syncVisual();
              g.player.keeper.group.updateMatrixWorld(true); g.player.keeper.lanternCore.getWorldPosition(v);
              g.player.pos.x += {x} - v.x; g.player.pos.z += {z} - v.z; g.player.vel.set(0,0,0); g.player.syncVisual(); }})()''')
        adv(1 / 30)
    def walk_to(x, z, max_sec=20, sprint=False, hop_at=None):
        page.keyboard.down('KeyW')
        if sprint: page.keyboard.down('ShiftLeft')
        hopped = False
        for _ in range(int(max_sec * 10)):
            d = ev(f'''(() => {{ const g={S}; const dx={x}-g.player.pos.x, dz={z}-g.player.pos.z;
               g.cameraCtl.yaw = Math.atan2(-dx, -dz); return Math.hypot(dx, dz); }})()''')
            if d < 0.7: break
            if hop_at is not None and not hopped and ev(f'{S}.player.pos.z') < hop_at:
                page.keyboard.press('Space'); hopped = True
            adv(0.1)
        page.keyboard.up('KeyW')
        if sprint: page.keyboard.up('ShiftLeft')
        adv(0.2)
        return ev(f'Math.hypot({x}-{S}.player.pos.x, {z}-{S}.player.pos.z)')
    def puzzle(i): return f'{S}.world.levelById.get({i})'
    def kindle(level, sid, dx=1.3, dz=0.2):
        b = ev(f'(() => {{ const b={puzzle(level)}.sconces.find(b => b.id === "{sid}"); return [b.pos.x, b.pos.z]; }})()')
        stand_at(b[0] + dx, b[1] + dz)
        press('KeyE'); adv(0.2)
        return ev(f'{puzzle(level)}.sconces.find(b => b.id === "{sid}").lit')
    def walk_shadow(level, stone, kind, a0=1.4, beyond=2.0):
        s = ev(f'''(() => {{ const s=[...{puzzle(level)}.stoneById.get("{stone}").shadows.values()].find(s => s.kind === "{kind}" && s.alive);
          return s ? {{ len: s.len, ux: s.ux, uz: s.uz, bx: s.stone.base.x, bz: s.stone.base.z }} : null; }})()''')
        if not s: return False, None
        f0 = ev('window.__falls')
        stand_at(s['bx'] + s['ux'] * a0, s['bz'] + s['uz'] * a0, math.atan2(-s['ux'], -s['uz']))
        walk_to(s['bx'] + s['ux'] * (s['len'] + beyond), s['bz'] + s['uz'] * (s['len'] + beyond), 12)
        adv(1.0)
        return ev('window.__falls') == f0, pos()
    def saved(): return ev(f'localStorage.getItem("{KEY}")')
    def menu_pick(action):
        for _ in range(8):
            if ev(f'{S}.titleMenu.items[{S}.titleMenu.sel].action') == action: break
            page.keyboard.press('ArrowDown'); adv(0.03)
        page.keyboard.press('Enter'); adv(0.3)
    def pause_pick(action):
        for _ in range(9):
            if ev(f'{S}.pauseMenu.items[{S}.pauseMenu.sel].dataset.action') == action: break
            page.keyboard.press('ArrowDown')
        page.keyboard.press('Enter'); time.sleep(0.32)

    # =============================================================================== the choice
    boot()
    menu_pick('new-game')
    check('fresh launch: New Game opens the tutorial choice (no save → no confirmation)', ev(f'{S}.titleMenu.phase') == 'confirm' and ev(f'{S}.titleMenu.dlg.el.id') == 'title-choice')
    labels = ev('[...document.querySelectorAll("#title-choice .rune-btn")].map(b => b.innerText.trim()).join("|")')
    check('choice offers Play Tutorial / Skip Tutorial, Play selected', labels.lower() == 'play tutorial|skip tutorial' and ev(f'{S}.titleMenu.confirmSel') == 0, labels)
    dims = ev('[...document.querySelectorAll("#title-choice .rune-btn, #main-menu .rune-btn")].filter(b => b.offsetParent).map(b => [b.offsetWidth, b.offsetHeight])')
    check('choice buttons match the main menu buttons (same art size)', len({tuple(d) for d in dims}) == 1, str(dims[:3]))
    page.keyboard.press('ArrowDown'); adv(0.05)
    check('arrow keys move the choice selection', ev(f'{S}.titleMenu.confirmSel') == 1)
    page.keyboard.press('Escape'); adv(0.05)
    check('Esc backs out of the choice to the menu', ev(f'{S}.titleMenu.phase') == 'menu' and st() == 'title')
    shot('t00_menu')
    menu_pick('new-game'); page.keyboard.press('ArrowDown'); page.keyboard.press('Enter'); adv(0.35); time.sleep(0.8); adv(0.8)
    check('Skip Tutorial = today\'s New Game (cold open plays)', st() == 'cutscene' and ev(f'{S}.story.scene && {S}.story.scene.id') == 'opening' and not ev(f'{T}.active'))
    page.keyboard.press('Escape'); adv(1.5)
    check('…and the story starts at the entrance terrace', st() == 'playing' and abs(pos()[1] - 75.5) < 2)

    # =============================================================================== into the court
    boot()
    menu_pick('new-game'); page.keyboard.press('Enter'); adv(0.35); time.sleep(0.8); adv(0.8)
    check('Play Tutorial loads the training court', st() == 'playing' and ev(f'{T}.active') and pos()[0] > 200)
    check('the court is a separate place (≥ 150 m from every story room)', ev(f'{S}.world.puzzles.filter(p => !p.level.tutorial).every(p => p.level.rect[1] < {TX} - 150)'))
    check('no story zone is drawn from the court', ev(f'{S}.world.zones.filter(z => z.group.visible).every(z => z.key.startsWith("tut") || z.key.startsWith("L10"))'),
          ev(f'{S}.world.zones.filter(z => z.group.visible).map(z => z.key).join()'))
    check('first step: look around (one instruction at a time)', 'look around' in hint().lower() and ev(f'{T}.i') == 0)
    check('HUD shows the court, not the story counter', ev('getComputedStyle(document.getElementById("ember-count")).display') == 'none' and 'Novice Court' in ev('document.getElementById("level-name").textContent'))
    shot('t01_start')
    save0, play0 = saved(), ev(f'{S}.playTime')
    # A1 look (drag the mouse over the canvas: real mouse events)
    page.mouse.move(400, 360); page.mouse.down(); page.mouse.move(1100, 330, steps=12); adv(0.1); page.mouse.move(300, 380, steps=12); adv(0.1); page.mouse.up(); adv(0.1)
    check('A · mouse look detected', wait_step(1), f'look={ev(f"{T}.look"):.2f}')
    # A2 walk
    ev(f'{S}.cameraCtl.yaw = 0'); page.keyboard.down('KeyW'); adv(1.6); page.keyboard.up('KeyW'); adv(0.2)
    check('A · walking (W A S D) detected', wait_step(2))
    page.keyboard.down('KeyD'); adv(0.3); page.keyboard.up('KeyD')
    # A3 run
    ev(f'{S}.cameraCtl.yaw = 0'); page.keyboard.down('ShiftLeft'); page.keyboard.down('KeyW'); adv(1.2); page.keyboard.up('KeyW'); page.keyboard.up('ShiftLeft'); adv(0.2)
    check('A · running (Shift) detected', wait_step(3))
    # A4 the fallen column: blocked without a hop, over it with one
    walk_to(TX, -19.0, 10)
    page.keyboard.down('KeyW'); ev(f'{S}.cameraCtl.yaw = 0'); adv(1.2); page.keyboard.up('KeyW'); adv(0.2)
    blocked_z = pos()[1]
    check('the column blocks walking', blocked_z > -20.8, f'z={blocked_z:.2f}')
    d = walk_to(TX, -24, 8, hop_at=-20.0)
    check('A · hopping over the column (Space)', wait_step(4) and pos()[1] < -21.8, f'z={pos()[1]:.2f}')
    page.keyboard.press('KeyR'); adv(0.2)
    check('R is not offered before the echo section', not ev(f'{S}.echoes.recording'))
    # B1 + B2: walk around the stone, then put its shadow on the rune
    walk_to(TX, -31.5, 10)
    for (x, z) in ((TX + 2.6, -34), (TX + 2.6, -38), (TX - 2.6, -38), (TX - 2.6, -33.6)): walk_to(x, z, 6)
    check('B · the stone\'s shadow swung around (watched)', wait_step(5), f'swing={ev(f"{T}.swing"):.2f}')
    lantern_at(TX - 2.4, -34.2, 2.2); adv(0.2)
    check('B · shadow laid on the rune → rune wakes, gate opens', wait_until(f'{puzzle(102)}.runes.get("r1").lit', 3) and wait_step(6) and wait_until(f'{S}.world.gates.get("g_t1").isOpen', 2))
    shot('t02_rune')
    adv(1.5)
    check('B · kindling the sconce (E)', kindle(102, 'k1') and wait_step(7))
    ok, p = walk_shadow(102, 'T2', 'sconce')
    check('B · crossed the gap on the sconce\'s shadow', ok and wait_step(8), str(p))
    shot('t03_crossed')
    # C · the echo
    walk_to(TX, -60, 6)
    press('KeyR')
    check('C · R marks a minute (sigil)', ev(f'{S}.echoes.recording') and wait_step(9))
    walk_to(TX + 2.5, -62, 3); adv(0.3); press('KeyR')
    check('C · R again releases the echo', ev(f'{S}.echoes.echoes.length') == 1 and wait_step(10))
    check('C · the echo walks, then holds the light', wait_until(f'{S}.echoes.echoes.some(e => e.state === "hold")', 6) and wait_step(11))
    shot('t04_echo')
    check('C · the info step opens the gate by itself', wait_until(f'{S}.world.gates.get("g_t2").isOpen', 8) and wait_step(12, 9))
    walk_to(TX, -73, 8)
    check('C · through the gate', wait_step(13))
    # a fall over the gap: safe, with feedback (no echo yet)
    stand_at(TX + 2, -79.4, 0); page.keyboard.down('KeyW'); adv(1.6); page.keyboard.up('KeyW'); adv(1.2)
    check('falling is safe: back on solid ground with a note', ev('window.__falls') >= 1 and pos()[1] > -80.2 and 'solid ground' in note().lower(), note())
    # D · leave the echo in the ring
    adv(13)  # (the practice echo crumbles)
    stand_at(TX, -77.2, 0); press('KeyR'); adv(1.0); press('KeyR')
    check('D · the echo holds the stone\'s shadow across the gap', wait_until(f'{T}.echoBridge()', 5) and wait_step(14))
    ok, p = walk_shadow(103, 'T4', 'echo', a0=1.6)
    check('D · crossed on the echo-held shadow', ok and wait_step(15), str(p))
    shot('t05_echo_cross')
    # E · focus, the right sconce, the lever
    walk_to(TX, -87, 4)
    page.keyboard.down('KeyQ'); adv(1.0); page.keyboard.up('KeyQ')
    check('E · Focus (hold Q) detected', wait_step(16))
    kindle(104, 'ke', dx=1.3); adv(0.4)
    check('E · the wrong sconce says why', 'not that one' in note().lower() and not ev(f'{puzzle(104)}.runes.get("r5").lit'), note())
    kindle(104, 'kw', dx=-1.3); adv(0.2)
    check('E · the right sconce wakes the rune → gate', wait_until(f'{puzzle(104)}.runes.get("r5").lit', 3) and wait_step(17) and wait_until(f'{S}.world.gates.get("g_t3").isOpen', 3))
    adv(1.2)
    walk_to(TX - 1, -101.5, 6)
    kindle(104, 'kr', dx=1.2, dz=0.6)
    stand_at(TX + 0.6, -103.4, 0); press('KeyE'); adv(1.2)
    check('E · the lever slides the stone (E)', wait_step(18) and ev(f'{puzzle(104)}.stoneById.get("T6").slot') == 1)
    press('KeyE'); adv(1.2)
    stand_at(TX - 4, -103, 0); adv(1.0)
    check('E · slid until its shadow wakes the rune → last gate', wait_until(f'{puzzle(104)}.runes.get("r6").lit', 3) and wait_step(19) and wait_until(f'{S}.world.gates.get("g_t4").isOpen', 3))
    shot('t06_lever')
    adv(1.5)
    walk_to(TX, -121.4, 10)
    adv(1.5)
    check('F · the arch ends the training: Training Complete', st() == 'tutorialDone' and ev('!document.getElementById("screen-tutorial-done").classList.contains("hidden")'))
    check('Training Complete offers Begin the Story / Main Menu', ev('[...document.querySelectorAll("#screen-tutorial-done .rune-btn")].map(b => b.dataset.action).join()') == 'tutorial-story,main-menu')
    shot('t07_done')
    check('the court wrote nothing to the save', saved() == save0, saved())
    check('the play clock did not run in the court', ev(f'{S}.playTime') == play0)
    check('the story\'s echo was never granted', not ev(f'{S}.world.progress.data.abilities.echo'))
    page.keyboard.press('Enter'); time.sleep(0.4); adv(0.1); time.sleep(0.8); adv(0.8)
    check('Begin the Story → the existing cold open', st() == 'cutscene' and ev(f'{S}.story.scene && {S}.story.scene.id') == 'opening' and not ev(f'{T}.active'))
    pr = json.loads(saved())
    check('…a fresh story: started, 0 rooms, no echo, clock at 0', pr['started'] and pr['completed'] == [] and not pr['abilities']['echo'] and ev(f'{S}.playTime') < 2)
    page.keyboard.press('Escape'); adv(1.5)
    check('…and control at the entrance terrace, no tutorial UI', st() == 'playing' and abs(pos()[1] - 75.5) < 2 and ev('document.getElementById("tutorial-hint").classList.contains("hidden")'))
    page.keyboard.press('KeyR'); adv(0.2)
    check('…R does nothing in the story before Room IV (as before)', not ev(f'{S}.echoes.recording'))

    # =============================================================================== pause, restart, exit
    old = {'v': 3, 'completed': [1, 2], 'gates': ['g_L1', 'g_hub_w'], 'story': [], 'secrets': [], 'lostMinutes': ['lm1'], 'abilities': {'echo': False}, 'echoesMade': 0, 'embers': 2, 'checkpoint': {'x': 0, 'z': 19, 'yaw': 0}, 'started': True, 'playTime': 333}
    boot(old)
    check('a saved journey: Continue offered', ev('document.getElementById("btn-continue").offsetParent !== null'))
    menu_pick('new-game')
    check('New Game over a save asks first (Keep it default)', ev(f'{S}.titleMenu.dlg.el.id') == 'title-confirm' and ev(f'{S}.titleMenu.confirmSel') == 1)
    page.keyboard.press('ArrowUp'); page.keyboard.press('Enter'); adv(0.35)
    check('Begin Anew → the tutorial choice', ev(f'{S}.titleMenu.dlg.el.id') == 'title-choice' and ev(f'{S}.titleMenu.phase') == 'confirm')
    page.keyboard.press('Enter'); adv(0.35); time.sleep(0.8); adv(0.8)
    check('Play Tutorial with a save: in the court, save untouched', ev(f'{T}.active') and json.loads(saved())['completed'] == [1, 2])
    page.keyboard.press('Escape'); adv(0.05)
    acts = ev('[...document.querySelectorAll("#screen-pause .rune-btn")].filter(b => !b.classList.contains("hidden")).map(b => b.dataset.action).join()')
    check('tutorial pause: Resume · Restart Section · Restart Tutorial · Skip Tutorial · Settings · Main Menu', acts == 'resume,restart-room,tutorial-restart,tutorial-skip,settings,main-menu', acts)
    check('tutorial pause freezes the court', st() == 'paused')
    pause_pick('resume'); adv(0.1)
    # walk on, then Restart Section / Restart Tutorial
    walk_to(TX, -10, 6)
    page.keyboard.press('Escape'); adv(0.05); pause_pick('restart-room'); time.sleep(0.4); adv(0.3)
    check('Restart Section: back to the section\'s start', st() == 'playing' and abs(pos()[1] - 0) < 0.6)
    ev(f'{T}.i = 9; {T}.sectionReached = 103; {T}.enterStep()'); stand_at(TX, -60, 0); adv(0.3); press('KeyR'); adv(0.6); press('KeyR'); adv(0.2)
    check('(echo usable in section C)', ev(f'{S}.echoes.echoes.length') == 1)
    page.keyboard.press('Backspace'); adv(0.05); time.sleep(0.45); adv(0.3)  # (the restart runs behind a short real-time fade)
    check('Backspace in the court restarts only that section (echo cleared, its first step)', ev(f'{S}.echoes.echoes.length') == 0 and ev(f'{T}.steps[{T}.i].s') == 103 and abs(pos()[1] + 57.6) < 0.6 and not ev(f'{S}.world.gates.get("g_t2").isOpen'))
    page.keyboard.press('Escape'); adv(0.05); pause_pick('tutorial-restart'); time.sleep(0.8); adv(0.6)
    check('Restart Tutorial: the beginning of the court, step 1', ev(f'{T}.active') and ev(f'{T}.i') == 0 and abs(pos()[0] - TX) < 0.6 and abs(pos()[1]) < 0.6)
    page.keyboard.press('Escape'); adv(0.05); pause_pick('main-menu'); time.sleep(0.6); adv(1.5)
    check('Main Menu from the court: title, tutorial closed', st() == 'title' and not ev(f'{T}.active'))
    check('leaving the court keeps the old journey: Continue offered, save intact', ev('document.getElementById("btn-continue").offsetParent !== null') and json.loads(saved())['completed'] == [1, 2] and json.loads(saved())['playTime'] == 333)
    menu_pick('continue'); time.sleep(0.6); adv(0.4)
    check('Continue bypasses the tutorial choice and resumes the run', st() in ('playing', 'cutscene') and not ev(f'{T}.active') and ev('document.getElementById("title-choice").classList.contains("hidden")'))
    check('…with its counter and clock', ev('document.getElementById("ember-count").textContent') == '2/6' and abs(ev(f'{S}.playTime') - 333) < 1)
    if st() == 'cutscene': page.keyboard.press('Escape'); adv(1.5)
    page.keyboard.press('Escape'); adv(0.05)
    acts = ev('[...document.querySelectorAll("#screen-pause .rune-btn")].filter(b => !b.classList.contains("hidden")).map(b => b.dataset.action).join()')
    check('story pause is unchanged', acts == 'resume,restart-room,respawn,settings,main-menu,quit-game', acts)
    pause_pick('resume'); adv(0.1)
    # Skip Tutorial from the court's pause
    ev(f"{S}.onAction('main-menu')"); time.sleep(0.6); adv(1.5)
    menu_pick('new-game'); page.keyboard.press('ArrowUp'); page.keyboard.press('Enter'); adv(0.35); page.keyboard.press('Enter'); adv(0.35); time.sleep(0.8); adv(0.8)
    page.keyboard.press('Escape'); adv(0.05); pause_pick('tutorial-skip'); time.sleep(0.8); adv(0.8)
    for _ in range(5):
        if ev(f'{S}.story.scene && {S}.story.scene.id') == 'opening': break
        time.sleep(0.4); adv(0.2)
    check('Skip Tutorial from the pause → a fresh story (old save replaced only now)', st() == 'cutscene' and ev(f'{S}.story.scene.id') == 'opening' and json.loads(saved())['completed'] == [] and not ev(f'{T}.active'))

    # =============================================================================== the Heart of Minutes ending
    def finale_setup():
        boot()
        ev(f"{S}.onAction('new-game')"); time.sleep(0.75); adv(0.6); page.keyboard.press('Escape'); adv(1.2)
        ev(f'''(() => {{ const g={S}; g.world.progress.mark('completed', 9); g.playTime = 1200;
          g.placePlayer(0, -2.2, 0); window.__vict = 0; const sv = g.showVictory.bind(g); g.showVictory = () => {{ window.__vict++; sv(); }};
          window.__trace = []; g.story.play('finale'); }})()''')
    def run_ending(max_sec=40, space=True, move=False):
        seen_playing, scenes, t_last, t_end = False, [], None, None
        for i in range(int(max_sec * 5)):
            s, sc = st(), ev(f'{S}.story.scene && {S}.story.scene.id')
            if sc and (not scenes or scenes[-1] != sc): scenes.append(sc)
            if s == 'playing': seen_playing = True
            if s == 'victory': break
            if move: page.keyboard.down('KeyS')
            if space and ev(f'{S}.story.scene && {S}.story.scene.waitingInput && !{S}.ui.typing'): press('Space')
            else: adv(0.2)
        if move: page.keyboard.up('KeyS')
        return seen_playing, scenes

    # 1+4: stones land during the dialogue; the Keeper stands still; victory follows at the Heart
    finale_setup()
    p0 = pos()
    wait_until(f'{S}.story.scene && {S}.story.scene.waitingInput', 6)  # "Marrow. Thank you for waiting." is up
    landed_during = ev(f'{S}.finaleOrbs.every(o => o.t >= 1)') and ev(f'{S}.story.scene.id') == 'finale' and ev(f'{S}.story.scene.step.say[1]').startswith('Marrow.')
    seen_playing, scenes = run_ending()
    check('ending: embers land while the dialogue is still playing', landed_during)
    check('ending: after "Go home, Keeper." the ending plays at once (finale → ending → victory)', scenes == ['finale', 'ending'] and st() == 'victory', str(scenes))
    check('ending: control never returns, nothing to walk to', not seen_playing)
    check('ending: the Keeper never moved (victory where she stands at the Heart)', abs(pos()[0] - p0[0]) < 0.05 and abs(pos()[1] - p0[1]) < 0.05)
    check('ending: victory fires exactly once', ev('window.__vict') == 1)
    vt = ev('document.getElementById("victory-time").textContent')
    ev(f'{S}.playTime += 999; {S}.sceneAction("victory"); {S}.showVictory()'); adv(0.5)
    check('ending: a repeated trigger changes nothing', ev('document.getElementById("victory-time").textContent') == vt and st() == 'victory', vt)
    check('ending: completion screen shows the frozen time + its two options', ev(f'{S}.world.progress.data.finalTime') >= 1200 and ev('[...document.querySelectorAll("#screen-victory .rune-btn")].map(b => b.dataset.action).join()') == 'main-menu,restart')
    t_final, p_before = ev(f'{S}.world.progress.data.finalTime'), ev(f'{S}.playTime'); adv(5)
    check('ending: the clock stays stopped after victory', ev(f'{S}.world.progress.data.finalTime') == t_final and ev(f'{S}.playTime') == p_before and ev('document.getElementById("victory-time").textContent') == vt)

    # 3: the last line ends before the last ember lands → the scene waits for it
    finale_setup()
    adv(0.1)
    ev(f'{S}.finaleOrbs[2].t = -25')  # hold the third ember back (≈35 s of flight left)
    for _ in range(80):
        if ev(f'{S}.story.scene && {S}.story.scene.until'): break
        if ev(f'{S}.story.scene && {S}.story.scene.waitingInput && !{S}.ui.typing'): press('Space')
        else: adv(0.2)
    waiting = ev(f'{S}.story.scene && {S}.story.scene.id') == 'finale' and ev(f'{S}.story.scene.until') == 'heartEmbersIn'
    check('ending: dialogue done before the last ember → the scene waits (no victory yet)', waiting and st() == 'cutscene' and ev('window.__vict') == 0)
    page.keyboard.down('KeyW'); adv(3); page.keyboard.up('KeyW')
    check('ending: moving while it waits does nothing (still at the Heart)', abs(pos()[1] + 2.2) < 0.05 and ev(f'{S}.story.scene.id') == 'finale')
    page.keyboard.press('Escape'); adv(0.3)
    check('ending: Esc while waiting does not skip the ember', ev(f'{S}.story.scene.id') == 'finale' and ev('window.__vict') == 0)
    ok = wait_until(f'{S}.finaleOrbs[2].t >= 1', 40, 0.5)
    adv(0.3)
    check('ending: the moment the last ember lands, the ending begins', ok and ev(f'{S}.story.scene && {S}.story.scene.id') == 'ending')
    seen_playing, scenes = run_ending()
    check('ending: …and reaches the completion screen once', st() == 'victory' and ev('window.__vict') == 1 and not seen_playing)

    # 2 (+ Esc): skipping the finale while embers fly still waits for them, then plays the ending
    finale_setup()
    adv(0.3)
    page.keyboard.press('Escape'); adv(1 / 30)
    flying = not ev(f'{S}.finaleOrbs.every(o => o.t >= 1)')
    check('ending: Esc during the finale while embers fly → waits for them', flying and ev(f'{S}.story.scene.id') == 'finale' and ev(f'{S}.story.scene.until') == 'heartEmbersIn')
    adv(2.5)
    check('ending: …then the ending, no control in between', ev(f'{S}.story.scene && {S}.story.scene.id') == 'ending' and st() == 'cutscene')
    seen_playing, scenes = run_ending(move=True)
    check('ending: holding a direction through the ending changes nothing; victory once', st() == 'victory' and ev('window.__vict') == 1 and abs(pos()[1] + 2.2) < 0.05)
    page.keyboard.press('Enter'); time.sleep(0.8); adv(0.3)
    check('completion → Return to Main Menu works', st() == 'title')

    check('no console errors', not errors, '; '.join(errors[:3]))
    browser.close()

passed = sum(1 for r in results if r[1])
print(f'\n{passed}/{len(results)} checks passed')
sys.exit(0 if passed == len(results) else 1)
