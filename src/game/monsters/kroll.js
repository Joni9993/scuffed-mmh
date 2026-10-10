import * as THREE from 'three';
import { lambert, basic } from '../../render/ps1.js';
import { tex, registerTexture } from '../../render/textures.js';
import { mTrack } from './monster.js';
import { smooth, clamp01 } from './common.js';
import { AttackInstance } from './attack.js';
import { wrapAngle, stepAngle, yawOf } from '../../core/math.js';

const R = Math.PI / 180;
const IDLE_YAW = 26, GUARD_YAW = 6, IDLE_BEND = 62, GUARD_BEND = 100; // Grad: Boxer-Haltung / Deckung
const SC = 1.9; // Owner-Feedback Okt 2026: war 2,6 = zu gross (Hang-Glitches, clunky)

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
 * Grundhaltung = Boxer-Stellung: Oberarme angehoben + leicht nach aussen, Unterarme nach innen angewinkelt (Scheren vor der Brust).
 * Pose keys (MREST) additiv dazu: legL/legR leg swing, neck = Scheren heben (rad), jaw = Scheren offen (deg), wing = linke Schere nach innen,
 * headYaw = rechte Schere nach innen, spread = beide Scheren nach aussen, tailPitch = Unterarme strecken (deg, 0 = angewinkelt),
 * head = Augenstiele nicken, bodyY/Pitch/Roll wie sonst. Extra-Key guard (0..1, per poseHook) = Panzerdeckung: Scheren vor das Gesicht.
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
  const arms = {}, forearms = {}, claws = {}, fingers = {};
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
    arms[side] = arm; forearms[side] = fore; claws[side] = claw; fingers[side] = { fin, sx };
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
      const gd = p.guard || 0;
      body.position.y = BASE + p.bodyY / scale - 0.12 * gd;
      body.rotation.set(p.bodyPitch * R, 0, p.bodyRoll * R);
      for (const e of [eyes.eyeL, eyes.eyeR]) e.rotation.set(p.head * R * 0.5 + 0.7 * gd, 0, 0); // Augenstiele ducken sich in der Deckung
      const lift = 0.42 + 0.34 * gd, yaw = IDLE_YAW + (GUARD_YAW - IDLE_YAW) * gd; // Oberarm: hoch + aussen
      const bend = Math.max(0, IDLE_BEND + (GUARD_BEND - IDLE_BEND) * gd - p.tailPitch); // Unterarm nach innen
      arms.L.rotation.set(-lift - p.neck, (-p.wing + p.spread + yaw) * R, 0);
      arms.R.rotation.set(-lift - p.neck, (p.headYaw - p.spread - yaw) * R, 0);
      forearms.L.rotation.y = -bend * R; forearms.R.rotation.y = bend * R;
      for (const k of ['L', 'R']) fingers[k].fin.rotation.y = fingers[k].sx * (p.jaw + 8) * R;
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

// ======================================================= Gelaende (Hang-Fix)
// Ursache des "Den-Huegel-runter-Glitchens": Seitrammer (12 m) und Krabbensprung (15 m) liefen als reine Funktion der Startparameter
// geradeaus durch Klippen/Huegel. Danach schob world.collide() den Koerper entlang des SDF-Gradienten (bis 1,5 m je Durchgang, 3 Durchgaenge)
// und heightAt() setzte y neu: sichtbarer Sprung um mehrere Meter und bis zu 15 m Hoehe. Jetzt kuerzt jeder Angriff mit Bewegung seine Strecke
// in prepare() auf das, was begehbar ist (deterministisch, gleiche Welt auf jedem Client).
let WORLD = null;
const CLEAR = 1.5; // m Abstand zu Klippe/Kollider, den der Koerper (bodyRadius 2,2 * 0,5..0,6 beim Kollidieren) braucht

/** Laenge (<= want) entlang (dx,dz) ab (ox,oz), die ohne Klippe/Kollider begehbar bleibt. Ohne Layout (Testarena) = want. */
function safeLen(ox, oz, dx, dz, want) {
  const L = WORLD?.layout;
  if (!L?.sdfAt) return want;
  let ok = 0;
  for (let s = 0.75; s < want + 0.74; s += 0.75) {
    const d = Math.min(s, want), x = ox + dx * d, z = oz + dz * d;
    if (L.sdfAt(x, z) < CLEAR || (L.clearOfColliders && !L.clearOfColliders(x, z, CLEAR))) break;
    ok = d;
    if (d >= want) break;
  }
  return ok;
}

// ======================================================= Panzerdeckung
const HEAT_ON = 0.045, HEAT_DECAY = 0.012; // Anteil der Max-HP: frontaler Schaden-Stau, ab dem er sich eingraebt / Abbau je s
const FRONT_COS = 0.45;                    // frontal = Angreifer innerhalb ~63 Grad vor der Blickrichtung
const GUARD_DMG = 0.2;                     // frontale Treffer in der Deckung: 20 %

