// Simple, deterministic collision: oriented boxes (yaw only) for floors, walls and bridges.
// Decorative meshes are never colliders (doc §12.1). Bridge colliders are toggled by ShadowBridge.

const CELL = 8;

export class CollisionWorld {
  constructor() {
    this.colliders = [];
    this.grid = new Map();   // static colliders bucketed by XZ cell
    this.dynamic = [];       // colliders that move (rail pedestals) — always checked
    this._set = new Set();
    this._list = [];
  }

  clear() {
    this.colliders.length = 0;
    this.grid.clear();
    this.dynamic.length = 0;
  }

  /** c: { cx, cy, cz, hx, hy, hz, yaw?, tag?, enabled?, dynamic? } */
  add(c) {
    c.yaw = c.yaw ?? 0;
    c.enabled = c.enabled ?? true;
    c.tag = c.tag ?? 'solid';
    c.cos = Math.cos(c.yaw);
    c.sin = Math.sin(c.yaw);
    this.colliders.push(c);
    if (c.dynamic) { this.dynamic.push(c); return c; }
    const r = Math.hypot(c.hx, c.hz); // conservative XZ bounds for rotated boxes
    const x0 = Math.floor((c.cx - r) / CELL), x1 = Math.floor((c.cx + r) / CELL);
    const z0 = Math.floor((c.cz - r) / CELL), z1 = Math.floor((c.cz + r) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const k = i * 100003 + j;
      let b = this.grid.get(k);
      if (!b) { b = []; this.grid.set(k, b); }
      b.push(c);
    }
    return c;
  }

  /** Update a dynamic collider's transform. */
  move(c, cx, cz) { c.cx = cx; c.cz = cz; }

  /** Candidate colliders overlapping the XZ rectangle. */
  query(minX, minZ, maxX, maxZ) {
    const out = this._list, seen = this._set;
    out.length = 0; seen.clear();
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const b = this.grid.get(i * 100003 + j);
      if (!b) continue;
      for (const c of b) if (!seen.has(c)) { seen.add(c); out.push(c); }
    }
    for (const c of this.dynamic) out.push(c);
    return out;
  }

  addBox(x0, y0, z0, x1, y1, z1, tag = 'solid') {
    return this.add({
      cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: (z0 + z1) / 2,
      hx: Math.abs(x1 - x0) / 2, hy: Math.abs(y1 - y0) / 2, hz: Math.abs(z1 - z0) / 2, tag,
    });
  }

  // world -> local XZ (inverse of Three.js rotation.y)
  _local(c, x, z) {
    const dx = x - c.cx, dz = z - c.cz;
    return [dx * c.cos - dz * c.sin, dx * c.sin + dz * c.cos];
  }

  _world(c, lx, lz) {
    return [c.cx + lx * c.cos + lz * c.sin, c.cz - lx * c.sin + lz * c.cos];
  }

  /** Highest walkable top under (x,z) that is not above footY + step. -Infinity if none. */
  groundHeight(x, z, footY, step = 0.4, margin = 0.12) {
    let best = -Infinity;
    for (const c of this.query(x - 1, z - 1, x + 1, z + 1)) {
      if (!c.enabled) continue;
      const top = c.cy + c.hy;
      if (top > footY + step || top < best) continue;
      const [lx, lz] = this._local(c, x, z);
      if (Math.abs(lx) <= c.hx + margin && Math.abs(lz) <= c.hz + margin) best = top;
    }
    return best;
  }

  /** Which tagged collider (if any) is directly under the point. */
  standingOn(x, z, footY, tag) {
    for (const c of this.query(x - 1, z - 1, x + 1, z + 1)) {
      if (!c.enabled || c.tag !== tag) continue;
      const top = c.cy + c.hy;
      if (Math.abs(top - footY) > 0.25) continue;
      const [lx, lz] = this._local(c, x, z);
      if (Math.abs(lx) <= c.hx + 0.15 && Math.abs(lz) <= c.hz + 0.15) return c;
    }
    return null;
  }

  /** Push a vertical cylinder (feet at pos.y) out of any box it intersects horizontally. */
  resolveCylinder(pos, radius, height, step = 0.4) {
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const c of this.query(pos.x - radius - 1, pos.z - radius - 1, pos.x + radius + 1, pos.z + radius + 1)) {
        if (!c.enabled) continue;
        const top = c.cy + c.hy, bottom = c.cy - c.hy;
        if (top <= pos.y + step || bottom >= pos.y + height) continue; // walkable or overhead
        const [lx, lz] = this._local(c, pos.x, pos.z);
        const qx = Math.max(-c.hx, Math.min(c.hx, lx));
        const qz = Math.max(-c.hz, Math.min(c.hz, lz));
        let dx = lx - qx, dz = lz - qz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        let nx, nz;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          nx = lx + (dx / d) * push; nz = lz + (dz / d) * push;
        } else {
          // centre inside the box: exit along the shallowest axis
          const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
          if (px < pz) { nx = Math.sign(lx || 1) * (c.hx + radius); nz = lz; }
          else { nx = lx; nz = Math.sign(lz || 1) * (c.hz + radius); }
        }
        const [wx, wz] = this._world(c, nx, nz);
        pos.x = wx; pos.z = wz;
        moved = true;
      }
      if (!moved) break;
    }
  }

  /** Segment (a -> b) vs solid boxes: returns fraction [0..1] of the first hit, or 1. Used by the camera. */
  raycastFraction(a, b, tags = null) {
    let tMin = 1;
    for (const c of this.query(Math.min(a.x, b.x) - 1, Math.min(a.z, b.z) - 1, Math.max(a.x, b.x) + 1, Math.max(a.z, b.z) + 1)) {
      if (!c.enabled) continue;
      if (tags && !tags.includes(c.tag)) continue;
      const [ax, az] = this._local(c, a.x, a.z);
      const [bx, bz] = this._local(c, b.x, b.z);
      const ay = a.y - c.cy, by = b.y - c.cy;
      const t = segAabb(ax, ay, az, bx - ax, by - ay, bz - az, c.hx, c.hy, c.hz);
      if (t !== null && t < tMin) tMin = t;
    }
    return tMin;
  }
}

function segAabb(ox, oy, oz, dx, dy, dz, hx, hy, hz) {
  let t0 = 0, t1 = 1;
  const o = [ox, oy, oz], d = [dx, dy, dz], h = [hx, hy, hz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < -h[i] || o[i] > h[i]) return null;
    } else {
      let ta = (-h[i] - o[i]) / d[i];
      let tb = (h[i] - o[i]) / d[i];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
  }
  return t0;
}
