// Voltaro, der Funkenfürst (GDD 15.6, JR 6, Apex/Endboss): schneller Vierbeiner, Kupfer-Antennenkamm, Rückenspulen.
// Ladung 0-100 (steigt durch Angriffe + Aufladen am Blitzableiter) -> Überladen 60 s (Glühen, +30 % Tempo, Blitz-Moveset).
// Host-autoritativ: Ladung/Überladen/Gewitter-Takt laufen nur beim Host bzw. deterministisch (Blitze aus Seed + Angriffsparametern).
import * as THREE from 'three';
import { lambert, basic } from '../../render/ps1.js';
import { tex, registerTexture } from '../../render/textures.js';
import { Monster, mTrack } from './monster.js';
import { smooth, clamp01, severTail } from './common.js';
import { wrapAngle } from '../../core/math.js';
import { createRng } from '../../core/rng.js';

const R = Math.PI / 180;
const SC = 2.4;

export const VOLTARO = {
  OVER_TIME: 60, OVER_SPEED: 1.3, EXH_FORCED: 4, EXH_NATURAL: 2,
  LOAD_GAIN: 50, // Ladung pro Aufladen am Ableiter (3 s)
  CHAIN_R: 6, CHAIN_DMG: 22, CHAIN_HIT_R: 2.8, STORM_P2: 2, ROD_NEAR: 30,
};

// ---- Texturen
const speckle = (cols, density = 1) => (g, n, rnd) => {
  g.fillStyle = cols[0]; g.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (rnd() > density) continue; g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(x, y, 1, 1); }
};
registerTexture('voltaro_fur', (g, n, rnd) => {
  speckle(['#2a2f3d', '#232836', '#323849', '#1c2030'])(g, n, rnd);
  g.fillStyle = '#e8c13a';
  for (let i = 0; i < n * 0.5; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1);
  g.fillStyle = '#12151f';
  for (let y = 2; y < n; y += 5) g.fillRect(0, y, n, 1);
});
registerTexture('voltaro_copper', (g, n, rnd) => {
  speckle(['#b8672c', '#a85a24', '#c87838', '#8e4a1e'])(g, n, rnd);
  g.fillStyle = '#5fd0a0'; // Grünspan
  for (let i = 0; i < n * 0.4; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1);
});
registerTexture('voltaro_belly', speckle(['#6a7088', '#5c6278', '#787f98']));
registerTexture('voltaro_claw', speckle(['#d8d0b0', '#c8c0a0', '#e8e0c4']));

const GLOW_OFF = new THREE.Color('#5a3a18'), GLOW_ON = new THREE.Color('#ffe14d'), GLOW_OVER = new THREE.Color('#9fe8ff');
const _c = new THREE.Color();

/**
 * Procedural Voltaro. Parts: kopf, antennenkamm, prankeL/R (Vorderbeine), spulen, tail (severable), koerper.
 * Pose keys: MREST; legL/legR = Vorderbeine (Hinterbeine gegenläufig), spread = Kamm aufgerichtet/Spulen hoch (0..1).
 */
