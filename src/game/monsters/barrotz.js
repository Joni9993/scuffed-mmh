import * as THREE from 'three';
import { lambert, basic } from '../../render/ps1.js';
import { tex, registerTexture } from '../../render/textures.js';
import { mTrack } from './monster.js';
import { smooth, clamp01, tailSweep, targetBehind } from './common.js';
import { mudDef } from './mprojectiles.js';
import { wrapAngle } from '../../core/math.js';

const R = Math.PI / 180;
const SC = 1.5;

// ---- procedural textures (registered once, 16 px, PS1 look)
const speckle = (cols, density = 1) => (g, n, rnd) => {
  g.fillStyle = cols[0]; g.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (rnd() > density) continue; g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(x, y, 1, 1); }
};
registerTexture('barrotz_hide', (g, n, rnd) => {
  speckle(['#957f5e', '#88734f', '#a48c68', '#76634a'])(g, n, rnd);
  g.fillStyle = '#3e5a30';
  for (let i = 0; i < n; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 2, 1); // moss
  g.fillStyle = '#3a2e22';
  for (let y = 2; y < n; y += 6) g.fillRect(0, y, n, 1);
});
registerTexture('barrotz_plate', (g, n, rnd) => {
  speckle(['#c4bcaa', '#b4ac9a', '#d4ccba', '#a49c8a'])(g, n, rnd);
  g.fillStyle = '#5a554c';
  for (let x = 0; x < n; x += 5) g.fillRect(x, 0, 1, n);
  g.fillStyle = '#c8c2b4';
  for (let i = 0; i < 6; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 2, 2);
});
registerTexture('barrotz_mud', (g, n, rnd) => {
  speckle(['#7a5430', '#6a4624', '#8a6238', '#5a3a1c'])(g, n, rnd);
  g.fillStyle = '#7a5a36';
  for (let i = 0; i < n; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 2, 2);
});
registerTexture('barrotz_belly', speckle(['#8a7a5a', '#7a6a4c', '#9a8a68']));

/**
 * Procedural Barrotz: bulky quadruped ram. Parts: head (Kopfplatte), body, legs (Vorderbeine), tail.
 * Mud coat meshes belong to the body part (they flash with it) and are shown while Schlammpanzer is up.
 * Pose keys as MREST; legL / legR drive the left / right leg pair.
 */
