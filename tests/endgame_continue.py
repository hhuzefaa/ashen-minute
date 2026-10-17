"""
End-of-game flow, the play clock, Continue / save integrity, the pause menu and the fire ambience.
Real keyboard and mouse events; the simulation is stepped explicitly (1/30 s) like the playthrough.

    npm run build && npx vite preview --port 4173 &
    python3 tests/endgame_continue.py [--url ...]
"""
import argparse, json, sys, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--url', default='http://localhost:4173/?test&lowfx')
args = ap.parse_args()
S = 'window.__ashen'
KEY = 'ashen-minutes.save.v3'
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

    def boot(save=None, clear=False):
        """(Re)load the page with a given localStorage save (dict, raw string or None)."""
        page.goto(args.url)
        page.wait_for_function(f'{S} && {S}.state === "title"')
        if clear or save is not None:
            ev(f'{S}.saveClock = () => {{}}')  # this page must not write its own run back on unload
            ev(f'localStorage.removeItem("{KEY}")')
            if save is not None:
                raw = save if isinstance(save, str) else json.dumps(save)
                ev(f'localStorage.setItem("{KEY}", {json.dumps(raw)})')
            page.reload()
            page.wait_for_function(f'{S} && {S}.state === "title"')
        ev(f'''(() => {{ const g = {S}; g.renderer.setAnimationLoop(null);
          window.__adv = (sec) => {{ const n = Math.max(1, Math.round(sec * 30));
            for (let i = 0; i < n; i++) {{ g.step(1/30); g.input.pressed.clear(); }} g.input.endFrame(); }}; }})()''')
        adv(2.5); page.keyboard.press('KeyG'); adv(2.2)  # through the splash into the menu

    def adv(sec): ev(f'window.__adv({sec})')
    def st(): return ev(f'{S}.state')
    def cont_shown(): return ev('document.getElementById("btn-continue").offsetParent !== null')
    def visible_buttons(): return ev('[...document.querySelectorAll("#main-menu .rune-btn")].filter(b => b.offsetParent).map(b => b.dataset.action).join()')
    def new_game():
        ev(f'{S}.titleMenu.phase === "menu"')
        ev(f"{S}.onAction('new-game')"); time.sleep(0.75); adv(0.6)
        page.keyboard.press('Escape'); adv(1.2)  # skip the cold open
    def menu_pick(action):
        """Pick a title-menu item with the keyboard."""
        for _ in range(8):
            if ev(f'{S}.titleMenu.items[{S}.titleMenu.sel].action') == action: break
            page.keyboard.press('ArrowDown'); adv(0.03)
        page.keyboard.press('Enter'); adv(0.3)
    def pause_pick(action):
        for _ in range(8):
            if ev(f'{S}.pauseMenu.items[{S}.pauseMenu.sel].dataset.action') == action: break
            page.keyboard.press('ArrowDown')
        page.keyboard.press('Enter'); time.sleep(0.32)

    # ================================================================ 1. fresh launch
    boot(clear=True)
    check('fresh launch: no resumable run', not ev(f'{S}.world.progress.hasSave'))
    check('fresh launch: Continue not offered, no gap', not cont_shown() and visible_buttons() == 'new-game,settings,credits,quit')
    check('fresh launch: New Game selected', ev(f'{S}.titleMenu.items[{S}.titleMenu.sel].action') == 'new-game')

    # ================================================================ 2. stale / invalid saves
    old_finished = {'v': 3, 'completed': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'gates': [], 'story': [], 'secrets': [], 'lostMinutes': [], 'abilities': {'echo': True}, 'echoesMade': 4, 'embers': 6, 'checkpoint': {'x': 0, 'z': 19, 'yaw': 0}, 'started': True}
    boot(old_finished)
    check('old save of a finished run (no flag): treated as finished, Continue hidden', ev(f'{S}.world.progress.data.finished') and not cont_shown())
    old_mid = dict(old_finished, completed=[1, 2, 3, 4], embers=3)
    boot(old_mid)
    check('old unfinished save: Continue offered', cont_shown())
    menu_pick('continue'); time.sleep(0.6); adv(0.3)
    check('Continue resumes the run (its checkpoint is the Sanctuary: the first-visit scene may play)', st() in ('playing', 'cutscene'))
    check('ember counter counts rooms only (was completed.length: 4/6)', ev('document.getElementById("ember-count").textContent') == '3/6', ev('document.getElementById("ember-count").textContent'))
    boot({'v': 3, 'completed': ['x', 99, 1, 1, None], 'checkpoint': 'bad', 'started': True, 'playTime': -5, 'lostMinutes': 'nope'})
    d = ev(f'{S}.world.progress.data')
    check('garbage save sanitised (unknown ids, duplicates, bad types)', d['completed'] == [1] and d['checkpoint'] is None and d['playTime'] == 0 and d['lostMinutes'] == [])
    boot('{not json')
    check('corrupt save: clean start, no Continue', not cont_shown() and not ev(f'{S}.world.progress.data.started'))

    # ================================================================ 3–4. start, pause, main menu, continue
    boot(clear=True)
    new_game()
    check('new run is playing at 0/6', st() == 'playing' and ev('document.getElementById("ember-count").textContent') == '0/6')
    t0 = ev(f'{S}.playTime')
    adv(5.0)
    t1 = ev(f'{S}.playTime')
    check('play clock runs while playing', abs((t1 - t0) - 5.0) < 0.1, f'{t1 - t0:.2f}s')
    page.keyboard.press('Escape'); adv(0.05)
    check('Esc pauses; pause menu up with Resume selected', st() == 'paused' and ev(f'{S}.pauseMenu.items[{S}.pauseMenu.sel].dataset.action') == 'resume')
    ptime, gtime, ppos = ev(f'{S}.playTime'), ev(f'{S}.time'), ev(f'{S}.player.pos.z')
    adv(4.0); time.sleep(0.5)
    check('pause freezes the play clock, game time and the world', ev(f'{S}.playTime') == ptime and ev(f'{S}.time') == gtime and ev(f'{S}.player.pos.z') == ppos)
    check('pause menu lists every action', ev('[...document.querySelectorAll("#screen-pause .rune-btn")].filter(b => !b.classList.contains("hidden")).map(b => b.dataset.action).join()') == 'resume,restart-room,respawn,settings,main-menu,quit-game')
    page.keyboard.press('ArrowDown'); page.keyboard.press('ArrowDown')
    check('arrow keys move the pause selection', ev(f'{S}.pauseMenu.items[{S}.pauseMenu.sel].dataset.action') == 'respawn')
    pause_pick('settings')
    check('Settings opens from pause', ev('!document.getElementById("screen-settings").classList.contains("hidden")') and st() == 'paused')
    page.keyboard.press('ArrowDown'); adv(0.02)
    check('pause menu inert under Settings', ev(f'{S}.pauseMenu.items[{S}.pauseMenu.sel].dataset.action') == 'settings')
    page.keyboard.press('Escape'); adv(0.05)
    check('Esc closes Settings, still paused', not ev(f'{S}.ui.overlayOpen') and st() == 'paused')
    pause_pick('resume'); adv(0.1)
    check('Resume returns to play', st() == 'playing' and not ev(f'{S}.pauseMenu.active'))
    page.keyboard.down('KeyW'); adv(0.5); page.keyboard.up('KeyW')
    check('W moves the Keeper again after the pause (not captured by the menu)', abs(ev(f'{S}.player.pos.z') - ppos) > 0.3)
    page.keyboard.press('Escape'); adv(0.05)
    pause_pick('respawn'); adv(0.2)
    check('Return to Checkpoint works from the redesigned pause', st() == 'playing' and abs(ev(f'{S}.player.pos.z') - ev(f'{S}.world.checkpoint.z')) < 0.6)
    page.keyboard.press('Escape'); adv(0.05)
    pause_pick('restart-room'); time.sleep(0.4); adv(0.3)
    check('Restart Puzzle works from the redesigned pause', st() == 'playing')
    page.keyboard.press('Escape'); adv(0.05)
    played = ev(f'{S}.playTime')
    pause_pick('main-menu'); time.sleep(0.6); adv(0.1)
    check('Main Menu from pause → title', st() == 'title')
    adv(1.5)
    check('started run is resumable: Continue offered and selected', cont_shown() and ev(f'{S}.titleMenu.items[{S}.titleMenu.sel].action') == 'continue')
    check('menu time is not play time', abs(ev(f'{S}.playTime') - played) < 0.01)
    menu_pick('continue'); time.sleep(0.6); adv(0.3)
    check('Continue resumes the same run with its clock', st() == 'playing' and abs(ev(f'{S}.playTime') - played) < 0.4)

    # ================================================================ 7. persisted run survives a reload
    ev(f'{S}.pause()')  # pausing saves the clock
    saved = ev(f'{S}.world.progress.data.playTime')
    boot()
    check('after relaunch: Continue offered for the saved run', cont_shown())
    menu_pick('continue'); time.sleep(0.6); adv(0.3)
    check('after relaunch: clock restored', abs(ev(f'{S}.playTime') - saved) < 0.4, f'{saved:.1f}s')

    # ================================================================ quit game from pause
    page.keyboard.press('Escape'); adv(0.05)
    pause_pick('quit-game'); time.sleep(0.6); adv(0.1)
    check('Quit Game → farewell on the title, run kept', st() == 'title' and ev(f'{S}.titleMenu.phase') == 'farewell' and ev(f'{S}.world.progress.hasSave'))
    adv(0.6); page.keyboard.press('KeyQ'); adv(0.1)
    check('any button returns to a usable menu', ev(f'{S}.titleMenu.phase') == 'menu' and cont_shown() and ev('+getComputedStyle(document.querySelector("#main-menu .rb-slot:not(.hidden)")).opacity') > 0.9)

    # ================================================================ fire ambience
    menu_pick('continue'); time.sleep(0.6); adv(0.3)
    ev(f'{S}.audio.init()')
    ev(f'''(() => {{ const g = {S}; const p = g.world.puzzles.find((q) => q.sconces.length); window.__sc = p.sconces[0];
      g.placePlayer(window.__sc.pos.x + 1.5, window.__sc.pos.z, 0); }})()''')
    adv(0.3)
    ev(f'{S}.world.puzzles.find((q) => q.sconces.includes(window.__sc)).kindle(window.__sc, true)')
    page.wait_for_function(f'{S}.audio.loops.amb_fire_crackle && {S}.audio.loops.amb_fire_crackle.sources.length > 0', timeout=15000)
    adv(0.4)
    near = ev(f'{S}.audio.fireLevel')
    check('fire ambience: two recorded loops playing (bed + crackle)', ev(f'{S}.audio.loops.amb_fire_crackle.sources.length') == 2 and ev(f'{S}.audio.fire !== null'))
    check('fire ambience loud near the fire', near > 0.8, f'{near:.2f}')
    ev(f'{S}.placePlayer(0, 75.5, 0)'); adv(0.4)
    check('fire ambience silent far from any fire', ev(f'{S}.audio.fireLevel') < 0.05, f"{ev(f'{S}.audio.fireLevel'):.2f}")

    # ================================================================ 5. completion
    ev(f'{S}.playTime = 754.4; {S}.enterCutscene(); {S}.sceneAction("victory")'); adv(0.1); time.sleep(0.5)
    check('completion screen shown', st() == 'victory' and ev('!document.getElementById("screen-victory").classList.contains("hidden")'))
    check('completion time shown as M:SS', ev('document.getElementById("victory-time").textContent') == '12:34')
    adv(10); time.sleep(0.2)
    check('clock stopped at the ending', ev(f'{S}.world.progress.data.finalTime') == 754.4 and ev('document.getElementById("victory-time").textContent') == '12:34')
    ev(f'{S}.playTime = 4000; {S}.sceneAction("victory")'); adv(0.1)
    check('completion cannot trigger twice', ev('document.getElementById("victory-time").textContent') == '12:34')
    check('completion buttons: Return to Main Menu (selected), Restart Game', ev('[...document.querySelectorAll("#screen-victory .rune-btn")].map(b => b.textContent.trim()).join("|")') == 'Return to Main Menu|Restart Game' and ev(f'{S}.victoryMenu.sel') == 0)
    check('labels fit inside the frame', ev('[...document.querySelectorAll("#screen-victory .rune-btn, #screen-pause .rune-btn")].every(b => { const r = document.createRange(); r.selectNodeContents(b.querySelector(".rb-label")); return !b.offsetWidth || r.getBoundingClientRect().width <= b.offsetWidth * 0.8; })'))
    page.keyboard.press('Enter'); time.sleep(0.8); adv(0.2)
    check('Return to Main Menu → title', st() == 'title')
    adv(1.5)
    check('finished run: Continue not offered', not cont_shown() and not ev(f'{S}.world.progress.hasSave'))

    # ================================================================ 6. restart from the completion screen
    menu_pick('new-game'); page.keyboard.press('ArrowDown'); page.keyboard.press('Enter'); adv(0.35)  # tutorial choice → Skip Tutorial
    time.sleep(0.75); adv(0.6); page.keyboard.press('Escape'); adv(1.2)
    ev(f'''(() => {{ const g = {S}; const w = g.world; w.progress.mark('completed', 1); w.progress.mark('completed', 2); g.onEmbers(w.roomsDone);
        w.progress.data.lostMinutes.push('lm1'); g.playTime = 321; g.enterCutscene(); g.sceneAction('embersConverge'); g.sceneAction('victory'); }})()''')
    adv(0.2); time.sleep(0.4)
    check('second completion shows its own time', ev('document.getElementById("victory-time").textContent') == '5:21')
    page.keyboard.press('ArrowDown'); page.keyboard.press('Enter'); time.sleep(1.1); adv(0.8)
    check('Restart Game starts the cold open', st() == 'cutscene' and ev(f'{S}.story.scene && {S}.story.scene.id') == 'opening')
    pr = ev(f'{S}.world.progress.data')
    check('fresh run: progress, counters and flags reset', pr['completed'] == [] and pr['lostMinutes'] == [] and not pr['finished'] and pr['finalTime'] is None and pr['started'])
    check('fresh run: clock restarted', ev(f'{S}.playTime') < 2)
    check('fresh run: nothing of the finale left in the world', not ev(f'{S}.finaleOrbs') and not ev(f'{S}.heartBackwards'))
    page.keyboard.press('Escape'); adv(1.2)
    check('fresh run: 0/6 on the HUD', ev('document.getElementById("ember-count").textContent') == '0/6' and st() == 'playing')

    check('no console errors', not errors, '; '.join(errors[:3]))
    browser.close()

passed = sum(1 for r in results if r[1])
print(f'\n{passed}/{len(results)} checks passed')
sys.exit(0 if passed == len(results) else 1)
