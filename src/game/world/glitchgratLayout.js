// Glitchgrat layout: high mountain ridge with deep abysses, 4 zones, peaks, passes, and the Weltenkamm summit.
// Pure logic (no three.js, no DOM) so nav.js and unit tests work directly.
import { vnoise, fbm, zoneWeights, zoneAt } from './layout.js';

export { zoneAt, zoneWeights, vnoise, fbm };
export const HALF = 130; // map is [-130, 130]^2 (260 m)
export const CELL = 2;
export const NG = (HALF * 2) / CELL + 1; // 131
export const SOLID_LIMIT = 124;
export const SLOPE_BLOCK = 0.85;

export const ZONES = [
  { id: 1, key: 'nebelkamm', name: 'Nebelkamm', cx: -65, cz: -65 },
  { id: 2, key: 'blitzschlucht', name: 'Blitzschlucht', cx: -65, cz: 65 },
  { id: 3, key: 'erzplateau', name: 'Eisenerz-Plateau', cx: 65, cz: 65 },
  { id: 4, key: 'weltenkamm', name: 'Der Weltenkamm', cx: 65, cz: -65 },
];
export const GROUND_NAMES = ['rock', 'ore', 'frost', 'core'];
const G = { rock: 0, ore: 1, frost: 2, core: 3 };

export const CAMP = { x: -75, z: -75 };
export const NESTS = {
  1: { x: -45, z: -65 },
  2: { x: -65, z: 65 },
  3: { x: 65, z: 65 },
  4: { x: 65, z: -65 },
};
// Passes between the zones
export const PASSES = [
  { x: -65, z: 0 }, // Z1 - Z2
  { x: 0, z: 65 },  // Z2 - Z3
  { x: 65, z: 0 },  // Z3 - Z4 (ramp up to summit)
  { x: 0, z: -65 }, // Z4 - Z1 (ridge descent)
];

const FLAT_SPOTS = [
  { ...CAMP, r: 12 },
  { ...NESTS[1], r: 12 },
  { ...NESTS[2], r: 14 },
  { ...NESTS[3], r: 15 },
  { ...NESTS[4], r: 18 }, // broad summit arena
];

// Zone 4 Summit Dais / Arena
export const SUMMIT_C = { x: 65, z: -65 };
export const SUMMIT_R = 24;

const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Base elevations per zone
const LEVELS = [12.0, 8.5, 16.0, 22.0];
const AMPS = [0.9, 1.4, 1.1, 0.6];

// Mountain ridges separating the zones
const RIDGES = [
  { axis: 'x', from: -130, to: -25, gap: -65 }, // Z1 | Z2
  { axis: 'z', from: 25, to: 130, gap: 65 },    // Z2 | Z3
  { axis: 'x', from: 25, to: 130, gap: 65 },    // Z3 | Z4
  { axis: 'z', from: -130, to: -25, gap: -65 }, // Z4 | Z1
];

