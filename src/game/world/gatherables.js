import * as THREE from 'three';
import { basic } from '../../render/ps1.js';
import { createRng, hashSeed } from '../../core/rng.js';
import { GATHER_KINDS, GATHER_TIME, GATHER_RANGE, GATHER_ITEM_NAMES, rollGather } from '../../data/gather.js';
import { colored, put, merge, bakeShade, recolor, faceColors } from './props.js';
import { distToCracks } from './layout.js';

// ---------------------------------------------------------------- small PS1 props, one builder per kind
const ZONE_BOXES = { 1: [-100, -100, -14, -14], 2: [-100, 14, -14, 100], 3: [14, 14, 100, 100], 4: [14, -100, 100, -14] };

const J = (rng, a) => (rng() - 0.5) * a;
const tint = (hex, k) => { const c = new THREE.Color(hex).multiplyScalar(k); return [c.r, c.g, c.b]; };

const BUILDERS = {
  kraeuterbusch(rng, zone) {
    const parts = [];
    const leaf = zone === 3 ? ['#6a8a3a', '#7a9a48', '#4a7a50'] : ['#58a838', '#6cc040', '#3f8a30'];
    for (let i = 0; i < 8; i++) {
      const h = 0.7 + rng() * 0.6, a = (i / 8) * 6.28 + rng();
      const g = colored(new THREE.ConeGeometry(0.13, h, 3), leaf[i % 3]);
      recolor(g, (x, y) => tint(leaf[i % 3], 0.6 + (y / h + 0.5) * 0.7));
      put(g, 0, h / 2, 0); put(g, Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12, a, 1, 0, 0.35 + rng() * 0.3);
      parts.push(g);
    }
    for (let i = 0; i < 3; i++) { // blossoms
      const a = rng() * 6.28;
      parts.push(put(colored(new THREE.OctahedronGeometry(0.11, 0), i === 0 ? '#e86ad0' : '#6aa8ff'), Math.cos(a) * 0.34, 0.85 + rng() * 0.2, Math.sin(a) * 0.34));
    }
    return merge(parts);
  },
  pilzring(rng, zone) {
    const parts = [];
    const caps = ['#b050c8', '#d8708a', '#7a58d0', '#5aa890'];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.28, h = 0.28 + rng() * 0.22;
      const x = Math.cos(a) * 0.62, z = Math.sin(a) * 0.62;
      parts.push(put(colored(new THREE.CylinderGeometry(0.05, 0.08, h, 4), '#e8e0c8'), x, h / 2, z));
      const c = colored(new THREE.SphereGeometry(0.2 + rng() * 0.08, 5, 3, 0, 6.283, 0, Math.PI / 2), caps[i % caps.length]);
      faceColors(c, (f) => (f % 5 === 0 ? '#f4efd8' : caps[i % caps.length]));
      parts.push(put(c, x, h, z, 0, [1, 0.75, 1]));
    }
    parts.push(put(colored(new THREE.CylinderGeometry(0.62, 0.7, 0.04, 8), '#3a3a28'), 0, 0.02, 0));
    return merge(parts);
  },
  erzader(rng, zone) {
    const parts = [];
    const rock = colored(new THREE.DodecahedronGeometry(0.62, 0), '#6a6272');
    put(rock, 0, 0.4, 0, rng() * 6, [1.1, 0.75, 0.95]);
    parts.push(rock);
    const nug = zone === 4 ? ['#d86a2a', '#ffb040'] : ['#c8a050', '#e8c860'];
    for (let i = 0; i < 4; i++) {
      const a = rng() * 6.28;
      parts.push(put(colored(new THREE.OctahedronGeometry(0.15 + rng() * 0.07, 0), nug[i % 2]), Math.cos(a) * 0.5, 0.35 + rng() * 0.3, Math.sin(a) * 0.5, rng() * 3));
    }
    const cr = colored(new THREE.ConeGeometry(0.12, 0.55, 4), '#7fe8ff');
    recolor(cr, (x, y) => tint('#7fe8ff', 0.7 + (y / 0.55 + 0.5) * 0.5));
    parts.push(put(cr, 0.1, 0.9, -0.1, 0, 1, 0.2, 0.15));
    return merge(parts);
  },
  knochenhaufen(rng) {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const len = 0.8 + rng() * 0.7, th = 0.06 + rng() * 0.04;
      const ry = rng() * 6.28, rz = J(rng, 0.5), cx = J(rng, 0.5), cz = J(rng, 0.5), cy = 0.12 + i * 0.07;
      const stick = [colored(new THREE.CylinderGeometry(th, th, len, 5), '#e6dabc')];
      for (const s of [-1, 1]) stick.push(put(colored(new THREE.OctahedronGeometry(th * 1.9, 0), '#f2e9d2'), 0, s * len / 2, 0));
      parts.push(put(merge(stick), cx, cy, cz, ry, 1, Math.PI / 2 + J(rng, 0.4), rz));
    }
    parts.push(put(colored(new THREE.SphereGeometry(0.22, 5, 4), '#f2e9d2'), 0.1, 0.4, 0.05, 0, [1, 0.9, 1.1]));
    parts.push(put(colored(new THREE.BoxGeometry(0.2, 0.08, 0.08), '#2a2018'), 0.1, 0.47, 0.25));
    return merge(parts);
  },
  kaeferschwarm(rng) {
    const parts = [colored(new THREE.CylinderGeometry(0.55, 0.62, 0.05, 7), '#3a2a1a')];
    const cols = ['#2a4a8a', '#3a9a58', '#d8c030', '#6a3aa8'];
    parts[0] = put(parts[0], 0, 0.025, 0);
    for (let i = 0; i < 10; i++) {
      const a = rng() * 6.28, r = rng() * 0.5;
      const b = colored(new THREE.SphereGeometry(0.1, 4, 3), cols[i % cols.length]);
      parts.push(put(b, Math.cos(a) * r, 0.1 + (i % 3) * 0.04, Math.sin(a) * r, a, [1, 0.7, 1.4]));
    }
    return merge(parts);
  },
  glutspalte(rng) {
    const parts = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.28 + rng() * 0.5, len = 0.9 + rng() * 0.6;
      const g = colored(new THREE.BoxGeometry(0.16, 0.05, len), i % 2 ? '#ff7a1a' : '#ffb030');
      parts.push(put(g, Math.cos(a) * len / 2, 0.04, Math.sin(a) * len / 2, -a + Math.PI / 2));
    }
    parts.push(put(colored(new THREE.CylinderGeometry(0.26, 0.3, 0.05, 6), '#ffd860'), 0, 0.05, 0));
    for (let i = 0; i < 4; i++) {
      const a = rng() * 6.28, r = 0.45 + rng() * 0.3;
      parts.push(put(colored(new THREE.DodecahedronGeometry(0.18, 0), '#3a2428'), Math.cos(a) * r, 0.14, Math.sin(a) * r, a));
      parts.push(put(colored(new THREE.OctahedronGeometry(0.08, 0), '#ff9a30'), Math.cos(a) * r, 0.28, Math.sin(a) * r));
    }
    return merge(parts);
  },
  sprudelquelle(rng) {
    const parts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.28;
      parts.push(put(colored(new THREE.BoxGeometry(0.28, 0.22 + rng() * 0.1, 0.22), i % 2 ? '#7a7284' : '#6a6272'), Math.cos(a) * 0.62, 0.12, Math.sin(a) * 0.62, -a));
    }
    parts.push(put(colored(new THREE.CylinderGeometry(0.58, 0.58, 0.06, 8), '#4aa8e8'), 0, 0.1, 0));
    for (let i = 0; i < 5; i++) parts.push(put(colored(new THREE.OctahedronGeometry(0.07 + (i % 2) * 0.03, 0), '#d8f4ff'), J(rng, 0.2), 0.3 + i * 0.16, J(rng, 0.2)));
    return merge(parts);
  },
};

