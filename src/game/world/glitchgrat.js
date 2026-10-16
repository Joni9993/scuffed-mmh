import * as THREE from 'three';
import { lambert, basic } from '../../render/ps1.js';
import { tex } from '../../render/textures.js';
import { createRng, hashSeed } from '../../core/rng.js';
import { GATHER_KINDS } from '../../data/gather.js';
import {
  buildLayout,
  zoneWeights,
  zoneAt,
  ZONES,
  HALF,
  CELL,
  NG,
  PASSES,
  SUMMIT_C,
  SUMMIT_R,
  vnoise,
} from './glitchgratLayout.js';
import { registerWorldTextures } from './worldTextures.js';
import { put, merge, campGeos } from './props.js';
import {
  cragGeo,
  spireGeo,
  frostPineGeo,
  glitchMonolithGeo,
  floatingRubbleGeo,
  dataCrystalGeo,
  frostGrassTuft,
  summitDaisGeo,
  summitCircuitGeo,
  glitchArchGeo,
  schotterklammVistaGeo,
  rostwerkeVistaGeo,
  smaragdkuesteVistaGeo,
  GG_BUILDERS,
} from './glitchgratProps.js';
import { createGatherables, BUILDERS } from './gatherables.js';

export const TERRAIN_SEED = 4;

// Lighting and fog per zone
const ENV = [
  { bg: '#242b3d', near: 35, far: 110, amb: '#90a8d0', ambI: 1.4, sun: '#ffe0b0', sunI: 1.0 }, // Z1: Nebelkamm
  { bg: '#1c122e', near: 20, far: 85, amb: '#a880d8', ambI: 1.3, sun: '#c898ff', sunI: 1.2 },  // Z2: Blitzschlucht
  { bg: '#162838', near: 45, far: 140, amb: '#a0c8e8', ambI: 1.5, sun: '#f0f8ff', sunI: 1.1 }, // Z3: Eisenerz-Plateau
  { bg: '#171c30', near: 35, far: 110, amb: '#b0b8d8', ambI: 1.5, sun: '#e2b8d8', sunI: 1.0 },  // Z4: Der Weltenkamm
];

const GROUND_TEX = ['ridge_rock', 'ridge_ore', 'ridge_frost', 'glitch_core'];
const GROUND_TINT = ['#ffffff', '#ffffff', '#e8f0ff', '#ffffff'];
const CLIFF_TINT = ['#7a8494', '#6a5a78', '#8a9aa8', '#5a4868'];

const NEST_ZONE = { pyrostur: 4, felsengroll: 3, voltiris: 2, gockelok: 4, apex: 4 };
const ROUTE_ZONES = {
  pyrostur: [4, 3, 2],
  felsengroll: [3, 2, 1],
  voltiris: [2, 1, 4],
  gockelok: [4, 3, 2, 1],
};
const PASS_OF = { '1-2': 0, '2-3': 1, '3-4': 2, '1-4': 3 };
const ZONE_BOXES = {
  1: [-114, -114, -14, -14],
  2: [-114, 14, -14, 114],
  3: [14, 14, 114, 114],
  4: [14, -114, 114, -14],
};

// ---------------------------------------------------------------- gather points
export function placeGlitchgratPoints(L, seed) {
  const rng = createRng(hashSeed(`gather|glitchgrat|${seed}`));
  const points = [];
  const okSpot = (x, z) => {
    if (!L.reachable(x, z) || !L.walkable(x, z, 2.2) || L.slopeAt(x, z) > 0.45) return false;
    if (Math.hypot(x - L.camp.x, z - L.camp.z) < 10) return false;
    for (const n of Object.values(L.nests)) {
      if (Math.hypot(x - n.x, z - n.z) < 8) return false;
    }
    if (!L.clearOfColliders(x, z, 1.6)) return false;
    for (const p of points) {
      if (Math.hypot(p.pos.x - x, p.pos.z - z) < 5.5) return false;
    }
    return true;
  };

  for (const zone of [1, 2, 3, 4]) {
    const b = ZONE_BOXES[zone];
    for (const [kind, def] of Object.entries(GATHER_KINDS)) {
      if (def.world !== 'glitchgrat') continue;
      const n = def.zones[zone] ?? 0;
      for (let i = 0; i < n; i++) {
        let spot = null;
        for (let tries = 0; tries < 400 && !spot; tries++) {
          const x = b[0] + rng() * (b[2] - b[0]);
          const z = b[1] + rng() * (b[3] - b[1]);
          if (zoneAt(x, z) === zone && okSpot(x, z)) spot = { x, z };
        }
        if (!spot) continue;
        const uses = rng.int(def.uses[0], def.uses[1]);
        points.push({
          id: `gg_${zone}_${kind}_${i}`,
          kind,
          pos: { x: spot.x, y: L.heightAt(spot.x, spot.z), z: spot.z },
          zone,
          uses,
          maxUses: uses,
        });
      }
    }
  }
  return points;
}

