import * as THREE from 'three';
import { lambert, basic } from '../../render/ps1.js';
import { tex } from '../../render/textures.js';
import { createRng } from '../../core/rng.js';
import { sfx } from '../../audio/sfx.js';
import {
  buildLayout, zoneWeights, zoneAt, ZONES, HALF, CELL, NG, PASSES, vnoise, fbm, distToCracks,
} from './layout.js';
import { registerWorldTextures } from './worldTextures.js';
import {
  colored, put, merge, recolor, rockGeo, pillarGeo, ribcageGeo, boneStick, skullGeo, deadTreeGeo, crystalCluster,
  bigMushroom, tuftGeo, campGeos, bakeShade, planarUV,
} from './props.js';
import { createGatherables } from './gatherables.js';
import { createHazards } from './hazards.js';

export const TERRAIN_SEED = 1; // the map is identical for every player; only gather points depend on the hunt seed

// Look per zone: sky/fog colour, fog range, ambient and sun light.
const ENV = [
  { bg: '#7d74b4', near: 26, far: 100, amb: '#a89ad2', ambI: 1.25, sun: '#ffc890', sunI: 1.3 },
  { bg: '#b08660', near: 22, far: 82, amb: '#c8aa88', ambI: 1.2, sun: '#ffd8a0', sunI: 1.35 },
  { bg: '#58785c', near: 18, far: 72, amb: '#8cac98', ambI: 1.05, sun: '#c8e0a0', sunI: 1.0 },
  { bg: '#7c2a32', near: 22, far: 82, amb: '#d28a78', ambI: 1.1, sun: '#ff9062', sunI: 1.25 },
];
const GROUND_TEX = ['meadow', 'pit', 'swamp', 'basalt'];
const GROUND_TINT = ['#ffffff', '#f2e6d4', '#e0e8d0', '#e8dcdc'];
const CLIFF_TINT = ['#a89c94', '#d0b894', '#98a088', '#8a6a70'];
const QUAD = [{ i0: 0, j0: 0 }, { i0: 0, j0: 60 }, { i0: 60, j0: 60 }, { i0: 60, j0: 0 }]; // zones 1..4 in grid cells

const NEST_ZONE = { jaggo: 2, jaggling: 2, barrotz: 3, brathalos: 4 };

