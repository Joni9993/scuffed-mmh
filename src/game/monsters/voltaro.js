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
import { MIN_TELEGRAPH } from './attack.js';

const R = Math.PI / 180;
const SC = 2.4;

export const VOLTARO = {
  OVER_TIME: 60, OVER_SPEED: 1.3, EXH_FORCED: 4, EXH_NATURAL: 2,
  LOAD_GAIN: 50, // Ladung pro Aufladen am Ableiter (3 s)
  CHAIN_R: 6, CHAIN_DMG: 28, CHAIN_HIT_R: 2.8, STORM_P2: 2, ROD_NEAR: 30,
};

// ---- Texturen
const speckle = (cols, density = 1) => (g, n, rnd) => {
  g.fillStyle = cols[0]; g.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (rnd() > density) continue; g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(x, y, 1, 1); }
};
registerTexture('voltaro_fur', (g, n, rnd) => {
  speckle(['#454e6c', '#3c4560', '#505a7a', '#343c56'])(g, n, rnd);
  g.fillStyle = '#e8c13a';
  for (let i = 0; i < n * 0.7; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1);
  g.fillStyle = '#1f2438';
  for (let y = 2; y < n; y += 6) g.fillRect(0, y, n, 1);
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
 * Procedural Voltaro: geduckter Funken-Raubtier-Körper (hohe Schultern, kräftige Vorderläufe), Rückenkamm aus 4 Kupfer-Spulentürmen
 * mit überspringenden Funkenbögen, Hörner-/Antennenkranz am Kopf, langer segmentierter Schwanz mit Glühkugel.
 * Parts: kopf, antennenkamm (Kopfkranz), prankeL/R (Vorderläufe), spulen (Rückentürme), tail (abtrennbar), koerper.
 * Pose keys: MREST; legL/legR = Vorderbeine (Hinterbeine gegenläufig), spread = Kranz/Türme aufgerichtet (0..1).
 */
export function buildVoltaro({ scale = SC } = {}) {
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  root.add(g);
  const partMeshes = { kopf: [], antennenkamm: [], prankeL: [], prankeR: [], spulen: [], tail: [], koerper: [] };
  const mats = {};
  const mat = (part, t) => (mats[part + t] ??= lambert({ map: tex(t, { size: 16 }) }));
  const glowMats = { comb: basic({ color: '#5a3a18' }), coil: basic({ color: '#5a3a18' }), eye: basic({ color: '#ffe14d' }), arc: basic({ color: '#bfe9ff' }) };
  const reg = (part, mesh, parent, x, y, z, rx, ry, rz) => {
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    parent.add(mesh);
    partMeshes[part].push(mesh);
    return mesh;
  };
  const add = (part, w, h, d, m, parent, x, y, z, rx = 0, ry = 0, rz = 0) => reg(part, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), parent, x, y, z, rx, ry, rz);
  const cyl = (part, rt, rb, h, m, parent, x, y, z, seg = 6) => reg(part, new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m), parent, x, y, z, 0, 0, 0);
  const gem = (part, r, m, parent, x, y, z) => reg(part, new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), m), parent, x, y, z, 0, 0, 0);
  const BASE = 1.15;
  const body = new THREE.Group();
  body.position.y = BASE;
  g.add(body);
  const fur = (p) => mat(p, 'voltaro_fur'), cu = (p) => mat(p, 'voltaro_copper'), claw = (p) => mat(p, 'voltaro_claw');
  // Rumpf: breite Brust + Schulterbuckel, nach hinten niedriger
  add('koerper', 1.1, 1.05, 1.1, fur('koerper'), body, 0, 0.1, 0.5);
  add('koerper', 0.95, 0.4, 0.75, fur('koerper'), body, 0, 0.62, 0.42);
  add('koerper', 0.85, 0.75, 0.9, fur('koerper'), body, 0, 0, -0.45);
  add('koerper', 0.9, 0.8, 0.7, fur('koerper'), body, 0, -0.08, -1.0);
  add('koerper', 0.75, 0.3, 2.1, mat('koerper', 'voltaro_belly'), body, 0, -0.42, -0.1);
  for (const sx of [1, -1]) add('koerper', 0.3, 0.2, 0.5, cu('koerper'), body, sx * 0.62, 0.52, 0.5, 0, 0, -sx * 0.3); // Schulterplatten

  // Rückenkamm: 4 Kupfer-Spulentürme (nach hinten geneigt), Funkenbögen zwischen den Spitzen
  const LEAN = -0.12, towers = [[0.55, 0.8, 0.95], [0, 0.4, 1.1], [-0.55, 0.34, 0.95], [-1.05, 0.28, 0.7]], tops = [];
  for (const [z, by, h] of towers) {
    const tw = new THREE.Group();
    tw.position.set(0, by, z);
    tw.rotation.x = LEAN;
    body.add(tw);
    add('spulen', 0.1, h, 0.1, cu('spulen'), tw, 0, h / 2, 0);
    for (let k = 0; k < 3; k++) cyl('spulen', 0.17 - k * 0.025, 0.2 - k * 0.025, 0.12, cu('spulen'), tw, 0, 0.18 + k * ((h - 0.35) / 2.2), 0);
    gem('spulen', 0.17, glowMats.coil, tw, 0, h + 0.1, 0);
    tops.push({ y: by + (h + 0.1) * Math.cos(LEAN), z: z + (h + 0.1) * Math.sin(LEAN), tw });
  }
  const arcs = [];
  for (let i = 0; i < tops.length - 1; i++) {
    const a = tops[i], b = tops[i + 1];
    let dy = b.y - a.y, dz = b.z - a.z;
    if (dz < 0) { dy = -dy; dz = -dz; }
    const len = Math.hypot(dy, dz);
    arcs.push(add('spulen', 0.05, 0.05, len, glowMats.arc, body, 0, (a.y + b.y) / 2, (a.z + b.z) / 2, -Math.atan2(dy, dz)));
  }

  const neck = new THREE.Group();
  neck.position.set(0, 0.2, 1.0);
  body.add(neck);
  add('koerper', 0.62, 0.62, 0.7, fur('koerper'), neck, 0, 0.1, 0.3);
  const head = new THREE.Group();
  head.position.set(0, 0.35, 0.65);
  neck.add(head);
  add('kopf', 0.72, 0.56, 0.75, fur('kopf'), head, 0, 0, 0.25);
  add('kopf', 0.42, 0.3, 0.6, fur('kopf'), head, 0, -0.1, 0.78);
  add('kopf', 0.2, 0.14, 0.12, cu('kopf'), head, 0, -0.04, 1.12);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.22, 0.1);
  head.add(jaw);
  add('kopf', 0.36, 0.1, 0.85, mat('kopf', 'voltaro_belly'), jaw, 0, 0, 0.5);
  for (const sx of [1, -1]) {
    add('kopf', 0.05, 0.16, 0.05, claw('kopf'), head, sx * 0.13, -0.28, 1.0);
    add('kopf', 0.05, 0.14, 0.05, claw('kopf'), jaw, sx * 0.12, 0.12, 0.85);
    add('kopf', 0.12, 0.1, 0.12, glowMats.eye, head, sx * 0.3, 0.1, 0.52);
    add('kopf', 0.06, 0.36, 0.4, cu('kopf'), head, sx * 0.4, -0.02, 0.1, 0, 0, sx * 0.4); // Wangenflossen
  }
  // Hörner-/Antennenkranz (Teil antennenkamm)
  const comb = new THREE.Group();
  comb.position.set(0, 0.28, 0.1);
  head.add(comb);
  add('antennenkamm', 0.55, 0.08, 0.5, cu('antennenkamm'), comb, 0, 0, 0.05);
  for (const sx of [1, -1]) {
    add('antennenkamm', 0.12, 0.5, 0.12, cu('antennenkamm'), comb, sx * 0.24, 0.22, -0.1, -0.6, 0, -sx * 0.3);
    add('antennenkamm', 0.1, 0.45, 0.1, cu('antennenkamm'), comb, sx * 0.38, 0.52, -0.46, -1.0, 0, -sx * 0.4);
    add('antennenkamm', 0.11, 0.11, 0.11, glowMats.comb, comb, sx * 0.43, 0.62, -0.72);
    const h = 0.7;
    add('antennenkamm', 0.05, h, 0.05, cu('antennenkamm'), comb, sx * 0.14, h / 2, 0.12, -0.1, 0, -sx * 0.15);
    add('antennenkamm', 0.1, 0.1, 0.1, glowMats.comb, comb, sx * 0.14 + sx * 0.06, h + 0.02, 0.08);
  }
  add('antennenkamm', 0.05, 1.05, 0.05, cu('antennenkamm'), comb, 0, 0.52, 0.1, -0.15);
  add('antennenkamm', 0.11, 0.11, 0.11, glowMats.comb, comb, 0, 1.08, 0.02);

  // Vorderläufe (Pranken, Teile) kräftig, Hinterläufe kurz und gebeugt (Körper)
  const legs = {};
  for (const [name, sx, part] of [['legFL', 1, 'prankeL'], ['legFR', -1, 'prankeR']]) {
    const l = new THREE.Group();
    l.position.set(sx * 0.64, -0.1, 0.6);
    body.add(l);
    add(part, 0.5, 0.55, 0.62, fur(part), l, 0, 0.08, 0);
    add(part, 0.46, 0.6, 0.5, fur(part), l, 0, -0.32, 0.05, 0.25);
    add(part, 0.36, 0.55, 0.4, fur(part), l, 0, -0.74, 0.12, -0.2);
    add(part, 0.44, 0.14, 0.48, cu(part), l, 0, -0.66, 0.1); // Kupfermanschette
    add(part, 0.5, 0.16, 0.7, fur(part), l, 0, -1.0, 0.26);
    for (const cx of [-0.16, 0, 0.16]) add(part, 0.06, 0.06, 0.38, claw(part), l, cx, -1.0, 0.76);
    legs[name] = l;
  }
  for (const [name, sx] of [['legRL', 1], ['legRR', -1]]) {
    const l = new THREE.Group();
    l.position.set(sx * 0.5, -0.15, -0.95);
    body.add(l);
    add('koerper', 0.5, 0.7, 0.8, fur('koerper'), l, 0, -0.05, 0);
    add('koerper', 0.4, 0.6, 0.45, fur('koerper'), l, 0, -0.4, -0.1, 0.5);
    add('koerper', 0.28, 0.55, 0.32, fur('koerper'), l, 0, -0.72, -0.3, -0.6);
    add('koerper', 0.38, 0.12, 0.6, cu('koerper'), l, 0, -1.0, -0.1);
    legs[name] = l;
  }

  // Schwanz: 3 Gelenkgruppen, 5 Segmente, Kupferbänder, Glühkugel im Käfig
  const tail1 = new THREE.Group();
  tail1.position.set(0, 0.05, -1.3);
  body.add(tail1);
  add('koerper', 0.5, 0.45, 1.0, fur('koerper'), tail1, 0, 0, -0.45, -0.05);
  const tail2 = new THREE.Group();
  tail2.position.set(0, 0, -0.95);
  tail1.add(tail2);
  add('tail', 0.4, 0.36, 0.9, fur('tail'), tail2, 0, 0, -0.42, -0.05);
  add('tail', 0.46, 0.1, 0.3, cu('tail'), tail2, 0, 0.02, -0.5);
  add('tail', 0.32, 0.3, 0.8, fur('tail'), tail2, 0, 0, -1.3);
  const tail3 = new THREE.Group();
  tail3.position.set(0, 0, -1.65);
  tail2.add(tail3);
  add('tail', 0.26, 0.24, 0.8, fur('tail'), tail3, 0, 0, -0.4);
  add('tail', 0.32, 0.08, 0.26, cu('tail'), tail3, 0, 0.02, -0.45);
  for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) add('tail', 0.06, 0.06, 0.55, cu('tail'), tail3, sx * 0.2, sy * 0.2, -1.05, sy * 0.4, -sx * 0.4, 0);
  gem('tail', 0.22, glowMats.coil, tail3, 0, 0, -1.1);

  const nodes = { body, neck, head, jaw, comb, tail1, tail2, tail3, legFL: legs.legFL, legFR: legs.legFR, legRL: legs.legRL, legRR: legs.legRR, root: g };
  const towerGroups = tops.map((t) => t.tw);
  let glowK = 0, flick = 12345;
  return {
    root, nodes, partMeshes,
    extra: {
      tail2, tailBase: tail1, g, scale, glowMats, comb,
      /** g 0..1 Ladungsglühen, over = Überladen (cyanfarben). */
      setGlow(gl, over) {
        glowK = gl;
        _c.copy(GLOW_OFF).lerp(over ? GLOW_OVER : GLOW_ON, clamp01(gl));
        glowMats.comb.color.copy(_c); glowMats.coil.color.copy(_c);
        glowMats.eye.color.set(over ? '#9fe8ff' : gl > 0.6 ? '#ffb030' : '#ffe14d');
        glowMats.arc.color.set(over ? '#ffffff' : '#bfe9ff');
      },
    },
    apply(p) {
      body.position.y = BASE + p.bodyY / scale;
      body.rotation.set(p.bodyPitch * R, 0, p.bodyRoll * R);
      neck.rotation.x = 0.3 + p.neck;
      head.rotation.set(-(0.3 + p.neck) + p.head * R, p.headYaw * R, 0);
      jaw.rotation.x = p.jaw * R;
      comb.scale.y = 1 + p.spread * 0.45;
      for (const tw of towerGroups) tw.scale.y = 1 + p.spread * 0.3;
      tail1.rotation.set(p.tailPitch * R, p.tailYaw * R, 0);
      tail2.rotation.set(p.tailPitch * 0.6 * R, p.tailYaw * 0.9 * R, 0);
      tail3.rotation.set(p.tailPitch * 0.4 * R, p.tailYaw * 0.9 * R, 0);
      legs.legFL.rotation.x = -p.legL * R;
      legs.legFR.rotation.x = -p.legR * R;
      legs.legRL.rotation.x = p.legR * R * 0.8;
      legs.legRR.rotation.x = p.legL * R * 0.8;
      // Funkenbögen zwischen den Spulen: flackern, je geladener desto öfter (nur Optik, kein Spielzustand)
      flick = (Math.imul(flick, 1103515245) + 12345) >>> 0;
      for (let i = 0; i < arcs.length; i++) arcs[i].visible = ((flick >>> (8 + i * 3)) & 7) / 8 < 0.12 + 0.6 * Math.max(glowK, p.spread);
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
const noOver = (m) => m.over <= 0;
const normalW = (base, over = 0.3) => (m) => (m.over > 0 ? base * over : base);
/** Überladen-Markierung im Seed (Bit 30): wird beim Start gesetzt, geht mit den Angriffsparametern ans Netz -> Gäste spielen dasselbe schnellere Tempo. */
export const OVER_FLAG = 0x40000000;
export const isOverSeed = (seed) => (seed ?? 0) >= OVER_FLAG;
const aimOf = (a) => { const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z; return Math.hypot(dx, dz) < 0.8 ? a.yaw0 : Math.atan2(dx, dz); };

/**
 * Prankenhieb mit Ausfallschritt: dreht während des Telegraphs zum Ziel (bis ~0,1 s vor dem Treffer), schiebt dann `L` m vor
 * (L = Zielabstand - reach, geklemmt auf [minL, maxL]) – die Trefferkugel sitzt an der Pfote vor dem Körper.
 * stages: [{ a, b, f }] = Vorschub-Anteil f zwischen den Def-Zeiten a..b (Summe 1).
 */
function strike({ id, tg, dur, turn, stages, minL = 0.8, maxL = 3.8, reach = 1.5, ...rest }) {
  return {
    id, telegraph: tg, duration: dur, noFace: false,
    prepare(a) {
      const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz);
      a.aim = aimOf(a);
      a.L = Math.min(maxL, Math.max(minL, d - reach));
    },
    motion(tau, a) {
      const yaw = a.yaw0 + wrapAngle(a.aim - a.yaw0) * smooth(clamp01(tau / turn));
      let k = 0;
      for (const s of stages) k += s.f * smooth(clamp01((tau - s.a) / (s.b - s.a)));
      return { x: a.origin.x + Math.sin(a.aim) * a.L * k, z: a.origin.z + Math.cos(a.aim) * a.L * k, yaw };
    },
    ...rest,
  };
}

// ---- 1. Prankenhiebe: Ausfallschritt + Hieb, 2–3er Kombo (Kette pranken -> pranken2 -> pranken3)
const PK = { dmg: 38 };
const pranken = strike({
  id: 'voltaro_pranken', range: [0, 8.5], weight: normalW(8, 0.75), cooldown: 1.5, stam: 4, tg: 0.6, dur: 1.5, turn: 0.5, stages: [{ a: 0.42, b: 0.66, f: 1 }],
  flashParts: ['prankeL'], audit: [3, 5.5, 7.5],
  cue: { color: '#e8c13a', tone: 'knurr' }, hits: [{ t0: 0.62, t1: 0.88, shape: 'sphere', at: [0.5, 1.3, 2.2], radius: 1.9, dmg: PK.dmg, knock: 'flinch' }],
  pose: mTrack([[0, {}], [0.4, { legL: 70, bodyPitch: -6, bodyY: 0.1, head: -8, tailYaw: -20 }], [0.6, { legL: 85, bodyPitch: -10 }], [0.85, { legL: -40, bodyPitch: 14, head: 8, bodyY: -0.2 }, 'lin'], [1.5, {}]]),
});
const pranken2 = strike({
  id: 'voltaro_pranken2', internal: true, range: [0, 9], weight: 0, cooldown: 0, stam: 4, tg: 0.5, dur: 1.35, turn: 0.38, stages: [{ a: 0.3, b: 0.52, f: 1 }], minL: 0.5, maxL: 3,
  flashParts: ['prankeR'], audit: [3.5, 6],
  cue: { color: '#e8c13a', tone: 'klick' }, hits: [{ t0: 0.5, t1: 0.74, shape: 'sphere', at: [-0.5, 1.3, 2.2], radius: 1.9, dmg: PK.dmg, knock: 'flinch' }],
  pose: mTrack([[0, {}], [0.3, { legR: 70, bodyPitch: -6, bodyY: 0.1, tailYaw: 20 }], [0.5, { legR: 85, bodyPitch: -10 }], [0.74, { legR: -40, bodyPitch: 14, bodyY: -0.2 }, 'lin'], [1.35, {}]]),
});
const pranken3 = strike({
  id: 'voltaro_pranken3', internal: true, range: [0, 9], weight: 0, cooldown: 0, stam: 6, tg: 0.55, dur: 2.0, turn: 0.42, stages: [{ a: 0.32, b: 0.55, f: 0.55 }, { a: 0.85, b: 1.0, f: 0.45 }], minL: 0.6, maxL: 3.4,
  flashParts: ['prankeL', 'prankeR'], audit: [3.5, 6],
  cue: { color: '#ffb030', tone: 'droehn' },
  hits: [{ t0: 0.55, t1: 0.78, shape: 'sphere', at: [0, 1.0, 2.2], radius: 2.1, dmg: PK.dmg - 2, knock: 'flinch' }, { t0: 0.98, t1: 1.2, shape: 'sphere', at: [0, 0.8, 2.4], radius: 2.4, dmg: PK.dmg + 8, knock: 'down' }],
  pose: mTrack([[0, {}], [0.4, { legL: 75, legR: 75, bodyPitch: -14, bodyY: 0.3 }], [0.55, { legL: 85, legR: 85, bodyPitch: -16 }], [0.78, { legL: -30, legR: -30, bodyPitch: 12 }, 'lin'], [0.95, { legL: 70, legR: 70, bodyPitch: -14, bodyY: 0.3 }], [1.2, { legL: -40, legR: -40, bodyPitch: 14 }, 'lin'], [2.0, {}]]),
});

// ---- 2. Spulensprung: Rückwärtssalto, danach Schwanzwirbel 36 (nur mit Schwanz); Kettenglied vor Pranken/Blitzfeld
const SPU = { back: 2.2, spin: Math.PI * 1.5, t0: 1.3, t1: 1.9 };
const spulen = {
  id: 'voltaro_spulen', range: [1.5, 6], weight: normalW(3, 0.5), cooldown: 5, stam: 8, telegraph: 0.6, duration: 2.6, flashParts: ['spulen', 'tail'], audit: [2.5, 4.5], noFace: false,
  cue: { color: '#ff9030', tone: 'zisch' }, lockedByBreak: 'tail',
  marker: { at: 'self', radius: 7.5 }, markerUntil: 1.3,
  hits: [{ t0: SPU.t0 + 0.05, t1: SPU.t1, shape: 'capsule', from: [0, 1.3, -1.8], to: [0, 1.3, -7.5], radius: 1.1, dmg: 42, knock: 'flinch' }],
  motion(tau, a) {
    const k = smooth(clamp01((tau - 0.6) / 0.65)), sign = a.r(0) < 0.5 ? 1 : -1;
    return {
      x: a.origin.x - a.dir.x * SPU.back * k, z: a.origin.z - a.dir.z * SPU.back * k, air: 3.2 * Math.sin(Math.PI * clamp01((tau - 0.6) / 0.65)),
      yaw: a.yaw0 + sign * SPU.spin * smooth(clamp01((tau - SPU.t0) / (SPU.t1 - SPU.t0))),
    };
  },
  events: [{ t: 1.25, call: 'land', all: true }],
  calls: { land(m, ctx) { ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 0.3, z: m.pos.z }, 18, '#9fe8ff', 6); ctx.fx.shake(0.25, 0.25); } },
  pose: mTrack([[0, {}], [0.45, { bodyY: -0.4, legL: 45, legR: 45, bodyPitch: 8 }], [0.8, { bodyPitch: 140, bodyY: 0.5, legL: -30, legR: -30, spread: 1 }, 'lin'], [1.25, { bodyPitch: 360, bodyY: 0, spread: 0.6 }, 'lin'], [1.3, { tailYaw: 55, tailPitch: -8 }], [1.9, { tailYaw: -55 }, 'lin'], [2.6, {}]]),
};