// ---------------------------------------------------------------- placement (deterministic from the hunt seed)
function placePoints({ layout, seed }) {
  const rng = createRng(hashSeed(`gather|${seed}`));
  const points = [];
  const minDist = 5.5;
  const okSpot = (x, z, kind) => {
    if (!layout.reachable(x, z) || !layout.walkable(x, z, 2.2)) return false;
    const g = layout.groundType(x, z);
    if (g === 'lava' || g === 'mud') return false;
    if (Math.hypot(x - layout.camp.x, z - layout.camp.z) < 9) return false;
    for (const n of Object.values(layout.nests)) if (Math.hypot(x - n.x, z - n.z) < 8) return false;
    for (const c of layout.colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + 1.4) return false;
    for (const p of points) if (Math.hypot(p.pos.x - x, p.pos.z - z) < minDist) return false;
    if (kind !== 'glutspalte' && layout.cracks.length && distToCracks(layout.cracks, x, z) < 3) return false;
    return true;
  };
  for (const zone of [1, 2, 3, 4]) {
    const b = ZONE_BOXES[zone];
    for (const [kind, def] of Object.entries(GATHER_KINDS)) {
      const n = def.zones[zone] ?? 0;
      for (let i = 0; i < n; i++) {
        let spot = null;
        for (let tries = 0; tries < 300 && !spot; tries++) {
          let x, z;
          if (kind === 'glutspalte') { // right next to a lava crack
            const c = layout.cracks[(rng() * layout.cracks.length) | 0];
            const s = (rng() * (c.pts.length - 1)) | 0, t = rng();
            const a = c.pts[s], e = c.pts[s + 1];
            const px = a.x + (e.x - a.x) * t, pz = a.z + (e.z - a.z) * t;
            const ang = rng() * 6.28, off = c.w / 2 + 1.6 + rng() * 1.5;
            x = px + Math.cos(ang) * off; z = pz + Math.sin(ang) * off;
          } else { x = b[0] + rng() * (b[2] - b[0]); z = b[1] + rng() * (b[3] - b[1]); }
          if (okSpot(x, z, kind)) spot = { x, z };
        }
        if (!spot) continue;
        const uses = rng.int(def.uses[0], def.uses[1]);
        points.push({
          id: `g${zone}-${points.length}`, kind, zone, pos: { x: spot.x, y: layout.heightAt(spot.x, spot.z), z: spot.z },
          usesLeft: uses, maxUses: uses, yaw: rng() * 6.28,
        });
      }
    }
  }
  return points;
}

