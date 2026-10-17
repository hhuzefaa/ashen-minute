# Level design — "You are the light"

Coordinates: x = east, −z = north, 1 unit = 1 m; every floor's top is y = 0. All numbers below are the ones in `src/world/levels.js` and `src/game/ShadowSystem.js`.

## The rules (and their numbers)

| Rule | Implementation |
|---|---|
| 1. Every fire casts every nearby stone's shadow straight away from itself | Lights: Ilen's lantern, lit sconces, echoes, Marrow (and the Tier 3 sun). Reach **9 m**. Length **3 + 1.6·d** (3–16 m) — a designed curve: a farther fire throws a longer shadow, like a low sun. Line of sight and the far end are clipped by walls and gates (never by props, levers or stones). Width **1.4 m**, rounded tip, rim coloured by the light (amber = Ilen, cyan = echo, pale = Marrow, gold = sconce). |
| 2. A shadow over the abyss is solid while it lasts | Each live shadow has a pooled dynamic collider (top at y = 0). It fades in over 0.25 s and out over **1 s** with a crack and flicker warning — never instantly under the player. Turning shadows carry whoever stands on them (≤ 3 m/s). Coyote time and jump buffer 0.12 s; a fall returns you to the last safe floor in ≈ 0.8 s. |
| 3. A shadow resting on a rune wakes it | Cover test: rune within 0.8 m of the shadow's centre line and inside its length. Tip test (`tip: true`): the tip lands on it (± `tol`). The **same** shadow must cover it for **0.4 s** (walking past never triggers). Gates, bridges, relays latch; Heart sockets hold only while covered (all three together for 1 s). A stone the rune doesn't know flashes red once. Lock feedback: 60 ms hit-stop, tremor, stone thud, dust, gold burst. |
| 4. A shadow touching an unlit sconce lights it | Within 0.8 m for 0.25 s → a fire trail runs to it. **E** kindles by hand within 2.4 m (the lantern never runs out). Sconces burn 20 s, burn down visibly, gutter in the last 3 s. |
| 5. Ilen can mark a minute | **R** starts recording (30 Hz, ≤ 8 s, MINUTE ring); **R** again releases it. The echo replays the walk at 1×, then holds its raised lantern for 12 s (ECHO ring, 3 s warning) and crumbles. One at a time (two, permanent, in the Heart). Falling cancels a recording; Backspace clears echoes. Granted in Room IV. |

**Rules never lie:** `World.checkRuleTruth()` warns at build time if any decorative brazier or ember stands within 9 m of a stone; the playthrough asserts zero warnings. Every decorative brazier that was within reach was removed or turned into a gameplay sconce.

**Why you can never walk your own shadow:** to stand on it you must be beyond the stone, but the shadow points away from the lantern you carry. (Proved in play: the Room II test walks at its own shadow, never stands on it, and falls.)

**No hops across gaps:** a hop never carries a run (horizontal speed capped at walking pace on take-off), so even a running coyote hop reaches ≈ 3.2 m. The narrowest gap (Room I) is 3.5 m; the test proves it can't be crossed that way.

## The light map (dev tool)

`window.__ashen.debug.lightMap(levelId, { render, wake })` samples the room's floor every 0.5 m, flood-fills which samples are **reachable** from the spawn (walls, props, stones and closed gates block), treats each sample as Ilen's lantern and reports which runes and sconces it could wake; it also reports what every sconce would cast (length, where it crosses the abyss, whether it lands on floor) and simulates Marrow's patrol. `render: true` draws coloured dots. The playthrough calls it in every room.

## Rooms

### I · The Threshold (id 1, quiet)
- Stone A (−1, 49) on the near platform; rune a (1.5, 39.5) beyond the 3.5 m gap → slab bridge (0, 47.6)→(0, 42.9).
- Introduce: walking swings the shadow. Twist: from near the stone the shadow is too short; only 4.1–9 m behind it does it reach (light map: 21 lantern spots, all in x −3.5…−2, z 53…57.5).
- Lost Minute 1: after crossing, kindle the far-corner sconce (6.5, 35.5): it throws stone L (6.8, 42.5) back over the gap; the fragment hangs over the abyss on that road.

