// Pyrostur: a flying pressure cooker with a deeply questionable safety certificate.
// Every damaging area is an AttackInstance hit; the boiler never deals hidden tick damage.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lambert, basic } from '../../render/ps1.js';
import { mTrack } from './monster.js';
import { smooth, clamp01 } from './common.js';

const SC = 1.65, DEG = Math.PI / 180;
export const PYRO = { COUNTER_DAMAGE: 240, COUNTER_TIME: 3.2, PRESSURE_MAX: 100 };

/** Rigid joint batching: decorative rivets/ribs cost geometry, not individual draw calls. */
export function buildPyrostur() {
  const root = new THREE.Group(), scale = new THREE.Group(); scale.scale.setScalar(SC); root.add(scale);
  const nodes = {}, partMeshes = { head: [], body: [], chest: [], valve: [], wingL: [], wingR: [], tail: [] };
  const mats = {}, batches = new Map();
  const material = (part, color, glow = false) => (mats[part + color] ??= (glow ? basic : lambert)({ color }));
  const joint = (id, parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); nodes[id] = g; return g; };
  const geometry = (part, parent, color, source, pos, rot = [0, 0, 0], glow = false, stretch = [1, 1, 1]) => {
    const geo = source.index ? source.toNonIndexed() : source, matrix = new THREE.Matrix4();
    matrix.compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...stretch)); geo.applyMatrix4(matrix);
    const mat = material(part, color, glow), key = parent.uuid + part + color;
    if (!batches.has(key)) batches.set(key, { parent, part, mat, geos: [] }); batches.get(key).geos.push(geo);
  };
  const box = (part, parent, color, pos, size, rot = [0, 0, 0], glow = false) => geometry(part, parent, color, new THREE.BoxGeometry(...size), pos, rot, glow);
  const membrane = (part, parent, color, points) => {
    const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: .07, bevelEnabled: false, steps: 1 });
    geometry(part, parent, color, geo, [0, -.12, 0], [Math.PI / 2, 0, 0]);
  };
  const body = joint('body', scale, 0, 1.65, 0);
  geometry('body', body, '#56474d', new THREE.CylinderGeometry(.65, .95, 2.9, 7), [0, .05, -.2], [Math.PI / 2, 0, 0], false, [1, 1, .9]);
  box('body', body, '#302f3c', [0, .65, -.4], [1.3, .35, 2.6]);
  for (let i = 0; i < 5; i++) {
    geometry('body', body, '#9c8056', new THREE.CylinderGeometry(.81 + i * .025, .81 + i * .025, .09, 7), [0, .1, -1.4 + i * .6], [Math.PI / 2, 0, 0], false, [1, 1, .88]);
    box('body', body, '#35303b', [0, 1.1, -.9 + i * .45], [.22, .6 - i * .06, .3], [-.3, 0, 0]);
  }
  const chest = joint('chest', body, 0, -.35, 1.03);
  geometry('chest', chest, '#cb9550', new THREE.CylinderGeometry(.55, .8, .85, 6), [0, 0, .25], [Math.PI / 2, 0, 0], false, [1, 1, .85]);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) box('chest', chest, '#493f46', [s * .42, -.26 + i * .25, .69], [.36, .09, .06]);
  const core = joint('core', chest, 0, 0, .72);
  box('chest', core, '#ffe095', [0, 0, 0], [.26, .6, .08], [0, 0, 0], true);
  // The valve is low on the flank: melee can sabotage it as well as bows.
  const valve = joint('valve', body, 1.0, -.5, .65);
  geometry('valve', valve, '#b5c8b8', new THREE.CylinderGeometry(.25, .25, .2, 6), [0, 0, 0], [0, 0, Math.PI / 2]);
  const pipe = joint('pipe', valve, 0, 0, 0);
  box('valve', pipe, '#b5c8b8', [.28, .1, 0], [.65, .38, .45], [0, 0, -.28]);
  box('valve', pipe, '#ead98f', [.53, .32, 0], [.45, .14, .7], [0, 0, -.28]);
  const needle = joint('needle', valve, .45, .34, .4);
  box('valve', needle, '#6af0d0', [0, .2, 0], [.07, .42, .08], [0, 0, 0], true);
  const neck = joint('neck', body, 0, .1, 1.3);
  box('body', neck, '#68514e', [0, .1, .25], [.72, .7, .9], [.14, 0, 0]);
  box('body', neck, '#9c8056', [0, -.22, .5], [.52, .2, .9], [-.2, 0, 0]);
  const head = joint('head', neck, 0, -.05, .8);
  box('head', head, '#433c48', [0, 0, .25], [.82, .65, .85]);
  box('head', head, '#a7764e', [0, -.10, .85], [.65, .38, .85], [.08, 0, 0]);
  box('head', head, '#433c48', [0, -.17, 1.38], [.48, .27, .45]);
  for (const s of [-1, 1]) {
    geometry('head', head, '#ead7ac', new THREE.ConeGeometry(.16, 1.1, 4), [s * .35, .56, -.15], [-.75, 0, s * .38]);
    box('head', head, '#72ffe0', [s * .43, .15, .4], [.05, .13, .27], [0, 0, 0], true);
    box('head', head, '#262935', [s * .4, .3, .4], [.22, .18, .55], [0, 0, s * -.22]);
    geometry('head', head, '#ead7ac', new THREE.ConeGeometry(.1, .45, 4), [s * .26, -.4, 1.15], [Math.PI, 0, 0]);
  }
  const jaw = joint('jaw', head, 0, -.35, .2);
  box('head', jaw, '#b29169', [0, 0, .72], [.6, .16, 1.48]);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) geometry('head', jaw, '#ead7ac', new THREE.ConeGeometry(.07, .25, 4), [s * .24, .16, .3 + i * .3]);
  const wings = {};
  for (const [id, s] of [['wingL', 1], ['wingR', -1]]) {
    const w = joint(id, body, s * .75, .45, .25); wings[id] = w;
    // Bent elbow, pointed wrist and scalloped bellows membrane give a dragon silhouette.
    box(id, w, '#a78959', [s * .75, .08, .05], [1.55, .23, .28], [0, s * -.25, s * .14]);
    box(id, w, '#a78959', [s * 2.0, .08, -.25], [1.55, .16, .2], [0, s * .35, 0]);
    membrane(id, w, '#a27b62', [[0, .1], [s * 1.4, .35], [s * 3.25, -.6], [s * 2.45, -1.1], [s * 2.0, -1.8], [s * 1.25, -1.5], [s * .25, -1.6]]);
    membrane(id, w, '#66515b', [[s * 1.4, .35], [s * 2, -1.8], [s * 1.25, -1.5]]);
    for (let i = 0; i < 3; i++) box(id, w, '#a78959', [s * (1.0 + i * .48), -.1, -.65], [.07, .12, 1.55 - i * .18], [0, s * (.2 + i * .1), 0]);
    const leg = joint(s > 0 ? 'legL' : 'legR', body, s * .65, -.55, -.75);
    box('body', leg, '#68514e', [0, -.4, 0], [.65, .9, .75], [.2, 0, 0]);
    box('body', leg, '#b39870', [0, -.92, .3], [.65, .25, 1.05]);
    for (let i = 0; i < 3; i++) box('body', leg, '#e1cfa3', [-.22 + i * .22, -.9, .85], [.12, .18, .5]);
  }
  const tail = joint('tail', body, 0, -.15, -1.55);
  box('tail', tail, '#66515b', [0, 0, -1.15], [.65, .6, 2.3], [-.1, 0, 0]);
  box('tail', tail, '#b48c58', [0, .05, -2.15], [1.0, .6, .7]);
  for (const batch of batches.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(batch.geos), batch.mat); batch.parent.add(mesh); partMeshes[batch.part].push(mesh); batch.geos.forEach((g) => g.dispose());
  }
  const apply = (p) => {
    body.position.y = 1.65 + p.bodyY; body.rotation.set(p.bodyPitch * DEG, 0, p.bodyRoll * DEG);
    neck.rotation.x = p.neck; head.rotation.set(p.head * DEG, p.headYaw * DEG, 0); jaw.rotation.x = p.jaw * DEG;
    tail.rotation.set(p.tailPitch * DEG, p.tailYaw * DEG, 0);
    nodes.legL.rotation.x = p.legL * DEG; nodes.legR.rotation.x = p.legR * DEG;
    wings.wingL.rotation.z = (.12 + p.wing * DEG); wings.wingR.rotation.z = -(.12 + p.wing * DEG);
    wings.wingL.rotation.y = p.spread * -.3; wings.wingR.rotation.y = p.spread * .3;
    chest.scale.setScalar(1 + (p.boiler ?? 0) * .17);
  };
  return { root, nodes, partMeshes, apply, extra: { pipe, needle, coreMat: mats['chest#ffe095'], wings } };
}

