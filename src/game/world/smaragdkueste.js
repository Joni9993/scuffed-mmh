import * as THREE from 'three';
import { lambert, basic } from '../../render/ps1.js';
import { tex } from '../../render/textures.js';
import { createRng, hashSeed } from '../../core/rng.js';
import { sfx } from '../../audio/sfx.js';
import { GATHER_KINDS } from '../../data/gather.js';
import {
  buildLayout, CAMP, zoneWeights, zoneAt, ZONES, HALF, CELL, NG, PASSES, TEMPLE, TEMPLE_C, onTemple, vnoise, SEA_BLOCK,
} from './smaragdkuesteLayout.js';
import { registerWorldTextures } from './worldTextures.js';
import { put, merge, rockGeo, bigMushroom, tuftGeo, campGeos } from './props.js';
import {
  palmGeo, jungleTreeGeo, fernGeo, rootsGeo, driftwoodGeo, blockGeo, templePillar, fallenPillar, gateGeo, runeSlab, runeRing, daisGeo, SK_BUILDERS, box,
} from './smaragdkuesteProps.js';
import { createGatherables, BUILDERS } from './gatherables.js';
import { createHazards } from './hazards.js';

export const TERRAIN_SEED = 1;

// Look per zone: sky/fog colour, fog range, ambient and sun light. Bright and sunny on the beach, gloomy and thick in the deep jungle.
const ENV = [
  { bg: '#a4e2f0', near: 60, far: 200, amb: '#fff2d4', ambI: 1.7, sun: '#fff0c0', sunI: 1.3 },
  { bg: '#8cc8a0', near: 36, far: 140, amb: '#d8f0c0', ambI: 1.5, sun: '#fff0b0', sunI: 1.1 },
  { bg: '#27443a', near: 9, far: 58, amb: '#78a890', ambI: 1.3, sun: '#a0d4b0', sunI: 0.65 },
  { bg: '#1e3c42', near: 16, far: 84, amb: '#86b8b0', ambI: 1.35, sun: '#a8f0e0', sunI: 0.8 },
];
const GROUND_TEX = ['sand', 'jungle', 'mossfloor', 'templefloor'];
const GROUND_TINT = ['#ffffff', '#ffffff', '#e0f0e0', '#ffffff'];
const CLIFF_TINT = ['#e0d0a8', '#9ab080', '#6a8a6a', '#9ab8b0'];
const NEST_ZONE = { jaggo: 2, barrotz: 3, blendax: 3, mampfaffe: 2 }; // everything else (the apex monsters) nests in the temple
// Brocken, die durch mehrere Zonen streifen: Zonen-Reihenfolge ab Nest-Zone; die Routen berühren sich an den Pässen (PASSES: 0 = Z1-Z2, 1 = Z2-Z3, 2 = Z3-Z4)
const ROUTE_ZONES = { blendax: [3, 2], mampfaffe: [2, 1] }; // Mampfaffe: Revier nur Zone 1 + 2 (frisst dort Kokosnuss, Feuerpilz, Giftkraut, Glitchpilz)
const PASS_OF = { '1-2': 0, '2-3': 1, '3-4': 2 };
const ZONE_BOXES = { 1: [-114, -114, -14, -14], 2: [-114, 14, -14, 114], 3: [14, 14, 114, 114], 4: [14, -114, 114, -14] };