export function buildVoltaro({ scale = SC } = {}) {
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  root.add(g);
  const partMeshes = { kopf: [], antennenkamm: [], prankeL: [], prankeR: [], spulen: [], tail: [], koerper: [] };
  const mats = {};
  const mat = (part, t) => (mats[part + t] ??= lambert({ map: tex(t, { size: 16 }) }));
  const glowMats = { comb: basic({ color: '#5a3a18' }), coil: basic({ color: '#5a3a18' }), eye: basic({ color: '#ffe14d' }) };
  const add = (part, w, h, d, m, parent, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    parent.add(mesh);
    partMeshes[part].push(mesh);
    return mesh;
  };
  const BASE = 1.2;
  const body = new THREE.Group();
  body.position.y = BASE;
  g.add(body);
  const fur = (p) => mat(p, 'voltaro_fur'), cu = (p) => mat(p, 'voltaro_copper');
  add('koerper', 0.95, 0.85, 2.0, fur('koerper'), body, 0, 0, 0);
  add('koerper', 1.05, 0.95, 0.9, fur('koerper'), body, 0, 0.05, 0.8);
  add('koerper', 0.8, 0.4, 1.9, mat('koerper', 'voltaro_belly'), body, 0, -0.38, 0.1);
  // Rückenspulen: Kupferringe mit Glühband
  for (let i = 0; i < 3; i++) {
    const z = 0.55 - i * 0.55;
    add('spulen', 0.62, 0.2, 0.5, cu('spulen'), body, 0, 0.55, z);
    add('spulen', 0.7, 0.07, 0.56, glowMats.coil, body, 0, 0.68, z);
    add('spulen', 0.1, 0.2, 0.1, cu('spulen'), body, 0.28, 0.45, z);
    add('spulen', 0.1, 0.2, 0.1, cu('spulen'), body, -0.28, 0.45, z);
  }

  const neck = new THREE.Group();
  neck.position.set(0, 0.25, 1.2);
  body.add(neck);
  add('koerper', 0.5, 0.55, 0.7, fur('koerper'), neck, 0, 0.2, 0.25);
  const head = new THREE.Group();
  head.position.set(0, 0.45, 0.55);
  neck.add(head);
  add('kopf', 0.62, 0.5, 0.8, fur('kopf'), head, 0, 0, 0.3);
  add('kopf', 0.36, 0.28, 0.55, fur('kopf'), head, 0, -0.06, 0.9);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.18, 0.1);
  head.add(jaw);
  add('kopf', 0.34, 0.12, 0.85, mat('kopf', 'voltaro_belly'), jaw, 0, 0, 0.5);
  for (let i = 0; i < 3; i++) add('kopf', 0.05, 0.12, 0.05, mat('kopf', 'voltaro_claw'), jaw, (i - 1) * 0.1, 0.1, 0.85);
  for (const sx of [1, -1]) add('kopf', 0.1, 0.1, 0.1, glowMats.eye, head, sx * 0.3, 0.12, 0.5);
  // Antennenkamm: Kupferstäbe mit leuchtenden Spitzen
  const comb = new THREE.Group();
  comb.position.set(0, 0.28, 0.1);
  head.add(comb);
  add('antennenkamm', 0.5, 0.1, 0.6, cu('antennenkamm'), comb, 0, 0, 0.1);
  for (let i = 0; i < 5; i++) {
    const h = 0.8 + (i === 2 ? 0.4 : i % 2 ? 0.1 : 0.25), x = (i - 2) * 0.13;
    add('antennenkamm', 0.05, h, 0.05, cu('antennenkamm'), comb, x, h / 2, 0.1 - Math.abs(i - 2) * 0.1, -0.15, 0, -(i - 2) * 0.12);
    add('antennenkamm', 0.1, 0.1, 0.1, glowMats.comb, comb, x + (i - 2) * 0.05, h + 0.02, 0.1 - Math.abs(i - 2) * 0.1 - 0.12);
  }

  // Beine: vorn = Pranken (Teile), hinten = Körper
  const legs = {};
  for (const [name, sx, z, part] of [['legFL', 1, 0.75, 'prankeL'], ['legFR', -1, 0.75, 'prankeR'], ['legRL', 1, -0.7, 'koerper'], ['legRR', -1, -0.7, 'koerper']]) {
    const l = new THREE.Group();
    l.position.set(sx * 0.45, -0.3, z);
    body.add(l);
    add(part, 0.32, 0.75, 0.38, fur(part), l, 0, -0.3, 0, 0.15);
    add(part, 0.24, 0.7, 0.28, fur(part), l, 0, -0.85, 0.05, -0.15);
    add(part, 0.36, 0.14, 0.55, cu(part), l, 0, -1.15, 0.15);
    if (z > 0) for (const cx of [-0.11, 0, 0.11]) add(part, 0.05, 0.05, 0.28, mat(part, 'voltaro_claw'), l, cx, -1.13, 0.55);
    legs[name] = l;
  }

  const tail1 = new THREE.Group();
  tail1.position.set(0, 0.1, -1.0);
  body.add(tail1);
  add('koerper', 0.45, 0.4, 1.3, fur('koerper'), tail1, 0, 0, -0.55, -0.05);
  const tail2 = new THREE.Group();
  tail2.position.set(0, 0, -1.2);
  tail1.add(tail2);
  add('tail', 0.34, 0.3, 1.3, fur('tail'), tail2, 0, 0, -0.55, -0.05);
  add('tail', 0.4, 0.1, 0.4, cu('tail'), tail2, 0, 0.22, -0.4);
  const tail3 = new THREE.Group();
  tail3.position.set(0, 0, -1.2);
  tail2.add(tail3);
  add('tail', 0.24, 0.22, 1.2, fur('tail'), tail3, 0, 0, -0.5);
  for (const sx of [1, -1]) add('tail', 0.07, 0.07, 0.6, cu('tail'), tail3, sx * 0.14, 0, -1.2, 0, sx * 0.35);
  add('tail', 0.12, 0.12, 0.12, glowMats.coil, tail3, 0, 0, -1.25);

  const nodes = { body, neck, head, jaw, comb, tail1, tail2, tail3, legFL: legs.legFL, legFR: legs.legFR, legRL: legs.legRL, legRR: legs.legRR, root: g };
  return {
    root, nodes, partMeshes,
    extra: {
      tail2, tailBase: tail1, g, scale, glowMats, comb,
      /** g 0..1 Ladungsglühen, over = Überladen (cyanfarben). */
      setGlow(gl, over) {
        _c.copy(GLOW_OFF).lerp(over ? GLOW_OVER : GLOW_ON, clamp01(gl));
        glowMats.comb.color.copy(_c); glowMats.coil.color.copy(_c);
        glowMats.eye.color.set(over ? '#9fe8ff' : gl > 0.6 ? '#ffb030' : '#ffe14d');
      },
    },
    apply(p) {
      body.position.y = BASE + p.bodyY / scale;
      body.rotation.set(p.bodyPitch * R, 0, p.bodyRoll * R);
      neck.rotation.x = 0.3 + p.neck;
      head.rotation.set(-(0.3 + p.neck) + p.head * R, p.headYaw * R, 0);
      jaw.rotation.x = p.jaw * R;
      comb.scale.y = 1 + p.spread * 0.45;
      tail1.rotation.set(p.tailPitch * R, p.tailYaw * R, 0);
      tail2.rotation.set(p.tailPitch * 0.6 * R, p.tailYaw * 0.9 * R, 0);
      tail3.rotation.set(p.tailPitch * 0.4 * R, p.tailYaw * 0.9 * R, 0);
      legs.legFL.rotation.x = -p.legL * R;
      legs.legFR.rotation.x = -p.legR * R;
      legs.legRL.rotation.x = p.legR * R * 0.8;
      legs.legRR.rotation.x = p.legL * R * 0.8;
    },
  };
}

// ======================================================= Helfer

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** Pirscher in einer Erdungsstab-Schutzzone (hunt.groundingZones) werden von Blitzen ausgenommen. */
export function isGrounded(ctx, p) {
  const zs = ctx.groundingZones;
  if (!zs?.length) return false;
  const now = ctx.time ?? 0;
  return zs.some((z) => (z.until === undefined || z.until > now) && flat(p.pos, z) <= z.r);
}

/** Kettenblitz-Berechnung (rein): Ziele im Kreis um `center`, springt von jedem Getroffenen auf jeden Pirscher im Umkreis. -> [{p, gen}] */
export function chainTargets(ctx, center, hitR = VOLTARO.CHAIN_HIT_R, jumpR = VOLTARO.CHAIN_R) {
  const live = (ctx.players ?? []).filter((p) => p.alive && !isGrounded(ctx, p));
  const out = [];
  for (const p of live) if (flat(p.pos, center) <= hitR) out.push({ p, gen: 0 });
  for (let i = 0; i < out.length; i++) {
    for (const q of live) if (!out.some((o) => o.p === q) && flat(q.pos, out[i].p.pos) <= jumpR) out.push({ p: q, gen: out[i].gen + 1 });
  }
  return out;
}

