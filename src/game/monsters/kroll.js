import * as THREE from 'three';
import { lambert, basic } from '../../render/ps1.js';
import { tex, registerTexture } from '../../render/textures.js';
import { mTrack } from './monster.js';
import { smooth, clamp01 } from './common.js';
import { AttackInstance } from './attack.js';
import { wrapAngle } from '../../core/math.js';

const R = Math.PI / 180;
const SC = 2.6;

// ---- procedural textures (16 px, PS1 look)
const speckle = (cols, density = 1) => (g, n, rnd) => {
  g.fillStyle = cols[0]; g.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (rnd() > density) continue; g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(x, y, 1, 1); }
};
registerTexture('kroll_shell', (g, n, rnd) => {
  speckle(['#9a4a26', '#8a3e20', '#aa5a30', '#7a3418'])(g, n, rnd);
  g.fillStyle = '#c8741e';
  for (let i = 0; i < n; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 2, 1); // Rostflecken
  g.fillStyle = '#4a2410';
  for (let x = 3; x < n; x += 7) g.fillRect(x, 0, 1, n);
});
registerTexture('kroll_kessel', (g, n, rnd) => {
  speckle(['#4a4a50', '#3e3e44', '#56565c', '#34343a'])(g, n, rnd);
  g.fillStyle = '#8a4a20';
  for (let x = 0; x < n; x += 3) g.fillRect(x, (rnd() * 4) | 0, 1, 5 + ((rnd() * 8) | 0)); // Rostschlieren
  g.fillStyle = '#1e1e22';
  for (let y = 4; y < n; y += 8) g.fillRect(0, y, n, 1);
  g.fillStyle = '#a0a0a8';
  for (let x = 1; x < n; x += 4) g.fillRect(x, 5, 1, 1); // Nieten
});
registerTexture('kroll_claw', (g, n, rnd) => {
  speckle(['#b4602a', '#a4521e', '#c4703a', '#8a4418'])(g, n, rnd);
  g.fillStyle = '#d8d0c0';
  for (let y = 0; y < 3; y++) g.fillRect(0, y, n, 1); // blanke Kanten
});
registerTexture('kroll_belly', speckle(['#a89070', '#98805e', '#b8a080']));
registerTexture('kroll_pipe', (g, n, rnd) => { speckle(['#70604a', '#60503c', '#80705a'])(g, n, rnd); g.fillStyle = '#2a2a2e'; g.fillRect(0, 7, n, 2); });

/**
 * Procedural Kroll: Kesselkrebs. Facing +z. Parts: kesselpanzer (Rueckenkessel), scherenL/R, augen (Stiele), beine, koerper.
 * Pose keys (MREST): legL/legR leg swing, neck = Scheren heben (rad), jaw = Scheren offen (deg), wing = linke Schere nach innen,
 * headYaw = rechte Schere nach innen, spread = beide Scheren nach aussen, head = Augenstiele nicken, bodyY/Pitch/Roll wie sonst.
 */