const guardUp = (m) => {
  const a = m.attack;
  if (a?.id !== 'kroll_deckung') return false;
  const tau = a.inst.sample(a.t).tau;
  return tau >= a.inst.def.telegraph && tau < 2.9;
};

/** Wrapper um applyDamage (nur Kroll): frontaler Schaden staut Hitze, in der Deckung prallt er ab und loest den Konter aus. Seite/Ruecken voll. */
function guardFilter(m, res) {
  if (!m.alive || res.env || res.revier || res.attackerId === 'net' || res.attackerId === 'pred') return res;
  const src = res.from ?? m.ctx.players.find((p) => p.id === res.attackerId)?.pos ?? m.target?.pos;
  if (!src) return res;
  const dx = src.x - m.pos.x, dz = src.z - m.pos.z, l = Math.hypot(dx, dz) || 1;
  if ((dx * Math.sin(m.rot) + dz * Math.cos(m.rot)) / l < FRONT_COS) return res; // Flanke / Ruecken: voll verwundbar
  m.heat += res.dmg;
  if (!guardUp(m)) return res;
  res.dmg = Math.max(1, Math.round(res.dmg * GUARD_DMG));
  res.elemDmg = Math.round((res.elemDmg ?? 0) * GUARD_DMG);
  res.blunt = 0; res.rostBuild = 0; res.partDmgMul = (res.partDmgMul ?? 1) * 0.25; res.guarded = true;
  m.ctx.fx.spark({ x: m.pos.x + Math.sin(m.rot) * 2.2, y: m.pos.y + 1.6, z: m.pos.z + Math.cos(m.rot) * 2.2 }, 12, '#d8e4ee', 6);
  m.ctx.bus.emit('sfx', { name: 'hit', pos: m.pos });
  if (m.authority) m.guardCounter = true;
  return res;
}

// ======================================================= Angriffe
const sideDir = (a) => { // Seite der Ramme: zum Ziel hin, sonst per Seed
  const lx = (a.target.x - a.origin.x) * Math.cos(a.yaw0) - (a.target.z - a.origin.z) * Math.sin(a.yaw0);
  return Math.abs(lx) > 1.5 ? Math.sign(lx) : (a.r(0) < 0.5 ? 1 : -1);
};

/** Zielt waehrend des Telegraphs exakt auf die Startposition des Ziels (rein aus Startparametern, deterministisch). */
const aimPrep = (a, len) => {
  const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz);
  if (d < 1) { a.turn = 0; a.ax = a.dir.x; a.az = a.dir.z; } else { a.turn = wrapAngle(Math.atan2(dx, dz) - a.yaw0); a.ax = Math.sin(a.yaw0 + a.turn); a.az = Math.cos(a.yaw0 + a.turn); }
  a.len = safeLen(a.origin.x, a.origin.z, a.ax, a.az, len);
};
const aimYaw = (tau, a, dur = 0.45) => a.yaw0 + a.turn * smooth(clamp01(tau / dur));

// ---- 1. Scherenzange: 2 Hiebe (links, rechts), je 26; holt sichtbar aus (Scheren auf, zurueck), kleiner Ausfallschritt
const WIND = { neck: 0.35, spread: 38, tailPitch: 25, jaw: 55, bodyPitch: -5, bodyY: -0.1 };
const zange = {
  id: 'kroll_zange', range: [0, 8], weight: 6, cooldown: 1.6, telegraph: 0.65, flashParts: ['scherenL', 'scherenR'], duration: 2.0, stam: 3, cue: { color: '#ffd84a', tone: 'klick' }, audit: [3, 6],
  hits: [
    { t0: 0.68, t1: 0.9, shape: 'capsule', from: [2.5, 1.1, 2.3], to: [-0.4, 1.1, 3.5], radius: 1.25, dmg: 26, knock: 'flinch' },
    { t0: 1.14, t1: 1.36, shape: 'capsule', from: [-2.5, 1.1, 2.3], to: [0.4, 1.1, 3.5], radius: 1.25, dmg: 26, knock: 'flinch' },
  ],
  prepare(a) { aimPrep(a, 1.1); },
  motion(tau, a) { const k = smooth(clamp01((tau - 0.5) / 0.15)) * a.len; return { x: a.origin.x + a.ax * k, z: a.origin.z + a.az * k, yaw: aimYaw(tau, a) }; },
  pose: mTrack([
    [0, {}], [0.55, WIND], [0.64, WIND],
    [0.7, { neck: 0.2, spread: 0, tailPitch: 65, jaw: 0, wing: 75, bodyPitch: 4, bodyY: 0 }, 'lin'], [1.0, WIND], [1.1, WIND],
    [1.16, { neck: 0.2, spread: 0, tailPitch: 65, jaw: 0, wing: 0, headYaw: 75, bodyPitch: 4, bodyY: 0 }, 'lin'], [1.6, { neck: 0.1, jaw: 20 }], [2.0, {}],
  ]),
};