export function buildBarrotz({ scale = SC } = {}) {
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  root.add(g);
  const partMeshes = { head: [], body: [], legs: [], tail: [] };
  const mats = {};
  const mat = (part, t, opts = {}) => (mats[part + t] ??= lambert({ map: tex(t, { size: 16 }), ...opts }));
  const add = (part, w, h, d, m, parent, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    parent.add(mesh);
    partMeshes[part].push(mesh);
    return mesh;
  };

  const BASE = 1.45;
  const body = new THREE.Group();
  body.position.y = BASE;
  g.add(body);
  add('body', 1.7, 1.25, 2.7, mat('body', 'barrotz_hide'), body, 0, 0, 0);
  add('body', 1.4, 0.5, 2.1, mat('body', 'barrotz_belly'), body, 0, -0.55, 0.1);
  add('body', 1.2, 0.5, 1.2, mat('body', 'barrotz_plate'), body, 0, 0.8, 0.55, -0.1); // shoulder hump
  for (const sx of [1, -1]) add('body', 0.3, 0.3, 0.3, mat('body', 'barrotz_plate'), body, sx * 0.65, 0.7, -0.3);
  // mud coat: hidden until Schlammpanzer
  const coatMat = lambert({ map: tex('barrotz_mud', { size: 16 }) });
  const coat = [];
  coat.push(add('body', 1.95, 1.5, 3.0, coatMat, body, 0, 0.02, 0));
  coat.push(add('body', 1.5, 0.45, 2.4, coatMat, body, 0, 0.8, 0.2));
  for (const [x, y, z, s] of [[0.9, 0.5, 1.1, 0.6], [-0.9, 0.3, -0.6, 0.7], [0.5, 0.9, -0.9, 0.55], [-0.6, 0.9, 0.9, 0.5], [0.95, -0.3, -1.0, 0.6]]) coat.push(add('body', s, s, s, coatMat, body, x, y, z, 0.4, 0.5, 0.2));
  for (const c of coat) c.visible = false;

  const neck = new THREE.Group();
  neck.position.set(0, 0.25, 1.25);
  body.add(neck);
  add('body', 0.9, 0.8, 0.8, mat('body', 'barrotz_hide'), neck, 0, 0.1, 0.25);

  const head = new THREE.Group();
  head.position.set(0, 0.2, 0.55);
  neck.add(head);
  add('head', 0.95, 0.8, 1.2, mat('head', 'barrotz_hide'), head, 0, -0.05, 0.45);
  add('head', 0.7, 0.3, 0.7, mat('head', 'barrotz_belly'), head, 0, -0.42, 0.55); // jaw
  const eyeM = basic({ color: '#ffd24a' });
  for (const sx of [1, -1]) add('head', 0.14, 0.14, 0.14, eyeM, head, sx * 0.5, 0.15, 0.6);
  // the big head plate (breaks away) + studs
  const plate = new THREE.Group();
  plate.position.set(0, 0.42, 0.25);
  head.add(plate);
  add('head', 1.5, 0.5, 1.5, mat('head', 'barrotz_plate'), plate, 0, 0.1, 0.1, -0.12);
  add('head', 1.2, 0.35, 0.5, mat('head', 'barrotz_plate'), plate, 0, 0.35, 0.55, -0.4);
  for (const sx of [1, -1]) add('head', 0.35, 0.35, 0.35, mat('head', 'barrotz_plate'), plate, sx * 0.62, 0.0, 0.85, 0.3, 0.4 * sx);
  const plateMeshes = plate.children.slice();
  const stump = add('head', 0.9, 0.22, 0.9, mat('head', 'barrotz_hide'), head, 0, 0.4, 0.2);
  stump.visible = false;

  const legs = {};
  for (const [name, sx] of [['legL', 1], ['legR', -1]]) {
    const l = new THREE.Group();
    l.position.set(sx * 0.75, -0.45, 0);
    body.add(l);
    const m = mat('legs', 'barrotz_hide');
    for (const z of [0.85, -0.9]) {
      add('legs', 0.5, 0.75, 0.55, m, l, 0, -0.35, z);
      add('legs', 0.42, 0.7, 0.45, m, l, 0, -0.85, z + 0.05);
      add('legs', 0.5, 0.14, 0.62, mat('legs', 'barrotz_mud'), l, 0, -1.2, z + 0.12);
    }
    legs[name] = l;
  }

  const tail1 = new THREE.Group();
  tail1.position.set(0, 0, -1.3);
  body.add(tail1);
  add('tail', 0.75, 0.65, 1.5, mat('tail', 'barrotz_hide'), tail1, 0, 0, -0.7, -0.05);
  const tail2 = new THREE.Group();
  tail2.position.set(0, 0, -1.4);
  tail1.add(tail2);
  add('tail', 0.45, 0.45, 1.1, mat('tail', 'barrotz_hide'), tail2, 0, 0, -0.5, -0.05);
  const club = add('tail', 0.95, 0.85, 0.95, mat('tail', 'barrotz_plate'), tail2, 0, 0, -1.25);
  const clubStud = add('tail', 0.3, 0.3, 0.3, mat('tail', 'barrotz_plate'), tail2, 0, 0.55, -1.25);

  const nodes = { body, neck, head, tail1, tail2, legL: legs.legL, legR: legs.legR, root: g };
  return {
    root, nodes, partMeshes,
    extra: { plate, plateMeshes, stump, eyeMat: eyeM, coat, coatMat, club, clubStud },
    apply(p) {
      body.position.y = BASE + p.bodyY / scale;
      body.rotation.set(p.bodyPitch * R, 0, p.bodyRoll * R);
      neck.rotation.x = 0.35 + p.neck;
      head.rotation.set(-(0.35 + p.neck) + p.head * R, p.headYaw * R, 0);
      tail1.rotation.set(p.tailPitch * R, p.tailYaw * R, 0);
      tail2.rotation.set(p.tailPitch * 0.5 * R, p.tailYaw * 0.8 * R, 0);
      legs.legL.rotation.x = -p.legL * R;
      legs.legR.rotation.x = -p.legR * R;
    },
  };
}

