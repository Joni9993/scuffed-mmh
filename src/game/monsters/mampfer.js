// [L] Mampfer (herd herbivore: cow / bull / calf) and Hoppler (small hopping critter). Neutral, minor, one SkinnedMesh each.
import { registerTexture, tex } from '../../render/textures.js';
import { mTrack } from './monster.js';
import { buildSkinned } from './skinned.js';
import { faunaAi } from './herd.js';
import { smooth, clamp01 } from './common.js';

const R = Math.PI / 180;
const noise = (cols) => (g, n, rnd) => {
  g.fillStyle = cols[0]; g.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (rnd() > 0.55) continue; g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(x, y, 1, 1); }
};
registerTexture('mampfer_hide', noise(['#9aa468', '#8a9658', '#a8b274', '#7a8650', '#b8a070']));
registerTexture('hoppler_fur', noise(['#c8a070', '#b88e5c', '#d8b484', '#a87c4c']));
void tex;

function buildMampfer(k, bull) {
  const hide = '#9aa468', dark = '#7c8650', belly = '#d9c99a', horn = '#efe3c4', hoof = '#4a3a2c', eye = '#201810';
  const bones = [
    { n: 'body', p: null, at: [0, 1.3, 0] }, { n: 'neck', p: 'body', at: [0, 0.25, 1.2] }, { n: 'head', p: 'neck', at: [0, 0, 0.8] }, { n: 'jaw', p: 'head', at: [0, -0.25, 0.25] },
    { n: 'legFL', p: 'body', at: [0.5, -0.5, 0.85] }, { n: 'legFR', p: 'body', at: [-0.5, -0.5, 0.85] }, { n: 'legBL', p: 'body', at: [0.5, -0.5, -0.9] }, { n: 'legBR', p: 'body', at: [-0.5, -0.5, -0.9] },
    { n: 'tail1', p: 'body', at: [0, 0.15, -1.5] }, { n: 'tail2', p: 'tail1', at: [0, 0, -0.9] },
  ];
  const boxes = [
    { b: 'body', s: [1.4, 1.2, 2.4], at: [0, 0, 0], c: hide }, { b: 'body', s: [1.0, 0.5, 1.0], at: [0, 0.75, 0.3], c: dark },
    { b: 'body', s: [1.2, 0.4, 1.8], at: [0, -0.55, 0.1], c: belly }, { b: 'body', s: [1.3, 1.0, 0.8], at: [0, 0, -1.15], c: dark },
    { b: 'neck', s: [0.7, 0.7, 0.9], at: [0, 0, 0.35], c: hide },
    { b: 'head', s: [0.75, 0.65, 1.0], at: [0, 0, 0.4], c: hide }, { b: 'head', s: [0.6, 0.42, 0.35], at: [0, -0.1, 0.98], c: '#c4b678' },
    { b: 'head', s: [0.1, 0.1, 0.1], at: [0.38, 0.15, 0.55], c: eye }, { b: 'head', s: [0.1, 0.1, 0.1], at: [-0.38, 0.15, 0.55], c: eye },
    { b: 'head', s: [0.3, 0.12, 0.25], at: [0.5, 0.2, 0.05], c: dark }, { b: 'head', s: [0.3, 0.12, 0.25], at: [-0.5, 0.2, 0.05], c: dark },
    { b: 'jaw', s: [0.55, 0.16, 0.7], at: [0, 0, 0.5], c: '#8a7a50' },
    { b: 'tail1', s: [0.32, 0.32, 0.9], at: [0, 0, -0.45], c: dark }, { b: 'tail2', s: [0.2, 0.2, 0.8], at: [0, 0, -0.4], c: dark }, { b: 'tail2', s: [0.34, 0.34, 0.3], at: [0, 0, -0.9], c: '#c8603a' },
  ];
  for (const sx of [1, -1]) {
    boxes.push(bull ? { b: 'head', s: [0.14, 0.14, 0.5], at: [sx * 0.5, 0.4, 0.3], c: horn, rz: sx * 0.6 } : { b: 'head', s: [0.1, 0.18, 0.1], at: [sx * 0.3, 0.4, 0.2], c: horn });
    if (bull) boxes.push({ b: 'head', s: [0.12, 0.5, 0.12], at: [sx * 0.72, 0.6, 0.4], c: horn });
  }
  for (const n of ['legFL', 'legFR', 'legBL', 'legBR']) boxes.push({ b: n, s: [0.32, 0.7, 0.36], at: [0, -0.35, 0], c: dark }, { b: n, s: [0.38, 0.16, 0.46], at: [0, -0.72, 0.04], c: hoof });
  const m = buildSkinned({ map: 'mampfer_hide', bones, boxes, pad: 0.8 });
  m.root.scale.setScalar(k);
  const N = m.nodes;
  return {
    root: m.root, nodes: { ...N, root: m.root }, partMeshes: { body: [m.mesh], head: [], legs: [] }, extra: { mesh: m.mesh },
    apply(p) {
      N.body.position.y = 1.3 + p.bodyY; N.body.rotation.set(p.bodyPitch * R, 0, p.bodyRoll * R);
      N.neck.rotation.x = p.neck; N.head.rotation.set(p.head * R, p.headYaw * R, 0); N.jaw.rotation.x = p.jaw * R;
      N.tail1.rotation.set(p.tailPitch * R, p.tailYaw * R, 0); N.tail2.rotation.set(0, p.tailYaw * 0.8 * R, 0);
      N.legFL.rotation.x = N.legBR.rotation.x = -p.legL * R; N.legFR.rotation.x = N.legBL.rotation.x = -p.legR * R;
    },
  };
}