// ---- 2. Seitrammer: Beine stemmen, rast bis 12 m seitwaerts (Breitseite), 32 Schaden, wirft um. Strecke wird am Gelaende gekuerzt.
const RAMM_LEN = 12;
const seitrammer = {
  id: 'kroll_seitrammer', range: [2, 10], weight: 4, cooldown: 4.5, telegraph: 0.6, flashParts: ['beine'], duration: 2.3, stam: 9, cue: { color: '#ff8a30', tone: 'droehn' }, audit: [2, 5],
  marker: { at: 'landing', radius: 2.4 }, markerUntil: 1.7,
  prepare(a) {
    a.side = sideDir(a);
    const run = (side) => {
      const sx = Math.cos(a.yaw0) * side, sz = -Math.sin(a.yaw0) * side; // lokales +x = Welt (cos, -sin)
      return { side, sx, sz, len: safeLen(a.origin.x, a.origin.z, sx, sz, RAMM_LEN) };
    };
    let best = run(a.side);
    if (best.len < 6) { const o = run(-a.side); if (o.len > best.len) best = o; } // zur Zielseite blockiert -> andere Seite
    a.side = best.side; a.sx = best.sx; a.sz = best.sz; a.len = best.len;
    a.landing = { x: a.origin.x + a.sx * a.len, z: a.origin.z + a.sz * a.len };
  },
  hits: [{ t0: 0.75, t1: 1.5, shape: 'capsule', from: [-2.3, 1.1, 0.3], to: [2.3, 1.1, 0.3], radius: 1.5, dmg: 32, knock: 'down' }],
  events: [{ t: 0.2, call: 'dust', all: true }, { t: 0.45, call: 'dust', all: true }, { t: 0.75, call: 'dust', all: true }, { t: 1.1, call: 'dust', all: true }],
  calls: {
    dust(m) { for (const sx of [-1, 1]) m.ctx.fx.spark({ x: m.pos.x + Math.cos(m.rot) * sx * 2.2, y: m.pos.y + 0.3, z: m.pos.z - Math.sin(m.rot) * sx * 2.2 }, 6, '#a08a60', 3); },
  },
  motion(tau, a) {
    const k = clamp01((tau - 0.6) / 0.85);
    const e = k * 0.75 + smooth(k) * 0.25;
    return { x: a.origin.x + a.sx * a.len * e, z: a.origin.z + a.sz * a.len * e };
  },
  pose: mTrack([
    [0, {}], [0.3, { bodyY: -0.2, legL: 25, legR: -25, bodyRoll: 4, neck: 0.3, jaw: 20 }], [0.58, { bodyY: -0.3, legL: -25, legR: 25, bodyRoll: 6, neck: 0.3, jaw: 20 }],
    [0.75, { bodyY: -0.25, legL: 45, legR: -45, bodyRoll: -4 }, 'lin'], [1.0, { bodyY: -0.25, legL: -45, legR: 45 }, 'lin'], [1.3, { bodyY: -0.25, legL: 45, legR: -45 }, 'lin'],
    [1.5, { bodyY: -0.15, legL: -20, legR: 20 }], [1.8, { bodyY: -0.05, neck: 0.1 }], [2.3, {}],
  ]),
};

// ---- 3. Dampfstrahl: Kessel gluehend + Pfeifen, langer Dampfstrahl (10 m), 2 s lang, 10 Schaden / 0,25 s + Rost. Fernangriff: haelt auf Abstand unter Druck.
const DAMPF_TICKS = 8;
const dampf = {
  id: 'kroll_dampf', range: [0, 13], weight: (m, d) => (d > 8 ? 9 : 3), cooldown: 8, telegraph: 0.8, flashParts: ['kesselpanzer', 'koerper'], duration: 3.4, stam: 6, tempo: 1.15, cue: { color: '#e8f0f4', tone: 'zisch' }, audit: [3, 6, 11],
  marker: { at: 'landing', radius: 3.0 }, markerUntil: 2.7,
  prepare(a) { a.landing = { x: a.origin.x + a.dir.x * 8, z: a.origin.z + a.dir.z * 8 }; },
  hits: Array.from({ length: DAMPF_TICKS }, (_, i) => ({
    t0: 0.8 + i * 0.25, t1: 0.8 + i * 0.25 + 0.2, shape: 'capsule', from: [0, 1.1, 1.5], to: [0, 1.1, 11.0], radius: 1.6, dmg: 10, knock: 'none', status: { type: 'rost' },
  })),
  events: Array.from({ length: DAMPF_TICKS * 2 }, (_, i) => ({ t: 0.8 + i * 0.125, call: 'puff', all: true })),
  calls: {
    puff(m, ctx, inst) {
      for (let i = 0; i < 3; i++) {
        const d = 1.6 + inst.r(i + ((m.time * 7) | 0)) * 9, s = (inst.r(i + 5) - 0.5) * 0.35 * d;
        ctx.fx.spark({ x: m.pos.x + Math.sin(m.rot) * d + Math.cos(m.rot) * s, y: m.pos.y + 1.1, z: m.pos.z + Math.cos(m.rot) * d - Math.sin(m.rot) * s }, 3, '#e8f0f4', 2.5);
      }
    },
  },
  pose: mTrack([
    [0, {}], [0.4, { bodyY: -0.15, bodyPitch: 5, jaw: 40, neck: 0.2, bodyRoll: 3 }], [0.78, { bodyY: -0.2, bodyPitch: 6, jaw: 40, neck: 0.2, bodyRoll: -3 }],
    [1.0, { bodyY: -0.2, bodyPitch: 8, bodyRoll: 3 }, 'lin'], [1.3, { bodyRoll: -3 }, 'lin'], [1.6, { bodyRoll: 3 }, 'lin'], [1.9, { bodyRoll: -3 }, 'lin'], [2.2, { bodyRoll: 3 }, 'lin'], [2.5, { bodyRoll: -3 }, 'lin'],
    [2.9, { bodyY: -0.1, bodyPitch: 3, bodyRoll: 0 }], [3.4, {}],
  ]),
};