// ---------------------------------------------------------------- gather points (deterministic from the hunt seed)
export function placeSmaragdPoints(L, seed) {
  const rng = createRng(hashSeed(`gather|smaragdkueste|${seed}`));
  const points = [];
  const okSpot = (x, z) => {
    if (!L.reachable(x, z) || !L.walkable(x, z, 2.4) || L.slopeAt(x, z) > 0.4) return false;
    if (Math.hypot(x - L.camp.x, z - L.camp.z) < 10) return false;
    for (const n of Object.values(L.nests)) if (Math.hypot(x - n.x, z - n.z) < 8) return false;
    if (!L.clearOfColliders(x, z, 1.6)) return false;
    for (const p of points) if (Math.hypot(p.pos.x - x, p.pos.z - z) < 5.5) return false;
    return true;
  };
  for (const zone of [1, 2, 3, 4]) {
    const b = ZONE_BOXES[zone];
    for (const [kind, def] of Object.entries(GATHER_KINDS)) {
      if (def.world !== 'smaragdkueste') continue;
      const n = def.zones[zone] ?? 0;
      for (let i = 0; i < n; i++) {
        let spot = null;
        for (let tries = 0; tries < 400 && !spot; tries++) {
          const x = b[0] + rng() * (b[2] - b[0]), z = b[1] + rng() * (b[3] - b[1]);
          if (zoneAt(x, z) === zone && okSpot(x, z)) spot = { x, z };
        }
        if (!spot) continue;
        const uses = rng.int(def.uses[0], def.uses[1]);
        points.push({ id: `g${zone}-${points.length}`, kind, zone, pos: { x: spot.x, y: L.heightAt(spot.x, spot.z), z: spot.z }, usesLeft: uses, maxUses: uses, yaw: rng() * 6.28 });
      }
    }
  }
  return points;
}

