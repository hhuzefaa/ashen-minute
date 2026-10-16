import { platform, pillar, brazier, rubble, inscription, backdrop, wallX, wallZ, statue, balustrade, grille } from '../objects/Environment.js';
import { COLORS } from '../game/Palette.js';

// ===============================================================================================
// THE TEMPLE OF MINUTES — one continuous world. x = east, -z = north, 1 unit ≈ 1 m.
//
//            [L7 Crossroads]──┐                          (north wing)
//   [L6 Relay]───────────────┘│
//        │                    │ shortcut
//   [L5 Bent Memory]          │
//        │                    │
// [L4]   N gate     shortcut ─┘
//  │  └shortcut┐  ┌──────────┐            [L9 Mirror Hall]──┐
// [L3]         ├──┤   HUB    ├── E gate ── [L8 Clockwork]───┘ shortcut back to hub
//  │           │  │ (L10)    │
// [L2]── W gate┘  └──────────┘
//                      │ gallery
//                 [L1 Threshold]
//                      │
//                  Entrance terrace (start)
// ===============================================================================================

// Gates: every one is a real door slab with collision. `open` = open at the start of a new game.
export const GATES = [
  { id: 'g_entry', x: 0, z: 62, axis: 'x', open: true },
  { id: 'g_L1', x: 0, z: 33.05, axis: 'x' },
  { id: 'g_hub_w', x: -22.45, z: 0, axis: 'z' },
  { id: 'g_L2', x: -55, z: -12.45, axis: 'x' },
  { id: 'g_L3', x: -55, z: -58.45, axis: 'x' },
  { id: 'g_L4', x: -37.55, z: -90, axis: 'z' },
  { id: 'g_sc_w', x: -22.45, z: -16, axis: 'z' },
  { id: 'g_hub_n', x: 0, z: -22.45, axis: 'x' },
  { id: 'g_L5', x: 0, z: -58.45, axis: 'x' },
  { id: 'g_L6m', x: 2.45, z: -69, axis: 'z' },
  { id: 'g_L6', x: 18.45, z: -88, axis: 'z' },
  { id: 'g_L7', x: 33, z: -61.55, axis: 'x' },
  { id: 'g_sc_n', x: 16, z: -22.45, axis: 'x' },
  { id: 'g_hub_e', x: 22.45, z: 0, axis: 'z' },
  { id: 'g_L8m', x: 39.95, z: 4, axis: 'z' },
  { id: 'g_L8', x: 57, z: 15.45, axis: 'x' },
  { id: 'g_L9', x: 28, z: 26.55, axis: 'x' },
  { id: 'g_sc_e', x: 22.45, z: 13, axis: 'z' },
];
const G = 5.2;   // wall gap that a gate fills exactly
const DOOR = 6.2; // plain doorway width (corridor mouths)

// Lore inscriptions / optional discoveries (ids map to story.js READINGS)
const read = (ctx, id, x, z, yaw, color = COLORS.time) => {
  inscription(ctx, x, z, yaw, { color, intensity: 0.9, seed: id.length * 7 + x });
  ctx.readables.push({ id, x, z });
};