// ---- 4. Kesseldruck (nur Phase 1): Zittern + Ventile pfeifen, Explosion um ihn (Ring), 40. Direkt unter ihm = sicher.
const RING = 10, RING_R = 3.8, RING_S = 2.1;
const druck = {
  id: 'kroll_druck', range: [0, 9], weight: 3, cooldown: 9, telegraph: 1.0, flashParts: ['kesselpanzer'], duration: 2.6, stam: 8, tempo: 1.0, cue: { color: '#ff4a4a', tone: 'schrill' }, audit: [3, 5],
  lockedByBreak: 'kesselpanzer',
  marker: { at: 'self', radius: RING_R + RING_S }, markerUntil: 1.3,
  // Ring aus Kugeln (innen ~1,7 m frei = unter ihm sicher); alle melden idx 0, damit Ueberlappungen nicht doppelt treffen
  hits: Array.from({ length: RING }, (_, i) => ({
    t0: 1.0, t1: 1.15, shape: 'sphere', at: [Math.sin((i / RING) * Math.PI * 2) * RING_R, 0.5, Math.cos((i / RING) * Math.PI * 2) * RING_R], radius: RING_S, dmg: 40, knock: 'down',
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
    [1.0, { bodyY: 0.35, bodyPitch: -6, spread: 40, tailPitch: 40, jaw: 50, neck: 0.5 }, 'lin'], [1.4, { bodyY: 0.1, spread: 15, jaw: 30 }], [2.6, {}],
  ]),
};

// ---- 5. Scherenwirbel (Phase 2, Panzerbruch): 3 Drehungen mit ausgestreckten Scheren, je 22
const SPIN = 0.65;
const wirbel = {
  id: 'kroll_wirbel', range: [0, 7], weight: 4, cooldown: 6, telegraph: 0.6, flashParts: ['scherenL', 'scherenR'], duration: 3.1, stam: 8, cue: { color: '#c070ff', tone: 'klick' }, audit: [3, 5],
  needsBroken: 'kesselpanzer',
  hits: [0, 1, 2].map((i) => ({ t0: 0.6 + i * SPIN, t1: 0.6 + (i + 1) * SPIN - 0.05, shape: 'capsule', from: [-2.9, 1.0, 0.3], to: [2.9, 1.0, 0.3], radius: 1.05, dmg: 22, knock: 'flinch' })),
  motion(tau, a) {
    const dir = a.r(0) < 0.5 ? 1 : -1;
    return { yaw: a.yaw0 + dir * (-0.4 * smooth(clamp01(tau / 0.6)) + (Math.PI * 6 + 0.4) * clamp01((tau - 0.6) / (3 * SPIN))) };
  },
  pose: mTrack([
    [0, {}], [0.5, { neck: 0.15, jaw: 70, spread: 60, tailPitch: 70, bodyY: -0.1 }], [0.6, { neck: 0.15, jaw: 70, spread: 60, tailPitch: 70, bodyY: -0.1 }], [2.6, { neck: 0.15, jaw: 70, spread: 60, tailPitch: 70, bodyY: -0.1 }],
    [2.9, { neck: 0.1, jaw: 30, spread: 20 }], [3.1, {}],
  ]),
};

// ---- 6. Krabbensprung (Panzerbruch): springt aufs Ziel (34), bleibt 1,5 s stecken = Strafe-Fenster
const STUCK = 1.5;
const hopPrep = (a, maxLen) => { // Richtung/Strecke zum Ziel, am Gelaende gekuerzt
  const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz) || 1;
  a.aimYaw = Math.atan2(dx, dz);
  a.turn = wrapAngle(a.aimYaw - a.yaw0);
  a.ux = dx / d; a.uz = dz / d;
  a.len = safeLen(a.origin.x, a.origin.z, a.ux, a.uz, Math.min(d, maxLen));
  a.jx = a.ux * a.len; a.jz = a.uz * a.len;
  a.landing = { x: a.origin.x + a.jx, z: a.origin.z + a.jz };
};
const landFx = (m, ctx) => {
  ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 0.4, z: m.pos.z }, 40, '#8a7a5a', 9);
  ctx.fx.shake(0.5, 0.4);
  ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos });
};
const sprung = {
  id: 'kroll_sprung', range: [4, 16], weight: 3, cooldown: 9, telegraph: 0.8, flashParts: ['beine', 'koerper'], duration: 3.7, stam: 10, tempo: 1.15, cue: { color: '#5ac8ff', tone: 'brumm' }, audit: [6, 10],
  needsBroken: 'kesselpanzer', punishWindow: STUCK,
  marker: { at: 'landing', radius: 3.4 }, markerUntil: 2.2,
  prepare(a) { hopPrep(a, 15); },
  hits: [{ t0: 1.55, t1: 1.7, shape: 'sphere', at: [0, 0.5, 0], radius: 3.3, dmg: 34, knock: 'down' }],
  events: [{ t: 1.55, call: 'land', all: true }],
  calls: { land: landFx },
  motion(tau, a) {
    const k = clamp01((tau - 0.8) / 0.75);
    return { x: a.origin.x + a.jx * smooth(k), z: a.origin.z + a.jz * smooth(k), yaw: a.yaw0 + a.turn * smooth(clamp01(tau / 0.7)), air: Math.sin(k * Math.PI) * 4.5 };
  },
  pose: mTrack([
    [0, {}], [0.7, { bodyY: -0.5, legL: 40, legR: -40, neck: 0.3, jaw: 30 }], [0.8, { bodyY: -0.55, legL: 40, legR: -40, neck: 0.3, jaw: 30 }],
    [1.0, { bodyY: 0.2, bodyPitch: -12, legL: -30, legR: 30, neck: 0.6, jaw: 60, spread: 40, tailPitch: 30 }], [1.4, { bodyPitch: 12, spread: 10, neck: 0.4 }],
    [1.6, { bodyY: -0.45, bodyPitch: 8, legL: 10, legR: 10, jaw: 0, spread: 0, neck: 0.1 }], [2.2, { bodyY: -0.45, bodyPitch: 14, bodyRoll: 6, neck: 0, legL: 25, legR: -25 }],
    [2.6, { bodyY: -0.45, bodyPitch: 14, bodyRoll: -6, legL: -25, legR: 25 }, 'lin'], [3.0, { bodyY: -0.4, bodyPitch: 12, bodyRoll: 5, legL: 25, legR: -25 }, 'lin'], [3.7, {}],
  ]),
};

