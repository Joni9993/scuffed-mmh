// Trainingspuppe (Übungsplatz): steht still, greift nie an, stirbt nie. Mehrere Teile für Lock-On/Schwachstelle, wackelt bei Treffern.
import { registerTexture } from '../../render/textures.js';
import { buildSkinned } from './skinned.js';

const R = Math.PI / 180;
registerTexture('dummy_straw', (g, n, rnd) => {
  g.fillStyle = '#c8a850'; g.fillRect(0, 0, n, n);
  const cols = ['#c8a850', '#b89840', '#d8b860', '#a88838'];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (rnd() < 0.5) { g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(x, y, 1, 1); }
});

export const DUMMY_HP = 4000;

function buildDummy() {
  const wood = '#6b4a2e', straw = '#c8a850', cloth = '#b89868', red = '#b8402a', ink = '#1e1418';
  const bones = [
    { n: 'body', p: null, at: [0, 1.4, 0] }, { n: 'head', p: 'body', at: [0, 0.8, 0] },
    { n: 'armL', p: 'body', at: [0.55, 0.3, 0] }, { n: 'armR', p: 'body', at: [-0.55, 0.3, 0] },
  ];
  const boxes = [
    { b: 'body', s: [0.26, 2.4, 0.26], at: [0, -0.2, 0], c: wood }, { b: 'body', s: [1.1, 0.55, 0.8], at: [0, -0.5, 0], c: '#8a6a30' },
    { b: 'body', s: [0.95, 1.1, 0.6], at: [0, 0.1, 0], c: straw }, { b: 'body', s: [0.6, 0.6, 0.06], at: [0, 0.1, 0.33], c: red }, { b: 'body', s: [0.36, 0.36, 0.07], at: [0, 0.1, 0.34], c: '#e8d8b0' },
    { b: 'head', s: [0.62, 0.6, 0.62], at: [0, 0.2, 0], c: cloth }, { b: 'head', s: [0.12, 0.12, 0.05], at: [0.14, 0.26, 0.33], c: ink }, { b: 'head', s: [0.12, 0.12, 0.05], at: [-0.14, 0.26, 0.33], c: ink },
    { b: 'head', s: [0.7, 0.16, 0.7], at: [0, 0.55, 0], c: '#7a5634' },
    { b: 'armL', s: [0.9, 0.16, 0.16], at: [0.3, 0, 0], c: wood }, { b: 'armL', s: [0.34, 0.34, 0.34], at: [0.78, 0, 0], c: straw },
    { b: 'armR', s: [0.9, 0.16, 0.16], at: [-0.3, 0, 0], c: wood }, { b: 'armR', s: [0.34, 0.34, 0.34], at: [-0.78, 0, 0], c: straw },
  ];
  const m = buildSkinned({ map: 'dummy_straw', bones, boxes, pad: 0.8 });
  const N = m.nodes;
  return {
    root: m.root, nodes: { ...N, root: m.root }, partMeshes: { head: [m.mesh], body: [], arms: [] }, extra: { mesh: m.mesh },
    apply(p) {
      N.body.position.y = 1.4 + p.bodyY; N.body.rotation.set(p.bodyPitch * R, 0, p.bodyRoll * R);
      N.head.rotation.set(p.head * R, p.headYaw * R, 0);
      N.armL.rotation.set(0, 0, p.legL * R); N.armR.rotation.set(0, 0, p.legR * R);
    },
  };
}

export const dummy = {
  id: 'dummy', name: 'Trainingspuppe', hp: DUMMY_HP, scale: 1, bodyRadius: 0.8, walk: 0, run: 0, turn: 0, detect: 0,
  attacks: {}, // greift nie an
  ai(m) { m.vel.set(0, 0, 0); m.kb = null; m.target = null; }, // steht still, kein Kampf-AI
  tick(m, dt) {
    m._wob = Math.max(0, (m._wob ?? 0) - dt * 1.6);
    if (m.alive && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.25 * dt); // füllt sich laufend wieder auf
  },
  onDamage(m) {
    m._wob = 1; m._wobDir = m.rng() < 0.5 ? 1 : -1;
    if (m.hp < m.maxHp * 0.4) m.hp = m.maxHp; // fällt nie: unter 40 % zurück auf voll
    m.kb = null;
  },
  poseHook(m, t) {
    const w = m._wob ?? 0, s = Math.sin(m.time * 34) * w, d = m._wobDir ?? 1;
    t.bodyRoll = s * 7 * d; t.bodyPitch = -w * 5; t.head = s * 10; t.headYaw = Math.cos(m.time * 29) * w * 14;
    t.legL = 10 * w + Math.sin(m.time * 31) * w * 12; t.legR = -10 * w - Math.sin(m.time * 31) * w * 12;
  },
  parts: [
    { id: 'head', label: 'Kopf', factor: 1.2, elem: {}, spheres: [{ node: 'head', offset: [0, 0.2, 0], r: 0.45 }] },
    { id: 'body', label: 'Körper', factor: 0.9, elem: {}, spheres: [{ node: 'body', offset: [0, 0.1, 0], r: 0.7 }, { node: 'body', offset: [0, -0.7, 0], r: 0.5 }] },
    { id: 'arms', label: 'Arme', factor: 0.7, elem: {}, lock: false, spheres: [{ node: 'armL', offset: [0.5, 0, 0], r: 0.4 }, { node: 'armR', offset: [-0.5, 0, 0], r: 0.4 }] },
  ],
  build: buildDummy,
};
