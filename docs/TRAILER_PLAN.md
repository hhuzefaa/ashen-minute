# Trailer plan: 3:00 total, at least 2:00 of real gameplay

The competition rules say:
- The trailer is exactly **3 minutes**. Going over or under costs marks.
- At least **2 minutes** must be gameplay screen-recorded from the submitted build. A judge must be able to pause the trailer and recreate that moment in the game.
- Up to 1 minute can be stylised teaser material.
- The trailer **must show how each theme is used**.
- Submit it as a Google Drive link with viewing permission set to "Anyone with the link".

## Recording setup

- Use OBS Studio (free) or the Xbox Game Bar (Win+G). Record at 1920×1080, 60 fps, from a production build (`npm run build && npm run preview`). Open the game in full-screen Chrome with F11.
- Turn the game sound on, and record system audio, because the sound design is scored.
- Record **several full runs** and edit afterwards. Don't try to get a perfect single take.
- Move the mouse slowly and smoothly. Stop briefly on key moments: ignition, the bridge forming, the rewind, the Room 3 timer and the Heart Ember.
- For the theme callouts, hold **Q** (Focus) for a moment while recording so the shadow line and memory trail are visible.

## Edit timeline (based on design bible §16)

| Time | Shot (✱ = real gameplay) | On-screen text |
|---|---|---|
| 0:00–0:18 | Teaser: slow drift across the cold Room 1 title view, the unlit relic, falling ash, then the title card | "The temple remembers what the world has forgotten." → **ASHEN MINUTES** |
| 0:18–0:45 ✱ | Walk in from spawn; the **[E] IGNITE RELIC** prompt appears; ignition flare; braziers catch | **FIRE** wakes the relic |
| 0:45–1:15 ✱ | Turn the relic with A/D; the shadow sweeps; "THE SHADOW IS NEAR"; the bridge forms; walk across it; collect ember 1 | **SHADOW** becomes the path |
| 1:15–1:42 ✱ | Room 2: ignition jolt, nudging stopped by the collar, then hold R: cyan vignette, ghost, the relic sweeps back to the echo; nudge, align, cross | **TIME** remembers the angle |
| 1:42–2:12 ✱ | Room 3: the zig-zag rewind; align; the timer ring; stand on the span to show the pause; let one span fade, then rewind and re-align; cross | Fire · Shadow · Time, together |
| 2:12–2:35 ✱ | Collect ember 3; the three embers converge; the Heart Ember ignites; the seal lights; the door sinks; "THE TEMPLE REMEMBERS"; victory screen | |
| 2:35–2:52 | Theme summary over gameplay b-roll: three short captions with the HUD theme icons | FIRE ignites · SHADOW builds · TIME corrects |
| 2:52–3:00 | End card: title, your name, "Three.js · all art and sound made in code" | |

Gameplay total: 0:18–2:35 = **2:17** (more than 2:00). Teaser and end card: 0:43.

## Before uploading

- [ ] The duration is exactly 3:00 (check in the editor's export dialog).
- [ ] No gameplay shot is sped up or faked. Speed ramps are only used in teaser segments.
- [ ] All three themes are named on screen at least once.
- [ ] Export as H.264 MP4, 1080p.
- [ ] Watch the exported file once from start to finish to check it isn't corrupted.
- [ ] Set the Google Drive sharing to "Anyone with the link: Viewer", then open the link in a private window to test it.
