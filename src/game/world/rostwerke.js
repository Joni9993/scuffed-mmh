import * as THREE from 'three';
import { lambert, basic } from '../../render/ps1.js';
import { tex } from '../../render/textures.js';
import { createRng, hashSeed } from '../../core/rng.js';
import { sfx } from '../../audio/sfx.js';
import { GATHER_KINDS } from '../../data/gather.js';
import {
  buildLayout, CAMP, zoneWeights, zoneAt, ZONES, HALF, CELL, NG, PASSES, CHANNELS, KESSEL, TURBINES, CRANES, vnoise, channelDist, stegeList,
} from './rostwerkeLayout.js';
import { registerWorldTextures } from './worldTextures.js';
import { put, merge, rockGeo, deadTreeGeo, crystalCluster, bigMushroom, tuftGeo, campGeos, colored } from './props.js';
import {
  kesselGeo, pipeRun, stackGeo, gantryGeo, scrapGeo, barrelGroup, turbineGeo, wagonGeo, stegGeo, valveGeos, craneGeos, rodGeo, RW_BUILDERS, box,
} from './rostwerkeProps.js';
import { createGatherables, BUILDERS } from './gatherables.js';
import { createHazards } from './hazards.js';

export const TERRAIN_SEED = 1;

// Look per zone: sky/fog colour, fog range, ambient and sun light. Dark, greenish smog; the Giftgraben is the thickest.
const ENV = [
  { bg: '#4e5238', near: 20, far: 88, amb: '#a89a78', ambI: 1.55, sun: '#ffb878', sunI: 1.15 },
  { bg: '#444a36', near: 18, far: 80, amb: '#9a9478', ambI: 1.5, sun: '#ffd098', sunI: 1.05 },
  { bg: '#2c4a28', near: 12, far: 60, amb: '#80a070', ambI: 1.45, sun: '#b8e090', sunI: 0.85 },
  { bg: '#2a3040', near: 20, far: 86, amb: '#7a86a8', ambI: 1.45, sun: '#c0c8ff', sunI: 1.0 },
];
const GROUND_TEX = ['slag', 'rustplate', 'bank', 'crownplate'];
const GROUND_TINT = ['#ffffff', '#ffffff', '#e8f0d8', '#f0f4ff'];
const CLIFF_TINT = ['#b0a090', '#c8a888', '#90a078', '#8a92a8'];
const NEST_ZONE = { gorgo: 1, kroll: 2, voltaro: 4 };
const ZONE_BOXES = { 1: [-114, -114, -14, -14], 2: [-114, 14, -14, 114], 3: [14, 14, 114, 114], 4: [14, -114, 114, -14] };
const PIPES = [[0, 1, 5.2], [1, 5, 6.4], [5, 3, 5.6], [3, 7, 6.8], [2, 7, 5.4], [4, 1, 6.0], [6, 0, 5.0]];

// ---------------------------------------------------------------- gather points (deterministic from the hunt seed)
export function placeRostwerkePoints(L, seed) {
  const rng = createRng(hashSeed(`gather|rostwerke|${seed}`));
  const points = [];
  const okSpot = (x, z, kind) => {
    if (!L.reachable(x, z) || !L.walkable(x, z, 2.4) || L.slopeAt(x, z) > 0.4) return false;
    if (L.groundType(x, z) === 'toxic') return false;
    if (Math.hypot(x - L.camp.x, z - L.camp.z) < 10) return false;
    for (const n of Object.values(L.nests)) if (Math.hypot(x - n.x, z - n.z) < 8) return false;
    if (!L.clearOfColliders(x, z, 1.6)) return false;
    for (const p of points) if (Math.hypot(p.pos.x - x, p.pos.z - z) < 5.5) return false;
    if (kind === 'giftschlamm') { const d = channelDist(x, z); if (d < 1.2 || d > 4.5) return false; }
    else if (zoneAt(x, z) === 3 && channelDist(x, z) < 2.2) return false;
    return true;
  };
  for (const zone of [1, 2, 3, 4]) {
    const b = ZONE_BOXES[zone];
    for (const [kind, def] of Object.entries(GATHER_KINDS)) {
      if (def.world !== 'rostwerke') continue;
      const n = def.zones[zone] ?? 0;
      for (let i = 0; i < n; i++) {
        let spot = null;
        for (let tries = 0; tries < 400 && !spot; tries++) {
          const x = b[0] + rng() * (b[2] - b[0]), z = b[1] + rng() * (b[3] - b[1]);
          if (zoneAt(x, z) === zone && okSpot(x, z, kind)) spot = { x, z };
        }
        if (!spot) continue;
        const uses = rng.int(def.uses[0], def.uses[1]);
        points.push({ id: `g${zone}-${points.length}`, kind, zone, pos: { x: spot.x, y: L.heightAt(spot.x, spot.z), z: spot.z }, usesLeft: uses, maxUses: uses, yaw: rng() * 6.28 });
      }
    }
  }
  return points;
}