const zap = (m, p, dmg, key, attackId) => p.takeHit({ dmg: dmg * m.dmgMul, knock: 'flinch', sourcePos: m.pos, key: key + '|' + p.id, attackId, monster: m });

/** Blitz auf Kreis (r) zum Zeitpunkt `at` (m.time), Warnmarker ab at-warn. */
function addBolt(m, x, z, r, at, warn, dmg, key, attackId) {
  m._bolts.push({ x, z, r, at, warnAt: at - warn, dmg, key, attackId, n: m._boltN = (m._boltN ?? 0) + 1 });
}

function nearestRod(m) {
  let best = null, bd = VOLTARO.ROD_NEAR;
  for (const r of m._rods ?? []) { const d = flat(m.pos, r); if (d < bd) { bd = d; best = r; } }
  return best;
}
const scanRods = (m) => {
  const list = m.ctx.interact?.rods?.() ?? [];
  m._rods = list;
  for (const r of list) m._rodPos[r.id] = { x: r.x, z: r.z };
};

// ---- Überladen / Erschöpfung
function exhaust(m, t) {
  m.tired = true; m.tiredT = t; m.stamina = 0; m.queued = null; m._interrupt();
  m.ctx.bus.emit('monsterTired', { monster: m, on: true });
}
export function startOverload(m) {
  if (m.over > 0 || !m.alive) return;
  m.over = VOLTARO.OVER_TIME; m.charge = 100;
  m.queued = null; m._interrupt(); m.recover = 0.8;
  m.ctx.fx.flash?.('rgba(159,232,255,.35)', 0.3);
  m.ctx.fx.shake(0.5, 0.5);
  m.ctx.fx.number({ x: m.pos.x, y: m.pos.y + SC * 2.6, z: m.pos.z }, 'ÜBERLADEN!', 'crit');
  m.ctx.bus.emit('voltaroOverload', { monster: m, on: true });
  m.ctx.bus.emit('sfx', { name: 'roar', pos: m.pos, low: true });
}
export function endOverload(m, forced) {
  if (m.over <= 0) return;
  m.over = 0; m.charge = forced ? 10 : 0;
  m.ctx.fx.number({ x: m.pos.x, y: m.pos.y + SC * 2.6, z: m.pos.z }, 'Entladen!', 'weak');
  m.ctx.bus.emit('voltaroOverload', { monster: m, on: false, forced: !!forced });
  if (m.authority && m.alive) exhaust(m, forced ? VOLTARO.EXH_FORCED : VOLTARO.EXH_NATURAL);
}
const loaded = (m) => m.over > 0 || m.charge >= 50;

// ======================================================= Angriffe
const TEMPO = 1.25;
const normalW = (base) => (m) => (m.over > 0 ? base * 0.3 : base);

// ---- 1. Prankenhiebe: 2–3er Kombo (Kette pranken -> pranken2 -> pranken3), je 18
const swipe = (x) => [{ t0: 0.55, t1: 0.8, shape: 'sphere', at: [x, 1.5, 3.4], radius: 2.0, dmg: 18, knock: 'flinch' }];
const pranken = {
  id: 'voltaro_pranken', range: [0, 7], weight: normalW(6), cooldown: 2.5, stam: 6, telegraph: 0.55, duration: 1.3, flashParts: ['prankeL'], audit: [3, 5.5],
  cue: { color: '#e8c13a', tone: 'knurr' }, hits: swipe(0.4),
  pose: mTrack([[0, {}], [0.4, { legL: 70, bodyPitch: -6, bodyY: 0.1, head: -8, tailYaw: -20 }], [0.55, { legL: 80, bodyPitch: -8 }], [0.8, { legL: -35, bodyPitch: 10, head: 8 }, 'lin'], [1.3, {}]]),
};
const pranken2 = {
  id: 'voltaro_pranken2', internal: true, range: [0, 8], weight: 0, cooldown: 0, stam: 6, telegraph: 0.5, duration: 1.2, flashParts: ['prankeR'], audit: [3.5],
  cue: { color: '#e8c13a', tone: 'klick' }, hits: [{ t0: 0.5, t1: 0.75, shape: 'sphere', at: [-0.4, 1.5, 3.4], radius: 2.0, dmg: 18, knock: 'flinch' }],
  pose: mTrack([[0, {}], [0.35, { legR: 70, bodyPitch: -6, bodyY: 0.1, tailYaw: 20 }], [0.5, { legR: 80 }], [0.75, { legR: -35, bodyPitch: 10 }, 'lin'], [1.2, {}]]),
};
const pranken3 = {
  id: 'voltaro_pranken3', internal: true, range: [0, 8], weight: 0, cooldown: 0, stam: 8, telegraph: 0.55, duration: 1.8, flashParts: ['prankeL', 'prankeR'], audit: [3.5],
  cue: { color: '#ffb030', tone: 'droehn' },
  hits: [{ t0: 0.55, t1: 0.75, shape: 'sphere', at: [0, 1.0, 3.2], radius: 2.2, dmg: 18, knock: 'flinch' }, { t0: 0.95, t1: 1.15, shape: 'sphere', at: [0, 0.8, 3.4], radius: 2.4, dmg: 18, knock: 'down' }],
  pose: mTrack([[0, {}], [0.4, { legL: 75, legR: 75, bodyPitch: -14, bodyY: 0.3 }], [0.55, { legL: 80, legR: 80, bodyPitch: -16 }], [0.75, { legL: -30, legR: -30, bodyPitch: 12 }, 'lin'], [0.95, { legL: 70, legR: 70, bodyPitch: -14, bodyY: 0.3 }], [1.15, { legL: -40, legR: -40, bodyPitch: 14 }, 'lin'], [1.8, {}]]),
};