// ======================================================= Schlammpanzer (mud armour)
export const PANZER_HP = 150;
function setArmor(m, on) {
  const body = m.partById.body;
  if (on) {
    m.armor = { hp: PANZER_HP };
    body.factor = body.baseFactor * 0.5;
    for (const p of m.parts) p.elem.fire = 0;
  } else {
    m.armor = null;
    body.factor = body.broken ? Math.max(0, body.baseFactor - 0.1) : body.baseFactor;
    for (const p of m.parts) p.elem.fire = p.baseElem.fire ?? 0;
  }
  for (const c of m.extra.coat) c.visible = on;
}
function breakArmor(m, why) {
  if (!m.armor) return false;
  setArmor(m, false);
  m.ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 2.2, z: m.pos.z }, 30, '#6a4a2a', 7);
  m.ctx.fx.number({ x: m.pos.x, y: m.pos.y + 4, z: m.pos.z }, why === 'shock' ? 'Schock!' : 'Panzer ab!', 'weak');
  m.ctx.fx.shake(0.25, 0.25);
  m.ctx.bus.emit('sfx', { name: 'break', pos: m.pos });
  m.ctx.bus.emit('armorBreak', { monster: m, why });
  if (m.authority) { m._interrupt(); m.stagT = Math.max(m.stagT, 0.8); }
  return true;
}

// ======================================================= Angriffe
// ---- 1. Rammsturm: scharrt 0,9 s, rennt 15 m geradeaus (30 Schaden, wirft um). Rotglut: dreht und rennt nochmal.
const RAMM_LEN = 15;
const ramm = {
  id: 'barrotz_ramm', range: [7, 26], weight: 4, cooldown: 6, telegraph: 0.9, flashParts: ['legs', 'head'], duration: 3.1,
  marker: { at: 'landing', radius: 2.4 }, markerUntil: 2.1,
  prepare(a) {
    const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z;
    a.aimYaw = Math.atan2(dx, dz);
    a.turn = wrapAngle(a.aimYaw - a.yaw0);
    a.chargeYaw = a.yaw0 + a.turn;
    a.landing = { x: a.origin.x + Math.sin(a.chargeYaw) * RAMM_LEN, z: a.origin.z + Math.cos(a.chargeYaw) * RAMM_LEN };
  },
  hits: [{ t0: 1.0, t1: 2.0, shape: 'capsule', from: [0, 1.7, 1.6], to: [0, 1.9, 4.2], radius: 1.55, dmg: 30, knock: 'down' }],
  events: [{ t: 0.25, call: 'dust', all: true }, { t: 0.55, call: 'dust', all: true }, { t: 1.0, call: 'dust', all: true }],
  calls: {
    dust(m) {
      for (const sx of [-1, 1]) m.ctx.fx.spark({ x: m.pos.x + Math.cos(m.rot) * sx * 1.2 + Math.sin(m.rot) * 1.8, y: m.pos.y + 0.3, z: m.pos.z - Math.sin(m.rot) * sx * 1.2 + Math.cos(m.rot) * 1.8 }, 6, '#a08a60', 3);
    },
  },
  motion(tau, a) {
    const k = clamp01((tau - 0.9) / 1.15);
    const e = k * k * (3 - 2 * k) * 0.35 + k * 0.65; // quick start, steady run
    const yaw = a.yaw0 + a.turn * smooth(clamp01(tau / 0.8));
    return { x: a.origin.x + Math.sin(a.chargeYaw) * RAMM_LEN * e, z: a.origin.z + Math.cos(a.chargeYaw) * RAMM_LEN * e, yaw };
  },
  pose: mTrack([
    [0, {}], [0.2, { head: 12, neck: 0.15, legL: 35, bodyPitch: 6, bodyY: -0.1 }], [0.4, { head: 12, neck: 0.15, legL: -20, legR: 0, bodyPitch: 6, bodyY: -0.1 }],
    [0.6, { head: 12, neck: 0.15, legL: 35, legR: 0, bodyPitch: 6, bodyY: -0.1 }], [0.88, { head: 18, neck: 0.3, legL: -25, legR: 25, bodyPitch: 12, bodyY: -0.25 }],
    [1.1, { head: 18, neck: 0.3, legL: 50, legR: -50, bodyPitch: 10, bodyY: -0.2 }, 'lin'], [1.4, { legL: -50, legR: 50, bodyPitch: 10 }, 'lin'],
    [1.7, { legL: 50, legR: -50, bodyPitch: 10 }, 'lin'], [2.05, { legL: -40, legR: 40, bodyPitch: 8 }, 'lin'], [2.5, { head: 5, neck: 0, bodyPitch: 0, legL: 10, legR: 10, bodyY: -0.05 }], [3.1, {}],
  ]),
};

