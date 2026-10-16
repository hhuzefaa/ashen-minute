"""
Full-quality screenshots (bloom + shadows) of key places for visual review / README.
The render loop is stopped and the simulation stepped manually.

    python3 tests/capture.py --out docs/screenshots [--only title,hub,...]
"""
import argparse, math, os, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--url', default='http://localhost:4173/?test&highfx')
ap.add_argument('--out', default='docs/screenshots')
ap.add_argument('--only', default='')
ap.add_argument('--w', type=int, default=1280)
ap.add_argument('--h', type=int, default=720)
args = ap.parse_args()
os.makedirs(args.out, exist_ok=True)
G = 'window.__ashen'

# name: (setup js, player x, z, camera yaw, pitch, seconds to settle)
SHOTS = {
    'title': None,
    'entrance': ('', 0, 70, 0, 0.25, 0.6),
    'L1_lit': ('lit:1:A', -2.5, 53.8, 0.2, 0.35, 1.5),
    'L1_bridge': ('solve:1', -1.2, 50, 0.1, 0.45, 2.0),
    'hub': ('', -16, 16, -0.75, 0.3, 0.8),
    'hub_ring': ('ring', 0, -15, 3.14, 0.35, 1.0),
    'L2_echo': ('lit:2:A', -38.4, 3.6, 1.35, 0.35, 3.0),
    'L4_rail': ('lit:4:A', -63, -69, 0.3, 0.5, 1.5),
    'L6_relay': ('solve:6:r', -9, -63.5, 2.2, 0.35, 3.0),
    'L7_cross': ('', 27, -88, -1.2, 0.4, 0.8),
    'L8_span': ('solve:8', 44, -5, -1.4, 0.35, 2.0),
    'L9_hall': ('', 60, 29, 2.5, 0.4, 0.8),
}

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = b.new_page(viewport={'width': args.w, 'height': args.h})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(args.url)
    page.wait_for_function(f'{G} && {G}.state === "title"', timeout=120000)
    page.evaluate(f'''(() => {{
      const g = {G}; g.renderer.setAnimationLoop(null);
      window.__step = (s) => {{ for (let i = 0; i < Math.round(s*30); i++) g.step(1/30); g.lightPool.update(g.player.pos); }};
      window.__shot = () => {{ g.renderer.info.reset(); g.render(); }};
    }})()''')
    want = lambda n: not args.only or n in args.only.split(',')
    for name, spec in SHOTS.items():
        if not want(name):
            continue
        if spec is None:
            page.evaluate('window.__step(3)')
        else:
            setup, x, z, yaw, pitch, settle = spec
            page.evaluate(f'''(() => {{
              const g = {G}; g.audio.init();
              g.world.progress.data.started = true;
              for (const k of ['hub_first','card_10','opening','enter_4','enter_7','enter_9']) g.world.progress.mark('story', k);
              for (let i = 1; i <= 9; i++) g.story.relicLinesPlayed.add(i);
              g.state = 'playing'; g.ui.show('hud'); g.ui.hideCard(); g.ui.fadeTo(0, 0.01);
              g.placePlayer({x}, {z}, {yaw}); g.cameraCtl.pitch = {pitch};
            }})()''')
            page.evaluate('window.__step(0.5)')
            if setup.startswith('lit:') or setup.startswith('solve:'):
                parts = setup.split(':')
                lvl = int(parts[1])
                page.evaluate(f'''(() => {{
                  const g = {G}, p = g.world.levelById.get({lvl});
                  const rs = [...p.relics.values()][0]; p.ignite(rs);
                }})()''')
                page.evaluate('window.__step(2.2)')
                if setup.startswith('solve:'):
                    rid = parts[2] if len(parts) > 2 else None
                    page.evaluate(f'''(() => {{
                      const g = {G}, p = g.world.levelById.get({lvl});
                      for (const ru of p.runes.values()) {{
                        if ({'true' if rid else 'false'} && ru.spec.id !== '{rid}') continue;
                        const rs = p.relics.get(ru.spec.relics[0]); if (!rs) continue;
                        if (!rs.relic.lit) p.ignite(rs); rs.jolt = null;
                        rs.relic.yaw = p.aimYawFor(rs, ru); p.satisfy(rs, ru); break;
                      }}
                    }})()''')
            if setup == 'ring':
                page.evaluate(f'{G}.world.wakeRing(false)')
            page.evaluate(f'{G}.placePlayer({x}, {z}, {yaw}); {G}.cameraCtl.pitch = {pitch};')
            page.evaluate(f'window.__step({settle})')
            page.evaluate(f'{G}.ui.hideCard(); {G}.ui.hideSubtitle(); {G}.story.barkQueue.length = 0;')
            page.evaluate('window.__step(0.9)')
        page.evaluate('window.__shot()')
        time.sleep(0.15)
        page.screenshot(path=os.path.join(args.out, name + '.png'))
        info = page.evaluate(f'[{G}.renderer.info.render.calls, {G}.renderer.info.render.triangles]')
        print(f'saved {name}  ({info[0]} draw calls, {info[1]//1000}k tris incl. shadow + bloom passes)', flush=True)
    print('errors:', errs)
    b.close()