// ---- 7. NEU Scherengriff: hebt beide Scheren weit auf (Ausholen), schnellt 6,5 m nach vorn und zwickt zu. Treffer = 44 + Umwerfen. Rolle weicht aus.
const GRIFF_LEN = 8;
const griff = {
  id: 'kroll_griff', range: [3, 13], weight: (m, d) => (d > 7 ? 12 : 6), cooldown: 3.2, telegraph: 0.65, flashParts: ['scherenL', 'scherenR'], duration: 2.4, stam: 6, tempo: 1.25, cue: { color: '#ff7a3a', tone: 'schrill' }, audit: [3, 7, 12],
  marker: { at: 'landing', radius: 2.2 }, markerUntil: 1.0,
  prepare(a) { aimPrep(a, GRIFF_LEN); a.landing = { x: a.origin.x + a.ax * a.len, z: a.origin.z + a.az * a.len }; },
  hits: [{ t0: 0.72, t1: 1.02, shape: 'capsule', from: [0, 1.0, 1.7], to: [0, 1.0, 3.5], radius: 2.0, dmg: 44, knock: 'down' }],
  events: [{ t: 0.75, call: 'snap', all: true }],
  calls: {
    snap(m, ctx) {
      ctx.fx.spark({ x: m.pos.x + Math.sin(m.rot) * 3, y: m.pos.y + 1.2, z: m.pos.z + Math.cos(m.rot) * 3 }, 14, '#ffb070', 6);
      ctx.fx.shake(0.25, 0.25);
    },
  },
  motion(tau, a) { const k = smooth(clamp01((tau - 0.62) / 0.3)) * a.len; return { x: a.origin.x + a.ax * k, z: a.origin.z + a.az * k, yaw: aimYaw(tau, a, 0.55) }; },
  pose: mTrack([
    [0, {}], [0.35, { bodyY: -0.3, bodyPitch: -8, neck: 0.55, spread: 55, tailPitch: 45, jaw: 70, legL: 20, legR: -20 }], [0.62, { bodyY: -0.35, bodyPitch: -10, neck: 0.6, spread: 60, tailPitch: 50, jaw: 75, legL: -20, legR: 20 }],
    [0.76, { bodyY: -0.1, bodyPitch: 10, neck: 0.25, spread: 6, tailPitch: 70, jaw: 70, wing: 22, headYaw: 22 }, 'lin'],
    [0.9, { bodyPitch: 9, neck: 0.2, spread: 0, tailPitch: 60, jaw: 0, wing: 30, headYaw: 30 }, 'lin'],
    [1.2, { bodyPitch: 6, bodyRoll: 5, jaw: 0, wing: 30, headYaw: 30, tailPitch: 50 }], [1.5, { bodyPitch: 4, bodyRoll: -5, jaw: 10, wing: 20, headYaw: 20 }], [1.9, { neck: 0.1, jaw: 25 }], [2.4, {}],
  ]),
};