// ------------------------------------------------------------------------------------------------
// Static zones that are not puzzles: entrance + gallery, the hub, and corridors.
export const ZONES = [
  {
    key: 'south', rect: [-14, 14, 21, 80],
    build(ctx) {
      // Entrance terrace — open to the sky and the drop; the temple rises ahead
      platform(ctx, { x0: -7, x1: 7, z0: 61.5, z1: 78 });
      wallZ(ctx, -7.45, 62, 78, 1.4, [], 0, { ruin: 0.6 });
      wallZ(ctx, 7.45, 62, 78, 1.4, [], 0, { ruin: 0.6 });
      statue(ctx, -4.6, 73.5, 0, 0.75, true);
      statue(ctx, 4.6, 73.5, 0, 0.75, false);
      // Gallery between Threshold and the hub (+ optional alcove S1)
      platform(ctx, { x0: -3, x1: 3, z0: 21.5, z1: 33.6 });
      wallZ(ctx, -3.45, 21.5, 33.1, 6);
      wallZ(ctx, 3.45, 21.5, 33.1, 6, [28.5], 3.4);
      platform(ctx, { x0: 2.5, x1: 7, z0: 26.5, z1: 30.5 });
      wallZ(ctx, 7.45, 26.05, 30.95, 4);
      wallX(ctx, 26.05, 3.9, 7.9, 4);
      wallX(ctx, 30.95, 3.9, 7.9, 4);
      read(ctx, 'S1', 6.6, 28.5, -Math.PI / 2, COLORS.target);
      backdrop(ctx, { cx: 0, cz: 55, radius: 40, seed: 5 });
    },
  },
  {
    key: 'hub', rect: [-23, 23, -23, 23],
    build(ctx) {
      // ring walkway around the chasm, island with the dead Heart Ember
      platform(ctx, { x0: -22, x1: 22, z0: 11, z1: 22 });
      platform(ctx, { x0: -22, x1: 22, z0: -22, z1: -11 });
      platform(ctx, { x0: -22, x1: -11, z0: -11, z1: 11 });
      platform(ctx, { x0: 11, x1: 22, z0: -11, z1: 11 });
      platform(ctx, { x0: -4.5, x1: 4.5, z0: -4.5, z1: 4.5, depth: 3 });
      wallX(ctx, 22.45, -22.9, 22.9, 9, [0], DOOR);
      wallZ(ctx, -22.45, -22.9, 22.9, 9, [0, -16], G);
      wallX(ctx, -22.45, -22.9, 22.9, 9, [0, 16], G);
      wallZ(ctx, 22.45, -22.9, 22.9, 9, [0, 13], G);
      // colonnade at the chasm's edge (the final bridge path at x=0, z<-4 stays clear)
      for (const v of [-15, -7.5, 7.5, 15]) {
        pillar(ctx, v, 12.3, { h: 11 }); pillar(ctx, v, -12.3, { h: 11, broken: v === -7.5 });
        pillar(ctx, -12.3, v, { h: 11, broken: v === 7.5 }); pillar(ctx, 12.3, v, { h: 11 });
      }
      for (const [x, z] of [[-19, 19], [19, 19], [-19, -19], [19, -19]]) statue(ctx, x, z, Math.atan2(x, z) + Math.PI, 1.25, x > 0 && z < 0);
      // six braziers, one per restored room — all farther than REACH from every ring stone (rule 1)
      ctx.progressBraziers = [[-16, 20], [16, 20], [-19.5, -15], [19.5, -15], [-8, -19.5], [8, -19.5]]
        .map(([x, z]) => brazier(ctx, x, z));
      backdrop(ctx, { cx: 0, cz: 0, radius: 60, seed: 77 });
    },
  },
  {
    key: 'cw1', rect: [-35, -22, -4, 4],
    build(ctx) {
      platform(ctx, { x0: -34.5, x1: -21.5, z0: -3, z1: 3 });
      wallX(ctx, -3.45, -34, -22.9, 5); wallX(ctx, 3.45, -34, -22.9, 5);
    },
  },
  {
    key: 'cw2', rect: [-59, -51, -26, -12],
    build(ctx) {
      platform(ctx, { x0: -58, x1: -52, z0: -25.6, z1: -12.4 });
      wallZ(ctx, -58.45, -25.6, -12.9, 5); wallZ(ctx, -51.55, -25.6, -12.9, 5);
    },
  },
  {
    key: 'cw3', rect: [-59, -51, -67, -58],
    build(ctx) {
      platform(ctx, { x0: -58, x1: -52, z0: -66.6, z1: -57.6 });
      wallZ(ctx, -58.45, -66.6, -58.9, 5); wallZ(ctx, -51.55, -66.6, -58.9, 5);
    },
  },
  {
    key: 'cn2', rect: [-4, 4, -63, -58],
    build(ctx) {
      platform(ctx, { x0: -3, x1: 3, z0: -63, z1: -57.6 });
      wallZ(ctx, -3.45, -62.05, -58.9, 5); wallZ(ctx, 3.45, -62.05, -58.9, 5);
    },
  },
  {
    key: 'cn3', rect: [18, 25, -92, -84],
    build(ctx) {
      platform(ctx, { x0: 17.5, x1: 25, z0: -91, z1: -85 });
      wallX(ctx, -91.45, 18.9, 24.05, 5); wallX(ctx, -84.55, 18.9, 24.05, 5);
    },
  },
  {
    key: 'ce2', rect: [53, 61, 15, 27],
    build(ctx) {
      platform(ctx, { x0: 54, x1: 60, z0: 14.6, z1: 27.5 });
      wallZ(ctx, 53.55, 15.9, 26.55, 5); wallZ(ctx, 60.45, 15.9, 26.55, 5);
    },
  },
  {
    key: 'sc_w', rect: [-38, -22, -94, -12],
    build(ctx) {
      // the long return walkway from the Measured Shadow back into the hub (a Zelda-style loop)
      platform(ctx, { x0: -38.5, x1: -28, z0: -93, z1: -87 });
      platform(ctx, { x0: -34, x1: -28, z0: -93, z1: -13 });
      platform(ctx, { x0: -34, x1: -21.5, z0: -19, z1: -13 });
      wallX(ctx, -93.45, -37.5, -27.55, 3);
      wallX(ctx, -86.55, -37.5, -34.45, 3);
      wallZ(ctx, -27.55, -93.9, -19.45, 3);
      wallZ(ctx, -34.45, -86.55, -12.55, 3);
      wallX(ctx, -19.45, -27.55, -22.9, 3);
      wallX(ctx, -12.55, -34.9, -22.9, 3);
      for (const z of [-80, -64, -48, -32]) { pillar(ctx, -27.0, z, { h: 6, collide: false }); }
    },
  },
  {
    key: 'cn1', rect: [-4, 4, -33, -22],
    build(ctx) {
      platform(ctx, { x0: -3, x1: 3, z0: -32.5, z1: -21.5 });
      wallZ(ctx, -3.45, -32, -22.9, 6); wallZ(ctx, 3.45, -32, -22.9, 6);
    },
  },
  {
    key: 'sc_n', rect: [12, 37, -62, -22],
    build(ctx) {
      platform(ctx, { x0: 30, x1: 36, z0: -62.5, z1: -28 });
      platform(ctx, { x0: 13, x1: 36, z0: -34, z1: -28 });
      platform(ctx, { x0: 13, x1: 19, z0: -28, z1: -21.5 });
      wallZ(ctx, 29.55, -61.1, -34.45, 3);
      wallZ(ctx, 36.45, -61.1, -27.55, 3);
      wallX(ctx, -34.45, 12.55, 29.55, 3);
      wallX(ctx, -27.55, 19.45, 36.9, 3);
      wallZ(ctx, 12.55, -34.9, -22.9, 3);
      wallZ(ctx, 19.45, -27.55, -22.9, 3);
    },
  },
  {
    key: 'ce1', rect: [22, 33, -4, 4],
    build(ctx) {
      platform(ctx, { x0: 21.5, x1: 32.5, z0: -3, z1: 3 });
      wallX(ctx, -3.45, 22.9, 32, 5); wallX(ctx, 3.45, 22.9, 32, 5);
    },
  },
  {
    key: 'sc_e', rect: [21, 32, 9, 28],
    build(ctx) {
      // return walkway from the Mirror Hall to the Sanctuary's south-east door
      platform(ctx, { x0: 25, x1: 31, z0: 10, z1: 27.5 });
      platform(ctx, { x0: 21.5, x1: 31, z0: 10, z1: 16 });
      wallZ(ctx, 24.55, 16.45, 26.1, 3);
      wallZ(ctx, 31.45, 9.55, 26.1, 3);
      wallX(ctx, 9.55, 22.9, 31.9, 3);
      wallX(ctx, 16.45, 22.9, 24.55, 3);
    },
  },
];

