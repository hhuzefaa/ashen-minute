import * as THREE from 'three';
import { platform, pillar, brazier, rubble, backdrop, wallX, wallZ, statue, arch, fallenColumn } from '../objects/Environment.js';
import { COLORS } from '../game/Palette.js';

// ===============================================================================================
// THE TRAINING COURT — the optional tutorial (New Game → Play Tutorial). A small ruined court of
// the same temple stone, far out in the void (x ≈ 240): no path joins it to the story's temple, and
// nothing here is saved. Four sections in a line, walked toward −z; each is an ordinary room of the
// five rules (LightPuzzle), so the stones, runes, sconces, gates and echoes are the game's own.
//
//   z    0  ┌ A · The Novice Court ┐  look, walk, run · hop the fallen column (corridor)
//      −30  ├ B · Fire and Shadow ─┤  swing a shadow onto the rune → gate · kindle → cross the gap
//      −56  ├ C · Echo of Yourself ┤  mark / release / hold · gate · the echo's light bridges a gap
//    −83.5  ├ D · The Last Lessons ┤  Focus picks the sconce for the rune → gate · lever → gate
//     −126  └ the arch: training complete
//
// Rule 1 truth holds here too: every decorative brazier is > 9 m from every stone.
// ===============================================================================================
export const TX = 240;             // the court's centre line (x)
const G = 5.2;                     // wall gap a gate fills exactly
export const COLUMN_Z = -21;       // the fallen column across the corridor
export const ECHO_SPOT = [TX, -77.2];   // where the echo should be left holding the light
export const FINISH = [TX, -121.4];     // the light under the arch (end of the training)
export const FINISH_R = 1.4;

export const TUTORIAL_GATES = [
  { id: 'g_t1', x: TX, z: -44.45, axis: 'x', tutorial: true },
  { id: 'g_t2', x: TX, z: -70.45, axis: 'x', tutorial: true },
  { id: 'g_t3', x: TX, z: -100.45, axis: 'x', tutorial: true },
  { id: 'g_t4', x: TX, z: -112.45, axis: 'x', tutorial: true },
];

/** Gates closed again when a section is restarted (Backspace). */
export const SECTION_GATES = { 101: [], 102: ['g_t1'], 103: ['g_t2'], 104: ['g_t3', 'g_t4'] };

/** Static decor: lit braziers (atmosphere only — they are never lights for shadows) + the far view. */
export const TUTORIAL_ZONES = [
  {
    key: 'tut', rect: [TX - 8, TX + 8, -127, 6],
    build(ctx) {
      for (const [x, z] of [[-6.2, 2.6], [6.2, 2.6], [-6.2, -12.4], [6.2, -12.4], [-6.2, -61.5], [6.2, -61.5], [-6.2, -124.6], [6.2, -124.6]]) {
        brazier(ctx, TX + x, z, { lit: true });
      }
      backdrop(ctx, { cx: TX, cz: -60, radius: 46, seed: 31 });
    },
  },
];

/** A floor marking: a dashed ring (cyan for the echo's spot, gold for the finish). */
function floorRing(ctx, x, z, r, color, { dashes = 14, width = 0.09 } = {}) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.3), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const g = new THREE.Group();
  const seg = (Math.PI * 2) / dashes;
  for (let i = 0; i < dashes; i++) g.add(new THREE.Mesh(new THREE.RingGeometry(r - width, r, 6, 1, i * seg, seg * 0.6).rotateX(-Math.PI / 2), m));
  g.position.set(x, 0.05, z);
  ctx.group.add(g);
  return g;
}

const side = (ctx, z0, z1, h = 6) => { wallZ(ctx, TX - 7.45, z0, z1, h); wallZ(ctx, TX + 7.45, z0, z1, h); };