// ---- 8. NEU Panzerdeckung: Scheren vor das Gesicht, Augen eingezogen, kriecht langsam vor. Frontal -80 % Schaden, dann sofort Konterhieb. Seite/Ruecken voll offen.
// Wird nur gewaehlt, wenn man ihn frontal zupruegelt (heat). Die Deckung dreht langsam nach (Host), Flanken ist also moeglich, aber nicht trivial.
const deckung = {
  id: 'kroll_deckung', range: [0, 9], weight: 14, cooldown: 9, telegraph: 0.5, flashParts: ['scherenL', 'scherenR'], duration: 3.4, stam: 0, tgVar: false, noTeach: true,
  cue: { color: '#9fc4e8', tone: 'brumm' }, audit: [3],
  cond: (m) => (m.heat ?? 0) >= m.maxHp * HEAT_ON,
  hits: [],
  prepare(a) { a.len = safeLen(a.origin.x, a.origin.z, a.dir.x, a.dir.z, 2.5); },
  events: [{ t: 0.05, call: 'reset' }], // nur Host
  calls: { reset(m) { m.heat = 0; } },
  motion(tau, a) { const k = smooth(clamp01((tau - 0.5) / 2.3)) * a.len; return { x: a.origin.x + a.dir.x * k, z: a.origin.z + a.dir.z * k, yaw: a.guardYaw ?? a.yaw0 }; },
  pose: mTrack([[0, {}], [0.5, { bodyY: -0.15, bodyPitch: 4 }], [2.9, { bodyY: -0.15, bodyPitch: 4 }], [3.4, {}]]),
};

// ---- 9. NEU Konterhieb (intern, nur aus der Deckung): schneller Hieb 30, Telegraph am Minimum
const konter = {
  id: 'kroll_konter', internal: true, noTeach: true, tgVar: false, range: [0, 8], weight: 0, cooldown: 2, telegraph: 0.5, flashParts: ['scherenL', 'scherenR'], duration: 1.5, stam: 2, tempo: 1.4,
  cue: { color: '#ffd84a', tone: 'klick' }, audit: [2, 4],
  hits: [{ t0: 0.52, t1: 0.76, shape: 'capsule', from: [2.4, 1.0, 1.5], to: [-0.5, 1.0, 3.2], radius: 1.35, dmg: 30, knock: 'flinch' }],
  prepare(a) { aimPrep(a, 1.0); },
  motion(tau, a) { const k = smooth(clamp01((tau - 0.4) / 0.15)) * a.len; return { x: a.origin.x + a.ax * k, z: a.origin.z + a.az * k, yaw: aimYaw(tau, a, 0.3) }; },
  pose: mTrack([
    [0, { neck: 0.3, spread: 15, tailPitch: 10, jaw: 40 }], [0.4, { neck: 0.5, spread: 36, tailPitch: 30, jaw: 62, bodyPitch: -6 }], [0.5, { neck: 0.5, spread: 36, tailPitch: 30, jaw: 62, bodyPitch: -6 }],
    [0.58, { neck: 0.2, spread: 0, tailPitch: 70, jaw: 0, wing: 80, bodyPitch: 6 }, 'lin'], [1.0, { neck: 0.15, jaw: 20, wing: 20, bodyPitch: 3 }], [1.5, {}],
  ]),
};

