// Rostwerke layout: heightfield, zones, ground types, collision field, fixtures (Kessel, Kräne, Blitzableiter), nests, routes.
// Pure logic (no three.js, no DOM). Same interface as layout.js (sdfAt, walkable, reachable, colliders ...) so nav.js works unchanged.
import { createRng } from '../../core/rng.js';
import { vnoise, fbm, zoneWeights, zoneAt } from './layout.js';

export { zoneAt, zoneWeights, vnoise, fbm };
export const HALF = 130; // map is [-130, 130]^2 (260 m)
export const CELL = 2;
export const NG = HALF * 2 / CELL + 1; // 131
export const SOLID_LIMIT = 124;
export const SLOPE_BLOCK = 0.85;

export const ZONES = [
  { id: 1, key: 'halden', name: 'Schlackehalden', cx: -65, cz: -65 },
  { id: 2, key: 'halle', name: 'Kesselhalle', cx: -65, cz: 65 },
  { id: 3, key: 'graben', name: 'Giftgraben', cx: 65, cz: 65 },
  { id: 4, key: 'krone', name: 'Turbinenkrone', cx: 65, cz: -65 },
];
export const GROUND_NAMES = ['grass', 'slag', 'metal', 'toxic'];
const G = { grass: 0, slag: 1, metal: 2, toxic: 3 };

export const CAMP = { x: -96, z: -90 };
export const NESTS = { 1: { x: -32, z: -72 }, 2: { x: -92, z: 92 }, 4: { x: 94, z: -94 } };
export const PASSES = [{ x: -65, z: 0 }, { x: 0, z: 65 }, { x: 65, z: 0 }]; // Z1-Z2, Z2-Z3, Z3-Z4 (the long ramp up)
const FLAT_SPOTS = [{ ...CAMP, r: 12 }, { ...NESTS[1], r: 12 }, { ...NESTS[2], r: 13 }, { ...NESTS[4], r: 13 }];

// Zone 2: raised walkways (decks). ramp = side the long ramp is on; len = ramp length (m). Other sides are steep (cliff).
export const DECKS = [
  { x0: -110, x1: -80, z0: 30, z1: 52, h: 3.5, ramp: 'e', len: 14 },
  { x0: -58, x1: -30, z0: 88, z1: 106, h: 6, ramp: 's', len: 18 },
];
// Zone 2: Kessel (collider r). `valve` = angle (rad) where the Dampfventil sits on the Kessel's foot, or null.
export const KESSEL = [
  { x: -104, z: 66, r: 4.2, valve: 0.2 }, { x: -72, z: 78, r: 4.4, valve: 3.6 }, { x: -14, z: 100, r: 4.2, valve: 4.4 },
  { x: -34, z: 54, r: 4.0, valve: 1.6 }, { x: -66, z: 104, r: 4.0, valve: 5.0 }, { x: -56, z: 60, r: 3.8, valve: 3.3 },
  { x: -110, z: 106, r: 4.4, valve: null }, { x: -24, z: 76, r: 3.2, valve: null },
];
// Zone 1: Schrottkräne (mast at x,z, arm along yaw, load hangs above dropAt)
export const CRANES = [{ x: -62, z: -58, yaw: Math.PI / 2, arm: 12 }, { x: -100, z: -40, yaw: Math.PI / 2, arm: 12 }];
// Zone 4: Blitzableiter
export const RODS = [{ x: 40, z: -44 }, { x: 100, z: -42 }, { x: 52, z: -102 }, { x: 74, z: -72 }];
// Zone 4: Turbinenruinen (colliders)
export const TURBINES = [{ x: 60, z: -62, r: 5.5 }, { x: 28, z: -82, r: 5 }, { x: 88, z: -22, r: 4.6 }, { x: 112, z: -70, r: 5 }, { x: 36, z: -20, r: 3.6 }];
// Zone 3: Giftgräben (polylines, w = width) and Stege (gaps in the toxic ground, points on the polylines)
export const CHANNELS = [
  { w: 5, pts: [[12, 100], [36, 92], [58, 96], [84, 88], [106, 92]], steges: [[24, 96], [70, 92.3], [96, 90.2]] },
  { w: 5, pts: [[14, 40], [40, 48], [62, 40], [86, 50], [108, 42]], steges: [[28, 44.3], [62, 40], [98, 45.6]] },
  { w: 4, pts: [[44, 47.3], [54, 70], [46, 93.8]], steges: [[48, 56.4], [51.6, 77.1]] },
];

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
/** distance to channel centreline minus half width (negative inside), plus whether we are on a Steg */
function channelAt(x, z) {
  let best = 1e9, steg = false;
  if (x < 6 || z < 6) return { d: best, steg };
  for (const c of CHANNELS) {
    for (let i = 0; i < c.pts.length - 1; i++) {
      const d = distSeg(x, z, c.pts[i][0], c.pts[i][1], c.pts[i + 1][0], c.pts[i + 1][1]) - c.w / 2;
      if (d < best) best = d;
    }
    for (const s of c.steges) if (Math.hypot(x - s[0], z - s[1]) < 3.6) steg = true;
  }
  return { d: best, steg };
}
/** distance (m) to the nearest toxic channel edge (negative = inside), ignoring Stege */
export const channelDist = (x, z) => channelAt(x, z).d;
export function stegeList() { return CHANNELS.flatMap((c) => c.steges.map((s) => ({ x: s[0], z: s[1], w: c.w }))); }

