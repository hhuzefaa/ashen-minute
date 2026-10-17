# Test checklist

✅ = verified automatically: `tests/playthrough.py` (**151/151**, real keyboard events, deterministic 1/30 s stepping, the whole game from cold open to victory), `tests/title_menu.py` (**63/63**, title → menu transition and every menu action), `tests/endgame_continue.py` (**48/48**), `tests/tutorial_ending.py` (**78/78**), `tests/features.py` (**12/12**, Tier 3 flags on), `tests/audio_check.py`, `tests/perf.py`.
👤 = needs a person on real hardware.

## Completion, play clock, Continue and saves, pause menu, fire (`tests/endgame_continue.py`)
- ✅ Fresh launch: no resumable run, Continue not shown, menu re-centred on 4 buttons
- ✅ Old finished save (no `finished` flag) is treated as finished; old unfinished save resumes with the counter from rooms only (3/6, not 4/6 = the 7/6 bug); garbage and corrupt saves are sanitised
- ✅ New Game → Pause → Main Menu → Continue resumes the same run; the play clock counts play only (pause, menus and fades excluded) and survives a relaunch
- ✅ Pause: every action present (Resume, Restart Puzzle, Return to Checkpoint, Settings, Main Menu, Quit Game) and working; arrow-key navigation; inert under Settings; world, game time and play clock frozen; movement keys work again after resuming
- ✅ Completion: shown once, time as M:SS (H:MM:SS past an hour), clock stopped; Return to Main Menu (Continue then not offered) and Restart Game (fresh run: progress, flags, clock, finale objects all reset; cold open plays)
- ✅ Fire ambience: two recorded loops play once a sconce is lit; full level beside a fire, silent far away
- 👤 Listening test of the new fire sound on real speakers / headphones (it was only measured here)

## Training court and the Heart ending (`tests/tutorial_ending.py`)
- ✅ New Game → Play / Skip Tutorial (after "Begin a new journey?" when a save exists); same button size as the main menu; arrows, Enter, Esc back
- ✅ Skip = the existing New Game; Continue never shows the choice; Restart Game and pause never show it
- ✅ The whole court on foot with real input: look, walk, run, hop the column (blocked without a hop), swing a shadow onto a rune, kindle, cross on a sconce's shadow, mark/release/hold an echo, cross on the echo's shadow, Focus, the wrong sconce explains itself, the lever, the arch → Training Complete
- ✅ R does nothing before the echo section; a fall is safe and says so; Backspace restarts only the current section; Restart Tutorial / Skip Tutorial / Main Menu from the court's pause
- ✅ The court writes nothing to the save, the play clock doesn't run, the story's echo is never granted; an existing journey survives leaving the court and is replaced only when the story begins
- ✅ Ending: embers land during the dialogue → ending right after "Go home, Keeper."; last line before the last ember → the scene waits, then ends the moment it lands; Esc while embers fly still waits; control never returns, the Keeper never moves, victory fires once, clock frozen, completion options work
- 👤 How the tutorial reads and paces for a first-time player

## Title screen and main menu (`tests/title_menu.py`)
- ✅ Launch shows the Sanctuary, the centred title and the prompt; the menu is hidden; the hub braziers kindle
- ✅ Any key starts the transition (the mute key does not); input during it is ignored and cannot restart it
- ✅ The same DOM title node moves up and scales down monotonically; the prompt fades; buttons kindle in after it
- ✅ Buttons: artwork ratio 1092:400 kept, one size, one centre axis, even spacing, below the title, on screen; resize keeps all of it
- ✅ Continue is unavailable without a save (skipped by keys, not selectable by hover, a click says why); available and selected first with a save
- ✅ Arrow keys / W S / Home, mouse hover + click; exactly one selected button; pressed state shows the clicked art
- ✅ Settings → Controls → Back → Settings → Back; Credits; Quit farewell and return; New Game asks first when a save exists (Esc keeps it)
- ✅ New Game reaches the cold open with the title dressing undone; Continue resumes at the checkpoint; Main Menu from pause skips the splash
- 👤 Gamepad navigation (no pad in the headless runner); feel of the transition timing on real hardware