// ---- 10. NEU Doppelsprung (HP-Phase 2, <= 40 %): zwei Saetze hintereinander, Zwischenlandung auf halbem Weg (26), dann aufs Ziel (32, wirft um)
const doppelsprung = {
  id: 'kroll_doppelsprung', range: [8, 16], weight: 4, cooldown: 9, telegraph: 0.75, flashParts: ['beine', 'koerper'], duration: 3.8, stam: 12, tempo: 1.15, cue: { color: '#ff5ac8', tone: 'knurr' }, audit: [9, 13],
  phase: 1, punishWindow: 1.3,
  marker: { at: 'landing', radius: 3.4 }, markerUntil: 2.0,
  prepare(a) { hopPrep(a, 15); },
  hits: [
    { t0: 1.32, t1: 1.44, shape: 'sphere', at: [0, 0.5, 0], radius: 2.4, dmg: 26, knock: 'flinch' },
    { t0: 2.32, t1: 2.44, shape: 'sphere', at: [0, 0.5, 0], radius: 3.3, dmg: 32, knock: 'down' },
  ],
  events: [{ t: 1.32, call: 'land', all: true }, { t: 2.32, call: 'land', all: true }],
  calls: { land: landFx },
  motion(tau, a) {
    const k1 = clamp01((tau - 0.75) / 0.57), k2 = clamp01((tau - 1.75) / 0.57), e = 0.5 * smooth(k1) + 0.5 * smooth(k2);
    return { x: a.origin.x + a.jx * e, z: a.origin.z + a.jz * e, yaw: a.yaw0 + a.turn * smooth(clamp01(tau / 0.7)), air: Math.sin(k1 * Math.PI) * 3.2 + Math.sin(k2 * Math.PI) * 4.2 };
  },
  pose: mTrack([
    [0, {}], [0.65, { bodyY: -0.5, legL: 40, legR: -40, neck: 0.3, jaw: 30, spread: 20 }], [0.75, { bodyY: -0.55, legL: 40, legR: -40, neck: 0.3, jaw: 30 }],
    [0.95, { bodyY: 0.2, bodyPitch: -10, legL: -30, legR: 30, neck: 0.6, jaw: 60, spread: 40, tailPitch: 30 }], [1.3, { bodyPitch: 10, spread: 8, neck: 0.4 }],
    [1.5, { bodyY: -0.45, bodyPitch: 6, legL: 20, legR: -20, jaw: 20, spread: 10, neck: 0.2 }], [1.7, { bodyY: -0.55, legL: 40, legR: -40, neck: 0.4, jaw: 50, spread: 30 }],
    [1.95, { bodyY: 0.25, bodyPitch: -14, legL: -30, legR: 30, neck: 0.7, jaw: 70, spread: 45, tailPitch: 40 }], [2.3, { bodyPitch: 14, spread: 6, neck: 0.4 }],
    [2.5, { bodyY: -0.45, bodyPitch: 12, legL: 10, legR: 10, jaw: 0, spread: 0, neck: 0.1 }], [3.1, { bodyY: -0.45, bodyPitch: 14, bodyRoll: 6, legL: 25, legR: -25 }],
    [3.5, { bodyY: -0.3, bodyPitch: 8, bodyRoll: -5, legL: -25, legR: 25 }, 'lin'], [3.8, {}],
  ]),
};

// Grundtempo (Rostwerke = schwerer als Schotterklamm); Dampf/Druck/Sprung/Griff/Konter setzen eigenes Tempo
for (const a of [zange, seitrammer, wirbel]) if (a.tempo === undefined) a.tempo = 1.3;
deckung.tempo = 1;

const inPhase2 = (m) => m.phase >= 1;
const P2_DMG = 1.15, P2_CD = 0.35; // HP-Phase 2: +15 % Schaden, Abklingzeiten laufen 35 % schneller

