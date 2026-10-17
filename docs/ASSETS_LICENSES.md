# Assets and licences: Ashen Minutes

## Summary

| Category | Source | Licence | Can be redistributed in a public repo? |
|---|---|---|---|
| Game code | Original (this repository) | MIT (`LICENSE`) | Yes |
| 3D models (Keeper, relic, pedestal, Heart Ember, embers, rune, bridge slabs, floor, walls, pillars, arches, braziers, rubble, inscriptions, backdrop) | Original, generated procedurally at runtime from `src/objects/*` | MIT, as part of the code | Yes |
| Textures (stone grain, rune glyphs, glow sprite) | Original, drawn on `<canvas>` at runtime (`src/game/Palette.js`, `src/objects/Glyphs.js`) | MIT, as part of the code | Yes |
| Visual effects (shadow guide, time ghost and trail, fire particles, bridge seams, finale seal) | Original shaders and meshes | MIT, as part of the code | Yes |
| Sound effects, ambience and music drone (everything except the fire ambience) | Original, synthesised with the Web Audio API (`src/game/AudioManager.js`) | MIT, as part of the code | Yes |
| Fire ambience: `src/assets/audio/fire_bed.ogg` | "Fire_Forest_Inferno.aif" by **Dynamicell**, https://freesound.org/people/Dynamicell/sounds/17548/ (file taken from Minetest Game, `mods/fire/sounds/fire_large.ogg`). Edited: band-limited 90 Hz–5.5 kHz, cross-faded into a 7.6 s loop (`tools/make_fire_loops.py`) | CC BY 4.0 on freesound (CC BY 3.0 as redistributed by Minetest Game) | Yes, with the attribution (in-game Credits + this file) |
| Fire ambience: `src/assets/audio/fire_crackle.ogg` | "fire.crackling.mp3" by **dobroide**, https://freesound.org/people/dobroide/sounds/4211/ (via Minetest Game, `mods/fire/sounds/fire_small.ogg`). Edited: band-limited 70 Hz–6.5 kHz, sharpest pops compressed 4:1, 5.8 s loop | CC BY 4.0 on freesound (CC BY 3.0 via Minetest Game) | Yes, with the attribution |
| Temple stone textures (`src/assets/textures/temple_floor.jpg`, `stone_block.jpg`) | Made by `tools/make_stone_textures.py` from the ruined-temple flooring reference the author supplied (`docs/reference/floor-reference.jpg`): moss desaturated, one slab cropped for wall blocks | Supplied by the author. **Confirm the original source and licence of this image before publishing the repo** | Depends on the source |
| Pause / completion button art (`src/assets/ui/button-*-wide.png`) | Wider cut of the author's button theme sheet: both ends kept 1:1, the plain middle extended by mirroring (`tools/extract_button_art.py`) | Provided by the author | Yes |
| Dialogue frame | The theme's stone-and-rune panel (`button-normal.png`, same art as the menu buttons), after `docs/reference/dialogue-theme.png` | Provided by the author | Yes |
| Menu button artwork (normal / hover / pressed, `src/assets/ui/button-*.png`) | Cut from the author's button theme sheet (`docs/reference/button-theme-sheet.jpg`) by `tools/extract_button_art.py`; the baked "PLAY GAME" label was removed so the game renders its own labels | Provided by the author (Huzefa) for this project | Yes |
| Display font: Cinzel | `@fontsource/cinzel` (npm), upstream https://github.com/NDISCOVER/Cinzel | SIL Open Font License 1.1 | Yes (the OFL allows bundling with software) |
| Title font: Cinzel Decorative | `@fontsource/cinzel-decorative` (npm), upstream https://github.com/NDISCOVER/Cinzel | SIL Open Font License 1.1 | Yes |
| UI font: Inter | `@fontsource/inter` (npm), upstream https://github.com/rsms/inter | SIL Open Font License 1.1 | Yes |
| three.js | npm `three` | MIT | Yes (installed through `npm install`, not committed) |
| Electron / electron-builder (desktop .exe) | npm `electron`, `electron-builder` | MIT | Yes (dev tools; the .exe ships Electron's runtime with its own licences in `LICENSES.chromium.html`) |
| App icon (`build/icon.png`, `electron/icon.png`) | Original, drawn in code (the game's ember diamond and sundial ring) | MIT, as part of the code | Yes |
| Vite | npm `vite` | MIT | Yes (dev dependency) |

## Why there are no downloaded model packs

The asset bible (v3 addendum) asked for an online search of Kenney, Poly Pizza, Sketchfab, OpenGameArt and BlenderKit. The build environment's network policy blocked all of those hosts, so no model files could be downloaded or checked. The addendum's fallback order (rank 4 and 5: build original procedural models) was followed for every asset. This has three advantages:

- There is no third-party art, so there is no attribution and no licence risk.
- The look stays consistent across the game.
- Every object belongs to this project, which counts towards originality under the jam's "no stealing" rule.

If you add a downloaded model later, record it in `ASSET_MANIFEST.csv`, including its licence, author and source URL, before committing it.

## Font attribution (OFL 1.1)

- Cinzel and Cinzel Decorative: Copyright 2020 The Cinzel Project Authors (https://github.com/NDISCOVER/Cinzel)
- Inter: Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)

The full OFL text is included in the npm packages (`node_modules/@fontsource/*/LICENSE`) and at https://openfontlicense.org.