export function buildKroll({ scale = SC } = {}) {
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  root.add(g);
  const partMeshes = { kesselpanzer: [], scherenL: [], scherenR: [], augen: [], beine: [], koerper: [] };
  const mats = {};
  const mat = (part, t) => (mats[part + t] ??= lambert({ map: tex(t, { size: 16 }) }));
  const addG = (part, geo, m, parent, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    parent.add(mesh);
    partMeshes[part].push(mesh);
    return mesh;
  };
  const add = (part, w, h, d, m, parent, x, y, z, rx = 0, ry = 0, rz = 0) => addG(part, new THREE.BoxGeometry(w, h, d), m, parent, x, y, z, rx, ry, rz);
  const cyl = (part, rt, rb, h, seg, m, parent, x, y, z, rx = 0, ry = 0, rz = 0) => addG(part, new THREE.CylinderGeometry(rt, rb, h, seg), m, parent, x, y, z, rx, ry, rz);

  const BASE = 0.95;
  const body = new THREE.Group();
  body.position.y = BASE;
  g.add(body);
  // Rumpf: breite flache Krebsschale + Bauch + Front-/Heckkante
  add('koerper', 2.2, 0.7, 1.9, mat('koerper', 'kroll_shell'), body, 0, 0, 0);
  add('koerper', 1.8, 0.4, 1.5, mat('koerper', 'kroll_belly'), body, 0, -0.5, 0);
  add('koerper', 2.5, 0.3, 0.7, mat('koerper', 'kroll_shell'), body, 0, -0.05, 0.85, -0.25); // Stirnkante
  add('koerper', 1.9, 0.35, 0.6, mat('koerper', 'kroll_shell'), body, 0, 0, -0.95, 0.2); // Heck
  for (const sx of [1, -1]) add('koerper', 0.5, 0.45, 1.5, mat('koerper', 'kroll_shell'), body, sx * 1.15, 0.05, 0, 0, 0, sx * 0.25); // Flanken-Stacheln

  // Kessel-Rueckenpanzer (brechbar): Zylinder mit Nietbaendern, Ventilen, Schornstein
  const kessel = new THREE.Group();
  kessel.position.set(0, 0.35, -0.2);
  body.add(kessel);
  const kt = mat('kesselpanzer', 'kroll_kessel');
  const kesselMeshes = [];
  kesselMeshes.push(cyl('kesselpanzer', 0.85, 0.95, 1.0, 8, kt, kessel, 0, 0.5, 0));
  kesselMeshes.push(cyl('kesselpanzer', 0.5, 0.85, 0.35, 8, kt, kessel, 0, 1.15, 0)); // Kuppel
  for (const y of [0.15, 0.85]) kesselMeshes.push(cyl('kesselpanzer', 1.0, 1.0, 0.1, 8, mat('kesselpanzer', 'kroll_shell'), kessel, 0, y, 0)); // Nietbaender
  const pipeM = mat('kesselpanzer', 'kroll_pipe');
  const ventPos = [[0.55, 1.15, 0.2], [-0.5, 1.1, 0.35], [0.0, 1.0, -0.65]];
  for (const [x, y, z] of ventPos) {
    kesselMeshes.push(cyl('kesselpanzer', 0.1, 0.12, 0.5, 6, pipeM, kessel, x, y + 0.25, z));
    kesselMeshes.push(cyl('kesselpanzer', 0.17, 0.17, 0.08, 6, kt, kessel, x, y + 0.52, z));
  }
  kesselMeshes.push(cyl('kesselpanzer', 0.2, 0.28, 0.8, 6, pipeM, kessel, 0, 1.55, 0.05)); // Schornstein
  kesselMeshes.push(cyl('kesselpanzer', 0.3, 0.3, 0.1, 6, kt, kessel, 0, 1.97, 0.05));
  // Phase 2: offener, gluehender Kesselkern an der Stelle des Panzers
  const coreM = basic({ color: '#ff7a2a' });
  const core = cyl('koerper', 0.6, 0.7, 0.3, 8, coreM, kessel, 0, 0.1, 0);
  core.visible = false;
  const crater = cyl('koerper', 0.95, 1.0, 0.25, 8, mat('koerper', 'kroll_shell'), kessel, 0, 0.05, 0);
  crater.visible = false;

  // Augenstiele
  const eyeM = basic({ color: '#ffb030' });
  const eyes = {};
  for (const [name, sx] of [['eyeL', 1], ['eyeR', -1]]) {
    const st = new THREE.Group();
    st.position.set(sx * 0.4, 0.3, 0.8);
    body.add(st);
    add('augen', 0.14, 0.7, 0.14, mat('augen', 'kroll_claw'), st, 0, 0.35, 0.05, 0.25, 0, sx * -0.12);
    add('augen', 0.3, 0.3, 0.3, eyeM, st, 0, 0.72, 0.17);
    eyes[name] = st;
  }

  // Scheren: Oberarm -> Unterarm -> Zange (fester Finger + beweglicher Finger)
  const arms = {}, claws = {}, fingers = {};
  for (const [side, sx, part] of [['L', 1, 'scherenL'], ['R', -1, 'scherenR']]) {
    const arm = new THREE.Group();
    arm.position.set(sx * 1.15, 0.0, 0.7);
    body.add(arm);
    const cm = mat(part, 'kroll_claw');
    add(part, 0.45, 0.45, 1.0, cm, arm, sx * 0.1, 0, 0.5);
    const fore = new THREE.Group();
    fore.position.set(sx * 0.15, 0, 1.0);
    arm.add(fore);
    add(part, 0.4, 0.4, 0.9, cm, fore, sx * 0.1, 0, 0.4);
    const claw = new THREE.Group();
    claw.position.set(sx * 0.1, 0, 0.85);
    fore.add(claw);
    add(part, 0.95, 0.6, 0.9, cm, claw, 0, 0, 0.35); // Handballen
    add(part, 0.34, 0.34, 0.95, cm, claw, -sx * 0.28, 0, 1.15); // fester Finger (innen)
    const fin = new THREE.Group();
    fin.position.set(sx * 0.2, 0, 0.7);
    claw.add(fin);
    add(part, 0.34, 0.34, 0.95, cm, fin, sx * 0.08, 0, 0.45); // beweglicher Finger (aussen)
    add(part, 0.15, 0.15, 0.3, mat(part, 'kroll_belly'), fin, sx * 0.08, 0, 0.95);
    arms[side] = arm; claws[side] = claw; fingers[side] = { fin, sx };
  }

  // Beine: 4 pro Seite
  const legs = {};
  for (const [name, sx] of [['legL', 1], ['legR', -1]]) {
    const l = new THREE.Group();
    l.position.set(sx * 1.05, -0.2, 0);
    body.add(l);
    const m = mat('beine', 'kroll_claw');
    for (const z of [0.6, 0.15, -0.3, -0.75]) {
      add('beine', 0.9, 0.2, 0.22, m, l, sx * 0.4, -0.1, z, 0, 0, sx * -0.3);
      add('beine', 0.2, 0.9, 0.2, m, l, sx * 0.85, -0.6, z, 0, 0, sx * 0.15);
    }
    legs[name] = l;
  }

  const nodes = { body, kessel, legL: legs.legL, legR: legs.legR, armL: arms.L, armR: arms.R, clawL: claws.L, clawR: claws.R, eyeL: eyes.eyeL, eyeR: eyes.eyeR, root: g };
  return {
    root, nodes, partMeshes,
    extra: { kesselMeshes, core, crater, coreM, eyeMat: eyeM, ventPos },
    apply(p) {
      body.position.y = BASE + p.bodyY / scale;
      body.rotation.set(p.bodyPitch * R, 0, p.bodyRoll * R);
      for (const e of [eyes.eyeL, eyes.eyeR]) e.rotation.set(p.head * R * 0.5, 0, 0);
      arms.L.rotation.set(-p.neck, (-p.wing + p.spread) * R, 0);
      arms.R.rotation.set(-p.neck, (p.headYaw - p.spread) * R, 0);
      for (const k of ['L', 'R']) fingers[k].fin.rotation.y = fingers[k].sx * p.jaw * R;
      legs.legL.rotation.x = -p.legL * R * 0.5;
      legs.legR.rotation.x = -p.legR * R * 0.5;
    },
  };
}