// ---- 3. Funkenlauf: echter Sturmangriff. Lauf durchs Ziel und darüber hinaus, bremst, dreht EINMAL nach (180°), läuft zurück durchs Ziel
// und endet mit einem Schwanz-Schlag (Fächer ±46° nach hinten, also über die Linie – seitlich ausweichen entkommt allem). Funkenspur 4 s.
const FL = { run0: 0.6, leg1: 1.55, turn1: 2.05, leg2: 2.65, whip0: 2.75, whip1: 3.2, over: 4.5, drift: 1.5, back: 1.0, sweep: 1.6, trail: 4, dps: 14, r: 1.4 };
const funkenlauf = {
  id: 'voltaro_funkenlauf', range: [6, 15], weight: normalW(4, 0.7), cooldown: 7, stam: 10, telegraph: 0.6, duration: 4.2, flashParts: ['koerper', 'spulen'], audit: [8, 12], noFace: false,
  cue: { color: '#ffe14d', tone: 'brumm' },
  marker: { at: 'target', radius: 2.5 }, markerUntil: 0.6,
  prepare(a) {
    const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz);
    const ux = d < 1 ? a.dir.x : dx / d, uz = d < 1 ? a.dir.z : dz / d;
    a.aim = Math.atan2(ux, uz); a.u = { x: ux, z: uz }; a.sgn = a.r(0) < 0.5 ? 1 : -1;
    a.P1 = { x: a.target.x + ux * FL.over, z: a.target.z + uz * FL.over };
    a.P1d = { x: a.P1.x + ux * FL.drift, z: a.P1.z + uz * FL.drift };
    a.P3 = { x: a.target.x - ux * FL.back, z: a.target.z - uz * FL.back };
  },
  hits: [
    { t0: 0.7, t1: 1.6, shape: 'sphere', at: [0, 1.4, 2.2], radius: 1.9, dmg: 28, knock: 'flinch' },
    { t0: 2.1, t1: 2.7, shape: 'sphere', at: [0, 1.4, 2.2], radius: 1.9, dmg: 28, knock: 'flinch' },
    { t0: FL.whip0 + 0.1, t1: FL.whip1, shape: 'capsule', from: [0, 1.1, -1.6], to: [0, 1.1, -6.2], radius: 1.2, dmg: 40, knock: 'flinch' },
  ],
  motion(tau, a) {
    const lerp = (A, B, k) => ({ x: A.x + (B.x - A.x) * k, z: A.z + (B.z - A.z) * k });
    const O = { x: a.origin.x, z: a.origin.z };
    if (tau < FL.run0) return { ...O, yaw: a.yaw0 + wrapAngle(a.aim - a.yaw0) * smooth(clamp01(tau / FL.run0)) };
    if (tau < FL.leg1) { const k = clamp01((tau - FL.run0) / (FL.leg1 - FL.run0)); return { ...lerp(O, a.P1, 0.45 * k + 0.55 * smooth(k)), yaw: a.aim }; }
    if (tau < FL.turn1) { const k = clamp01((tau - FL.leg1) / (FL.turn1 - FL.leg1)); return { ...lerp(a.P1, a.P1d, 1 - (1 - k) * (1 - k)), yaw: a.aim + a.sgn * Math.PI * smooth(k) }; }
    const yawBack = a.aim + a.sgn * Math.PI;
    if (tau < FL.leg2) { const k = clamp01((tau - FL.turn1) / (FL.leg2 - FL.turn1)); return { ...lerp(a.P1d, a.P3, 0.4 * k + 0.6 * smooth(k)), yaw: yawBack }; }
    // Schwanz-Schlag: Ausholen ± sweep/2, dann durchziehen
    const wind = smooth(clamp01((tau - FL.leg2) / (FL.whip0 - FL.leg2))), whip = smooth(clamp01((tau - FL.whip0) / (FL.whip1 - FL.whip0)));
    return { ...a.P3, yaw: yawBack + a.sgn * FL.sweep * (-0.5 * wind + whip) };
  },
  events: Array.from({ length: 16 }, (_, i) => ({ t: 0.75 + i * 0.14, call: 'trail', all: true })),
  calls: { trail(m) { (m._trail ??= []).push({ x: m.pos.x, z: m.pos.z, until: m.time + FL.trail }); if (m._trail.length > 60) m._trail.shift(); m.ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 0.5, z: m.pos.z }, 6, '#ffe14d', 4); } },
  pose: mTrack([[0, {}], [0.5, { bodyY: -0.3, bodyPitch: 10, legL: 30, legR: -30 }], [0.65, { bodyPitch: 14, bodyY: -0.2, tailPitch: -10, spread: 0.6 }], [1.2, { bodyPitch: 12, legL: 55, legR: -55, tailPitch: -14, bodyRoll: 8, spread: 0.6 }], [1.6, { bodyPitch: 6, legL: -30, legR: 30, bodyRoll: 0 }], [2.0, { bodyPitch: -4, bodyY: -0.3, legL: 40, legR: 40, bodyRoll: -12 }], [2.4, { bodyPitch: 12, legL: 55, legR: -55, tailPitch: -14, bodyRoll: -8, spread: 0.6 }], [2.7, { bodyPitch: 0, tailYaw: 50, tailPitch: -6, bodyY: -0.1 }], [3.2, { tailYaw: -60, tailPitch: -6 }, 'lin'], [4.2, {}]]),
};

