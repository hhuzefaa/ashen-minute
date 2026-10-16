import { platform, wall, pillar, arch, brazier, rubble, backdrop } from '../objects/Environment.js';
import { v3 } from './helpers.js';

// Room 1 — THE FIRST EMBER (doc §6.2). ~14 × 18 units, 3.5-unit gap, free rotation, 8° tolerance.
export default {
  id: 1,
  numeral: 'I',
  name: 'The First Ember',
  objective: 'Relight the relic. Let its shadow reach the rune.',
  spawn: { x: 0, z: 7.4, yaw: 0 },
  relic: { x: -1.5, z: 3.0, pedestalHeight: 0.95, startOffsetDeg: 35 },
  target: { x: 1.8, z: -6.6 },
  bridgeZ: [-0.4, -5.1],
  mode: 'free',
  rotateSpeedDeg: 50,
  toleranceDeg: 8,
  bridgeDuration: null,
  jolt: null,
  ember: v3(-1.4, -7.7, 1.1),
  crossZ: -4.6,
  ash: { x0: -8, x1: 8, z0: -10, z1: 10, y: 7 },
  abyss: { x: 0, z: -2.75, w: 30, d: 5 },
  killY: -10,

  build(ctx) {
    platform(ctx, { x0: -7, x1: 7, z0: -1, z1: 9 });
    platform(ctx, { x0: -7, x1: 7, z0: -9, z1: -4.5 });
    // near-side walls
    wall(ctx, { x0: -7.45, z0: -1, x1: -7.45, z1: 9.9, h: 4.2 });
    wall(ctx, { x0: 7.45, z0: -1, x1: 7.45, z1: 9.9, h: 3.6 });
    wall(ctx, { x0: -7.9, z0: 9.45, x1: 7.9, z1: 9.45, h: 4.8, ruin: 0.5 });
    // far-side walls with the exit arch in the north wall
    wall(ctx, { x0: -7.45, z0: -9.9, x1: -7.45, z1: -4.5, h: 4.2 });
    wall(ctx, { x0: 7.45, z0: -9.9, x1: 7.45, z1: -4.5, h: 4.6 });
    wall(ctx, { x0: -7.9, z0: -9.45, x1: -2.2, z1: -9.45, h: 5 });
    wall(ctx, { x0: 2.2, z0: -9.45, x1: 7.9, z1: -9.45, h: 5 });
    ctx.exit = arch(ctx, 0, -9.3);
    ctx.world.addBox(-1.4, 0, -9.9, 1.4, 3.6, -9.2, 'wall'); // sealed threshold
    // pillars & dressing (kept off the walking route)
    pillar(ctx, -5.6, 6.6);
    pillar(ctx, 5.6, 6.6, { broken: true });
    pillar(ctx, -5.6, 1.2, { broken: true });
    pillar(ctx, 5.6, 1.2);
    pillar(ctx, -5.6, -6.2, { broken: true });
    pillar(ctx, 5.6, -7.2);
    brazier(ctx, -4.2, 8.2);
    brazier(ctx, 4.2, 8.2);
    brazier(ctx, -4.6, -8.2);
    brazier(ctx, 4.6, -8.2);
    rubble(ctx, -6.2, 4.2, 6);
    rubble(ctx, 6.1, -0.2, 5);
    rubble(ctx, 6.3, -5.6, 4, 0.8);
    backdrop(ctx, { cx: 0, cz: 0, radius: 30, seed: 21 });
  },
};