// ======================================================= Zustand (Panzer)
const SPEED_P2 = 1.25;

/** Panzerbruch = Phase 2: Kessel weg, +25 % Tempo, Special Krabbensprung. Visuals auf jedem Client, Logik nur Host. */
function applyPhase2(m) {
  if (m.p2) return;
  m.p2 = true;
  for (const mesh of m.extra.kesselMeshes) mesh.visible = false;
  m.extra.core.visible = true; m.extra.crater.visible = true;
  let proto = Object.getPrototypeOf(m), base = null;
  while (proto && !base) { base = Object.getOwnPropertyDescriptor(proto, 'speedMul')?.get; proto = Object.getPrototypeOf(proto); }
  if (base) Object.defineProperty(m, 'speedMul', { configurable: true, get() { return base.call(this) * SPEED_P2; } });
  m.partById.koerper.factor = 0.9;
  m.partById.kesselpanzer.factor = 0.9;
  m.ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 3, z: m.pos.z }, 36, '#ff8a30', 8);
  m.ctx.fx.shake(0.3, 0.3);
  m.ctx.bus.emit('monsterPhase', { monster: m, idx: 1, name: 'Panzer ab', cue: '#ff8a30' });
  if (m.authority) { m.queued = null; m.phaseT = 1.2; m.phaseSpecial = 'kroll_sprung'; }
}