export const kroll = {
  id: 'kroll',
  name: 'Kroll',
  hp: 13500, // Owner-Feedback Okt 2026: Kampf dichter, nicht laenger (war 15000)
  scale: SC,
  bodyRadius: 2.2,
  walk: 5.6, run: 6.8, detect: 28, prefer: 5, turn: 1.0, // Nachsetzen im Rennen (war 4,0 = wegrennbar), steht im Nahdruck
  speedFactor: (m) => (m.phase >= 1 ? 1.12 : 1), // HP-Phase 2: schneller
  recoverAfter: (m) => (0.15 + m.rng() * 0.3) / (1.15 * m.speedMul),
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
  attacks: {
    kroll_zange: zange, kroll_griff: griff, kroll_seitrammer: seitrammer, kroll_dampf: dampf, kroll_druck: druck, kroll_wirbel: wirbel, kroll_sprung: sprung,
    kroll_deckung: deckung, kroll_konter: konter, kroll_doppelsprung: doppelsprung,
  },
  // Brocken 2.0
  teachAttack: 'kroll_zange', stamina: true, flinchDmg: true,
  chains: {
    kroll_zange: [{ atk: 'kroll_griff', w: 4 }, { atk: 'kroll_seitrammer', w: 3 }, { atk: 'kroll_wirbel', w: 3 }, { atk: 'kroll_dampf', w: 2 }, { atk: null, w: 3 }],
    kroll_seitrammer: [{ atk: 'kroll_griff', w: 4 }, { atk: 'kroll_zange', w: 3 }, { atk: 'kroll_dampf', w: 1 }, { atk: null, w: 1 }], // Seitrammer -> Griff / Zange
    kroll_griff: [{ atk: 'kroll_zange', w: 4 }, { atk: 'kroll_seitrammer', w: 2 }, { atk: null, w: 2 }],
    kroll_dampf: [{ atk: 'kroll_druck', w: 3 }, { atk: 'kroll_zange', w: 2 }, { atk: 'kroll_seitrammer', w: 5, cond: inPhase2 }, { atk: null, w: 2 }], // HP-Phase 2: Dampf + Ramm
    kroll_druck: [{ atk: 'kroll_zange', w: 2 }, { atk: null, w: 2 }],
    kroll_wirbel: [{ atk: 'kroll_zange', w: 2 }, { atk: 'kroll_seitrammer', w: 2 }, { atk: null, w: 2 }],
    kroll_sprung: [{ atk: 'kroll_griff', w: 5 }, { atk: 'kroll_zange', w: 2 }, { atk: null, w: 1 }], // Sprung -> Scherengriff
    kroll_doppelsprung: [{ atk: 'kroll_griff', w: 5 }, { atk: 'kroll_zange', w: 3 }, { atk: null, w: 1 }],
    kroll_konter: [{ atk: 'kroll_zange', w: 1 }, { atk: null, w: 4 }],
  },
  // HP-Phase bei 40 % "Siedehitze" (Special je nach Panzerzustand: Kesseldruck bzw. Scherenwirbel) + Doppelsprung + 12 % Tempo; Panzerbruch loest eigene Phase 2 aus (applyPhase2)
  phases: [{ at: 0.4, name: 'Siedehitze', cue: '#ff4a4a', special: 'kroll_druck', enter: (m) => {
    m.phaseSpecial = m.p2 ? 'kroll_wirbel' : 'kroll_druck';
    m.cds.kroll_druck = 0; m.cds.kroll_wirbel = 0;
  } }],
  build: () => buildKroll({ scale: SC }),
  init(m) {
    m.p2 = false; m.heat = 0; m.guardCounter = false;
    m.pose.guard = 0;
    WORLD = m.ctx.world;
    const base = m.applyDamage.bind(m);
    m.applyDamage = (res) => base(guardFilter(m, res));
    let proto = Object.getPrototypeOf(m), dm = null; // HP-Phase 2 (Siedehitze): +15 % Schaden
    while (proto && !dm) { dm = Object.getOwnPropertyDescriptor(proto, 'dmgMul')?.get; proto = Object.getPrototypeOf(proto); }
    if (dm) Object.defineProperty(m, 'dmgMul', { configurable: true, get() { return dm.call(this) * (this.phase >= 1 ? P2_DMG : 1); } });
  },
  poseHook(m, p) { // Deckung: Scheren hoch vor das Gesicht (aus der Angriffszeit abgeleitet = auch fuer Gast-Clients)
    const a = m.attack;
    if (a?.id === 'kroll_deckung') {
      const tau = a.inst.sample(a.t).tau;
      p.guard = smooth(clamp01(tau / 0.5)) * (1 - smooth(clamp01((tau - 2.9) / 0.4)));
    } else p.guard = 0;
  },
  onBreak(m, part) { if (part.id === 'kesselpanzer') applyPhase2(m); },
  onStatus(m, type) { if (type === 'blind') m.st.blind = Math.min(m.st.blind * 2, 8); }, // Blendknolle wirkt doppelt (Augenstiele)
  onAttackEnd(m, id) { if (id === 'kroll_deckung' || id === 'kroll_konter') m.heat = 0; },
  tick(m, dt) {
    m.extra.eyeMat.color.set(m.st.blind > 0 ? '#2a2018' : m.rage ? '#ff3020' : '#ffb030');
    m.extra.coreM.color.set(m.attack?.id === 'kroll_dampf' ? '#ffffff' : '#ff7a2a');
    if (!m.authority) return;
    if (m.phase >= 1) for (const k in m.cds) if (m.cds[k] > 0) m.cds[k] -= dt * P2_CD;
    m.heat = Math.max(0, m.heat - m.maxHp * HEAT_DECAY * dt);
    const inst = m.attack?.inst;
    if (inst?.def.id === 'kroll_deckung' && m.target) { // Deckung dreht langsam nach (Host); Gast sieht fixe Richtung, Schaden entscheidet nur der Host
      inst.guardYaw = stepAngle(inst.guardYaw ?? inst.yaw0, yawOf(m.target.pos.x - m.pos.x, m.target.pos.z - m.pos.z), 0.75 * dt);
    }
    if (m.guardCounter) { // frontal in der Deckung getroffen -> Konterhieb
      m.guardCounter = false;
      if (inst?.def.id === 'kroll_deckung') { m._interrupt(); m.recover = 0; m.queued = 'kroll_konter'; m.heat = 0; }
    }
  },
  snapExtra: (m) => ({ p2: !!m.p2 }),
  applyPhase2,
};
