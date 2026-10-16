"""
Automated end-to-end playthrough of Ashen Minutes in headless Chromium.

Uses real keyboard input for every puzzle action (E ignite, A/D turn, R rewind, W walk across
bridges). The only shortcut is teleporting the Keeper between points of interest so the script
does not need path-finding; every bridge is still crossed on foot so its collider is exercised.

Usage:
    npm run build && npx vite preview --port 4173 &
    python3 tests/playthrough.py [--url http://localhost:4173] [--shots out_dir]
"""
import argparse, math, os, sys, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--url', default='http://localhost:4173/?test&nofallback&lowfx')
ap.add_argument('--shots', default='test-shots')
ap.add_argument('--w', type=int, default=480)
ap.add_argument('--h', type=int, default=270)
args = ap.parse_args()
os.makedirs(args.shots, exist_ok=True)

errors, results = [], []

def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''), flush=True)

def wait_until(page, js, timeout=20.0, step=0.1):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(js):
            return True
        time.sleep(step)
    return False

def shot(page, name):
    page.screenshot(path=os.path.join(args.shots, name + '.png'))

S = 'window.__ashen'
P = S + '.levels.puzzle'

def state(page):
    return page.evaluate(f'{P} ? {P}.state : null')

def err_deg(page):
    return page.evaluate(f'''(() => {{ const p={P}; const d=Math.atan2(Math.sin(p.relic.yaw-p.targetYaw), Math.cos(p.relic.yaw-p.targetYaw)); return d*180/Math.PI; }})()''')

def stand_at_relic(page):
    # south-east of the relic (between player-spawn side and relic), camera looking at the target
    page.evaluate(f'''(() => {{
        const g={S}, p={P}, b=p.relic.base;
        const fx=-Math.sin(p.targetYaw), fz=-Math.cos(p.targetYaw);
        g.player.pos.set(b.x - fx*1.5, 0, b.z - fz*1.5); g.player.vel.set(0,0,0);
        g.cameraCtl.yaw = p.targetYaw; g.cameraCtl.pitch = 0.35;
    }})()''')
    time.sleep(0.4)

def key_toward_target(page):
    """Mirror the game's camera-relative rule to pick A or D."""
    return page.evaluate(f'''(() => {{
        const p={P}, c={S}.cameraCtl, y=p.relic.yaw;
        const s = (-Math.cos(y))*Math.cos(c.yaw) + (Math.sin(y))*(-Math.sin(c.yaw)) >= 0 ? 1 : -1; // D => +s
        const need = -Math.sign(Math.atan2(Math.sin(y-p.targetYaw), Math.cos(y-p.targetYaw)));
        return need === s ? 'KeyD' : 'KeyA';
    }})()''')

def turn_until_aligned(page, timeout=40):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if state(page) != 'ALIGNING':
            return state(page)
        key = key_toward_target(page)
        page.keyboard.down(key)
        wait_until(page, f'{P}.state !== "ALIGNING" || {P}.atLimit', 10)
        page.keyboard.up(key)
        time.sleep(0.3)
        if state(page) == 'ALIGNING' and page.evaluate(f'{P}.atLimit'):
            return 'COLLAR_LIMIT'
    return state(page)

def rewind_to_oldest(page, timeout=15):
    page.keyboard.down('KeyR')
    # already at the oldest memory (history collapsed to one sample) also counts
    ok = wait_until(page, f'{P}.relic.history.atOldest || {P}.relic.history.length <= 1 || {P}.state !== "ALIGNING"', timeout)
    time.sleep(0.15)
    page.keyboard.up('KeyR')
    time.sleep(0.2)
    return ok

def walk_bridge(page):
    """Place the Keeper at the near end of the bridge and walk it with W."""
    page.evaluate(f'''(() => {{
        const g={S}, br={P}.bridge;
        g.player.pos.set(br.start.x, 0, br.start.z + 0.6); g.player.vel.set(0,0,0);
        g.cameraCtl.yaw = br.yaw; g.cameraCtl.pitch = 0.3;
    }})()''')
    time.sleep(0.3)
    falls0 = page.evaluate(f'{S}.__falls || 0')
    page.keyboard.down('KeyW')
    crossed = wait_until(page, f'(() => {{ const g={S}; return g.player.pos.z < {P}.level.crossZ - 0.8; }})()', 12)
    page.keyboard.up('KeyW')
    falls1 = page.evaluate(f'{S}.__falls || 0')
    return crossed and falls1 == falls0