// ======================================================= Angriffe
const sideDir = (a) => { // Seite der Ramme: zum Ziel hin, sonst per Seed
  const lx = (a.target.x - a.origin.x) * Math.cos(a.yaw0) - (a.target.z - a.origin.z) * Math.sin(a.yaw0);
  return Math.abs(lx) > 1.5 ? Math.sign(lx) : (a.r(0) < 0.5 ? 1 : -1);
};

// ---- 1. Scherenzange: 2 Hiebe (links, rechts), je 22
const zange = {
  id: 'kroll_zange', range: [0, 8], weight: 6, cooldown: 2.5, telegraph: 0.55, flashParts: ['scherenL', 'scherenR'], duration: 2.0, stam: 4, cue: { color: '#ffd84a', tone: 'klick' }, audit: [3, 6],
  hits: [
    { t0: 0.58, t1: 0.8, shape: 'capsule', from: [3.4, 1.4, 3.4], to: [-0.4, 1.4, 4.4], radius: 1.4, dmg: 22, knock: 'flinch' },
    { t0: 1.02, t1: 1.24, shape: 'capsule', from: [-3.4, 1.4, 3.4], to: [0.4, 1.4, 4.4], radius: 1.4, dmg: 22, knock: 'flinch' },
  ],
  motion(tau, a) { const k = smooth(clamp01((tau - 0.45) / 0.15)) * 0.6; return { x: a.origin.x + a.dir.x * k, z: a.origin.z + a.dir.z * k }; },
  pose: mTrack([
    [0, {}], [0.5, { neck: 0.5, jaw: 55, spread: 25, bodyPitch: -4 }], [0.56, { neck: 0.5, jaw: 55, spread: 25, bodyPitch: -4 }],
    [0.72, { neck: 0.35, jaw: 0, spread: 0, wing: 60 }, 'lin'], [0.95, { neck: 0.5, jaw: 55, spread: 25, wing: 0 }], [1.0, { neck: 0.5, jaw: 55, spread: 25 }],
    [1.14, { neck: 0.35, jaw: 0, spread: 0, headYaw: 60 }, 'lin'], [1.5, { neck: 0.2, jaw: 20 }], [2.0, {}],
  ]),
};

// ---- 2. Seitrammer: Beine stemmen, rast 12 m seitwaerts (ganze Breitseite), 28 Schaden, wirft um
const RAMM_LEN = 12;
const seitrammer = {
  id: 'kroll_seitrammer', range: [2, 16], weight: 4, cooldown: 6, telegraph: 0.6, flashParts: ['beine'], duration: 2.5, stam: 14, cue: { color: '#ff8a30', tone: 'droehn' }, audit: [2, 5],
  marker: { at: 'landing', radius: 3 }, markerUntil: 1.9,
  prepare(a) {
    a.side = sideDir(a);
    a.sx = Math.cos(a.yaw0) * a.side; a.sz = -Math.sin(a.yaw0) * a.side; // lokales +x = Welt (cos, -sin)
    a.landing = { x: a.origin.x + a.sx * RAMM_LEN, z: a.origin.z + a.sz * RAMM_LEN };
  },
  hits: [{ t0: 0.75, t1: 1.6, shape: 'capsule', from: [-2.9, 1.4, 0.3], to: [2.9, 1.4, 0.3], radius: 1.8, dmg: 28, knock: 'down' }],
  events: [{ t: 0.2, call: 'dust', all: true }, { t: 0.45, call: 'dust', all: true }, { t: 0.75, call: 'dust', all: true }, { t: 1.1, call: 'dust', all: true }],
  calls: {
    dust(m) { for (const sx of [-1, 1]) m.ctx.fx.spark({ x: m.pos.x + Math.cos(m.rot) * sx * 2.8, y: m.pos.y + 0.3, z: m.pos.z - Math.sin(m.rot) * sx * 2.8 }, 6, '#a08a60', 3); },
  },
  motion(tau, a) {
    const k = clamp01((tau - 0.6) / 0.95);
    const e = k * 0.75 + smooth(k) * 0.25;
    return { x: a.origin.x + a.sx * RAMM_LEN * e, z: a.origin.z + a.sz * RAMM_LEN * e };
  },
  pose: mTrack([
    [0, {}], [0.3, { bodyY: -0.2, legL: 25, legR: -25, bodyRoll: 4, neck: 0.3, jaw: 20 }], [0.58, { bodyY: -0.3, legL: -25, legR: 25, bodyRoll: 6, neck: 0.3, jaw: 20 }],
    [0.75, { bodyY: -0.25, legL: 45, legR: -45, bodyRoll: -4 }, 'lin'], [1.0, { bodyY: -0.25, legL: -45, legR: 45 }, 'lin'], [1.3, { bodyY: -0.25, legL: 45, legR: -45 }, 'lin'],
    [1.6, { bodyY: -0.15, legL: -20, legR: 20 }], [2.0, { bodyY: -0.05, neck: 0.1 }], [2.5, {}],
  ]),
};