export function buildLayout(seed = 1) {
  const S = seed * 37 + 11;
  const H = new Float32Array(NG * NG);
  const wv = [0, 0, 0, 0];

  const rawHeight = (x, z) => {
    zoneWeights(x, z, 22, wv);
    const level = wv[0] * LEVELS[0] + wv[1] * LEVELS[1] + wv[2] * LEVELS[2] + wv[3] * LEVELS[3];
    const amp = wv[0] * AMPS[0] + wv[1] * AMPS[1] + wv[2] * AMPS[2] + wv[3] * AMPS[3];

    let flat = 1;
    for (const f of FLAT_SPOTS) {
      flat = Math.min(flat, sm(f.r * 0.5, f.r * 1.3, Math.hypot(x - f.x, z - f.z)));
    }

    let h = level + fbm(x / 14, z / 14, S) * amp * flat + fbm(x / 5.0, z / 5.0, S + 33) * 0.25 * flat;

    // Summit elevation in Zone 4
    const dSummit = Math.hypot(x - SUMMIT_C.x, z - SUMMIT_C.z);
    if (dSummit < 34) {
      const p = 1 - sm(SUMMIT_R * 0.8, 34, dSummit);
      h += p * 3.5;
    }

    // Mountain ridges between zones
    let ridge = 0;
    for (const r of RIDGES) {
      const along = r.axis === 'x' ? x : z;
      const across = r.axis === 'x' ? z : x;
      if (along < r.from - 8 || along > r.to + 8) continue;
      const p = 1 - sm(3.5, 9.0, Math.abs(across + fbm(along / 10, 3, S + 5) * 2.0));
      if (p <= 0) continue;
      const g = r.gap === null ? 0 : 1 - sm(6.0, 11.5, Math.abs(along - r.gap));
      ridge = Math.max(ridge, p * (1 - g) * (11 + fbm(x / 8, z / 8, S + 7) * 3.0));
    }
    // Central peak mass
    ridge = Math.max(ridge, (1 - sm(30, 42, Math.hypot(x, z))) * (14 + fbm(x / 8, z / 8, S + 15) * 3.5));
    h += ridge;

    // The arena IS the terrain. Keep a broad, genuinely level fighting surface,
    // with a smooth ramp outside it; decorative meshes must not become a second floor.
    if (dSummit < 38) {
      const blend = sm(SUMMIT_R + 2, 38, dSummit);
      h = 25.5 + (h - 25.5) * blend;
    }

    // Outer edge precipice: cliffs dropping sharply into the deep abyss at the world boundary
    const distEdge = Math.max(Math.abs(x), Math.abs(z));
    if (distEdge > 105) {
      const rim = 1 - sm(105, 114, distEdge);
      const drop = sm(114, 126, distEdge);
      h = h * rim - drop * 35;
    }

    return h;
  };

  for (let j = 0; j < NG; j++) {
    for (let i = 0; i < NG; i++) {
      H[j * NG + i] = rawHeight(-HALF + i * CELL, -HALF + j * CELL);
    }
  }

  // Bilinear height sample
  const heightAt = (x, z) => {
    const u = (x + HALF) / CELL, v = (z + HALF) / CELL;
    const i = Math.floor(u), j = Math.floor(v);
    if (i < 0 || i >= NG - 1 || j < 0 || j >= NG - 1) return -50;
    const fx = u - i, fz = v - j;
    const h00 = H[j * NG + i], h10 = H[j * NG + i + 1], h01 = H[(j + 1) * NG + i], h11 = H[(j + 1) * NG + i + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  };

  const slopeAt = (x, z) => {
    const eps = 1.0;
    const dx = (heightAt(x + eps, z) - heightAt(x - eps, z)) / (2 * eps);
    const dz = (heightAt(x, z + eps) - heightAt(x, z - eps)) / (2 * eps);
    return Math.hypot(dx, dz);
  };

  // Ground material per zone (1 m grid)
  const GN = HALF * 2 + 1;
  const ground = new Uint8Array(GN * GN);
  for (let j = 0; j < GN; j++) {
    for (let i = 0; i < GN; i++) {
      const x = -HALF + i, z = -HALF + j;
      const zid = zoneAt(x, z);
      let g = zid === 1 ? G.rock : zid === 2 ? G.ore : zid === 3 ? G.frost : G.core;
      ground[j * GN + i] = g;
    }
  }
  const groundType = (x, z) => {
    const i = Math.floor(x + HALF), j = Math.floor(z + HALF);
    return i < 0 || j < 0 || i >= GN || j >= GN ? 'rock' : GROUND_NAMES[ground[j * GN + i]];
  };

  // Signed distance field (SDF) to the nearest blocked cell (1 m grid)
  const SN = HALF * 2 + 1;
  const blocked = new Uint8Array(SN * SN);
  for (let j = 0; j < SN; j++) {
    for (let i = 0; i < SN; i++) {
      const x = -HALF + i, z = -HALF + j;
      blocked[j * SN + i] =
        slopeAt(x, z) > SLOPE_BLOCK || heightAt(x, z) < 2.0 || Math.abs(x) > SOLID_LIMIT || Math.abs(z) > SOLID_LIMIT
          ? 1
          : 0;
    }
  }

  const chamfer = (target) => {
    const d = new Float32Array(SN * SN);
    const INF = 1e6, D2 = Math.SQRT2;
    for (let k = 0; k < d.length; k++) d[k] = blocked[k] === target ? 0 : INF;
    for (let j = 0; j < SN; j++) {
      for (let i = 0; i < SN; i++) {
        const k = j * SN + i;
        let v = d[k];
        if (i > 0) v = Math.min(v, d[k - 1] + 1);
        if (j > 0) {
          v = Math.min(v, d[k - SN] + 1);
          if (i > 0) v = Math.min(v, d[k - SN - 1] + D2);
          if (i < SN - 1) v = Math.min(v, d[k - SN + 1] + D2);
        }
        d[k] = v;
      }
    }
    for (let j = SN - 1; j >= 0; j--) {
      for (let i = SN - 1; i >= 0; i--) {
        const k = j * SN + i;
        let v = d[k];
        if (i < SN - 1) v = Math.min(v, d[k + 1] + 1);
        if (j < SN - 1) {
          v = Math.min(v, d[k + SN] + 1);
          if (i < SN - 1) v = Math.min(v, d[k + SN + 1] + D2);
          if (i > 0) v = Math.min(v, d[k + SN - 1] + D2);
        }
        d[k] = v;
      }
    }
    return d;
  };

  const toBlocked = chamfer(1), toFree = chamfer(0);
  const sdf = new Float32Array(SN * SN);
  for (let k = 0; k < sdf.length; k++) {
    sdf[k] = blocked[k] ? -(toFree[k] - 0.5) : toBlocked[k] - 0.5;
  }

  const sdfAt = (x, z) => {
    let u = x + HALF, v = z + HALF;
    u = u < 0 ? 0 : u > SN - 1.001 ? SN - 1.001 : u;
    v = v < 0 ? 0 : v > SN - 1.001 ? SN - 1.001 : v;
    const i = u | 0, j = v | 0, fx = u - i, fz = v - j, k = j * SN + i;
    const a = sdf[k], b = sdf[k + 1], c = sdf[k + SN], d = sdf[k + SN + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };

  // Colliders
  const colliders = [];
  const BK = 16, BN = Math.ceil((HALF * 2) / BK);
  const buckets = Array.from({ length: BN * BN }, () => []);

  const addCollider = (c) => {
    colliders.push(c);
    const x0 = Math.max(0, Math.floor((c.x - c.r + HALF) / BK));
    const x1 = Math.min(BN - 1, Math.floor((c.x + c.r + HALF) / BK));
    const z0 = Math.max(0, Math.floor((c.z - c.r + HALF) / BK));
    const z1 = Math.min(BN - 1, Math.floor((c.z + c.r + HALF) / BK));
    for (let bz = z0; bz <= z1; bz++) {
      for (let bx = x0; bx <= x1; bx++) buckets[bz * BN + bx].push(c);
    }
  };

  const collide = (pos, radius = 0.4) => {
    const lim = SOLID_LIMIT + 3 - radius;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      const s = sdfAt(pos.x, pos.z);
      if (s < radius) {
        const e = 0.6;
        const gx = sdfAt(pos.x + e, pos.z) - sdfAt(pos.x - e, pos.z);
        const gz = sdfAt(pos.x, pos.z + e) - sdfAt(pos.x, pos.z - e);
        const gl = Math.hypot(gx, gz);
        if (gl > 1e-4) {
          const push = Math.min(radius - s, 1.5);
          pos.x += (gx / gl) * push;
          pos.z += (gz / gl) * push;
          moved = true;
        }
      }
      const bx = Math.floor((pos.x + HALF) / BK), bz = Math.floor((pos.z + HALF) / BK);
      if (bx >= 0 && bz >= 0 && bx < BN && bz < BN) {
        for (const c of buckets[bz * BN + bx]) {
          const dx = pos.x - c.x, dz = pos.z - c.z, min = c.r + radius, d2 = dx * dx + dz * dz;
          if (d2 < min * min) {
            const d = Math.sqrt(d2);
            const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
            pos.x = c.x + nx * min;
            pos.z = c.z + nz * min;
            moved = true;
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
        const a = (k / 16) * Math.PI * 2 + r;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (ok(px, pz)) return { x: px, z: pz };
      }
    }
    return { x, z };
  };

  // Camp
  const camp = { x: CAMP.x, z: CAMP.z }, CAMP_ROT = Math.PI / 4;
  const rr = (x, z) => ({
    x: camp.x + x * Math.cos(CAMP_ROT) + z * Math.sin(CAMP_ROT),
    z: camp.z - x * Math.sin(CAMP_ROT) + z * Math.cos(CAMP_ROT),
  });
  const campProps = {
    rot: CAMP_ROT,
    tent: rr(-4, 0),
    chest: rr(3, 0.5),
    fire: rr(0, -1.5),
    flag: rr(0, 4),
  };
  addCollider({ ...campProps.tent, r: 2.0 });
  addCollider({ ...campProps.chest, r: 0.85 });
  addCollider({ ...campProps.fire, r: 0.7 });
  addCollider({ ...campProps.flag, r: 0.2 });

  // Flood fill from camp
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
        reach[nk] = 1;
        q.push(nk);
      }
    }
  }
  const reachable = (x, z) => {
    const i = Math.round(x + HALF), j = Math.round(z + HALF);
    return i >= 0 && j >= 0 && i < SN && j < SN && reach[j * SN + i] === 1;
  };

  // Nests, routes, spawns
  const snap = (p, c = 3) => snapWalkable(p.x, p.z, c);
  const nests = { 1: snap(NESTS[1]), 2: snap(NESTS[2]), 3: snap(NESTS[3]), 4: snap(NESTS[4]) };
  const spawnPoints = [
    { x: camp.x + 6, z: camp.z + 7, yaw: 0.35 },
    { x: camp.x + 9, z: camp.z + 11, yaw: 0.35 },
    { x: camp.x + 3, z: camp.z + 12, yaw: 0.35 },
    { x: camp.x + 10, z: camp.z + 5, yaw: 0.35 },
    { x: camp.x + 6, z: camp.z + 15, yaw: 0.35 },
    { x: camp.x + 13, z: camp.z + 8, yaw: 0.35 },
  ].map((p) => ({ ...snap(p, 1.5), yaw: p.yaw }));

  const R = (arr) => arr.map((p) => snap(p, 3.5));
  const routes = {
    1: R([NESTS[1], { x: -60, z: -40 }, { x: -80, z: -50 }, { x: -50, z: -80 }, { x: -30, z: -50 }]),
    2: R([NESTS[2], { x: -50, z: 80 }, { x: -80, z: 45 }, { x: -40, z: 45 }, { x: -70, z: 85 }]),
    3: R([NESTS[3], { x: 80, z: 50 }, { x: 50, z: 80 }, { x: 75, z: 85 }, { x: 45, z: 45 }]),
    4: R([NESTS[4], { x: 50, z: -50 }, { x: 80, z: -50 }, { x: 80, z: -80 }, { x: 50, z: -80 }]),
  };

  const monsterSpawns = {
    pyrostur: snap({ x: 65, z: -65 }, 4),
    felsengroll: snap({ x: 65, z: 65 }, 4),
    voltiris: snap({ x: -65, z: 65 }, 4),
    gockelok: snap({ x: 65, z: -65 }, 4),
    default: snap({ x: 65, z: -65 }, 4),
  };

  return {
    seed,
    HALF,
    CELL,
    NG,
    SOLID_LIMIT,
    H,
    heights: H,
    heightAt,
    slopeAt,
    ground,
    groundType,
    sdf,
    sdfAt,
    blocked,
    collide,
    walkable,
    snapWalkable,
    reachable,
    reach,
    clearOfColliders,
    addCollider,
    colliders,
    nests,
    camp: { ...camp, y: heightAt(camp.x, camp.z) },
    campProps,
    spawnPoints,
    routes,
    monsterSpawns,
    zoneAt,
    pools: [],
    cracks: [],
    interactables: [],
  };
}