## Controls, camera, flow
- ✅ Cold open hands over control in < 30 s of game time; Space advances dialogue; Esc skips a cutscene and returns control with the follow camera
- ✅ W, S, A, D move camera-relative at yaws 0°, 90°, 180°, −90° (16 checks); diagonal speed equals straight speed
- ✅ Camera follows (2–6 m) and pulls in front of walls; focus loss pauses and releases held keys
- ✅ A sealed gate blocks the Keeper
- ✅ No gap can be hopped (a running coyote hop at Room I's 3.5 m gap falls)
- 👤 Mouse feel, pointer lock, wheel zoom, camera assist near stones (Settings toggle)

## The rules
- ✅ Rule 1 is truthful: no decorative fire within 9 m of any stone (build-time check)
- ✅ The shadow follows the lantern (yaw error < 2°) and lengthens when Ilen steps back
- ✅ Runes need 0.4 s under the same shadow: walking past does not trigger; standing does; the stone glows gold
- ✅ Ilen's own shadow can't be walked: walking at it, she never stands on it and falls; respawn on the last safe floor in < 1 s
- ✅ A sconce's shadow over the abyss holds you; walking off a short one drops you
- ✅ A dying fire gives ≥ 0.9 s of warning before its shadow drops you; a coyote hop still works then
- ✅ Rule 4 also holds for Ilen: standing on a sconce's line, her own shadow re-lights it
- ✅ Echoes: R does nothing before the grant; R marks a minute; falling cancels it; R dismisses (one at a time); Backspace clears; the echo holds its light and its shadow carries you
- ✅ Hints on demand after 60 s without progress; Focus (Q) shows sconce previews
- ✅ Lock feedback, relay trails, burn-down visuals (code paths exercised by the playthrough)

## Rooms (all solved on foot with real input)
- ✅ I: light map zone only behind the stone; bridge walked
- ✅ II: near sconce too short; far sconce's road crossed
- ✅ III: Marrow's patrol gives 2 windows a loop (light-map simulation, 25–45 % of the time); her sweep never lights the island sconce over a full loop; crossed on her shadow; island sconce → second gap
- ✅ IV: no floor position can wake the door rune (light map: 0); echo holds A's shadow; standing on it over the abyss wakes the door
- ✅ V: the door rune can't be woken from reachable floor (light map); one sweep lights the gallery in order; the far fire throws the road back; crossed
- ✅ VI: relay through the grille; rail slide; echo-held crossing
- ✅ Heart: w and e reachable from the walkway (light map); two permanent echoes + Ilen hold all three → final span → finale
- ✅ Ending at the Heart: the finale hands straight to the ending (control never returns, the Keeper never moves) and the completion screen follows; victory with stats
- ✅ Passages: bridges pre-formed; shortcuts lead home
- ✅ Lost Minutes 1–6 each found with the intended trick (LM3's ride is checked by standing on Marrow's shadow at the fragment while it passes; LM4's chain: only the first sconce reachable)

## Saves and menus
- ✅ Main menu returns to the title; Continue is offered from the save (save v3)
- 👤 Reload mid-game and Continue: rooms, gates, echo ability and Lost Minutes persist

## Audio / visual / performance
- ✅ Every cue renders non-silent (`audio_check.py`, includes the new echo, crumble, crack and thud cues)
- ✅ Draw calls / triangles per area within the previous budget (`perf.py`, see PERFORMANCE.md)
- 👤 Frame rate on real hardware at Low / Medium / High; readability with bloom off (Low)

## Human playtest 8.3 (run after Phase 3, and again before freeze)
Setup: `npm run build && npx vite preview`, open the URL, **New Game**, press Esc to skip the opening. Three people, one at a time; play silently, **no hints from the watcher**. Rooms I–II answer the first questions; the whole game can now be played (watch where they stall in III–VI).

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
