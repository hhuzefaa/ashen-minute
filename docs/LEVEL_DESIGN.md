# Ashen Minutes — Level design specification (10 levels)

All ten levels are rooms of **one connected temple** (`src/world/levels.js`). Nothing teleports: completing a level opens real gates, and every opened gate stays open (saved in `localStorage`).

## Rules the player learns (and that never change)

| Rule | Feedback |
|---|---|
| **Fire.** A relic must burn before it casts anything. Press **E** to light it, or **kindle** a cold relic with a flame carried from an eternal hearth, or let fire **relay** along another shadow. | The relic flares, nearby braziers catch, and the Fire icon lights. |
| **Shadow.** A lit relic casts a fixed-length shadow along its gnomon. When the tip lands on a rune it may use (angle within tolerance, and length too for rail relics), the relic locks and the rune's effect fires: a bridge, a gate, a relay or a socket. | The rune brightens as the shadow nears. "THE SHADOW IS NEAR", then "THE SHADOW REMEMBERS" with a gold flash and a chord. |
| **Wrong sign.** A shadow landing on a rune it may not use is rejected. | Red flash and "THE TEMPLE DOES NOT KNOW THIS SIGN". |
| **Time.** Hold **R** to rewind the relic's recorded rotation, and only that. Releasing discards the abandoned future. Collar relics can be nudged only ±15° (±12°) around where time left them. | Cyan vignette, cyan ghost relic, memory bar, rewind sound. |
| **Memory.** The relic's oldest remembered angle (the cyan **echo**) is pinned, so fiddling can never erase the answer. | The echo outline stays visible. |

**Recovery from mistakes:**
- Timed spans slip their relic, and a short rewind restores it.
- Sockets drift after 30 seconds and can be re-aligned.
- Hearth flames can always be taken again.
- **Backspace** restarts the current puzzle. Doors already opened stay open.
- Falling respawns you at the level's entrance.

## The ten levels

### I — The Threshold (Discovery)
- **Objective:** cross the gap into the temple.
- **Mechanics:** ignite, turn, align. Free rotation, 8° tolerance.
- **Clues:** the golden rune and stele face the relic. The shadow tip glows brighter as it nears.
- **Solution:** E, then A or D until the shadow meets the rune. The bridge forms. Cross and take the ember. This opens the gallery to the hub and the hub's west gate.
- **Failure and recovery:** stepping into the gap respawns you at the entrance.
- **Why it's easy:** one rule, almost no text.

### II — The Echo Court (Observation; introduces rewind)
- **Objective:** a relic jolted from its angle.
- **Mechanics:** collar (±15°), scripted jolt on ignition, rewind, cyan echo, 6° tolerance.
- **Clues:**
  - The cyan echo outline shows the old angle.
  - An inscription reads "THE RELIC FORGETS WHERE IT IS. IT NEVER FORGETS WHERE IT WAS."
  - A one-time prompt: "HOLD [R]".
- **Solution:** rewind to the echo (the oldest memory), then nudge 10–15°. The jolt never passes through the answer, so turning alone cannot solve it (verified by the automated test).
- **Optional:** alcove S2 holds a child's height mark, "ILEN — TALLER THAN THE DIAL TODAY".

### III — The Twin Flames (Multiple mechanisms)
- **Objective:** a gap, an island, and a second gap.
- **Mechanics:** two relics, two half-spans.
- **Solution:** relic A on the near side builds the half-span to the island. Relic B on the island builds the far half. Both must be done in order.
- **Why it's harder:** the player has to plan two steps and move between two stations.

### IV — The Measured Shadow (Spatial reasoning)
- **Objective:** the rune is too far for the shadow from where the relic starts.
- **Mechanics:** a **rail relic** with 3 sockets and a lever (E). Its shadow has a fixed length (18.1 m). The rune needs both angle and length (±0.7 m).
- **Clues:**
  - The shadow tip visibly falls short.
  - Inscription: "A SHADOW CANNOT GROW. MOVE THE ONE WHO CASTS IT."
  - Ilen's line on entry.
- **Solution:** slide the relic to socket 3, then turn it. From socket 1 or 2 it cannot work (tested).
- **Completion:** revelation I (Marrow put the Ember out). The west shortcut back to the hub and the north gate both open.

### V — The Bent Memory (Time manipulation)
- **Objective:** a relic thrown through a long arc of memory.
- **Mechanics:** collar, three-part jolt, 8-second memory, 5° tolerance.
  - **Rewinding never solves it by itself.** You must stop.
  - **No echo.**
