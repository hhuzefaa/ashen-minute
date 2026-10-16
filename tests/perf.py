"""
CPU/GPU cost probe at fixed viewpoints. Stops the animation loop and measures, per viewpoint:
simulation step time (CPU), render time (with gl.finish), draw calls and triangles.
Software WebGL (SwiftShader) is ~50-100x slower than a real GPU, so absolute render ms are
only useful for *relative* comparisons between settings/viewpoints. Draw calls / triangles and
CPU step time are hardware-independent enough to report.
"""
import json, sys, time
from playwright.sync_api import sync_playwright

G = 'window.__ashen'
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/?test'
SPOTS = [('entrance', 0, 72, 0), ('L1', 0, 56, 0), ('hub', 0, 18, 0), ('hub-west', -18, 0, 1.57), ('L2', -38, 0, 1.57),
         ('L4', -55, -70, 0), ('L6', -2, -66, 0), ('L7', 30, -88, -1.57), ('L8', 34, 0, -1.57), ('L9', 57, 30, 3.14)]
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 960, 'height': 540})
    pg.goto(URL)
    pg.wait_for_function(f'{G} && {G}.state === "title"', timeout=120000)
    pg.evaluate(f'{G}.renderer.setAnimationLoop(null)')
    pg.evaluate(f"{G}.world.progress.data.started = true; {G}.state = 'playing'; {G}.ui.show('hud');")
    rows = []
    for name, x, z, yaw in SPOTS:
        r = pg.evaluate(f'''(() => {{
          const g = {G}; g.placePlayer({x}, {z}, {yaw});
          for (let i = 0; i < 20; i++) g.step(1/30);
          g.lightPool.update(g.player.pos);
          const gl = g.renderer.getContext();
          g.render(); gl.finish();
          let t0 = performance.now(); for (let i = 0; i < 30; i++) g.step(1/30); const cpu = (performance.now() - t0) / 30;
          g.renderer.info.reset(); t0 = performance.now(); g.render(); gl.finish(); const gpu = performance.now() - t0;
          const info = g.renderer.info.render;
          const vis = g.world.zones.filter(z => z.group.visible).map(z => z.key).join(',');
          return {{ cpu, gpu, calls: info.calls, tris: info.triangles, vis }};
        }})()''')
        rows.append((name, r))
        print(f"{name:10s} step {r['cpu']:.2f} ms | render {r['gpu']:.0f} ms (swiftshader) | {r['calls']} calls | {r['tris']/1000:.0f}k tris | zones: {r['vis']}", flush=True)
    b.close()
