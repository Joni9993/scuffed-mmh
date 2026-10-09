// Schotterklamm layout: heightfield, zones, ground types, collision field, nests and routes.
// Pure logic (no three.js, no DOM) so it is cheap to unit-test. The renderer side lives in schotterklamm.js.
import { createRng } from '../../core/rng.js';

export const HALF = 120; // map is [-120, 120]^2
export const CELL = 2; // heightfield resolution (m)
export const NG = HALF * 2 / CELL + 1; // 121 grid points per side
export const SOLID_LIMIT = 114; // walkable area is clamped to +-(SOLID_LIMIT) - radius
export const SLOPE_BLOCK = 0.85; // gradient above which terrain counts as cliff

export const ZONES = [
  { id: 1, key: 'wiese', name: 'Wackelwiese', cx: -60, cz: -60 },
  { id: 2, key: 'grube', name: 'Knochengrube', cx: -60, cz: 60 },
  { id: 3, key: 'senke', name: 'Schlammsenke', cx: 60, cz: 60 },
  { id: 4, key: 'kamm', name: 'Glutkamm', cx: 60, cz: -60 },
];
export const GROUND = { grass: 0, mud: 1, rock: 2, lava: 3 };
export const GROUND_NAMES = ['grass', 'mud', 'rock', 'lava'];

export const CAMP = { x: -88, z: -78 };
export const NESTS = { 2: { x: -84, z: 86 }, 3: { x: 86, z: 82 }, 4: { x: 88, z: -88 } };
export const PASSES = [{ x: -62, z: 0 }, { x: 0, z: 62 }, { x: 62, z: 0 }]; // Z1-Z2, Z2-Z3, Z3-Z4
const FLAT_SPOTS = [{ ...CAMP, r: 11 }, { ...NESTS[2], r: 12 }, { ...NESTS[3], r: 12 }, { ...NESTS[4], r: 12 }];

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash2 = (ix, iz, s) => {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Smooth 2D value noise in [-1,1]. */
export function vnoise(x, z, s = 1) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, s), b = hash2(ix + 1, iz, s), c = hash2(ix, iz + 1, s), d = hash2(ix + 1, iz + 1, s);
  return ((a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v) * 2 - 1;
}
export const fbm = (x, z, s = 1) => vnoise(x, z, s) * 0.65 + vnoise(x * 2.1 + 17, z * 2.1 - 9, s + 1) * 0.35;

/** Blend weights for zone 1..4 from position (smooth across the dividers). `w` = half-width of the blend band. */
export function zoneWeights(x, z, w = 20, out = [0, 0, 0, 0]) {
  const sx = sm(-w, w, x), sz = sm(-w, w, z);
  out[0] = (1 - sx) * (1 - sz); out[1] = (1 - sx) * sz; out[2] = sx * sz; out[3] = sx * (1 - sz);
  return out;
}
export function zoneAt(x, z) { return x < 0 ? (z < 0 ? 1 : 2) : (z >= 0 ? 3 : 4); }

const LEVELS = [0, -1.5, -3.5, 10];
const AMPS = [0.7, 1.3, 0.9, 1.5];

// divider ridges: axis 'x' = line z=0 running along x; 'z' = line x=0 running along z
const RIDGES = [
  { axis: 'x', from: -120, to: -30, gap: -62 }, // Z1 | Z2
  { axis: 'z', from: 30, to: 120, gap: 62 }, // Z2 | Z3
  { axis: 'x', from: 30, to: 120, gap: 62 }, // Z3 | Z4
  { axis: 'z', from: -120, to: -30, gap: null }, // Z4 | Z1 (closed)
];