export const TUTORIAL_LEVELS = [
  {
    id: 101, numeral: 'Training', name: 'The Novice Court', rect: [TX - 8, TX + 8, -30, 6], v2: true, tutorial: true,
    spawn: [TX, 0, 0], objective: 'Cross the court.',
    stones: [], runes: [], sconces: [],
    build(ctx) {
      platform(ctx, { x0: TX - 7, x1: TX + 7, z0: -14, z1: 4 });
      platform(ctx, { x0: TX - 2.5, x1: TX + 2.5, z0: -30, z1: -14 });
      side(ctx, -14, 4.9);
      wallX(ctx, 4.45, TX - 7.9, TX + 7.9, 6);
      wallX(ctx, -14.45, TX - 7.9, TX + 7.9, 6, [TX], 5);
      wallZ(ctx, TX - 2.95, -30, -14.9, 5); wallZ(ctx, TX + 2.95, -30, -14.9, 5);
      statue(ctx, TX - 4.4, 2.4, Math.PI, 0.55, false); statue(ctx, TX + 4.4, 2.4, Math.PI, 0.55, true);
      pillar(ctx, TX - 6.2, -3, { h: 8 }); pillar(ctx, TX + 6.2, -3, { h: 8, broken: true });
      pillar(ctx, TX - 6.2, -8.5, { h: 8, broken: true }); pillar(ctx, TX + 6.2, -8.5, { h: 8 });
      fallenColumn(ctx, TX - 2.5, TX + 2.5, COLUMN_Z);
      rubble(ctx, TX - 1.8, -25.5, 4, 0.6); rubble(ctx, TX + 5.6, -1, 5, 0.8);
    },
  },
  {
    id: 102, numeral: 'Training', name: 'Fire and Shadow', rect: [TX - 8, TX + 8, -56, -30], v2: true, tutorial: true,
    spawn: [TX, -31.2, 0], objective: 'Reach the far side of the gap.',
    // B1: the rune lies off the corridor's axis, so the shadow has to be swung onto it on purpose.
    // B2: the sconce stands 4 m behind the stone at the edge: its shadow (≈9.4 m) spans the 3.5 m gap.
    stones: [{ id: 'T1', at: [TX, -36] }, { id: 'T2', at: [TX, -51.5] }],
    runes: [{ id: 'r1', at: [TX + 4, -39], stones: ['T1'], gate: 'g_t1' }],
    sconces: [{ id: 'k1', at: [TX, -47.5], burn: 20 }],
    build(ctx) {
      platform(ctx, { x0: TX - 7, x1: TX + 7, z0: -52.5, z1: -30 });
      side(ctx, -52.5, -29.1);
      wallX(ctx, -29.55, TX - 7.9, TX + 7.9, 6, [TX], 5);
      wallX(ctx, -44.45, TX - 7.9, TX + 7.9, 6, [TX], G);
      pillar(ctx, TX - 6.2, -32, { h: 8 }); pillar(ctx, TX + 6.2, -32, { h: 8, broken: true });
      rubble(ctx, TX - 5.8, -50.8, 5); rubble(ctx, TX + 5.6, -42.6, 4, 0.7);
    },
  },
  {
    id: 103, numeral: 'Training', name: 'Echo of Yourself', rect: [TX - 8, TX + 8, -83.5, -56], v2: true, tutorial: true,
    spawn: [TX, -57.6, 0], objective: 'Learn to leave a minute behind.',
    // D: no fire but your own. Your shadow can't carry you, so leave your echo in the ring: its
    // lantern (≈1.8 m behind the stone) throws a ≈5.9 m shadow over the 3.5 m gap.
    stones: [{ id: 'T4', at: [TX, -79] }],
    runes: [], sconces: [],
    build(ctx) {
      platform(ctx, { x0: TX - 7, x1: TX + 7, z0: -80, z1: -56 });
      side(ctx, -80, -56);
      wallX(ctx, -70.45, TX - 7.9, TX + 7.9, 6, [TX], G);
      pillar(ctx, TX - 6.2, -66.5, { h: 8, broken: true }); pillar(ctx, TX + 6.2, -66.5, { h: 8 });
      floorRing(ctx, ECHO_SPOT[0], ECHO_SPOT[1], 0.6, COLORS.time);
      rubble(ctx, TX + 5.8, -78.6, 4, 0.7);
    },
  },
  {
    id: 104, numeral: 'Training', name: 'The Last Lessons', rect: [TX - 8, TX + 8, -127, -83.5], v2: true, tutorial: true,
    spawn: [TX, -85.6, 0], objective: 'Reach the arch at the end of the court.',
    // E1: two sconces; only the west one stands on the rune's line behind the stone.
    // E2: a rail stone; with the sconce lit, the east slot puts its shadow on the rune.
    stones: [
      { id: 'T5', at: [TX, -92] },
      { id: 'T6', rail: { from: [TX - 3, -107], to: [TX + 3, -107], slots: 3, start: 0, lever: [TX, -104.2] } },
    ],
    runes: [
      { id: 'r5', at: [TX + 4, -95], stones: ['T5'], gate: 'g_t3' },
      { id: 'r6', at: [TX + 5.94, -110], stones: ['T6'], gate: 'g_t4', stele: false },
    ],
    sconces: [{ id: 'kw', at: [TX - 2.4, -90.2], burn: 20 }, { id: 'ke', at: [TX + 2.4, -90.2], burn: 20 }, { id: 'kr', at: [TX - 1.5, -102.4], burn: Infinity }],
    build(ctx) {
      platform(ctx, { x0: TX - 7, x1: TX + 7, z0: -126, z1: -83.5 });
      side(ctx, -126, -83.5);
      wallX(ctx, -100.45, TX - 7.9, TX + 7.9, 6, [TX], G);
      wallX(ctx, -112.45, TX - 7.9, TX + 7.9, 6, [TX], G);
      wallX(ctx, -126.45, TX - 7.9, TX + 7.9, 7);
      arch(ctx, TX, -124.4, { width: 2.8, height: 3.6 });
      floorRing(ctx, FINISH[0], FINISH[1], FINISH_R, COLORS.target, { dashes: 20, width: 0.12 });
      pillar(ctx, TX - 6.2, -117, { h: 9 }); pillar(ctx, TX + 6.2, -117, { h: 9, broken: true });
      rubble(ctx, TX - 5.6, -97.5, 5); rubble(ctx, TX + 6, -86.8, 4, 0.7);
    },
  },
];

export const TUTORIAL_IDS = TUTORIAL_LEVELS.map((L) => L.id);