const cue = (tone = 'brumm') => ({ color: '#ffd589', tone });
const relativeTarget = (m) => {
  const p = m.target?.pos; if (!p) return { x: 0, z: 1, d: 1 };
  const x = p.x - m.pos.x, z = p.z - m.pos.z;
  return { x: Math.cos(m.rot) * x - Math.sin(m.rot) * z, z: Math.sin(m.rot) * x + Math.cos(m.rot) * z, d: Math.hypot(x, z) };
};
const lateralTarget = (m) => { const p = relativeTarget(m); return Math.abs(p.x) > p.d * .65; };
const hit = (t, at, radius, dmg, knock = 'down') => ({ t0: t, t1: t + .12, shape: 'sphere', at, radius, dmg, knock });
const line = (t, from, to, radius, dmg) => ({ t0: t, t1: t + .12, shape: 'capsule', from, to, radius, dmg, knock: 'down' });
const impact = (m, ctx) => { ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos }); ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 1, z: m.pos.z }, 12, '#ffd69a', 5); ctx.fx.shake(.2, .2); };
const attack = (name, config) => ({ id: 'pyrostur_' + name, range: [0, 15], weight: 3, cooldown: 5, telegraph: .95, duration: 3, stam: 8, tgVar: false,
  markerFromHits: true, cue: cue(), flashParts: ['head'], audit: [4], events: [{ t: config.hits[0].t0, call: 'impact', all: true }], calls: { impact }, ...config });
