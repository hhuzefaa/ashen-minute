# Ashen Minutes

*The temple remembers what the world has forgotten.*

A third-person puzzle adventure in **one connected ancient temple**, built in Three.js for a game jam with the themes **Fire, Shadow and Time**. You play Ilen, a former apprentice Keeper, who returns to relight the Heart Ember while the city below forgets itself. Six rooms, the Heart, an escape, six optional Lost Minutes, in-engine cutscenes and a complete story. The target for a first run is 15–20 minutes (not yet timed with real players).

![The Threshold: Ilen's lantern throws the stone's shadow onto the rune](docs/screenshots/I_threshold_shadow.png)

## You are the light

Ilen carries the only moving sun in a temple of sundials. The gnomon stones never turn — **you aim their shadows by walking**. Five rules govern everything, and the game teaches them by play, never by text:

1. **Every fire casts every nearby stone's shadow directly away from itself.** Ilen's lantern is a fire. (Step back and the shadow grows.)
2. **A shadow lying over the abyss is solid ground while it lasts.** (But you can never walk a shadow you cast yourself: to step on it you must pass the stone, and then the light — you — is on the wrong side.)
3. **A shadow that rests on a rune wakes it:** a gate opens, a bridge forms, fire is relayed, a Heart socket holds.
4. **A shadow that touches an unlit sconce sets it alight,** and a lit sconce is a new fire.
5. **Ilen can mark a minute.** Her **echo** walks that minute again carrying its own fire, holds the light for a while, then crumbles to ash.

| Theme | In play |
|---|---|
| **Fire** | Ilen's lantern and every sconce are lights. Kindle a sconce with **E**; it burns for 20 s. A shadow touching a sconce lights it, so fire runs along shadows. |
| **Shadow** | Cast by those fires, away from them. Walkable over the abyss, it wakes runes and lights sconces. Moving shadows carry you. |
| **Time** | **R** marks a minute; your echo replays it and holds its lantern up for 12 s — another light, standing where you can't. In the finale, two echoes stay forever: the price of the ending. |

![Room II: a sconce's shadow bridges the chasm](docs/screenshots/II_sconce_road.png)

## The temple

| Room | Introduces → twist |
|---|---|
| I · The Threshold | Walking swings the shadow → it falls short until you step *back* |
| II · The Loose Shadow | Your own shadow swings away as you step on it → kindle a sconce; the near one is too short, the far one reaches |
| III · Marrow's Rounds | Marrow's echo walks her rounds; her lantern sweeps a shadow across the gap → kindle the island sconce for the second gap |
| IV · The Kept Minute | Gain the echo; it holds a shadow while you cross → stand *on* your own past over the abyss to cast a second stone onto the door rune |
| V · The Fire Road | Sweep a shadow across a gallery of sconces → throw a shadow across the abyss onto a far sconce; its fire throws a road back to you |
| VI · The Mirror Hall | No lessons: relay, rail stone and echo across two gaps |
| The Heart of Minutes | Three sockets, three lights: Ilen and two echoes that never fade → **the Unmaking**, a run for the door as the shadows go home |

Three passages connect the wings, and shortcuts lead back to the Sanctuary (hub), whose six braziers wake as rooms are restored. Every gate is a real door; progress saves automatically (**Continue**). Optional: three inscriptions and **six Lost Minutes**, each hidden behind an extra-clever use of the rules.

![Room III: Marrow's echo sweeps the shadow across the gap](docs/screenshots/III_marrows_rounds.png)

Design and verification: [`docs/LEVEL_DESIGN.md`](docs/LEVEL_DESIGN.md) · Story: [`docs/STORY.md`](docs/STORY.md) · Trailer: [`docs/TRAILER_PLAN.md`](docs/TRAILER_PLAN.md)

## Controls

| Input | Action |
|---|---|
| W A S D | Move relative to the camera (you carry the light: walking moves every shadow) · **Shift** run |
| Mouse / wheel | Camera / camera distance (click the game to capture the mouse) |
| E | Kindle a sconce · slide a stone at its lever · read |
| R | Mark a minute · press again to let your echo walk it |
| Hold Q | Focus: every shadow's edge, and where each unlit sconce would cast |
| Space | Hop · advance dialogue |
| Backspace | Restart the current room (doors stay open) |
| Esc | Pause · skip cutscene |
| M | Mute |

## Running it

You need Node.js 18 or newer.

```bash
npm install
npm run dev        # open http://localhost:5173
npm run build      # production build in dist/ (static, deployable anywhere)
```

**Settings → Low / Medium / High** cover render scale, shadows, bloom, particles, the number of real lights, mouse sensitivity, invert-Y, camera assist and an FPS counter. `?lowfx` / `?highfx` force a preset.

## Technical notes

- **Shadows are computed, not rendered:** `ShadowSystem` gathers every light (Ilen's lantern, lit sconces, echoes, Marrow) and every stone in view, and each step computes each shadow's direction (straight away from the light), length (3 + 1.6·distance m, 3–16 m, 9 m reach), line of sight and wall clipping. Each shadow gets a pooled visual and a pooled dynamic collider you can stand on. The same function powers the game, the tests and the **light map** dev tool (`window.__ashen.debug.lightMap(id)`), which proves every room solvable and every twist un-bypassable from reachable floor.
- **Rules never lie:** a build-time check warns if any decorative fire stands within reach of a stone.
- **Fixed-step simulation** (≤ 1/30 s), no per-frame allocations in the shadow and echo loops, data-driven rooms in `src/world/levels.js`, procedural art and audio only.
- **Camera:** spring-arm third person with a 5-ray wall probe and an optional assist that looks down a little near a stone Ilen is shadowing (never takes yaw).
- **Tier 3 experiments** live behind flags in `src/game/Features.js` (all off).

```
src/game/    Game (states, Unmaking), ShadowSystem, LightPuzzle (rooms), Echo (echoes, Marrow),
             LightMap (dev tool), PlayerController, CameraController, CollisionWorld, LightPool,
             Features, Settings, UI, Audio, Effects
src/world/   levels.js (temple + six rooms, passages, the Heart), World.js, Progress.js (save v3)
src/story/   script.js (all text), Story.js (cutscenes, barks, hints, Lost Minutes)
src/objects/ procedural models: Keeper, Relic (gnomon stone), ShadowView, ShadowBridge, TargetRune,
             Gate, HeartEmber, EmberPickup, Environment kit
tests/       playthrough.py (whole game, 151 checks), features.py (Tier 3, 12 checks), perf.py, audio_check.py
```

## Testing

```bash
npm run build && npx vite preview --port 4173 &
python3 tests/playthrough.py     # needs Python Playwright
python3 tests/features.py
python3 tests/perf.py
python3 tests/audio_check.py
```

The playthrough sends **real keyboard events** and plays the whole game from the cold open to the victory screen: every room solved on foot, every Lost Minute found, the Unmaking run, plus rule checks (shadow direction, settle time, unwalkable own shadow, safe respawn < 1 s, burn-out warning and coyote hop, one echo at a time, no hop across any gap) and light-map bypass proofs. Latest result: **151/151**. See [`docs/TEST_CHECKLIST.md`](docs/TEST_CHECKLIST.md).

## Assets and licences

- **Code:** MIT.
- **Everything visual and audible** is generated by this repository's code at runtime. No third-party art or audio is used.
- **Fonts:** Cinzel and Inter, under the SIL Open Font License 1.1.
- **Libraries:** three.js and Vite, both MIT.

See [`docs/ASSETS_LICENSES.md`](docs/ASSETS_LICENSES.md).
