"""Render every synthesized sound offline and report peak / RMS so silent or clipping cues are caught."""
import json, sys
from playwright.sync_api import sync_playwright
NAMES = ['sfx_relic_ignite','sfx_shadow_align','sfx_bridge_form','sfx_bridge_warning','tick','sfx_bridge_fade','sfx_ember_collect',
         'sfx_heart_ignite','sfx_ui_click','sfx_no_memory','sfx_fall','step','sfx_door','whoosh','sfx_shadow_crack','sfx_echo_mark','sfx_echo_release','sfx_echo_crumble','sfx_stone_thud','ui_move','ui_confirm','ui_wake']
LOOPS = ['amb_fire_crackle','near_tone','__ambience']
JS = '''async ([name, isLoop]) => {
  const AM = window.__ashen.audio.constructor;
  const off = new OfflineAudioContext(2, 48000*4, 48000);
  const a = new AM(); a.init(off);
  if (name !== '__ambience') a.amb.gain.value = 0;
  if (name === 'amb_fire_crackle') { await AM.loadFire(off); a.fire = await AM.loadFire(off); a.fireLevel = 1; }
  if (isLoop && name !== '__ambience') { a.startLoop(name); if (name==='near_tone') a.loops[name].gain.gain.value = 0.05; }
  else if (!isLoop) a.play(name);
  const buf = await off.startRendering();
  let peak=0, sum=0, nan=0; const d=buf.getChannelData(0);
  for (let i=0;i<d.length;i++){ const v=d[i]; if (Number.isNaN(v)) nan++; peak=Math.max(peak,Math.abs(v)); sum+=v*v; }
  return {peak, rms: Math.sqrt(sum/d.length), nan};
}'''
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width':320,'height':180})
    pg.goto(sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/?lowfx')
    pg.wait_for_function('window.__ashen', timeout=60000)
    bad = 0
    for n in NAMES + LOOPS:
        r = pg.evaluate(JS, [n, n in LOOPS])
        ok = r['nan'] == 0 and 0.005 < r['peak'] <= 1.0
        bad += not ok
        print(f"{'OK ' if ok else 'BAD'} {n:22s} peak={r['peak']:.3f} rms={r['rms']:.4f}")
    b.close()
    sys.exit(1 if bad else 0)
