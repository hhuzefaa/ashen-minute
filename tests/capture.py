"""
Screenshots of the redesign's key moments (High preset, 960×540) into docs/screenshots/ or a folder:
Room III (Marrow's sweep), Room IV (echo holding a shadow), Room V (the lit gallery), the Heart (two echoes).

    npm run build && npx vite preview --port 4173 &
    python3 tests/capture.py [out_dir]
"""
import math, os, sys, time
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else 'docs/screenshots'
os.makedirs(OUT, exist_ok=True)
S = 'window.__ashen'; P = f'{S}.world.activePuzzle'
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = b.new_page(viewport={'width': 960, 'height': 540})
    page.goto('http://localhost:4173/?test&highfx')
    page.wait_for_function(f'{S} && {S}.state === "title"', timeout=120000)
    ev = page.evaluate
    ev(f'''(() => {{ const g={S}; g.renderer.setAnimationLoop(null);
      window.__adv=(sec)=>{{ const n=Math.max(1,Math.round(sec*30)); for(let i=0;i<n;i++){{ g.step(1/30); if(i===0) g.input.pressed.clear(); }} g.input.endFrame(); }}; }})()''')
    adv = lambda t: ev(f'window.__adv({t})')
    def press(k, hold=0.1): page.keyboard.down(k); adv(hold); page.keyboard.up(k); adv(1/30)
    def stand(x, z, yaw=0): ev(f'{S}.player.pos.set({x},0,{z}); {S}.player.vel.set(0,0,0); {S}.player.facing={yaw}; {S}.cameraCtl.yaw={yaw}'); adv(1/30)
    def walk(x, z, t=5):
        page.keyboard.down('KeyW')
        for _ in range(int(t * 10)):
            if ev(f'(() => {{ const g={S}, dx={x}-g.player.pos.x, dz={z}-g.player.pos.z; g.cameraCtl.yaw=Math.atan2(-dx,-dz); return Math.hypot(dx,dz); }})()') < 0.5: break
            adv(0.1)
        page.keyboard.up('KeyW'); adv(0.15)
    def shot(name, yaw, pitch):
        ev(f'{S}.cameraCtl.yaw={yaw}; {S}.cameraCtl.pitch={pitch}'); adv(0.6)
        ev(f'{S}.lightPool.update({S}.player.pos); {S}.render()'); time.sleep(0.2)
        page.screenshot(path=os.path.join(OUT, name + '.png')); print('saved', name)
    ev(f"localStorage.clear(); {S}.world.progress.reset(); {S}.onAction('new-game')"); time.sleep(0.8); adv(0.5)
    for _ in range(4):
        if ev(f'{S}.state') == 'cutscene': press('Escape'); adv(0.5)
    ev(f'{S}.world.progress.data.story.push("hub_first"); {S}.world.progress.data.abilities.echo = true;'
       f'for (const id of {S}.world.gates.keys()) {S}.world.gates.get(id).setOpenInstant(true)')
    stand(-58, -29); adv(0.5)
    for _ in range(300):
        adv(0.1)
        if ev(f'(() => {{ const s={P}.stoneById.get("A").shadows.get("marrow"); return s && s.alive && s.uz < -0.95; }})()'): break
    shot('III_marrows_rounds', 0.25, 0.55)
    stand(0, -36); adv(0.4); press('KeyR'); walk(-8, -39); press('KeyR'); adv(4)
    stand(-3.5, -43.5, 0.6); shot('IV_kept_minute', 0.9, 0.5)
    press('Backspace'); time.sleep(0.4); adv(0.5)
    stand(-5.2, -64.2, 0); page.keyboard.down('KeyW')
    for _ in range(80):
        ev(f'{S}.cameraCtl.yaw=0'); adv(1/30)
        if ev(f'{S}.player.pos.z') < -73: break
    page.keyboard.up('KeyW'); adv(1.0)
    stand(-3, -64, 0.6); shot('V_fire_road', 0.9, 0.45)
    b.close()
