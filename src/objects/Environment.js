import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLORS, stoneMaterial, makeRng } from '../game/Palette.js';
import { runeTexture } from './Glyphs.js';
import { LightSource } from '../game/LightPool.js';

// Procedural architecture kit (ENV_* in the asset bible). All geometry is original.
// ctx = { group, world, rng, lights: [], braziers: [] }

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();

const shared = {};
function mat(name) {
  if (!shared[name]) {
    if (name === 'tile') shared[name] = stoneMaterial(0xffffff);
    else if (name === 'body') shared[name] = stoneMaterial(0x2a2a36);
    else if (name === 'wall') shared[name] = stoneMaterial(0xffffff);
    else if (name === 'pillar') shared[name] = stoneMaterial(0x45455a);
    else if (name === 'dark') shared[name] = stoneMaterial(0x1f1f29);
    else if (name === 'metal') shared[name] = new THREE.MeshStandardMaterial({ color: 0x2b2826, roughness: 0.6, metalness: 0.5, flatShading: true });
    else if (name === 'far') shared[name] = new THREE.MeshStandardMaterial({ color: 0x2c3044, roughness: 1, flatShading: true, fog: true });
  }
  return shared[name];
}

// Shared low-cost geometries (performance: a rounded box costs ~200 triangles, a box 12)
const TILE_GEO = new THREE.BoxGeometry(0.97, 0.28, 0.97);
const BLOCK_GEO = new THREE.BoxGeometry(1, 1, 1);
const SPIKE_GEO = new THREE.ConeGeometry(0.6, 1.8, 5);

/** Merge a group's meshes (same material) into one mesh = one draw call. */
export function mergeGroup(g, material) {
  g.updateMatrixWorld(true);
  const parts = [];
  g.traverse((o) => {
    if (!o.isMesh) return;
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.deleteAttribute('uv1');
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.applyMatrix4(o.matrixWorld);
    parts.push(geo);
  });
  const merged = new THREE.Mesh(mergeGeometries(parts, false), material);
  merged.castShadow = true;
  merged.receiveShadow = true;
  return merged;
}

const STONE_TONES = [0x3a3a4a, 0x343443, 0x40404f, 0x37374a, 0x464656, 0x2f2f3d];
function tone(rng, lift = 0) {
  return _c.set(STONE_TONES[Math.floor(rng() * STONE_TONES.length)]).offsetHSL(0, 0, lift + (rng() - 0.5) * 0.03);
}

/** Walkable platform: tiled top, thick stone body, hanging rocks beneath. Collider = full rectangle. */
export function platform(ctx, { x0, x1, z0, z1, y = 0, depth = 1.8, crackChance = 0.06 }) {
  const { group, world, rng } = ctx;
  const w = x1 - x0, d = z1 - z0;
  const nx = Math.round(w), nz = Math.round(d);
  const tiles = new THREE.InstancedMesh(TILE_GEO, mat('tile'), nx * nz);
  let i = 0;
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const cracked = rng() < crackChance;
      _p.set(x0 + (ix + 0.5) * (w / nx), y - 0.14 - rng() * 0.025 - (cracked ? 0.04 : 0), z0 + (iz + 0.5) * (d / nz));
      _e.set((rng() - 0.5) * 0.02, Math.floor(rng() * 4) * (Math.PI / 2), (rng() - 0.5) * (cracked ? 0.06 : 0.02));
      _q.setFromEuler(_e);
      _s.set(w / nx, 1, d / nz);
      _m.compose(_p, _q, _s);
      tiles.setMatrixAt(i, _m);
      tiles.setColorAt(i, tone(rng, cracked ? -0.04 : 0));
      i++;
    }
  }
  tiles.receiveShadow = true;
  group.add(tiles);

  const body = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, depth, d - 0.1), mat('body'));
  body.position.set((x0 + x1) / 2, y - 0.28 - depth / 2, (z0 + z1) / 2);
  body.receiveShadow = true;
  group.add(body);

  // hanging rock spikes along the underside (ENV_Platform_Edge dressing)
  const per = Math.max(4, Math.floor((w + d) * 0.6));
  const spikes = new THREE.InstancedMesh(SPIKE_GEO, mat('body'), per);
  for (let k = 0; k < per; k++) {
    const onX = rng() < w / (w + d);
    const sx = onX ? x0 + 0.5 + rng() * (w - 1) : (rng() < 0.5 ? x0 + 0.6 : x1 - 0.6);
    const sz = onX ? (rng() < 0.5 ? z0 + 0.6 : z1 - 0.6) : z0 + 0.5 + rng() * (d - 1);
    const sc = 0.7 + rng() * 1.3;
    _p.set(sx, y - 0.28 - depth - 0.8 * sc, sz);
    _q.setFromEuler(_e.set(Math.PI + (rng() - 0.5) * 0.3, rng() * 6, (rng() - 0.5) * 0.3));
    _s.set(sc, sc * (0.8 + rng()), sc);
    _m.compose(_p, _q, _s);
    spikes.setMatrixAt(k, _m);
  }
  group.add(spikes);


  world.addBox(x0, y - 2.2, z0, x1, y, z1, 'floor');
}