function deckHeight(x, z) {
  let out = 0;
  for (const d of DECKS) {
    const w = { w: 1.2, e: 1.2, s: 1.2, n: 1.2 };
    w[d.ramp] = d.len;
    const t = Math.max(Math.max(0, d.x0 - x) / w.w, Math.max(0, x - d.x1) / w.e, Math.max(0, d.z0 - z) / w.s, Math.max(0, z - d.z1) / w.n);
    const p = Math.max(0, 1 - t);
    if (p > 0) out = Math.max(out, d.h * p);
  }
  return out;
}

const LEVELS = [0, 0, -2.5, 11];
const AMPS = [1.2, 0.2, 0.45, 0.5];
const RIDGES = [
  { axis: 'x', from: -130, to: -32, gap: -65 },
  { axis: 'z', from: 32, to: 130, gap: 65 },
  { axis: 'x', from: 32, to: 130, gap: 65 },
  { axis: 'z', from: -130, to: -32, gap: null },
];

function heaps(seed) {
  const rng = createRng(seed * 4099 + 3);
  const out = [];
  let guard = 0;
  while (out.length < 15 && guard++ < 300) {
    const x = -118 + rng() * 100, z = -118 + rng() * 100, r = 7 + rng() * 6, h = 2 + rng() * 2.4;
    if (FLAT_SPOTS.some((f) => Math.hypot(x - f.x, z - f.z) < f.r + r)) continue;
    if (Math.hypot(x - PASSES[0].x, z - PASSES[0].z) < r + 14) continue;
    out.push({ x, z, r, h });
  }
  return out;
}

