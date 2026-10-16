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
- Move the mouse slowly and smoothly. Stop briefly on key moments: ignition, the bridge forming, the rewind, the span timers and the Heart Ember.
- For the theme callouts, hold **Q** (Focus) for a moment while recording so the shadow line and memory trail are visible.

## Edit timeline

| Time | Shot (✱ = real gameplay) | On-screen text |
|---|---|---|
| 0:00–0:20 | Teaser: in-game opening cutscene (camera over the entrance, Ilen's lines about Sera) and the title card | "The temple remembers what the world has forgotten." |
| 0:20–0:45 ✱ | I · Threshold: walk in, **E** to ignite, braziers catch, turn the relic, the shadow becomes a bridge, cross | **FIRE** wakes the relic · **SHADOW** becomes the path |
| 0:45–1:10 ✱ | II · Echo Court: ignition wrenches the relic, the collar stops your nudges, hold **R** (cyan rewind, memory bar), back to the echo, align | **TIME** remembers the angle |
| 1:10–1:25 ✱ | Walk through the opened gate and gallery into the Sanctuary (the scale shot); a brazier lights | One temple, ten embers |
| 1:25–1:45 ✱ | IV · rail relic: the shadow falls short, slide it with the lever, align · VI · Relay: fire runs along a shadow through the wall | Shadows carry fire |
| 1:45–2:05 ✱ | VII · Crossroads: take the flame (timer ring), a decoy is rejected in red, the eye relic opens the door | Choose your flame |
| 2:05–2:25 ✱ | VIII / IX: timed span with countdown, stand on it (timer pauses), cross; the relay chain | All three, together |
| 2:25–2:42 ✱ | X: three sockets held, the final span, the Heart burns backwards, ash rises | |
| 2:42–3:00 | Ending cards + title: "The temple remembers, so that we may forget." | |

Gameplay total: about 2:05 (more than 2:00). Teaser plus ending: about 0:55.

**Tip for recording late levels:** finish a full run once and keep that browser profile. Your save lets you **Continue** from any checkpoint, and every opened gate stays open, so you can walk back to any level. To replay a puzzle (even a solved one) from the start, stand in its room and press **Backspace**. Your doors and embers are kept.

## Before uploading

- [ ] The duration is exactly 3:00 (check in the editor's export dialog).
- [ ] No gameplay shot is sped up or faked. Speed ramps are only used in teaser segments.
- [ ] All three themes are named on screen at least once.
- [ ] Export as H.264 MP4, 1080p.
- [ ] Watch the exported file once from start to finish to check it isn't corrupted.
- [ ] Set the Google Drive sharing to "Anyone with the link: Viewer", then open the link in a private window to test it.