/** Axis-aligned ruined wall made of stacked blocks. */
export function wall(ctx, { x0, z0, x1, z1, h = 4, thick = 0.9, ruin = 0.35 }) {
  const { group, world, rng } = ctx;
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const bw = 1.2, bh = 0.6;
  const cols = Math.max(1, Math.round(len / bw));
  const rows = Math.round(h / bh);
  const inst = new THREE.InstancedMesh(BLOCK_GEO, mat('wall'), cols * rows);
  let n = 0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const colH = [];
  for (let c = 0; c < cols; c++) {
    // ruined top silhouette: each column loses a random number of top rows
    const loss = rng() < ruin ? Math.floor(rng() * rows * 0.6) : Math.floor(rng() * 2);
    colH.push(rows - loss);
  }
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < colH[c]; r++) {
      const off = (r % 2) * 0.5 * (len / cols);
      let t = -len / 2 + (c + 0.5) * (len / cols) + off;
      if (t > len / 2) continue;
      const bl = (len / cols) * (0.96 - rng() * 0.04);
      _p.set(alongX ? cx + t : cx + (rng() - 0.5) * 0.04, bh * (r + 0.5), alongX ? cz + (rng() - 0.5) * 0.04 : cz + t);
      _q.setFromEuler(_e.set(0, (rng() - 0.5) * 0.03, 0));
      _s.set(alongX ? bl : thick, bh * 0.95, alongX ? thick : bl);
      _m.compose(_p, _q, _s);
      inst.setMatrixAt(n, _m);
      inst.setColorAt(n, tone(rng, -0.02 + r * 0.004));
      n++;
    }
  }
  inst.count = n;
  inst.castShadow = true;
  inst.receiveShadow = true;
  group.add(inst);
  const minH = Math.min(...colH) * bh;
  // collider: full length, at least player height so you can never hop over a ruined section
  const ch = Math.max(minH, 2.4);
  if (alongX) world.addBox(Math.min(x0, x1), 0, cz - thick / 2, Math.max(x0, x1), ch, cz + thick / 2, 'wall');
  else world.addBox(cx - thick / 2, 0, Math.min(z0, z1), cx + thick / 2, ch, Math.max(z0, z1), 'wall');
}

export function pillar(ctx, x, z, { h = 5, broken = false, collide = true, r = 0.42 } = {}) {
  const { group, world, rng } = ctx;
  const g = new THREE.Group();
  const height = broken ? h * (0.35 + rng() * 0.3) : h;
  const base = new THREE.Mesh(new RoundedBoxGeometry(r * 2.6, 0.35, r * 2.6, 1, 0.05), mat('pillar'));
  base.position.y = 0.175;
  g.add(base);
  const shaftGeo = new THREE.CylinderGeometry(r * 0.92, r, height - (broken ? 0.35 : 0.8), 8, 3);
  if (broken) {
    const p = shaftGeo.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.1) p.setY(i, p.getY(i) + (rng() - 0.5) * 0.5);
    shaftGeo.computeVertexNormals();
  }
  const shaft = new THREE.Mesh(shaftGeo, mat('pillar'));
  shaft.position.y = 0.35 + (height - (broken ? 0.35 : 0.8)) / 2;
  g.add(shaft);
  if (!broken) {
    const cap = new THREE.Mesh(new RoundedBoxGeometry(r * 2.8, 0.45, r * 2.8, 1, 0.05), mat('pillar'));
    cap.position.y = height - 0.225;
    g.add(cap);
  } else {
    // fallen chunk beside it
    const chunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 1.1, 8), mat('pillar'));
    chunk.rotation.set(Math.PI / 2, 0, rng() * 3);
    chunk.position.set((rng() - 0.5) * 1.6, r * 0.9, (rng() - 0.5) * 1.6);
    g.add(chunk);
  }
  const merged = mergeGroup(g, mat('pillar'));
  merged.position.set(x, 0, z);
  group.add(merged);
  if (collide) world.addBox(x - r * 1.3, 0, z - r * 1.3, x + r * 1.3, height, z + r * 1.3, 'wall');
  return merged;
}

