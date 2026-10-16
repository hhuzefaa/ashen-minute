"""
Deterministic full-quality screenshots (bloom + shadows) for visual review and the README.
The animation loop is stopped and the simulation is stepped manually, so slow software GL does
not matter. Puzzle states are reached through the same methods the game calls.

    python3 tests/capture.py --out docs/screenshots
"""
import argparse, os, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--url', default='http://localhost:4173/?nofallback')
ap.add_argument('--out', default='docs/screenshots')
ap.add_argument('--only', default='')
args = ap.parse_args()
os.makedirs(args.out, exist_ok=True)
G = 'window.__ashen'

SETUP = f'''
window.__step = (sec) => {{ const g={G}; const n=Math.round(sec*30); for (let i=0;i<n;i++) g.step(1/30); }};
window.__shot = () => {{ const g={G}; g.render(); }};
window.__goto = (room) => {{
  const g={G}; g.audio.init(); g.levels.newRun(); g.levels.load(room-1); g.levels.emberCount = room-1;
  g.ui.setEmbers(room-1); g.player.keeper.setEmberLevel(room-1); g.setWarmth(room-1); g.warmth = (room-1)/4;
  g.state='playing'; g.ui.show('hud'); g.ui.hideCard(); g.ui.fadeTo(0, 0.01);
}};
window.__stand = (dist, side, camOff=0, pitch=0.3) => {{
  const g={G}, p=g.levels.puzzle, b=p.relic.base;
  const fx=-Math.sin(p.targetYaw), fz=-Math.cos(p.targetYaw);
  const rx=Math.cos(p.targetYaw), rz=-Math.sin(p.targetYaw);
  g.player.pos.set(b.x - fx*dist + rx*side, 0, b.z - fz*dist + rz*side); g.player.vel.set(0,0,0);
  g.player.facing = p.targetYaw;
  g.cameraCtl.yaw = p.targetYaw + camOff; g.cameraCtl.pitch = pitch; g.cameraCtl.first = true;
}};
'''

def snap(page, name, settle=0.6):
    page.evaluate(f'window.__step({settle})')
    page.evaluate('window.__shot()')
    time.sleep(0.2)
    page.screenshot(path=os.path.join(args.out, name + '.png'))
    print('saved', name, flush=True)

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = b.new_page(viewport={'width': 1280, 'height': 720})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(args.url)
    page.wait_for_function(f'{G} && {G}.state === "title"', timeout=60000)
    time.sleep(1.5)
    page.evaluate(f'{G}.renderer.setAnimationLoop(null)')
    page.evaluate(SETUP)
    want = lambda n: not args.only or n in args.only.split(',')

    if want('title'):
        page.evaluate('window.__step(2.5)')
        snap(page, 'title')

    if want('r1'):
        page.evaluate('window.__goto(1)'); page.evaluate(f'{G}.ui.hideCard()')
        page.evaluate(f'{G}.cameraCtl.first=true'); snap(page, 'room1_spawn', 1.0)
        page.evaluate('window.__stand(1.6, 0.4)'); snap(page, 'room1_unlit', 0.8)
        page.evaluate(f'{G}.levels.puzzle.ignite()'); page.evaluate('window.__step(1.6)')
        snap(page, 'room1_lit', 0.6)
        page.evaluate(f'(()=>{{const p={G}.levels.puzzle; p.relic.yaw=p.targetYaw+0.12;}})()')
        snap(page, 'room1_near', 0.4)
        page.evaluate(f'(()=>{{const p={G}.levels.puzzle; p.relic.yaw=p.targetYaw; p.checkAlignment();}})()')
        snap(page, 'room1_bridge', 1.4)
        page.evaluate(f'''(()=>{{const g={G}, br=g.levels.puzzle.bridge; const m=br.group.position; g.player.pos.set(m.x,0,m.z+1.4); g.cameraCtl.yaw=br.yaw+0.5; g.cameraCtl.pitch=0.45; g.cameraCtl.first=true;}})()''')
        snap(page, 'room1_on_bridge', 0.8)

    if want('r2'):
        page.evaluate('window.__goto(2)')
        page.evaluate('window.__stand(1.7, 0.6, 0.15)')
        page.evaluate(f'{G}.levels.puzzle.ignite()'); page.evaluate('window.__step(2.6)')
        snap(page, 'room2_after_jolt', 0.5)
        page.evaluate(f"{G}.input.down.add('KeyR')")
        page.evaluate('window.__step(0.75)')
        page.evaluate('window.__shot()'); time.sleep(0.2)
        page.screenshot(path=os.path.join(args.out, 'room2_rewinding.png')); print('saved room2_rewinding')
        page.evaluate(f"{G}.input.down.delete('KeyR')"); page.evaluate('window.__step(0.1)')
        page.evaluate(f"{G}.input.down.add('KeyQ')"); page.evaluate('window.__step(0.3)')
        page.evaluate('window.__shot()'); time.sleep(0.2)
        page.screenshot(path=os.path.join(args.out, 'room2_focus.png')); print('saved room2_focus')
        page.evaluate(f"{G}.input.down.delete('KeyQ')")
        page.evaluate(f'(()=>{{const p={G}.levels.puzzle; p.endRewind(); p.relic.yaw=p.targetYaw; p.checkAlignment();}})()')
        page.evaluate(f'''(()=>{{const g={G}; g.cameraCtl.yaw += 0.35; g.cameraCtl.pitch=0.55; }})()''')
        snap(page, 'room2_bridge', 1.4)

    if want('r3'):
        page.evaluate('window.__goto(3)')
        page.evaluate(f'{G}.cameraCtl.first=true'); snap(page, 'room3_spawn', 1.0)
        page.evaluate('window.__stand(1.8, 0.7, 0.1, 0.25)')
        page.evaluate(f'{G}.levels.puzzle.ignite()'); page.evaluate('window.__step(3.4)')
        page.evaluate(f'(()=>{{const p={G}.levels.puzzle; p.relic.yaw=p.targetYaw; p.checkAlignment();}})()')
        page.evaluate('window.__step(5.6)')
        snap(page, 'room3_warning', 0.1)
        page.evaluate(f'''(()=>{{const g={G}, e=g.levels.puzzle.ember.base; g.player.pos.set(e.x,0,e.z+0.3);}})()''')
        page.evaluate('window.__step(0.1)')
        page.evaluate('window.__step(2.6)'); snap(page, 'finale_embers', 0.1)
        page.evaluate('window.__step(2.0)'); snap(page, 'finale_heart', 0.1)
        page.evaluate('window.__step(4.0)'); snap(page, 'victory', 0.1)
    print('errors:', errs)
    b.close()