// ---- 3. Dampfstoss: Kessel gluehend + Pfeifen, Dampfkegel 8 m, 2 s lang, 8 Schaden / 0,25 s + Rost
const DAMPF_TICKS = 8;
const dampf = {
  id: 'kroll_dampf', range: [0, 14], weight: 3, cooldown: 9, telegraph: 0.8, flashParts: ['kesselpanzer', 'koerper'], duration: 3.7, stam: 8, tempo: 1.1, cue: { color: '#e8f0f4', tone: 'zisch' }, audit: [3, 6],
  marker: { at: 'landing', radius: 3.6 }, markerUntil: 2.9,
  prepare(a) { a.landing = { x: a.origin.x + a.dir.x * 5, z: a.origin.z + a.dir.z * 5 }; },
  hits: Array.from({ length: DAMPF_TICKS }, (_, i) => ({
    t0: 0.8 + i * 0.25, t1: 0.8 + i * 0.25 + 0.2, shape: 'capsule', from: [0, 1.4, 1.8], to: [0, 1.4, 8.0], radius: 2.0, dmg: 8, knock: 'none', status: { type: 'rost' },
  })),
  events: Array.from({ length: DAMPF_TICKS * 2 }, (_, i) => ({ t: 0.8 + i * 0.125, call: 'puff', all: true })),
  calls: {
    puff(m, ctx, inst) {
      for (let i = 0; i < 3; i++) {
        const d = 2 + inst.r(i + ((m.time * 7) | 0)) * 6, s = (inst.r(i + 5) - 0.5) * 0.35 * d;
        ctx.fx.spark({ x: m.pos.x + Math.sin(m.rot) * d + Math.cos(m.rot) * s, y: m.pos.y + 1.4, z: m.pos.z + Math.cos(m.rot) * d - Math.sin(m.rot) * s }, 3, '#e8f0f4', 2.5);
      }
    },
  },
  pose: mTrack([
    [0, {}], [0.4, { bodyY: -0.15, bodyPitch: 5, jaw: 40, neck: 0.2, bodyRoll: 3 }], [0.78, { bodyY: -0.2, bodyPitch: 6, jaw: 40, neck: 0.2, bodyRoll: -3 }],
    [1.0, { bodyY: -0.2, bodyPitch: 8, bodyRoll: 3 }, 'lin'], [1.3, { bodyRoll: -3 }, 'lin'], [1.6, { bodyRoll: 3 }, 'lin'], [1.9, { bodyRoll: -3 }, 'lin'], [2.2, { bodyRoll: 3 }, 'lin'], [2.5, { bodyRoll: -3 }, 'lin'],
    [2.9, { bodyY: -0.1, bodyPitch: 3, bodyRoll: 0 }], [3.7, {}],
  ]),
};