// ---- 2. Plattenhammer: Kopf hebt sich 0,7 s, Schlag nach vorn + Schlamm-Schockwelle (4 m), 25 Schaden
const hammer = {
  id: 'barrotz_hammer', range: [0, 6.8], weight: 4, cooldown: 4, telegraph: 0.7, flashParts: ['head'], duration: 2.1,
  marker: { at: 'landing', radius: 4 }, markerUntil: 1.25,
  prepare(a) { a.landing = { x: a.origin.x + a.dir.x * 3.4, z: a.origin.z + a.dir.z * 3.4 }; },
  hits: [{ t0: 0.82, t1: 0.98, shape: 'sphere', at: [0, 0.4, 3.4], radius: 3.6, dmg: 25, knock: 'down' }],
  events: [{ t: 0.82, call: 'quake', all: true }],
  calls: {
    quake(m, ctx) {
      const x = m.pos.x + Math.sin(m.rot) * 3.4, z = m.pos.z + Math.cos(m.rot) * 3.4;
      ctx.fx.spark({ x, y: ctx.world.heightAt(x, z) + 0.3, z }, 26, '#6a4a2a', 7);
      ctx.fx.shake(0.4, 0.3);
      ctx.bus.emit('sfx', { name: 'heavy', pos: { x, y: 0, z } });
    },
  },
  motion(tau, a) {
    const k = smooth(clamp01((tau - 0.7) / 0.14)) * 0.5;
    return { x: a.origin.x + a.dir.x * k, z: a.origin.z + a.dir.z * k };
  },
  pose: mTrack([
    [0, {}], [0.45, { neck: -0.6, head: -38, bodyPitch: -14, bodyY: 0.15, legL: -10, legR: -10 }], [0.7, { neck: -0.7, head: -42, bodyPitch: -16, bodyY: 0.2 }],
    [0.85, { neck: 0.7, head: 34, bodyPitch: 14, bodyY: -0.3 }, 'lin'], [1.3, { neck: 0.6, head: 28, bodyPitch: 10, bodyY: -0.25 }], [2.1, {}],
  ]),
};