/** Exit arch (ENV_Exit_Arch). Returns { group, door } — door slab can slide open. */
export function arch(ctx, x, z, { width = 2.8, height = 3.6, yaw = 0, door = false } = {}) {
  const { group, world } = ctx;
  const g = new THREE.Group();
  const post = new RoundedBoxGeometry(0.75, height, 0.9, 1, 0.06);
  const left = new THREE.Mesh(post, mat('pillar'));
  left.position.set(-width / 2 - 0.375, height / 2, 0);
  const right = left.clone();
  right.position.x = width / 2 + 0.375;
  const lintel = new THREE.Mesh(new RoundedBoxGeometry(width + 2.2, 0.75, 1.05, 1, 0.06), mat('pillar'));
  lintel.position.y = height + 0.37;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.6, 4), mat('pillar'));
  cap.position.y = height + 1.05;
  cap.rotation.y = Math.PI / 4;
  // keystone rune
  const runeMat = new THREE.MeshBasicMaterial({ map: runeTexture('target', 9), transparent: true, color: new THREE.Color(COLORS.target).multiplyScalar(0.5), depthWrite: false, toneMapped: false });
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), runeMat);
  rune.position.set(0, height + 0.37, 0.53);
  // dark threshold
  const voidMat = new THREE.MeshBasicMaterial({ color: 0x07080d });
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(width, height), voidMat);
  inner.position.set(0, height / 2, -0.3);
  g.add(left, right, lintel, cap, rune, inner);
  let doorMesh = null;
  if (door) {
    doorMesh = new THREE.Mesh(new RoundedBoxGeometry(width - 0.05, height - 0.05, 0.3, 1, 0.04), mat('dark'));
    doorMesh.position.set(0, height / 2, 0);
    g.add(doorMesh);
  }
  g.traverse((o) => { if (o.isMesh && o !== rune && o !== inner) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  group.add(g);
  // colliders for posts only (axis-aligned assumption: yaw 0 or PI)
  world.addBox(x - width / 2 - 0.75, 0, z - 0.45, x - width / 2, height, z + 0.45, 'wall');
  world.addBox(x + width / 2, 0, z - 0.45, x + width / 2 + 0.75, height, z + 0.45, 'wall');
  return { group: g, door: doorMesh, rune: runeMat };
}

/** Brazier (OBJ_Brazier): starts cold; Game lights it when the room's relic ignites. */
export function brazier(ctx, x, z, { eternal = false, lit = false, dormant = false } = {}) {
  const { group, world } = ctx;
  const g = new THREE.Group();
  const pts = [new THREE.Vector2(0.0, 0), new THREE.Vector2(0.28, 0), new THREE.Vector2(0.18, 0.15), new THREE.Vector2(0.14, 0.75),
    new THREE.Vector2(0.22, 0.82), new THREE.Vector2(0.48, 0.95), new THREE.Vector2(0.52, 1.1), new THREE.Vector2(0.42, 1.08), new THREE.Vector2(0.0, 0.98)];
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 8), mat('metal'));
  bowl.castShadow = true;
  g.add(bowl);
  const coalsMat = new THREE.MeshBasicMaterial({ color: 0x1a1210, toneMapped: false });
  const coals = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), coalsMat);
  coals.scale.set(1, 0.35, 1);
  coals.position.y = 1.03;
  g.add(coals);
  g.position.set(x, 0, z);
  group.add(g);
  const light = new LightSource(COLORS.fire, 0, 9, 1.6);
  light.position.set(x, 1.6, z);
  group.add(light);
  world.addBox(x - 0.35, 0, z - 0.35, x + 0.35, 1.1, z + 0.35, 'wall');
  const b = { pos: new THREE.Vector3(x, 1.12, z), light, coalsMat, lit: lit || (eternal && !dormant), level: lit || (eternal && !dormant) ? 1 : 0, delay: 0, eternal, group: g };
  if (eternal) {
    // eternal hearth: a ring of carved stones marks a flame you can take with your lantern
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.08, 4, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.fire).multiplyScalar(1.6), toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
  }
  ctx.braziers.push(b);
  return b;
}