// ---- 4. Kesseldruck (nur Phase 1): Zittern + Ventile pfeifen, Explosion 7 m um ihn, 35. Direkt unter ihm = sicher.
const RING = 10, RING_R = 4.8, RING_S = 2.6;
const druck = {
  id: 'kroll_druck', range: [0, 9], weight: 3, cooldown: 10, telegraph: 1.0, flashParts: ['kesselpanzer'], duration: 2.8, stam: 10, tempo: 1.0, cue: { color: '#ff4a4a', tone: 'schrill' }, audit: [4, 6],
  lockedByBreak: 'kesselpanzer',
  marker: { at: 'self', radius: 7.2 }, markerUntil: 1.3,
  // Ring aus Kugeln (innen ~2,2 m frei = unter ihm sicher); alle melden idx 0, damit Ueberlappungen nicht doppelt treffen
  hits: Array.from({ length: RING }, (_, i) => ({
    t0: 1.0, t1: 1.15, shape: 'sphere', at: [Math.sin((i / RING) * Math.PI * 2) * RING_R, 0.6, Math.cos((i / RING) * Math.PI * 2) * RING_R], radius: RING_S, dmg: 35, knock: 'down',
  })),
  prepare(a) {
    const base = AttackInstance.prototype.hitsAt;
    a.hitsAt = function hitsAt(t) { return base.call(this, t).map((h) => ({ ...h, idx: 0, key: `${this.key}:0` })); };
  },
  events: [{ t: 0.4, call: 'vent', all: true }, { t: 0.7, call: 'vent', all: true }, { t: 1.0, call: 'boom', all: true }],
  calls: {
    vent(m, ctx) {
      for (const [x, y, z] of m.extra.ventPos) ctx.fx.spark({ x: m.pos.x + Math.sin(m.rot) * (z * SC) + Math.cos(m.rot) * (x * SC), y: m.pos.y + (y + 1.3) * SC, z: m.pos.z + Math.cos(m.rot) * (z * SC) - Math.sin(m.rot) * (x * SC) }, 4, '#e8f0f4', 3);
    },
    boom(m, ctx) {
      ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 1, z: m.pos.z }, 60, '#ffb050', 12);
      ctx.fx.shake(0.55, 0.4);
      ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos });
    },
  },
  pose: mTrack([
    [0, {}], [0.3, { bodyY: -0.1, bodyRoll: 3, neck: 0.2 }], [0.45, { bodyY: -0.1, bodyRoll: -3 }, 'lin'], [0.6, { bodyRoll: 3 }, 'lin'], [0.75, { bodyRoll: -3 }, 'lin'], [0.9, { bodyY: -0.15, bodyRoll: 3 }, 'lin'],
    [1.0, { bodyY: 0.35, bodyPitch: -6, spread: 30, jaw: 50, neck: 0.5 }, 'lin'], [1.4, { bodyY: 0.1, spread: 15, jaw: 30 }], [2.8, {}],
  ]),
};

// ---- 5. Scherenwirbel (Phase 2): 3 Drehungen mit ausgestreckten Scheren, je 18
const SPIN = 0.65;
const wirbel = {
  id: 'kroll_wirbel', range: [0, 7], weight: 4, cooldown: 7, telegraph: 0.6, flashParts: ['scherenL', 'scherenR'], duration: 3.3, stam: 12, cue: { color: '#c070ff', tone: 'klick' }, audit: [3, 5],
  needsBroken: 'kesselpanzer',
  hits: [0, 1, 2].map((i) => ({ t0: 0.6 + i * SPIN, t1: 0.6 + (i + 1) * SPIN - 0.05, shape: 'capsule', from: [-3.5, 1.3, 0.4], to: [3.5, 1.3, 0.4], radius: 1.2, dmg: 18, knock: 'flinch' })),
  motion(tau, a) {
    const dir = a.r(0) < 0.5 ? 1 : -1;
    return { yaw: a.yaw0 + dir * (-0.4 * smooth(clamp01(tau / 0.6)) + (Math.PI * 6 + 0.4) * clamp01((tau - 0.6) / (3 * SPIN))) };
  },
  pose: mTrack([
    [0, {}], [0.5, { neck: 0.15, jaw: 70, spread: 60, bodyY: -0.1 }], [0.6, { neck: 0.15, jaw: 70, spread: 60, bodyY: -0.1 }], [2.6, { neck: 0.15, jaw: 70, spread: 60, bodyY: -0.1 }],
    [2.9, { neck: 0.1, jaw: 30, spread: 20 }], [3.3, {}],
  ]),
};