function bakeFeatures(seed) {
  const rng = createRng(seed * 7919 + 13);
  // ---- mud pools (zone 3)
  const pools = [];
  let guard = 0;
  while (pools.length < 15 && guard++ < 400) {
    const x = 14 + rng() * 80, z = 14 + rng() * 80, r = 4 + rng() * 4.5;
    if (Math.hypot(x - NESTS[3].x, z - NESTS[3].z) < r + 16) continue;
    if (Math.hypot(x - PASSES[1].x, z - PASSES[1].z) < r + 14) continue;
    if (Math.hypot(x - PASSES[2].x, z - PASSES[2].z) < r + 14) continue;
    if (Math.max(Math.abs(x), Math.abs(z)) + r > 96) continue;
    if (pools.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r + 2.5)) continue;
    pools.push({ x, z, r, p1: rng() * 6.28, p2: rng() * 6.28 });
  }
  // ---- lava cracks (zone 4): polylines
  const cracks = [];
  guard = 0;
  while (cracks.length < 9 && guard++ < 400) {
    let x = 18 + rng() * 76, z = -18 - rng() * 76, a = rng() * 6.28;
    const pts = [{ x, z }];
    const n = 4 + ((rng() * 3) | 0);
    let ok = true;
    for (let i = 0; i < n; i++) {
      a += (rng() - 0.5) * 1.3;
      const len = 4 + rng() * 3.5;
      x += Math.cos(a) * len; z += Math.sin(a) * len;
      pts.push({ x, z });
    }
    for (const p of pts) {
      if (p.x < 14 || p.x > 96 || p.z > -14 || p.z < -96) ok = false;
      if (Math.hypot(p.x - NESTS[4].x, p.z - NESTS[4].z) < 16) ok = false;
      if (Math.hypot(p.x - 62, p.z + 14) < 18) ok = false; // keep the ramp entrance clear
    }
    if (!ok) continue;
    cracks.push({ pts, w: 1.7 + rng() * 0.8 });
  }
  return { pools, cracks };
}

function poolRadiusAt(p, ang) { return p.r * (1 + 0.22 * Math.sin(2 * ang + p.p1) + 0.14 * Math.sin(3 * ang + p.p2)); }
function inPool(p, x, z) {
  const dx = x - p.x, dz = z - p.z;
  if (dx * dx + dz * dz > (p.r * 1.45) ** 2) return 0;
  return Math.hypot(dx, dz) < poolRadiusAt(p, Math.atan2(dz, dx));
}
function distSeg(px, pz, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
  const t = Math.min(1, Math.max(0, ((px - a.x) * dx + (pz - a.z) * dz) / l2));
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}
export function distToCracks(cracks, x, z) {
  let best = 1e9;
  for (const c of cracks) for (let i = 0; i < c.pts.length - 1; i++) { const d = distSeg(x, z, c.pts[i], c.pts[i + 1]) - c.w / 2; if (d < best) best = d; }
  return best;
}

