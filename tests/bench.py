"""
Before/after benchmark for the optimisation pass (tests/perf.py measures single frames; this one
averages). For each viewpoint: CPU per simulation step (avg of 300 steps), CPU of the per-frame
bookkeeping outside the step (light pool + gamepad poll), draw calls and triangles, and JS heap
growth over 300 steps (a proxy for per-frame allocation; GC can only make it smaller).
Then: how many times the 3D scene is re-rendered during 3 s of real-time pause.

    python3 tests/bench.py [url]
"""
import json, sys, time
from playwright.sync_api import sync_playwright

G = 'window.__ashen'
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/?test'
SPOTS = [('entrance', 0, 72, 0), ('hub', 0, 18, 0), ('L2', -38, 0, 1.57), ('L6', -2, -66, 0), ('L9', 57, 30, 3.14)]
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'])
    pg = b.new_page(viewport={'width': 960, 'height': 540})
    pg.goto(URL)
    pg.wait_for_function(f'{G} && {G}.state === "title"', timeout=120000)
    pg.evaluate(f'{G}.renderer.setAnimationLoop(null)')
    pg.evaluate(f"{G}.world.progress.data.started = true; {G}.state = 'playing'; {G}.ui.show('hud');")
    out = {}
    for name, x, z, yaw in SPOTS:
        r = pg.evaluate(f'''(() => {{
          const g = {G}; g.placePlayer({x}, {z}, {yaw});
          for (let i = 0; i < 30; i++) g.step(1/30);
          const focus = g.player.pos;
          const poll = () => {{ if (g.pauseMenu) {{ g.pauseMenu.poll(1/60); g.victoryMenu.poll(1/60); }} }};
          window.gc && window.gc();
          const h0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
          let t0 = performance.now();
          for (let i = 0; i < 300; i++) g.step(1/30);
          const cpu = (performance.now() - t0) / 300;
          const h1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
          t0 = performance.now();
          for (let i = 0; i < 300; i++) {{ g.lightPool.update(focus); poll(); }}
          const book = (performance.now() - t0) / 300 * 1000;
          g.renderer.info.reset(); g.render();
          const info = g.renderer.info.render;
          return {{ cpu, book, calls: info.calls, tris: info.triangles, heapKB: (h1 - h0) / 1024 }};
        }})()''')
        out[name] = r
        print(f"{name:9s} step {r['cpu']:.3f} ms | bookkeeping {r['book']:.1f} µs | {r['calls']} calls | {r['tris']/1000:.1f}k tris | heap +{r['heapKB']:.0f} KB / 300 steps", flush=True)
    # pause: real-time loop, count scene renders in 3 s
    pg.evaluate(f'''(() => {{ const g = {G}; g.placePlayer(0, 56, 0); g.state = 'playing';
      window.__renders = 0; const r = g.render.bind(g); g.render = () => {{ window.__renders++; r(); }};
      g.renderer.setAnimationLoop(() => g.frame()); }})()''')
    time.sleep(1.0)
    pg.evaluate(f'{G}.pause(); window.__renders = 0;')
    time.sleep(3.0)
    n = pg.evaluate('window.__renders')
    fr = pg.evaluate(f'{G}.fps.shown')
    print(f'paused 3 s: {n} scene renders (loop at ~{fr:.0f} fps under SwiftShader)')
    out['pausedRenders'] = n
    b.close()
    print(json.dumps(out))
