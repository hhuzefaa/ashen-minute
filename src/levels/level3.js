import { platform, wall, pillar, arch, brazier, rubble, inscription, backdrop } from '../objects/Environment.js';
import { v3 } from './helpers.js';
import { COLORS } from '../game/Palette.js';

// Room 3 — THE ASHEN SPAN (doc §6.4). ~20 × 24 units, wide abyss, 5° tolerance, 8 s bridge.
// The relic is thrown back and forth on ignition (its memory zig-zags); rewind to the echo and
// fine-adjust. If the span fades, the relic slips again and can be rewound back into place.
export default {
  id: 3,
  numeral: 'III',
  name: 'The Ashen Span',
  objective: 'ALIGN THE SHADOW. CROSS BEFORE THE SPAN FADES.',
  spawn: { x: 0, z: 10.6, yaw: 0 },
  relic: { x: 2.5, z: 7.5, pedestalHeight: 1.35, startOffsetDeg: 13 },
  target: { x: -3.2, z: -5.4 },
  bridgeZ: [2.6, -4.6],
  mode: 'collar',
  collarHalfDeg: 12,
  rotateSpeedDeg: 22,
  toleranceDeg: 5,
  bridgeDuration: 8,
  jolt: [{ toDeg: 95, dur: 0.8 }, { toDeg: 40, dur: 0.6 }, { toDeg: 160, dur: 0.9 }],
  slip: [{ toDeg: 70, dur: 0.6 }],
  ember: v3(2.4, -6.0, 1.1),
  heart: v3(0, -9.0),
  crossZ: -4.2,
  ash: { x0: -11, x1: 11, z0: -13, z1: 13, y: 9 },
  abyss: { x: 0, z: -1, w: 40, d: 10 },
  killY: -12,

  build(ctx) {
    platform(ctx, { x0: -10, x1: 10, z0: 2, z1: 12 });
    platform(ctx, { x0: -10, x1: 10, z0: -12, z1: -4 });
    wall(ctx, { x0: -10.45, z0: 2, x1: -10.45, z1: 12.9, h: 5.4 });
    wall(ctx, { x0: 10.45, z0: 2, x1: 10.45, z1: 12.9, h: 4.8 });
    wall(ctx, { x0: -10.9, z0: 12.45, x1: 10.9, z1: 12.45, h: 6, ruin: 0.5 });
    wall(ctx, { x0: -10.45, z0: -12.9, x1: -10.45, z1: -4, h: 6 });
    wall(ctx, { x0: 10.45, z0: -12.9, x1: 10.45, z1: -4, h: 5.6 });
    wall(ctx, { x0: -10.9, z0: -12.45, x1: -2.2, z1: -12.45, h: 7.2, ruin: 0.3 });
    wall(ctx, { x0: 2.2, z0: -12.45, x1: 10.9, z1: -12.45, h: 7.2, ruin: 0.3 });
    ctx.exit = arch(ctx, 0, -12.2, { door: true, height: 3.8 });
    ctx.world.addBox(-1.4, 0, -12.9, 1.4, 3.8, -11.8, 'wall');
    // tall colonnade for verticality
    for (const z of [9.5, 4.5]) { pillar(ctx, -8.2, z, { h: 8 }); pillar(ctx, 8.2, z, { h: 8, broken: z < 5 }); }
    for (const z of [-6.5, -10.2]) { pillar(ctx, -8.2, z, { h: 8, broken: z > -7 }); pillar(ctx, 8.2, z, { h: 8 }); }
    brazier(ctx, -6.0, 10.6);
    brazier(ctx, 6.0, 10.6);
    inscription(ctx, 5.4, 8.6, -0.6, { color: COLORS.time, intensity: 0.9, seed: 12 });
    rubble(ctx, -8.6, 6.8, 7, 1.2);
    rubble(ctx, 8.8, -8.2, 6, 1.1);
    rubble(ctx, -6.5, -10.8, 5);
    backdrop(ctx, { cx: 0, cz: 0, radius: 36, seed: 47 });
  },
};
