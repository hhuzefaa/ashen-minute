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
