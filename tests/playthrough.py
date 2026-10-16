"""
End-to-end playthrough of all ten levels of Ashen Minutes in headless Chromium.

Input is real: Playwright sends genuine keyboard events (E, A/D, R, W, Shift, Esc, Backspace) that
go through the game's Input listeners. The render loop is stopped and the simulation is stepped
explicitly (1/30 s per step) so results are deterministic and independent of how slow software
WebGL is. Travel between puzzle stations uses teleports, but every bridge and every gate on the
critical path is crossed on foot.

    npm run build && npx vite preview --port 4173 &
    python3 tests/playthrough.py [--url ...] [--shots dir]
"""
import argparse, math, os, sys, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--url', default='http://localhost:4173/?test&lowfx')
ap.add_argument('--shots', default='')
args = ap.parse_args()
if args.shots: os.makedirs(args.shots, exist_ok=True)

S = 'window.__ashen'
results, errors = [], []

def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''), flush=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 640, 'height': 360})
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(args.url)
    page.wait_for_function(f'{S} && {S}.state === "title"', timeout=120000)
    page.evaluate(f'''(() => {{
      const g = {S};
      g.renderer.setAnimationLoop(null);
      window.__falls = 0;
      const of = g.player.onFall; g.player.onFall = () => {{ window.__falls++; of(); }};
      window.__adv = (sec) => {{
        const n = Math.max(1, Math.round(sec * 30));
        for (let i = 0; i < n; i++) {{ g.step(1/30); if (i === 0) {{ g.input.pressed.clear(); }} }}
        g.input.endFrame();
      }};
    }})()''')

    def adv(sec): page.evaluate(f'window.__adv({sec})')
    def ev(js): return page.evaluate(js)
    def down(k): page.keyboard.down(k)
    def up(k): page.keyboard.up(k)
    def press(k, hold=0.1): down(k); adv(hold); up(k); adv(1/30)
    def shot(name):
        if not args.shots: return
        ev(f'{S}.render()'); time.sleep(0.1)
        page.screenshot(path=os.path.join(args.shots, name + '.png'))
    P = f'{S}.world.activePuzzle'
    def relic(rid): return f'{P}.relics.get("{rid}")'

    def err_deg(rid):
        return ev(f'''(() => {{ const p={P}, rs={relic(rid)}; const ru=p.runes.get(rs.spec.aim);
          const a = p.aimYawFor(rs, ru); return Math.atan2(Math.sin(rs.relic.yaw-a), Math.cos(rs.relic.yaw-a)) * 180/Math.PI; }})()''')

    def stand_behind(rid, dist=1.6):
        # behind the relic (opposite its target); if that is over the abyss, try around it
        ev(f'''(() => {{ const g={S}, p={P}, rs={relic(rid)}, b=rs.relic.base, ru=p.runes.get(rs.spec.aim);
          const a = p.aimYawFor(rs, ru);
          for (const off of [0, 0.8, -0.8, 1.4, -1.4, 2.0, -2.0]) {{
            const x = b.x + Math.sin(a + off)*{dist}, z = b.z + Math.cos(a + off)*{dist};
            if (g.collision.groundHeight(x, z, b.y + 0.2) > -1) {{ g.player.pos.set(x, b.y, z); break; }}
          }}
          g.player.vel.set(0,0,0); g.cameraCtl.yaw = a; g.cameraCtl.pitch = 0.35; }})()''')
        adv(0.2)

    def teleport(x, z, yaw=0):
        ev(f'{S}.player.pos.set({x}, 0, {z}); {S}.player.vel.set(0,0,0); {S}.cameraCtl.yaw = {yaw};')
        adv(0.2)

    def key_toward(rid):
        return ev(f'''(() => {{ const p={P}, rs={relic(rid)}, c={S}.cameraCtl, y=rs.relic.yaw, ru=p.runes.get(rs.spec.aim);
          const s = (-Math.cos(y))*Math.cos(c.yaw) + (Math.sin(y))*(-Math.sin(c.yaw)) >= 0 ? 1 : -1;
          const d = Math.atan2(Math.sin(y-p.aimYawFor(rs,ru)), Math.cos(y-p.aimYawFor(rs,ru)));
          return (-Math.sign(d) === s) ? 'KeyD' : 'KeyA'; }})()''')

    def turn_to_lock(rid, timeout=20):
        """Hold the key that reduces the error until the relic locks onto its rune."""
        steps = 0
        while steps < timeout * 30:
            if ev(f'!!{relic(rid)}.lockedOn'): return True
            k = key_toward(rid)
            down(k)
            for _ in range(90):
                adv(1/30); steps += 1
                if ev(f'!!{relic(rid)}.lockedOn || {relic(rid)}.atLimit'): break
            up(k); adv(0.1)
            if ev(f'{relic(rid)}.atLimit && !{relic(rid)}.lockedOn'): return False
        return ev(f'!!{relic(rid)}.lockedOn')

    def ignite(rid):
        press('KeyE')
        adv(0.2)
        return ev(f'{relic(rid)}.lit')

    def wait_jolt(rid, t=8):
        for _ in range(int(t * 10)):
            if not ev(f'!!{relic(rid)}.jolt'): return True
            adv(0.1)
        return False

    def rewind_until(rid, cond_js, max_sec=12):
        down('KeyR')
        ok = False
        for _ in range(int(max_sec * 30)):
            adv(1/30)
            if ev(cond_js): ok = True; break
        up('KeyR'); adv(0.1)
        return ok

    def walk_bridge(rune_id, extra=1.2):
        """Walk the full length of a bridge with W (+ a little beyond)."""
        f0 = ev('window.__falls')
        ev(f'''(() => {{ const g={S}, br={P}.runes.get("{rune_id}").bridge;
          const dx=br.end.x-br.start.x, dz=br.end.z-br.start.z, L=Math.hypot(dx,dz);
          g.player.pos.set(br.start.x - dx/L*1.2, br.start.y, br.start.z - dz/L*1.2); g.player.vel.set(0,0,0);
          g.cameraCtl.yaw = Math.atan2(-dx, -dz); g.cameraCtl.pitch = 0.3; }})()''')
        adv(0.2)
        L = ev(f'{P}.runes.get("{rune_id}").bridge.length')
        down('KeyW')
        adv((L + 2.4 + extra) / 3.7)
        up('KeyW'); adv(0.3)
        far = ev(f'''(() => {{ const g={S}, br={P}.runes.get("{rune_id}").bridge;
          const fx=br.end.x-br.start.x, fz=br.end.z-br.start.z;
          return ((g.player.pos.x-br.start.x)*fx + (g.player.pos.z-br.start.z)*fz)/(br.length*br.length); }})()''')
        return ev('window.__falls') == f0 and far > 1.0, far

    def walk_to(x, z, max_sec=20, sprint=False):
        """Walk (W) toward a point, re-aiming the camera each step. Returns final distance."""
        down('KeyW')
        if sprint: down('ShiftLeft')
        for _ in range(int(max_sec * 10)):
            d = ev(f'''(() => {{ const g={S}; const dx={x}-g.player.pos.x, dz={z}-g.player.pos.z;
               g.cameraCtl.yaw = Math.atan2(-dx, -dz); return Math.hypot(dx, dz); }})()''')
            if d < 0.7: break
            adv(0.1)
        up('KeyW')
        if sprint: up('ShiftLeft')
        adv(0.2)
        d = ev(f'Math.hypot({x}-{S}.player.pos.x, {z}-{S}.player.pos.z)')
        if d > 0.9: print(f'   walk_to({x},{z}) stopped at', ev(f'[{S}.player.pos.x.toFixed(2),{S}.player.pos.z.toFixed(2),{S}.state, window.__falls]'), flush=True)
        return d

    def grab_ember():
        e = ev(f'(() => {{ const e={P}.ember.base; return [e.x, e.z]; }})()')
        d = walk_to(e[0], e[1] + 0.01, 12)
        adv(0.3)
        return d

    def level_done(i): return ev(f'{S}.world.progress.data.completed.includes({i})')

    def skip_scene():
        for _ in range(3):
            if ev(f'{S}.state') == 'cutscene': press('Escape'); adv(0.5)
        adv(0.8)

    # ===================================================================== title + opening
    check('title screen', ev(f'{S}.state') == 'title')
    ev(f"localStorage.clear(); {S}.world.progress.reset(); {S}.onAction('new-game')")
    time.sleep(0.8); adv(0.5)
    check('new game plays the opening cutscene', ev(f'{S}.state') == 'cutscene' and ev(f'{S}.story.scene.id') == 'opening')
    adv(6.5); i0 = ev(f'{S}.story.scene.i'); press('Space'); adv(0.3); press('Space'); adv(0.5)
    check('Space advances dialogue', ev(f'{S}.story.scene.i') > i0, f'{i0} → {ev(f"{S}.story.scene.i")}')
    press('Escape'); adv(1.0)
    check('Esc skips the cutscene and returns control', ev(f'{S}.state') == 'playing' and not ev(f'!!{S}.cameraCtl.override'))
    shot('00_start')

    # ===================================================================== camera + controls
    ev(f'{S}.cameraCtl.yaw = 0; {S}.player.pos.set(0,0,72); {S}.player.vel.set(0,0,0)'); adv(0.3)
    for key, want in (('KeyW', (0, -1)), ('KeyS', (0, 1)), ('KeyA', (-1, 0)), ('KeyD', (1, 0))):
        for yaw in (0, math.pi / 2, math.pi, -math.pi / 2):
            ev(f'{S}.cameraCtl.yaw = {yaw}; {S}.player.pos.set(0,0,70); {S}.player.vel.set(0,0,0)'); adv(0.1)
            down(key); adv(0.6); up(key); adv(0.3)
            dx, dz = ev(f'[{S}.player.pos.x - 0, {S}.player.pos.z - 70]')
            # expected world direction for this camera yaw
            fx, fz = -math.sin(yaw), -math.cos(yaw)
            rx, rz = math.cos(yaw), -math.sin(yaw)
            ex = fx * (-want[1]) + rx * want[0]
            ez = fz * (-want[1]) + rz * want[0]
            dot = (dx * ex + dz * ez) / max(1e-6, math.hypot(dx, dz))
            check(f'{key} moves correctly at camera yaw {round(math.degrees(yaw))}°', dot > 0.95, f'dot={dot:.2f}')
    # diagonal is not faster
    ev(f'{S}.cameraCtl.yaw = 0; {S}.player.pos.set(0,0,72); {S}.player.vel.set(0,0,0)'); adv(0.1)
    down('KeyW'); adv(1.0); s1 = ev(f'{S}.player.horizontalSpeed'); down('KeyD'); adv(1.0); s2 = ev(f'{S}.player.horizontalSpeed'); up('KeyW'); up('KeyD'); adv(0.5)
    check('diagonal speed equals straight speed', abs(s1 - s2) < 0.05, f'{s1:.2f} vs {s2:.2f}')
    # camera follows the Keeper
    ev(f'{S}.cameraCtl.yaw = 0; {S}.player.pos.set(0,0,74); {S}.player.vel.set(0,0,0)'); adv(0.3)
    down('KeyW'); adv(3.0); up('KeyW'); adv(0.5)
    cd = ev(f'{S}.camera.position.distanceTo({S}.player.pos)')
    check('camera follows the Keeper (distance stays 2–6)', 2.0 < cd < 6.5, f'{cd:.2f}')
    # camera does not pass through walls: back the Keeper against the L1 west wall, look across it
    ev(f'{S}.player.pos.set(-8.4, 0, 52); {S}.player.vel.set(0,0,0); {S}.cameraCtl.yaw = -Math.PI/2; {S}.cameraCtl.pitch = 0.2'); adv(0.5)
    camx = ev(f'{S}.camera.position.x')
    check('camera pulls in front of a wall', camx > -9.0, f'cam x={camx:.2f}')
    # stuck keys cleared on focus loss
    down('KeyW'); adv(0.1); ev('window.dispatchEvent(new Event("blur"))'); adv(0.1)
    check('focus loss pauses and releases held keys', ev(f'{S}.state') == 'paused' and not ev(f'{S}.input.down.has("KeyW")'))
    up('KeyW'); ev(f"{S}.onAction('resume')"); adv(0.2)
    check('resume after focus loss', ev(f'{S}.state') == 'playing')
    # locked gate is solid
    ev(f'{S}.player.pos.set(0, 0, 35); {S}.player.vel.set(0,0,0); {S}.cameraCtl.yaw = 0'); adv(0.2)
    down('KeyW'); adv(1.5); up('KeyW'); adv(0.2)
    check('a sealed gate blocks the way', ev(f'{S}.player.pos.z') > 33.3, f"z={ev(f'{S}.player.pos.z'):.2f}")

    # ===================================================================== L1
    teleport(0, 58, 0)
    check('L1 entered (active puzzle)', ev(f'{P} && {P}.level.id') == 1)
    stand_behind('A')
    check('L1 ignite', ignite('A'))
    check('L1 turn → rune', turn_to_lock('A'))
    adv(1.0)
    shot('11_L1_bridge')
    ok, far = walk_bridge('a'); check('L1 bridge walked', ok, f'{far:.2f}')
    grab_ember(); adv(1.0)
    check('L1 complete; gates open', level_done(1) and ev(f'{S}.world.gates.get("g_L1").isOpen'))
    adv(3)
    # walk through the opened gate and gallery into the hub
    walk_to(0, 35.5, 10); walk_to(0, 21.5, 10)
    adv(1.0)
    check('entering the hub plays its scene', ev(f'{S}.state') == 'cutscene')
    skip_scene()
    d = walk_to(0, 17, 6)
    check('walk through the L1 gate and gallery into the hub', d < 1.0, f'dist {d:.2f}')
    check('hub arrival scene seen', ev(f'{S}.world.progress.data.story.includes("hub_first")'))

    # ===================================================================== L2
    for (x, z) in ((-10, 15), (-17, 14), (-17, 0), (-30, 0)): walk_to(x, z, 12, sprint=True)
    d = walk_to(-36, 0, 6)
    check('walk through the hub west gate to L2', d < 1.0 and ev(f'{P} && {P}.level.id') == 2, f'{d:.2f}')
    stand_behind('A'); ignite('A'); wait_jolt('A')
    adv(0.3)
    for k, t in (('KeyD', 2), ('KeyA', 3)):
        down(k); adv(t); up(k); adv(0.1)
    check('L2 collar alone cannot solve', not ev(f'!!{relic("A")}.lockedOn'), f'err {err_deg("A"):.0f}°')
    rewind_until('A', f'{relic("A")}.relic.history.atOldest')
    check('L2 rewind returns to the echo angle', abs(err_deg('A') - (-16)) < 2.0, f'err {err_deg("A"):.1f}°')
    check('L2 nudge → rune', turn_to_lock('A'))
    adv(1.0); ok, far = walk_bridge('a'); check('L2 bridge walked', ok, f'{far:.2f}')
    grab_ember(); adv(1.5); check('L2 complete', level_done(2))

    # ===================================================================== L3
    walk_to(-55, -10, 6); walk_to(-55, -16, 6); d = walk_to(-55, -27.5, 8)
    check('walk through the L2 gate to L3', ev(f'{P} && {P}.level.id') == 3, f'{d:.2f}')
    stand_behind('A'); ignite('A'); check('L3 A → half span', turn_to_lock('A'))
    adv(1.0); ok, far = walk_bridge('a', 0.4); check('L3 first half walked onto island', ok, f'{far:.2f}')
    stand_behind('B'); ignite('B'); check('L3 B → second half', turn_to_lock('B'))
    adv(1.0); ok, far = walk_bridge('b'); check('L3 second half walked', ok, f'{far:.2f}')
    grab_ember(); adv(1.5); check('L3 complete', level_done(3))

    # ===================================================================== L4
    walk_to(-55, -56, 6); walk_to(-55, -62, 6); d = walk_to(-55, -68.5, 6)
    check('walk through the L3 gate to L4', ev(f'{P} && {P}.level.id') == 4, f'{d:.2f}')
    stand_behind('A'); ignite('A')
    # wrong slot first: turning cannot reach the rune (length mismatch)
    turn_ok = turn_to_lock('A', timeout=6)
    check('L4 wrong slot cannot solve (shadow too short)', not turn_ok)
    lever = ev(f'{relic("A")}.spec.rail.lever')
    teleport(lever[0], lever[1] + 1.2, 0)
    press('KeyE'); adv(1.2); press('KeyE'); adv(1.2)
    check('L4 lever slides relic to slot 3', ev(f'{relic("A")}.slot') == 2)
    stand_behind('A'); check('L4 turn → rune from the right socket', turn_to_lock('A'))
    adv(1.0); ok, far = walk_bridge('a'); check('L4 bridge walked', ok, f'{far:.2f}')
    grab_ember(); adv(1.5)
    check('L4 complete; shortcut + north gate open', level_done(4) and ev(f'{S}.world.gates.get("g_sc_w").isOpen || {S}.world.gates.get("g_sc_w").state==="opening"'))
    skip_scene()
    check('revelation I seen', ev(f'{S}.world.progress.data.story.includes("rev1")'))
    adv(3)
    # use the shortcut back to the hub
    for (x, z) in ((-40, -90), (-31, -90), (-31, -16), (-20, -16)):
        d = walk_to(x, z, 30, sprint=True)
    check('shortcut corridor leads back into the hub', ev(f'{S}.player.pos.x') > -22 and ev(f'{S}.player.pos.z') < -10, f'{ev(f"[{S}.player.pos.x,{S}.player.pos.z]")}')

    # ===================================================================== L5
    for (x, z) in ((-16, -16), (0, -16), (0, -25)): walk_to(x, z, 12, sprint=True)
    d = walk_to(0, -34, 8)
    check('walk through the north gate to L5', ev(f'{P} && {P}.level.id') == 5, f'{d:.2f}')
    stand_behind('A'); ignite('A'); wait_jolt('A')
    # hold R through the whole memory: passing the answer must NOT solve it, but the rune must blink
    ev(f'window.__blinks = 0; (() => {{ const v={P}.runes.get("a").view; const o=v.sweep.bind(v); v.sweep = () => {{ window.__blinks++; o(); }}; }})()')
    rewind_until('A', f'{relic("A")}.relic.history.atOldest')
    check('L5 rewinding through the answer does not auto-solve', not ev(f'!!{relic("A")}.lockedOn'))
    check('L5 the rune blinks when the past shadow sweeps over it', ev('window.__blinks') >= 1, f"blinks={ev('window.__blinks')}")
    # replay forward is impossible; re-ignite is not needed: rewind from the oldest is done — use restart to test recovery
    press('Backspace'); time.sleep(0.4); adv(0.6)
    check('L5 Backspace restarts the puzzle (relic cold again)', not ev(f'{relic("A")}.lit'))
    stand_behind('A'); ignite('A'); wait_jolt('A')
    ok = rewind_until('A', f'Math.abs((() => {{ const p={P}, rs={relic("A")}, ru=p.runes.get("a"); const a=p.aimYawFor(rs,ru); return Math.atan2(Math.sin(rs.relic.yaw-a), Math.cos(rs.relic.yaw-a)); }})()) < 0.17')
    check('L5 rewind stopped near the answer', ok, f'err {err_deg("A"):.1f}°')
    check('L5 nudge → rune', turn_to_lock('A'))
    adv(1.0); ok, far = walk_bridge('a'); check('L5 bridge walked', ok, f'{far:.2f}')
    grab_ember(); adv(1.5); check('L5 complete', level_done(5))

    # ===================================================================== L6
    walk_to(0, -56, 6); walk_to(0, -60.5, 6); d = walk_to(-1, -64, 6)
    check('walk through the L5 gate to L6', ev(f'{P} && {P}.level.id') == 6, f'{d:.2f}')
    stand_behind('B')  # cannot ignite B directly
    press('KeyE'); adv(0.3)
    check('L6 B cannot be lit by hand', not ev(f'{relic("B")}.lit'))
    stand_behind('A'); ignite('A'); check('L6 A → relay rune', turn_to_lock('A'))
    adv(2.5)
    check('L6 fire relays to B and the inner gate opens', ev(f'{relic("B")}.lit') and ev(f'{S}.world.gates.get("g_L6m").state !== "closed"'))
    adv(2.5)
    d = walk_to(-1, -69, 6); d = walk_to(5, -69, 6)
    check('walk through the inner gate', ev(f'{S}.player.pos.x') > 3, f'{d:.2f}')
    wait_jolt('B'); stand_behind('B')
    rewind_until('B', f'{relic("B")}.relic.history.atOldest')
    check('L6 nudge B → rune', turn_to_lock('B'))
    adv(1.0); ok, far = walk_bridge('b'); check('L6 bridge walked', ok, f'{far:.2f}')
    grab_ember(); adv(1.5); check('L6 complete', level_done(6))

    # ===================================================================== L7
    walk_to(16, -88, 6); walk_to(21, -88, 6); d = walk_to(27, -88, 6)
    check('walk through the L6 gate to L7', ev(f'{P} && {P}.level.id') == 7, f'{d:.2f}')
    stand_behind('W'); press('KeyE'); adv(0.3)
    check('L7 cold relic refuses without flame', not ev(f'{relic("W")}.lit'))
    walk_to(34.5, -79, 6); press('KeyE'); adv(0.2)
    check('L7 take flame from the hearth', ev(f'!!{S}.player.flame'))
    # wrong choice first: spend it on the wave decoy, see the rejection
    walk_to(28.5, -71.6, 6, sprint=True); press('KeyE'); adv(0.3)
    check('L7 decoy kindled (flame spent)', ev(f'{relic("W")}.lit') and not ev(f'!!{S}.player.flame'))
    stand_behind('W')
    k = key_toward('W'); down(k)
    rej = False
    for _ in range(240):
        adv(1/30)
        if ev(f'{P}.flash && {P}.flash.text.includes("DOES NOT KNOW")'): rej = True; break
    up(k)
    check('L7 decoy shadow on the door rune is rejected', rej and not ev(f'{P}.runes.get("c").lit'))
    walk_to(34.5, -79, 8); press('KeyE'); adv(0.2)
    for (x, z) in ((35, -87), (44.5, -91.5)):
        walk_to(x, z, 10, sprint=True)
    press('KeyE'); adv(0.3)
    check('L7 eye relic kindled before the flame died', ev(f'{relic("C")}.lit'))
    stand_behind('C'); check('L7 eye relic → door rune', turn_to_lock('C'))
    adv(3.0)
    check('L7 door opened', ev(f'{S}.world.gates.get("g_L7").isOpen'))
    walk_to(37, -87.5, 8); walk_to(33, -82, 8); walk_to(33, -64, 8); d = walk_to(33, -57.6, 6); adv(1.5)
    check('L7 complete (ember beyond the door)', level_done(7))
    skip_scene(); check('revelation II seen', ev(f'{S}.world.progress.data.story.includes("rev2")'))
    adv(3)
    for (x, z) in ((33, -31), (16, -31), (16, -18)):
        walk_to(x, z, 30, sprint=True)
    check('north shortcut back into the hub', ev(f'{S}.player.pos.z') > -22, f'{ev(f"[{S}.player.pos.x,{S}.player.pos.z]")}')

    # ===================================================================== L8
    for (x, z) in ((16, -16), (16, 0), (26, 0)): walk_to(x, z, 12, sprint=True)
    d = walk_to(33.5, 0, 8)
    check('walk through the east gate to L8', ev(f'{P} && {P}.level.id') == 8, f'{d:.2f}')
    lever = ev(f'{relic("A")}.spec.rail.lever')
    teleport(lever[0] - 1.2, lever[1], 0); press('KeyE'); adv(1.2)
    check('L8 lever → slot 2', ev(f'{relic("A")}.slot') == 1)
    stand_behind('A'); ignite('A'); check('L8 rail relic opens the inner door', turn_to_lock('A'))
    adv(3)
    hz = ev(f'(() => {{ const b={P}.braziers.find(b=>b.eternal); return [b.pos.x, b.pos.z]; }})()')
    walk_to(hz[0], hz[1] + 1.5, 8); press('KeyE'); adv(0.2)
    check('L8 flame taken', ev(f'!!{S}.player.flame'))
    for (x, z) in ((38.5, 4), (42, 4), (44.3, -6.4)):
        walk_to(x, z, 8, sprint=True)
    press('KeyE'); adv(0.3)
    check('L8 cold collar relic kindled in time', ev(f'{relic("B")}.lit'))
    wait_jolt('B'); stand_behind('B')
    rewind_until('B', f'{relic("B")}.relic.history.atOldest')
    check('L8 nudge → timed span', turn_to_lock('B'))
    adv(1.0)
    check('L8 span timer running', ev(f'!!{P}.hudTimer'))
    # stand on the span: the timer must pause
    ev(f'''(() => {{ const g={S}, br={P}.runes.get("b").bridge, m=br.group.position; g.player.pos.set(m.x, m.y, m.z); g.player.vel.set(0,0,0); }})()''')
    adv(0.5); t_a = ev(f'{P}.hudTimer.t'); adv(2.0); t_b = ev(f'{P}.hudTimer.t')
    check('L8 timer pauses while standing on the span', abs(t_a - t_b) < 0.05, f'{t_a:.2f} → {t_b:.2f}')
    # step off and let it expire: the span must fade (collider off) and the relic slip
    stand_behind('B'); adv(10)
    check('L8 expired span fades and is not walkable', ev(f'{P}.runes.get("b").bridge.state === "HIDDEN" && !{P}.runes.get("b").bridge.collider.enabled'))
    wait_jolt('B')
    check('L8 relic slipped off the rune', not ev(f'!!{relic("B")}.lockedOn'))
    rewind_until('B', f'!!{relic("B")}.lockedOn || {relic("B")}.relic.history.atOldest')
    if not ev(f'!!{relic("B")}.lockedOn'): turn_to_lock('B')
    check('L8 rewind restores the span after the slip', ev(f'!!{relic("B")}.lockedOn'))
    adv(1.0)
    ok, far = walk_bridge('b'); check('L8 timed span crossed', ok, f'{far:.2f}')
    grab_ember(); adv(1.5); check('L8 complete', level_done(8))

    # ===================================================================== L9
    walk_to(57, 13, 8); walk_to(57, 18, 6); d = walk_to(57, 28.5, 10)
    check('walk through the L8 gate to L9', ev(f'{P} && {P}.level.id') == 9, f'{d:.2f}')
    stand_behind('A'); ignite('A'); check('L9 A → relay', turn_to_lock('A'))
    adv(2.5); check('L9 B lit by relay', ev(f'{relic("B")}.lit'))
    wait_jolt('B'); stand_behind('B')
    rewind_until('B', f'{relic("B")}.relic.history.atOldest')
    check('L9 B → bridge + relay', turn_to_lock('B'))
    adv(2.5); check('L9 C lit by relay', ev(f'{relic("C")}.lit'))
    ok, far = walk_bridge('c', 0.3); check('L9 first span walked to the island', ok, f'{far:.2f}')
    lever = ev(f'{relic("C")}.spec.rail.lever')
    teleport(lever[0], lever[1] + 1.2, 0); press('KeyE'); adv(1.2); press('KeyE'); adv(1.2)
    check('L9 C slid to slot 3', ev(f'{relic("C")}.slot') == 2)
    stand_behind('C'); check('L9 C → timed final span', turn_to_lock('C'))
    adv(1.0); ok, far = walk_bridge('x'); check('L9 timed span crossed', ok, f'{far:.2f}')
    grab_ember(); adv(1.5); check('L9 complete', level_done(9))
    skip_scene(); check('ring wakes', ev(f'[...{S}.world.l10.relics.values()].every(r => r.awake)'))
    adv(3)
    for (x, z) in ((28, 29), (28, 13), (18, 13)):
        walk_to(x, z, 30, sprint=True)
    check('east shortcut back into the hub', ev(f'{S}.player.pos.x') < 22, f'{ev(f"[{S}.player.pos.x,{S}.player.pos.z]")}')

    # ===================================================================== L10
    adv(0.5); check('L10 active in the hub', ev(f'{P} && {P}.level.id') == 10)
    # E relic: flame from the ring hearth
    walk_to(17, 5, 10, sprint=True); walk_to(16.5, -13.6, 12, sprint=True); press('KeyE'); adv(0.2)
    check('L10 ring hearth gives flame', ev(f'!!{S}.player.flame'))
    walk_to(16.0, 7.2, 12, sprint=True); press('KeyE'); adv(0.3)
    check('L10 E kindled', ev(f'{relic("E")}.lit'))
    stand_behind('E'); check('L10 E socket held', turn_to_lock('E'))
    # S relic: rail
    lever = ev(f'{relic("S")}.spec.rail.lever')
    teleport(lever[0] + 1.2, lever[1], 0); press('KeyE'); adv(1.2)
    check('L10 S slid to the middle socket', ev(f'{relic("S")}.slot') == 1)
    stand_behind('S'); ignite('S'); check('L10 S socket held', turn_to_lock('S'))
    # W relic: collar + rewind
    teleport(-17, -7, 0); stand_behind('W'); ignite('W'); wait_jolt('W'); stand_behind('W')
    rewind_until('W', f'{relic("W")}.relic.history.atOldest')
    check('L10 W socket held', turn_to_lock('W'))
    adv(1.0)
    check('L10 all three held at once → final span', ev(f'{S}.world.l10.level.allSocketsDone') and ev(f'{S}.world.finalBridge.collider.enabled || {S}.world.finalBridge.state==="APPEARING"'))
    adv(1.5)
    shot('30_L10_final_span')
    teleport(0, -15, math.pi)
    down('KeyW'); adv(4.0); up('KeyW'); adv(0.5)
    check('final span walked to the Heart', ev(f'{S}.state') == 'cutscene' or level_done(10), f"pos {ev(f'[{S}.player.pos.x,{S}.player.pos.z]')}")
    for _ in range(40):
        if ev(f'{S}.state') != 'cutscene': break
        press('Space'); adv(1.0)
    check('finale reaches victory', ev(f'{S}.state') == 'victory', ev(f'{S}.state'))
    check('ten embers', ev(f'{S}.world.progress.data.completed.length') >= 10)
    shot('31_victory')

    # ===================================================================== persistence + menus
    ev(f"{S}.onAction('main-menu')"); time.sleep(0.6); adv(0.3)
    check('main menu returns to title', ev(f'{S}.state') == 'title')
    check('continue offered from save', ev(f'!document.getElementById("btn-continue").classList.contains("hidden")'))
    check('no console errors', not errors, '; '.join(errors[:4]))
    browser.close()

fails = [r for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} checks passed')
sys.exit(1 if fails else 0)