// ---- 6. Krabbensprung (Phase 2): springt aufs Ziel (30), bleibt 1,5 s stecken = Strafe-Fenster
const STUCK = 1.5;
const sprung = {
  id: 'kroll_sprung', range: [4, 16], weight: 3, cooldown: 12, telegraph: 0.8, flashParts: ['beine', 'koerper'], duration: 3.7, stam: 14, tempo: 1.1, cue: { color: '#5ac8ff', tone: 'brumm' }, audit: [6, 10],
  needsBroken: 'kesselpanzer', punishWindow: STUCK,
  marker: { at: 'landing', radius: 4.2 }, markerUntil: 2.2,
  prepare(a) {
    const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz) || 1, len = Math.min(d, 15);
    a.aimYaw = Math.atan2(dx, dz);
    a.turn = wrapAngle(a.aimYaw - a.yaw0);
    a.jx = (dx / d) * len; a.jz = (dz / d) * len;
    a.landing = { x: a.origin.x + a.jx, z: a.origin.z + a.jz };
  },
  hits: [{ t0: 1.55, t1: 1.7, shape: 'sphere', at: [0, 0.6, 0], radius: 4.0, dmg: 30, knock: 'down' }],
  events: [{ t: 1.55, call: 'land', all: true }],
  calls: {
    land(m, ctx) {
      ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 0.4, z: m.pos.z }, 40, '#8a7a5a', 9);
      ctx.fx.shake(0.5, 0.4);
      ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos });
    },
  },
  motion(tau, a) {
    const k = clamp01((tau - 0.8) / 0.75);
    return { x: a.origin.x + a.jx * smooth(k), z: a.origin.z + a.jz * smooth(k), yaw: a.yaw0 + a.turn * smooth(clamp01(tau / 0.7)), air: Math.sin(k * Math.PI) * 5.5 };
  },
  pose: mTrack([
    [0, {}], [0.7, { bodyY: -0.5, legL: 40, legR: -40, neck: 0.3, jaw: 30 }], [0.8, { bodyY: -0.55, legL: 40, legR: -40, neck: 0.3, jaw: 30 }],
    [1.0, { bodyY: 0.2, bodyPitch: -12, legL: -30, legR: 30, neck: 0.6, jaw: 60, spread: 30 }], [1.4, { bodyPitch: 12, spread: 10, neck: 0.4 }],
    [1.6, { bodyY: -0.45, bodyPitch: 8, legL: 10, legR: 10, jaw: 0, spread: 0, neck: 0.1 }], [2.2, { bodyY: -0.45, bodyPitch: 14, bodyRoll: 6, neck: 0, legL: 25, legR: -25 }],
    [2.6, { bodyY: -0.45, bodyPitch: 14, bodyRoll: -6, legL: -25, legR: 25 }, 'lin'], [3.05, { bodyY: -0.4, bodyPitch: 12, bodyRoll: 5, legL: 25, legR: -25 }, 'lin'], [3.7, {}],
  ]),
};

// Grundtempo 1,2 (Rostwerke = schwerer als Schotterklamm); Dampf/Druck/Sprung setzen eigenes Tempo
for (const a of [zange, seitrammer, wirbel]) if (a.tempo === undefined) a.tempo = 1.2;