export function rubble(ctx, x, z, n = 5, scale = 1) {
  const { group, rng } = ctx;
  const geo = new THREE.DodecahedronGeometry(0.3, 0);
  const inst = new THREE.InstancedMesh(geo, mat('tile'), n);
  for (let i = 0; i < n; i++) {
    const sc = (0.4 + rng() * 0.9) * scale;
    _p.set(x + (rng() - 0.5) * 1.4 * scale, sc * 0.15, z + (rng() - 0.5) * 1.4 * scale);
    _q.setFromEuler(_e.set(rng() * 6, rng() * 6, rng() * 6));
    _s.set(sc, sc * (0.6 + rng() * 0.5), sc);
    _m.compose(_p, _q, _s);
    inst.setMatrixAt(i, _m);
    inst.setColorAt(i, tone(rng, -0.02));
  }
  inst.castShadow = true;
  inst.receiveShadow = true;
  group.add(inst);
}

/** Wall-mounted or standing inscription tablet (ENV_Stone_Inscription). */
export function inscription(ctx, x, z, yaw, { color = COLORS.time, intensity = 0.9, seed = 5 } = {}) {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new RoundedBoxGeometry(1.1, 1.6, 0.3, 1, 0.05), mat('pillar'));
  slab.position.y = 0.8;
  slab.castShadow = true;
  const glyphMat = new THREE.MeshBasicMaterial({ map: runeTexture('inscription', seed), transparent: true, color: new THREE.Color(color).multiplyScalar(intensity), depthWrite: false, toneMapped: false });
  const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.06), glyphMat);
  glyph.position.set(0, 0.85, 0.16);
  g.add(slab, glyph);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  ctx.group.add(g);
  ctx.world.addBox(x - 0.55, 0, z - 0.55, x + 0.55, 1.6, z + 0.55, 'wall');
  return { group: g, mat: glyphMat };
}

/** Distant backdrop: floating rocks and ruined towers in the fog (no collision). */
export function backdrop(ctx, { cx = 0, cz = 0, radius = 34, seed = 11 }) {
  const rng = makeRng(seed);
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const n = 18;
  const rocks = new THREE.InstancedMesh(rockGeo, mat('far'), n);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const r = radius * (0.75 + rng() * 0.6);
    const sc = 0.8 + rng() * 2.6;
    _p.set(cx + Math.cos(a) * r, -6 + rng() * 16, cz + Math.sin(a) * r);
    _q.setFromEuler(_e.set(rng() * 3, rng() * 3, rng() * 3));
    _s.set(sc, sc * (0.5 + rng() * 0.6), sc * (0.8 + rng() * 0.4));
    _m.compose(_p, _q, _s);
    rocks.setMatrixAt(i, _m);
  }
  ctx.group.add(rocks);
  ctx.floaters = rocks;
  // ruined towers
  for (let i = 0; i < 5; i++) {
    const a = rng() * Math.PI * 2;
    const r = radius * (1.0 + rng() * 0.5);
    const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
    const tower = new THREE.Group();
    let y = -14;
    let w = 3 + rng() * 2;
    const tiers = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < tiers; k++) {
      const hgt = 4 + rng() * 5;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, w), mat('far'));
      m.position.y = y + hgt / 2;
      m.rotation.y = rng() * 0.3;
      tower.add(m);
      y += hgt;
      w *= 0.72 + rng() * 0.15;
    }
    const spire = new THREE.Mesh(new THREE.ConeGeometry(w * 0.7, 3, 4), mat('far'));
    spire.position.y = y + 1.4;
    spire.rotation.z = (rng() - 0.5) * 0.5; // broken / leaning
    tower.add(spire);
    tower.position.set(tx, 0, tz);
    ctx.group.add(tower);
  }
}


// ---------------------------------------------------------------------------------------------
// Higher-level builders for the connected temple