/** Build the whole static layout for a given terrain seed (the terrain is the same for all players). */
export function buildLayout(seed = 1) {
  const feat = bakeFeatures(seed);
  const { pools, cracks } = feat;
  const S = seed * 31 + 5;

  // ---------- heightfield
  const H = new Float32Array(NG * NG);
  const wv = [0, 0, 0, 0];
  const rawHeight = (x, z) => {
    zoneWeights(x, z, 20, wv);
    const level = wv[0] * LEVELS[0] + wv[1] * LEVELS[1] + wv[2] * LEVELS[2] + wv[3] * LEVELS[3];
    const amp = wv[0] * AMPS[0] + wv[1] * AMPS[1] + wv[2] * AMPS[2] + wv[3] * AMPS[3];
    let flat = 1;
    for (const f of FLAT_SPOTS) flat = Math.min(flat, sm(f.r * 0.6, f.r * 1.5, Math.hypot(x - f.x, z - f.z)));
    let h = level + fbm(x / 15, z / 15, S) * amp * flat;
    h += fbm(x / 5.5, z / 5.5, S + 40) * 0.22 * flat;
    // Knochengrube: slightly dished
    h -= 2.2 * (1 - sm(0, 44, Math.hypot(x + 60, z - 60))) * 0.6;
    // ridges between the zones, with canyon gaps
    let ridge = 0;
    for (const r of RIDGES) {
      const along = r.axis === 'x' ? x : z, across = r.axis === 'x' ? z : x;
      if (along < r.from - 8 || along > r.to + 8) continue;
      const p = 1 - sm(3.5, 8.5, Math.abs(across + fbm(along / 11, 3, S + 3) * 2.2));
      if (p <= 0) continue;
      const g = r.gap === null ? 0 : 1 - sm(5.5, 10.5, Math.abs(along - r.gap));
      ridge = Math.max(ridge, p * (1 - g) * (13 + fbm(x / 7, z / 7, S + 9) * 3.2));
    }
    // central massif
    const d0 = Math.hypot(x, z);
    ridge = Math.max(ridge, (1 - sm(33, 43, d0)) * (15 + fbm(x / 9, z / 9, S + 12) * 3));
    h += ridge;
    // outer wall
    const e = Math.max(Math.abs(x), Math.abs(z));
    h += 20 * sm(102, 112, e) + fbm(x / 6, z / 6, S + 20) * 1.5 * sm(100, 112, e);
    // mud pools are dished, lava cracks sink a little
    for (const p of pools) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r * 1.7) h -= 0.55 * (1 - sm(p.r * 0.5, p.r * 1.7, d));
    }
    if (x > 10 && z < -10) { const d = distToCracks(cracks, x, z); if (d < 4) h -= 0.5 * (1 - sm(0, 4, d)); }
    return h;
  };
  for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) H[j * NG + i] = rawHeight(-HALF + i * CELL, -HALF + j * CELL);

  const heightAt = (x, z) => {
    let u = (x + HALF) / CELL, v = (z + HALF) / CELL;
    u = u < 0 ? 0 : u > NG - 1.001 ? NG - 1.001 : u;
    v = v < 0 ? 0 : v > NG - 1.001 ? NG - 1.001 : v;
    const i = u | 0, j = v | 0, fx = u - i, fz = v - j, k = j * NG + i;
    const a = H[k], b = H[k + 1], c = H[k + NG], d = H[k + NG + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
  const slopeAt = (x, z) => {
    const e = 1;
    return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  };

  // ---------- ground types (1 m cells)
  const GN = HALF * 2; // 240 cells
  const ground = new Uint8Array(GN * GN);
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
    const x = -HALF + i + 0.5, z = -HALF + j + 0.5;
    const zid = zoneAt(x, z);
    let g = zid === 2 || zid === 4 ? GROUND.rock : GROUND.grass;
    if (zid === 3) for (const p of pools) if (inPool(p, x, z)) { g = GROUND.mud; break; }
    if (zid === 4 && x > 10 && z < -10 && distToCracks(cracks, x, z) < 0.3) g = GROUND.lava;
    ground[j * GN + i] = g;
  }
  const groundType = (x, z) => {
    const i = Math.floor(x + HALF), j = Math.floor(z + HALF);
    return i < 0 || j < 0 || i >= GN || j >= GN ? 'rock' : GROUND_NAMES[ground[j * GN + i]];
  };

  // ---------- cliff field: signed distance (m) to the nearest blocked cell, 1 m grid
  const SN = HALF * 2 + 1; // 241 points
  const blocked = new Uint8Array(SN * SN);
  for (let j = 0; j < SN; j++) for (let i = 0; i < SN; i++) {
    const x = -HALF + i, z = -HALF + j;
    blocked[j * SN + i] = (slopeAt(x, z) > SLOPE_BLOCK || Math.abs(x) > SOLID_LIMIT || Math.abs(z) > SOLID_LIMIT) ? 1 : 0;
  }
  const chamfer = (target) => { // distance (in cells) to nearest cell with blocked===target
    const d = new Float32Array(SN * SN);
    const INF = 1e6, D2 = Math.SQRT2;
    for (let k = 0; k < d.length; k++) d[k] = blocked[k] === target ? 0 : INF;
    for (let j = 0; j < SN; j++) for (let i = 0; i < SN; i++) {
      const k = j * SN + i; let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + 1);
      if (j > 0) { v = Math.min(v, d[k - SN] + 1); if (i > 0) v = Math.min(v, d[k - SN - 1] + D2); if (i < SN - 1) v = Math.min(v, d[k - SN + 1] + D2); }
      d[k] = v;
    }
    for (let j = SN - 1; j >= 0; j--) for (let i = SN - 1; i >= 0; i--) {
      const k = j * SN + i; let v = d[k];
      if (i < SN - 1) v = Math.min(v, d[k + 1] + 1);
      if (j < SN - 1) { v = Math.min(v, d[k + SN] + 1); if (i < SN - 1) v = Math.min(v, d[k + SN + 1] + D2); if (i > 0) v = Math.min(v, d[k + SN - 1] + D2); }
      d[k] = v;
    }
    return d;
  };
  const toBlocked = chamfer(1), toFree = chamfer(0);
  const sdf = new Float32Array(SN * SN);
  for (let k = 0; k < sdf.length; k++) sdf[k] = blocked[k] ? -(toFree[k] - 0.5) : toBlocked[k] - 0.5;
  const sdfAt = (x, z) => {
    let u = x + HALF, v = z + HALF;
    u = u < 0 ? 0 : u > SN - 1.001 ? SN - 1.001 : u;
    v = v < 0 ? 0 : v > SN - 1.001 ? SN - 1.001 : v;
    const i = u | 0, j = v | 0, fx = u - i, fz = v - j, k = j * SN + i;
    const a = sdf[k], b = sdf[k + 1], c = sdf[k + SN], d = sdf[k + SN + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };

  // ---------- static circle colliders (rocks, trunks, props) with a coarse bucket grid
  const colliders = [];
  const BK = 16, BN = Math.ceil((HALF * 2) / BK);
  const buckets = Array.from({ length: BN * BN }, () => []);
  const addCollider = (c) => {
    colliders.push(c);
    const x0 = Math.max(0, Math.floor((c.x - c.r + HALF) / BK)), x1 = Math.min(BN - 1, Math.floor((c.x + c.r + HALF) / BK));
    const z0 = Math.max(0, Math.floor((c.z - c.r + HALF) / BK)), z1 = Math.min(BN - 1, Math.floor((c.z + c.r + HALF) / BK));
    for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) buckets[bz * BN + bx].push(c);
  };

  /** Push pos (any {x,z}) out of cliffs and colliders. Mutates and returns pos. */
  const collide = (pos, radius = 0.4) => {
    const lim = SOLID_LIMIT + 3 - radius;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      const s = sdfAt(pos.x, pos.z);
      if (s < radius) {
        const e = 0.6;
        const gx = sdfAt(pos.x + e, pos.z) - sdfAt(pos.x - e, pos.z), gz = sdfAt(pos.x, pos.z + e) - sdfAt(pos.x, pos.z - e);
        const gl = Math.hypot(gx, gz);
        if (gl > 1e-4) { const push = Math.min(radius - s, 1.5); pos.x += (gx / gl) * push; pos.z += (gz / gl) * push; moved = true; }
      }
      const bx = Math.floor((pos.x + HALF) / BK), bz = Math.floor((pos.z + HALF) / BK);
      if (bx >= 0 && bz >= 0 && bx < BN && bz < BN) {
        for (const c of buckets[bz * BN + bx]) {
          const dx = pos.x - c.x, dz = pos.z - c.z, min = c.r + radius, d2 = dx * dx + dz * dz;
          if (d2 < min * min) {
            const d = Math.sqrt(d2);
            const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
            pos.x = c.x + nx * min; pos.z = c.z + nz * min; moved = true;
          }
        }
      }
      if (!moved) break;
    }
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.max(-lim, Math.min(lim, pos.z));
    return pos;
  };

  const walkable = (x, z, clearance = 1.2) => sdfAt(x, z) >= clearance;

  /** Nearest walkable, non-lava point (spiral search) with the given clearance. */
  const snapWalkable = (x, z, clearance = 2.5) => {
    if (walkable(x, z, clearance) && groundType(x, z) !== 'lava') return { x, z };
    for (let r = 1; r < 40; r += 1) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + r, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (walkable(px, pz, clearance) && groundType(px, pz) !== 'lava') return { x: px, z: pz };
      }
    }
    return { x, z };
  };

  // ---------- flood fill: which cells can actually be walked to from camp
  const reach = new Uint8Array(SN * SN);
  const camp = snapWalkable(CAMP.x, CAMP.z, 3);
  {
    const q = [Math.round(camp.z + HALF) * SN + Math.round(camp.x + HALF)];
    reach[q[0]] = 1;
    while (q.length) {
      const k = q.pop(), i = k % SN, j = (k / SN) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= SN || nj >= SN) continue;
        const nk = nj * SN + ni;
        if (reach[nk] || sdf[nk] < 1.0) continue;
        reach[nk] = 1; q.push(nk);
      }
    }
  }
  const reachable = (x, z) => {
    const i = Math.round(x + HALF), j = Math.round(z + HALF);
    return i >= 0 && j >= 0 && i < SN && j < SN && reach[j * SN + i] === 1;
  };

  // ---------- nests, spawn, routes (snapped to walkable cells)
  const snap = (p, c = 3) => snapWalkable(p.x, p.z, c);
  const nests = { 2: snap(NESTS[2]), 3: snap(NESTS[3]), 4: snap(NESTS[4]) };
  const spawnPoints = [
    { x: camp.x + 11, z: camp.z + 8, yaw: 0.35 }, { x: camp.x + 14, z: camp.z + 12, yaw: 0.35 },
    { x: camp.x + 9, z: camp.z + 13, yaw: 0.35 }, { x: camp.x + 15, z: camp.z + 6, yaw: 0.35 },
  ].map((p) => ({ ...snap(p, 1.5), yaw: p.yaw }));
  const R = (arr) => arr.map((p) => snap(p, 3.5));
  const routes = {
    jaggo: R([NESTS[2], { x: -58, z: 76 }, { x: -30, z: 56 }, { x: -50, z: 38 }, { x: -62, z: 14 }, { x: -62, z: -16 }, { x: -48, z: -42 }, { x: -70, z: -50 },
      { x: -40, z: -70 }, { x: -62, z: -20 }, { x: -62, z: 20 }, { x: -76, z: 50 }]),
    jaggling: R([{ x: -64, z: -50 }, { x: -44, z: -64 }, { x: -70, z: -80 }, { x: -50, z: -32 }, { x: -78, z: -34 }]),
    barrotz: R([NESTS[3], { x: 66, z: 60 }, { x: 42, z: 76 }, { x: 14, z: 62 }, { x: -22, z: 70 }, { x: 14, z: 62 }, { x: 40, z: 40 },
      { x: 62, z: 24 }, { x: 62, z: 4 }, { x: 62, z: 24 }, { x: 80, z: 44 }]),
    brathalos: R([NESTS[4], { x: 66, z: -66 }, { x: 78, z: -40 }, { x: 62, z: -22 }, { x: 62, z: 2 }, { x: 62, z: 28 }, { x: 78, z: 62 }, { x: 40, z: 44 },
      { x: 62, z: 24 }, { x: 62, z: -22 }, { x: 40, z: -50 }, { x: 30, z: -76 }]),
  };
  const monsterSpawns = {
    jaggo: snap({ x: -58, z: 70 }, 4), jaggling: snap({ x: -60, z: -48 }, 4), barrotz: snap({ x: 70, z: 70 }, 4),
    brathalos: snap({ x: 70, z: -66 }, 4),
  };
  monsterSpawns.default = monsterSpawns.jaggo;

  return {
    seed, H, heightAt, slopeAt, ground, groundType, sdf, sdfAt, blocked, collide, walkable, snapWalkable, reachable, reach,
    addCollider, colliders, pools, cracks, poolRadiusAt, nests, camp, spawnPoints, routes, monsterSpawns, zoneAt,
  };
}