const spheres = (k) => ({
  head: [{ node: 'head', offset: [0, 0, 0.4], r: 0.55 }],
  body: [{ node: 'body', offset: [0, 0, 0.4], r: 0.95 }, { node: 'body', offset: [0, 0, -0.9], r: 0.85 }, { node: 'neck', offset: [0, 0, 0.35], r: 0.45 }],
  legs: [{ node: 'legFL', offset: [0, -0.4, 0], r: 0.4 }, { node: 'legBR', offset: [0, -0.4, 0], r: 0.4 }],
}[k]);

const stoss = {
  id: 'mampfer_stoss', range: [0, 30], weight: 1, cooldown: 99, telegraph: 0.7, flashParts: ['body'], duration: 2.0,
  marker: { at: 'landing', radius: 1.6 }, markerUntil: 1.4,
  prepare(a) {
    const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz) || 1, len = Math.min(9, Math.max(2.5, d - 0.8));
    a.landing = { x: a.origin.x + (dx / d) * len, z: a.origin.z + (dz / d) * len };
    a.yawC = Math.atan2(dx, dz);
  },
  hits: [{ t0: 1.0, t1: 1.4, shape: 'sphere', at: [0, 1.0, 2.0], radius: 1.1, dmg: 8, knock: 'flinch' }],
  motion(tau, a) {
    const k = smooth(clamp01((tau - 0.7) / 0.7));
    return { x: a.origin.x + (a.landing.x - a.origin.x) * k, z: a.origin.z + (a.landing.z - a.origin.z) * k, yaw: a.yawC };
  },
  pose: mTrack([[0, {}], [0.3, { neck: 0.7, head: 30, legR: 40, bodyPitch: 6 }], [0.6, { neck: 0.8, head: 35, legR: -30, bodyPitch: 8 }], [0.7, { neck: 0.8, head: 35, bodyPitch: 8 }],
    [1.2, { neck: 0.55, head: 25, bodyPitch: 6, legL: 30, legR: -30 }], [1.5, { neck: 0.3, head: 10 }], [2.0, {}]]),
};

function poseHook(m, t) {
  const s = m.state;
  if (m.attack || s === 'dead') return;
  if (s === 'graze') {
    t.neck = 0.8; t.head = 28 + Math.sin(m.time * 0.9) * 3; t.bodyPitch = 3;
    t.jaw = (Math.sin(m.time * 7 + m.pos.x) > 0.2 ? 14 : 0);
    t.legL = t.legR = 0;
  } else if (s === 'idle') {
    t.neck = -0.05; t.head = -4; t.jaw = Math.sin(m.time * 5 + m.pos.z) > 0.4 ? 8 : 0; t.headYaw = Math.sin(m.time * 0.6 + m.pos.x) * 18;
  } else if (s === 'flee') {
    t.bodyPitch = 7; t.neck = 0.15; t.head = 6; t.bodyY = Math.abs(Math.sin(m.gait * 4)) * 0.18; t.tailPitch = -20; t.jaw = 10;
  } else if (s === 'walk') {
    t.neck = 0.2 + Math.sin(m.gait * 4) * 0.05; t.head = 8;
  }
}