// ---- 2. Spulensprung: Rückwärtssalto, danach Schwanzwirbel 26 (nur mit Schwanz)
const SPU = { back: 2.2, spin: Math.PI * 1.5, t0: 1.3, t1: 1.9 };
const spulen = {
  id: 'voltaro_spulen', range: [1.5, 6], weight: normalW(4), cooldown: 6, stam: 12, telegraph: 0.6, duration: 2.8, flashParts: ['spulen', 'tail'], audit: [2.5, 4.5], noFace: false,
  cue: { color: '#ff9030', tone: 'zisch' }, lockedByBreak: 'tail',
  marker: { at: 'self', radius: 7.5 }, markerUntil: 1.3,
  hits: [{ t0: SPU.t0 + 0.05, t1: SPU.t1, shape: 'capsule', from: [0, 1.3, -1.8], to: [0, 1.3, -7.5], radius: 1.1, dmg: 26, knock: 'flinch' }],
  motion(tau, a) {
    const k = smooth(clamp01((tau - 0.6) / 0.65)), sign = a.r(0) < 0.5 ? 1 : -1;
    return {
      x: a.origin.x - a.dir.x * SPU.back * k, z: a.origin.z - a.dir.z * SPU.back * k, air: 3.2 * Math.sin(Math.PI * clamp01((tau - 0.6) / 0.65)),
      yaw: a.yaw0 + sign * SPU.spin * smooth(clamp01((tau - SPU.t0) / (SPU.t1 - SPU.t0))),
    };
  },
  events: [{ t: 1.25, call: 'land', all: true }],
  calls: { land(m, ctx) { ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 0.3, z: m.pos.z }, 18, '#9fe8ff', 6); ctx.fx.shake(0.25, 0.25); } },
  pose: mTrack([[0, {}], [0.45, { bodyY: -0.4, legL: 45, legR: 45, bodyPitch: 8 }], [0.8, { bodyPitch: 140, bodyY: 0.5, legL: -30, legR: -30, spread: 1 }, 'lin'], [1.25, { bodyPitch: 360, bodyY: 0, spread: 0.6 }, 'lin'], [1.3, { tailYaw: 55, tailPitch: -8 }], [1.9, { tailYaw: -55 }, 'lin'], [2.8, {}]]),
};

// ---- 3. Funkenlauf: Bogenlauf (Bezier) durchs Ziel, Funkenspur 4 s (10/s)
const FL = { run0: 0.65, runT: 1.5, over: 3.5, trail: 4, dps: 10, r: 1.4 };
const funkenlauf = {
  id: 'voltaro_funkenlauf', range: [6, 24], weight: normalW(4), cooldown: 8, stam: 16, telegraph: 0.6, duration: 3.4, flashParts: ['koerper', 'spulen'], audit: [10, 18],
  cue: { color: '#ffe14d', tone: 'brumm' },
  marker: { at: 'target', radius: 2.5 }, markerUntil: 0.6,
  prepare(a) {
    const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz) || 1, sign = a.r(0) < 0.5 ? 1 : -1;
    const ux = dx / d, uz = dz / d;
    a.P0 = { x: a.origin.x, z: a.origin.z };
    a.P2 = { x: a.target.x + ux * FL.over, z: a.target.z + uz * FL.over };
    a.C = { x: a.origin.x + dx * 0.5 - uz * sign * d * 0.45, z: a.origin.z + dz * 0.5 + ux * sign * d * 0.45 };
  },
  hits: [{ t0: 0.7, t1: 2.1, shape: 'sphere', at: [0, 1.6, 1.8], radius: 1.9, dmg: 14, knock: 'flinch' }],
  motion(tau, a) {
    const k = clamp01((tau - FL.run0) / FL.runT), j = 1 - k;
    const x = j * j * a.P0.x + 2 * j * k * a.C.x + k * k * a.P2.x, z = j * j * a.P0.z + 2 * j * k * a.C.z + k * k * a.P2.z;
    const tx = 2 * j * (a.C.x - a.P0.x) + 2 * k * (a.P2.x - a.C.x), tz = 2 * j * (a.C.z - a.P0.z) + 2 * k * (a.P2.z - a.C.z);
    const tan = Math.atan2(tx, tz), t0 = Math.atan2(a.C.x - a.P0.x, a.C.z - a.P0.z);
    const yaw = tau < FL.run0 ? a.yaw0 + wrapAngle(t0 - a.yaw0) * smooth(clamp01(tau / FL.run0)) : tan;
    return { x, z, yaw };
  },
  events: Array.from({ length: 8 }, (_, i) => ({ t: 0.75 + i * 0.2, call: 'trail', all: true })),
  calls: { trail(m) { (m._trail ??= []).push({ x: m.pos.x, z: m.pos.z, until: m.time + FL.trail }); if (m._trail.length > 40) m._trail.shift(); m.ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 0.5, z: m.pos.z }, 6, '#ffe14d', 4); } },
  pose: mTrack([[0, {}], [0.5, { bodyY: -0.3, bodyPitch: 10, legL: 30, legR: -30 }], [0.65, { bodyPitch: 14, bodyY: -0.2, tailPitch: -10 }], [1.4, { bodyPitch: 12, legL: 55, legR: -55, tailPitch: -14, bodyRoll: 8 }], [2.2, { bodyPitch: 12, legL: -55, legR: 55, tailPitch: -14, bodyRoll: -8 }], [2.6, { bodyPitch: 0 }], [3.4, {}]]),
};

