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
    def teleport(x, z, yaw=0):
        ev(f'{S}.player.pos.set({x}, 0, {z}); {S}.player.vel.set(0,0,0); {S}.cameraCtl.yaw = {yaw};')
        adv(0.2)

    def walk_bridge_obj(js_bridge, extra=1.2):
        """Walk the full length of a slab bridge (JS expression) with W (+ a little beyond)."""
        f0 = ev('window.__falls')
        ev(f'''(() => {{ const g={S}, br={js_bridge};
          const dx=br.end.x-br.start.x, dz=br.end.z-br.start.z, L=Math.hypot(dx,dz);
          g.player.pos.set(br.start.x - dx/L*1.2, br.start.y, br.start.z - dz/L*1.2); g.player.vel.set(0,0,0);
          g.cameraCtl.yaw = Math.atan2(-dx, -dz); g.cameraCtl.pitch = 0.3; }})()''')
        adv(0.2)
        L = ev(f'{js_bridge}.length')
        down('KeyW')
        adv((L + 2.4 + extra) / 3.7)
        up('KeyW'); adv(0.3)
        far = ev(f'''(() => {{ const g={S}, br={js_bridge};
          const fx=br.end.x-br.start.x, fz=br.end.z-br.start.z;
          return ((g.player.pos.x-br.start.x)*fx + (g.player.pos.z-br.start.z)*fz)/(br.length*br.length); }})()''')
        return ev('window.__falls') == f0 and far > 1.0, far

    def walk_bridge(rune_id, extra=1.2): return walk_bridge_obj(f'{P}.runes.get("{rune_id}").bridge', extra)

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

    # ---- light-room helpers (the five rules) ----
    def wait_until(js, max_sec=5.0, dt=0.1):
        for _ in range(int(max_sec / dt)):
            if ev(js): return True
            adv(dt)
        return bool(ev(js))

    def rune_triggered(rid): return ev(f'!!{P}.runes.get("{rid}").lit')

    def stand_at(x, z, yaw=None):
        ev(f'{S}.player.pos.set({x}, 0, {z}); {S}.player.vel.set(0,0,0);' + (f'{S}.player.facing = {yaw}; {S}.cameraCtl.yaw = {yaw};' if yaw is not None else ''))
        adv(1/30)

    def lantern_at(x, z, yaw=0.0):
        """Place the Keeper so her lantern hangs over (x, z) (it swings at her hip)."""
        for _ in range(4):
            ev(f'''(() => {{ const g={S}, v=new g.player.pos.constructor(); g.player.facing={yaw}; g.player.syncVisual();
              g.player.keeper.group.updateMatrixWorld(true); g.player.keeper.lanternCore.getWorldPosition(v);
              g.player.pos.x += {x} - v.x; g.player.pos.z += {z} - v.z; g.player.vel.set(0,0,0); g.player.syncVisual(); }})()''')
        adv(1/30)

    def ilen_shadow(stone='A'):
        return ev(f'''(() => {{ const st={P}.stoneById.get("{stone}"); const s=st && st.shadows.get('ilen');
          if (!s) return null; const v=new {S}.player.pos.constructor(); {S}.player.keeper.lanternCore.getWorldPosition(v);
          const want=Math.atan2(-(st.base.x-v.x), -(st.base.z-v.z));
          return {{ yaw: s.yaw, want, err: Math.abs(Math.atan2(Math.sin(s.yaw-want), Math.cos(s.yaw-want)))*180/Math.PI, len: s.len, d: s.d }}; }})()''')

    def sconce(sid): return f'{P}.sconces.find(b => b.id === "{sid}")'

    def kindle(sid):
        b = ev(f'(() => {{ const b={sconce(sid)}; return [b.pos.x, b.pos.z]; }})()')
        stand_at(b[0] + 1.3, b[1] + 0.2)
        press('KeyE'); adv(0.2)
        return ev(f'{sconce(sid)}.lit')

    def shadow_of(stone, light):
        return ev(f'''(() => {{ const s={P}.stoneById.get("{stone}").shadows.get("{light}");
          return s ? {{ len: s.len, ux: s.ux, uz: s.uz, bx: s.stone.base.x, bz: s.stone.base.z, strength: s.strength, alive: s.alive, on: {S}.shadows.colliders[s.idx].enabled }} : null; }})()''')

    def walk_shadow(stone, light, a0=1.4, a1=None, beyond=2.0):
        """Walk on foot along a shadow from distance a0 to its end (+beyond). Returns (no falls, final pos)."""
        s = shadow_of(stone, light)
        a1 = (s['len'] if a1 is None else a1) + beyond
        f0 = ev('window.__falls')
        stand_at(s['bx'] + s['ux'] * a0, s['bz'] + s['uz'] * a0, math.atan2(-s['ux'], -s['uz']))
        d = walk_to(s['bx'] + s['ux'] * a1, s['bz'] + s['uz'] * a1, 12)
        adv(1.0)  # a fall takes ~0.8 s to register
        return ev('window.__falls') == f0, ev(f'[{S}.player.pos.x, {S}.player.pos.z, {S}.player.grounded]')

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
    t0 = ev(f'{S}.time')
    adv(3.7); i0 = ev(f'{S}.story.scene && {S}.story.scene.i')
    press('Space'); adv(0.3); press('Space'); adv(0.3)
    i1 = ev(f'{S}.story.scene ? {S}.story.scene.i : 99')
    check('Space advances dialogue', i1 > i0, f'{i0} → {i1}')
    for _ in range(60):
        if ev(f'{S}.state') == 'playing': break
        adv(0.5)
    t_ctl = ev(f'{S}.time') - t0
    check('cold open hands over control in < 30 s of game time', ev(f'{S}.state') == 'playing' and t_ctl < 30, f'{t_ctl:.1f}s')
    check('control returns with the follow camera (no cinematic override)', not ev(f'!!{S}.cameraCtl.override'))
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

    # ===================================================================== L1 · The Threshold (rules 1 + 3)
    teleport(0, 58, 0)
    check('L1 entered (active puzzle is a light room)', ev(f'{P} && {P}.level.id') == 1 and ev(f'{P}.isLight'))
    f0 = ev('window.__falls')
    stand_at(0, 52, 0); down('ShiftLeft'); down('KeyW')
    for _ in range(90):
        adv(1/30)
        if ev(f'!{S}.player.grounded'): break   # ran off the edge: coyote window
    press('Space', 1/30); up('KeyW'); up('ShiftLeft'); adv(1.5)
    check('no gap can be hopped: a running coyote hop across Room I\'s 3.5 m gap falls', ev('window.__falls') == f0 + 1)
    rw = ev(f'{S}.world.ruleWarnings')
    check('rule 1 is truthful: no decorative fire within reach of any stone', len(rw) == 0, '; '.join(rw))
    lm = ev(f'{S}.debug.lightMap(1)')
    check('L1 light map: rune a wakes only from a zone behind the stone', lm['runes']['a']['valid'] > 5 and lm['runes']['a']['wrong'] == 0, f"{lm['runes']['a']['valid']} samples, zone {lm['runes']['a']['zone']}")
    # rune→stone line: the lantern must stand on its far side, 4.1–9 m behind the stone
    st = ev(f'(() => {{ const b={P}.stoneById.get("A").base, r={P}.runes.get("a").pos; return [b.x, b.z, r.x, r.z]; }})()')
    ux, uz = st[2] - st[0], st[3] - st[1]; L = math.hypot(ux, uz); ux, uz = ux / L, uz / L
    behind = lambda d: (st[0] - ux * d, st[1] - uz * d)
    worst = 0
    for (x, z) in ((-3, 56), (2, 55), (-5, 50), (3, 51), (0, 57)):
        lantern_at(x, z); adv(0.4)
        sh = ilen_shadow(); worst = max(worst, sh['err'] if sh else 99)
    check('L1 the shadow follows the lantern (yaw error < 2°)', worst < 2.0, f'worst {worst:.2f}°')
    lantern_at(*behind(2.0)); adv(0.4); l_near = ilen_shadow()['len']
    lantern_at(*behind(4.0)); adv(0.4); l_far = ilen_shadow()['len']
    check('L1 stepping back lengthens the shadow', l_far > l_near + 2.8, f'{l_near:.1f} m → {l_far:.1f} m')
    lantern_at(*behind(2.5)); adv(1.5)
    check('L1 too short from near the stone (rune stays asleep)', not rune_triggered('a'))
    # walking quickly across the valid zone must not wake it (settle rule)
    px, pz = -uz, ux
    cx, cz = behind(6.0)
    stand_at(cx - px * 3, cz - pz * 3); walk_to(cx + px * 3, cz + pz * 3, 6)
    check('L1 walking past the zone does not trigger (0.4 s settle)', not rune_triggered('a'))
    lantern_at(cx, cz); ok = wait_until(f'{P}.runes.get("a").lit', 2.0, 1/30)
    t_settle = ev(f'{P}.runes.get("a").coverT')
    check('L1 standing in the zone wakes the rune', ok, f'settled after {t_settle:.2f}s')
    check('L1 the stone glows gold while its shadow rests on the rune', ev(f'{P}.stoneById.get("A").relic.glow') > 0.5)
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
    press('Escape'); adv(1.0)
    check('Esc skips the cutscene and returns control', ev(f'{S}.state') == 'playing' and not ev(f'!!{S}.cameraCtl.override'))
    skip_scene()
    d = walk_to(0, 17, 6)
    check('walk through the L1 gate and gallery into the hub', d < 1.0, f'dist {d:.2f}')
    check('hub arrival scene seen', ev(f'{S}.world.progress.data.story.includes("hub_first")'))

    # ===================================================================== L2 · The Loose Shadow (rules 2 + 4)
    for (x, z) in ((-10, 15), (-17, 14), (-17, 0), (-30, 0)): walk_to(x, z, 12, sprint=True)
    d = walk_to(-36, 0, 6)
    check('walk through the hub west gate to L2', d < 1.0 and ev(f'{P} && {P}.level.id') == 2, f'{d:.2f}')
    ev(f'window.__said = []; (() => {{ const st={S}.story, o=st.say.bind(st); st.say = (a, b, c) => {{ window.__said.push(b); o(a, b, c); }}; }})()')
    stand_at(-37, 6, math.pi / 2); adv(62)
    check('II hints on demand: Marrow speaks after 60 s without progress', any('cannot walk the road' in x for x in ev('window.__said')), str(ev('window.__said'))[:120])
    down('KeyQ'); adv(0.3)
    nprev = ev(f'{S}.shadows.previews.filter(v => v.group.visible).length')
    up('KeyQ'); adv(0.2)
    check('II focus (hold Q) previews where the unlit sconces would cast', nprev >= 2, f'{nprev} previews')
    # the naive attempt: walk toward the far end of your own shadow lying across the chasm
    stand_at(-38, 1.5, math.pi / 2); adv(0.5)
    sh = shadow_of('A', 'ilen')
    tipx = sh['bx'] + sh['ux'] * sh['len']
    check('L2 Ilen\'s own shadow lies across the chasm', tipx < -50, f'tip x {tipx:.1f}')
    ev('window.__onOwn = 0; window.__airT = null; window.__respT = null;')
    f0 = ev('window.__falls')
    down('KeyW')
    for _ in range(150):
        ev(f'''(() => {{ const g={S}; g.cameraCtl.yaw = Math.atan2(-(-50 - g.player.pos.x), -(1.5 - g.player.pos.z));
          if (g.shadows.playerOnShadow && g.shadows.playerOnShadow.kind === 'ilen') window.__onOwn++;
          if (!g.player.grounded && window.__airT === null && g.player.pos.y < -0.05) window.__airT = g.time; }})()''')
        adv(1/30)
        if ev('window.__falls') > f0: break
    up('KeyW')
    t_resp = ev(f'{S}.time - window.__airT') if ev('window.__airT !== null') else 99
    adv(0.3)
    pos = ev(f'[{S}.player.pos.x, {S}.player.pos.z, {S}.player.grounded]')
    check('L2 your own shadow cannot be walked (you fall)', ev('window.__falls') == f0 + 1 and ev('window.__onOwn') == 0, f"falls +{ev('window.__falls') - f0}, frames on own shadow {ev('window.__onOwn')}")
    check('L2 fall respawns at the last safe ground in < 1 s', t_resp < 1.0 and pos[0] > -46 and pos[0] < -40 and pos[2], f'{t_resp:.2f}s at ({pos[0]:.1f}, {pos[1]:.1f})')
    check('L2 bark after the first fall', ev(f'{S}.world.progress.data.story.includes("bark_2_ownFall")'))
    # near sconce: its shadow stops over the edge
    check('L2 kindle the near sconce with E', kindle('near'))
    adv(0.6)
    sh = shadow_of('A', 's:near')
    tipx = sh['bx'] + sh['ux'] * (sh['len'] + 0.35)
    lm = ev(f'{S}.debug.lightMap(2)')
    check('L2 the near sconce\'s shadow does not reach the far side', tipx > -47 and not lm['sconces']['near'][0]['crossesAbyss'], f'tip x {tipx:.1f}')
    ok, pos = walk_shadow('A', 's:near', 1.4, None, 3.0)
    check('L2 walking off the short shadow drops you', not ok, str(pos))
    adv(0.5)
    # far sconce: the long shadow crosses; first prove the burn-out warning + coyote time
    check('L2 kindle the far sconce', kindle('far'))
    adv(0.6)
    check('L2 light map: the far sconce\'s shadow crosses the abyss', lm['sconces']['far'][0]['crossesAbyss'], str(lm['sconces']['far'][0]['abyss']))
    sh = shadow_of('A', 's:far')
    ax, az = sh['bx'] + sh['ux'] * 7.5, sh['bz'] + sh['uz'] * 7.5
    stand_at(ax, az, math.atan2(-sh['ux'], -sh['uz'])); adv(0.3)
    check('L2 standing on the sconce\'s shadow over the abyss holds you', ev(f'{S}.player.grounded') and ev(f'{S}.player.pos.y') > -0.05 and ev(f'{S}.shadows.playerOnShadow && {S}.shadows.playerOnShadow.kind') == 'sconce')
    # rule 4 stays true for Ilen too: on the sconce's line, her own shadow points back at it and re-lights it
    ev(f'{sconce("far")}.burnT = 0.3'); adv(1.6)
    check('L2 rule 4: your own shadow re-lights the sconce you stand in line with', ev(f'{sconce("far")}.lit') and ev(f'{S}.player.grounded'))
    # off the line (lantern swung wide) the fire dies: ≥ 0.9 s of warning, then coyote time
    px, pz = -sh['uz'], sh['ux']
    stand_at(sh['bx'] + sh['ux'] * 5.9 + px * 0.6, sh['bz'] + sh['uz'] * 5.9 + pz * 0.6, math.atan2(-pz, px)); adv(0.3)
    check('L2 (still held up near the shadow\'s edge)', ev(f'{S}.player.grounded') and ev(f'{S}.player.pos.y') > -0.05)
    f0 = ev('window.__falls')
    ev(f'{sconce("far")}.burnT = 0.6; window.__outT = null;')
    for _ in range(90):
        ev(f'(() => {{ const b={sconce("far")}; if (!b.lit && window.__outT === null) window.__outT = {S}.time; }})()')
        adv(1/30)
        if ev(f'!{S}.player.grounded'): break
    warn = ev(f'{S}.time - window.__outT') if ev('window.__outT !== null') else 0
    check('L2 a dying fire\'s shadow gives ≥ 0.9 s of warning before it drops you', warn >= 0.9, f'{warn:.2f}s')
    press('Space', 1/30)
    check('L2 coyote time: a hop still works as the shadow slides away', ev(f'{S}.player.vel.y') > 1.0, f"vy {ev(f'{S}.player.vel.y'):.2f}")
    adv(1.5)
    check('L2 …then the fall respawns you on safe ground', ev('window.__falls') == f0 + 1 and ev(f'{S}.player.pos.x') > -46)
    # cross on the far sconce's shadow
    kindle('far'); adv(0.6)
    ok, pos = walk_shadow('A', 's:far', 1.4, None, 1.5)
    check('L2 crossed the chasm on the far sconce\'s shadow', ok and pos[0] < -50 and pos[2], f'({pos[0]:.1f}, {pos[1]:.1f})')
    check('L2 bark while standing on a sconce shadow', ev(f'{S}.world.progress.data.story.includes("bark_2_sconceHold")'))
    shot('12_L2_crossed')
    grab_ember(); adv(1.5); check('L2 complete', level_done(2))

    # ===================================================================== III · Marrow's Rounds
    walk_to(-55, -10, 6); walk_to(-55, -16, 6); d = walk_to(-55, -27.5, 8)
    check('walk through the L2 gate to Room III', ev(f'{P} && {P}.level.id') == 3, f'{d:.2f}')
    adv(0.5)
    check('III Marrow\'s echo walks her rounds (her lantern is a light)', ev(f'{P}.marrow.active') and ev(f'{S}.shadows.extraLights.some(l => l.kind === "marrow")'))
    lm = ev(f'{S}.debug.lightMap(3)')
    w = lm['marrow']
    check('III light map: Marrow\'s shadow bridges the gap twice a loop (≈4 s of every ≈12 s)', len(w['windows']) == 2 and 0.25 < w['fraction'] < 0.45, str(w))
    # her sweep never lights the island sconce: watch a whole loop
    stand_at(-60, -27.5, 0)
    lit = False
    for _ in range(int(w['cycle'] * 10) + 5):
        adv(0.1)
        if ev(f'{sconce("isl")}.lit'): lit = True; break
    check('III over a full loop, Marrow\'s sweep does not light the island sconce', not lit)
    # wait for her shadow to swing straight across the gap, then step on as it arrives
    ok = wait_until(f'''(() => {{ const s={P}.stoneById.get("A").shadows.get("marrow"); return s && s.alive && s.strength > 0.9 && s.uz < -0.95 && s.len > 6.6; }})()''', w['cycle'] + 2, 1/30)
    check('III Marrow\'s shadow arrives across the gap', ok)
    f0 = ev('window.__falls')
    sh = shadow_of('A', 'marrow')
    stand_at(sh['bx'] + sh['ux'] * 1.2, sh['bz'] + sh['uz'] * 1.2, math.atan2(-sh['ux'], -sh['uz']))
    down('ShiftLeft'); d = walk_to(-55, -42.0, 4); up('ShiftLeft'); adv(1.0)
    pos = ev(f'[{S}.player.pos.x, {S}.player.pos.z, {S}.player.grounded]')
    check('III crossed onto the island on Marrow\'s shadow', ev('window.__falls') == f0 and pos[1] < -40.2 and pos[2], f'({pos[0]:.1f}, {pos[1]:.1f}) falls +{ev("window.__falls") - f0}')
    check('III kindle the island sconce', kindle('isl'))
    adv(0.6)
    ok, pos = walk_shadow('B', 's:isl', 1.2, None, 1.5)
    check('III the sconce throws stone B\'s shadow across the second gap; walked it', ok and pos[1] < -50 and pos[2], f'({pos[0]:.1f}, {pos[1]:.1f})')
    grab_ember(); adv(1.5)
    check('III complete', level_done(3))
    skip_scene()
    check('revelation I seen after Room III', ev(f'{S}.world.progress.data.story.includes("rev1")'))
    adv(2)

    # ===================================================================== passage (old IV): bridge pre-formed, shortcut home
    walk_to(-55, -56, 6); walk_to(-55, -62, 6); d = walk_to(-55, -68.5, 6)
    check('walk through the Room III gate into the west passage', ev(f'{P} && {P}.level.id') == 4 and ev(f'{P}.passage'), f'{d:.2f}')
    check('passage bridge already formed', ev(f'{P}.bridges[0].collider.enabled'))
    ok, far = walk_bridge_obj(f'{P}.bridges[0]'); check('passage bridge walked', ok, f'{far:.2f}')
    for (x, z) in ((-40, -90), (-31, -90), (-31, -16), (-20, -16)):
        d = walk_to(x, z, 30, sprint=True)
    check('shortcut corridor leads back into the hub', ev(f'{S}.player.pos.x') > -22 and ev(f'{S}.player.pos.z') < -10, f'{ev(f"[{S}.player.pos.x,{S}.player.pos.z]")}')

    # ===================================================================== IV · The Kept Minute (rule 5: echoes)
    for (x, z) in ((-16, -16), (0, -16), (0, -25)): walk_to(x, z, 12, sprint=True)
    d = walk_to(0, -34, 8)
    check('walk through the north gate to Room IV', ev(f'{P} && {P}.level.id') == 5, f'{d:.2f}')
    press('KeyR'); adv(0.3)
    check('IV R does nothing before Marrow grants the minute', not ev(f'{S}.echoes.recording') and not ev(f'{S}.echoes.echoes.length'))
    walk_to(0, -36.5, 4); adv(0.3)
    check('IV stepping onto Marrow\'s sigil grants the echo', ev(f'{S}.world.progress.data.abilities.echo'))
    lm = ev(f'{S}.debug.lightMap(5)')
    check('IV light map: the door rune cannot be woken from any floor (only over the abyss)', lm['runes']['d']['valid'] == 0, str(lm['runes']['d']['zone']))
    # echo rules: falling cancels a recording; R dismisses; only one at a time
    press('KeyR'); adv(0.5)
    check('IV R marks a minute (recording, MINUTE ring)', ev(f'{S}.echoes.recording') and ev(f'{S}.echoes.hud.label') == 'MINUTE')
    ev(f'{S}.player.pos.set(0, -1, -46); {S}.player.vel.set(0,0,0)'); adv(1.2)
    check('IV falling cancels the recording', not ev(f'{S}.echoes.recording') and ev(f'{S}.echoes.echoes.length') == 0)
    stand_at(0, -38, 0)
    press('KeyR'); walk_to(-2, -38, 3); press('KeyR'); adv(0.3)
    first = ev(f'{S}.echoes.echoes[0] && {S}.echoes.echoes[0].id')
    press('KeyR'); walk_to(-3, -37, 3); press('KeyR'); adv(0.3)
    check('IV only one echo at a time (R dismissed the first)', ev(f'{S}.echoes.echoes.length') == 1 and ev(f'{S}.echoes.echoes[0].id') != first)
    press('Backspace'); time.sleep(0.4); adv(0.6)
    check('IV Backspace clears echoes', ev(f'{S}.echoes.echoes.length') == 0 and not ev(f'{S}.echoes.recording'))
    # the solution: record the walk to the light spot behind stone A, let the echo hold it, cross
    stand_at(0, -38, 0)
    press('KeyR'); walk_to(-8.0, -39.0, 6); adv(0.3); press('KeyR')
    check('IV the echo appears and replays', ev(f'{S}.echoes.echoes.length') == 1)
    ok = wait_until(f'{S}.echoes.echoes[0] && {S}.echoes.echoes[0].state === "hold"', 6)
    check('IV the echo holds its light (lantern raised, ECHO ring)', ok and ev(f'{S}.echoes.hud.label') == 'ECHO')
    sh = ev(f'(() => {{ const s=[...{P}.stoneById.get("A").shadows.values()].find(s => s.kind === "echo"); return s && {{ len: s.len, ux: s.ux, uz: s.uz }}; }})()')
    check('IV the echo casts stone A\'s shadow across the gap', sh and sh['len'] > 8.8, str(sh))
    f0 = ev('window.__falls')
    walk_to(-4.0, -44.0, 5); walk_to(-1.3, -47.0, 5)
    on = ev(f'{S}.shadows.playerOnShadow && {S}.shadows.playerOnShadow.kind')
    check('IV standing on your own past: the echo-held shadow holds you over the abyss', on == 'echo' and ev('window.__falls') == f0, str(on))
    ok = wait_until(f'{P}.runes.get("d").lit', 3, 1/30)
    check('IV from over the abyss, stone B\'s shadow tip wakes the door rune', ok)
    adv(1.2)
    check('IV the far door opens', ev(f'{S}.world.gates.get("g_L5").isOpen || {S}.world.gates.get("g_L5").state === "opening"'))
    walk_to(-0.5, -52, 4); walk_to(0, -58, 4); grab_ember(); adv(1.5)
    check('IV complete (crossed on foot, no falls)', level_done(5) and ev('window.__falls') == f0)

    # ===================================================================== V · The Fire Road (rule 4: relays)
    walk_to(0, -56, 6); walk_to(0, -60.5, 6); d = walk_to(-1, -64, 6)
    check('walk through the Room IV door to Room V', ev(f'{P} && {P}.level.id') == 6, f'{d:.2f}')
    stand_at(-9.4, -75.3, 0); adv(0.2)
    check('V the gallery sconces cannot be kindled by hand (no prompt at the balustrade)', not ev(f'{P}.prompt0 && {P}.prompt0.type === "sconce"') and not any(ev(f'{P}.sconces.map(b => b.lit)')))
    # sweep stone W's shadow across the gallery: walk east of W from north to south
    ev('window.__order = [];')
    stand_at(-5.2, -64.2, 0)
    down('KeyW')
    for _ in range(120):
        ev(f'''(() => {{ const g={S}; g.cameraCtl.yaw = 0; for (const b of {P}.sconces) if (b.lit && !window.__order.includes(b.id)) window.__order.push(b.id); }})()''')
        adv(1/30)
        if ev(f'{S}.player.pos.z') < -73.5: break
    up('KeyW'); adv(0.8)
    ev(f'''(() => {{ for (const b of {P}.sconces) if (b.lit && !window.__order.includes(b.id)) window.__order.push(b.id); }})()''')
    order = ev('window.__order')
    check('V one sweep lights the gallery in sequence', order[:3] == ['s3', 's2', 's1'] or order[:3] == ['s1', 's2', 's3'], str(order))
    ok = wait_until(f'{P}.runes.get("g").lit', 3)
    check('V the middle sconce throws W\'s shadow onto the door rune', ok)
    adv(1.5)
    check('V the inner door opens', ev(f'{S}.world.gates.get("g_L6m").state !== "closed"'))
    d = walk_to(-1, -69, 6); d = walk_to(5, -69, 6)
    check('walk through the inner door', ev(f'{S}.player.pos.x') > 3, f'{d:.2f}')
    walk_to(5, -72.9, 5); adv(0.3)
    lit = wait_until(f'{sconce("F")}.lit', 3)
    check('V from the edge, Ilen\'s shadow of S crosses the abyss and lights the far sconce', lit)
    adv(0.6)
    sh = shadow_of('S', 's:F')
    check('V the far fire throws S\'s shadow back across the abyss', sh and sh['bz'] + sh['uz'] * sh['len'] > -72, str(sh))
    f0 = ev('window.__falls')
    stand_at(5, -71.5, math.pi)
    walk_to(5, -79.3, 6); walk_to(6.3, -80.3, 3); d = walk_to(6.3, -83.5, 4); adv(1.0)
    pos = ev(f'[{S}.player.pos.x, {S}.player.pos.z, {S}.player.grounded]')
    check('V crossed on the road the far fire threw back', ev('window.__falls') == f0 and pos[1] < -80 and pos[2], f'({pos[0]:.1f}, {pos[1]:.1f})')
    grab_ember(); adv(1.5); check('V complete', level_done(6))
    skip_scene(); check('revelation II seen after Room V', ev(f'{S}.world.progress.data.story.includes("rev2")'))
    adv(2)

    # ===================================================================== passages (old VII, VIII) to Room VI
    walk_to(16, -88, 6); walk_to(21, -88, 6); d = walk_to(27, -88, 6)
    check('walk through the Room V gate into the north passage', ev(f'{P} && {P}.level.id') == 7, f'{d:.2f}')
    walk_to(37, -87.5, 8); walk_to(33, -82, 8); walk_to(33, -64, 8); walk_to(33, -57.6, 6)
    for (x, z) in ((33, -31), (16, -31), (16, -18)):
        walk_to(x, z, 30, sprint=True)
    check('north shortcut back into the hub', ev(f'{S}.player.pos.z') > -22, f'{ev(f"[{S}.player.pos.x,{S}.player.pos.z]")}')
    for (x, z) in ((16, -16), (16, 0), (26, 0)): walk_to(x, z, 12, sprint=True)
    d = walk_to(33.5, 0, 8)
    check('walk through the east gate into the east passage', ev(f'{P} && {P}.level.id') == 8, f'{d:.2f}')
    walk_to(38.5, 4, 6); walk_to(42, 4, 6); walk_to(44, -4, 6)
    ok, far = walk_bridge_obj(f'{P}.bridges[0]'); check('east passage bridge walked', ok, f'{far:.2f}')

    # ===================================================================== VI · The Mirror Hall (quiet: relay + rail + echo)
    walk_to(57, 13, 8); walk_to(57, 18, 6); d = walk_to(57, 28.5, 10)
    check('walk through the passage gate to Room VI', ev(f'{P} && {P}.level.id') == 9, f'{d:.2f}')
    walk_to(57, 34, 6); walk_to(51.2, 40.5, 6); lantern_at(50.8, 42.0, math.pi / 2); adv(0.3)
    lit = wait_until(f'{sconce("E")}.lit', 3)
    check('VI relay: Ilen\'s shadow of A reaches through the grille and lights E', lit)
    adv(0.6)
    f0 = ev('window.__falls')
    ok, pos = walk_shadow('A', 's:E', 1.2, 13.2, 0)
    check('VI E throws A\'s shadow to the island; walked it', ok and 38 < pos[0] < 45 and pos[2], f'({pos[0]:.1f}, {pos[1]:.1f})')
    lever = ev(f'{P}.stoneById.get("R").rail.lever')
    stand_at(lever[0] + 0.6, lever[1] - 0.6); press('KeyE'); adv(1.3)
    check('VI rail: R slides to the island\'s edge', abs(ev(f'{P}.stoneById.get("R").base.x') - 39.2) < 0.05)
    stand_at(44.6, 42, math.pi / 2)
    press('KeyR'); walk_to(43.6, 42, 3); adv(0.2); press('KeyR')
    ok = wait_until(f'{S}.echoes.echoes[0] && {S}.echoes.echoes[0].state === "hold"', 6)
    sh = ev(f'(() => {{ const s=[...{P}.stoneById.get("R").shadows.values()].find(s => s.kind === "echo"); return s && {{ len: s.len, tipx: s.stone.base.x + s.ux * s.len }}; }})()')
    check('VI the echo holds R\'s shadow across the second gap', ok and sh and sh['tipx'] < 32.5, str(sh))
    stand_at(38.2, 42, math.pi / 2)
    d = walk_to(30.5, 42, 6); adv(1.0)
    pos = ev(f'[{S}.player.pos.x, {S}.player.pos.z, {S}.player.grounded]')
    check('VI crossed the second gap on the echo-held shadow', ev('window.__falls') == f0 and pos[0] < 33 and pos[2], f'({pos[0]:.1f}, {pos[1]:.1f})')
    grab_ember(); adv(1.5); check('VI complete', level_done(9))
    skip_scene(); check('the ring wakes', ev(f'{S}.world.l10.stones.every(s => s.awake)'))
    adv(3)
    for (x, z) in ((28, 29), (28, 13), (18, 13)):
        walk_to(x, z, 30, sprint=True)
    check('east shortcut back into the hub', ev(f'{S}.player.pos.x') < 22, f'{ev(f"[{S}.player.pos.x,{S}.player.pos.z]")}')

    # ===================================================================== The Heart (two permanent echoes + Ilen)
    adv(0.5); check('the Heart is active in the hub', ev(f'{P} && {P}.level.id') == 10)
    lm = ev(f'{S}.debug.lightMap(10)')
    check('Heart light map: sockets w and e can be held from the ring walkway', lm['runes']['w']['valid'] > 3 and lm['runes']['e']['valid'] > 3)
    # light spot for W: on the line socket→stone, ~6 m behind W (the echo's raised lantern hangs at its right hand)
    for (x, z) in ((16, 18.5), (-16.5, 18.5), (-17, -5.24)): walk_to(x, z, 15, sprint=True)
    press('KeyR'); walk_to(-18.15, -5.24, 3); adv(0.2); press('KeyR')
    wait_until(f'{S}.echoes.echoes.length && {S}.echoes.echoes[0].state === "hold"', 6)
    adv(14)
    check('Heart: the first echo stays (permanent) and holds socket w', ev(f'{S}.echoes.echoes.length') == 1 and ev(f'{P}.runes.get("w").lit'))
    for (x, z) in ((-16.5, 18.5), (16.5, 18.5), (17, -6.0)): walk_to(x, z, 20, sprint=True)
    press('KeyR'); walk_to(18.16, -6.0, 3); adv(0.2); press('KeyR')
    wait_until(f'{S}.echoes.echoes.length === 2 && {S}.echoes.echoes[1].state === "hold"', 6)
    check('Heart: …so does the second (socket e)', ev(f'{S}.echoes.echoes.length') == 2 and ev(f'{P}.runes.get("e").lit') and ev(f'{P}.runes.get("w").lit'))
    for (x, z) in ((16.5, 18.5), (-2.4, 18.4), (-2.4, 17)): walk_to(x, z, 20, sprint=True)
    press('KeyE'); adv(1.3); press('KeyE'); adv(1.3)
    check('Heart: the rail stone slid to the inner slot', abs(ev(f'{P}.stoneById.get("S").base.z') - 13.5) < 0.05)
    walk_to(-3, 18.6, 3); walk_to(-8.0, 18.4, 4); walk_to(-8.0, 17.9, 3); lantern_at(-8.0, 17.75, 0); adv(0.2)
    ok = wait_until(f'{P}.socketsDone', 4, 1/30)
    check('Heart: all three shadows held together → final span', ok and ev(f'{S}.world.finalBridge.collider.enabled || {S}.world.finalBridge.state === "APPEARING"'))
    adv(2.0)
    if ev(f'{S}.state') == 'cutscene': skip_scene()
    shot('30_heart_final_span')
    teleport(0, -15, math.pi)
    down('KeyW'); adv(4.0); up('KeyW'); adv(0.5)
    check('final span walked to the Heart', ev(f'{S}.state') == 'cutscene' or level_done(10), f"pos {ev(f'[{S}.player.pos.x,{S}.player.pos.z]')}")
    for _ in range(40):
        if ev(f'{S}.state') != 'cutscene': break
        press('Space'); adv(1.0)
    check('finale reaches victory', ev(f'{S}.state') == 'victory', ev(f'{S}.state'))
    check('six rooms restored', ev(f'{S}.world.roomsDone') == 6)
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