export const kroll = {
  id: 'kroll',
  name: 'Kroll',
  hp: 15000,
  scale: SC,
  bodyRadius: 3.0,
  walk: 5.6, run: 4.0, detect: 28, prefer: 7, turn: 0.8, // seitwaerts (walk: Strafe/Rueckzug) schnell, vorwaerts (run) langsam
  recoverAfter: (m) => (0.4 + m.rng() * 0.6) / m.speedMul,
  drops: ['kroll_panzer', 'kroll_schere', 'kroll_auge'],
  glitchSpots: ['kesselpanzer', 'scherenL', 'scherenR'],
  parts: [
    { id: 'kesselpanzer', label: 'Kesselpanzer', factor: 0.35, breakHp: 1400, jitter: 0.05, elem: { fire: 0, shock: 12 }, blunt: true,
      spheres: [{ node: 'kessel', offset: [0, 0.5, 0], r: 1.0 }, { node: 'kessel', offset: [0, 1.1, 0], r: 0.7 }] },
    { id: 'scherenL', label: 'Schere links', factor: 0.7, breakHp: 700, jitter: 0.07, elem: { fire: 5, shock: 12 },
      spheres: [{ node: 'clawL', offset: [0, 0, 0.6], r: 0.85 }, { node: 'armL', offset: [0, 0, 0.6], r: 0.55 }] },
    { id: 'scherenR', label: 'Schere rechts', factor: 0.7, breakHp: 700, jitter: 0.07, elem: { fire: 5, shock: 12 },
      spheres: [{ node: 'clawR', offset: [0, 0, 0.6], r: 0.85 }, { node: 'armR', offset: [0, 0, 0.6], r: 0.55 }] },
    { id: 'augen', label: 'Augenstiele', factor: 0.9, elem: { fire: 5, shock: 10 },
      spheres: [{ node: 'eyeL', offset: [0, 0.7, 0.15], r: 0.4 }, { node: 'eyeR', offset: [0, 0.7, 0.15], r: 0.4 }] },
    { id: 'beine', label: 'Beine', factor: 0.8, elem: { fire: 5, shock: 25 },
      spheres: [{ node: 'legL', offset: [0.5, -0.5, 0.4], r: 0.7 }, { node: 'legL', offset: [0.5, -0.5, -0.5], r: 0.7 }, { node: 'legR', offset: [-0.5, -0.5, 0.4], r: 0.7 }, { node: 'legR', offset: [-0.5, -0.5, -0.5], r: 0.7 }] },
    { id: 'koerper', label: 'Körper', factor: 0.6, elem: { fire: 5, shock: 15 },
      spheres: [{ node: 'body', offset: [0, 0, 0.3], r: 1.2 }, { node: 'body', offset: [0, 0, -0.6], r: 1.1 }] },
  ],
  attacks: { kroll_zange: zange, kroll_seitrammer: seitrammer, kroll_dampf: dampf, kroll_druck: druck, kroll_wirbel: wirbel, kroll_sprung: sprung },
  // Brocken 2.0
  teachAttack: 'kroll_zange', stamina: true, flinchDmg: true,
  chains: {
    kroll_zange: [{ atk: 'kroll_seitrammer', w: 3 }, { atk: 'kroll_wirbel', w: 3 }, { atk: 'kroll_dampf', w: 2 }, { atk: null, w: 3 }],
    kroll_seitrammer: [{ atk: 'kroll_zange', w: 3 }, { atk: 'kroll_dampf', w: 2 }, { atk: null, w: 1 }],
    kroll_dampf: [{ atk: 'kroll_druck', w: 3 }, { atk: 'kroll_zange', w: 2 }, { atk: null, w: 2 }],
    kroll_druck: [{ atk: 'kroll_zange', w: 2 }, { atk: null, w: 2 }],
    kroll_wirbel: [{ atk: 'kroll_zange', w: 2 }, { atk: 'kroll_seitrammer', w: 2 }, { atk: null, w: 2 }],
  },
  // HP-Phase bei 40 % "Siedehitze" (Special je nach Panzerzustand: Kesseldruck bzw. Scherenwirbel); Panzerbruch loest eigene Phase 2 aus (applyPhase2)
  phases: [{ at: 0.4, name: 'Siedehitze', cue: '#ff4a4a', special: 'kroll_druck', enter: (m) => {
    m.phaseSpecial = m.p2 ? 'kroll_wirbel' : 'kroll_druck';
    m.cds.kroll_druck = 0; m.cds.kroll_wirbel = 0;
  } }],
  build: () => buildKroll({ scale: SC }),
  init(m) { m.p2 = false; },
  onBreak(m, part) { if (part.id === 'kesselpanzer') applyPhase2(m); },
  onStatus(m, type) { if (type === 'blind') m.st.blind = Math.min(m.st.blind * 2, 8); }, // Blendknolle wirkt doppelt (Augenstiele)
  tick(m) {
    m.extra.eyeMat.color.set(m.st.blind > 0 ? '#2a2018' : m.rage ? '#ff3020' : '#ffb030');
    m.extra.coreM.color.set(m.attack?.id === 'kroll_dampf' ? '#ffffff' : '#ff7a2a');
  },
  snapExtra: (m) => ({ p2: !!m.p2 }),
  applyPhase2,
};