// ---- 4. Blitzfeld: 4–6 Ladungspunkte in Muster (Linie / Kreuz / Ring) um das Ziel, gestaffelt zündend (Boden-Marker ab dem Ausholen)
const BF = { warn: 0.85, gap: 0.3, r: 2.0, dmg: 40 };
/** Muster der Ladungspunkte (rein, aus Zielposition + Seed): [{ x, z, d }] mit d = Zünd-Verzögerung nach der Vorwarnung. */
export function fieldPoints(inst, over = false) {
  const T = inst.target, o = inst.origin, dx = T.x - o.x, dz = T.z - o.z, dd = Math.hypot(dx, dz);
  const ux = dd > 1 ? dx / dd : inst.dir.x, uz = dd > 1 ? dz / dd : inst.dir.z, vx = -uz, vz = ux;
  const gap = over ? BF.gap * 0.75 : BF.gap, pat = Math.min(2, Math.floor(inst.r(0) * 3)), pts = [];
  if (pat === 0) { // Linie: Welle läuft durchs Ziel vom Brocken weg – seitlich raus
    const n = over ? 6 : 5;
    for (let i = 0; i < n; i++) { const s = (i - 1) * 3.4; pts.push({ x: T.x + ux * s, z: T.z + uz * s, d: i * gap }); }
  } else if (pat === 1) { // Kreuz: vier Arme (Reihenfolge nach Seed), Mitte zuletzt – die Diagonalen sind sicher
    const first = Math.floor(inst.r(2) * 4), cw = inst.r(3) < 0.5 ? 1 : -1;
    for (let k = 0; k < 4; k++) {
      const arm = (first + cw * k + 4) % 4, ax = arm % 2 ? vx : ux, az = arm % 2 ? vz : uz, sg = arm < 2 ? 1 : -1;
      pts.push({ x: T.x + ax * sg * 4.4, z: T.z + az * sg * 4.4, d: k * gap });
    }
    pts.push({ x: T.x, z: T.z, d: 4 * gap + 0.25 });
  } else { // Ring: 5 Punkte mit Lücken, Mitte zuletzt
    const a0 = inst.r(3) * Math.PI * 2, cw = inst.r(2) < 0.5 ? 1 : -1;
    for (let k = 0; k < 5; k++) { const a = a0 + cw * k * Math.PI * 2 / 5; pts.push({ x: T.x + Math.sin(a) * 5.4, z: T.z + Math.cos(a) * 5.4, d: k * gap }); }
    pts.push({ x: T.x, z: T.z, d: 5 * gap + 0.2 });
  }
  return pts;
}
const blitzfeld = {
  id: 'voltaro_blitzfeld', range: [0, 24], weight: normalW(5, 1.4), cooldown: 6, stam: 8, telegraph: 0.8, duration: 3.0, flashParts: ['antennenkamm', 'spulen'], tempo: 1,
  cue: { color: '#9fe8ff', tone: 'schrill' }, hits: [],
  events: [{ t: 0.8, call: 'sched', all: true }],
  calls: {
    sched(m, ctx, inst, age = 0) {
      const over = isOverSeed(inst.params.seed), base = m.time - age, r = BF.r + (over ? 0.3 : 0), dmg = BF.dmg * (over ? 1.15 : 1);
      fieldPoints(inst, over).forEach((p, i) => {
        const warn = BF.warn - (over ? 0.1 : 0) + p.d;
        addBolt(m, p.x, p.z, r, base + warn, warn, dmg, `${inst.key}:f${i}`, 'voltaro_blitzfeld');
      });
      ctx.bus.emit('sfx', { name: 'zap', pos: inst.target });
    },
  },
  pose: mTrack([[0, {}], [0.6, { spread: 1, neck: -0.4, head: -25, jaw: 20, bodyPitch: -10, bodyY: 0.15, legL: 25, legR: 25 }], [0.9, { spread: 1, neck: -0.4, head: -25, bodyPitch: -10, bodyY: 0.15 }], [1.2, { neck: 0.3, head: 10, bodyPitch: 8, spread: 0.6, legL: -20, legR: -20 }, 'lin'], [3.0, {}]]),
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

// ---- Überladen 1: Kettenblitz (Telegraph 0,8 s Kamm leuchtet): Kreis um das Ziel, springt auf jeden Pirscher im Umkreis 6 m, 28 je Sprung.
// Überladen (Seed-Flag): größerer Kreis + weiterer Sprungradius, dazu zwei markierte Nachzünder um das Ziel -> trifft öfter.
const kettenblitz = {
  id: 'voltaro_kettenblitz', range: [0, 28], weight: 6, cooldown: 5, stam: 4, telegraph: 0.8, duration: 2.0, flashParts: ['antennenkamm'], tempo: 1,
  cue: { color: '#9fe8ff', tone: 'schrill' }, cond: (m) => m.over > 0, hits: [],
  marker: { at: 'target', radius: VOLTARO.CHAIN_HIT_R }, markerUntil: 1.05,
  events: [{ t: 1.0, call: 'strike', all: true }],
  calls: {
    strike(m, ctx, inst) {
      const t = inst.target, y = ctx.world.heightAt(t.x, t.z);
      ctx.fx.spark({ x: t.x, y: y + 1, z: t.z }, 30, '#9fe8ff', 8);
      ctx.fx.shake(0.3, 0.25);
      ctx.bus.emit('sfx', { name: 'zap', pos: t });
      const ov = m.over > 0 || isOverSeed(inst.params.seed);
      const chain = chainTargets(ctx, t, VOLTARO.CHAIN_HIT_R + (ov ? 0.7 : 0), VOLTARO.CHAIN_R + (ov ? 1.5 : 0));
      if (ov) for (let i = 0; i < 2; i++) {
        const ang = inst.r(2 * i) * Math.PI * 2, dd = 3 + inst.r(2 * i + 1) * 2, w = 0.7 + i * 0.5;
        addBolt(m, t.x + Math.sin(ang) * dd, t.z + Math.cos(ang) * dd, 2.4, m.time + w, w, 24, `${inst.key}:n${i}`, 'voltaro_kettenblitz');
      }
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
const DON = { n: 5, warn: 0.6, gap: 0.5, r: 2.3, dmg: 34 };
const donnerschlag = {
  id: 'voltaro_donnerschlag', range: [0, 30], weight: 4, cooldown: 8, stam: 8, telegraph: 0.8, duration: 4.4, flashParts: ['antennenkamm', 'spulen'], tempo: 1,
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

// ---- Überladen 3: Plasmasprung – Sprung aufs Ziel + Schockwelle 6 m, 44 (Kettenglied -> Pranken / Blitzfeld)
const plasma = {
  id: 'voltaro_plasma', range: [3, 22], weight: 4, cooldown: 6, stam: 8, telegraph: 0.75, duration: 2.4, flashParts: ['spulen', 'koerper'], audit: [8, 14],
  cue: { color: '#9fe8ff', tone: 'knurr' }, cond: (m) => m.over > 0,
  marker: { at: 'landing', radius: 6 }, markerUntil: 1.45,
  prepare(a) { a.landing = { x: a.target.x, z: a.target.z }; },
  hits: [{ t0: 1.3, t1: 1.45, shape: 'sphere', at: [0, 0.6, 0], radius: 6, dmg: 44, knock: 'down' }],
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
  hp: 18500,
  scale: SC,
  bodyRadius: 2.0,
  predator: true,
  walk: 3.6, run: 9.5, detect: 36, prefer: 5, turn: 1.15,
  recoverAfter: (m) => (0.12 + m.rng() * 0.28) / m.speedMul,
  drops: ['voltaro_kamm', 'voltaro_spule', 'voltaro_fell', 'voltaro_herz'],
  glitchSpots: ['antennenkamm', 'spulen'],
  parts: [
    { id: 'kopf', label: 'Kopf', factor: 1.0, jitter: 0.07, elem: { fire: 20, shock: 0, rost: 20 }, blunt: true, stunPart: true, spheres: [{ node: 'head', offset: [0, 0, 0.45], r: 0.5 }] },
    { id: 'antennenkamm', label: 'Antennenkamm', factor: 0.9, breakHp: 900, jitter: 0.07, elem: { fire: 20, shock: 0, rost: 20 }, blunt: false, spheres: [{ node: 'comb', offset: [0, 0.55, 0.0], r: 0.6 }] },
    { id: 'prankeL', label: 'Linke Pranke', factor: 0.8, breakHp: 700, jitter: 0.06, elem: { fire: 20, shock: 0, rost: 20 }, blunt: true, spheres: [{ node: 'legFL', offset: [0, -0.6, 0.1], r: 0.5 }] },
    { id: 'prankeR', label: 'Rechte Pranke', factor: 0.8, breakHp: 700, jitter: 0.06, elem: { fire: 20, shock: 0, rost: 20 }, blunt: true, spheres: [{ node: 'legFR', offset: [0, -0.6, 0.1], r: 0.5 }] },
    { id: 'spulen', label: 'Rückenspulen', factor: 0.8, jitter: 0.05, elem: { fire: 20, shock: 0, rost: 20 }, blunt: false, spheres: [{ node: 'body', offset: [0, 1.15, 0.55], r: 0.55 }, { node: 'body', offset: [0, 0.95, 0], r: 0.55 }, { node: 'body', offset: [0, 0.8, -0.55], r: 0.5 }, { node: 'body', offset: [0, 0.55, -1.05], r: 0.45 }] },
    { id: 'tail', label: 'Schwanz', factor: 0.7, breakHp: 1000, jitter: 0.06, elem: { fire: 20, shock: 0, rost: 20 }, blunt: false, spheres: [{ node: 'tail2', offset: [0, 0, -0.5], r: 0.5 }, { node: 'tail2', offset: [0, 0, -1.3], r: 0.45 }, { node: 'tail3', offset: [0, 0, -0.45], r: 0.4 }, { node: 'tail3', offset: [0, 0, -1.1], r: 0.4 }] },
    { id: 'koerper', label: 'Körper', factor: 0.6, elem: { fire: 20, shock: 0, rost: 20 }, spheres: [{ node: 'body', offset: [0, 0.1, 0.45], r: 0.95 }, { node: 'body', offset: [0, 0, -0.55], r: 0.8 }, { node: 'neck', offset: [0, 0.25, 0.15], r: 0.4 }, { node: 'legRL', offset: [0, -0.6, 0], r: 0.45 }, { node: 'legRR', offset: [0, -0.6, 0], r: 0.45 }] },
  ],
  attacks: {
    voltaro_pranken: pranken, voltaro_pranken2: pranken2, voltaro_pranken3: pranken3, voltaro_spulen: spulen, voltaro_funkenlauf: funkenlauf, voltaro_blitzfeld: blitzfeld,
    voltaro_aufladen: aufladen, voltaro_sturmruf: sturmruf, voltaro_kettenblitz: kettenblitz, voltaro_donnerschlag: donnerschlag, voltaro_plasma: plasma,
  },
  chains: {
    // Überladen: Ketten brechen nicht mehr ab (null nur ungeladen)
    voltaro_pranken: [{ atk: 'voltaro_pranken2', w: 8 }, { atk: null, w: 1, cond: noOver }],
    voltaro_pranken2: [{ atk: 'voltaro_pranken3', w: 5 }, { atk: 'voltaro_blitzfeld', w: 2 }, { atk: 'voltaro_spulen', w: 1 }, { atk: null, w: 2, cond: noOver }],
    voltaro_pranken3: [{ atk: 'voltaro_blitzfeld', w: 1 }, { atk: null, w: 3 }],
    voltaro_spulen: [{ atk: 'voltaro_pranken', w: 6 }, { atk: 'voltaro_blitzfeld', w: 3 }, { atk: 'voltaro_funkenlauf', w: 2 }, { atk: null, w: 1, cond: noOver }],
    voltaro_funkenlauf: [{ atk: 'voltaro_pranken', w: 3 }, { atk: 'voltaro_blitzfeld', w: 3 }, { atk: null, w: 2, cond: noOver }],
    voltaro_blitzfeld: [{ atk: 'voltaro_pranken', w: 4 }, { atk: 'voltaro_funkenlauf', w: 2 }, { atk: null, w: 3, cond: noOver }],
    voltaro_kettenblitz: [{ atk: 'voltaro_donnerschlag', w: 3 }, { atk: 'voltaro_plasma', w: 3 }, { atk: 'voltaro_blitzfeld', w: 2 }, { atk: null, w: 1 }],
    voltaro_donnerschlag: [{ atk: 'voltaro_plasma', w: 3 }, { atk: 'voltaro_pranken', w: 2 }, { atk: null, w: 2, cond: noOver }],
    voltaro_plasma: [{ atk: 'voltaro_pranken', w: 5 }, { atk: 'voltaro_blitzfeld', w: 3 }, { atk: null, w: 1 }],
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
      } else if (m.over > 0 && m.authority && extra.seed === undefined && !m.def.attacks[id]?.internal) {
        extra = { ...extra, seed: (Math.floor(m.rng() * 1e9) | OVER_FLAG) >>> 0 }; // Überladen-Flag reist im Seed mit (Netz-Protokoll bleibt unverändert)
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
        addBolt(m, cx + Math.sin(ang) * dd, cz + Math.cos(ang) * dd, 2.2, m.time + 1.0, 1.0, 30, `storm${m._stormN}`, 'voltaro_gewitter');
        m._stormNext += 1.9 + rr() * 1.4 - (m.over > 0 ? 0.6 : 0);
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

// Überladen = spürbar gefährlicher: alle Hauptangriffe laufen nach dem Telegraph ~18 % schneller (Flag im Seed, auch bei Gästen),
// Telegraph bleibt >= 0,5 s. Dazu: Ketten brechen nicht ab (noOver), Blitzfeld dichter, Kettenblitz mit Nachzündern.
const OVER_SPEED_UP = 1.18;
for (const a of Object.values(voltaro.attacks)) {
  if (a.internal && !/pranken/.test(a.id)) continue;
  const prep = a.prepare;
  a.prepare = (inst) => {
    if (isOverSeed(inst.params.seed)) {
      inst.speed *= OVER_SPEED_UP;
      inst.tgWall = Math.max(MIN_TELEGRAPH, inst.tgWall * 0.92);
      inst.duration = inst.tgWall + (a.duration - a.telegraph) / inst.speed;
    }
    prep?.(inst);
  };
}