// ---- 3. Schlammwälzer: wälzt sich 2 s (verwundbar), danach Schlammpanzer
const waelzer = {
  id: 'barrotz_waelzer', range: [0, 22], weight: 2, cooldown: 14, telegraph: 0.6, flashParts: ['body'], duration: 3.4,
  cond: (m) => !m.armor,
  hits: [],
  events: [{ t: 2.7, call: 'coat', all: true }],
  calls: {
    coat(m) {
      setArmor(m, true);
      m.ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 1.5, z: m.pos.z }, 24, '#5a3e22', 5);
    },
  },
  pose: mTrack([
    [0, {}], [0.6, { bodyY: -0.7, legL: 30, legR: 30, head: 10, neck: 0.2, bodyPitch: 4 }],
    [0.9, { bodyY: -0.9, bodyRoll: 60 }], [1.3, { bodyY: -0.9, bodyRoll: 150 }], [1.7, { bodyY: -0.9, bodyRoll: 240 }], [2.1, { bodyY: -0.9, bodyRoll: 330 }],
    [2.4, { bodyY: -0.9, bodyRoll: 360, legL: 0, legR: 0 }], [2.7, { bodyY: -0.4, bodyRoll: 360, head: -10, neck: -0.2 }], [3.4, { bodyY: 0, bodyRoll: 360 }],
  ]),
};

// ---- 4. Schlammspritzer (nur mit Panzer): schüttelt sich, 6 Schlammkleckse (10 Schaden + Verschlammt)
const spritzer = {
  id: 'barrotz_spritzer', range: [2, 15], weight: 3, cooldown: 8, telegraph: 0.7, flashParts: ['body'], duration: 2.4,
  cond: (m) => !!m.armor,
  hits: [],
  events: [{ t: 0.95, call: 'spray', all: true }],
  calls: {
    spray(m, ctx, inst, age = 0) {
      const o = inst.origin, a = inst.yaw0;
      const from = { x: o.x + Math.sin(a) * 1.0, y: o.y + 3.0, z: o.z + Math.cos(a) * 1.0 };
      const dx = inst.target.x - o.x, dz = inst.target.z - o.z, dist = Math.hypot(dx, dz) || 1;
      for (let i = 0; i < 6; i++) {
        let tx, tz;
        if (i < 2) { tx = inst.target.x + (inst.r(i) - 0.5) * 2.4; tz = inst.target.z + (inst.r(i + 6) - 0.5) * 2.4; }
        else {
          const ang = Math.atan2(dx, dz) + (inst.r(i) - 0.5) * 1.3, d = Math.max(3.5, Math.min(13, dist * (0.55 + inst.r(i + 6) * 0.8)));
          tx = o.x + Math.sin(ang) * d; tz = o.z + Math.cos(ang) * d;
        }
        const def = mudDef({ from, to: { x: tx, y: ctx.world.heightAt(tx, tz), z: tz }, dur: 0.8 + inst.r(i + 3) * 0.2, key: `${inst.key}:m${i}` });
        m.projectiles.spawn(def, age);
      }
      ctx.fx.spark({ x: from.x, y: from.y, z: from.z }, 20, '#6a4a2a', 6);
    },
  },
  pose: mTrack([
    [0, {}], [0.35, { bodyY: -0.1, bodyPitch: 4, head: 10 }], [0.7, { bodyY: -0.15, bodyPitch: 6, tailYaw: 20, head: 14 }],
    [0.85, { bodyRoll: 8, tailYaw: -25 }, 'lin'], [1.0, { bodyRoll: -8, tailYaw: 25 }, 'lin'], [1.15, { bodyRoll: 8, tailYaw: -25 }, 'lin'], [1.3, { bodyRoll: -8, tailYaw: 25 }, 'lin'],
    [1.5, { bodyRoll: 0, tailYaw: 0 }], [2.4, {}],
  ]),
};

