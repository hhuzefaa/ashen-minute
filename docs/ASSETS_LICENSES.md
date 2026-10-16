# Assets and licences: Ashen Minutes

## Summary

| Category | Source | Licence | Can be redistributed in a public repo? |
|---|---|---|---|
| Game code | Original (this repository) | MIT (`LICENSE`) | Yes |
| 3D models (Keeper, relic, pedestal, Heart Ember, embers, rune, bridge slabs, floor, walls, pillars, arches, braziers, rubble, inscriptions, backdrop) | Original, generated procedurally at runtime from `src/objects/*` | MIT, as part of the code | Yes |
| Textures (stone grain, rune glyphs, glow sprite) | Original, drawn on `<canvas>` at runtime (`src/game/Palette.js`, `src/objects/Glyphs.js`) | MIT, as part of the code | Yes |
| Visual effects (shadow guide, time ghost and trail, fire particles, bridge seams, finale seal) | Original shaders and meshes | MIT, as part of the code | Yes |
| Sound effects, ambience and music drone | Original, synthesised with the Web Audio API (`src/game/AudioManager.js`) | MIT, as part of the code | Yes |
| Display font: Cinzel | `@fontsource/cinzel` (npm), upstream https://github.com/NDISCOVER/Cinzel | SIL Open Font License 1.1 | Yes (the OFL allows bundling with software) |
| UI font: Inter | `@fontsource/inter` (npm), upstream https://github.com/rsms/inter | SIL Open Font License 1.1 | Yes |
| three.js | npm `three` | MIT | Yes (installed through `npm install`, not committed) |
| Vite | npm `vite` | MIT | Yes (dev dependency) |

## Why there are no downloaded model packs

The asset bible (v3 addendum) asked for an online search of Kenney, Poly Pizza, Sketchfab, OpenGameArt and BlenderKit. The build environment's network policy blocked all of those hosts, so no model files could be downloaded or checked. The addendum's fallback order (rank 4 and 5: build original procedural models) was followed for every asset. This has three advantages:

- There is no third-party art, so there is no attribution and no licence risk.
- The look stays consistent across the game.
- Every object belongs to this project, which counts towards originality under the jam's "no stealing" rule.

If you add a downloaded model later, record it in `ASSET_MANIFEST.csv`, including its licence, author and source URL, before committing it.

## Font attribution (OFL 1.1)

- Cinzel: Copyright 2020 The Cinzel Project Authors (https://github.com/NDISCOVER/Cinzel)
- Inter: Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)

The full OFL text is included in the npm packages (`node_modules/@fontsource/*/LICENSE`) and at https://openfontlicense.org.
