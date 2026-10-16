# Test checklist (design bible §15)

✅ = verified by the automated tests (`tests/playthrough.py`, `tests/audio_check.py`, `tests/capture.py`) in headless Chromium with software WebGL.
👤 = must be checked by hand on a real machine (real GPU, mouse, speakers).

## Functional
- ✅ Title → Play starts a fresh Room 1 run; Controls and Credits overlays open and close
- ✅ W moves camera-forward; diagonal is normalised in code (`PlayerController`)
- ✅ Walls block the Keeper
- ✅ An inactive bridge is not walkable: stepping into the gap falls and respawns at the room spawn
- ✅ E ignites the nearest relic once (it shows the `[E] IGNITE RELIC` prompt first)
- ✅ Rooms 2–3: turning alone cannot solve the puzzle (collar), and rewind is required
- ✅ R rewinds to the remembered (echo) angle; releasing resumes turning; an empty history shows "NO RECENT MEMORY"
- ✅ Alignment raises the bridge; its collider turns on only when the bridge is ACTIVE
- ✅ Each bridge can be walked end to end without falling (walked with W, not teleported)
- ✅ Room 3 timer runs, pauses while the Keeper stands on the span, fades the span when it expires (with the collider off), and the relic slips
- ✅ Room 3 can be re-aligned with a rewind after the slip
- ✅ Each ember is awarded once (no double award)
- ✅ The finale triggers after Room 3 and victory is reached with 3/3 embers
- ✅ Play Again resets to Room 1 with 0 embers
- ✅ Esc pauses and the simulation is frozen; Resume returns to play
- ✅ Restart Room resets the relic (unlit) and keeps earned embers
- ✅ Main Menu returns to the title
- ✅ No console errors during the full run
- ✅ `npm run build` succeeds
- 👤 Mouse look feels right; pointer lock is captured on click; Esc releases it and pauses
- 👤 Window focus loss (Alt+Tab) pauses the game

## Visual and audio
- ✅ The Keeper, relic, shadow, target and bridge are readable in every room (`docs/screenshots`)
- ✅ Every synthesised sound renders without NaN or clipping (`tests/audio_check.py`)
- 👤 Frame rate on the target laptop at 1920×1080 (60 fps target; the game automatically lowers quality below about 35 fps)
- 👤 The UI fits at 1280×720 and 1920×1080
- 👤 The audio mix sounds right on speakers or headphones; loops don't stack after a restart; M mutes

## Release
- 👤 Two clean start-to-victory runs by a person in a fresh browser session
- 👤 The public GitHub repository has the source, docs and README, and `npm install && npm run dev` works from a fresh clone
- 👤 The trailer is exactly 3:00 with at least 2:00 of gameplay, and its Drive link opens in a private window