const bite = attack('zange', {
  range: [2, 7.5], weight: 7, cooldown: 2.5, telegraph: .75, duration: 1.9, audit: [4, 6],
  prepare(a) { a.len = Math.max(0, Math.min(2.2, Math.hypot(a.target.x - a.origin.x, a.target.z - a.origin.z) - 4.2)); },
  motion(t, a) { const step = smooth(clamp01((t - .68) / .18)) * a.len; return { x: a.origin.x + a.dir.x * step, z: a.origin.z + a.dir.z * step }; },
  hits: [line(.85, [-1.3, 1.2, 3.4], [1.3, 1.2, 4.4], 1.25, 33)],
  pose: mTrack([[0, {}], [.65, { head: -22, jaw: 65, neck: -.2 }], [.78, { head: -22, jaw: 65 }], [.9, { head: 25, jaw: 0, bodyPitch: 7 }], [1.5, { head: 20, jaw: 12 }], [1.9, {}]]),
});
const wing = attack('kesselfluegel', {
  range: [0, 3.6], weight: 6, cooldown: 4, telegraph: 1.1, duration: 2.25, flashParts: ['wingL', 'wingR'], audit: [2, 3],
  hits: [line(1.2, [-5.4, .9, 2], [5.4, .9, 2], 1.45, 38)],
  pose: mTrack([[0, {}], [.85, { wing: 65, spread: 1, bodyY: -.2 }], [.96, { wing: 65, spread: 1 }], [1.1, { wing: -30, bodyY: -.35, bodyPitch: 7 }], [1.7, { wing: -20, head: 18 }], [2.25, {}]]),
});
const tail = attack('schlackenschweif', {
  range: [0, 7], weight: 8, noFace: true, cond: (m) => relativeTarget(m).z < 0,
  duration: 3.2, telegraph: 1.1, flashParts: ['tail'], audit: [0],
  hits: [line(1.25, [-5.5, .8, -2], [5.5, .8, -2], 1.6, 40)],
  pose: mTrack([[0, {}], [.8, { tailYaw: -65, bodyRoll: -12 }], [1, { tailYaw: -65, bodyRoll: -12 }], [1.2, { tailYaw: 65, bodyRoll: 12 }], [1.8, { tailYaw: 35, head: 12 }], [3.2, {}]]),
});
const vent = attack('seitenablass', {
  range: [2, 8.5], weight: (m) => 2 + (m.pressure ?? 0) / 20, noFace: true, cond: lateralTarget, cooldown: 7, telegraph: 1.1, duration: 3.4, flashParts: ['valve', 'chest'], lockedByBreak: 'valve', audit: [0],
  hits: [line(1.2, [-2, .9, -.1], [-7.5, .9, -.1], 1.4, 42), line(1.2, [2, .9, -.1], [7.5, .9, -.1], 1.4, 42)],
  pose: mTrack([[0, {}], [.85, { wing: 35, bodyY: -.25, jaw: 30 }], [1, { wing: 35, bodyY: -.25 }], [1.15, { wing: -10, head: 20, bodyRoll: -8 }], [2, { head: 25, jaw: 40 }], [3.4, {}]]),
});
const leak = attack('leckablass', {
  range: [2, 7], weight: 4, noFace: true, cond: (m) => lateralTarget(m) && relativeTarget(m).x > 0, cooldown: 7, telegraph: 1.1, duration: 3.8, flashParts: ['valve'], needsBroken: 'valve', audit: [0],
  // Broken valve vents only to its right: the left flank is permanently safe.
  hits: [line(1.2, [2, .9, -.1], [6, .9, -.1], 1.2, 32)], pose: vent.pose,
});
const breath = attack('ofenschneise', {
  range: [6, 19], cooldown: 5, duration: 2.3, audit: [8, 14], telegraph: 1.15,
  hits: [line(1.25, [0, 1, 4], [0, 1, 17], 1.55, 44)],
  pose: mTrack([[0, {}], [.8, { head: -25, jaw: 70, neck: -.1, wing: 25 }], [1.16, { head: -25, jaw: 70 }], [1.3, { head: 16, jaw: 75, bodyPitch: -5 }], [2, { head: 24, jaw: 45 }], [2.3, {}]]),
});
const charge = attack('kesselramme', {
  range: [4.5, 19], weight: (m, d) => d > 8 ? 8 : 4, cooldown: 5, telegraph: 1.1, duration: 2.65, flashParts: ['chest'], audit: [9, 15],
  prepare(a) { a.len = Math.min(15, Math.hypot(a.target.x - a.origin.x, a.target.z - a.origin.z)); },
  motion(t, a) { const k = smooth(clamp01((t - 1.1) / .6)) * a.len; return { x: a.origin.x + a.dir.x * k, z: a.origin.z + a.dir.z * k }; },
  hits: [{ t0: 1.15, t1: 1.7, shape: 'sphere', at: [0, .9, 2], radius: 2, dmg: 44, knock: 'down' }],
  pose: mTrack([[0, {}], [.95, { bodyY: -.35, head: 15, wing: -15, jaw: 20 }], [1.1, { bodyY: -.35, head: 15 }], [1.4, { bodyPitch: 10, wing: 15, head: 25 }], [1.8, { bodyY: -.35, head: 30, jaw: 35 }], [2.65, {}]]),
});
const rain = attack('feuerregen', {
  range: [4, 14], weight: 4, cooldown: 15, phase: 1, telegraph: 1.4, duration: 5.2, flashParts: ['chest', 'wingL', 'wingR'], audit: [6, 11], punishWindow: 1.8,
  // Fixed staggered lanes leave lateral escape routes and an inner chest pocket.
  hits: [hit(1.55, [-3.5, .5, 6], 2.3, 42), hit(1.55, [3.5, .5, 6], 2.3, 42), hit(2.55, [0, .5, 11], 2.6, 46), hit(2.55, [-7, .5, 8], 2.3, 42), hit(2.55, [7, .5, 8], 2.3, 42)],
  events: [{ t: 1.4, call: 'impact', all: true }, { t: 2.4, call: 'impact', all: true }],
  pose: mTrack([[0, {}], [1.1, { head: -60, neck: -.3, jaw: 80, wing: 60, spread: 1 }], [1.45, { head: -60, jaw: 80, wing: 60 }], [1.7, { head: -30, jaw: 65, wing: -10 }], [2.4, { head: -45, wing: 45, jaw: 70 }], [2.65, { bodyY: -.4, head: 32, wing: -20, jaw: 40 }], [4.6, { bodyY: -.35, head: 32, jaw: 25 }], [5.2, {}]]),
});
const pressure = attack('ueberdruck', {
  range: [3.8, 8], weight: (m) => (m.pressure ?? 0) > 65 ? 8 : 1, cooldown: 15, telegraph: 1.8, duration: 5.5, flashParts: ['chest', 'valve'], audit: [4, 8], punishWindow: 2.1,
  // A donut built from six separated lobes; standing at the lowered chest is safe.
  hits: Array.from({ length: 6 }, (_, i) => hit(2.9, [Math.sin(i * Math.PI / 3) * 6, .7, Math.cos(i * Math.PI / 3) * 6], 2.3, 52)),
  events: [{ t: 1.8, call: 'hiss', all: true }, { t: 2.8, call: 'impact', all: true }],
  calls: { impact, hiss: (m, ctx) => ctx.bus.emit('sfx', { name: 'roar', pos: m.pos }) },
  pose: mTrack([[0, {}], [1.1, { bodyY: -.3, wing: 35, jaw: 40, head: 20 }], [1.8, { bodyY: -.45, wing: 55, head: 30, jaw: 65 }], [2.8, { bodyY: -.45, wing: 55, head: 30, jaw: 65 }], [3, { wing: -20, bodyY: -.45, head: 35, jaw: 80 }], [4.9, { bodyY: -.4, head: 35, jaw: 35 }], [5.5, {}]]),
});
const stomp = attack('notabschaltung', {
  range: [0, 8.5], weight: 5, cooldown: 8, phase: 2, telegraph: 1.2, duration: 3.8, audit: [4, 7], flashParts: ['chest', 'body'],
  hits: [line(1.35, [-4.5, .6, 2], [4.5, .6, 2], 1.6, 48), line(2.1, [-4.5, .6, 7], [4.5, .6, 7], 1.6, 44)],
  events: [{ t: 1.3, call: 'impact', all: true }, { t: 2.05, call: 'impact', all: true }],
  pose: mTrack([[0, {}], [1.05, { bodyY: .3, head: -15, wing: 55, legL: -25, legR: -25 }], [1.2, { bodyY: .3, wing: 55 }], [1.4, { bodyY: -.45, head: 30, wing: -20 }], [1.9, { bodyY: -.3, head: 25 }], [2.2, { bodyY: -.45, head: 30 }], [3.8, {}]]),
});