// ---- 5. Schwanzfeger: Halbkreis hinten, 18 Schaden
const feger = tailSweep({
  id: 'barrotz_feger', range: [0, 8], weight: 8, cooldown: 3, telegraph: 0.6, dmg: 18, len: 6.4, radius: 1.1, sweep: 2.4, y: 1.0, duration: 1.9, t0: 0.65, t1: 1.15,
  cond: (m) => targetBehind(m, 1.6),
  pose: mTrack([
    [0, {}], [0.5, { tailYaw: 55, bodyY: -0.1, bodyPitch: 3, head: 8 }], [0.62, { tailYaw: 55 }], [0.8, { tailYaw: -55 }, 'lin'], [1.15, { tailYaw: -55 }], [1.9, {}],
  ]),
});

export const barrotz = {
  id: 'barrotz',
  name: 'Barrotz',
  hp: 3200,
  scale: SC,
  bodyRadius: 2.0,
  walk: 2.2, run: 6.0, detect: 26, prefer: 6, turn: 0.75,
  drops: ['barrotz_kruste', 'barrotz_platte', 'barrotz_schwanzleder'],
  parts: [
    { id: 'head', label: 'Kopfplatte', factor: 0.5, breakHp: 400, jitter: 0.07, elem: { fire: 10, shock: 20 }, blunt: true, stunPart: true,
      spheres: [{ node: 'head', offset: [0, 0.15, 0.55], r: 0.78 }] },
    { id: 'legs', label: 'Vorderbeine', factor: 0.9, elem: { fire: 10, shock: 10 },
      spheres: [{ node: 'legL', offset: [0, -0.7, 0.85], r: 0.55 }, { node: 'legR', offset: [0, -0.7, 0.85], r: 0.55 }] },
    { id: 'body', label: 'Körper', factor: 0.7, elem: { fire: 10, shock: 12 },
      spheres: [{ node: 'body', offset: [0, 0, 0.65], r: 1.0 }, { node: 'body', offset: [0, 0, -0.6], r: 1.0 }, { node: 'neck', offset: [0, 0.1, 0.2], r: 0.55 }] },
    { id: 'tail', label: 'Schwanz', factor: 0.8, breakHp: 300, jitter: 0.06, elem: { fire: 10, shock: 10 },
      spheres: [{ node: 'tail1', offset: [0, 0, -0.7], r: 0.6 }, { node: 'tail2', offset: [0, 0, -1.2], r: 0.65 }] },
  ],
  attacks: { barrotz_ramm: ramm, barrotz_hammer: hammer, barrotz_waelzer: waelzer, barrotz_spritzer: spritzer, barrotz_feger: feger },
  build: () => buildBarrotz({ scale: SC }),
  init(m) { m.armor = null; m._chained = false; },
  onBreak(m, part) {
    if (part.id === 'head') {
      part.factor = 0.9; // GDD: broken plate -> 0.9
      for (const pm of m.extra.plateMeshes) pm.visible = false;
      m.extra.stump.visible = true;
    }
    if (part.id === 'tail') {
      m.extra.club.visible = false; m.extra.clubStud.visible = false;
    }
  },
  onDamage(m, res) {
    if (!m.armor) return;
    if ((res.elemBy?.shock ?? 0) > 0) { breakArmor(m, 'shock'); return; }
    if (res.partId === 'body') {
      m.armor.hp -= res.dmg;
      if (m.armor.hp <= 0) breakArmor(m, 'dmg');
    }
  },
  onElement(m, type, opts) {
    if (type === 'shock') return breakArmor(m, 'shock');
    if (type === 'fire') return !m.armor; // mud coat soaks up fire
    return false;
  },
  onAttackEnd(m, id) {
    // Rotglut: turn around and charge once more
    if (id === 'barrotz_ramm') {
      if (m.rage && !m._chained) { m.queued = 'barrotz_ramm'; m._chained = true; m.cds.barrotz_ramm = 0; }
      else m._chained = false;
    }
  },
  onRage(m, on) { m.extra.eyeMat?.color.set(on ? '#ff3020' : '#ffd24a'); },
  snapExtra: (m) => ({ armor: !!m.armor }),
  setArmor,
  breakArmor,
};