export function createGlitchgrat({ seed = 1 } = {}) {
  registerWorldTextures();
  const L = buildLayout(TERRAIN_SEED);
  const rng = createRng(TERRAIN_SEED * 149 + 17);
  const group = new THREE.Group();
  group.name = 'glitchgrat';
  const hAt = L.heightAt;

  // ================================================================ terrain chunking
  const tmpC = new THREE.Color();
  const col = (hex, k = 1) => tmpC.set(hex).multiplyScalar(k);

  function vertexColor(zone, x, z, h, slope, out) {
    const n = vnoise(x * 0.35, z * 0.35, 11) * 0.5 + vnoise(x * 0.1, z * 0.1, 7) * 0.5;
    if (slope > 0.5) {
      const band = Math.sin(h * 1.5 + vnoise(x * 0.1, z * 0.1, 5) * 3) > 0 ? 1 : 0.85;
      col(CLIFF_TINT[zone - 1], band * (0.8 + n * 0.15));
    } else {
      col(GROUND_TINT[zone - 1], 0.88 + n * 0.16);
      if (zone === 2) {
        // Violet electric veins in Blitzschlucht
        if (vnoise(x * 0.4, z * 0.4, 27) > 0.4) tmpC.multiplyScalar(0.94);
      } else if (zone === 3) {
        // Frosty patches on Eisenerz-Plateau
        if (h > 15.5) tmpC.lerp(new THREE.Color('#ffffff'), Math.min(0.6, (h - 15.5) * 0.3));
      } else if (zone === 4) {
        // Cyber neon lines in Weltenkamm
        if (vnoise(x * 0.45, z * 0.45, 19) > 0.35) tmpC.multiplyScalar(0.96);
      }
    }
    out[0] = tmpC.r;
    out[1] = tmpC.g;
    out[2] = tmpC.b;
  }

  const terrainMats = GROUND_TEX.map((t) => lambert({ map: tex(t, { size: 32 }), vertexColors: true }));
  const cliffMat = lambert({ map: tex('ridge_cliff', { size: 32 }), vertexColors: true });
  const col3 = [0, 0, 0];
  const QUAD = [
    { i0: 0, j0: 0 },
    { i0: 0, j0: 65 },
    { i0: 65, j0: 65 },
    { i0: 65, j0: 0 },
  ];

  for (const zone of ZONES) {
    const { i0, j0 } = QUAD[zone.id - 1];
    const n = 66;
    const P = new Float32Array(n * n * 3);
    const N = new Float32Array(n * n * 3);
    const UV = new Float32Array(n * n * 2);
    const C = new Float32Array(n * n * 3);
    const slopes = new Float32Array(n * n);

    for (let jj = 0; jj < n; jj++) {
      for (let ii = 0; ii < n; ii++) {
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
    }

    const CH = 33, groups = new Map();
    for (let jj = 0; jj < n - 1; jj++) {
      for (let ii = 0; ii < n - 1; ii++) {
        const a = jj * n + ii, b = a + 1, c = a + n, d = c + 1;
        const steep = (slopes[a] + slopes[b] + slopes[c] + slopes[d]) / 4 > 0.55;
        const key = `${Math.floor(ii / CH)}|${Math.floor(jj / CH)}|${steep ? 1 : 0}`;
        let g = groups.get(key);
        if (!g) groups.set(key, (g = { steep, idx: [] }));
        g.idx.push(a, c, b, b, c, d);
      }
    }

    for (const [key, grp] of groups) {
      const map = new Map(), pp = [], nn = [], uu = [], cc = [], idx = [];
      for (const v of grp.idx) {
        let nv = map.get(v);
        if (nv === undefined) {
          nv = map.size;
          map.set(v, nv);
          pp.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
          nn.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
          uu.push(UV[v * 2], UV[v * 2 + 1]);
          cc.push(C[v * 3], C[v * 3 + 1], C[v * 3 + 2]);
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

  // ================================================================ VISTAS (Deep in the abyss)
  // Separate, cheap atmospheric layer: distant silhouettes keep their own fog
  // range, while nearby terrain retains the dense PS1 zone fog (also in mutators).
  const vistaMat = basic({ vertexColors: true });
  const patchVista = vistaMat.onBeforeCompile;
  vistaMat.onBeforeCompile = (shader) => {
    patchVista(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', `
      #ifdef USE_FOG
        float valleyFog = smoothstep(35.0, 280.0, vFogDepth);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, valleyFog);
      #endif
    `);
  };
  vistaMat.customProgramCacheKey = () => 'ps1-glitchgrat-vista';
  // South Abyss: Schotterklamm
  const southVista = new THREE.Mesh(schotterklammVistaGeo(), vistaMat);
  southVista.position.set(0, -90, -135);
  southVista.name = 'vista-schotterklamm';
  group.add(southVista);

  // West Abyss: Rostwerke
  const westVista = new THREE.Mesh(rostwerkeVistaGeo(), vistaMat);
  westVista.position.set(-135, -90, 0);
  westVista.name = 'vista-rostwerke';
  group.add(westVista);

  // East Abyss: Smaragdküste
  const eastVista = new THREE.Mesh(smaragdkuesteVistaGeo(), vistaMat);
  eastVista.position.set(135, -90, 0);
  eastVista.name = 'vista-smaragdkueste';
  group.add(eastVista);

  // ================================================================ props
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

  const taken = [];
  const spotOk = (x, z, zone, clear, extra = 2.5) => {
    if (zoneAt(x, z) !== zone || !L.walkable(x, z, clear)) return false;
    if (Math.hypot(x - L.camp.x, z - L.camp.z) < 14) return false;
    // Preserve the full arena and the approaches between zones, including prop radii.
    if (Math.hypot(x - SUMMIT_C.x, z - SUMMIT_C.z) < SUMMIT_R + clear + 4) return false;
    for (const p of PASSES) {
      if (Math.hypot(x - p.x, z - p.z) < 13 + clear) return false;
    }
    for (const n of Object.values(L.nests)) {
      if (Math.hypot(x - n.x, z - n.z) < 12) return false;
    }
    for (const t of taken) {
      if (Math.hypot(x - t.x, z - t.z) < t.r + extra) return false;
    }
    return true;
  };

  const scatter = (zone, count, r, fn, { clear = 1.5, collider = true, tries = 50, extra = 2.5 } = {}) => {
    for (let i = 0; i < count; i++) {
      for (let t = 0; t < tries; t++) {
        const cx = ZONES[zone - 1].cx + (rng() - 0.5) * 95;
        const cz = ZONES[zone - 1].cz + (rng() - 0.5) * 95;
        const rr = typeof r === 'function' ? r() : r;
        if (!spotOk(cx, cz, zone, clear + rr, extra)) continue;
        fn(cx, cz, rr);
        if (collider) L.addCollider({ x: cx, z: cz, r: rr * 0.85 });
        taken.push({ x: cx, z: cz, r: rr });
        break;
      }
    }
  };

  const cover = (zone, count, fn, minH = 3.0) => {
    const b = ZONE_BOXES[zone];
    for (let i = 0; i < count; i++) {
      const x = b[0] + rng() * (b[2] - b[0]);
      const z = b[1] + rng() * (b[3] - b[1]);
      if (zoneAt(x, z) !== zone || !L.walkable(x, z, 0.8) || hAt(x, z) < minH) continue;
      fn(x, z);
    }
  };

  // ---- Camp
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

  // ---- Zone 1: Nebelkamm
  scatter(1, 14, () => 1.2 + rng() * 1.5, (x, z, r) => add('lit', put(cragGeo(rng, r, '#363d4d', '#525e74'), x, hAt(x, z) - 0.1, z)));
  scatter(1, 12, 0.45, (x, z) => add('lit', put(frostPineGeo(rng, 5 + rng() * 3), x, hAt(x, z) - 0.1, z, rng() * 6)), { clear: 1.8 });
  cover(1, 90, (x, z) => add('lit', put(frostGrassTuft(rng, 0.7 + rng() * 0.5), x, hAt(x, z) - 0.05, z, rng() * 6)));

  // ---- Zone 2: Blitzschlucht
  scatter(2, 16, () => 1.0 + rng() * 1.4, (x, z, r) => add('lit', put(spireGeo(rng, 8 + rng() * 4, '#241a36'), x, hAt(x, z) - 0.1, z)));
  scatter(2, 8, 1.2, (x, z) => add('lit', put(glitchMonolithGeo(rng, 7 + rng() * 3), x, hAt(x, z), z, rng() * 6)), { clear: 2 });
  scatter(2, 10, 0.6, (x, z) => add('glow', put(dataCrystalGeo(rng, 1.2), x, hAt(x, z), z, rng() * 6)), { collider: false });
  scatter(2, 6, 1.5, (x, z) => add('glow', put(floatingRubbleGeo(rng, 2.0), x, hAt(x, z), z)), { collider: false });

  // ---- Zone 3: Eisenerz-Plateau
  scatter(3, 16, () => 1.3 + rng() * 1.6, (x, z, r) => add('lit', put(cragGeo(rng, r, '#283648', '#465c78'), x, hAt(x, z) - 0.1, z)));
  scatter(3, 8, 0.45, (x, z) => add('lit', put(frostPineGeo(rng, 6 + rng() * 3), x, hAt(x, z) - 0.1, z, rng() * 6)), { clear: 1.8 });
  scatter(3, 8, 0.6, (x, z) => add('glow', put(dataCrystalGeo(rng, 1.3), x, hAt(x, z), z, rng() * 6)), { collider: false });
  cover(3, 80, (x, z) => add('lit', put(frostGrassTuft(rng, 0.8 + rng() * 0.6), x, hAt(x, z) - 0.05, z, rng() * 6)));

  // ---- Zone 4: Der Weltenkamm (Summit Arena)
  const sc = SUMMIT_C, scy = hAt(sc.x, sc.z);
  const arenaBorder = new THREE.Mesh(put(summitDaisGeo(SUMMIT_R), sc.x, scy + 0.025, sc.z), mats.lit);
  arenaBorder.name = 'summit-border';
  group.add(arenaBorder);
  const runeMat = basic({ vertexColors: true });
  const circuitMesh = new THREE.Mesh(summitCircuitGeo(SUMMIT_R * 0.75), runeMat);
  circuitMesh.position.set(sc.x, scy + 0.04, sc.z);
  circuitMesh.name = 'summit-circuits';
  group.add(circuitMesh);

  // Digital entrance archway
  add('lit', put(glitchArchGeo(rng, 14, 9), sc.x, scy, sc.z + SUMMIT_R + 2, Math.PI));
  L.addCollider({ x: sc.x - 7, z: sc.z + SUMMIT_R + 2, r: 1.6 });
  L.addCollider({ x: sc.x + 7, z: sc.z + SUMMIT_R + 2, r: 1.6 });

  // Surrounding monoliths
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const mx = sc.x + Math.cos(a) * (SUMMIT_R + 6);
    const mz = sc.z + Math.sin(a) * (SUMMIT_R + 6);
    add('lit', put(glitchMonolithGeo(rng, 8 + rng() * 3), mx, hAt(mx, mz), mz, a));
    L.addCollider({ x: mx, z: mz, r: 1.8 });
  }

  // Merge the prop batches
  for (const [bk, b] of batches) {
    const m = new THREE.Mesh(merge(b.geos), mats[b.key]);
    m.name = `props-${bk}`;
    group.add(m);
  }

  // ================================================================ gather points
  const gatherPoints = placeGlitchgratPoints(L, seed);
  const gather = createGatherables({
    layout: L,
    seed,
    points: gatherPoints,
    builders: { ...BUILDERS, ...GG_BUILDERS },
  });
  group.add(gather.group);

  // ================================================================ ambient particles (snow flurries & glitch motes)
  const PN = 140, pRng = createRng(seed * 883 + 7);
  const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3);
  const parts = [];

  const spawnP = (p) => {
    p.x = -100 + pRng() * 200;
    p.z = -100 + pRng() * 200;
    p.y = hAt(p.x, p.z) + 1.5 + pRng() * 6.0;
    p.vx = -1.5 - pRng() * 2.0; // strong wind to west
    p.vy = -0.4 - pRng() * 0.6;
    p.vz = (pRng() - 0.5) * 1.5;
    p.life = 2.5 + pRng() * 2.0;
    p.t = pRng() * p.life;
  };

  for (let i = 0; i < PN; i++) {
    const p = { kind: i < 80 ? 0 : 1, t: 0, life: 1 };
    spawnP(p);
    parts.push(p);
  }

  const PCOL = [
    [0.85, 0.95, 1.0], // frost snow
    [0.0, 0.95, 1.0],  // cyan glitch spark
  ];

  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pg.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pointsMat = new THREE.PointsMaterial({
    size: 3.5,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const points = new THREE.Points(pg, pointsMat);
  points.frustumCulled = false;
  points.name = 'glitchgrat-particles';
  group.add(points);

  const stepParticles = (dt) => {
    for (let i = 0; i < PN; i++) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) {
        spawnP(p);
        p.t = 0;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const k = Math.sin((p.t / p.life) * Math.PI);
      const c = PCOL[p.kind];
      pPos[i * 3] = p.x;
      pPos[i * 3 + 1] = p.y;
      pPos[i * 3 + 2] = p.z;
      pCol[i * 3] = c[0] * k;
      pCol[i * 3 + 1] = c[1] * k;
      pCol[i * 3 + 2] = c[2] * k;
    }
    pg.attributes.position.needsUpdate = true;
    pg.attributes.color.needsUpdate = true;
  };
  stepParticles(0.01);

  // ================================================================ lights
  const ambient = new THREE.AmbientLight(ENV[0].amb, ENV[0].ambI);
  const sun = new THREE.DirectionalLight(ENV[0].sun, ENV[0].sunI);
  sun.position.set(-8, 16, -10);
  const fill = new THREE.DirectionalLight('#7a60b0', 0.4);
  fill.position.set(8, 5, 10);
  group.add(ambient, sun, fill);

  // ================================================================ minimap (130x130 RGBA)
  const MM = 130, mmData = new Uint8ClampedArray(MM * MM * 4);
  {
    const base = ['#4b5466', '#36304a', '#8aa0b8', '#1e1828'].map((h) => new THREE.Color(h));
    const cliffC = new THREE.Color('#20242e');
    const c = new THREE.Color();
    for (let j = 0; j < MM; j++) {
      for (let i = 0; i < MM; i++) {
        const x = -HALF + (i + 0.5) * CELL, z = -HALF + (j + 0.5) * CELL;
        const zid = zoneAt(x, z);
        const shade = 1 + (hAt(x - 2, z) - hAt(x + 2, z)) * 0.08 + (hAt(x, z - 2) - hAt(x, z + 2)) * 0.05;
        if (L.sdfAt(x, z) < 0.6 || Math.abs(x) > 118 || Math.abs(z) > 118) {
          c.copy(cliffC);
        } else {
          c.copy(base[zid - 1]).multiplyScalar(Math.min(1.25, Math.max(0.7, shade)));
        }
        const k = ((MM - 1 - j) * MM + i) * 4;
        mmData[k] = Math.min(255, c.r * 255);
        mmData[k + 1] = Math.min(255, c.g * 255);
        mmData[k + 2] = Math.min(255, c.b * 255);
        mmData[k + 3] = 255;
      }
    }
  }

  // ================================================================ world interface
  const nestFor = (defId) => ({ ...L.nests[NEST_ZONE[defId] ?? 4] });
  const routeFor = (defId) => {
    const zs = ROUTE_ZONES[defId] ?? [NEST_ZONE[defId] ?? 4];
    const out = [];
    zs.forEach((z, i) => {
      out.push(...L.routes[z]);
      const nz = zs[(i + 1) % zs.length];
      const pass = zs.length > 1 ? PASSES[PASS_OF[`${Math.min(z, nz)}-${Math.max(z, nz)}`]] : null;
      if (pass) out.push(pass);
    });
    return out.map((p) => ({ x: p.x, z: p.z }));
  };

  const env0 = ENV[0];
  const world = {
    id: 'glitchgrat',
    name: 'Glitchgrat',
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
    mesh: group,
    gather,
    setRuneGlow: (tint, k = 1) => {
      if (tint) runeMat.color.set(tint).multiplyScalar(k);
    },
    pulse: (k) => {
      ambient.intensity = env0.ambI * k;
      sun.intensity = env0.sunI * k;
    },
    setZoneEnv: (zid) => {
      const e = ENV[zid - 1] ?? env0;
      world.env.background = e.bg;
      world.env.fog.color = e.bg;
      world.env.fog.near = e.near;
      world.env.fog.far = e.far;
      ambient.color.set(e.amb);
      ambient.intensity = e.ambI;
      sun.color.set(e.sun);
      sun.intensity = e.sunI;
    },
  };

  // ---------------------------------------------------------------- per-frame update
  const cur = {
    bg: new THREE.Color(env0.bg),
    amb: new THREE.Color(env0.amb),
    sun: new THREE.Color(env0.sun),
    near: env0.near,
    far: env0.far,
    ambI: env0.ambI,
    sunI: env0.sunI,
  };
  const tgt = { bg: new THREE.Color(), amb: new THREE.Color(), sun: new THREE.Color() };
  const ec = ENV.map((e) => ({
    bg: new THREE.Color(e.bg),
    amb: new THREE.Color(e.amb),
    sun: new THREE.Color(e.sun),
  }));
  const wv = [0, 0, 0, 0];
  let lastZone = 0, zoneStable = 0, t = 0, first = true, partAcc = 0;

  world.update = (dt, hunt) => {
    t += dt;
    partAcc += dt;
    if (partAcc >= 1 / 20) {
      stepParticles(partAcc);
      partAcc = 0;
    }
    const pl = hunt?.player;
    if (!pl) return;
    zoneWeights(pl.pos.x, pl.pos.z, 22, wv);
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
    const sc = hunt?.scene;
    if (sc) {
      if (sc.background?.isColor) sc.background.copy(cur.bg); else sc.background = cur.bg.clone();
      if (sc.fog) {
        const fogK = hunt.mods?.hunt?.fog ?? 1;
        sc.fog.color.copy(sc.background); sc.fog.near = cur.near / fogK; sc.fog.far = cur.far / fogK;
      }
    }
    if (hunt?.camera && hunt.camera.far !== 360) {
      hunt.camera.far = 360; // includes the three low-poly valley proxies, no shadow maps
      hunt.camera.updateProjectionMatrix();
    }
    ambient.color.copy(cur.amb); ambient.intensity = cur.ambI;
    sun.color.copy(cur.sun); sun.intensity = cur.sunI;

    const z = zoneAt(pl.pos.x, pl.pos.z);
    if (z !== lastZone) {
      zoneStable += dt;
      if (zoneStable > (lastZone === 0 ? 0 : 0.35)) {
        lastZone = z; zoneStable = 0;
        hunt?.bus?.emit('zoneEnter', { zone: z, name: ZONES[z - 1].name });
      }
    } else zoneStable = 0;

    gather.update(dt, hunt);
  };

  world.dispose = () => {
    gather.dispose();
  };


  return world;
}
