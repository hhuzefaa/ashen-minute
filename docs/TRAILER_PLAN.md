# Trailer plan: 3:00 total, at least 2:00 of real gameplay

The competition rules:
- The trailer is exactly **3 minutes**. Going over or under costs marks.
- At least **2 minutes** must be gameplay screen-recorded from the submitted build. A judge must be able to pause the trailer and recreate that moment in the game.
- Up to 1 minute can be stylised teaser material.
- The trailer **must show how each theme is used** — name FIRE, SHADOW and TIME on screen.
- Submit it as a Google Drive link with viewing permission "Anyone with the link".

## Recording setup

- OBS Studio (free) or the Xbox Game Bar (Win+G). 1920×1080, 60 fps, from a production build (`npm run build && npx vite preview`), Chrome full screen (F11), **Settings → High**.
- Record game sound (system audio): the sound design is scored.
- **Trailer camera:** run the dev server (`npm run dev`) and press **F9** to hide/show the whole HUD for clean shots (dev builds only; the production build ignores F9). Use HUD-on takes for the theme callouts if you want the on-screen key prompts visible.
- Record several takes and edit; move the mouse slowly; hold **Q** briefly when you want shadow rims to glow.
- Your save lets you **Continue** from any room, and **Backspace** replays the room you stand in (doors stay open), so any shot can be re-recorded.

## The six gameplay shots (build the 2:00+ around them)

| # | Shot (all real gameplay) | How to get it | On-screen text |
|---|---|---|---|
| 1 | Ilen walks into Room I and a huge shadow sweeps the hall with her | New Game → walk in a slow arc around the stone; then step back until the rune wakes and the bridge forms | **FIRE** · you carry the light |
| 2 | She steps onto her own shadow and it swings away — she falls | Room II from the spawn: walk straight at the shadow lying across the chasm | **SHADOW** · a shadow over the abyss is ground… |
| 3 | Her echo holds the light while she crosses on its shadow | Room IV: R at the sigil, walk to the spot behind stone A, R; cross; stop over the abyss — the door wakes | **TIME** · leave a minute behind |
| 4 | Marrow's echo walking her rounds; Ilen crosses on her sweeping shadow | Room III: wait at the near edge; step on as the shadow arrives | …if someone else holds the light |
| 5 | A fire-road chain lighting sconces in sequence, then a far fire throwing a bridge back | Room V: sweep the gallery (walk north just east of the stone), then stand at the east edge until the far sconce catches; cross on the road it throws | Fire follows the shadow's road |
| 6 | The finale: two permanent echoes and Ilen holding three shadows on the Heart, then the Unmaking run | Heart: echoes at the west and east spots, slide the south stone twice, stand behind it; then the escape to Marrow at the door | The minutes you leave |

## Edit timeline (3:00)

| Time | Content | Type |
|---|---|---|
| 0:00–0:15 | Cold open card and Ilen's line ("Sera didn't know my name this morning…"), title | teaser (in-game) |
| 0:15–0:40 | Shot 1 — the sweeping shadow, the step back, the bridge | ✱ gameplay |
| 0:40–1:00 | Shot 2 — the failed step, then kindling the far sconce and crossing | ✱ gameplay |
| 1:00–1:20 | Shot 4 — Marrow's rounds | ✱ gameplay |
| 1:20–1:45 | Shot 3 — mark a minute, the echo holds, stand on your own past, the door wakes | ✱ gameplay |
| 1:45–2:10 | Shot 5 — the fire road and the bridge thrown back | ✱ gameplay |
| 2:10–2:42 | Shot 6 — "That one stays." / "…So does that one." / three shadows held / the Unmaking run | ✱ gameplay |
| 2:42–3:00 | Ending cards and the title: "The temple remembers, so that we may forget." | teaser (in-game) |

Gameplay total ≈ 2:27 (more than 2:00); teaser and cards ≈ 0:33.

## Before uploading
- [ ] Duration exactly 3:00 (check in the export dialog).
- [ ] No gameplay shot sped up or faked; speed ramps only in the teaser parts.
- [ ] FIRE, SHADOW and TIME named on screen at least once.
- [ ] H.264 MP4, 1080p; watch the exported file once start to finish.
- [ ] Google Drive sharing: "Anyone with the link: Viewer"; open the link in a private window to test.
