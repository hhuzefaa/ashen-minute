# Performance: what was wrong, what changed, what was measured

## Causes found in the 3-room version
| Problem | Effect |
|---|---|
| Render scale 1.5× device pixel ratio by default, plus full bloom | Fragment cost about 2.25× higher than needed |
| Rounded-box geometry for every floor tile and wall block (~200 triangles each) | **333k triangles** visible at spawn |
| 8–10 real point lights per room (every brazier was a light) | Every lit pixel evaluated 10 lights, and the shader recompiled on every room change |
| 2048² shadow map covering the whole room | Expensive shadow pass |
| Effect meshes drawn while fully transparent (shadow guides, bridge seams, rings, collar arcs) | Wasted draw calls |
| Full-screen CSS overlays (blurred vignettes, fade layer) still composited at opacity 0 | Real cost on weak GPUs and in software rendering |

## Changes
- **Pooled lights:** every fire is a `LightSource` that costs nothing to render. A fixed pool of 3 (Low), 4 (Medium) or 6 (High) real point lights is assigned each frame to the sources that matter most near the Keeper. Because the light count never changes, shaders never recompile mid-game.
- **Cheap geometry:**
  - Box tiles and blocks: 12 triangles instead of about 200.
  - Pillars, statues, gate frames and relic pedestals are merged into one mesh each.
  - Relic dial ticks are merged.
  - Geometry for repeated parts is shared.
- **Instancing** for floors, walls, rubble and underside rocks.
- **Zone culling:** the temple is split into 20 zones, and a zone is drawn only if the Keeper is within 28 m of it. Fog hides where zones start and stop.
- **One shadow-casting light** follows the Keeper, using a tight 48 m frustum at 1024² (Medium).
- **Invisible meshes are skipped**, and transparent HTML overlays are removed from the page when not in use.
- **Collision** uses a spatial grid (8 m cells), and the simulation runs in fixed steps of at most 1/30 s, so movement stays the same at any frame rate.
- **Settings menu:** Low, Medium (the default) and High presets, plus individual controls for render scale, shadows, bloom, particles, number of real lights, sensitivity and invert-Y. There is an FPS / draw-call overlay.

## The redesign ("You are the light") and its budgets
- Shadows are computed on the CPU (no extra render passes): at most **16 shadow visuals and 16 shadow colliders** (pooled, hidden when unused), plus 6 Focus previews. Each visual is 7 small meshes (a few dozen triangles).
- All new lights — sconces, echoes, Marrow, the Tier 3 sun — are `LightSource`s feeding the same fixed pool of real lights; echoes use ghost Keepers with **no real light of their own**, so the shader light count never changes. The only real light added is Ilen's lantern, which was already there (now brighter: 10 / 12 m, so shadows read as darkness carved out of light).
- `ShadowSystem` and `Echo` reuse their scratch vectors, light records and sample buffers (no per-frame allocation in those loops). Echo recordings are fixed `Float32Array`s (30 Hz × 8 s).

## Measurements (honest scope)
These numbers come from headless Chromium using SwiftShader (software WebGL) on a 2-core cloud machine. That setup **cannot measure real-GPU frame rate**. The figures that do carry over to real hardware are **draw calls, triangles and CPU simulation time**. They come from `tests/perf.py` at 960×540 on **Medium** after the redesign, and the counts include the shadow and bloom passes.

| Spot | Draw calls / triangles | CPU step |
|---|---|---|
| Entrance | 183 / 54k | 0.29 ms |
| Room I | 179 / 47k | 0.13 ms |
| Hub | 264 / 96k | 0.05 ms |
| Hub, west side | 201 / 99k | 0.14 ms |
| Room II | 165 / 78k | 0.08 ms |
| West passage (id 4) | 124 / 67k | 0.17 ms |
| Room V (id 6) | 179 / 99k | 0.12 ms |
| North passage (id 7) | 220 / 90k | 0.10 ms |
| East passage (id 8) | 178 / 77k | 0.14 ms |
| Room VI (id 9) | 133 / 46k | 0.05 ms |

For comparison, the old 3-room build showed **272 draw calls and 333k triangles** at a single spot, before counting the extra shadow and bloom passes.

**Targets:** 60 fps on a discrete or recent integrated GPU at Medium, and 30 fps or more on older integrated graphics at Low. These targets have **not** been verified on real hardware yet. Turn on *Settings → Show FPS* and please report the numbers.