// ---- Aufladen am Blitzableiter (intern, vom Host in tick() angesetzt): läuft zum Ableiter, Blitz, 3 s laden
const LOAD = { run0: 0.6, runT: 1.6, bolt: 2.3, hold: 3.0 };
const aufladen = {
  id: 'voltaro_aufladen', tempo: 1, internal: true, noTeach: true, range: [0, 99], weight: 0, cooldown: 10, stam: 0, telegraph: 0.6, duration: 5.8, flashParts: ['antennenkamm', 'spulen'],
  cue: { color: '#9fe8ff', tone: 'schrill' }, hits: [],
  prepare(a) {
    const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz);
    a.moving = d > 1;
    const reach = a.moving ? Math.min(d - 3, 26) : 0, ux = d ? dx / d : 0, uz = d ? dz / d : 0;
    a.stop = { x: a.origin.x + ux * Math.max(0, reach), z: a.origin.z + uz * Math.max(0, reach) };
    a.faceYaw = a.moving ? Math.atan2(dx, dz) : a.yaw0;
  },
  motion(tau, a) {
    const k = smooth(clamp01((tau - LOAD.run0) / LOAD.runT));
    return { x: a.origin.x + (a.stop.x - a.origin.x) * k, z: a.origin.z + (a.stop.z - a.origin.z) * k, yaw: a.yaw0 + wrapAngle(a.faceYaw - a.yaw0) * smooth(clamp01(tau / LOAD.run0)) };
  },
  events: [{ t: LOAD.bolt, call: 'bolt', all: true }],
  calls: {
    bolt(m, ctx, inst) {
      const t = inst.target, y = ctx.world.heightAt(t.x, t.z);
      ctx.fx.spark({ x: t.x, y: y + 8, z: t.z }, 40, '#9fe8ff', 9);
      ctx.fx.flash?.('rgba(159,232,255,.5)', 0.18);
      ctx.fx.shake(0.4, 0.3);
      ctx.bus.emit('sfx', { name: 'zap', pos: t });
    },
  },
  pose: mTrack([[0, {}], [0.6, { neck: -0.3, head: -15, spread: 0.6, bodyPitch: -6 }], [1.0, { legL: 40, legR: -40, bodyPitch: 10 }], [2.0, { legL: -40, legR: 40, bodyPitch: 10 }], [2.3, { spread: 1, neck: -0.3, head: -20, bodyY: 0.1 }], [5.3, { spread: 1, neck: -0.3, head: -20, bodyY: 0.1, bodyRoll: 4 }], [5.8, {}]]),
};

// ---- Phase 2: Sturmruf (Spezial): Brüllen, Gewitter beginnt, Ladung +35
const sturmruf = {
  id: 'voltaro_sturmruf', tempo: 1, internal: true, noTeach: true, range: [0, 99], weight: 0, cooldown: 0, stam: 0, telegraph: 1.0, duration: 2.6, flashParts: ['kopf', 'antennenkamm'],
  cue: { color: '#9fe8ff', tone: 'schrill' }, hits: [],
  events: [{ t: 1.1, call: 'storm', all: true }],
  calls: {
    storm(m, ctx) {
      ctx.fx.flash?.('rgba(255,255,255,.4)', 0.2); ctx.fx.shake(0.6, 0.6);
      ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 4, z: m.pos.z }, 40, '#9fe8ff', 9);
      ctx.bus.emit('sfx', { name: 'roar', pos: m.pos, low: true });
      if (m.authority && m.over <= 0) m.charge = Math.min(100, m.charge + 35);
    },
  },
  pose: mTrack([[0, {}], [0.8, { neck: -0.6, head: -35, jaw: 40, bodyPitch: -14, spread: 1, bodyY: 0.15 }], [1.8, { neck: -0.6, head: -35, jaw: 40, bodyPitch: -14, spread: 1 }], [2.6, {}]]),
};

// ---- Überladen 1: Kettenblitz (Telegraph 0,8 s Kamm leuchtet): Kreis um das Ziel, springt auf jeden Pirscher im Umkreis 6 m, 22 je Sprung
const kettenblitz = {
  id: 'voltaro_kettenblitz', range: [0, 28], weight: 6, cooldown: 6, stam: 6, telegraph: 0.8, duration: 2.0, flashParts: ['antennenkamm'], tempo: 1,
  cue: { color: '#9fe8ff', tone: 'schrill' }, cond: (m) => m.over > 0, hits: [],
  marker: { at: 'target', radius: VOLTARO.CHAIN_HIT_R }, markerUntil: 1.05,
  events: [{ t: 1.0, call: 'strike', all: true }],
  calls: {
    strike(m, ctx, inst) {
      const t = inst.target, y = ctx.world.heightAt(t.x, t.z);
      ctx.fx.spark({ x: t.x, y: y + 1, z: t.z }, 30, '#9fe8ff', 8);
      ctx.fx.shake(0.3, 0.25);
      ctx.bus.emit('sfx', { name: 'zap', pos: t });
      const chain = chainTargets(ctx, t);
      m._lastChain = chain.map((c) => ({ id: c.p.id, gen: c.gen }));
      for (const { p, gen } of chain) {
        ctx.fx.spark({ x: p.pos.x, y: p.pos.y + 1.2, z: p.pos.z }, 14, '#d0f4ff', 6);
        if (p.local) zap(m, p, VOLTARO.CHAIN_DMG, `${inst.key}:c${gen}`, 'voltaro_kettenblitz');
      }
    },
  },
  pose: mTrack([[0, {}], [0.5, { spread: 1, neck: -0.3, head: -18, bodyPitch: -6, legL: 25, legR: 25 }], [0.9, { spread: 1, neck: -0.35, head: -22, bodyPitch: -8 }], [1.05, { neck: 0.3, head: 12, bodyPitch: 8 }, 'lin'], [2.0, {}]]),
};

