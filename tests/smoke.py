"""Quick smoke test: page loads, title appears, New Game plays the opening, Esc skips into play."""
import sys, time
from playwright.sync_api import sync_playwright

G = 'window.__ashen'
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/?test&lowfx'
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 640, 'height': 360})
    errs = []
    pg.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    pg.goto(URL)
    try:
        pg.wait_for_function(f'{G} && {G}.state === "title"', timeout=90000)
    except Exception:
        print('NO TITLE', errs[:10]); sys.exit(1)
    print('title ok:', pg.evaluate(f'{G}.collision.colliders.length'), 'colliders,', pg.evaluate(f'{G}.world.puzzles.length'), 'puzzles')
    pg.evaluate(f"localStorage.clear(); {G}.onAction('new-game')")
    time.sleep(4)
    print('state:', pg.evaluate(f'{G}.state'), 'scene:', pg.evaluate(f'{G}.story.scene && {G}.story.scene.id'))
    pg.keyboard.press('Escape'); time.sleep(3)
    print('after skip:', pg.evaluate(f'{G}.state'), 'override:', pg.evaluate(f'!!{G}.cameraCtl.override'))
    pg.screenshot(path=sys.argv[2] if len(sys.argv) > 2 else 'smoke.png')
    print('console:', errs[:15])
    b.close()
    sys.exit(1 if any('PAGEERR' in e or e.startswith('error') for e in errs) else 0)