// ---------------------------------------------------------------- the gatherable system
export function createGatherables({ layout, seed = 1, bus = null }) {
  const points = placePoints({ layout, seed });
  const byId = new Map(points.map((p) => [p.id, p]));
  const group = new THREE.Group();
  group.name = 'gatherables';

  // merged meshes per 40 m map cell (frustum culling), unlit vertex-coloured material with baked shading
  const mat = basic({ vertexColors: true });
  const cells = new Map();
  for (const p of points) {
    const key = `${Math.floor((p.pos.x + 120) / 40)}|${Math.floor((p.pos.z + 120) / 40)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(p);
  }
  for (const [key, cp] of cells) {
    const geos = [];
    let offset = 0;
    for (const p of cp) {
      const rng = createRng(hashSeed(`${p.id}|geo`));
      const g = bakeShade(BUILDERS[p.kind](rng, p.zone), 0.62);
      put(g, p.pos.x, p.pos.y, p.pos.z, p.yaw, 1.35);
      p.vstart = offset; p.vcount = g.attributes.position.count; offset += p.vcount;
      geos.push(g);
    }
    const merged = merge(geos);
    const zm = { mesh: new THREE.Mesh(merged, mat), orig: merged.attributes.color.array.slice(), colorAttr: merged.attributes.color };
    zm.mesh.name = `gather-${key}`;
    group.add(zm.mesh);
    for (const p of cp) p.zm = zm;
  }
  const applyDim = (p) => {
    const zm = p.zm;
    if (!zm) return;
    const dim = p.usesLeft <= 0;
    const a = zm.colorAttr.array, o = zm.orig;
    for (let i = p.vstart; i < p.vstart + p.vcount; i++) {
      const r = o[i * 3], g = o[i * 3 + 1], b = o[i * 3 + 2];
      if (dim) { const l = (r + g + b) / 3; a[i * 3] = (r * 0.25 + l * 0.75) * 0.5; a[i * 3 + 1] = (g * 0.25 + l * 0.75) * 0.5; a[i * 3 + 2] = (b * 0.25 + l * 0.75) * 0.5; }
      else { a[i * 3] = r; a[i * 3 + 1] = g; a[i * 3 + 2] = b; }
    }
    zm.colorAttr.needsUpdate = true;
  };

  // sparkle: one Points object, twinkle by colour (additive, black = invisible)
  const N = points.length;
  const spPos = new Float32Array(N * 3), spCol = new Float32Array(N * 3);
  const base = points.map((p) => new THREE.Color(GATHER_KINDS[p.kind].sparkle));
  const phase = points.map((_, i) => ((i * 0.6180339) % 1) * 6.283);
  points.forEach((p, i) => { spPos[i * 3] = p.pos.x; spPos[i * 3 + 1] = p.pos.y + 1.05; spPos[i * 3 + 2] = p.pos.z; });
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(spCol, 3));
  const sparkle = new THREE.Points(sg, new THREE.PointsMaterial({
    size: 4, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sparkle.frustumCulled = false;
  group.add(sparkle);

  function setState(pointId, usesLeft) {
    const p = byId.get(pointId);
    if (!p) return false;
    p.usesLeft = Math.max(0, Math.min(p.maxUses, usesLeft));
    applyDim(p);
    return true;
  }

  // ---- interaction (local player)
  let ring = null, ringFill = null;
  const ensureRing = (hunt) => {
    if (ring) return;
    ring = document.createElement('div');
    ring.style.cssText = 'position:absolute;left:0;top:0;width:9vmin;height:9vmin;border-radius:50%;display:none;pointer-events:none;z-index:4;image-rendering:pixelated;'
      + 'background:conic-gradient(#ffe14d var(--p,0%),rgba(10,8,40,.65) 0);-webkit-mask:radial-gradient(circle,transparent 52%,#000 54%);mask:radial-gradient(circle,transparent 52%,#000 54%);';
    ringFill = ring;
    hunt.app.ui.appendChild(ring);
  };
  const st = { prog: 0, target: null, needRelease: false, tickT: 0, t: 0 };
  const _v = new THREE.Vector3();

  function update(dt, hunt) {
    st.t += dt;
    for (let i = 0; i < N; i++) {
      const p = points[i];
      let k = 0;
      if (p.usesLeft > 0) { const s = Math.sin(st.t * 2.6 + phase[i]); k = s > 0.55 ? (s - 0.55) / 0.45 : 0; k = 0.12 + k * 0.88; }
      spCol[i * 3] = base[i].r * k; spCol[i * 3 + 1] = base[i].g * k; spCol[i * 3 + 2] = base[i].b * k;
    }
    sg.attributes.color.needsUpdate = true;

    const pl = hunt?.player;
    if (!pl) return;
    const input = hunt.input;
    // nearest usable point
    let best = null, bd = GATHER_RANGE;
    if (pl.alive !== false && pl.state === 'free') {
      for (const p of points) {
        if (p.usesLeft <= 0) continue;
        const d = Math.hypot(p.pos.x - pl.pos.x, p.pos.z - pl.pos.z);
        if (d < bd && Math.abs(p.pos.y - pl.pos.y) < 2.5) { bd = d; best = p; }
      }
    }
    if (!input.b.context.down) st.needRelease = false;
    if (best && !pl.weapon?.busy) {
      if (hunt.contextLabel == null || hunt.contextLabel === 'Sammeln') hunt.contextLabel = 'Sammeln';
      if (input.b.context.down && !st.needRelease && !input.b.attack.pressed && !input.b.roll.pressed) {
        if (st.target !== best) { st.target = best; st.prog = 0; }
        st.prog += dt;
        pl.gatherRoot = true;
        st.tickT -= dt;
        if (st.tickT <= 0) { st.tickT = 0.22; hunt.bus.emit('sfx', { name: 'gatherTick', pos: pl.pos }); }
        if (st.prog >= GATHER_TIME) {
          if (hunt.net?.isGuest) { // [B] coop guest: the host arbitrates the use (last use goes to whoever arrives first)
            hunt.net.claimGather(best.id);
            st.prog = 0; st.target = null; st.needRelease = true; pl.gatherRoot = false;
            hunt.bus.emit('sfx', { name: 'gatherTick', pos: pl.pos });
            return;
          }
          const useIndex = best.maxUses - best.usesLeft;
          const items = rollGather(hunt.seed, best.id, best.kind, best.zone, useIndex);
          best.usesLeft--;
          applyDim(best);
          st.prog = 0; st.target = null; st.needRelease = true; pl.gatherRoot = false;
          hunt.bus.emit('gathered', { pointId: best.id, items, usesLeft: best.usesLeft });
          hunt.bus.emit('sfx', { name: 'gather', pos: best.pos });
          const txt = items.map((it) => `${GATHER_ITEM_NAMES[it.id] ?? it.id} x${it.n}`).join(', ');
          hunt.fx?.number({ x: pl.pos.x, y: pl.pos.y + 2.3, z: pl.pos.z }, txt, 'heal');
          hunt.fx?.spark({ x: best.pos.x, y: best.pos.y + 0.7, z: best.pos.z }, 8, GATHER_KINDS[best.kind].sparkle, 2.5);
        }
      } else { st.prog = 0; st.target = null; pl.gatherRoot = false; }
    } else {
      if (hunt.contextLabel === 'Sammeln') hunt.contextLabel = null;
      st.prog = 0; st.target = null; pl.gatherRoot = false;
    }
    // progress ring above the player
    if (st.prog > 0 && st.target) {
      ensureRing(hunt);
      _v.set(pl.pos.x, pl.pos.y + 2.5, pl.pos.z).project(hunt.camera);
      const w = hunt.app.ui.clientWidth || 844, h = hunt.app.ui.clientHeight || 390;
      ring.style.display = 'block';
      ring.style.setProperty('--p', `${Math.min(100, (st.prog / GATHER_TIME) * 100).toFixed(0)}%`);
      ring.style.transform = `translate(${((_v.x * 0.5 + 0.5) * w) | 0}px,${((-_v.y * 0.5 + 0.5) * h) | 0}px) translate(-50%,-50%)`;
    } else if (ring) ring.style.display = 'none';
  }

  function dispose() { ring?.remove(); ring = null; }

  return { points, group, setState, update, dispose, byId, progress: () => st.prog / GATHER_TIME };
}