// ---- Überladen 2: Donnerschlag – 5 Blitze nacheinander auf markierte Kreise, je 0,6 s Vorwarnung (Erdung schützt)
const DON = { n: 5, warn: 0.6, gap: 0.55, r: 2.3, dmg: 28 };
const donnerschlag = {
  id: 'voltaro_donnerschlag', range: [0, 30], weight: 4, cooldown: 10, stam: 14, telegraph: 0.8, duration: 4.4, flashParts: ['antennenkamm', 'spulen'], tempo: 1,
  cue: { color: '#ffffff', tone: 'droehn' }, cond: (m) => m.over > 0, hits: [],
  events: [{ t: 0.85, call: 'sched', all: true }],
  calls: {
    sched(m, ctx, inst, age = 0) {
      const base = m.time - age;
      for (let i = 0; i < DON.n; i++) {
        const ang = inst.r(2 * i) * Math.PI * 2, dd = i === 0 ? 0 : 2 + inst.r(2 * i + 1) * 6;
        addBolt(m, inst.target.x + Math.sin(ang) * dd, inst.target.z + Math.cos(ang) * dd, DON.r, base + i * DON.gap + DON.warn, DON.warn, DON.dmg, `${inst.key}:d${i}`, 'voltaro_donnerschlag');
      }
    },
  },
  pose: mTrack([[0, {}], [0.6, { spread: 1, neck: -0.5, head: -30, jaw: 20, bodyPitch: -12, bodyY: 0.15 }], [3.6, { spread: 1, neck: -0.5, head: -30, jaw: 20, bodyPitch: -12, bodyY: 0.15 }], [4.4, {}]]),
};

// ---- Überladen 3: Plasmasprung – Sprung aufs Ziel + Schockwelle 6 m, 34
const plasma = {
  id: 'voltaro_plasma', range: [3, 22], weight: 4, cooldown: 8, stam: 14, telegraph: 0.75, duration: 2.4, flashParts: ['spulen', 'koerper'], audit: [8, 14],
  cue: { color: '#9fe8ff', tone: 'knurr' }, cond: (m) => m.over > 0,
  marker: { at: 'landing', radius: 6 }, markerUntil: 1.45,
  prepare(a) { a.landing = { x: a.target.x, z: a.target.z }; },
  hits: [{ t0: 1.3, t1: 1.45, shape: 'sphere', at: [0, 0.6, 0], radius: 6, dmg: 34, knock: 'down' }],
  motion(tau, a) {
    const k = clamp01((tau - 0.75) / 0.55), e = smooth(k);
    return { x: a.origin.x + (a.landing.x - a.origin.x) * e, z: a.origin.z + (a.landing.z - a.origin.z) * e, air: 7 * Math.sin(Math.PI * k) };
  },
  events: [{ t: 1.3, call: 'wave', all: true }],
  calls: { wave(m, ctx) { for (let i = 0; i < 3; i++) ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 0.3, z: m.pos.z }, 16, '#9fe8ff', 8 + i * 3); ctx.fx.shake(0.55, 0.35); ctx.bus.emit('sfx', { name: 'zap', pos: m.pos }); } },
  pose: mTrack([[0, {}], [0.6, { bodyY: -0.5, legL: 50, legR: 50, bodyPitch: 8, spread: 1 }], [0.95, { bodyY: 0.3, legL: -30, legR: -30, bodyPitch: -14 }], [1.3, { bodyPitch: 16, legL: 40, legR: 40, bodyY: -0.3 }, 'lin'], [1.7, { bodyPitch: 4, spread: 0.5 }], [2.4, {}]]),
};