// ------------------------------------------------------------------------------------------------
// The ten levels. Relic/rune fields are documented in docs/LEVEL_DESIGN.md.
export const LEVELS = [
  {
    id: 1, numeral: 'I', name: 'The Threshold', rect: [-10, 10, 33, 62], v2: true,
    spawn: [0, 58, 0], quiet: true,
    objective: 'Cross into the temple.',
    // Introduce: walking swings the stone's shadow. Twist: it falls short of the rune until you
    // step BACK (a farther fire throws a longer shadow). Valid lantern zone: 4.1–9 m behind the
    // stone on the line rune→stone (all on the near platform).
    stones: [{ id: 'A', at: [-1, 49], faceDeg: -15 }, { id: 'L', at: [6.8, 42.5] }],
    runes: [{ id: 'a', at: [1.5, 39.5], stones: ['A'], bridge: { from: [0, 47.6], to: [0, 42.9] } }],
    // Lost Minute 1: after crossing, the far corner's sconce throws stone L's shadow back over the gap
    sconces: [{ id: 'lm', at: [6.5, 35.5] }],
    lostMinutes: [{ id: 'lm1', at: [6.8, 45.2], y: 0.9 }],
    ember: [-4, 36.4],
    barks: { firstShadow: ['MARROW', 'Fire first, child. Where the fire stands, the shadow falls the other way.'] },
    hints: ['Where the fire stands, the shadow falls the other way.', 'A shadow grows as its fire steps back.'],
    onComplete: { gates: ['g_L1', 'g_hub_w'] },
    build(ctx) {
      platform(ctx, { x0: -9, x1: 9, z0: 47, z1: 62 });
      platform(ctx, { x0: -9, x1: 9, z0: 33.5, z1: 43.5 });
      for (const x of [-9.45, 9.45]) { wallZ(ctx, x, 47, 62, 6); wallZ(ctx, x, 33.05, 43.5, 6); }
      wallX(ctx, 33.05, -9.9, 9.9, 7, [0], G);
      pillar(ctx, -7.4, 55, { h: 8 }); pillar(ctx, 7.4, 55, { h: 8, broken: true });
      pillar(ctx, -7.4, 41, { h: 8, broken: true }); pillar(ctx, 7.4, 41, { h: 8 });
      brazier(ctx, -6.5, 59); brazier(ctx, 6.5, 59); brazier(ctx, -6.5, 35.5); // (6.5, 35.5) is now a sconce
      rubble(ctx, -7.6, 48.5, 6); rubble(ctx, 7.8, 36.5, 5);
    },
  },
  {
    id: 2, numeral: 'II', name: 'The Loose Shadow', rect: [-61, -33.5, -13, 17], v2: true,
    spawn: [-36, 0, Math.PI / 2],
    objective: 'Reach the far door.',
    // Introduce: a shadow over the chasm is solid — but your own swings away as you step on it.
    // Twist: kindle a sconce. The near one's shadow (d≈1.9 m → 6.1 m) stops over the abyss; the
    // far one's (d≈7.1 m → 14.4 m) reaches the far platform diagonally and holds for 20 s.
    stones: [{ id: 'A', at: [-42, 0], faceDeg: 90 }],
    runes: [],
    sconces: [{ id: 'near', at: [-40.8, -1.5], burn: 20 }, { id: 'far', at: [-36.5, 4.5], burn: 20 }],
    ember: [-57.6, -9.6],
    barks: { ownFall: ['ILEN', 'I can’t stand where the light has to be.'], sconceHold: ['MARROW', 'A Keeper never carries every fire herself.'] },
    hints: ['You cannot walk the road your own fire draws.', 'Leave a flame behind the stone. Choose the one that reaches.'],
    onComplete: { gates: ['g_L2'] },
    build(ctx) {
      platform(ctx, { x0: -46, x1: -34, z0: -12, z1: 12 });
      platform(ctx, { x0: -60, x1: -50, z0: -12, z1: 12 });
      wallZ(ctx, -33.55, -12.9, 12.9, 6, [0], DOOR);
      wallX(ctx, 12.45, -46.9, -33.1, 6, [-40], 3.4);
      wallX(ctx, 12.45, -60.9, -50, 6);
      wallX(ctx, -12.45, -46.9, -33.1, 6);
      wallX(ctx, -12.45, -60.9, -50, 6, [-55], G);
      wallZ(ctx, -60.45, -12.9, 12.9, 6);
      // alcove S2
      platform(ctx, { x0: -42, x1: -38, z0: 11.5, z1: 16 });
      wallZ(ctx, -42.45, 12.9, 16.9, 4); wallZ(ctx, -37.55, 12.9, 16.9, 4); wallX(ctx, 16.45, -42.9, -37.1, 4);
      read(ctx, 'S2', -40, 15.6, Math.PI);
      pillar(ctx, -44.5, 10.5, { h: 7 }); pillar(ctx, -44.5, -10.5, { h: 7, broken: true });
      pillar(ctx, -51.5, 10.5, { h: 7, broken: true }); pillar(ctx, -51.5, -10.5, { h: 7 });
      brazier(ctx, -35.5, 10.5); brazier(ctx, -35.5, -10.5); brazier(ctx, -58.5, 10.5);
      rubble(ctx, -58.5, 4, 6);
    },
  },
  {
    id: 3, numeral: 'III', name: 'Marrow’s Rounds', rect: [-69, -41, -59, -25.5], v2: true,
    spawn: [-55, -27.5, 0],
    objective: 'Reach the island, then the far door.',
    // Introduce: Marrow's echo walks her rounds on the near platform; her lantern is a fire, so it
    // sweeps stone A's shadow across the first gap twice a loop. Step on as it arrives.
    // Twist: on the island, kindle the sconce: its fire throws island stone B's shadow to the far side.
    // Marrow's patrol is tuned (light map) to ≈4 s crossings every ≈12 s; the island sconce sits
    // 0.5 m beyond the farthest her sweep can reach, so lighting it stays the Keeper's job.
    stones: [{ id: 'A', at: [-55, -34.5] }, { id: 'B', at: [-51.5, -44.9] }],
    runes: [],
    sconces: [{ id: 'isl', at: [-51.5, -42.6], burn: 20 }],
    // Lost Minute 3: ride Marrow's shadow as it swings west past the island, over the side of the gap
    lostMinutes: [{ id: 'lm3', at: [-63.5, -38.5], y: 0.9 }],
    marrow: { path: [{ x: -64, z: -32, wait: 1 }, { x: -46, z: -32, wait: 1 }], speed: 1.6 },
    ember: [-62.5, -55],
    hints: ['Watch my rounds, child. The shadow comes to you.', 'Step on as it arrives. Step off before it leaves.'],
    onComplete: { gates: ['g_L3', 'g_L4', 'g_sc_w', 'g_hub_n'], story: 'rev1' },
    build(ctx) {
      platform(ctx, { x0: -68, x1: -42, z0: -36, z1: -26 });
      platform(ctx, { x0: -62, x1: -48, z0: -46, z1: -40, depth: 3 });
      platform(ctx, { x0: -68, x1: -42, z0: -58, z1: -50 });
      wallX(ctx, -25.55, -68.9, -41.1, 6, [-55], DOOR);
      for (const x of [-68.45, -41.55]) { wallZ(ctx, x, -36, -25.1, 6); wallZ(ctx, x, -58.9, -50, 6); }
      wallX(ctx, -58.45, -68.9, -41.1, 7, [-55], G);
      pillar(ctx, -66.5, -34, { h: 8 }); pillar(ctx, -43.5, -34, { h: 8, broken: true });
      pillar(ctx, -66.5, -52, { h: 8, broken: true }); pillar(ctx, -43.5, -52, { h: 8 });
      // (the island brazier at (-61, -45) stood within reach of stone B — removed: rule 1)
      brazier(ctx, -66.5, -27.5); brazier(ctx, -43.5, -27.5);
      rubble(ctx, -45, -30, 6);
    },
  },
  {
    id: 4, numeral: '', name: 'The Measured Walk', rect: [-73, -37, -97, -66.5], v2: true, passage: true, openWith: 3,
    spawn: [-55, -68.5, 0],
    // Lost Minute 2: the far corner sconce throws stone M's shadow back over the chasm's west end
    stones: [{ id: 'M', at: [-69, -85.5] }], runes: [],
    sconces: [{ id: 'lm', at: [-70, -94] }],
    lostMinutes: [{ id: 'lm2', at: [-68.5, -81.2], y: 0.9 }],
    bridges: [{ from: [-55, -77.4], to: [-55, -84.6] }],
    build(ctx) {
      platform(ctx, { x0: -72, x1: -38, z0: -78, z1: -67 });
      platform(ctx, { x0: -72, x1: -38, z0: -96, z1: -84 });
      wallX(ctx, -66.55, -72.9, -37.1, 6, [-55], DOOR);
      wallZ(ctx, -72.45, -78, -66.1, 6); wallZ(ctx, -72.45, -96.9, -84, 6);
      wallZ(ctx, -37.55, -78, -66.1, 6); wallZ(ctx, -37.55, -96.9, -84, 6, [-90], G);
      wallX(ctx, -96.45, -72.9, -37.1, 7);
      pillar(ctx, -70, -80.5, { h: 8, collide: false }); pillar(ctx, -40, -80.5, { h: 8, broken: true, collide: false });
      brazier(ctx, -70, -68.5); brazier(ctx, -40, -68.5); // (-70, -94) is now a sconce
    },
  },
  {
    id: 5, numeral: 'IV', name: 'The Kept Minute', rect: [-13, 13, -61.5, -31.5], v2: true,
    spawn: [0, -33.6, 0],
    objective: 'Cross. Then open the far door.',
    // Grant: Marrow's sigil gives the minute-mark. Introduce: record the walk to the light spot
    // behind stone A; the echo holds A's shadow across the gap while you cross. Twist: stand ON
    // that echo-held shadow over the abyss — only there is your lantern the right distance behind
    // stone B for B's shadow TIP to land on the door rune (tip test; d ≈ 1.9–3.1 m, all over the gap;
    // the rune sits 1.4 m short of where the closed door clips B's shadow, so the door can't fake it).
    grant: { at: [0, -36.5], ability: 'echo' },
    stones: [{ id: 'A', at: [-5, -42.5] }, { id: 'B', at: [-1.5, -49.5] }],
    runes: [{ id: 'd', at: [-1.5, -56.5], stones: ['B'], tip: true, tol: 0.9, lat: 1.2, gate: 'g_L5', stele: false }],
    ember: [0, -60.3],
    barks: { grant: ['MARROW', 'You can leave a minute behind, Ilen. The temple will walk it for you.'] },
    hints: ['Mark a minute where the light must be.', 'Your echo holds the road. Stand on your own past.'],
    onComplete: { gates: [] },
    build(ctx) {
      platform(ctx, { x0: -12, x1: 12, z0: -44, z1: -32 });
      platform(ctx, { x0: -12, x1: 12, z0: -58, z1: -48 });
      wallX(ctx, -31.55, -12.9, 12.9, 6, [0], DOOR);
      for (const x of [-12.45, 12.45]) { wallZ(ctx, x, -44, -31.1, 6); wallZ(ctx, x, -58.9, -48, 6); }
      wallX(ctx, -58.45, -12.9, 12.9, 7, [0], G);
      pillar(ctx, -10.5, -36, { h: 9 }); pillar(ctx, 10.5, -42, { h: 9, broken: true });
      pillar(ctx, -10.5, -56, { h: 9, broken: true }); pillar(ctx, 10.5, -50, { h: 9 });
      // (the brazier that stood at (-10.5, -42.5) was within reach of stone A — removed: rule 1)
      brazier(ctx, -10.5, -33.5); brazier(ctx, 10.5, -56.5);
    },
  },
  {
    id: 6, numeral: 'V', name: 'The Fire Road', rect: [-15, 19, -95, -62], v2: true,
    spawn: [-1, -64, 0],
    objective: 'Open the inner door. Then cross.',
    // Introduce: three sconces stand beyond a balustrade. Sweep stone W's shadow across them and the
    // fire runs along it; the middle one's fire throws W's shadow onto the door rune.
    // Twist: from the edge, throw stone S's shadow across the abyss onto the far sconce F; F's fire
    // throws S's shadow back to you as a road.
    stones: [{ id: 'W', at: [-9, -69] }, { id: 'S', at: [5, -81] }],
    runes: [{ id: 'g', at: [-3, -69], stones: ['W'], gate: 'g_L6m' }],
    sconces: [
      { id: 's1', at: [-12.5, -72], warded: true }, { id: 's2', at: [-12.5, -69], warded: true }, { id: 's3', at: [-12.5, -66], warded: true },
      { id: 'F', at: [5, -86], warded: true },
    ],
    ember: [15, -92],
    hints: ['Fire follows the shadow’s road.', 'A fire across the abyss can throw a road back to you.'],
    onComplete: { gates: ['g_L6', 'g_L7', 'g_sc_n', 'g_hub_e', 'g_L8m', 'g_L8'], story: 'rev2' },
    build(ctx) {
      platform(ctx, { x0: -14, x1: 3, z0: -76, z1: -62.5 });
      platform(ctx, { x0: 2, x1: 18, z0: -74, z1: -62.5 });
      platform(ctx, { x0: 2, x1: 18, z0: -94, z1: -80 });
      wallX(ctx, -62.05, -14.9, 18.9, 6, [0], DOOR);
      wallZ(ctx, -14.45, -76.9, -62.05, 6);
      wallX(ctx, -76.45, -14.9, 2.9, 6);
      wallZ(ctx, 2.45, -76, -62.5, 6, [-69], G);
      wallZ(ctx, 18.45, -74, -62.05, 6); wallZ(ctx, 18.45, -94.9, -80, 6, [-88], G);
      wallZ(ctx, 1.55, -94.9, -80, 6);
      wallX(ctx, -94.45, 1.1, 18.9, 7);
      balustrade(ctx, { x0: -10, z0: -76, x1: -10, z1: -62.5 }); // the sconce gallery: only a shadow reaches it
      read(ctx, 'L6_hint', -8.6, -63.6, Math.PI / 2 + 0.6);
      pillar(ctx, -12, -74.6, { h: 8 }); pillar(ctx, 16.5, -72, { h: 8, broken: true }); pillar(ctx, 16.5, -82, { h: 8 });
      // (the brazier at (-12.5, -70) became the sconce gallery: rule 1)
      brazier(ctx, 16.5, -64); brazier(ctx, 4, -92.5);
    },
  },
  {
    id: 7, numeral: '', name: 'The Crossroads', rect: [24, 50, -96, -55], v2: true, passage: true, openWith: 6,
    spawn: [26, -88, -Math.PI / 2],
    // Lost Minute 4: a three-sconce chain behind the balustrade — light the first with a shadow,
    // and the fire runs stone to stone; the third reveals the fragment
    stones: [{ id: 'P1', at: [28, -89.3] }, { id: 'P2', at: [34.5, -92.5] }, { id: 'P3', at: [41.5, -92.5] }], runes: [],
    sconces: [{ id: 'c1', at: [31.5, -92.5], warded: true }, { id: 'c2', at: [38.5, -92.5], warded: true }, { id: 'c3', at: [45.5, -92.5], warded: true, reveal: 'lm4' }],
    lostMinutes: [{ id: 'lm4', at: [45.5, -89.4], y: 0.9, hidden: true }],
    build(ctx) {
      platform(ctx, { x0: 24.5, x1: 49, z0: -95, z1: -62 });
      wallZ(ctx, 24.05, -95.9, -61.1, 6, [-88], DOOR);
      wallZ(ctx, 49.45, -95.9, -61.1, 6);
      wallX(ctx, -95.45, 23.6, 49.9, 7);
      wallX(ctx, -61.55, 23.6, 49.9, 7, [33], G);
      wallX(ctx, -84, 38, 49, 4);
      balustrade(ctx, { x0: 24.5, z0: -90.8, x1: 49, z1: -90.8 });
      brazier(ctx, 36, -80);
      pillar(ctx, 44, -66, { h: 8 }); pillar(ctx, 27, -80, { h: 8, broken: true });
    },
  },
  {
    id: 8, numeral: '', name: 'The Clockwork Span', rect: [32, 62, -20, 16], v2: true, passage: true, openWith: 6,
    spawn: [33.5, 0, -Math.PI / 2],
    // Lost Minute 5: a rail stone and a tip rune across the chasm — only one slot leaves room
    // behind the stone (inside the inner wall) for the lantern to stand at the right distance
    stones: [{ id: 'T', rail: { from: [41.5, 10], to: [45.5, 10], slots: 3, start: 0, lever: [43.5, 12.6] } }],
    runes: [{ id: 'lm5r', at: [55.5, 10], stones: ['T'], tip: true, tol: 0.7, stele: false, reveal: 'lm5' }],
    lostMinutes: [{ id: 'lm5', at: [55.5, 10], y: 1.0, hidden: true }],
    bridges: [{ from: [46.4, -4], to: [53.6, -4] }],
    build(ctx) {
      platform(ctx, { x0: 32, x1: 47, z0: -15, z1: 15 });
      platform(ctx, { x0: 53, x1: 61, z0: -15, z1: 15 });
      wallZ(ctx, 31.55, -15.9, 15.9, 6, [0], DOOR);
      wallZ(ctx, 39.95, -15.9, 15.9, 6, [4], G);
      wallX(ctx, -15.45, 31.1, 47, 6, [35], 3.4); wallX(ctx, -15.45, 53, 61.9, 6);
      wallX(ctx, 15.45, 31.1, 47, 6); wallX(ctx, 15.45, 53, 61.9, 6, [57], G);
      wallZ(ctx, 61.45, -15.9, 15.9, 6);
      // alcove S3
      platform(ctx, { x0: 33, x1: 37, z0: -19, z1: -14.5 });
      wallZ(ctx, 32.55, -19.9, -15.9, 4); wallZ(ctx, 37.45, -19.9, -15.9, 4); wallX(ctx, -19.45, 32.1, 37.9, 4);
      read(ctx, 'S3', 35, -18.6, 0);
      brazier(ctx, 37.6, -12.6);
      pillar(ctx, 45.5, 13.5, { h: 9 }); pillar(ctx, 45.5, -13.5, { h: 9, broken: true });
      pillar(ctx, 59.5, 13.5, { h: 9, broken: true }); pillar(ctx, 59.5, -13.5, { h: 9 });
      brazier(ctx, 59.5, 0);
    },
  },
  {
    id: 9, numeral: 'VI', name: 'The Mirror Hall', rect: [23, 68, 26.5, 59], v2: true, quiet: true,
    spawn: [57, 28.5, Math.PI],
    objective: '',
    // No lessons: relay (Ilen's shadow of A lights the grilled sconce E; E throws A's shadow to the
    // island), rail (slide R to the island's edge so a light can stand behind it), echo (it holds
    // R's shadow across the second gap).
    stones: [
      { id: 'A', at: [56.5, 42] },
      { id: 'R', rail: { from: [44, 42], to: [39.2, 42], slots: 2, start: 0, lever: [42, 46.6] } },
    ],
    runes: [],
    sconces: [{ id: 'E', at: [65.5, 42], warded: true }],
    // Lost Minute 6: an echo held at the island's south edge throws R's shadow along the second
    // gap to the far north end — a walk over the abyss on your own past
    lostMinutes: [{ id: 'lm6', at: [35.5, 56], y: 0.9 }],
    ember: [27, 55],
    onComplete: { gates: ['g_L9', 'g_sc_e'], story: 'ring_wakes' },
    build(ctx) {
      platform(ctx, { x0: 50, x1: 63, z0: 27, z1: 58 });
      platform(ctx, { x0: 38, x1: 45, z0: 35, z1: 49, depth: 3 });
      platform(ctx, { x0: 24, x1: 33, z0: 27, z1: 58 });
      wallX(ctx, 26.55, 49.1, 63.9, 6, [57], DOOR); wallX(ctx, 26.55, 23.1, 33, 6, [28], G);
      wallX(ctx, 58.45, 49.1, 63.9, 6); wallX(ctx, 58.45, 23.1, 33, 6);
      wallZ(ctx, 63.45, 26.1, 58.9, 6, [42], 2.4); wallZ(ctx, 23.55, 26.1, 58.9, 6);
      // the grilled niche: a sconce only a shadow can reach
      platform(ctx, { x0: 63, x1: 67, z0: 40.4, z1: 43.6, depth: 1 });
      wallX(ctx, 40.15, 63.45, 67.9, 6); wallX(ctx, 43.85, 63.45, 67.9, 6); wallZ(ctx, 67.45, 40.15, 43.85, 6);
      grille(ctx, { x: 63.3, z0: 40.6, z1: 43.4 });
      pillar(ctx, 51.5, 56.5, { h: 10 }); pillar(ctx, 61.5, 44.8, { h: 10, broken: true });
      pillar(ctx, 25.5, 44, { h: 10 }); pillar(ctx, 31.5, 56.5, { h: 10, broken: true });
      statue(ctx, 30, 52, Math.PI / 2, 0.8, true);
      // (the island brazier at (43.5, 47.5) stood within reach of stone R — removed: rule 1)
      brazier(ctx, 61.5, 28.5); brazier(ctx, 51.5, 28.5); brazier(ctx, 25.5, 28.5);
    },
  },
  {
    id: 10, numeral: '', name: 'The Heart of Minutes', rect: [-23, 23, -23, 23], v2: true, hub: true, quiet: true,
    spawn: [0, 19, 0], maxEchoes: 2, echoPermanent: true,
    objective: 'Hold all three shadows on the Heart.',
    // Three ring stones wake with the ring; each must hold its shadow on a Heart socket at the same
    // time. One Keeper cannot hold three: Ilen leaves two permanent echoes behind.
    stones: [
      { id: 'W', at: [-12.5, -4], dormant: true },
      { id: 'E', at: [12.5, -4], dormant: true },
      { id: 'S', dormant: true, rail: { from: [-6, 20.5], to: [-6, 13.5], slots: 3, start: 0, lever: [-3.6, 17] } },
    ],
    runes: [
      { id: 'w', at: [-3.6, -1.5], stones: ['W'], socket: true, stele: false },
      { id: 'e', at: [3.6, -1.5], stones: ['E'], socket: true, stele: false },
      { id: 's', at: [-1.6, 4.0], stones: ['S'], socket: true, tip: true, tol: 0.8, lat: 1.0, stele: false },
    ],
    finalBridge: { from: [0, -11.6], to: [0, -3.8] },
    ember: [0, -2.8], emberY: 1.4, emberAfterSockets: true,
    hints: ['One Keeper cannot hold three shadows.', 'Leave yourself where the light must stay.'],
    onComplete: { story: 'finale' },
    build() {},
  },
];

// The six rooms, in the order the Keeper meets them (level ids reuse the geometry they stand in).
export const ROOMS = [1, 2, 3, 5, 6, 9];
export const ROOM_COUNT = ROOMS.length;