/** Wall running along X at z, from x0 to x1, with door openings centred at `gaps` (width w). */
export function wallX(ctx, z, x0, x1, h = 5, gaps = [], w = 3.6, opts = {}) {
  let cur = Math.min(x0, x1);
  const end = Math.max(x0, x1);
  for (const g of [...gaps].sort((a, b) => a - b)) {
    const a = g - w / 2, b = g + w / 2;
    if (a - cur > 0.6) wall(ctx, { x0: cur, z0: z, x1: a, z1: z, h, ...opts });
    cur = b;
  }
  if (end - cur > 0.6) wall(ctx, { x0: cur, z0: z, x1: end, z1: z, h, ...opts });
}

/** Wall running along Z at x, from z0 to z1, with door openings centred at `gaps`. */
export function wallZ(ctx, x, z0, z1, h = 5, gaps = [], w = 3.6, opts = {}) {
  let cur = Math.min(z0, z1);
  const end = Math.max(z0, z1);
  for (const g of [...gaps].sort((a, b) => a - b)) {
    const a = g - w / 2, b = g + w / 2;
    if (a - cur > 0.6) wall(ctx, { x0: x, z0: cur, x1: x, z1: a, h, ...opts });
    cur = b;
  }
  if (end - cur > 0.6) wall(ctx, { x0: x, z0: cur, x1: x, z1: end, h, ...opts });
}

/** Sliding rail for a movable relic + its lever. Returns lever world position. */
export function rail(ctx, from, to, slots, lever) {
  const g = new THREE.Group();
  const dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  for (const side of [-0.55, 0.55]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, len + 1.4), mat('metal'));
    bar.position.set((from.x + to.x) / 2 + Math.cos(yaw) * side, 0.04, (from.z + to.z) / 2 - Math.sin(yaw) * side);
    bar.rotation.y = yaw;
    g.add(bar);
  }
  // socket rings at each slot
  for (let i = 0; i < slots; i++) {
    const t = slots === 1 ? 0 : i / (slots - 1);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 4, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.target).multiplyScalar(0.5) }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(from.x + dx * t, 0.03, from.z + dz * t);
    g.add(ring);
  }
  // lever: a post with a handle
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.1, 6), mat('metal'));
  post.position.set(lever.x, 0.55, lever.z);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.target).multiplyScalar(0.9) }));
  handle.position.set(lever.x, 1.2, lever.z);
  handle.rotation.z = 0.5;
  g.add(post, handle);
  ctx.group.add(g);
  ctx.world.addBox(lever.x - 0.2, 0, lever.z - 0.2, lever.x + 0.2, 1.1, lever.z + 0.2, 'wall');
  return { handle };
}

/** Broken colossal statue of a robed Keeper (landmark). */
export function statue(ctx, x, z, yaw = 0, scale = 1, broken = true) {
  const g = new THREE.Group();
  const m = mat('pillar');
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 3.2), m);
  base.position.y = 0.6;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.5, 5.2, 7), m);
  body.position.y = 1.2 + 2.6;
  g.add(base, body);
  if (!broken) {
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), m);
    head.scale.set(1, 1.15, 1.1);
    head.position.y = 7.2;
    g.add(head);
  } else {
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), m);
    head.position.set(2.2, 0.7, 1.4);
    head.rotation.set(0.6, 0.3, 1.2);
    g.add(head);
  }
  // hands cupping an (unlit) bowl
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.4, 0.5, 8, 1, true), m);
  bowl.position.set(0, 4.2, -1.0);
  g.add(bowl);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  g.scale.setScalar(scale);
  const merged = mergeGroup(g, m);
  ctx.group.add(merged);
  ctx.world.addBox(x - 1.6 * scale, 0, z - 1.6 * scale, x + 1.6 * scale, 6 * scale, z + 1.6 * scale, 'wall');
  return merged;
}

let shaftMat = null;
/** Cheap volumetric light shaft (additive cone, no lighting cost). */
export function lightShaft(ctx, x, z, h = 14, r = 2.2, color = 0x9fb5d8, opacity = 0.07) {
  if (!shaftMat) shaftMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r, h, 12, 1, true), shaftMat.clone());
  m.material.color.set(color).multiplyScalar(opacity * 10);
  m.material.opacity = 0.1;
  m.position.set(x, h / 2, z);
  m.rotation.z = 0.12;
  m.renderOrder = 4;
  ctx.group.add(m);
  return m;
}
