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

## Measurements (honest scope)
These numbers come from headless Chromium using SwiftShader (software WebGL) on a 2-core cloud machine. That setup **cannot measure real-GPU frame rate**. The figures that do carry over to real hardware are **draw calls, triangles and CPU simulation time**. They come from `tests/perf.py` at 960×540, and the counts include the shadow and bloom passes.

| Spot | Medium: draw calls / triangles | Low: draw calls / triangles | CPU step |
|---|---|---|---|
| Entrance | 193 / 57k | 146 / 43k | 0.09 ms |
| Threshold (L1) | 170 / 48k | 109 / 30k | 0.1–0.3 ms |
| Hub | 288 / 98k | 178 / 56k | 0.06–0.2 ms |
| Echo Court (L2) | 178 / 79k | 88 / 41k | 0.07 ms |
| Measured Shadow (L4) | 144 / 68k | 70 / 41k | 0.05 ms |
| Relay (L6) | 188 / 96k | 98 / 57k | 0.09 ms |
| Crossroads (L7) | 235 / 88k | 164 / 60k | 0.05 ms |
| Clockwork (L8) | 205 / 79k | 101 / 38k | 0.09 ms |
| Mirror Hall (L9) | 139 / 45k | 71 / 24k | 0.04 ms |

For comparison, the old 3-room build showed **272 draw calls and 333k triangles** at a single spot, before counting the extra shadow and bloom passes.

**Targets:** 60 fps on a discrete or recent integrated GPU at Medium, and 30 fps or more on older integrated graphics at Low. These targets have **not** been verified on real hardware yet. Turn on *Settings → Show FPS* and please report the numbers.