export function createSmaragdkueste({ seed = 1 } = {}) {
  registerWorldTextures();
  const L = buildLayout(TERRAIN_SEED);
  const rng = createRng(TERRAIN_SEED * 131 + 11);
  const group = new THREE.Group();
  group.name = 'smaragdkueste';
  const hAt = L.heightAt;

  // ================================================================ terrain: per zone one ground mesh + one cliff mesh (chunked)
  const tmpC = new THREE.Color();
  const col = (hex, k = 1) => tmpC.set(hex).multiplyScalar(k);
  function vertexColor(zone, x, z, h, slope, out) {
    const n = vnoise(x * 0.35, z * 0.35, 9) * 0.5 + vnoise(x * 0.11, z * 0.11, 3) * 0.5;
    if (slope > 0.5) {
      const band = Math.sin(h * 1.7 + vnoise(x * 0.1, z * 0.1, 5) * 3) > 0 ? 1 : 0.82;
      col(CLIFF_TINT[zone - 1], band * (0.8 + n * 0.14));
    } else {
      col(GROUND_TINT[zone - 1], 0.88 + n * 0.16);
      if (zone === 1) {
        if (h < 0.9) tmpC.lerp(new THREE.Color('#9ae8e0'), 0.5 * (1 - Math.max(0, (h - SEA_BLOCK) / 0.65))); // wet sand / shallows
        else if (h > 1.5) tmpC.lerp(new THREE.Color('#9ac060'), Math.min(0.5, (h - 1.5) * 0.4)); // beach grass on the dunes
      }
      if (zone === 4 && !onTemple(x, z)) tmpC.multiplyScalar(0.8).lerp(new THREE.Color('#3a6a38'), 0.55); // jungle around the temple
      if (zone === 4 && onTemple(x, z) && vnoise(x * 0.5, z * 0.5, 21) > 0.35) tmpC.lerp(new THREE.Color('#3a6a38'), 0.45); // moss on the flagstones
    }
    out[0] = tmpC.r; out[1] = tmpC.g; out[2] = tmpC.b;
  }
  const terrainMats = GROUND_TEX.map((t) => lambert({ map: tex(t, { size: 32 }), vertexColors: true }));
  const cliffMat = lambert({ map: tex('mosswall', { size: 32 }), vertexColors: true });
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

  // ================================================================ the sea: one flat turquoise plane (unlit, scrolling texture, gentle shimmer)
  const seaTex = tex('seawater', { size: 32, repeat: 120 });
  const seaMat = basic({ map: seaTex, transparent: true, opacity: 0.88, depthWrite: false });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 700, 14, 14).rotateX(-Math.PI / 2), seaMat);
  sea.position.y = 0.02;
  sea.renderOrder = -1;
  sea.name = 'sea';
  group.add(sea);

  // ================================================================ props (merged per material and 60 m map cell)
  const mats = {
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
    for (let k = 0; k < 6; k++) { const a = k * 1.047; if (!L.walkable(x + Math.cos(a) * rad, z + Math.sin(a) * rad, 0.4)) return false; }
    return true;
  };
  const nearPass = (x, z, r) => PASSES.some((p) => Math.hypot(x - p.x, z - p.z) < r);
  const taken = [];
  const pillars = [], runeGeos = []; // Tempel: hohe Saeulen (Deckung) und Runen-Geometrie (eigenes Material)
  const spotOk = (x, z, zone, clear, extra) => {
    if (zoneAt(x, z) !== zone || !L.walkable(x, z, clear) || !L.reachable(x, z) || L.slopeAt(x, z) > 0.45) return false;
    if (!ringOk(x, z, clear)) return false;
    if (Math.hypot(x - L.camp.x, z - L.camp.z) < 12) return false;
    if (Object.values(L.nests).some((n) => Math.hypot(x - n.x, z - n.z) < 10)) return false;
    if (nearPass(x, z, 11) || (zone === 4 && (Math.hypot(x - TEMPLE_C.x, z - TEMPLE_C.z) < 27 || Math.hypot(x - 65, z + 22) < 24))) return false; // arena + stair stay open
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
  /** ground cover: no collider, only needs walkable ground in zone (z0..z1 box) */
  const cover = (zone, count, fn, minH = 0.6) => {
    const b = ZONE_BOXES[zone];
    for (let i = 0; i < count; i++) {
      const x = b[0] + rng() * (b[2] - b[0]), z = b[1] + rng() * (b[3] - b[1]);
      if (zoneAt(x, z) !== zone || !L.walkable(x, z, 0.8) || hAt(x, z) < minH) continue;
      fn(x, z);
    }
  };

  // ---- camp: tent / chest / fire / flag
  {
    const c = L.camp, cp = L.campProps, cg = campGeos();
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

  // ---- zone 1: Strand
  scatter(1, 16, 0.4, (x, z) => add('lit', put(palmGeo(rng, 5 + rng() * 3), x, hAt(x, z) - 0.15, z, rng() * 6)), { clear: 2 });
  scatter(1, 9, () => 1.0 + rng() * 1.4, (x, z, r) => add('lit', put(rockGeo(rng, r, '#bfae92', '#e6dcc4'), x, hAt(x, z) - 0.1, z)));
  scatter(1, 6, 0.9, (x, z) => add('lit', put(driftwoodGeo(rng, 2.4 + rng() * 2), x, hAt(x, z), z, rng() * 6)), { clear: 1.5, collider: false });
  cover(1, 140, (x, z) => add('lit', put(tuftGeo(rng, rng() < 0.5 ? '#9ab050' : '#b8c468', 0.6 + rng() * 0.5), x, hAt(x, z) - 0.05, z, rng() * 6)), 1.4);

  // ---- zone 2: Dschungel
  scatter(2, 12, 0.4, (x, z) => add('lit', put(palmGeo(rng, 6 + rng() * 3), x, hAt(x, z) - 0.15, z, rng() * 6)), { clear: 2 });
  scatter(2, 26, 0.9, (x, z) => add('lit', put(jungleTreeGeo(rng, 7 + rng() * 5), x, hAt(x, z) - 0.2, z, rng() * 6)), { clear: 2, extra: 2 });
  scatter(2, 6, () => 1.0 + rng() * 1.2, (x, z, r) => add('lit', put(rockGeo(rng, r, '#5e6e58', '#8a9a80'), x, hAt(x, z) - 0.1, z)));
  cover(2, 80, (x, z) => add('lit', put(fernGeo(rng, 0.9 + rng() * 0.7), x, hAt(x, z) - 0.05, z, rng() * 6)));
  cover(2, 110, (x, z) => add('lit', put(tuftGeo(rng, rng() < 0.5 ? '#4a9a3a' : '#68b048', 0.8 + rng() * 0.6), x, hAt(x, z) - 0.05, z, rng() * 6)));

  // ---- zone 3: Tiefer Dschungel (darker, tangled: big trees, mossy roots, glowing mushrooms)
  scatter(3, 42, 0.9, (x, z) => add('lit', put(jungleTreeGeo(rng, 9 + rng() * 6, true), x, hAt(x, z) - 0.2, z, rng() * 6)), { clear: 2, extra: 1.6 });
  scatter(3, 26, () => 1.2 + rng() * 1.0, (x, z) => add('lit', put(rootsGeo(rng, 1.4 + rng() * 1.2), x, hAt(x, z) - 0.05, z, rng() * 6)), { clear: 1.2, collider: false, extra: 1.5 });
  scatter(3, 20, 0.35, (x, z) => add('lit', put(bigMushroom(rng, 1.0 + rng() * 1.6, ['#40f0d0', '#68ffa8', '#30c8e8']), x, hAt(x, z) - 0.05, z, rng() * 6)), { clear: 1.5, extra: 2, collider: false });
  scatter(3, 6, () => 1.0 + rng() * 1.2, (x, z, r) => add('lit', put(rockGeo(rng, r, '#44564a', '#6a7e6c'), x, hAt(x, z) - 0.1, z)));
  cover(3, 90, (x, z) => add('lit', put(fernGeo(rng, 0.9 + rng() * 0.7, true), x, hAt(x, z) - 0.05, z, rng() * 6)));
  cover(3, 80, (x, z) => add('lit', put(tuftGeo(rng, rng() < 0.5 ? '#2f5a2c' : '#3a6a34', 0.8 + rng() * 0.6), x, hAt(x, z) - 0.05, z, rng() * 6)));

  // ---- zone 4: Verfluchter Tempel (overgrown ruin on the plateau; the middle is a big open arena)
  {
    const c = TEMPLE_C, cy = hAt(c.x, c.z);
    add('lit', put(daisGeo(7), c.x, cy - 0.02, c.z));
    runeGeos.push(put(runeRing(9), c.x, cy + 0.14, c.z)); // Runen: eigenes Material (setRuneGlow tauscht Tuerkis gegen Hacker-Neongruen)
    // gate at the top of the stair
    add('lit', put(gateGeo(rng, 14), 65, hAt(65, -33) - 0.1, -33));
    L.addCollider({ x: 58, z: -33, r: 1.7 }); L.addCollider({ x: 72, z: -33, r: 1.7 });
    // ring of ruined pillars around the arena (standing and broken)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 6.283 + 0.26, d = 29 + (rng() - 0.5) * 2, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (z > -36 && Math.abs(x - 65) < 9) continue; // keep the gate side open
      const h = i % 3 === 0 ? 2 + rng() * 2 : 6.5 + rng() * 3;
      const pg = put(templePillar(rng, h, 0.9), x, hAt(x, z), z, rng() * 6);
      if (h >= 6) { // hohe Saeulen einzeln halten: Deckung vor dem Krachfaust-Urknall, brechen danach (mesh.visible = false)
        const mesh = new THREE.Mesh(pg, mats.lit);
        mesh.name = `pillar-${i}`;
        group.add(mesh);
        pillars.push({ id: pillars.length, x, z, r: 1.15, h, broken: false, mesh });
      } else add('lit', pg);
      L.addCollider({ x, z, r: 1.15 });
      if (i % 4 === 1) { // a fallen one next to it
        const fx = x + Math.cos(a + 1.57) * 4, fz = z + Math.sin(a + 1.57) * 4;
        add('lit', put(fallenPillar(rng, 4.5, 0.8), fx, hAt(fx, fz), fz, 0));
        L.addCollider({ x: fx, z: fz, r: 1.5 });
      }
    }
    // rune slabs facing the middle
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.283 + 0.5, x = c.x + Math.cos(a) * 20, z = c.z + Math.sin(a) * 20, rs = runeSlab(rng);
      const yaw = Math.atan2(c.x - x, c.z - z);
      add('lit', put(rs.stone, x, hAt(x, z), z, yaw)); runeGeos.push(put(rs.glow, x, hAt(x, z), z, yaw));
      L.addCollider({ x, z, r: 0.9 });
    }
    // parapet stumps along the three closed edges (the cliff blocks anyway; this only reads as wall)
    for (let k = 0; k < 9; k++) for (const [x, z, w, d] of [[TEMPLE.x0 + 2.2, -97 + k * 7, 1.6, 5.5], [TEMPLE.x1 - 2.2, -97 + k * 7, 1.6, 5.5], [33 + k * 7.2, TEMPLE.z0 + 2.2, 5.5, 1.6]]) {
      if (rng() < 0.3) continue;
      add('lit', put(blockGeo(w, 0.8 + rng() * 1.6, d), x, hAt(x, z), z, 0));
    }
    // stair slabs on the ramp up from the Dschungel
    for (let i = 0; i < 8; i++) {
      const z = -16 - i * 1.9, slope = Math.atan((hAt(65, z - 1) - hAt(65, z + 1)) / 2);
      add('lit', put(box(24, 0.22, 1.5, '#84948a'), 65, hAt(65, z) + 0.08, z, 0, 1, Math.abs(slope)));
    }
    // blocks + moss on the plateau
    scatter(4, 10, () => 1.0 + rng() * 0.8, (x, z, r) => add('lit', put(blockGeo(r * 2, r * 0.9, r * 1.6), x, hAt(x, z), z, rng() * 6)));
    scatter(4, 14, 0.9, (x, z) => add('lit', put(jungleTreeGeo(rng, 9 + rng() * 5, true), x, hAt(x, z) - 0.2, z, rng() * 6)), { clear: 2, extra: 1.6 });
    scatter(4, 14, 0.35, (x, z) => add('lit', put(bigMushroom(rng, 1.0 + rng() * 1.4, ['#40f0d0', '#68ffa8', '#30c8e8']), x, hAt(x, z) - 0.05, z, rng() * 6)), { clear: 1.5, extra: 2, collider: false });
    cover(4, 120, (x, z) => add('lit', put(tuftGeo(rng, rng() < 0.5 ? '#3a6a34' : '#4a7a3a', 0.6 + rng() * 0.5), x, hAt(x, z) - 0.05, z, rng() * 6)));
    cover(4, 40, (x, z) => add('lit', put(fernGeo(rng, 0.9 + rng() * 0.6, true), x, hAt(x, z) - 0.05, z, rng() * 6)));
  }

  // ---- Runen (Ring + Platten): ein Mesh mit eigenem Material, damit setRuneGlow die Farbe in der Wutphase wechseln kann
  const runeMat = basic({ vertexColors: true });
  if (runeGeos.length) { const rm = new THREE.Mesh(merge(runeGeos), runeMat); rm.name = 'temple-runes'; group.add(rm); }

  // ---- merge the batches into meshes
  for (const [bk, b] of batches) {
    const m = new THREE.Mesh(merge(b.geos), mats[b.key]);
    m.name = `props-${bk}`;
    group.add(m);
  }

  // ================================================================ gather points
  const gatherPoints = placeSmaragdPoints(L, seed);
  const gather = createGatherables({ layout: L, seed, points: gatherPoints, builders: { ...BUILDERS, ...SK_BUILDERS } });
  group.add(gather.group);

  // ================================================================ ambient particles: glow motes (deep jungle), temple spores, falling leaves, sea glints (one Points object)
  const PN = 150, pRng = createRng(seed * 977 + 5);
  const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3);
  const parts = [];
  const spawnP = (p) => {
    if (p.kind === 0) { // yellow-green motes drifting through the deep jungle
      p.x = 14 + pRng() * 100; p.z = 14 + pRng() * 100; p.y = hAt(p.x, p.z) + 0.6 + pRng() * 2.5;
      p.vx = (pRng() - 0.5) * 0.8; p.vy = (pRng() - 0.5) * 0.3; p.vz = (pRng() - 0.5) * 0.8; p.life = 3 + pRng() * 3;
    } else if (p.kind === 1) { // turquoise spores rising from the temple
      p.x = 32 + pRng() * 66; p.z = -98 + pRng() * 64; p.y = hAt(p.x, p.z) + 0.3;
      p.vx = (pRng() - 0.5) * 0.5; p.vy = 0.4 + pRng() * 0.7; p.vz = (pRng() - 0.5) * 0.5; p.life = 3 + pRng() * 2.5;
    } else if (p.kind === 2) { // leaves sinking down in the Dschungel
      p.x = -114 + pRng() * 100; p.z = 14 + pRng() * 100; p.y = hAt(p.x, p.z) + 5 + pRng() * 3;
      p.vx = 0.4 + pRng() * 0.4; p.vy = -0.9 - pRng() * 0.4; p.vz = (pRng() - 0.5) * 0.6; p.life = 3.5 + pRng() * 2;
    } else { // glints on the water at the shore
      let x = -110 + pRng() * 90, z = -110 + pRng() * 90;
      for (let t = 0; t < 8 && !(hAt(x, z) < 0.9 && hAt(x, z) > -3); t++) { x = -112 + pRng() * 94; z = -112 + pRng() * 94; }
      p.x = x; p.z = z; p.y = 0.2; p.vx = 0; p.vy = 0; p.vz = 0; p.life = 0.6 + pRng() * 0.8;
    }
    p.t = pRng() * p.life;
  };
  for (let i = 0; i < PN; i++) {
    const p = { kind: i < 45 ? 0 : i < 85 ? 1 : i < 115 ? 2 : 3, t: 0, life: 1 };
    spawnP(p); parts.push(p);
  }
  const PCOL = [[0.7, 1, 0.4], [0.3, 1, 0.8], [0.45, 0.8, 0.3], [1, 1, 0.9]];
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pg.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pointsMat = new THREE.PointsMaterial({ size: 3.5, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const points = new THREE.Points(pg, pointsMat);
  points.frustumCulled = false;
  points.name = 'ambient-particles';
  group.add(points);
  const stepParticles = (dt) => {
    for (let i = 0; i < PN; i++) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { spawnP(p); p.t = 0; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = Math.sin((p.t / p.life) * Math.PI), c = PCOL[p.kind];
      pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z;
      pCol[i * 3] = c[0] * k; pCol[i * 3 + 1] = c[1] * k; pCol[i * 3 + 2] = c[2] * k;
    }
    pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true;
  };
  stepParticles(0.01);

  // ================================================================ lights
  const ambient = new THREE.AmbientLight(ENV[0].amb, ENV[0].ambI);
  const sun = new THREE.DirectionalLight(ENV[0].sun, ENV[0].sunI);
  sun.position.set(-6, 12, -8);
  const fill = new THREE.DirectionalLight('#6ac0b0', 0.3);
  fill.position.set(5, 4, 8);
  group.add(ambient, sun, fill);

  // ================================================================ minimap image (precomputed, 130x130 RGBA, north = up)
  const MM = 130, mmData = new Uint8ClampedArray(MM * MM * 4);
  {
    const base = ['#e8d8a0', '#4a8a3c', '#264a30', '#5a7870'].map((h) => new THREE.Color(h));
    const wallC = new THREE.Color('#1e2c22'), seaC = new THREE.Color('#30b8c0'), c = new THREE.Color();
    for (let j = 0; j < MM; j++) for (let i = 0; i < MM; i++) {
      const x = -HALF + (i + 0.5) * CELL, z = -HALF + (j + 0.5) * CELL;
      const zid = zoneAt(x, z);
      const shade = 1 + (hAt(x - 2, z) - hAt(x + 2, z)) * 0.08 + (hAt(x, z - 2) - hAt(x, z + 2)) * 0.05;
      if (hAt(x, z) < SEA_BLOCK + 0.3 && zid === 1) c.copy(seaC);
      else if (L.sdfAt(x, z) < 0.6 || Math.abs(x) > 118 || Math.abs(z) > 118) c.copy(wallC).multiplyScalar(0.8 + Math.min(0.5, Math.max(0, hAt(x, z) / 30)));
      else c.copy(base[zid - 1]).multiplyScalar(Math.min(1.25, Math.max(0.7, shade)));
      const k = ((MM - 1 - j) * MM + i) * 4;
      mmData[k] = Math.min(255, c.r * 255); mmData[k + 1] = Math.min(255, c.g * 255); mmData[k + 2] = Math.min(255, c.b * 255); mmData[k + 3] = 255;
    }
  }

  // ================================================================ world interface
  const nestFor = (defId) => ({ ...L.nests[NEST_ZONE[defId] ?? 4] });
  const routeFor = (defId) => {
    const zs = ROUTE_ZONES[defId] ?? [NEST_ZONE[defId] ?? 4], out = [];
    zs.forEach((z, i) => {
      out.push(...L.routes[z]);
      const nz = zs[(i + 1) % zs.length], pass = zs.length > 1 ? PASSES[PASS_OF[`${Math.min(z, nz)}-${Math.max(z, nz)}`]] : null;
      if (pass) out.push(pass); // über den Pass in die nächste Zone (und am Ende zurück)
    });
    return out.map((p) => ({ x: p.x, z: p.z }));
  };
  const hazards = createHazards(L);
  const env0 = ENV[0];
  const world = {
    id: 'smaragdkueste',
    name: 'Smaragdküste',
    bounds: { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF },
    heightAt: hAt,
    collide: L.collide,
    groundType: L.groundType,
    zoneAt,
    nestFor,
    routeFor,
    nestPoint: nestFor('apex'),
    campPoint: { ...L.camp },
    spawnPoints: L.spawnPoints,
    monsterSpawns: L.monsterSpawns,
    zones: ZONES.map((z) => ({ id: z.id, name: z.name, x: z.cx, z: z.cz, r: 55 })),
    zoneName: (id) => ZONES[id - 1]?.name ?? '',
    env: { background: env0.bg, fog: { color: env0.bg, near: env0.near, far: env0.far } },
    gatherPoints: gather.points,
    pastures: [],
    interactables: [],
    setGatherState: gather.setState,
    minimap: { size: MM, data: mmData },
    layout: L,
    temple: { pillars, c: { ...TEMPLE_C } },
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
  let lastZone = 0, zoneStable = 0, t = 0, first = true, partAcc = 0;

  // ---- Krachfaust-Haken (docs/SMARAGD_BROCKEN.md 4.6): Deckung hinter Saeulen, Saeulenbruch, Runenfarbe, Lichtpuls
  /** Unzerstoerte hohe Saeule zwischen a (Brocken) und b (Pirscher)? Einfacher 2D-Check: Abstand Saeulenmitte -> Strecke a-b <= r + 0,7 (Koerperbreite). */
  world.coverBetween = (a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    for (const p of pillars) {
      if (p.broken) continue;
      const t = l2 > 1e-6 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
      const ex = a.x + dx * t - p.x, ez = a.z + dz * t - p.z;
      if (ex * ex + ez * ez <= (p.r + 0.7) ** 2 && t > 0.02 && t < 0.98) return p;
    }
    return null;
  };
  /** Saeule verbraucht: Mesh weg, Schutt-Block bleibt (der Collider r 1,15 bleibt als Truemmer). */
  world.breakPillar = (p) => {
    if (!p || p.broken) return false;
    p.broken = true;
    p.mesh.visible = false;
    const rub = new THREE.Mesh(put(blockGeo(2.8, 0.9, 2.2), p.x, hAt(p.x, p.z), p.z, p.id * 1.7), mats.lit);
    rub.name = `rubble-${p.id}`;
    group.add(rub);
    return true;
  };
  const RUNE_NEUTRAL = new THREE.Color('#ffffff');
  /** Runenfarbe: Tint als Faktor auf die tuerkisen Vertexfarben (Wutphase '#b8ff1a' -> Hacker-Neongruen), k = Helligkeit. */
  world.setRuneGlow = (hex = null, k = 1) => { runeMat.color.copy(hex ? tmpC.set(hex) : RUNE_NEUTRAL).multiplyScalar(k); };
  let pulseMul = 1;
  /** Licht-Multiplikator (Urknall-Aufladen pulst Ambient + Sonne). */
  world.pulse = (k = 1) => { pulseMul = k; };

  world.update = (dt, hunt) => {
    t += dt;
    seaTex.offset.x = Math.floor(t * 1.2) / 32;
    seaTex.offset.y = Math.floor(t * 0.8) / 32;
    seaMat.color.setScalar(0.92 + Math.sin(t * 1.4) * 0.08);
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
    const sc = hunt.scene;
    if (sc.background?.isColor) sc.background.copy(cur.bg); else sc.background = cur.bg.clone();
    if (sc.fog) { sc.fog.color.copy(sc.background); sc.fog.near = cur.near; sc.fog.far = cur.far; }
    if (hunt.camera && Math.abs(hunt.camera.far - (cur.far + 14)) > 1) { hunt.camera.far = cur.far + 14; hunt.camera.updateProjectionMatrix(); }
    ambient.color.copy(cur.amb); ambient.intensity = cur.ambI * pulseMul;
    sun.color.copy(cur.sun); sun.intensity = cur.sunI * pulseMul;

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