export function createSchotterklamm({ seed = 1 } = {}) {
  registerWorldTextures();
  const L = buildLayout(TERRAIN_SEED);
  const rng = createRng(TERRAIN_SEED * 101 + 7);
  const group = new THREE.Group();
  group.name = 'schotterklamm';
  const hAt = L.heightAt;

  // ================================================================ terrain: per zone one ground mesh + one cliff mesh
  const tmpC = new THREE.Color();
  const col = (hex, k = 1) => tmpC.set(hex).multiplyScalar(k);
  function vertexColor(zone, x, z, h, slope, out) {
    const n = vnoise(x * 0.35, z * 0.35, 9) * 0.5 + vnoise(x * 0.11, z * 0.11, 3) * 0.5;
    if (slope > 0.5) {
      const band = Math.sin(h * 1.9 + vnoise(x * 0.1, z * 0.1, 5) * 3) > 0 ? 1 : 0.8;
      col(CLIFF_TINT[zone - 1], band * (0.85 + n * 0.12));
    } else {
      col(GROUND_TINT[zone - 1], 0.88 + n * 0.16);
      if (zone === 4) { // ember glow near the cracks
        const d = distToCracks(L.cracks, x, z);
        if (d < 5) { const k = 1 - d / 5; tmpC.r += k * 0.9; tmpC.g += k * 0.18; tmpC.b -= k * 0.1; tmpC.r = Math.max(0, tmpC.r); tmpC.b = Math.max(0, tmpC.b); }
      }
      if (zone === 3 && L.groundType(x, z) === 'mud') tmpC.multiplyScalar(0.55);
    }
    out[0] = tmpC.r; out[1] = tmpC.g; out[2] = tmpC.b;
  }
  const terrainMats = GROUND_TEX.map((t) => lambert({ map: tex(t, { size: 32 }), vertexColors: true }));
  const cliffMat = lambert({ map: tex('cliff', { size: 32 }), vertexColors: true });
  const col3 = [0, 0, 0];
  for (const zone of ZONES) {
    const { i0, j0 } = QUAD[zone.id - 1];
    const n = 61;
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
    // split into 30x30-cell chunks (frustum culling) and by steepness (ground texture vs cliff texture)
    const CH = 30, groups = new Map();
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
  // mud pools
  {
    const geos = [];
    for (const p of L.pools) {
      const SEG = 18, RINGS = [0, 0.5, 1.0, 1.18];
      const pos = [], uv = [], colr = [], idx = [];
      for (let r = 0; r < RINGS.length; r++) for (let s = 0; s < SEG; s++) {
        const a = (s / SEG) * 6.2832, rad = L.poolRadiusAt(p, a) * RINGS[r];
        const x = p.x + Math.cos(a) * rad, z = p.z + Math.sin(a) * rad;
        pos.push(x, hAt(x, z) + DEC + (r === 0 ? 0 : 0), z);
        uv.push(x / 3, z / 3);
        const k = r === 3 ? 0.55 : 1 - r * 0.06;
        colr.push(0.9 * k, 0.78 * k, 0.62 * k);
      }
      for (let r = 0; r < RINGS.length - 1; r++) for (let s = 0; s < SEG; s++) {
        const a = r * SEG + s, b = r * SEG + ((s + 1) % SEG), c = (r + 1) * SEG + s, d = (r + 1) * SEG + ((s + 1) % SEG);
        idx.push(a, b, c, b, d, c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      geos.push(g.toNonIndexed());
    }
    if (geos.length) {
      const m = new THREE.Mesh(merge(geos), drapeMat(lambert({ map: tex('mud', { size: 32 }), vertexColors: true, side: THREE.DoubleSide })));
      m.name = 'mud-pools';
      group.add(m);
    }
  }
  // lava cracks (unlit, animated texture)
  const lavaTex = tex('lava', { size: 32 });
  const lavaMat = drapeMat(basic({ map: lavaTex, vertexColors: true, side: THREE.DoubleSide }));
  {
    const pos = [], uv = [], colr = [];
    for (const c of L.cracks) {
      for (let i = 0; i < c.pts.length - 1; i++) {
        const a = c.pts[i], b = c.pts[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
        for (const [wid, bright] of [[c.w * 1.35, 0.55], [c.w * 0.8, 1]]) {
          const hw = wid / 2;
          // subdivide each segment so the strip hugs the ground
          const SUB = 4;
          for (let s = 0; s < SUB; s++) {
            const t0 = s / SUB, t1 = (s + 1) / SUB;
            const q = [];
            for (const t of [t0, t1]) {
              const px = a.x + dx * t, pz = a.z + dz * t;
              for (const sg of [-1, 1]) { const x = px + nx * hw * sg, z = pz + nz * hw * sg; q.push([x, hAt(x, z) + DEC + (bright === 1 ? 0.03 : 0), z]); }
            }
            for (const k of [0, 1, 2, 1, 3, 2]) { const v = q[k]; pos.push(v[0], v[1], v[2]); uv.push(v[0] / 3, v[2] / 3); colr.push(bright, bright, bright); }
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    const m = new THREE.Mesh(g, lavaMat);
    m.name = 'lava-cracks';
    group.add(m);
  }
  // camp: trampled dirt
  {
    const c = L.camp, SEG = 14, pos = [], uv = [], idx = [];
    for (let r = 0; r < 3; r++) for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * 6.2832, rad = (r / 2) * (7.5 + vnoise(s * 1.7, 4, 2) * 0.8);
      const x = c.x + Math.cos(a) * rad, z = c.z + Math.sin(a) * rad;
      pos.push(x, hAt(x, z) + DEC, z); uv.push(x / 3, z / 3);
    }
    for (let r = 0; r < 2; r++) for (let s = 0; s < SEG; s++) {
      const a = r * SEG + s, b = r * SEG + ((s + 1) % SEG), cc = (r + 1) * SEG + s, d = (r + 1) * SEG + ((s + 1) % SEG);
      idx.push(a, b, cc, b, d, cc);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, drapeMat(lambert({ map: tex('path', { size: 32 }), side: THREE.DoubleSide })));
    m.name = 'camp-dirt';
    group.add(m);
  }

  // ================================================================ props (merged per zone and material)
  const mats = {
    rock: lambert({ map: tex('cliff', { size: 32 }), vertexColors: true }),
    bone: lambert({ map: tex('bone', { size: 16 }), vertexColors: true, side: THREE.DoubleSide }),
    wood: lambert({ map: tex('wood', { size: 32 }), vertexColors: true }),
    lit: lambert({ vertexColors: true, side: THREE.DoubleSide }),
    glow: basic({ vertexColors: true }),
  };
  // merged per material and 60 m map cell (one draw call each, still frustum-cullable)
  const batches = new Map();
  const add = (zone, key, geo) => {
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    const bk = `${Math.floor((c.x + HALF) / 60)}|${Math.floor((c.z + HALF) / 60)}|${key}`;
    let b = batches.get(bk);
    if (!b) batches.set(bk, (b = { key, zone, geos: [] }));
    b.geos.push(geo);
  };

  const nearPass = (x, z, r) => PASSES.some((p) => Math.hypot(x - p.x, z - p.z) < r);
  const spotOk = (x, z, zone, clear, taken, extra = 2.5) => {
    if (zoneAt(x, z) !== zone || !L.walkable(x, z, clear) || !L.reachable(x, z)) return false;
    if (L.groundType(x, z) === 'lava' || L.groundType(x, z) === 'mud') return false;
    if (Math.hypot(x - L.camp.x, z - L.camp.z) < 11) return false;
    if (Object.values(L.nests).some((n) => Math.hypot(x - n.x, z - n.z) < 9)) return false;
    if (nearPass(x, z, 11)) return false;
    if (L.spawnPoints.some((s) => Math.hypot(x - s.x, z - s.z) < 5)) return false;
    for (const t of taken) if (Math.hypot(x - t.x, z - t.z) < t.r + extra) return false;
    return true;
  };
  const taken = [];
  const scatter = (zone, count, r, fn, { clear = 1.5, collider = true, tries = 40, extra = 2.5 } = {}) => {
    for (let i = 0; i < count; i++) {
      for (let t = 0; t < tries; t++) {
        const cx = ZONES[zone - 1].cx + (rng() - 0.5) * 100, cz = ZONES[zone - 1].cz + (rng() - 0.5) * 100;
        const rr = typeof r === 'function' ? r() : r;
        if (!spotOk(cx, cz, zone, clear + rr, taken, extra)) continue;
        fn(cx, cz, rr);
        if (collider) L.addCollider({ x: cx, z: cz, r: rr * 0.85 });
        taken.push({ x: cx, z: cz, r: rr });
        break;
      }
    }
  };

  // ---- camp
  {
    const c = L.camp, cg = campGeos();
    const yy = hAt(c.x, c.z);
    const rot = 0.4;
    for (const [key, list] of [['lit', cg.lit], ['glow', cg.glow], ['wood', cg.wood]]) {
      for (const g of list) {
        // local camp coords -> world (rotate around centre), sit on the terrain height at the local position
        put(g, 0, 0, 0, rot);
        const bb = new THREE.Box3().setFromBufferAttribute(g.attributes.position);
        const lx = (bb.min.x + bb.max.x) / 2, lz = (bb.min.z + bb.max.z) / 2;
        const gy = hAt(c.x + lx, c.z + lz) - yy;
        put(g, c.x, yy + gy, c.z);
        add(1, key, g);
      }
    }
    const rr = (x, z) => ({ x: c.x + x * Math.cos(rot) + z * Math.sin(rot), z: c.z - x * Math.sin(rot) + z * Math.cos(rot) });
    const tent = rr(-4, 0), chest = rr(3, 0.5), fire = rr(0, -1.5), flag = rr(0, 4);
    L.addCollider({ x: tent.x, z: tent.z, r: 2.0 }); L.addCollider({ x: chest.x, z: chest.z, r: 0.85 });
    L.addCollider({ x: fire.x, z: fire.z, r: 0.7 }); L.addCollider({ x: flag.x, z: flag.z, r: 0.2 });
    L.campProps = { tent, chest, fire, flag };
  }

  const ROCK = {
    1: ['#6c6a74', '#948ea0'], 2: ['#8a7a64', '#c0ae90'], 3: ['#5c6454', '#8a9478'], 4: ['#3a3038', '#6a5058'],
  };
  const boulder = (zone, rr) => (x, z) => add(zone, 'rock', put(rockGeo(rng, rr, ROCK[zone][0], ROCK[zone][1]), x, hAt(x, z) - 0.1, z));

  // ---- zone 1: Wackelwiese
  scatter(1, 5, () => 1.4 + rng() * 1.2, (x, z, r) => boulder(1, r)(x, z));
  scatter(1, 5, 0.4, (x, z) => add(1, 'wood', put(deadTreeGeo(rng, 3.5 + rng() * 2), x, hAt(x, z) - 0.2, z, rng() * 6)), { clear: 2 });
  scatter(1, 3, 0, (x, z) => add(1, 'bone', put(boneStick(1.4 + rng()), x, hAt(x, z) + 0.12, z, rng() * 6, 1, 0, Math.PI / 2)), { collider: false, clear: 0.5 });
  for (let i = 0; i < 260; i++) {
    const x = -104 + rng() * 96, z = -104 + rng() * 96;
    if (!L.walkable(x, z, 0.5) || Math.hypot(x - L.camp.x, z - L.camp.z) < 8.5) continue;
    add(1, 'lit', put(tuftGeo(rng, rng() < 0.3 ? '#7ab040' : '#4f9a34', 0.7 + rng() * 0.4), x, hAt(x, z) - 0.05, z, rng() * 6));
  }

  // ---- zone 2: Knochengrube
  scatter(2, 17, () => 1.3 + rng() * 2.3, (x, z, r) => boulder(2, r)(x, z));
  scatter(2, 10, () => 1.2 + rng() * 1.1, (x, z, r) => add(2, 'rock', put(pillarGeo(rng, r, 3.5 + rng() * 5, '#8a7660', '#c4b090'), x, hAt(x, z), z)));
  scatter(2, 6, 0.9, (x, z) => add(2, 'bone', put(ribcageGeo(rng, 0.9 + rng() * 0.7), x, hAt(x, z), z, rng() * 6.3)), { collider: false, clear: 2.5, extra: 3.5 });
  scatter(2, 28, 0.2, (x, z) => add(2, 'bone', put(boneStick(0.9 + rng() * 1.1, 0.1), x, hAt(x, z) + 0.12, z, rng() * 6.3, 1, 0, Math.PI / 2 + (rng() - 0.5) * 0.4)), { collider: false, clear: 0.5, extra: 0.5 });
  scatter(2, 5, 0.7, (x, z) => add(2, 'bone', put(skullGeo(1.4 + rng() * 0.8), x, hAt(x, z), z, rng() * 6.3)), { clear: 1.5 });
  scatter(2, 5, 0.4, (x, z) => add(2, 'wood', put(deadTreeGeo(rng, 3 + rng() * 2.5), x, hAt(x, z) - 0.2, z, rng() * 6)), { clear: 2 });
  scatter(2, 6, 0.7, (x, z) => add(2, 'glow', put(crystalCluster(rng, ['#58d8ff', '#a070ff', '#58f0c0'], 1.1), x, hAt(x, z) - 0.1, z, rng() * 6)), { clear: 2 });

  // ---- zone 3: Schlammsenke
  scatter(3, 14, 0.4, (x, z) => add(3, 'wood', put(deadTreeGeo(rng, 3 + rng() * 3.5, '#4a4838'), x, hAt(x, z) - 0.2, z, rng() * 6)), { clear: 2 });
  scatter(3, 22, 0.35, (x, z) => add(3, 'lit', put(bigMushroom(rng, 1.1 + rng() * 1.8, ['#b050c8', '#d85a7a', '#5aa890', '#8a68e0']), x, hAt(x, z) - 0.05, z, rng() * 6)), { clear: 1.5, extra: 2 });
  scatter(3, 7, () => 1.2 + rng() * 1.6, (x, z, r) => boulder(3, r)(x, z));
  scatter(3, 3, 0.9, (x, z) => add(3, 'bone', put(ribcageGeo(rng, 1.1), x, hAt(x, z), z, rng() * 6.3)), { collider: false, clear: 2.5, extra: 3.5 });
  scatter(3, 4, 0.7, (x, z) => add(3, 'glow', put(crystalCluster(rng, ['#80ff90', '#60e0c0'], 1.0), x, hAt(x, z) - 0.1, z, rng() * 6)), { clear: 2 });
  for (let i = 0; i < 180; i++) {
    const x = 6 + rng() * 98, z = 6 + rng() * 98;
    if (!L.walkable(x, z, 0.5) || L.groundType(x, z) === 'mud') continue;
    add(3, 'lit', put(tuftGeo(rng, rng() < 0.5 ? '#6a7a30' : '#8a8a40', 0.9 + rng() * 0.6), x, hAt(x, z) - 0.05, z, rng() * 6));
  }
  // reeds at the edges of the mud pools
  for (const p of L.pools) for (let i = 0; i < 6; i++) {
    const a = rng() * 6.28, x = p.x + Math.cos(a) * L.poolRadiusAt(p, a) * 1.25, z = p.z + Math.sin(a) * L.poolRadiusAt(p, a) * 1.25;
    if (L.walkable(x, z, 0.5)) add(3, 'lit', put(tuftGeo(rng, '#9a9a48', 1.3), x, hAt(x, z) - 0.05, z, rng() * 6));
  }

  // ---- zone 4: Glutkamm
  scatter(4, 16, () => 1.3 + rng() * 2.2, (x, z, r) => boulder(4, r)(x, z));
  scatter(4, 8, () => 1.1 + rng() * 1.0, (x, z, r) => add(4, 'rock', put(pillarGeo(rng, r, 3 + rng() * 5, '#4a3a42', '#7a5a5a'), x, hAt(x, z), z)));
  scatter(4, 8, () => 1.0 + rng() * 1.0, (x, z, r) => { // glowing rocks: hot cores
    const g = rockGeo(rng, r, '#3a2428', '#ff8a30');
    recolor(g, (px, py) => { const t = Math.min(1, Math.max(0, py / (r * 1.1))); const c = new THREE.Color('#40222a').lerp(new THREE.Color('#ff7a28'), t * t * 1.1); return [c.r, c.g, c.b]; });
    add(4, 'glow', put(bakeShade(g, 0.85), x, hAt(x, z) - 0.1, z));
  });
  scatter(4, 8, 0.7, (x, z) => add(4, 'glow', put(crystalCluster(rng, ['#ff5a30', '#ffb040', '#ff3060'], 1.2), x, hAt(x, z) - 0.1, z, rng() * 6)), { clear: 2 });
  scatter(4, 6, 0.4, (x, z) => add(4, 'wood', put(deadTreeGeo(rng, 3 + rng() * 2.5, '#3a3030', true), x, hAt(x, z) - 0.2, z, rng() * 6)), { clear: 2 });
  scatter(4, 3, 0.9, (x, z) => add(4, 'bone', put(ribcageGeo(rng, 1.4), x, hAt(x, z), z, rng() * 6.3)), { collider: false, clear: 2.5, extra: 3.5 });

  // ---- merge the batches into meshes
  const propMeshes = [];
  for (const [bk, b] of batches) {
    const m = new THREE.Mesh(merge(b.geos), mats[b.key]);
    m.name = `props-${bk}`;
    group.add(m);
    propMeshes.push(m);
  }

  // ================================================================ gather points
  const gather = createGatherables({ layout: L, seed });
  group.add(gather.group);

  // ================================================================ distant cliff silhouettes (follow the player)
  const farGroup = new THREE.Group();
  farGroup.name = 'far-silhouette';
  const silMats = [basic({ color: '#000000', fog: false, depthTest: false, depthWrite: false }), basic({ color: '#000000', fog: false, depthTest: false, depthWrite: false })];
  for (let layer = 0; layer < 2; layer++) {
    const geos = [];
    const N = 22 + layer * 6, R0 = 78 + layer * 16;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * 6.2832 + rng() * 0.1, h = 18 + rng() * 26 + layer * 8, w = 12 + rng() * 10;
      const g = new THREE.ConeGeometry(w, h, 5 + ((rng() * 2) | 0));
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
  const fill = new THREE.DirectionalLight('#6a8aff', 0.35);
  fill.position.set(5, 4, 8);
  group.add(ambient, sun, fill);

  // ================================================================ minimap image (precomputed, 120x120 RGBA, north = up)
  const MM = 120, mmData = new Uint8ClampedArray(MM * MM * 4);
  {
    const base = ['#5a9a40', '#c0a878', '#66784a', '#5c4650'].map((h) => new THREE.Color(h));
    const rockC = new THREE.Color('#2e2a34'), mudC = new THREE.Color('#7a5230'), lavaC = new THREE.Color('#ff7a20'), c = new THREE.Color();
    for (let j = 0; j < MM; j++) for (let i = 0; i < MM; i++) {
      const x = -HALF + (i + 0.5) * CELL, z = -HALF + (j + 0.5) * CELL;
      const zid = zoneAt(x, z), g = L.groundType(x, z);
      const shade = 1 + (hAt(x - 2, z) - hAt(x + 2, z)) * 0.08 + (hAt(x, z - 2) - hAt(x, z + 2)) * 0.05;
      if (L.sdfAt(x, z) < 0.6 || Math.abs(x) > 108 || Math.abs(z) > 108) c.copy(rockC).multiplyScalar(0.8 + Math.min(0.5, Math.max(0, hAt(x, z) / 40)));
      else if (g === 'lava') c.copy(lavaC);
      else if (g === 'mud') c.copy(mudC);
      else c.copy(base[zid - 1]).multiplyScalar(Math.min(1.25, Math.max(0.7, shade)));
      const k = ((MM - 1 - j) * MM + i) * 4;
      mmData[k] = Math.min(255, c.r * 255 * 1.0); mmData[k + 1] = Math.min(255, c.g * 255); mmData[k + 2] = Math.min(255, c.b * 255); mmData[k + 3] = 255;
    }
  }

  // ================================================================ world interface
  const nestFor = (defId) => ({ ...L.nests[NEST_ZONE[defId] ?? 2] });
  const routeFor = (defId) => (L.routes[defId] ?? L.routes.jaggo).map((p) => ({ x: p.x, z: p.z }));
  const hazards = createHazards(L);
  const env0 = ENV[0];
  const world = {
    id: 'schotterklamm',
    name: 'Schotterklamm',
    bounds: { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF },
    heightAt: hAt,
    collide: L.collide,
    groundType: L.groundType,
    zoneAt,
    nestFor,
    routeFor,
    nestPoint: nestFor('jaggo'),
    campPoint: { ...L.camp },
    spawnPoints: L.spawnPoints,
    monsterSpawns: L.monsterSpawns,
    zones: ZONES.map((z) => ({ id: z.id, name: z.name, x: z.cx, z: z.cz, r: 55 })),
    zoneName: (id) => ZONES[id - 1]?.name ?? '',
    env: { background: env0.bg, fog: { color: env0.bg, near: env0.near, far: env0.far } },
    gatherPoints: gather.points,
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

  // ---------------------------------------------------------------- per-frame update (env blend, hazards, gathering)
  const cur = { bg: new THREE.Color(env0.bg), amb: new THREE.Color(env0.amb), sun: new THREE.Color(env0.sun), near: env0.near, far: env0.far, ambI: env0.ambI, sunI: env0.sunI };
  const tgt = { bg: new THREE.Color(), amb: new THREE.Color(), sun: new THREE.Color() };
  const ec = ENV.map((e) => ({ bg: new THREE.Color(e.bg), amb: new THREE.Color(e.amb), sun: new THREE.Color(e.sun) }));
  const wv = [0, 0, 0, 0];
  const silTmp = new THREE.Color();
  let lastZone = 0, zoneStable = 0, t = 0, first = true;

  world.update = (dt, hunt) => {
    t += dt;
    lavaTex.offset.x = Math.floor(t * 2.5) / 32;
    lavaTex.offset.y = Math.floor(t * 1.5) / 32;
    lavaMat.color.setScalar(0.86 + Math.sin(t * 2.2) * 0.14);
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
    const sc = hunt.scene;
    if (sc.background?.isColor) sc.background.copy(cur.bg); else sc.background = cur.bg.clone();
    if (sc.fog) { sc.fog.color.copy(cur.bg); sc.fog.near = cur.near; sc.fog.far = cur.far; }
    if (hunt.camera && Math.abs(hunt.camera.far - (cur.far + 14)) > 1) { hunt.camera.far = cur.far + 14; hunt.camera.updateProjectionMatrix(); } // no point drawing what is fully fogged
    ambient.color.copy(cur.amb); ambient.intensity = cur.ambI;
    sun.color.copy(cur.sun); sun.intensity = cur.sunI;
    silMats[0].color.copy(silTmp.copy(cur.bg).multiplyScalar(0.55));
    silMats[1].color.copy(silTmp.copy(cur.bg).multiplyScalar(0.78));
    farGroup.position.set(pl.pos.x, 0, pl.pos.z);

    // zone change event (debounced 0.35 s so walking along a divider does not spam)
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
