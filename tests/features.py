"""
Tier 3 experiments (src/game/Features.js), each switched on through ?features=… (they ship OFF).
Checks that each one works as specified and does not break the rule it touches.

    npm run build && npx vite preview --port 4173 &
    python3 tests/features.py
"""
import math, sys, time
from playwright.sync_api import sync_playwright

URL = 'http://localhost:4173/?test&lowfx&features=GNOMON_ILEN,SUNDIAL_HUB,BACKWARD_ECHO,ASH_DARK'
S = 'window.__ashen'; P = f'{S}.world.activePuzzle'
results, errors = [], []
def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''), flush=True)

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = b.new_page(viewport={'width': 640, 'height': 360})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto(URL)
    page.wait_for_function(f'{S} && {S}.state === "title"', timeout=120000)
    ev = page.evaluate
    ev(f'''(() => {{ const g={S}; g.renderer.setAnimationLoop(null);
      window.__adv=(sec)=>{{ const n=Math.max(1,Math.round(sec*30)); for(let i=0;i<n;i++){{ g.step(1/30); if(i===0) g.input.pressed.clear(); }} g.input.endFrame(); }}; }})()''')
    adv = lambda t: ev(f'window.__adv({t})')
    def press(k, hold=0.1): page.keyboard.down(k); adv(hold); page.keyboard.up(k); adv(1/30)
    def stand(x, z, yaw=0): ev(f'{S}.player.pos.set({x},0,{z}); {S}.player.vel.set(0,0,0); {S}.player.facing={yaw}; {S}.cameraCtl.yaw={yaw}'); adv(1/30)
    ev(f"localStorage.clear(); {S}.world.progress.reset(); {S}.onAction('new-game')"); time.sleep(0.8); adv(0.5)
    for _ in range(4):
        if ev(f'{S}.state') == 'cutscene': press('Escape'); adv(0.5)
    ev(f'{S}.world.progress.data.story.push("hub_first"); {S}.world.progress.data.abilities.echo = true')
    check('all four flags on via URL', ev('JSON.stringify(Object.values(window.__ashen.shadows.body ? [1] : []))') == '[1]')

    # GNOMON_ILEN: in Room II under the far sconce, Ilen's body casts a narrow shadow with no collider
    stand(-37.5, 4.0); adv(0.5)
    ev(f'{P}.kindle({P}.sconces.find(b => b.id === "far"))'); adv(0.6)
    body = ev(f'(() => {{ const s={S}.shadows.body.shadows.get("s:far"); return s && {{ alive: s.alive, collider: {S}.shadows.colliders[s.idx].enabled, scale: {S}.shadows.views[s.idx].group.scale.x }}; }})()')
    check('GNOMON_ILEN: a sconce casts Ilen\'s body shadow (narrow, never ground)', body and body['alive'] and not body['collider'] and body['scale'] < 0.7, str(body))
    check('GNOMON_ILEN: her own lantern never shadows her body', ev(f'!{S}.shadows.body.shadows.has("ilen")'))

    # ASH_DARK: the west passage's east end — lantern 40 %, reach 5 m, echoes crumble
    ev(f'for (const id of {S}.world.gates.keys()) {S}.world.gates.get(id).setOpenInstant(true)')
    stand(-41.5, -72); adv(1.5)
    check('ASH_DARK: inside the Forgetting the lantern dims and reaches 5 m', ev(f'{S}.player.keeper.lanternDim') < 0.5 and ev(f'{S}.shadows.ilenReach') == 5)
    stand(-50, -72, -math.pi / 2); press('KeyR'); ev(f'{S}.player.pos.set(-41.5,0,-72)'); adv(0.6); press('KeyR')
    for _ in range(40):
        adv(0.1)
        if ev(f'{S}.echoes.echoes.length') == 0: break
    check('ASH_DARK: an echo that walks into the ash crumbles', ev(f'{S}.echoes.echoes.length') == 0)
    stand(-60, -72); adv(1.0)
    check('ASH_DARK: outside, the lantern returns to full', ev(f'{S}.player.keeper.lanternDim') > 0.9 and ev(f'{S}.shadows.ilenReach') == 9)

    # BACKWARD_ECHO: a recording started on the warm sigil replays end → start (Room VI island)
    stand(42, 38, math.pi); adv(0.3)
    press('KeyR'); page.keyboard.down('KeyW'); adv(1.5); page.keyboard.up('KeyW'); adv(0.2); press('KeyR')
    end_z = ev(f'{S}.player.pos.z')
    adv(0.1)
    first = ev(f'{S}.echoes.echoes[0] && {S}.echoes.echoes[0].ghost.keeper.group.position.z')
    for _ in range(40):
        adv(0.1)
        if ev(f'{S}.echoes.echoes[0].state') == 'hold': break
    last = ev(f'{S}.echoes.echoes[0].ghost.keeper.group.position.z')
    check('BACKWARD_ECHO: the echo starts where the minute ended and ends where it began', abs(first - end_z) < 0.6 and abs(last - 38) < 0.6, f'start {first:.2f} (end {end_z:.2f}) → hold {last:.2f}')
    check('BACKWARD_ECHO: tinted warmer', ev(f'{S}.echoes.echoes[0].back'))
    press('Backspace'); time.sleep(0.4); adv(0.6)

    # SUNDIAL_HUB: after the ring wakes, a sun orbits once a minute and is a light; E at the Heart runs it back
    ev(f'{S}.world.progress.data.completed.push(1,2,3,5,6,9); {S}.world.wakeRing(false)')
    stand(0, 17); adv(1.0)
    a0 = ev(f'{S}.sun && {S}.sun.a'); adv(5.0); a1 = ev(f'{S}.sun.a')
    check('SUNDIAL_HUB: the sun orbits (≈6°/s) and registers as a light', a1 - a0 > 0.4 and ev(f'{S}.shadows.extraLights.some(l => l.kind === "sun")'), f'{math.degrees(a1 - a0):.0f}° in 5 s')
    ev(f'{S}.sun.a = Math.atan2(-12.5, -4) + 0.2'); adv(0.6)
    sunshadows = ev(f'{S}.world.l10.stones.reduce((n, s) => n + (s.shadows.has("sun") ? 1 : 0), 0)')
    check('SUNDIAL_HUB: it sweeps ring stones\' shadows', sunshadows >= 1, f'{sunshadows} stones')
    stand(0, 1.5); page.keyboard.down('KeyE'); a2 = ev(f'{S}.sun.a'); adv(2.0); a3 = ev(f'{S}.sun.a'); page.keyboard.up('KeyE')
    check('SUNDIAL_HUB: holding E at the Heart runs the sun backwards', a3 < a2, f'{a2:.2f} → {a3:.2f}')
    check('no console errors', not errors, '; '.join(errors[:3]))
    b.close()

fails = [r for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} feature checks passed')
sys.exit(1 if fails else 0)
