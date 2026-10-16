import { platform, wall, pillar, arch, brazier, rubble, inscription, backdrop } from '../objects/Environment.js';
import { v3 } from './helpers.js';
import { COLORS } from '../game/Palette.js';

// Room 2 — THE BENT MEMORY (doc §6.3). ~16 × 20 units, offset/L-shaped gap, 6° tolerance.
// Design addition (documented in README): on ignition the relic is wrenched far from its old angle
// and its stone collar only lets the Keeper nudge it ±15°. The useful angle survives only in its
// recent memory: rewind back to the cyan echo, then fine-adjust. The jolt never passes through the
// solution, so rewind is genuinely required.
export default {
  id: 2,
  numeral: 'II',
  name: 'The Bent Memory',
  objective: 'The relic remembers an older angle.',
  spawn: { x: 0, z: 8.2, yaw: 0 },
  relic: { x: -3, z: 3.2, pedestalHeight: 0.95, startOffsetDeg: -15 },
  target: { x: 5, z: -7 },
  bridgeZ: [0.6, -4.6],
  mode: 'collar',
  collarHalfDeg: 15,
  rotateSpeedDeg: 26,
  toleranceDeg: 6,
  bridgeDuration: null,
  // offsets (deg) relative to the solution yaw; durations in seconds
  jolt: [{ toDeg: -150, dur: 1.5 }],
  ember: v3(3.4, -8.3, 1.1),
  crossZ: -4.2,
  ash: { x0: -9, x1: 9, z0: -11, z1: 11, y: 7 },
  abyss: { x: 0, z: -4, w: 34, d: 14 },
  killY: -10,

  build(ctx) {
    platform(ctx, { x0: -8, x1: 8, z0: 0, z1: 10 });
    platform(ctx, { x0: 2, x1: 8, z0: -10, z1: -4 });   // NE landing (target + exit)
    platform(ctx, { x0: -8, x1: -2, z0: -10, z1: -4 }); // NW shelf (unreachable, dressing)
    wall(ctx, { x0: -8.45, z0: 0, x1: -8.45, z1: 10.9, h: 4.4 });
    wall(ctx, { x0: 8.45, z0: 0, x1: 8.45, z1: 10.9, h: 3.8 });
    wall(ctx, { x0: -8.9, z0: 10.45, x1: 8.9, z1: 10.45, h: 5, ruin: 0.5 });
    wall(ctx, { x0: 8.45, z0: -10.9, x1: 8.45, z1: -4, h: 4.8 });
    wall(ctx, { x0: 6.4, z0: -10.45, x1: 8.9, z1: -10.45, h: 5 });
    wall(ctx, { x0: -8.9, z0: -10.45, x1: -2, z1: -10.45, h: 5.4, ruin: 0.6 });
    wall(ctx, { x0: -8.45, z0: -10.9, x1: -8.45, z1: -4, h: 4.6 });
    ctx.exit = arch(ctx, 5, -10.3);
    ctx.world.addBox(3.6, 0, -10.9, 6.4, 3.6, -10.2, 'wall');
    ctx.world.addBox(2, 0, -10.9, 3.6, 3.6, -10.0, 'wall');
    pillar(ctx, -6.6, 7.6);
    pillar(ctx, 6.6, 7.6, { broken: true });
    pillar(ctx, 6.6, 1.6);
    pillar(ctx, -6.6, 1.0, { broken: true });
    pillar(ctx, -5, -6.5, { h: 6 });
    pillar(ctx, -4, -8.6, { broken: true });
    pillar(ctx, 7.2, -5.2, { broken: true });
    brazier(ctx, -5.2, 9.2);
    brazier(ctx, 5.2, 9.2);
    brazier(ctx, 7.0, -8.8);
    ctx.echoTablet = inscription(ctx, -5.6, 3.6, 0.5, { color: COLORS.time, intensity: 0.9, seed: 8 });
    rubble(ctx, 7, 4.2, 6);
    rubble(ctx, -7, 5.4, 5);
    rubble(ctx, -6.4, -5, 5);
    backdrop(ctx, { cx: 0, cz: 0, radius: 32, seed: 33 });
  },
};