### II · The Loose Shadow (id 2)
- Stone A (−42, 0) 4 m from the 4 m gap. From the spawn, Ilen's own shadow lies across the chasm — and swings away as she approaches.
- Near sconce (−40.8, −1.5): d 1.9 m → 6.1 m, ends at the edge (no crossing). Far sconce (−36.5, 4.5): d 7.1 m → 14.4 m, crosses diagonally and lands on the far platform. Ilen can also light the far sconce with her own shadow (13 lantern spots) — same lesson.
- No decorative fire within 9 m of A. The hint inscription that explained the old puzzle was removed.

### III · Marrow's Rounds (id 3)
- Marrow's echo walks z = −32 between x −64 and −46 (1.6 m/s, 1 s waits). Her lantern sweeps stone A (−55, −34.5)'s shadow across the first gap. Light-map simulation: **two windows of ≈ 4.2 s in a 24.5 s loop** (34 %).
- Island sconce (−51.5, −42.6) sits 0.5 m beyond the farthest her sweep can reach, so lighting it stays the Keeper's job (tested over a full loop). Its fire throws island stone B (−51.5, −44.9) 6.7 m north across the second gap.
- Lost Minute 3: at the west end of her swing (shadow sweeping past the island's edge) the fragment hangs over the gap — ride her shadow to it.

### IV · The Kept Minute (id 5)
- Marrow's sigil (0, −36.5) grants the minute-mark (R does nothing before).
- Introduce: record the walk to a light spot 3.6–9 m behind stone A (−5, −42.5) on the line toward the gap; the echo holds A's shadow across.
- Twist: stand on that echo-held shadow over the abyss: only there (1.9–3.1 m south of stone B (−1.5, −49.5)) is the lantern at the distance for B's shadow **tip** to land on the door rune (−1.5, −56.5). Light map: **0** floor positions can do it. The rune sits 1.4 m short of where the closed door clips B's shadow, so the door can't fake a tip. The ember waits beyond the door.

### V · The Fire Road (id 6)
- West part: stone W (−9, −69) beside a balustrade; three sconces (−12.5, −72 / −69 / −66) stand beyond it, reachable only by a shadow. Walking east of W sweeps its shadow across them; they light in sequence. The middle one throws W's shadow onto the door rune (−3, −69) → inner gate. Light map: the rune is wakeable from **0** reachable spots (only from behind the balustrade).
- Twist: from the edge of the east part (z −73.7…−72), Ilen's shadow of stone S (5, −81) crosses the 6 m abyss and lights the far sconce F (5, −86); F throws S's shadow 11 m back north — a road to you.
- The inscription "FIRE FOLLOWS THE SHADOW'S ROAD" stays.

### VI · The Mirror Hall (id 9, quiet)
- Relay: stand 5–6 m west of stone A (56.5, 42): your shadow reaches through the grille and lights sconce E (65.5, 42) in its niche (10 lantern spots). E (9 m away) throws A's shadow 16 m west, across the first gap to the island.
- Rail: slide stone R (lever 42, 46.6) from the island's middle to its west edge, so a light can stand behind it.
- Echo: record a walk to 4–5 m east of R; the echo holds R's shadow across the second gap.
- Lost Minute 6: an echo at the island's south edge throws R's shadow 14.5 m along the gap to the far north end.

### The Heart of Minutes (id 10, the Sanctuary)
- After VI the ring wakes. West and east stones (±12.5, −4) and rail stone S (x −6, slots z 20.5 / 17 / 13.5) must hold their shadows on sockets w (−3.6, −1.5), e (3.6, −1.5), s (−1.6, 4) **together for 1 s**.
- Light map (stones awake): w and e each wakeable from 23 walkway spots (x 16.5–21); s only with S on its inner slot, from a ≈ 1 m spot at (−8, 17.75) (tip test).
- One Keeper can't hold three: two permanent echoes ("That one stays." / "…So does that one.") and Ilen. The six hub braziers were moved so none is within 9 m of a ring stone.
- Final span (0, −11.6)→(0, −3.8) → the Heart → finale → ending. The game ends at the Heart: once the finale's three embers have landed in their sockets and its last line ("Go home, Keeper.") has finished, the ending cards and the completion screen follow at once, wherever Ilen stands (no control returns; the earlier escape run, the Unmaking, was removed).

### The training court (optional tutorial)
A separate court at x ≈ 240 (`src/world/tutorial.js`), not joined to the temple; four ordinary rooms of the five rules (ids 101–104) and four gates (`g_t1`–`g_t4`), none of them saved. A · look, walk, run, hop the fallen column (0.55 m 'prop' box across a 5 m corridor) · B · stone T1 + rune r1 off the corridor's axis (lantern zone ≈ (−0.8d, 0.6d) from the stone) → gate; sconce 4 m behind T2 at the gap edge → ≈ 9.4 m shadow over 3.5 m · C · R practice, then T4 at the edge of a 3.5 m gap with no fire but yours: the echo left in the ring 1.8 m behind it throws ≈ 5.9 m · D · two sconces for rune r5 (only the west one is on its line; Focus shows it) → gate; rail stone T6 (3 slots) under an endless sconce: the east slot lays its shadow on r6 → gate · the arch. Every decorative brazier is > 9 m from every stone (build-time check: no warnings).

### Passages
- **Measured Walk (id 4)**, **Crossroads (id 7)**, **Clockwork Span (id 8)**: no ember, card or objective; their crossings are slab bridges already formed when their wing opens.
- Lost Minute 2 (4): the far-corner sconce throws stone M's shadow back over the chasm's west end.
- Lost Minute 4 (7): a balustrade hides three sconces in a chain (stones P2, P3 between them). Only the first is reachable by Ilen's shadow (light map: c2, c3 = 0); the fire runs the chain and the third reveals the fragment.
- Lost Minute 5 (8): slide rail stone T to its last slot; from just inside the inner wall, its shadow **tip** lands on a rune across the chasm (one 1 m spot; the other slots would need you inside the wall) and reveals the fragment over there.

## Gate wiring
I → g_L1, g_hub_w · II → g_L2 · III → g_L3, g_L4, g_sc_w, g_hub_n (rev1) · IV → g_L5 (by its rune) · V → g_L6, g_L7, g_sc_n, g_hub_e, g_L8m, g_L8 (rev2) · VI → g_L9, g_sc_e (ring wakes).

## Teaching without telling
Objectives state the goal, never the method. Hints come only on demand: after 60 s and 120 s without progress (rune, sconce, echo) Marrow says one line (quiet rooms wait 1.5× longer). Barks mark discoveries (first shadow sweep, first fall, standing on a sconce's road, the grant, the first echo).

## Tier 3 experiments (all OFF, `src/game/Features.js`)
| Flag | What | Status |
|---|---|---|
| GNOMON_ILEN | Under any other fire, Ilen's body casts a 0.8 m shadow (no collider) that wakes only `body` runes | Built and tested; no level uses a body rune yet |
| SUNDIAL_HUB | After the ring wakes a sun orbits the Sanctuary once a minute; hold E at the Heart to run it back | Built and tested; adds light only, so the Heart stays solvable with it on or off |
| BACKWARD_ECHO | An echo recorded on a warm sigil replays end → start | Built and tested; one sigil on Room VI's island (flag only) |
| ASH_DARK | Ash zones dim the lantern to 40 % (5 m reach) and crumble echoes | Built and tested; one zone in the west passage (flag only) |

Turn them on for testing with `?features=GNOMON_ILEN,SUNDIAL_HUB,...`. None has been tried by a human tester yet, so all ship off.