const elements = { fire: 0, shock: 15, water: 25 };
export const pyrostur = {
  id: 'pyrostur', name: 'Pyrostur', hp: 22000, scale: SC, bodyRadius: 2.2,
  walk: 3.9, run: 6.3, turn: 1.15, detect: 32, prefer: 3.2,
  drops: ['pyrostur_schuppe', 'pyrostur_kesselsack', 'pyrostur_fluegel', 'pyrostur_rubin'],
  build: buildPyrostur, stamina: true, flinchDmg: true, chainMax: 2, teachAttack: bite.id,
  recoverAfter: () => 1.05,
  parts: [
    { id: 'head', label: 'Ofenschnauze', factor: .85, stunPart: true, elem: elements, spheres: [{ node: 'head', offset: [0, 0, .55], r: .75 }] },
    { id: 'chest', label: 'Brustbalg', factor: .65, breakHp: 1800, elem: elements, spheres: [{ node: 'chest', offset: [0, 0, .25], r: .75 }] },
    { id: 'valve', label: 'Überdruckventil', factor: .8, breakHp: 1000, elem: elements, spheres: [{ node: 'valve', offset: [.3, .1, 0], r: .5 }] },
    { id: 'wingL', label: 'Kesselflügel links', factor: .55, breakHp: 1400, elem: elements, spheres: [{ node: 'wingL', offset: [1.3, -.15, -.8], r: .8 }] },
    { id: 'wingR', label: 'Kesselflügel rechts', factor: .55, breakHp: 1400, elem: elements, spheres: [{ node: 'wingR', offset: [-1.3, -.15, -.8], r: .8 }] },
    { id: 'tail', label: 'Schlackenschweif', factor: .55, elem: elements, spheres: [{ node: 'tail', offset: [0, 0, -1.5], r: .65 }] },
    { id: 'body', label: 'Kesselrumpf', factor: .45, elem: elements, spheres: [{ node: 'body', offset: [0, 0, -.5], r: .9 }, { node: 'legL', offset: [0, -.6, 0], r: .5 }, { node: 'legR', offset: [0, -.6, 0], r: .5 }] },
  ],
  attacks: Object.fromEntries([bite, wing, tail, vent, leak, breath, charge, rain, pressure, stomp].map((a) => [a.id, a])),
  chains: {
    [bite.id]: [{ atk: wing.id, w: 3 }, { atk: charge.id, w: 2 }, { atk: charge.id, w: 5, cond: (m) => m.phase >= 2 }, { atk: null, w: 2 }],
    [wing.id]: [{ atk: vent.id, w: 3 }, { atk: leak.id, w: 3 }, { atk: null, w: 3 }],
    [charge.id]: [{ atk: bite.id, w: 3 }, { atk: bite.id, w: 5, cond: (m) => m.phase >= 2 }, { atk: wing.id, w: 2 }, { atk: null, w: 2 }],
    [breath.id]: [{ atk: rain.id, w: 3 }, { atk: pressure.id, w: 2 }, { atk: null, w: 3 }],
  },
  phases: [
    { at: .65, name: 'Betriebsdruck überschritten', cue: cue(), special: rain.id, enter(m) { m.pressure = 75; } },
    { at: .30, name: 'Garantie erloschen', cue: cue(), special: pressure.id, enter(m) { m.pressure = 100; } },
  ],
  init(m) { m.pressure = 15; m.boilerCounter = 0; m._pyroBroken = 0; m.pose.boiler = 0; m._tgt.boiler = 0; },
  tick(m, dt) {
    const a = m.attack, tau = a?.inst.sample(a.t).tau ?? 0;
    // Derive visuals from replicated attack/phase/parts, never from a client RNG.
    const charging = a?.id === pressure.id && tau < 2.9;
    m.extra.coreMat.color.set(charging ? '#fff5bc' : a?.id === rain.id && tau > 2.6 ? '#72e6ce' : '#edbc70');
    m.extra.needle.rotation.z = charging ? -.8 + Math.min(1, tau / 2.8) * 1.6 : -.7 + (m.pressure ?? 0) / 100 * 1.4;
    m.extra.pipe.visible = !m.partById.valve.broken;
    m.extra.needle.visible = !m.partById.valve.broken;
    const chest = m.partById.chest;
    chest.factor = (chest.broken || charging || (a?.id === rain.id && tau > 2.65) ? 1.05 : chest.baseFactor) + (m._fb ?? 0);
    // The split brass casing remains visibly crumpled after its break.
    m.nodes.core.scale.x = chest.broken ? 2.3 : 1;
    for (const id of ['wingL', 'wingR']) m.extra.wings[id].scale.x = m.partById[id].broken ? .64 : 1;
    if (!m.authority) return;
    if (!charging) m.boilerCounter = 0;
    if (m.state === 'combat' && !m.tired) m.pressure = Math.min(100, m.pressure + dt * (m.partById.valve.broken ? 1.3 : m.phase >= 2 ? 5 : 3));
    if (m.phase >= 2) for (const id of [bite.id, wing.id, charge.id, stomp.id]) if (m.cds[id] > 0) m.cds[id] -= dt * .3;
  },
  poseHook(m, p) {
    const a = m.attack, tau = a?.inst.sample(a.t).tau ?? 0;
    p.boiler = a?.id === pressure.id ? Math.sin(clamp01(tau / 2.9) * Math.PI / 2) : .2 + .1 * Math.sin(m.time * 2);
  },
  onDamage(m, res) {
    if (!m.authority || res.partId !== 'chest' || m.attack?.id !== pressure.id) return;
    const tau = m.attack.inst.sample(m.attack.t).tau;
    if (tau >= 2.9) return;
    m.boilerCounter += res.dmg;
    if (m.boilerCounter >= PYRO.COUNTER_DAMAGE) {
      m._interrupt(); m._chainBreak(); m.queued = null; m.pressure = 0;
      m.boilerCounter = 0;
      m.stagT = Math.max(m.stagT, PYRO.COUNTER_TIME); m.recover = Math.max(m.recover, PYRO.COUNTER_TIME);
      m.ctx.bus.emit('sfx', { name: 'break', pos: m.pos });
    }
  },
  onBreak(m, part) {
    if (part.id === 'chest') { part.factor = 1.05; m.pressure = 0; m.stagT = Math.max(m.stagT, PYRO.COUNTER_TIME); m.recover = Math.max(m.recover, PYRO.COUNTER_TIME); }
    if (part.id === 'valve') { m.pressure = Math.max(0, m.pressure - 45); part.factor = 1; }
    if (part.id === 'wingL' || part.id === 'wingR') { m.cds[rain.id] = Math.max(m.cds[rain.id] ?? 0, 12); part.factor = .85; }
  },
  onAttackEnd(m, id) { if ([pressure.id, rain.id, vent.id, leak.id].includes(id)) m.pressure = Math.max(0, m.pressure - 60); },
  // Wing sabotage changes attack selection and pressure, not just a cosmetic mesh.
  speedFactor: (m) => (m.partById.wingL.broken || m.partById.wingR.broken ? .9 : 1),
  snapExtra: (m) => ({ pressure: Math.round(m.pressure ?? 0) }),
};
