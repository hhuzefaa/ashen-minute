import * as THREE from 'three';
import { SHADOW, ShadowSystem, coverDistance, tipDistance } from './ShadowSystem.js';

// Dev tool: window.__ashen.debug.lightMap(levelId, { step, render })
// Grid-samples the room's walkable floor; treats each sample as Ilen's lantern and reports which
// runes each stone's shadow would wake from where, which sconces Ilen's shadow could relay-light,
// and what every sconce would cast if kindled (length, where it crosses the abyss, where it lands).
// Uses ShadowSystem.compute — the exact rule the game runs.
const LANTERN_Y = 0.66;

export function lightMap(game, levelId, { step = 0.5, render = false, extraLights = [] } = {}) {
  const p = game.world.levelById.get(levelId);
  if (!p || !p.isLight) return { error: `level ${levelId} is not a light room` };
  const col = game.collision;
  const [x0, x1, z0, z1] = p.level.rect;
  const out = { level: levelId, name: p.level.name, samples: 0, runes: {}, ilenRelay: {}, sconces: {}, lights: {} };
  const o = { yaw: 0, len: 0, ux: 0, uz: 0, d: 0 };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), tmp = new THREE.Vector3();
  const fake = (stone) => ({ stone, ux: o.ux, uz: o.uz, len: o.len, yaw: o.yaw, d: o.d });
  const runeHit = (ru, s) => (ru.spec.tip ? tipDistance(s, ru.pos.x, ru.pos.z, ru.spec.tol ?? 0.7) : coverDistance(s, ru.pos.x, ru.pos.z)) <= (ru.spec.lat ?? SHADOW.COVER);
  for (const ru of p.runes.values()) out.runes[ru.spec.id] = { valid: 0, wrong: 0, zone: null, byStone: {}, points: [] };
  for (const sc of p.sconces) out.ilenRelay[sc.id] = 0;

  const dots = [];
  for (let x = x0; x <= x1; x += step) {
    for (let z = z0; z <= z1; z += step) {
      if (!col.standingOn(x, z, 0, 'floor')) continue;
      tmp.set(x, 0, z);
      col.resolveCylinder(tmp, 0.34, 1.7, 0.4);
      if (Math.abs(tmp.x - x) + Math.abs(tmp.z - z) > 0.01) continue; // inside a wall / prop
      out.samples++;
      let hitAny = false;
      for (const st of p.stones) {
        if (st.dormant && !st.awake) continue;
        if (!ShadowSystem.compute(col, st.base, x, z, o, a, b)) continue;
        const s = fake(st);
        for (const ru of p.runes.values()) {
          if (!runeHit(ru, s)) continue;
          const r = out.runes[ru.spec.id];
          if (ru.spec.stones.includes(st.id)) {
            r.valid++; hitAny = true;
            r.byStone[st.id] = (r.byStone[st.id] || 0) + 1;
            if (r.points.length < 400) r.points.push([+x.toFixed(2), +z.toFixed(2)]);
            r.zone = r.zone ? [Math.min(r.zone[0], x), Math.max(r.zone[1], x), Math.min(r.zone[2], z), Math.max(r.zone[3], z)] : [x, x, z, z];
          } else r.wrong++;
        }
        for (const sc of p.sconces) if (coverDistance(s, sc.pos.x, sc.pos.z) <= SHADOW.COVER) out.ilenRelay[sc.id]++;
      }
      if (render) dots.push(x, 0.08, z, hitAny ? 1 : 0.2);
    }
  }

  // every fixed light: each sconce as if lit, plus any extra (scripted) lights passed in
  const fixed = p.sconces.map((sc) => ({ id: sc.id, x: sc.pos.x, z: sc.pos.z, group: 'sconces' }))
    .concat(extraLights.map((l) => ({ id: l.id, x: l.x, z: l.z, group: 'lights' })));
  for (const L of fixed) {
    const list = [];
    for (const st of p.stones) {
      if (!ShadowSystem.compute(col, st.base, L.x, L.z, o, a, b)) { list.push({ stone: st.id, shadow: false }); continue; }
      const s = fake(st);
      // walk the shadow: where is there no floor under it (abyss)? does its far end rest on floor?
      const abyss = [];
      let inGap = null, landsOnFloor = false;
      for (let t = SHADOW.START; t <= o.len + SHADOW.TIP; t += 0.25) {
        const px = st.base.x + o.ux * t, pz = st.base.z + o.uz * t;
        const floor = !!col.standingOn(px, pz, 0, 'floor');
        if (!floor && inGap === null) inGap = t;
        if (floor && inGap !== null) { abyss.push([+inGap.toFixed(2), +t.toFixed(2)]); inGap = null; landsOnFloor = true; }
      }
      if (inGap !== null) { abyss.push([+inGap.toFixed(2), +(o.len + SHADOW.TIP).toFixed(2)]); landsOnFloor = false; }
      else if (abyss.length) landsOnFloor = true;
      const runes = [...p.runes.values()].filter((ru) => runeHit(ru, s)).map((ru) => ru.spec.id + (ru.spec.stones.includes(st.id) ? '' : '(wrong)'));
      const relays = p.sconces.filter((sc) => sc.id !== L.id && coverDistance(s, sc.pos.x, sc.pos.z) <= SHADOW.COVER).map((sc) => sc.id);
      list.push({
        stone: st.id, shadow: true, d: +o.d.toFixed(2), len: +o.len.toFixed(2),
        tip: [+(st.base.x + o.ux * o.len).toFixed(2), +(st.base.z + o.uz * o.len).toFixed(2)],
        abyss, crossesAbyss: abyss.length > 0 && landsOnFloor, runes, relays,
      });
    }
    out[L.group][L.id] = list;
  }

  // optional: coloured dots in the scene (gold = a valid rune wakes from here)
  const old = game.scene.getObjectByName('LightMap');
  if (old) game.scene.remove(old);
  if (render && dots.length) {
    const n = dots.length / 4;
    const pos = new Float32Array(n * 3), colr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = dots[i * 4]; pos[i * 3 + 1] = dots[i * 4 + 1]; pos[i * 3 + 2] = dots[i * 4 + 2];
      const on = dots[i * 4 + 3] > 0.5;
      colr[i * 3] = on ? 1 : 0.25; colr[i * 3 + 1] = on ? 0.8 : 0.25; colr[i * 3 + 2] = on ? 0.3 : 0.35;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.18, vertexColors: true, toneMapped: false }));
    pts.name = 'LightMap';
    game.scene.add(pts);
  }
  for (const r of Object.values(out.runes)) r.zone = r.zone && r.zone.map((v) => +v.toFixed(2));
  return out;
}
