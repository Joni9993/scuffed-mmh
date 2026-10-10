import * as THREE from 'three';
import { lambert, basic } from '../../render/ps1.js';
import { tex, registerTexture, canvasTexture } from '../../render/textures.js';
import { Parts, vcLit, vcGlow } from '../../render/vcolor.js';
import { createRng } from '../../core/rng.js';
import { buildNpc, labelSprite } from './npc.js';
import { STATIONS, BOXES, CIRCLES, TOWN_HALF_X, TOWN_HALF_Z, SPAWNS, heightAtTown, collideTown, insideSolid } from './layout.js';

registerTexture('rubble', (g, n, rnd) => {
  g.fillStyle = '#5a5060';
  g.fillRect(0, 0, n, n);
  const cols = ['#6a6070', '#4a4254', '#7a6e74', '#5e5446', '#6e5e4c'];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (rnd() < 0.7) { g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(x, y, 1, 1); }
});

const WOOD = ['#6b4a2e', '#7a5634', '#5a3c24', '#86603a'];
const RUST = ['#8a4a2a', '#7a5040', '#6a6a72', '#9a5a30'];
const CLOTH = ['#b8402a', '#d8a030', '#3a8a9a', '#7a4a9a'];

/** Local-frame helper: place primitives relative to (x, z, yaw) on the ground. */
function frame(parts, x, z, yaw, y0 = 0) {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const at = (lx, ly, lz, ry = 0, rx = 0, rz = 0) => ({ x: x + lx * c + lz * s, y: y0 + ly, z: z - lx * s + lz * c, ry: yaw + ry, rx, rz });
  return {
    box: (w, h, d, col, lx, ly, lz, ry, rx, rz) => parts.box(w, h, d, col, at(lx, ly, lz, ry, rx, rz)),
    cyl: (rt, rb, h, seg, col, lx, ly, lz, ry, rx, rz) => parts.cyl(rt, rb, h, seg, col, at(lx, ly, lz, ry, rx, rz)),
    cone: (r, h, seg, col, lx, ly, lz, ry, rx, rz) => parts.cone(r, h, seg, col, at(lx, ly, lz, ry, rx, rz)),
  };
}