- **Clues:**
  - The rune **blinks** whenever the past shadow sweeps across it.
  - The slow middle swing is the only part of the memory that crosses the answer.
  - Inscription: "THE RUNE BLINKS WHEN THE PAST PASSES OVER IT."
- **Solution:** hold R, watch for the blink, release on it, then nudge.
- **Recovery:** if you rewind past it, rewind further does nothing; restart the puzzle (Backspace) to replay the jolt.

### VI — The Relay (Interconnected puzzles)
- **Objective:** the relic you need is behind a sealed inner wall, and it is cold.
- **Mechanics:**
  - **Relay:** fire travels along a shadow and lights another relic.
  - The relay rune also **opens the inner gate**.
  - The second relic is a collar relic with an echo.
- **Clues:**
  - Inscription: "FIRE FOLLOWS THE SHADOW'S ROAD."
  - The cold relic refuses E: "THIS RELIC WAITS FOR ANOTHER'S FIRE".
- **Solution:** aim A at the relay rune. Fire crosses the wall to B and the inner gate opens. Walk through, rewind B to its echo, nudge, cross.

### VII — The Crossroads (Planning and trade-offs)
- **Objective:** one eternal hearth and three cold relics marked **wave**, **spiral** and **eye**. The door's keystone bears the **eye**.
- **Mechanics:** **carried flame**, which lasts 10 seconds (HUD ring). Kindling a relic spends the flame.
- **Trade-off:**
  - The decoys are closer and can even reach the door's rune, but they are **rejected** (red, "wrong sign").
  - The eye relic sits behind an inner wall and needs a planned route.
- **Solution:** take the flame, go around the inner wall, kindle the eye relic, and aim it at the door's rune.
- **Recovery:** the hearth gives flame again whenever you want. A wrong choice costs time, never progress.
- **Completion:** revelation II (the Ember fed on the living city's minutes). The north shortcut and the east gate open.

### VIII — The Clockwork Span (Multi-stage)
- **Stage 1:** a rail relic (choose socket 2) aimed at a rune opens the inner door.
- **Stage 2:** take the flame from the hearth and carry it through the newly opened door within 12 seconds.
- **Stage 3:** kindle the cold collar relic. It jolts. Rewind and nudge it, which raises a **9-second span**. The timer pauses while you stand on the span; if it expires, the relic slips and a short rewind restores it.
- **Why it's harder:** every rule learned so far, in sequence, with time pressure.

### IX — The Mirror Hall (Mastery; no tutorial prompts)
- **Chain:** A (free) → relay → B (collar plus jolt, sweep-flash, no echo) → a rune that **both** raises span 1 to the island **and** relays fire to C → C (a rail relic on the island, socket 3) → a **7-second** final span.
- **What's left to help:** almost nothing. Only the objective line remains. Prompts and sub-prompts are hidden (a "quiet" level).
- **Completion:** the ring of the Sanctuary wakes, along with Marrow's final echo. The east shortcut opens.

### X — The Heart of Minutes (Final trial, in the hub you have crossed nine times)
- **Objective:** hold **all three** shadows on the Heart's three sockets **at the same time**.
- **The three relics:**
  - **S** is a rail relic and needs the middle socket.
  - **W** is a collar relic with a jolt; rewind it to its echo.
  - **E** is cold; take flame from the ring hearth 20 m away.
- **Pressure:** each held socket fades after **30 seconds** (the relic slips) unless all three are held. A slipped relic is recovered with a short rewind.
- **Solution:** prepare all three, then finish them in quick succession. The final span forms, and you walk to the Heart and take the last ember. This plays the finale and the ending.

## Difficulty curve

| Level | New idea | Combined with | Stations | Time pressure | Prompts |
|---|---|---|---|---|---|
| I | ignite / turn | – | 1 | – | full |
| II | rewind, collar, echo | turn | 1 | – | full |
| III | two relics | turn | 2 | – | full |
| IV | rail + length | turn | 2 (lever) | – | full |
| V | sweep clue, stop-in-memory | rewind, collar | 1 | – | full |
| VI | relay + gate | rewind, collar | 2 rooms | – | full |
| VII | carried flame, emblems | turn | 3 + hearth | 10 s flame | full |
| VIII | – | rail, flame, rewind, timed span | 3 stages | flame + 9 s span | full |
| IX | chained relays | everything | 3 + island | 7 s span | **none** |
| X | simultaneous sockets | everything | 3 + hearth | 30 s holds | **none** |

Every level was solved end to end by `tests/playthrough.py` using real key input. That test also checks the "cannot be solved the wrong way" cases (II, IV, V, VII).