def grab_ember(page):
    page.evaluate(f'''(() => {{ const g={S}, e={P}.ember.base; g.player.pos.set(e.x, 0, e.z + 0.3); g.player.vel.set(0,0,0); }})()''')

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
    page = browser.new_page(viewport={'width': args.w, 'height': args.h})
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(args.url)
    check('title screen loads', wait_until(page, f'{S} && {S}.state === "title"', 30))
    page.evaluate(f'''{S}.player.onFall = ((orig) => () => {{ {S}.__falls = ({S}.__falls||0)+1; orig(); }})({S}.player.onFall)''')
    time.sleep(2.5)
    shot(page, '00_title')

    # controls / credits overlays open and close
    page.dispatch_event('#screen-title button[data-action=controls]', 'click'); time.sleep(0.3)
    check('controls overlay opens', page.is_visible('#screen-controls'))
    page.dispatch_event('#screen-controls button[data-action=close-overlay]', 'click')
    page.dispatch_event('#screen-title button[data-action=credits]', 'click'); time.sleep(0.3)
    check('credits overlay opens', page.is_visible('#screen-credits'))
    page.dispatch_event('#screen-credits button[data-action=close-overlay]', 'click')

    page.dispatch_event('#screen-title button[data-action=play]', 'click')
    check('play starts intro', wait_until(page, f'{S}.state === "intro"', 10))
    time.sleep(1.2); shot(page, '01_intro_card')
    check('intro hands over to play', wait_until(page, f'{S}.state === "playing"', 10))
    check('ember count starts 0', page.evaluate(f'{S}.levels.emberCount') == 0)
    time.sleep(1.0); shot(page, '02_room1_spawn')

    # ---- movement sanity: W moves forward, walls block
    z0 = page.evaluate(f'{S}.player.pos.z')
    page.keyboard.down('KeyW'); time.sleep(1.0); page.keyboard.up('KeyW')
    z1 = page.evaluate(f'{S}.player.pos.z')
    check('W moves the Keeper forward (camera-relative)', z1 < z0 - 0.5, f'dz={z1-z0:.2f}')
    page.evaluate(f'{S}.player.pos.set(5.5, 0, 4); {S}.cameraCtl.yaw = -Math.PI/2;')  # face east toward wall
    page.keyboard.down('KeyW'); time.sleep(1.5); page.keyboard.up('KeyW')
    x = page.evaluate(f'{S}.player.pos.x')
    check('wall blocks the Keeper', x < 7.0, f'x={x:.2f}')

    # ---- inactive bridge is not walkable: step into the gap → fall → respawn
    f0 = page.evaluate(f'{S}.__falls||0')
    page.evaluate(f'{S}.player.pos.set(0, 0, -2.5); {S}.player.vel.set(0,0,0);')
    ok = wait_until(page, f'({S}.__falls||0) >= {f0 + 1}', 10)
    time.sleep(0.5)
    zr = page.evaluate(f'{S}.player.pos.z')
    check('inactive bridge not walkable: falling respawns at spawn', ok and abs(zr - 7.4) < 0.5, f'falls={page.evaluate(S+".__falls")} z={zr:.2f}')

    for room in (1, 2, 3):
        check(f'room {room} loaded', wait_until(page, f'{S}.levels.level.id === {room} && {S}.state === "playing"', 15))
        time.sleep(0.6)
        stand_at_relic(page)
        check(f'room {room}: ignite prompt shown', wait_until(page, 'document.getElementById("prompt").textContent.includes("IGNITE")', 4))
        page.keyboard.down('KeyE'); time.sleep(0.4); page.keyboard.up('KeyE')
        check(f'room {room}: relic lit', wait_until(page, f'{P}.relic.lit', 5))
        check(f'room {room}: reaches ALIGNING', wait_until(page, f'{P}.state === "ALIGNING" && !{P}.jolt', 12))
        time.sleep(0.4)
        shot(page, f'1{room}_room{room}_lit')
        if room > 1:
            e_before = err_deg(page)
            # Collar: turning alone must not be able to solve
            page.keyboard.down('KeyD'); time.sleep(2.0); page.keyboard.up('KeyD')
            page.keyboard.down('KeyA'); time.sleep(3.0); page.keyboard.up('KeyA')
            check(f'room {room}: collar prevents solving without rewind', state(page) == 'ALIGNING', f'err {e_before:.0f}°→{err_deg(page):.0f}°')
            page.keyboard.down('KeyR'); time.sleep(0.5)
            shot(page, f'1{room}_room{room}_rewinding')
            page.keyboard.up('KeyR'); time.sleep(0.1)
            check(f'room {room}: rewind reached oldest memory', rewind_to_oldest(page))
            echo = page.evaluate(f'{P}.level.relic.startOffsetDeg')
            check(f'room {room}: rewind restored the echo angle', abs(err_deg(page) - echo) < 1.5, f'err={err_deg(page):.1f}° echo={echo}°')
        st = turn_until_aligned(page)
        check(f'room {room}: alignment raises the bridge', st in ('BRIDGE_APPEARING', 'BRIDGE_ACTIVE'), st)
        check(f'room {room}: bridge collider enabled only when ACTIVE', wait_until(page, f'{P}.bridge.state === "ACTIVE" && {P}.bridge.collider.enabled', 5))
        time.sleep(0.8)
        shot(page, f'1{room}_room{room}_bridge')

        if room == 3:
            # let the span expire without crossing: it must fade and the relic slip
            check('room 3: timer running', page.evaluate(f'{P}.timerRunning'))
            # stand on the bridge: timer must pause
            page.evaluate(f'''(() => {{ const g={S}, br={P}.bridge; const m=br.group.position; g.player.pos.set(m.x, 0, m.z); g.player.vel.set(0,0,0); }})()''')
            time.sleep(0.6)
            t_a = page.evaluate(f'{P}.timer'); time.sleep(1.5); t_b = page.evaluate(f'{P}.timer')
            check('room 3: timer pauses while on the bridge', abs(t_a - t_b) < 0.05, f'{t_a:.2f}→{t_b:.2f}')
            stand_at_relic(page)
            check('room 3: span fades after timer', wait_until(page, f'{P}.bridge.state === "HIDDEN" && !{P}.bridge.collider.enabled', 20))
            check('room 3: relic slipped, back to ALIGNING', wait_until(page, f'{P}.state === "ALIGNING" && !{P}.jolt', 6))
            rewind_to_oldest(page)
            st = state(page)
            if st == 'ALIGNING':
                st = turn_until_aligned(page)
            check('room 3: re-align after slip via rewind', wait_until(page, f'{P}.bridge.state === "ACTIVE"', 6), st)

        check(f'room {room}: bridge walkable end to end (no fall)', walk_bridge(page))
        shot(page, f'1{room}_room{room}_crossed')
        grab_ember(page)
        if room < 3:
            check(f'room {room}: ember awarded once', wait_until(page, f'{S}.levels.emberCount === {room}', 5))
            time.sleep(0.2)
            check(f'room {room}: no double award', page.evaluate(f'{S}.levels.emberCount') == room)

    check('finale triggered', wait_until(page, f'{S}.state === "finale"', 6))
    time.sleep(3.0); shot(page, '30_finale_heart')
    check('victory reached', wait_until(page, f'{S}.state === "victory"', 20))
    check('ember count 3/3', page.evaluate(f'{S}.levels.emberCount') == 3)
    time.sleep(0.8); shot(page, '31_victory')

    # Play again resets the run
    page.dispatch_event('#screen-victory button[data-action=play-again]', 'click')
    check('play again resets to room 1 with 0 embers', wait_until(page, f'{S}.state === "playing" && {S}.levels.level.id === 1 && {S}.levels.emberCount === 0', 15))
    # pause freezes, restart room works
    time.sleep(1)
    page.keyboard.press('Escape')
    check('Esc pauses', wait_until(page, f'{S}.state === "paused"', 5))
    tp = page.evaluate(f'{S}.time'); time.sleep(1.5)
    check('pause freezes simulation', abs(page.evaluate(f'{S}.time') - tp) < 0.001)
    page.dispatch_event('#screen-pause button[data-action=resume]', 'click')
    check('resume returns to play', wait_until(page, f'{S}.state === "playing"', 5))
    stand_at_relic(page); page.keyboard.press('KeyE')
    wait_until(page, f'{P}.relic.lit', 5); time.sleep(0.5)
    page.keyboard.press('Backspace')
    check('restart room resets relic', wait_until(page, f'{S}.state === "playing" && !{P}.relic.lit', 6))
    time.sleep(1)
    page.keyboard.press('Escape'); wait_until(page, f'{S}.state === "paused"', 5)
    page.dispatch_event('#screen-pause button[data-action=main-menu]', 'click')
    check('main menu returns to title', wait_until(page, f'{S}.state === "title"', 5))

    fps = page.evaluate('''new Promise(r => { let n=0; const t0=performance.now(); function f(){ n++; if (performance.now()-t0 < 2000) requestAnimationFrame(f); else r(n/2); } requestAnimationFrame(f); })''')
    print(f'headless software-GL fps on title: {fps:.1f} (not representative of a real GPU)')
    browser.close()

real_errors = [e for e in errors if 'pointer' not in e.lower() and 'AudioContext' not in e]
check('no console errors', not real_errors, '; '.join(real_errors[:5]))
fails = [r for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} checks passed')
sys.exit(1 if fails else 0)