export function buildLayout(seed = 1) {
  const S = seed * 31 + 5;
  const hp = heaps(seed);

  // ---------- heightfield
  const H = new Float32Array(NG * NG);
  const wv = [0, 0, 0, 0];
  const rawHeight = (x, z) => {
    zoneWeights(x, z, 20, wv);
    const level = wv[0] * LEVELS[0] + wv[1] * LEVELS[1] + wv[2] * LEVELS[2] + wv[3] * LEVELS[3];
    const amp = wv[0] * AMPS[0] + wv[1] * AMPS[1] + wv[2] * AMPS[2] + wv[3] * AMPS[3];
    let flat = 1;
    for (const f of FLAT_SPOTS) flat = Math.min(flat, sm(f.r * 0.6, f.r * 1.5, Math.hypot(x - f.x, z - f.z)));
    let h = level + fbm(x / 15, z / 15, S) * amp * flat + fbm(x / 5.5, z / 5.5, S + 40) * 0.2 * flat;
    if (x < 0 && z < 0) for (const a of hp) { const d = Math.hypot(x - a.x, z - a.z); if (d < a.r * 1.8) h += a.h * Math.exp(-(d * d) / (a.r * a.r * 0.5)) * flat; }
    h += deckHeight(x, z);
    if (x > 6 && z > 6) { const c = channelAt(x, z); if (!c.steg && c.d < 2.6) h -= 1.1 * (1 - sm(0, 2.6, c.d)) * (c.d < 0 ? 1 : 1); }
    let ridge = 0;
    for (const r of RIDGES) {
      const along = r.axis === 'x' ? x : z, across = r.axis === 'x' ? z : x;
      if (along < r.from - 8 || along > r.to + 8) continue;
      const p = 1 - sm(3.5, 8.5, Math.abs(across + fbm(along / 11, 3, S + 3) * 2.2));
      if (p <= 0) continue;
      const g = r.gap === null ? 0 : 1 - sm(5.5, 10.5, Math.abs(along - r.gap));
      ridge = Math.max(ridge, p * (1 - g) * (14 + fbm(x / 7, z / 7, S + 9) * 3));
    }
    ridge = Math.max(ridge, (1 - sm(33, 43, Math.hypot(x, z))) * (16 + fbm(x / 9, z / 9, S + 12) * 3));
    h += ridge;
    const e = Math.max(Math.abs(x), Math.abs(z));
    h += 22 * sm(112, 123, e) + fbm(x / 6, z / 6, S + 20) * 1.5 * sm(110, 123, e);
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
  const GN = HALF * 2;
  const ground = new Uint8Array(GN * GN);
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
    const x = -HALF + i + 0.5, z = -HALF + j + 0.5;
    const zid = zoneAt(x, z);
    let g = zid === 1 ? G.slag : zid === 3 ? G.grass : G.metal;
    if (zid === 1 && Math.hypot(x - CAMP.x, z - CAMP.z) < 9) g = G.metal; // plates around the Waggon
    if (zid === 3) { const c = channelAt(x, z); if (c.steg && c.d < 2.6) g = G.metal; else if (c.d < 0) g = G.toxic; }
    ground[j * GN + i] = g;
  }
  const groundType = (x, z) => {
    const i = Math.floor(x + HALF), j = Math.floor(z + HALF);
    return i < 0 || j < 0 || i >= GN || j >= GN ? 'metal' : GROUND_NAMES[ground[j * GN + i]];
  };

  // ---------- cliff field: signed distance (m) to the nearest blocked cell, 1 m grid
  const SN = HALF * 2 + 1;
  const blocked = new Uint8Array(SN * SN);
  for (let j = 0; j < SN; j++) for (let i = 0; i < SN; i++) {
    const x = -HALF + i, z = -HALF + j;
    blocked[j * SN + i] = (slopeAt(x, z) > SLOPE_BLOCK || Math.abs(x) > SOLID_LIMIT || Math.abs(z) > SOLID_LIMIT) ? 1 : 0;
  }
  const chamfer = (target) => {
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

  // ---------- colliders
  const colliders = [];
  const BK = 16, BN = Math.ceil((HALF * 2) / BK);
  const buckets = Array.from({ length: BN * BN }, () => []);
  const addCollider = (c) => {
    colliders.push(c);
    const x0 = Math.max(0, Math.floor((c.x - c.r + HALF) / BK)), x1 = Math.min(BN - 1, Math.floor((c.x + c.r + HALF) / BK));
    const z0 = Math.max(0, Math.floor((c.z - c.r + HALF) / BK)), z1 = Math.min(BN - 1, Math.floor((c.z + c.r + HALF) / BK));
    for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) buckets[bz * BN + bx].push(c);
  };
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
  const clearOfColliders = (x, z, rad) => {
    for (const c of colliders) if (Math.hypot(c.x - x, c.z - z) < c.r + rad) return false;
    return true;
  };

  const walkable = (x, z, clearance = 1.2) => sdfAt(x, z) >= clearance;
  const snapWalkable = (x, z, clearance = 2.5) => {
    const ok = (px, pz) => walkable(px, pz, clearance) && clearOfColliders(px, pz, 1.5);
    if (ok(x, z)) return { x, z };
    for (let r = 1; r < 40; r += 1) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + r, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (ok(px, pz)) return { x: px, z: pz };
      }
    }
    return { x, z };
  };

  // ---------- fixtures: Kessel, Kräne, Blitzableiter, Turbinen, Waggon (all become colliders)
  const interactables = [];
  KESSEL.forEach((k, i) => {
    addCollider({ x: k.x, z: k.z, r: k.r });
    if (k.valve != null) {
      const x = k.x + Math.cos(k.valve) * (k.r + 1.3), z = k.z + Math.sin(k.valve) * (k.r + 1.3);
      interactables.push({ id: `valve${interactables.filter((q) => q.type === 'valve').length + 1}`, type: 'valve', x, z, yaw: Math.atan2(Math.cos(k.valve), Math.sin(k.valve)), zone: 2, kessel: i });
    }
  });
  CRANES.forEach((c, i) => {
    addCollider({ x: c.x, z: c.z, r: 1.6 });
    interactables.push({ id: `crane${i + 1}`, type: 'crane', x: c.x, z: c.z + 2.6, yaw: c.yaw, zone: 1, dropAt: { x: c.x + Math.sin(c.yaw) * c.arm, z: c.z + Math.cos(c.yaw) * c.arm } });
  });
  RODS.forEach((r, i) => {
    addCollider({ x: r.x, z: r.z, r: 0.7 });
    interactables.push({ id: `rod${i + 1}`, type: 'rod', x: r.x, z: r.z, yaw: i * 1.3, zone: 4 });
  });
  TURBINES.forEach((t) => addCollider({ ...t }));
  // Waggon camp: the overturned Waggon (3 collider circles) + tent / chest / fire / flag around campC (same layout as Schotterklamm's camp)
  const WAGON_YAW = 0.5;
  const wagonAt = (s) => ({ x: CAMP.x + Math.sin(WAGON_YAW) * s, z: CAMP.z + Math.cos(WAGON_YAW) * s });
  for (const s of [-3.4, 0, 3.4]) addCollider({ ...wagonAt(s), r: 2.0 });
  const camp = { x: CAMP.x + 11, z: CAMP.z + 4 }, CAMP_ROT = 0.4;
  const rr = (x, z) => ({ x: camp.x + x * Math.cos(CAMP_ROT) + z * Math.sin(CAMP_ROT), z: camp.z - x * Math.sin(CAMP_ROT) + z * Math.cos(CAMP_ROT) });
  const campProps = { rot: CAMP_ROT, wagonYaw: WAGON_YAW, tent: rr(-4, 0), chest: rr(3, 0.5), fire: rr(0, -1.5), flag: rr(0, 4) };
  addCollider({ ...campProps.tent, r: 2.0 }); addCollider({ ...campProps.chest, r: 0.85 });
  addCollider({ ...campProps.fire, r: 0.7 }); addCollider({ ...campProps.flag, r: 0.2 });

  // ---------- flood fill from camp
  const reach = new Uint8Array(SN * SN);
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

  // ---------- nests, spawns, routes
  const snap = (p, c = 3) => snapWalkable(p.x, p.z, c);
  const nests = { 1: snap(NESTS[1]), 2: snap(NESTS[2]), 4: snap(NESTS[4]) };
  nests[3] = snap({ x: 80, z: 24 }); // unused by a Brocken, keeps nestFor total
  const spawnPoints = [
    { x: camp.x + 6, z: camp.z + 7, yaw: 0.35 }, { x: camp.x + 9, z: camp.z + 11, yaw: 0.35 },
    { x: camp.x + 3, z: camp.z + 12, yaw: 0.35 }, { x: camp.x + 10, z: camp.z + 5, yaw: 0.35 },
  ].map((p) => ({ ...snap(p, 1.5), yaw: p.yaw }));
  const R = (arr) => arr.map((p) => snap(p, 3.5));
  const routes = {
    kroll: R([NESTS[2], { x: -58, z: 76 }, { x: -30, z: 80 }, { x: -48, z: 38 }, { x: -64, z: 14 }, { x: -65, z: -16 }, { x: -48, z: -42 }, { x: -78, z: -56 },
      { x: -65, z: -20 }, { x: -65, z: 20 }, { x: -30, z: 40 }, { x: -2, z: 65 }, { x: 14, z: 62 }, { x: -22, z: 66 }, { x: -76, z: 96 }]),
    gorgo: R([NESTS[1], { x: -50, z: -88 }, { x: -76, z: -66 }, { x: -50, z: -30 }, { x: -88, z: -20 }, { x: -110, z: -60 }, { x: -64, z: -44 }, { x: -24, z: -50 }, { x: -28, z: -100 }]),
    voltaro: R([NESTS[4], { x: 76, z: -60 }, { x: 40, z: -56 }, { x: 28, z: -102 }, { x: 64, z: -100 }, { x: 108, z: -100 }, { x: 100, z: -50 }, { x: 65, z: -26 }, { x: 65, z: 10 }, { x: 65, z: -26 }, { x: 50, z: -76 }]),
  };
  const monsterSpawns = {
    kroll: snap({ x: -76, z: 90 }, 4), gorgo: snap({ x: -40, z: -64 }, 4), voltaro: snap({ x: 84, z: -84 }, 4),
  };
  monsterSpawns.default = monsterSpawns.kroll;

  return {
    seed, H, heightAt, slopeAt, ground, groundType, sdf, sdfAt, blocked, collide, walkable, snapWalkable, reachable, reach, clearOfColliders,
    addCollider, colliders, pools: [], cracks: [], nests, camp, campProps, spawnPoints, routes, monsterSpawns, zoneAt, interactables, heaps: hp,
  };
}