/** The walkable town as a world (heightAt/collide like hunt worlds) + stations/NPCs. */
export function createTown() {
  const rng = createRng(11);
  const group = new THREE.Group();
  const lit = new Parts(), glow = new Parts();
  const H = heightAtTown;
  const pick = (a) => a[(rng() * a.length) | 0];

  // ---- ground + cliff
  const gg = new THREE.PlaneGeometry(64, 64, 32, 32);
  gg.rotateX(-Math.PI / 2);
  const gp = gg.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, H(gp.getX(i), gp.getZ(i)));
  const uv = gg.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 22, uv.getY(i) * 22);
  gg.computeVertexNormals();
  group.add(new THREE.Mesh(gg, lambert({ map: tex('rubble', { size: 32 }) })));
  const cliffGeo = new THREE.BoxGeometry(64.4, 70, 64.4);
  cliffGeo.translate(0, -35.3, 0);
  const cu = cliffGeo.attributes.uv;
  for (let i = 0; i < cu.count; i++) cu.setXY(i, cu.getX(i) * 6, cu.getY(i) * 8);
  group.add(new THREE.Mesh(cliffGeo, lambert({ map: tex('stone', { size: 32 }) })));
  // dirt patches around stations and the fire
  const patch = (x, z, r, col) => lit.add(new THREE.CircleGeometry(r, 9), col, { x, y: H(x, z) + 0.05, z, rx: -Math.PI / 2 });
  patch(0, 0, 5.2, '#5e4a36');
  for (const s of STATIONS) patch(s.x, s.z, 2.6, '#6a5640');
  patch(0, -11, 3.5, '#5e4a36');
  // jagged rim rocks + distant spires
  for (let i = 0; i < 46; i++) {
    const t = (i / 46) * 4, side = Math.floor(t), u = (t - side) * 58 - 29;
    const px = side === 0 ? u : side === 1 ? 31 : side === 2 ? -u : -31, pz = side === 0 ? -31 : side === 1 ? u : side === 2 ? 31 : -u;
    lit.cone(1.6 + rng() * 1.6, 3 + rng() * 5, 5, '#5a5266', { x: px + (rng() - 0.5) * 2, y: -1 + rng(), z: pz + (rng() - 0.5) * 2, ry: rng() * 3 });
  }
  const spires = new Parts();
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + rng() * 0.3, r = 70 + rng() * 55, hh = 25 + rng() * 45;
    spires.cone(7 + rng() * 9, hh, 5 + ((rng() * 3) | 0), pick(['#4a3e58', '#3e3450', '#54465a']), { x: Math.cos(a) * r, y: hh / 2 - 30, z: Math.sin(a) * r, ry: rng() * 3 });
  }
  group.add(spires.mesh(vcLit()));
  // sky dome (vertical gradient, banded)
  const skyTex = canvasTexture(64, (g, n) => {
    const gr = g.createLinearGradient(0, 0, 0, n);
    gr.addColorStop(0, '#1e1238'); gr.addColorStop(0.35, '#5a2e5e'); gr.addColorStop(0.5, '#d8704a'); gr.addColorStop(0.58, '#f0a860'); gr.addColorStop(0.62, '#6a4a5a'); gr.addColorStop(1, '#3a2a40');
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
  });
  skyTex.wrapS = skyTex.wrapT = THREE.ClampToEdgeWrapping;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 12, 10), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  group.add(sky);

  // ---- fence along the plateau edge (gap at the gate)
  const post = (x, z) => lit.slab(0.22, 1.5 + rng() * 0.3, 0.22, pick(WOOD), { x, y: H(x, z), z, ry: rng() });
  const rail = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1), yaw = Math.atan2(x2 - x1, z2 - z1);
    for (const hy of [0.55, 1.05]) lit.box(0.08, 0.1, len, '#7a5634', { x: (x1 + x2) / 2, y: H(x1, z1) + hy, z: (z1 + z2) / 2, ry: yaw });
  };
  const E = 26.6, EZ = 25.9;
  for (let i = -10; i < 10; i++) {
    const a = i * 2.6 + 1.3, b = a + 2.6;
    for (const [p, q] of [[[a, -EZ], [b, -EZ]], [[E, a], [E, b]], [[-E, a], [-E, b]]]) { rail(p[0], p[1], q[0], q[1]); }
    if (Math.abs(a) > 4.8 && Math.abs(b) < 27) rail(a, EZ, b, EZ);
  }
  for (let i = -10; i <= 10; i++) {
    const v = i * 2.6 + 1.3;
    post(v, -EZ); post(E, v); post(-E, v);
    if (Math.abs(v) > 4.8 && Math.abs(v) < 27) post(v, EZ);
  }

  // ---- huts
  const hut = (b, wall, roof) => {
    const f = frame(lit, b.x, b.z, b.yaw, H(b.x, b.z));
    f.box(b.w, b.h, b.d, wall, 0, b.h / 2, 0);
    for (let i = 0; i < 7; i++) { // scrap patches on the front & sides
      const side = i % 3, pw = 0.7 + rng() * 1.2, ph = 0.5 + rng() * 1.0, py = 0.6 + rng() * (b.h - 1.4);
      const col = pick(rng() < 0.6 ? RUST : WOOD);
      if (side === 0) f.box(pw, ph, 0.08, col, (rng() - 0.5) * (b.w - pw), py, b.d / 2 + 0.03);
      else f.box(0.08, ph, pw, col, (side === 1 ? 1 : -1) * (b.w / 2 + 0.03), py, (rng() - 0.5) * (b.d - pw));
    }
    f.box(1.1, 2.0, 0.1, '#1e1418', (rng() - 0.5) * (b.w - 1.6), 1.0, b.d / 2 + 0.05); // door
    f.box(b.w + 0.7, 0.14, b.d + 1.6, roof, 0, b.h + 0.18, 0.5, 0, -0.14); // sloped roof sheet, overhangs the front
    f.box(b.w + 0.7, 0.14, 0.14, '#3a2a20', 0, b.h + 0.05, b.d / 2 + 1.2, 0, 0);
    if (rng() < 0.6) f.cyl(0.16, 0.16, 1.4, 6, '#6a5040', -b.w / 2 + 0.7, b.h + 0.8, -b.d / 4); // stove pipe
  };
  for (const b of BOXES) {
    if (['counter', 'board', 'tent', 'watch'].includes(b.id)) continue;
    hut(b, pick(WOOD), pick(RUST));
  }
  // tent (Truhe)
  { const b = BOXES.find((k) => k.id === 'tent'), f = frame(lit, b.x, b.z, b.yaw, H(b.x, b.z));
    f.cone(3.3, 3, 4, '#b8802a', 0, 1.5, 0, Math.PI / 4);
    f.box(1.2, 1.9, 0.1, '#2a1a14', 0, 0.95, 2.0, 0, 0.0);
    f.box(0.14, 3.6, 0.14, '#5a3c24', 0, 1.8, 0);
    f.box(0.9, 0.5, 0.06, '#b8402a', 0.5, 3.4, 0, 0); }
  // watch tower (scrap tower with a lookout)
  { const b = BOXES.find((k) => k.id === 'watch'), f = frame(lit, b.x, b.z, b.yaw, H(b.x, b.z));
    for (const [sx, sz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) f.box(0.3, 6, 0.3, pick(WOOD), sx, 3, sz);
    f.box(3.4, 0.25, 3.4, '#6b4a2e', 0, 6, 0);
    for (const s of [-1.6, 1.6]) { f.box(3.4, 0.9, 0.1, '#8a4a2a', 0, 6.6, s); f.box(0.1, 0.9, 3.4, '#7a5040', s, 6.6, 0); }
    f.cone(2.8, 1.6, 4, '#9a5a30', 0, 8.1, 0, Math.PI / 4);
    f.box(0.9, 0.5, 0.06, '#d8a030', 0, 5.4, 1.8); }

  // ---- campfire
  const fireH = H(0, 0);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; lit.box(0.55, 0.4, 0.45, '#6a6270', { x: Math.cos(a) * 1.3, y: fireH + 0.2, z: Math.sin(a) * 1.3, ry: -a }); }
  for (let i = 0; i < 3; i++) lit.cyl(0.12, 0.12, 1.6, 5, '#3a2418', { x: 0, y: fireH + 0.3, z: 0, rz: Math.PI / 2, ry: i * 1.05 });
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.8; lit.cyl(0.28, 0.28, 2.0, 6, pick(WOOD), { x: Math.cos(a) * 3.3, y: fireH + 0.3, z: Math.sin(a) * 3.3, rz: Math.PI / 2, ry: -a + Math.PI / 2 }); }
  const flames = new Parts();
  flames.cone(0.6, 1.5, 5, '#ff7a1c', { y: 0.75 }).cone(0.36, 1.1, 5, '#ffd24a', { y: 0.6, x: 0.04 });
  const flame = flames.mesh(vcGlow());
  flame.position.set(0, fireH + 0.2, 0);
  group.add(flame);
  const fireLight = new THREE.PointLight('#ff9040', 2.4, 24);
  fireLight.position.set(0, fireH + 1.4, 0);
  group.add(fireLight);

  // ---- Schmiede: forge glow, anvil, grindstone
  { const f = frame(lit, -17.4, 5, Math.PI / 2, H(-17.4, 5));
    f.box(2.4, 1.1, 1.8, '#4a4450', 0, 0.55, 0); f.cyl(0.5, 0.7, 2.4, 6, '#3a3640', 0, 2.3, 0);
    const g = frame(glow, -17.4, 5, Math.PI / 2, H(-17.4, 5));
    g.box(1.6, 0.25, 1.1, '#ff7a20', 0, 1.14, 0); g.box(0.9, 0.12, 0.7, '#ffd060', 0, 1.2, 0);
    lit.slab(0.5, 0.45, 0.5, '#2a2830', { x: -13.2, y: H(-13.2, 2.6), z: 2.6 });
    lit.slab(0.9, 0.22, 0.34, '#4a4a54', { x: -13.2, y: H(-13.2, 2.6) + 0.45, z: 2.6, ry: 0.4 });
    lit.slab(0.3, 0.9, 1.7, '#7a5634', { x: -13.0, y: H(-13.0, 7.6), z: 7.6 }); }
  const forgeLight = new THREE.PointLight('#ff6a20', 1.4, 10);
  forgeLight.position.set(-16.4, 1.8, 5);
  group.add(forgeLight);

  // ---- Krämerladen: counter, awning, goods
  { const f = frame(lit, 13.2, 6, -Math.PI / 2, H(13.2, 6));
    f.box(4.4, 1.0, 1.0, '#7a5634', 0, 0.5, 0); f.box(4.6, 0.12, 1.2, '#9a7040', 0, 1.06, 0);
    for (let i = 0; i < 5; i++) f.box(0.45, 0.35, 0.45, pick(CLOTH), -1.7 + i * 0.85, 1.3, rng() * 0.3 - 0.15);
    for (const sx of [-2.2, 2.2]) f.box(0.14, 3.2, 0.14, '#5a3c24', sx, 1.6, 0.8);
    for (let i = 0; i < 6; i++) f.box(0.74, 0.1, 2.2, i % 2 ? '#d8a030' : '#b8402a', -1.85 + i * 0.74, 3.1 - 0.0, 1.0, 0, -0.18); }
  for (const [x, z] of [[12.6, 11.5], [13.9, 12.2], [19.2, 12.6], [-17.4, -3.8], [14.2, -3.2]]) lit.slab(1.2, 1.1, 1.2, pick(WOOD), { x, y: H(x, z), z, ry: rng() * 3 });
  for (const [x, z] of [[-14.8, 9.6], [-15.9, 10.4], [5.2, -17.5]]) { lit.cyl(0.55, 0.5, 1.2, 7, pick(RUST), { x, y: H(x, z) + 0.6, z }); lit.cyl(0.57, 0.57, 0.08, 7, '#3a3036', { x, y: H(x, z) + 0.9, z }); }
  for (const [x, z] of [[-4.6, -17.2], [17.8, 0.8]]) for (let i = 0; i < 5; i++) lit.box(0.8 + rng(), 0.5 + rng(), 0.8 + rng(), pick(RUST), { x: x + (rng() - 0.5) * 1.4, y: H(x, z) + 0.3 + i * 0.3, z: z + (rng() - 0.5) * 1.4, ry: rng() * 3 });

  // ---- Kochtopf
  { const x = -11.8, z = -11.8, y = H(x, z);
    for (let i = 0; i < 3; i++) { const a = i * 2.1; lit.box(0.4, 0.5, 0.4, '#6a6270', { x: x + Math.cos(a) * 0.8, y: y + 0.25, z: z + Math.sin(a) * 0.8, ry: a }); }
    lit.sphere(0.95, 8, 6, '#2e2c34', { x, y: y + 1.0, z, sy: 0.8 });
    lit.cyl(0.95, 0.95, 0.1, 8, '#4a4850', { x, y: y + 1.4, z });
    glow.cone(0.4, 0.8, 5, '#ff7a1c', { x, y: y + 0.4, z }); glow.cyl(0.8, 0.8, 0.05, 8, '#9ad858', { x, y: y + 1.38, z });
    lit.slab(2.4, 0.9, 0.9, '#7a5634', { x: -14.2, y: H(-14.2, -13.4), z: -13.4 });
    lit.slab(0.1, 1.9, 0.1, '#5a3c24', { x: x - 1.4, y, z }); lit.box(1.6, 0.08, 0.08, '#5a3c24', { x: x - 0.6, y: y + 1.85, z }); }

  // ---- Truhe (chest)
  { const f = frame(lit, 11.8, -9.5, -Math.PI / 2, H(11.8, -9.5));
    f.box(1.5, 0.8, 1.0, '#7a4a2a', 0, 0.4, 0); f.box(1.56, 0.3, 1.06, '#8a5832', 0, 0.95, 0); f.box(1.6, 0.14, 0.14, '#9a9aa4', 0, 0.78, 0.5); f.box(0.2, 0.28, 0.1, '#d8a030', 0, 0.8, 0.56); }

  // ---- Auftragsbrett (big board)
  { const b = BOXES.find((k) => k.id === 'board'), f = frame(lit, b.x, b.z, b.yaw, H(b.x, b.z));
    for (const sx of [-3.0, 3.0]) f.box(0.34, 4.6, 0.34, '#4a3020', sx, 2.3, 0);
    for (let i = 0; i < 6; i++) f.box(1.0, 3.0, 0.24, i % 2 ? '#7a5634' : '#6b4a2e', -2.5 + i, 2.6, 0);
    f.box(7, 0.4, 0.5, '#b8402a', 0, 4.4, 0.04); f.box(7.2, 0.14, 1.1, '#6a5040', 0, 4.7, 0.2, 0, -0.2);
    for (let i = 0; i < 14; i++) f.box(0.5 + rng() * 0.3, 0.6 + rng() * 0.3, 0.05, pick(['#e8dcc0', '#d8c890', '#e8b0a0']), -2.6 + (i % 7) * 0.85, 1.6 + Math.floor(i / 7) * 1.2 + rng() * 0.2, 0.15, 0, 0, (rng() - 0.5) * 0.3);
    f.box(0.9, 0.9, 0.9, '#7a5634', -3.6, 0.45, 0.9); }

  // ---- Spiegel
  { const f = frame(lit, 9.6, 19.6, Math.PI, H(9.6, 19.6));
    f.box(1.8, 2.8, 0.18, '#7a5634', 0, 1.9, 0, 0, -0.08); f.box(0.12, 1.4, 0.12, '#5a3c24', -0.6, 0.7, -0.5, 0, 0.3); f.box(0.12, 1.4, 0.12, '#5a3c24', 0.6, 0.7, -0.5, 0, 0.3);
    f.cone(0.2, 0.4, 4, '#d8a030', 0, 3.5, 0);
    const g = frame(glow, 9.6, 19.6, Math.PI, H(9.6, 19.6));
    g.box(1.3, 2.3, 0.06, '#9ad8e8', 0, 1.9, 0.12, 0, -0.08); g.box(0.5, 1.3, 0.04, '#e8f8ff', -0.2, 2.1, 0.15, 0, -0.08, 0.3); }

  // ---- gate (Abflugtor) with outward bridge and crane
  { const f = frame(lit, 0, 25.9, 0, H(0, 25.9));
    for (const sx of [-4.2, 4.2]) { f.cyl(0.4, 0.5, 6.2, 6, '#5a3c24', sx, 3.1, 0); f.box(1.1, 0.5, 1.1, '#5a5266', sx, 0.25, 0); }
    f.box(9.6, 0.6, 0.6, '#4a3020', 0, 6.1, 0); f.box(8.4, 0.3, 0.3, '#8a4a2a', 0, 5.2, 0, 0, 0, 0);
    for (let i = 0; i < 3; i++) f.box(1.0, 2.2, 0.08, CLOTH[(i * 2) % 4], -2.5 + i * 2.5, 4.2, 0.1);
    for (let i = 0; i < 12; i++) f.box(2.4, 0.14, 1.0, i % 2 ? '#6b4a2e' : '#7a5634', 0, -0.1 - i * 0.05, 1.2 + i * 1.0); // bridge planks leaving the plateau
    for (const sx of [-1.3, 1.3]) f.box(0.08, 0.08, 12, '#5a3c24', sx, 0.9, 7.2);
    f.cyl(0.25, 0.3, 9, 5, '#6a5040', -3.5, 4, 17); f.box(0.2, 0.2, 6, '#6a5040', -3.5, 8.5, 19.8, 0, 0.2);
    const g = frame(glow, 0, 25.9, 0, H(0, 25.9));
    for (const sx of [-4.2, 4.2]) g.box(0.4, 0.5, 0.4, '#ffb040', sx * 0.84, 4.6, 0.55);
    g.box(2.2, 0.5, 0.06, '#ff5a3a', 0, 5.7, 0.35); }

  // ---- banners, poles with pennants, hanging lanterns
  for (const [x, z, c] of [[6.5, 9.5, 0], [-6.5, 9.5, 1], [-24.5, 12, 2], [24.5, 12, 0], [-24.5, -14, 3], [24.5, -14, 2]]) {
    const y = H(x, z);
    lit.cyl(0.1, 0.14, 5, 5, '#4a3020', { x, y: y + 2.5, z });
    lit.box(1.5, 1.8, 0.05, CLOTH[c], { x: x + 0.8, y: y + 3.9, z });
    glow.box(0.5, 0.5, 0.06, '#ffd060', { x: x + 0.8, y: y + 3.9, z: z + 0.04 });
  }
  for (const [x, z] of [[-7, -3], [7, -3], [-3, 8], [3, 8], [-11, 12], [11, 14], [-8, 14]]) { glow.box(0.25, 0.35, 0.25, '#ffb040', { x, y: H(x, z) + 2.5, z }); lit.slab(0.08, 2.5, 0.08, '#4a3020', { x, y: H(x, z), z }); }

  group.add(lit.mesh(vcLit()), glow.mesh(vcGlow()));
  group.add(new THREE.AmbientLight('#a89ac0', 1.15));
  const sun = new THREE.DirectionalLight('#ffc490', 1.15);
  sun.position.set(-10, 14, 12);
  group.add(sun);
  const fill = new THREE.DirectionalLight('#6a8aff', 0.3);
  fill.position.set(8, 5, -10);
  group.add(fill);

  // ---- NPCs + labels
  const npcs = [];
  const labels = new Map();
  for (const s of STATIONS) {
    const info = { station: s, npc: null, label: null };
    if (s.npc) {
      const n = buildNpc(s.npc.kind);
      n.root.position.set(s.npc.x, H(s.npc.x, s.npc.z), s.npc.z);
      n.root.rotation.y = Math.atan2(s.x - s.npc.x, s.z - s.npc.z);
      group.add(n.root);
      npcs.push(n);
      info.npc = n;
    }
    const text = s.npc?.name ?? s.tag;
    if (text) {
      const sp = labelSprite(text, { color: s.npc ? '#ffd84a' : '#9ad8ff' });
      const px = s.npc ? s.npc.x : s.id === 'spiegel' ? 9.6 : s.id === 'truhe' ? 11.8 : s.x;
      const pz = s.npc ? s.npc.z : s.id === 'spiegel' ? 19.6 : s.id === 'truhe' ? -9.5 : 25.9;
      sp.position.set(px, H(px, pz) + (s.npc ? 2.75 : s.id === 'tor' ? 7.0 : s.id === 'spiegel' ? 4.1 : 1.9), pz);
      group.add(sp);
      info.label = sp;
    }
    labels.set(s.id, info);
  }
  // interaction ring marker
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 12), basic({ color: '#ffd84a', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  group.add(ring);

  let t = 0;
  return {
    id: 'rostnest',
    name: 'Rostnest',
    bounds: { minX: -TOWN_HALF_X, maxX: TOWN_HALF_X, minZ: -TOWN_HALF_Z, maxZ: TOWN_HALF_Z },
    heightAt: H,
    collide: (pos, r) => collideTown(pos, r),
    spawnPoints: SPAWNS,
    campPoint: SPAWNS[0],
    env: { background: '#5a3a4a', fog: { color: '#6a4a5a', near: 40, far: 170 } },
    stations: STATIONS,
    labels,
    mesh: group,
    flame,
    ring,
    /** true when a camera position is inside a hut/prop */
    cameraBlocked: (x, y, z) => insideSolid(x, y - H(x, z), z),
    /** show the interaction ring at station s (or hide) */
    markStation(s) {
      ring.visible = !!s;
      if (s) ring.position.set(s.x, H(s.x, s.z) + 0.12, s.z);
    },
    /** station labels only render when you are reasonably close (saves draw calls) */
    update(dt, px, pz) {
      t += dt;
      const fl = 1 + Math.sin(t * 17) * 0.12 + Math.sin(t * 7.3) * 0.08;
      flame.scale.set(1 - (fl - 1) * 0.5, fl, 1 - (fl - 1) * 0.5);
      fireLight.intensity = 2.4 + (fl - 1) * 3;
      forgeLight.intensity = 1.4 + Math.sin(t * 11) * 0.25;
      for (const n of npcs) n.update(t);
      ring.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
      for (const info of labels.values()) if (info.label) {
        const d = Math.hypot(info.label.position.x - px, info.label.position.z - pz);
        info.label.visible = d < 15;
      }
    },
    dispose() { group.traverse((o) => { o.geometry?.dispose?.(); }); },
  };
}
