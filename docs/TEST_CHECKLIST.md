# Test checklist

✅ = verified automatically by `tests/playthrough.py` (120 checks, real keyboard events, deterministic stepping), `tests/audio_check.py` or `tests/perf.py`.
👤 = needs a person on real hardware.

## Controls and camera (manual checklist, with automated coverage where possible)
- ✅ W, S, A and D each move in the correct camera-relative direction at camera yaws of 0°, 90°, 180° and −90° (16 checks)
- ✅ Diagonal speed equals straight speed (3.70 = 3.70)
- ✅ The camera follows the Keeper (distance stays between 2 and 6 m while walking)
- ✅ The camera pulls in front of a wall instead of passing through it
- ✅ Losing window focus pauses the game and releases held keys; Resume restores play
- ✅ A sealed gate blocks the Keeper
- ✅ Cutscenes: Space advances, Esc skips, and control plus the follow camera return afterwards
- 👤 Mouse look feels right; pointer lock is captured on click; Esc releases the mouse and pauses
- 👤 Mouse wheel zoom, Shift run, and the Q focus overlay
- 👤 Walk the camera through narrow corridors, past hub pillars, and around the island edges

## World and progression
- ✅ L1 gate → gallery → hub on foot; hub arrival scene
- ✅ Hub west gate → L2 → L3 → L4 on foot through each opened gate
- ✅ L4 → west shortcut corridor → hub
- ✅ Hub north gate → L5 → L6 (through the inner gate) → L7
- ✅ L7 door → north shortcut → hub
- ✅ Hub east gate → L8 (through the inner gate) → L9 → east shortcut → hub
- ✅ Each ember is awarded once; 10/10 at the end; Continue is offered from the save
- 👤 Reload the page mid-game, choose **Continue**, and check that opened gates and solved levels persist

## Puzzles (all solved with real input)
- ✅ I–X each solved end to end, every bridge walked with W, no falls
- ✅ II: the collar alone cannot solve it; rewind returns to the echo
- ✅ IV: the wrong socket cannot solve it (length mismatch); the lever slides the relic
- ✅ V: rewinding through the answer does not solve it; the rune blinks; Backspace restarts; stopping near the answer and nudging solves it
- ✅ VI: the cold relic refuses E; the relay lights it and opens the inner gate
- ✅ VII: cold relics refuse without a flame; a decoy's shadow is rejected on the door rune; the eye relic opens the door
- ✅ VIII: the timed span runs; the timer pauses while on the span; on expiry the span fades with collider off and the relic slips; rewind restores it; then it is crossed
- ✅ IX: relay chain A → B → C; island rail; 7 s span
- ✅ X: all three sockets held at once → final span → finale → victory

## Audio / visual / performance
- ✅ Every synthesised sound renders without NaN or clipping
- ✅ Draw calls and triangles per area measured (`docs/PERFORMANCE.md`)
- 👤 Real FPS at Low / Medium / High on the target laptop (Settings → Show FPS)
- 👤 Two complete runs by a person in a clean browser profile

## Redesign ("You are the light") — status on branch `redesign`
Rooms I and II now run on the five rules (stones cast shadows away from every fire, Ilen's lantern is a fire, shadows over the abyss are solid, runes wake under a settled shadow, shadows light sconces). Rooms III–X still run the old dial puzzles until Phase 6.

Automated (`tests/playthrough.py`, light map `window.__ashen.debug.lightMap(id)`):
- ✅ Rule 1 truthfulness check: no decorative brazier within 9 m of a stone
- ✅ I: the shadow follows the lantern (yaw error < 2°); stepping back lengthens it; too short near the stone; walking past the zone doesn't trigger (0.4 s settle); standing in the zone wakes the rune; the stone glows gold; bridge walked on foot
- ✅ II: Ilen's own shadow lies across the chasm but can't be walked (fall, never on it); respawn at last safe ground in < 1 s; near sconce's shadow stops at the edge and walking off it drops you; far sconce's shadow crosses (light map + on foot); ≥ 0.9 s warning when a fire dies under you; coyote hop; rule 4 (your shadow re-lights a sconce on its line)

## Human playtest 8.3 (run after Phase 3, and again before freeze)
Setup: `npm run build && npx vite preview`, open the URL, **New Game**, press Esc to skip the opening. Three people, one at a time; play silently, **no hints from the watcher**. Stop each person after Room II (the Room II far door) — Rooms III+ are still the old design.

Watch and note for each player:
1. Seconds until they show they understand "I am the light" in Room I (they walk around the stone *on purpose* to swing the shadow). Target: < 60 s.
2. Did they step back to lengthen the shadow, or did they wander until it happened?
3. Room II: did they try to walk onto their own shadow? What did they do after falling?
4. Which sconce did they kindle first? How long until they tried the second one?
5. Did anyone circle the stone just to watch the shadow (good sign)?
6. Any place they were stuck > 2 minutes, any moment they were confused by the camera, any shadow they couldn't see.

| Tester | Room I "I'm the light" (s) | Room I solved (s) | Tried own shadow? | Room II solved (s) | Stuck > 2 min where | Notes |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