const common = {
  minor: true, neutral: true, prey: true, carve: true, dropId: 'mampfer', turn: 1, detect: 0, prefer: 2,
  attacks: {}, ai: faunaAi, poseHook,
  deadPose: { bodyY: -0.62, bodyRoll: 85, head: 20, neck: 0.2, legL: 50, legR: -35, jaw: 15 },
  onDamage(m, res) {
    if (!m.authority || !m.herd) return;
    const att = m.ctx.players.find((p) => p.id === res.attackerId) ?? null;
    const from = att?.pos ?? res.from ?? { x: m.pos.x - Math.sin(m.rot) * 3, z: m.pos.z - Math.cos(m.rot) * 3 };
    m.herd.hurt(m, from, att);
  },
};
const mk = (id, name, hp, k, br, bull, walk, run) => ({
  ...common, id, name, hp, scale: k, bodyRadius: br, walk, run, bull,
  parts: [
    { id: 'head', label: 'Kopf', factor: 1.2, elem: {}, lock: false, spheres: spheres('head') },
    { id: 'body', label: 'Körper', factor: 0.9, elem: {}, spheres: spheres('body') },
    { id: 'legs', label: 'Beine', factor: 0.7, elem: {}, lock: false, spheres: spheres('legs') },
  ],
  build: () => buildMampfer(k, bull),
  ...(bull ? { attacks: { mampfer_stoss: stoss } } : {}),
});
export const mampfer = mk('mampfer', 'Mampfer', 120, 1.0, 1.05, false, 1.5, 5.2);
export const mampferbulle = { ...mk('mampferbulle', 'Mampfer-Bulle', 150, 1.2, 1.25, true, 1.5, 5.4), dropId: 'mampfer' };
export const mampferkalb = { ...mk('mampferkalb', 'Mampfer-Kalb', 45, 0.55, 0.55, false, 1.7, 5.0), dropId: 'mampferkalb' };

// ---------------------------------------------------------------- Hoppler
function buildHoppler() {
  const fur = '#c8a070', dark = '#a87c4c', light = '#eadcc0';
  const bones = [{ n: 'body', p: null, at: [0, 0.35, 0] }, { n: 'head', p: 'body', at: [0, 0.15, 0.35] }, { n: 'legL', p: 'body', at: [0.17, -0.1, -0.2] }, { n: 'legR', p: 'body', at: [-0.17, -0.1, -0.2] }];
  const boxes = [
    { b: 'body', s: [0.4, 0.38, 0.62], at: [0, 0, 0], c: fur }, { b: 'body', s: [0.3, 0.2, 0.4], at: [0, -0.16, 0.05], c: light }, { b: 'body', s: [0.14, 0.14, 0.14], at: [0, 0.05, -0.36], c: light },
    { b: 'head', s: [0.3, 0.26, 0.32], at: [0, 0, 0.12], c: fur }, { b: 'head', s: [0.06, 0.06, 0.06], at: [0.14, 0.06, 0.26], c: '#201810' }, { b: 'head', s: [0.06, 0.06, 0.06], at: [-0.14, 0.06, 0.26], c: '#201810' },
    { b: 'head', s: [0.08, 0.36, 0.06], at: [0.1, 0.3, 0], c: dark }, { b: 'head', s: [0.08, 0.36, 0.06], at: [-0.1, 0.3, 0], c: dark },
    { b: 'legL', s: [0.14, 0.3, 0.3], at: [0, -0.12, 0.02], c: dark }, { b: 'legR', s: [0.14, 0.3, 0.3], at: [0, -0.12, 0.02], c: dark },
  ];
  const m = buildSkinned({ map: 'hoppler_fur', bones, boxes, pad: 0.4 });
  const N = m.nodes, extra = { hopY: 0 };
  return {
    root: m.root, nodes: { ...N, root: m.root, neck: N.head, tail1: N.body, tail2: N.body }, partMeshes: { body: [m.mesh], head: [] }, extra,
    apply(p) {
      N.body.position.y = 0.35 + extra.hopY; N.body.rotation.set(p.bodyPitch * R, 0, 0);
      N.head.rotation.x = (p.head + p.neck * 20) * R; N.legL.rotation.x = N.legR.rotation.x = -p.legL * R;
    },
  };
}
export const hoppler = {
  ...common, id: 'hoppler', name: 'Hoppler', hp: 20, scale: 1, bodyRadius: 0.35, walk: 2.2, run: 6.4, dropId: 'hoppler', prey: false,
  parts: [{ id: 'body', label: 'Körper', factor: 1, elem: {}, spheres: [{ node: 'body', offset: [0, 0, 0], r: 0.4 }] }],
  build: buildHoppler,
  deadPose: { bodyY: -0.15, bodyPitch: 70, legL: 30, head: 30 },
  poseHook(m, t) {
    const spd = Math.hypot(m.vel.x, m.vel.z);
    if (m.state === 'dead') { m.extra.hopY = 0; return; }
    const u = Math.abs(Math.sin(m.gait * 3.4));
    m.extra.hopY = spd > 0.3 ? u * (m.state === 'flee' ? 0.5 : 0.3) : 0;
    t.legL = spd > 0.3 ? 35 - u * 70 : 0; t.bodyPitch = spd > 0.3 ? -12 + u * 24 : 0;
    t.head = m.state === 'graze' ? 25 + Math.sin(m.time * 9) * 8 : -5; t.legR = t.legL;
  },
};