export function createRostwerke({ seed = 1 } = {}) {
  registerWorldTextures();
  const L = buildLayout(TERRAIN_SEED);
  const rng = createRng(TERRAIN_SEED * 131 + 11);
  const group = new THREE.Group();
  group.name = 'rostwerke';
  const hAt = L.heightAt;

  // ================================================================ terrain: per zone one ground mesh + one cliff mesh (chunked)
  const tmpC = new THREE.Color();
  const col = (hex, k = 1) => tmpC.set(hex).multiplyScalar(k);
  function vertexColor(zone, x, z, h, slope, out) {
    const n = vnoise(x * 0.35, z * 0.35, 9) * 0.5 + vnoise(x * 0.11, z * 0.11, 3) * 0.5;
    if (slope > 0.5) {
      const band = Math.sin(h * 1.7 + vnoise(x * 0.1, z * 0.1, 5) * 3) > 0 ? 1 : 0.78;
      col(CLIFF_TINT[zone - 1], band * (0.8 + n * 0.14));
    } else {
      col(GROUND_TINT[zone - 1], 0.85 + n * 0.18);
      if (zone === 3) {
        const d = channelDist(x, z);
        if (d < 2.6) tmpC.multiplyScalar(0.55 + 0.45 * Math.max(0, d / 2.6)); // wet, dark banks
        tmpC.r *= 0.95; tmpC.b *= 0.9;
      }
      if (zone === 2 && h > 0.6) tmpC.multiplyScalar(1.12); // raised walkways read lighter
      if (zone === 1 && vnoise(x * 0.8, z * 0.8, 21) > 0.62) { tmpC.r += 0.18; tmpC.g += 0.04; } // glowing slag veins
    }
    out[0] = tmpC.r; out[1] = tmpC.g; out[2] = tmpC.b;
  }
  const terrainMats = GROUND_TEX.map((t) => lambert({ map: tex(t, { size: 32 }), vertexColors: true }));
  const cliffMat = lambert({ map: tex('rustwall', { size: 32 }), vertexColors: true });
  const col3 = [0, 0, 0];
  const QUAD = [{ i0: 0, j0: 0 }, { i0: 0, j0: 65 }, { i0: 65, j0: 65 }, { i0: 65, j0: 0 }];
  for (const zone of ZONES) {
    const { i0, j0 } = QUAD[zone.id - 1];
    const n = 66;
    const P = new Float32Array(n * n * 3), N = new Float32Array(n * n * 3), UV = new Float32Array(n * n * 2), C = new Float32Array(n * n * 3);
    const slopes = new Float32Array(n * n);
    for (let jj = 0; jj < n; jj++) for (let ii = 0; ii < n; ii++) {
      const i = i0 + ii, j = j0 + jj, k = jj * n + ii;
      const x = -HALF + i * CELL, z = -HALF + j * CELL, h = L.H[j * NG + i];
      const hx = (L.H[j * NG + Math.min(NG - 1, i + 1)] - L.H[j * NG + Math.max(0, i - 1)]) / (CELL * (i === 0 || i === NG - 1 ? 1 : 2));
      const hz = (L.H[Math.min(NG - 1, j + 1) * NG + i] - L.H[Math.max(0, j - 1) * NG + i]) / (CELL * (j === 0 || j === NG - 1 ? 1 : 2));
      const nl = Math.hypot(hx, 1, hz);
      P[k * 3] = x; P[k * 3 + 1] = h; P[k * 3 + 2] = z;
      N[k * 3] = -hx / nl; N[k * 3 + 1] = 1 / nl; N[k * 3 + 2] = -hz / nl;
      UV[k * 2] = x / 5; UV[k * 2 + 1] = z / 5;
      slopes[k] = Math.hypot(hx, hz);
      vertexColor(zone.id, x, z, h, slopes[k], col3);
      C[k * 3] = col3[0]; C[k * 3 + 1] = col3[1]; C[k * 3 + 2] = col3[2];
    }
    const CH = 33, groups = new Map();
    for (let jj = 0; jj < n - 1; jj++) for (let ii = 0; ii < n - 1; ii++) {
      const a = jj * n + ii, b = a + 1, c = a + n, d = c + 1;
      const steep = (slopes[a] + slopes[b] + slopes[c] + slopes[d]) / 4 > 0.55;
      const key = `${Math.floor(ii / CH)}|${Math.floor(jj / CH)}|${steep ? 1 : 0}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { steep, idx: [] }));
      g.idx.push(a, c, b, b, c, d);
    }
    for (const [key, grp] of groups) {
      const map = new Map(), pp = [], nn = [], uu = [], cc = [], idx = [];
      for (const v of grp.idx) {
        let nv = map.get(v);
        if (nv === undefined) {
          nv = map.size; map.set(v, nv);
          pp.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); nn.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
          uu.push(UV[v * 2], UV[v * 2 + 1]); cc.push(C[v * 3], C[v * 3 + 1], C[v * 3 + 2]);
        }
        idx.push(nv);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uu, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, grp.steep ? cliffMat : terrainMats[zone.id - 1]);
      m.name = `terrain-z${zone.id}-${grp.steep ? 'cliff' : 'ground'}-${key}`;
      group.add(m);
    }
  }

  // ================================================================ decals draped on the terrain
  const DEC = 0.07;
  const drapeMat = (m) => { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; return m; };
  /** One draped quad per 1 m cell where test(x,z) holds inside the box. */
  const cellDecal = (x0, z0, x1, z1, test, y = DEC, uvk = 1 / 3) => {
    const pos = [], uv = [];
    for (let z = Math.floor(z0); z < z1; z++) for (let x = Math.floor(x0); x < x1; x++) {
      if (!test(x + 0.5, z + 0.5)) continue;
      const q = [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]].map(([a, b]) => [a, hAt(a, b) + y, b]);
      for (const k of [0, 2, 1, 1, 2, 3]) { pos.push(q[k][0], q[k][1], q[k][2]); uv.push(q[k][0] * uvk, q[k][2] * uvk); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  };
  // toxic sludge (unlit, animated texture)
  const toxTex = tex('toxic', { size: 32 });
  const toxMat = drapeMat(basic({ map: toxTex, side: THREE.DoubleSide }));
  const toxic = new THREE.Mesh(cellDecal(10, 10, 118, 118, (x, z) => L.groundType(x, z) === 'toxic', 0.12), toxMat);
  toxic.name = 'toxic-sludge';
  group.add(toxic);
  // conveyor belt up the long ramp to the Turbinenkrone
  const beltTex = tex('belt', { size: 32 });
  const beltMat = drapeMat(basic({ map: beltTex, side: THREE.DoubleSide }));
  const belt = new THREE.Mesh(cellDecal(62, -40, 68, 10, (x, z) => L.sdfAt(x, z) > 1.5, 0.1, 1 / 4), beltMat);
  belt.name = 'conveyor';
  group.add(belt);

  // ================================================================ props (merged per material and 60 m map cell)
  const mats = {
    metal: lambert({ map: tex('rustplate', { size: 32 }), vertexColors: true }),
    lit: lambert({ vertexColors: true, side: THREE.DoubleSide }),
    glow: basic({ vertexColors: true }),
  };
  const batches = new Map();
  const add = (key, geo) => {
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    const bk = `${Math.floor((c.x + HALF) / 60)}|${Math.floor((c.z + HALF) / 60)}|${key}`;
    let b = batches.get(bk);
    if (!b) batches.set(bk, (b = { key, geos: [] }));
    b.geos.push(geo);
  };
  const ringOk = (x, z, rad) => {
    for (let k = 0; k < 6; k++) { const a = k * 1.047, px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad; if (L.groundType(px, pz) === 'toxic' || !L.walkable(px, pz, 0.4)) return false; }
    return L.groundType(x, z) !== 'toxic';
  };
  const nearPass = (x, z, r) => PASSES.some((p) => Math.hypot(x - p.x, z - p.z) < r);
  const taken = [];
  const spotOk = (x, z, zone, clear, extra) => {
    if (zoneAt(x, z) !== zone || !L.walkable(x, z, clear) || !L.reachable(x, z) || L.slopeAt(x, z) > 0.45) return false;
    if (!ringOk(x, z, clear)) return false;
    if (Math.hypot(x - L.camp.x, z - L.camp.z) < 12) return false;
    if (Object.values(L.nests).some((n) => Math.hypot(x - n.x, z - n.z) < 10)) return false;
    if (nearPass(x, z, 11) || (zone === 4 && Math.hypot(x - 65, z + 18) < 22)) return false;
    if (L.spawnPoints.some((s) => Math.hypot(x - s.x, z - s.z) < 5)) return false;
    for (const r of Object.values(L.routes)) for (const q of r) if (Math.hypot(x - q.x, z - q.z) < clear + 3) return false; // keep Brocken waypoints free
    for (const q of Object.values(L.monsterSpawns)) if (Math.hypot(x - q.x, z - q.z) < clear + 4) return false;
    if (!L.clearOfColliders(x, z, clear + 0.8)) return false;
    for (const t of taken) if (Math.hypot(x - t.x, z - t.z) < t.r + extra) return false;
    return true;
  };
  const scatter = (zone, count, r, fn, { clear = 1.5, collider = true, tries = 50, extra = 2.5 } = {}) => {
    for (let i = 0; i < count; i++) {
      for (let t = 0; t < tries; t++) {
        const cx = ZONES[zone - 1].cx + (rng() - 0.5) * 100, cz = ZONES[zone - 1].cz + (rng() - 0.5) * 100;
        const rr = typeof r === 'function' ? r() : r;
        if (!spotOk(cx, cz, zone, clear + rr, extra)) continue;
        fn(cx, cz, rr);
        if (collider) L.addCollider({ x: cx, z: cz, r: rr * 0.85 });
        taken.push({ x: cx, z: cz, r: rr });
        break;
      }
    }
  };

  // ---- camp: overturned Waggon + tent / chest / fire / flag
  {
    const c = L.camp, cp = L.campProps, cg = campGeos();
    add('metal', put(wagonGeo(), CAMP.x, hAt(CAMP.x, CAMP.z), CAMP.z, cp.wagonYaw));
    const yy = hAt(c.x, c.z);
    for (const [key, list] of [['lit', cg.lit], ['glow', cg.glow], ['lit', cg.wood]]) {
      for (const g of list) {
        put(g, 0, 0, 0, cp.rot);
        const bb = new THREE.Box3().setFromBufferAttribute(g.attributes.position);
        const gy = hAt(c.x + (bb.min.x + bb.max.x) / 2, c.z + (bb.min.z + bb.max.z) / 2) - yy;
        put(g, c.x, yy + gy, c.z);
        add(key, g);
      }
    }
  }

  // ---- fixtures from the layout: Kessel + pipes
  KESSEL.forEach((k) => add('metal', put(kesselGeo(rng, k.r, rng() < 0.5 ? '#b8683c' : '#a8884c'), k.x, hAt(k.x, k.z) - 0.1, k.z, rng() * 6)));
  for (const [a, b, y] of PIPES) {
    const A = KESSEL[a], B = KESSEL[b];
    const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
    const ax = A.x + (dx / d) * (A.r - 0.4), az = A.z + (dz / d) * (A.r - 0.4), bx = B.x - (dx / d) * (B.r - 0.4), bz = B.z - (dz / d) * (B.r - 0.4);
    add('metal', put(pipeRun(ax, az, bx, bz, y + hAt(A.x, A.z), 0.6), 0, 0, 0));
  }
  TURBINES.forEach((t) => add('metal', put(turbineGeo(rng, t.r), t.x, hAt(t.x, t.z) - 0.4, t.z, rng() * 6)));
  // steges over the toxic channels (cosmetic planks; ground there is metal)
  for (const s of stegeList()) {
    let best = null;
    for (const c of CHANNELS) for (let i = 0; i < c.pts.length - 1; i++) {
      const a = c.pts[i], b = c.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
      const t = Math.min(1, Math.max(0, ((s.x - a[0]) * dx + (s.z - a[1]) * dz) / l2)), dist = Math.hypot(s.x - a[0] - dx * t, s.z - a[1] - dz * t);
      if (!best || dist < best.dist) best = { dist, yaw: Math.atan2(dx, dz) };
    }
    // plank length runs across the channel (local z -> channel normal)
    add('metal', put(stegGeo(s.w + 3.2, 3.0, 0), s.x, hAt(s.x, s.z) + 0.12, s.z, best.yaw + Math.PI / 2));
  }

  const SC = { 1: ['#4a3a34', '#6a5448'], 3: ['#4a5238', '#6a7448'], 4: ['#3e444e', '#6a727e'] };
  const slagRock = (zone, rr) => (x, z) => add('lit', put(rockGeo(rng, rr, SC[zone][0], SC[zone][1]), x, hAt(x, z) - 0.1, z));

  // ---- zone 1: Schlackehalden
  scatter(1, 14, () => 1.6 + rng() * 1.4, (x, z, r) => add('metal', put(scrapGeo(rng, r), x, hAt(x, z) - 0.15, z, rng() * 6)));
  scatter(1, 9, () => 1.2 + rng() * 1.6, (x, z, r) => slagRock(1, r)(x, z));
  scatter(1, 8, 0.9, (x, z) => add('metal', put(barrelGroup(rng, 3), x, hAt(x, z), z, rng() * 6)), { clear: 1.5 });
  scatter(1, 6, 0.35, (x, z) => add('glow', put(crystalCluster(rng, ['#ff7a28', '#ffb040', '#e84a20'], 0.9), x, hAt(x, z) - 0.1, z, rng() * 6)), { clear: 1.5, collider: false });
  scatter(1, 5, 0.4, (x, z) => add('lit', put(deadTreeGeo(rng, 3.2 + rng() * 2, '#3a3028', true), x, hAt(x, z) - 0.2, z, rng() * 6)), { clear: 2 });

  // ---- zone 2: Kesselhalle
  add('metal', put(gantryGeo(14, 8, 9), -48, hAt(-48, 36), 36));
  [[-55, 32], [-41, 32], [-55, 40], [-41, 40]].forEach(([x, z]) => L.addCollider({ x, z, r: 0.55 }));
  add('metal', put(gantryGeo(12, 8, 9), -20, hAt(-20, 86), 86));
  [[-26, 82], [-14, 82], [-26, 90], [-14, 90]].forEach(([x, z]) => L.addCollider({ x, z, r: 0.55 }));
  scatter(2, 8, () => 1.4 + rng() * 1.2, (x, z, r) => add('metal', put(scrapGeo(rng, r), x, hAt(x, z) - 0.1, z, rng() * 6)));
  scatter(2, 8, 0.9, (x, z) => add('metal', put(barrelGroup(rng, 3), x, hAt(x, z), z, rng() * 6)), { clear: 1.5 });
  scatter(2, 5, 0.35, (x, z) => add('glow', put(crystalCluster(rng, ['#ffb040', '#ff7a28'], 0.8), x, hAt(x, z) - 0.1, z, rng() * 6)), { clear: 1.5, collider: false });
  for (const [x, z, r, h] of [[-12, 26, 3.2, 30], [-28, 14, 2.6, 24], [18, 30, 3, 28], [20, -22, 2.8, 26], [-24, -24, 3, 22]]) add('metal', put(stackGeo(rng, r, h), x, hAt(x, z) - 1, z));
  // roof girders overhead (the hall is "half covered")
  for (const gz of [34, 58, 82, 106]) add('metal', put(box(112, 0.9, 0.9, '#5a3a28'), -66, 17 + (gz % 3), gz));
  for (const gx of [-110, -86, -62, -38, -16]) add('metal', put(box(0.9, 0.9, 80, '#4a3024'), gx, 17.8, 70));

  // ---- zone 3: Giftgraben
  scatter(3, 12, 0.4, (x, z) => add('lit', put(deadTreeGeo(rng, 3 + rng() * 3.5, '#3a4a30'), x, hAt(x, z) - 0.2, z, rng() * 6)), { clear: 2 });
  scatter(3, 22, 0.35, (x, z) => add('lit', put(bigMushroom(rng, 1.1 + rng() * 1.8, ['#78d84a', '#b050c8', '#d8e04a', '#4ac8a0']), x, hAt(x, z) - 0.05, z, rng() * 6)), { clear: 1.5, extra: 2 });
  scatter(3, 7, () => 1.3 + rng() * 1.2, (x, z, r) => add('metal', put(scrapGeo(rng, r), x, hAt(x, z) - 0.25, z, rng() * 6)));
  scatter(3, 8, 0.9, (x, z) => add('metal', put(barrelGroup(rng, 4), x, hAt(x, z), z, rng() * 6)), { clear: 1.5 });
  scatter(3, 5, 0.6, (x, z) => add('glow', put(crystalCluster(rng, ['#80ff90', '#c8ff40'], 0.9), x, hAt(x, z) - 0.1, z, rng() * 6)), { clear: 2 });
  for (let i = 0; i < 170; i++) {
    const x = 14 + rng() * 100, z = 14 + rng() * 100;
    if (!L.walkable(x, z, 0.5) || !ringOk(x, z, 0.6)) continue;
    add('lit', put(tuftGeo(rng, rng() < 0.5 ? '#6a8a30' : '#8a9a40', 0.9 + rng() * 0.6), x, hAt(x, z) - 0.05, z, rng() * 6));
  }

  // ---- zone 4: Turbinenkrone
  scatter(4, 8, () => 1.6 + rng() * 1.2, (x, z, r) => add('metal', put(scrapGeo(rng, r), x, hAt(x, z) - 0.1, z, rng() * 6)));
  scatter(4, 8, () => 1.2 + rng() * 1.4, (x, z, r) => slagRock(4, r)(x, z));
  scatter(4, 7, 0.7, (x, z) => add('glow', put(crystalCluster(rng, ['#7ad8ff', '#d0f4ff', '#a080ff'], 1.1), x, hAt(x, z) - 0.1, z, rng() * 6)), { clear: 2 });
  scatter(4, 5, 0.4, (x, z) => add('lit', put(deadTreeGeo(rng, 3 + rng() * 2, '#2e3038', true), x, hAt(x, z) - 0.2, z, rng() * 6)), { clear: 2 });

  // ---- merge the batches into meshes
  for (const [bk, b] of batches) {
    const m = new THREE.Mesh(merge(b.geos), mats[b.key]);
    m.name = `props-${bk}`;
    group.add(m);
  }

  // ================================================================ interactables: visible meshes (the logic lives in interactables.js)
  const litMat = lambert({ vertexColors: true, side: THREE.DoubleSide });
  const glowMat = basic({ vertexColors: true });
  const mk = (geo, name, mat = litMat) => { const m = new THREE.Mesh(geo, mat); m.name = name; return m; };
  const VG = valveGeos(), RG = rodGeo();
  const wheelGeo = VG.wheel.clone().translate(0, -1.5, -0.82);
  const interactables = L.interactables.map((it) => {
    const e = { ...it };
    const g = new THREE.Group();
    g.name = `ia-${it.id}`;
    g.userData = { interactId: it.id, type: it.type };
    const y0 = hAt(it.x, it.z);
    if (it.type === 'valve') {
      g.position.set(it.x, y0, it.z);
      g.rotation.y = it.yaw;
      const wheel = mk(wheelGeo, 'wheel');
      wheel.position.set(0, 1.5, 0.82); // pivot at the wheel centre (rotation.z spins it)
      g.add(mk(VG.body, 'body'), wheel);
      delete e.kessel;
    } else if (it.type === 'crane') {
      const c = CRANES[Number(it.id.slice(5)) - 1];
      const cg = craneGeos(c.arm, 5);
      g.position.set(c.x, hAt(c.x, c.z), c.z);
      const body = mk(cg.body, 'body'); body.rotation.y = c.yaw;
      const dy = hAt(it.dropAt.x, it.dropAt.z) - g.position.y;
      const load = mk(cg.load, 'load'); load.position.set(it.dropAt.x - c.x, dy, it.dropAt.z - c.z);
      // ground marker: yellow ring draped on the terrain around the drop circle
      const R0 = 3.0, R1 = 3.6, SEG = 20, pos = [], colr = [];
      for (let sg = 0; sg < SEG; sg++) {
        const a0 = (sg / SEG) * 6.2832, a1 = ((sg + 1) / SEG) * 6.2832, cc = sg % 2 === 0 ? [1, 0.82, 0.1] : [0.15, 0.12, 0.1];
        const v = [[R0, a0], [R1, a0], [R0, a1], [R1, a1]].map(([r, a]) => { const x = it.dropAt.x + Math.cos(a) * r, z = it.dropAt.z + Math.sin(a) * r; return [x - c.x, hAt(x, z) - g.position.y + 0.14, z - c.z]; });
        for (const q of [0, 1, 2, 1, 3, 2]) { pos.push(...v[q]); colr.push(...cc); }
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
      const mark = mk(rg, 'mark', glowMat);
      g.add(body, load, mark);
    } else { // rod
      g.position.set(it.x, y0, it.z);
      g.rotation.y = it.yaw;
      g.add(mk(RG, 'mast'));
    }
    group.add(g);
    e.mesh = g;
    return e;
  });

  // ================================================================ gather points
  const gatherPoints = placeRostwerkePoints(L, seed);
  const gather = createGatherables({ layout: L, seed, points: gatherPoints, builders: { ...BUILDERS, ...RW_BUILDERS } });
  group.add(gather.group);

  // ================================================================ ambient particles: steam, sparks, toxic bubbles, wind dust (one Points object)
  const PN = 150, pRng = createRng(seed * 977 + 5);
  const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3);
  const parts = [];
  const spawnP = (p) => {
    const kind = p.kind;
    if (kind === 0) { // steam from a Kessel chimney
      const k = KESSEL[p.src]; p.x = k.x + k.r * 0.35 + (pRng() - 0.5) * 0.4; p.y = hAt(k.x, k.z) + k.r * 1.9 + k.r * 0.55 + 4.4; p.z = k.z + (pRng() - 0.5) * 0.4;
      p.vx = 0.6 + pRng() * 0.5; p.vy = 1.6 + pRng() * 1.2; p.vz = (pRng() - 0.5) * 0.5; p.life = 2.5 + pRng() * 2;
    } else if (kind === 1) { // sparks near the scrap/pipes of Z2 and the crown
      const z4 = pRng() < 0.45, c = z4 ? ZONES[3] : ZONES[1];
      p.x = c.cx + (pRng() - 0.5) * 90; p.z = c.cz + (pRng() - 0.5) * 90; p.y = hAt(p.x, p.z) + 0.5 + pRng() * 2;
      p.vx = (pRng() - 0.5) * 3; p.vy = 1 + pRng() * 2.5; p.vz = (pRng() - 0.5) * 3; p.life = 0.5 + pRng() * 0.7;
    } else if (kind === 2) { // bubbles over the sludge
      const c = CHANNELS[(pRng() * CHANNELS.length) | 0], i = (pRng() * (c.pts.length - 1)) | 0, t = pRng();
      p.x = c.pts[i][0] + (c.pts[i + 1][0] - c.pts[i][0]) * t + (pRng() - 0.5) * 3; p.z = c.pts[i][1] + (c.pts[i + 1][1] - c.pts[i][1]) * t + (pRng() - 0.5) * 3;
      p.y = hAt(p.x, p.z) + 0.1; p.vx = 0; p.vy = 0.6 + pRng() * 0.6; p.vz = 0; p.life = 1.5 + pRng() * 1.5;
    } else { // wind-blown dust on the crown
      p.x = 14 + pRng() * 100; p.z = -14 - pRng() * 100; p.y = hAt(p.x, p.z) + 0.5 + pRng() * 5;
      p.vx = -9 - pRng() * 4; p.vy = 0.2; p.vz = 3 + pRng() * 2; p.life = 1.8 + pRng() * 1.6;
    }
    p.t = pRng() * p.life;
  };
  const valveKessel = KESSEL.map((k, i) => (k.valve != null ? i : -1)).filter((i) => i >= 0);
  for (let i = 0; i < PN; i++) {
    const kind = i < 45 ? 0 : i < 85 ? 1 : i < 115 ? 2 : 3;
    const p = { kind, src: valveKessel[i % valveKessel.length], t: 0, life: 1 };
    spawnP(p); parts.push(p);
  }
  const PCOL = [[0.55, 0.58, 0.5], [1, 0.62, 0.18], [0.45, 1, 0.25], [0.6, 0.64, 0.74]];
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pg.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 3.5, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  points.frustumCulled = false;
  points.name = 'ambient-particles';
  group.add(points);
  const stepParticles = (dt) => {
    for (let i = 0; i < PN; i++) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { spawnP(p); p.t = 0; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.kind === 1) p.vy -= 6 * dt;
      const k = Math.sin((p.t / p.life) * Math.PI), c = PCOL[p.kind];
      pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z;
      const br = p.kind === 0 ? 0.55 * k : k;
      pCol[i * 3] = c[0] * br; pCol[i * 3 + 1] = c[1] * br; pCol[i * 3 + 2] = c[2] * br;
    }
    pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true;
  };
  stepParticles(0.01);

  // ================================================================ distant factory silhouettes (follow the player)
  const farGroup = new THREE.Group();
  farGroup.name = 'far-silhouette';
  const silMats = [basic({ color: '#000000', fog: false, depthTest: false, depthWrite: false }), basic({ color: '#000000', fog: false, depthTest: false, depthWrite: false })];
  for (let layer = 0; layer < 2; layer++) {
    const geos = [];
    const N = 24 + layer * 6, R0 = 84 + layer * 16;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * 6.2832 + rng() * 0.1, h = 16 + rng() * 26 + layer * 8, w = 6 + rng() * 9;
      const g = (rng() < 0.4 ? new THREE.CylinderGeometry(w * 0.3, w * 0.45, h * 1.2, 6) : new THREE.BoxGeometry(w * 1.6, h, w * 1.2));
      geos.push(put(g.toNonIndexed(), Math.cos(a) * R0, h / 2 - 8 + layer * 4, Math.sin(a) * R0, rng() * 6));
    }
    const m = new THREE.Mesh(merge(geos.map((g) => { g.deleteAttribute('uv'); return g; })), silMats[layer]);
    m.frustumCulled = false;
    m.renderOrder = -10 + layer * -1;
    farGroup.add(m);
  }
  group.add(farGroup);

  // ================================================================ lights
  const ambient = new THREE.AmbientLight(ENV[0].amb, ENV[0].ambI);
  const sun = new THREE.DirectionalLight(ENV[0].sun, ENV[0].sunI);
  sun.position.set(-6, 9, -12);
  const fill = new THREE.DirectionalLight('#6a9a60', 0.3);
  fill.position.set(5, 4, 8);
  group.add(ambient, sun, fill);

  // ================================================================ minimap image (precomputed, 130x130 RGBA, north = up)
  const MM = 130, mmData = new Uint8ClampedArray(MM * MM * 4);
  {
    const base = ['#5a4a40', '#8a6a48', '#4a5a30', '#5a6270'].map((h) => new THREE.Color(h));
    const wallC = new THREE.Color('#2a2220'), toxC = new THREE.Color('#78e030'), c = new THREE.Color();
    for (let j = 0; j < MM; j++) for (let i = 0; i < MM; i++) {
      const x = -HALF + (i + 0.5) * CELL, z = -HALF + (j + 0.5) * CELL;
      const zid = zoneAt(x, z), g = L.groundType(x, z);
      const shade = 1 + (hAt(x - 2, z) - hAt(x + 2, z)) * 0.08 + (hAt(x, z - 2) - hAt(x, z + 2)) * 0.05;
      if (L.sdfAt(x, z) < 0.6 || Math.abs(x) > 118 || Math.abs(z) > 118) c.copy(wallC).multiplyScalar(0.8 + Math.min(0.5, Math.max(0, hAt(x, z) / 40)));
      else if (g === 'toxic') c.copy(toxC);
      else c.copy(base[zid - 1]).multiplyScalar(Math.min(1.25, Math.max(0.7, shade)));
      const k = ((MM - 1 - j) * MM + i) * 4;
      mmData[k] = Math.min(255, c.r * 255); mmData[k + 1] = Math.min(255, c.g * 255); mmData[k + 2] = Math.min(255, c.b * 255); mmData[k + 3] = 255;
    }
  }

  // ================================================================ world interface
  const nestFor = (defId) => ({ ...L.nests[NEST_ZONE[defId] ?? 2] });
  const routeFor = (defId) => (L.routes[defId] ?? L.routes.kroll).map((p) => ({ x: p.x, z: p.z }));
  const hazards = createHazards(L);
  const env0 = ENV[0];
  const world = {
    id: 'rostwerke',
    name: 'Rostwerke',
    bounds: { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF },
    heightAt: hAt,
    collide: L.collide,
    groundType: L.groundType,
    zoneAt,
    nestFor,
    routeFor,
    nestPoint: nestFor('kroll'),
    campPoint: { ...L.camp },
    spawnPoints: L.spawnPoints,
    monsterSpawns: L.monsterSpawns,
    zones: ZONES.map((z) => ({ id: z.id, name: z.name, x: z.cx, z: z.cz, r: 55 })),
    zoneName: (id) => ZONES[id - 1]?.name ?? '',
    env: { background: env0.bg, fog: { color: env0.bg, near: env0.near, far: env0.far } },
    gatherPoints: gather.points,
    pastures: [],
    interactables,
    setGatherState: gather.setState,
    minimap: { size: MM, data: mmData },
    layout: L,
    mesh: group,
    gather,
    stats() {
      let tris = 0, meshes = 0;
      group.traverse((o) => { if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
      return { meshes, tris: Math.round(tris), colliders: L.colliders.length, gatherPoints: gather.points.length };
    },
  };

  // ---------------------------------------------------------------- per-frame update (env blend, animation, hazards, gathering)
  const cur = { bg: new THREE.Color(env0.bg), amb: new THREE.Color(env0.amb), sun: new THREE.Color(env0.sun), near: env0.near, far: env0.far, ambI: env0.ambI, sunI: env0.sunI };
  const tgt = { bg: new THREE.Color(), amb: new THREE.Color(), sun: new THREE.Color() };
  const ec = ENV.map((e) => ({ bg: new THREE.Color(e.bg), amb: new THREE.Color(e.amb), sun: new THREE.Color(e.sun) }));
  const wv = [0, 0, 0, 0];
  const silTmp = new THREE.Color(), flashC = new THREE.Color('#9aa8d8');
  let lastZone = 0, zoneStable = 0, t = 0, first = true, partAcc = 0, flash = 0, nextFlash = 5;

  world.update = (dt, hunt) => {
    t += dt;
    toxTex.offset.x = Math.floor(t * 1.5) / 32;
    toxTex.offset.y = Math.floor(t * 2.5) / 32;
    toxMat.color.setScalar(0.85 + Math.sin(t * 1.8) * 0.15);
    beltTex.offset.y = -Math.floor(t * 6) / 32;
    partAcc += dt;
    if (partAcc >= 1 / 20) { stepParticles(partAcc); partAcc = 0; }
    const pl = hunt?.player;
    if (!pl) return;
    zoneWeights(pl.pos.x, pl.pos.z, 14, wv);
    tgt.bg.setRGB(0, 0, 0); tgt.amb.setRGB(0, 0, 0); tgt.sun.setRGB(0, 0, 0);
    let near = 0, far = 0, ambI = 0, sunI = 0;
    for (let i = 0; i < 4; i++) {
      const w = wv[i];
      tgt.bg.r += ec[i].bg.r * w; tgt.bg.g += ec[i].bg.g * w; tgt.bg.b += ec[i].bg.b * w;
      tgt.amb.r += ec[i].amb.r * w; tgt.amb.g += ec[i].amb.g * w; tgt.amb.b += ec[i].amb.b * w;
      tgt.sun.r += ec[i].sun.r * w; tgt.sun.g += ec[i].sun.g * w; tgt.sun.b += ec[i].sun.b * w;
      near += ENV[i].near * w; far += ENV[i].far * w; ambI += ENV[i].ambI * w; sunI += ENV[i].sunI * w;
    }
    const k = first ? 1 : 1 - Math.exp(-3 * dt);
    first = false;
    cur.bg.lerp(tgt.bg, k); cur.amb.lerp(tgt.amb, k); cur.sun.lerp(tgt.sun, k);
    cur.near += (near - cur.near) * k; cur.far += (far - cur.far) * k; cur.ambI += (ambI - cur.ambI) * k; cur.sunI += (sunI - cur.sunI) * k;
    // thunderstorm on the Turbinenkrone: short flashes
    if (wv[3] > 0.6) {
      nextFlash -= dt;
      if (nextFlash <= 0) { flash = 1; nextFlash = 5 + Math.random() * 9; }
    }
    flash = Math.max(0, flash - dt * 6);
    const sc = hunt.scene;
    if (sc.background?.isColor) sc.background.copy(cur.bg); else sc.background = cur.bg.clone();
    if (flash > 0) sc.background.lerp(flashC, flash * 0.45);
    if (sc.fog) { sc.fog.color.copy(sc.background); sc.fog.near = cur.near; sc.fog.far = cur.far; }
    if (hunt.camera && Math.abs(hunt.camera.far - (cur.far + 14)) > 1) { hunt.camera.far = cur.far + 14; hunt.camera.updateProjectionMatrix(); }
    ambient.color.copy(cur.amb); ambient.intensity = cur.ambI + flash * 0.9;
    sun.color.copy(cur.sun); sun.intensity = cur.sunI + flash * 0.6;
    silMats[0].color.copy(silTmp.copy(sc.background).multiplyScalar(0.55));
    silMats[1].color.copy(silTmp.copy(sc.background).multiplyScalar(0.78));
    farGroup.position.set(pl.pos.x, 0, pl.pos.z);

    const z = zoneAt(pl.pos.x, pl.pos.z);
    if (z !== lastZone) {
      zoneStable += dt;
      if (zoneStable > (lastZone === 0 ? 0 : 0.35)) { lastZone = z; zoneStable = 0; hunt.bus.emit('zoneEnter', { zone: z, name: ZONES[z - 1].name }); }
    } else zoneStable = 0;
    sfx.setAmbient?.(wv);

    gather.update(dt, hunt);
    hazards.update(dt, hunt);
  };
  world.dispose = () => { gather.dispose(); sfx.stopAmbient?.(); };
  return world;
}