// ======================================================= Definition
export const voltaro = {
  id: 'voltaro',
  name: 'Voltaro, der Funkenfürst',
  hp: 22000,
  scale: SC,
  bodyRadius: 2.0,
  predator: true,
  walk: 3.6, run: 9.5, detect: 36, prefer: 5, turn: 1.15,
  recoverAfter: (m) => (0.3 + m.rng() * 0.45) / m.speedMul,
  drops: ['voltaro_kamm', 'voltaro_spule', 'voltaro_fell', 'voltaro_herz'],
  glitchSpots: ['antennenkamm', 'spulen'],
  parts: [
    { id: 'kopf', label: 'Kopf', factor: 1.0, jitter: 0.07, elem: { fire: 20, shock: 0, rost: 20 }, blunt: true, stunPart: true, spheres: [{ node: 'head', offset: [0, 0, 0.45], r: 0.5 }] },
    { id: 'antennenkamm', label: 'Antennenkamm', factor: 0.9, breakHp: 900, jitter: 0.07, elem: { fire: 20, shock: 0, rost: 20 }, blunt: false, spheres: [{ node: 'comb', offset: [0, 0.55, 0.05], r: 0.6 }] },
    { id: 'prankeL', label: 'Linke Pranke', factor: 0.8, breakHp: 700, jitter: 0.06, elem: { fire: 20, shock: 0, rost: 20 }, blunt: true, spheres: [{ node: 'legFL', offset: [0, -0.6, 0.1], r: 0.5 }] },
    { id: 'prankeR', label: 'Rechte Pranke', factor: 0.8, breakHp: 700, jitter: 0.06, elem: { fire: 20, shock: 0, rost: 20 }, blunt: true, spheres: [{ node: 'legFR', offset: [0, -0.6, 0.1], r: 0.5 }] },
    { id: 'spulen', label: 'Rückenspulen', factor: 0.8, jitter: 0.05, elem: { fire: 20, shock: 0, rost: 20 }, blunt: false, spheres: [{ node: 'body', offset: [0, 0.65, 0.5], r: 0.55 }, { node: 'body', offset: [0, 0.65, -0.5], r: 0.55 }] },
    { id: 'tail', label: 'Schwanz', factor: 0.7, breakHp: 1000, jitter: 0.06, elem: { fire: 20, shock: 0, rost: 20 }, blunt: false, spheres: [{ node: 'tail2', offset: [0, 0, -0.6], r: 0.45 }, { node: 'tail3', offset: [0, 0, -0.5], r: 0.4 }, { node: 'tail3', offset: [0, 0, -1.1], r: 0.38 }] },
    { id: 'koerper', label: 'Körper', factor: 0.6, elem: { fire: 20, shock: 0, rost: 20 }, spheres: [{ node: 'body', offset: [0, 0, 0.25], r: 0.85 }, { node: 'body', offset: [0, 0, -0.55], r: 0.75 }, { node: 'neck', offset: [0, 0.25, 0.15], r: 0.4 }, { node: 'legRL', offset: [0, -0.6, 0], r: 0.45 }, { node: 'legRR', offset: [0, -0.6, 0], r: 0.45 }] },
  ],
  attacks: {
    voltaro_pranken: pranken, voltaro_pranken2: pranken2, voltaro_pranken3: pranken3, voltaro_spulen: spulen, voltaro_funkenlauf: funkenlauf,
    voltaro_aufladen: aufladen, voltaro_sturmruf: sturmruf, voltaro_kettenblitz: kettenblitz, voltaro_donnerschlag: donnerschlag, voltaro_plasma: plasma,
  },
  chains: {
    voltaro_pranken: [{ atk: 'voltaro_pranken2', w: 6 }, { atk: null, w: 1 }],
    voltaro_pranken2: [{ atk: 'voltaro_pranken3', w: 3 }, { atk: 'voltaro_spulen', w: 2 }, { atk: null, w: 3 }],
    voltaro_spulen: [{ atk: 'voltaro_funkenlauf', w: 2 }, { atk: null, w: 3 }],
    voltaro_kettenblitz: [{ atk: 'voltaro_donnerschlag', w: 3 }, { atk: 'voltaro_plasma', w: 3 }, { atk: null, w: 2 }],
    voltaro_donnerschlag: [{ atk: 'voltaro_plasma', w: 3 }, { atk: null, w: 3 }],
  },
  phases: [{
    at: 0.4, name: 'Gewittersturm', cue: { color: '#9fe8ff', tone: 'schrill' }, special: 'voltaro_sturmruf',
    enter(m) { // zerstört 2 Blitzableiter (Host), Gewitter + schnellere Ladung ab jetzt
      const ia = m.ctx.interact;
      if (!ia?.rods) return;
      scanRods(m);
      const rods = [...(m._rods ?? [])].sort((a, b) => flat(m.pos, a) - flat(m.pos, b)).slice(0, 2);
      m._ownDestroy = true;
      for (const r of rods) ia.destroyRod(r.id);
      m._ownDestroy = false;
      scanRods(m);
    },
  }],
  teachAttack: 'voltaro_pranken', stamina: true, flinchDmg: 1500,
  build: () => buildVoltaro({ scale: SC }),
  deadPose: { bodyY: -1.0, bodyRoll: 80, head: 20, neck: -0.3, legL: 40, legR: -30 },
  snapExtra: (m) => ({ charge: Math.round(m.charge ?? 0), over: (m.over ?? 0) > 0, tailGone: !!m.severedTail }),
  onBreak(m, part) {
    if (part.id === 'tail') severTail(m);
    else if (part.id === 'antennenkamm') {
      m.extra.glowMats.comb.color.set('#222');
      if (m.over > 0) endOverload(m, true);
      else m.charge = Math.min(m.charge, 40);
    }
  },
  onStatus(m, type) { if (type === 'blind' && m.over > 0 && m.authority) endOverload(m, true); },
  onDamage(m, res) {
    if (res.partId !== 'antennenkamm' || !m.authority) return;
    if (m.over > 0) { m.over -= res.dmg / 25; m.charge = Math.max(0, 100 * m.over / VOLTARO.OVER_TIME); if (m.over <= 0) { m.over = 0.001; endOverload(m, true); } }
    else m.charge = Math.max(0, m.charge - res.dmg / 40);
  },
  onAttackEnd(m, id) {
    if (!m.authority || m.over > 0) return;
    if (id === 'voltaro_aufladen') return;
    m.charge = Math.min(100, m.charge + (id === 'voltaro_funkenlauf' ? 8 : 5) * (m.phase > 0 ? 1.5 : 1) * (m.partById.antennenkamm.broken ? 0.5 : 1));
  },
  init(m) {
    m.charge = 0; m.over = 0;
    m._bolts = []; m._trail = []; m._rods = []; m._rodPos = {}; m._rodScan = 0; m._lastLoad = -6; m._stormT = 0; m._stormN = 0; m._stormNext = 2; m._glow = 0; m._trailHit = new Map();
    m._fireOff = false;
    // Tempo: Überladen +30 %
    const base = Object.getOwnPropertyDescriptor(Monster.prototype, 'speedMul').get;
    Object.defineProperty(m, 'speedMul', { get() { return base.call(this) * (this.over > 0 ? VOLTARO.OVER_SPEED : 1); } });
    // Aufladen läuft zum nächsten intakten Blitzableiter (targetPos = Ableiterposition, geht so in die Netz-Parameter)
    const orig = m.beginAttack.bind(m);
    m.beginAttack = (id, extra = {}) => {
      if (id === 'voltaro_aufladen') {
        scanRods(m);
        const r = nearestRod(m);
        extra = { ...extra, targetPos: r ? { x: r.x, y: m.ctx.world.heightAt(r.x, r.z), z: r.z } : { x: m.pos.x, y: m.pos.y, z: m.pos.z } };
        m._lastLoad = m.time; m._loadRod = !!r;
      }
      return orig(id, extra);
    };
    // Umgeworfener Ableiter in der Nähe bricht Überladen ab (nicht der eigene Zerstörungsakt in Phase 2)
    m._offs.push(m.ctx.bus.on('rodDestroyed', (e) => {
      if (!m.authority || m._ownDestroy || m.over <= 0 || !m.alive) return;
      const r = m._rodPos[e?.id];
      if (r && flat(m.pos, r) <= 30) endOverload(m, true);
    }));
  },
  tick(m, dt) {
    if (!m.alive) { for (const b of m._bolts) m.ctx.fx.clearMarker?.(`${m.id}:b${b.n}`); m._bolts.length = 0; return; }
    const ctx = m.ctx, auth = m.authority;

    // ---- Host: Ableiter-Liste, Ladung, Überladen
    if (auth) {
      m._rodScan -= dt;
      if (m._rodScan <= 0) { m._rodScan = 0.5; scanRods(m); }
      const a = m.attack, combat = m.state === 'combat' || m.state === 'enrage';
      if (m.over > 0) {
        m.over -= dt;
        m.charge = Math.max(0, 100 * m.over / VOLTARO.OVER_TIME);
        if (m.over <= 0) { m.over = 0.001; endOverload(m, false); }
      } else {
        const p2 = m.phase > 0 ? 2 : 1, ck = m.partById.antennenkamm.broken ? 0.5 : 1;
        if (combat && !m.tired) m.charge = Math.min(100, m.charge + 0.5 * p2 * ck * dt);
        if (a?.id === 'voltaro_aufladen') {
          const tau = a.inst.sample(a.t).tau;
          if (tau >= LOAD.bolt && tau <= LOAD.bolt + LOAD.hold) {
            const near = m._loadRod && flat(m.pos, a.inst.target) <= 8;
            m.charge = Math.min(100, m.charge + (near ? VOLTARO.LOAD_GAIN / LOAD.hold : 6) * (m.phase > 0 ? 1.4 : 1) * ck * dt);
          }
        }
        if (m.charge >= 100) startOverload(m);
        else if (combat && !a && !m.queued && !m.chainNext && !m.tired && m._taught && m.stagT <= 0 && m.stunT <= 0 && m.charge < (m.phase > 0 ? 85 : 65)
          && (m.cds.voltaro_aufladen ?? 0) <= 0 && m.time - m._lastLoad > (m.phase > 0 ? 12 : 18)) m.queued = 'voltaro_aufladen';
      }
    }

    // ---- Feuer-Schwäche nur im ungeladenen Zustand
    const ld = loaded(m) || (!auth && m._glow >= 0.5);
    if (ld !== m._fireOff) {
      m._fireOff = ld;
      for (const p of m.parts) p.elem.fire = ld ? 0 : (p.baseElem.fire ?? 0);
    }

    // ---- Gewitter (Phase 2): deterministisch aus Monster-ID + Index, Vorwarnung >= 0,6 s (1,0 s)
    if (m.phase > 0) {
      m._stormT += dt;
      if (m._stormT >= m._stormNext) {
        const rr = createRng(hashStr(m.id) + m._stormN * 7919);
        const cx = Math.round(m.pos.x / 6) * 6, cz = Math.round(m.pos.z / 6) * 6, ang = rr() * Math.PI * 2, dd = rr() * 16;
        addBolt(m, cx + Math.sin(ang) * dd, cz + Math.cos(ang) * dd, 2.2, m.time + 1.0, 1.0, 24, `storm${m._stormN}`, 'voltaro_gewitter');
        m._stormNext += 2.2 + rr() * 1.6 - (m.over > 0 ? 0.6 : 0);
        m._stormN++;
      }
    }

    // ---- Blitze (Warnmarker -> Einschlag): nur der lokale Pirscher nimmt Schaden, Erdung schützt vor Donnerschlag
    for (let i = m._bolts.length - 1; i >= 0; i--) {
      const b = m._bolts[i], mk = `${m.id}:b${b.n}`;
      if (m.time < b.at) {
        if (m.time >= b.warnAt) ctx.fx.marker(mk, { x: b.x, y: ctx.world.heightAt(b.x, b.z), z: b.z }, b.r, '#9fe8ff', m.time > b.at - 0.25);
        continue;
      }
      ctx.fx.clearMarker?.(mk);
      m._bolts.splice(i, 1);
      ctx.fx.spark({ x: b.x, y: ctx.world.heightAt(b.x, b.z) + 1, z: b.z }, 24, '#d0f4ff', 8);
      ctx.fx.shake(0.18, 0.2);
      ctx.bus.emit('sfx', { name: 'zap', pos: { x: b.x, y: 0, z: b.z } });
      for (const p of ctx.players ?? []) {
        if (!p.local || !p.alive || flat(p.pos, b) > b.r) continue;
        if (b.attackId === 'voltaro_donnerschlag' && isGrounded(ctx, p)) continue;
        zap(m, p, b.dmg, b.key, b.attackId);
      }
    }

    // ---- Funkenspur: 10/s im Umkreis 1,4 m (alle 0,5 s 5 Schaden), 4 s
    if (m._trail.length) {
      m._trail = m._trail.filter((t) => t.until > m.time);
      for (const p of ctx.players ?? []) {
        if (!p.local || !p.alive) continue;
        if (!m._trail.some((t) => flat(p.pos, t) <= FL.r)) continue;
        const nxt = m._trailHit.get(p.id) ?? 0;
        if (m.time >= nxt) { m._trailHit.set(p.id, m.time + 0.5); zap(m, p, FL.dps * 0.5, `trail:${Math.floor(m.time * 2)}`, 'voltaro_funkenlauf'); }
      }
      if (ctx.fx.spark && Math.floor(m.time * 6) !== Math.floor((m.time - dt) * 6)) { const t = m._trail[(Math.floor(m.time * 6)) % m._trail.length]; if (t) ctx.fx.spark({ x: t.x, y: ctx.world.heightAt(t.x, t.z) + 0.3, z: t.z }, 2, '#ffe14d', 2.5); }
    }

    // ---- Glühen (Gäste: aus laufenden Überladen-Angriffen abgeleitet)
    if (!auth) {
      const id = m.attack?.id;
      if (id === 'voltaro_kettenblitz' || id === 'voltaro_donnerschlag' || id === 'voltaro_plasma') m._glowHold = 3;
      m._glowHold = Math.max(0, (m._glowHold ?? 0) - dt);
      m._glow = m._glowHold > 0 ? 1 : m._glow * Math.exp(-dt);
    } else m._glow = m.over > 0 ? 1 : m.charge / 100;
    m.extra.setGlow?.(m._glow + (m.over > 0 ? 0 : Math.sin(m.time * 6) * 0.05 * m._glow), m.over > 0 || (!auth && m._glowHold > 0));
  },
};

// Endboss-Tempo ~1,25 (Warnungen der Blitzangriffe bleiben unverkürzt)
for (const a of Object.values(voltaro.attacks)) if (a.tempo === undefined) a.tempo = TEMPO;
