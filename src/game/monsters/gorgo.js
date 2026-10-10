import * as THREE from 'three';
import { lambert, basic } from '../../render/ps1.js';
import { tex, registerTexture } from '../../render/textures.js';
import { mTrack } from './monster.js';
import { smooth, clamp01 } from './common.js';

// Gorgo, der Schlackwurm (JR 5, GDD 15.5): ~18 m langer Wurm aus Kopf + 6 Segmenten. Gräbt sich ein (unverwundbar, Schlacke-Hügel),
// taucht mit Bodenwarnung unter dem Ziel auf, spuckt Lava-Brocken, saugt an und peitscht mit dem Körper.
// Alles host-autoritativ + deterministisch: Graben/Auftauchen sind normale Angriffe (Position aus Attack-params), `m.burrowed` wird
// ausschließlich durch deren Events gesetzt (Gäste replayen sie), Zwangs-Auftauchen (Knallgurke/Schrottkran) läuft über Betäubung.

const R = Math.PI / 180;
const SEGS = ['segment1', 'segment2', 'segment3', 'segment4', 'segment5', 'segment6'];
const HEAD_Z = 5.6, SEG_GAP = 2.3;
const BURROW_BOMB_R = 3.6;
export const GORGO_STUN = 8;
const SOG_PULL = 4.5, SOG_RANGE = 12, SOG_CONE = 0.62, SOG_FROM = 0.9, SOG_LEN = 2.0, POOL_SECS = 6;

// ---- Texturen (PS1, 16 px)
const speckle = (cols, density = 1) => (g, n, rnd) => {
  g.fillStyle = cols[0]; g.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (rnd() > density) continue; g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(x, y, 1, 1); }
};
registerTexture('gorgo_slag', (g, n, rnd) => {
  speckle(['#3a3330', '#2e2826', '#463d38', '#241f1d'])(g, n, rnd);
  g.fillStyle = '#e0561a';
  for (let i = 0; i < n * 0.8; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1);
  g.fillStyle = '#1a1614';
  for (let y = 3; y < n; y += 5) g.fillRect(0, y, n, 1);
});
registerTexture('gorgo_head', (g, n, rnd) => {
  speckle(['#50443c', '#463a33', '#5c4e44', '#3a302a'])(g, n, rnd);
  g.fillStyle = '#ff7a20';
  for (let i = 0; i < 6; i++) { const x = (rnd() * n) | 0, y = (rnd() * n) | 0; g.fillRect(x, y, 3, 1); g.fillRect(x + 2, y + 1, 1, 2); }
});
registerTexture('gorgo_maw', speckle(['#a02810', '#c8381a', '#80200c', '#e0541e']));
registerTexture('gorgo_tooth', speckle(['#d8d0b8', '#c4bca4', '#e6dfca']));

/**
 * Wurm: Wurzel `g` -> `body` (Kopf + 6 Segmente als Kette, +z = vorn) und `mound` (Schlacke-Hügel für den Grabzustand).
 * Pose-Schlüssel (MREST): bodyY = Absenkung (m), neck = Aufrichten (m), head = Kopfneigung (Grad, + = nach unten), jaw = Maul (Grad),
 * headYaw, tailYaw = Auslenkung hinten, legL = Wellen-Zusatz, bodyRoll = Seitenneigung.
 */
export function buildGorgo() {
  const root = new THREE.Group();
  const g = new THREE.Group();
  root.add(g);
  const body = new THREE.Group();
  g.add(body);
  const partMeshes = { kopf: [] };
  for (const s of SEGS) partMeshes[s] = [];
  const mats = {};
  const mat = (part, t, opts = {}) => (mats[part + t] ??= lambert({ map: tex(t, { size: 16 }), ...opts }));
  const add = (part, w, h, d, m, parent, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    parent.add(mesh);
    if (part) partMeshes[part].push(mesh);
    return mesh;
  };

  // Kopf
  const head = new THREE.Group();
  body.add(head);
  add('kopf', 2.9, 2.5, 3.0, mat('kopf', 'gorgo_head'), head, 0, 0.1, 0.2);
  add('kopf', 2.2, 0.5, 1.4, mat('kopf', 'gorgo_slag'), head, 0, 1.45, -0.3, -0.15); // Nackenplatte
  for (const sx of [1, -1]) add('kopf', 0.5, 0.5, 0.5, mat('kopf', 'gorgo_slag'), head, sx * 1.1, 1.2, 0.7, 0.3, 0.4 * sx, 0.2 * sx);
  const eyeM = basic({ color: '#ffb030' });
  for (const sx of [1, -1]) add('kopf', 0.28, 0.28, 0.2, eyeM, head, sx * 0.95, 0.65, 1.7);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.8, 0.5);
  head.add(jaw);
  add('kopf', 2.5, 0.55, 2.7, mat('kopf', 'gorgo_head'), jaw, 0, -0.1, 1.0);
  add('kopf', 2.1, 0.12, 2.3, mat('kopf', 'gorgo_maw'), jaw, 0, 0.2, 1.0); // Rachen unten
  const mawTop = add('kopf', 2.1, 0.12, 2.3, mat('kopf', 'gorgo_maw'), head, 0, -0.78, 0.75);
  for (const sx of [-0.85, -0.3, 0.3, 0.85]) {
    add('kopf', 0.28, 0.6, 0.28, mat('kopf', 'gorgo_tooth'), jaw, sx, 0.45, 2.1);
    add('kopf', 0.28, 0.6, 0.28, mat('kopf', 'gorgo_tooth'), head, sx, -1.15, 1.75);
  }

  // Segmente
  const segNodes = {};
  SEGS.forEach((id, i) => {
    const n = new THREE.Group();
    body.add(n);
    const w = 2.9 - i * 0.24, h = 2.6 - i * 0.2;
    add(id, w, h, 2.5, mat(id, 'gorgo_slag'), n, 0, 0, 0);
    add(id, w * 0.75, h * 0.35, 2.7, mat(id, 'gorgo_head'), n, 0, h * 0.5, 0); // Rückenplatte
    add(id, w + 0.25, 0.22, 0.5, basic({ color: '#ff6a18' }), n, 0, 0.1, 1.1); // Glutnaht (vorn)
    for (const sx of [1, -1]) add(id, 0.42, 0.42, 0.42, mat(id, 'gorgo_slag'), n, sx * (w * 0.5), 0.2, 0.2, 0.4, 0.6, 0.3);
    segNodes[id] = n;
  });
  const glowMeshes = [];
  body.traverse((o) => { if (o.material?.isMeshBasicMaterial && o.material.color.getHex() === 0xff6a18) glowMeshes.push(o); });

  // Hügel (eingegraben): Schlacke-Welle über dem Boden, glühender Kamm
  const mound = new THREE.Group();
  mound.visible = false;
  g.add(mound);
  const moundCones = [];
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(1.7 - i * 0.12, 1.5, 5), mat(null, 'gorgo_slag'));
    c.position.set(0, 0.2, 3 - i * 1.9);
    mound.add(c);
    const ember = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), basic({ color: '#ff7a20' }));
    ember.position.set(0, 0.85, 0);
    c.add(ember);
    moundCones.push(c);
  }

  const nodes = { root: g, body, head, jaw, ...segNodes };
  const wave = { phase: 0, amp: 0.4 };
  const broken = new Set();
  const layout = (p) => {
    const rise = p.neck, baseY = 1.3 + p.bodyY, ph = wave.phase, amp = wave.amp + p.legL * 0.02;
    const place = (node, u, z, riseK, extraYaw = 0) => {
      const sway = Math.sin(ph - u * 0.9) * amp * (0.25 + 0.14 * u) + p.tailYaw * 0.06 * u * u * 0.3;
      node.position.set(sway, baseY + rise * riseK + Math.sin(ph * 0.5 - u) * 0.06, z);
      node.rotation.y = Math.cos(ph - u * 0.9) * 0.16 * amp + extraYaw;
    };
    place(head, 0, HEAD_Z, 1, p.headYaw * R);
    head.rotation.x = p.head * R;
    jaw.rotation.x = p.jaw * R;
    mawTop.visible = p.jaw > 6;
    let j = 0;
    SEGS.forEach((id) => {
      if (broken.has(id)) return;
      const z = HEAD_Z - 2.9 - j * SEG_GAP;
      place(segNodes[id], j + 1, z, Math.max(0, 1 - (j + 1) * 0.42));
      segNodes[id].rotation.x = j === 0 ? -p.neck * 0.08 : 0;
      j++;
    });
  };
  return {
    root, nodes, partMeshes,
    extra: { body, mound, moundCones, eyeMat: eyeM, glowMeshes, wave, broken, segNodes, pools: [] },
    apply(p) {
      layout(p);
      g.rotation.z = p.bodyRoll * R * 0.4;
    },
  };
}

const brokenCount = (m) => SEGS.reduce((n, s) => n + (m.partById[s]?.broken ? 1 : 0), 0);

// ======================================================= Zustand "eingegraben"
function setBurrowed(m, on) {
  if (!!m.burrowed === on) return;
  m.burrowed = on;
  const ex = m.extra;
  ex.body.visible = !on;
  ex.mound.visible = on;
  m._hpStamp = m._lpStamp = -1;
  const at = { x: m.pos.x, y: m.pos.y + 0.4, z: m.pos.z };
  m.ctx.fx.spark(at, on ? 24 : 40, on ? '#3a3330' : '#ff7a20', on ? 5 : 8);
  m.ctx.bus.emit('gorgoBurrow', { monster: m, on });
}
/** Zwangs-Auftauchen: unterbricht den Angriff, optional benommen (Knallgurke/Schrottkran). */
export function forceEmerge(m, stun = GORGO_STUN) {
  if (!m.alive) return false;
  const was = !!m.burrowed;
  m._interrupt?.();
  m.queued = null;
  setBurrowed(m, false);
  if (stun > 0) { m.stunT = Math.max(m.stunT, stun); m.ctx.bus.emit('monsterStun', { monster: m }); }
  if (was) {
    m.ctx.fx.number({ x: m.pos.x, y: m.pos.y + 4, z: m.pos.z }, 'Herausgezwungen!', 'weak');
    m.ctx.fx.shake?.(0.5, 0.4);
    m.ctx.bus.emit('sfx', { name: 'break', pos: m.pos });
  }
  return was;
}

// ======================================================= Angriffe
const MOUTH = 5.0; // Maul-Abstand vor dem Wurzelpunkt (m)

// ---- 1. Graben/Wühlen (internal-Vorspiel zum Durchbruch): taucht ab, Hügel zieht auf das Ziel zu
const wuehlen = {
  id: 'gorgo_wuehlen', range: [0, 40], weight: (m) => (m.phase >= 1 ? 6 : 3), cooldown: 11, telegraph: 0.8, flashParts: ['kopf'], duration: 2.5, stam: 10,
  cue: { color: '#a07040', tone: 'knurr' }, tempo: 1,
  prepare(a) {
    const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz) || 1;
    a.travel = Math.max(0, Math.min(16, d * 0.85 - 1));
    a.ux = dx / d; a.uz = dz / d;
    a.aim = Math.atan2(dx, dz);
  },
  hits: [],
  events: [{ t: 0.82, call: 'under', all: true }],
  calls: { under(m) { setBurrowed(m, true); m.ctx.fx.shake?.(0.3, 0.3); m.ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos }); } },
  motion(tau, a) {
    const k = smooth(clamp01((tau - 0.82) / 1.6));
    return { x: a.origin.x + a.ux * a.travel * k, z: a.origin.z + a.uz * a.travel * k, yaw: a.yaw0 + wrapTo(a.aim - a.yaw0) * smooth(clamp01(tau / 0.8)) };
  },
  pose: mTrack([
    [0, {}], [0.4, { neck: 2.6, head: -18, jaw: 34 }], [0.65, { neck: 1.2, head: 40, jaw: 5, bodyY: -0.8 }], [0.85, { neck: 0, head: 55, bodyY: -3.2 }], [2.5, { bodyY: -3.2 }],
  ]),
};
function wrapTo(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

// ---- 2. Durchbruch (aus dem Boden unter dem Ziel): Bodenwarnung (Risse + Glühen + Rumpeln) >= 0,8 s, dann 30 Schaden + Wurf
const durchbruch = {
  id: 'gorgo_durchbruch', range: [0, 40], weight: 1, cooldown: 2, telegraph: 1.05, flashParts: [], duration: 2.7, stam: 0, internal: true, tgVar: false, noTeach: true,
  cue: { color: '#ff5a1a', tone: 'droehn' }, tempo: 1, audit: [3, 7],
  marker: { at: 'landing', radius: 3.9 }, markerUntil: 1.25,
  prepare(a) {
    const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz);
    a.step = Math.min(d, 9);
    a.ux = d > 0.01 ? dx / d : a.dir.x; a.uz = d > 0.01 ? dz / d : a.dir.z;
    a.landing = { x: a.origin.x + a.ux * a.step, z: a.origin.z + a.uz * a.step };
  },
  hits: [{ t0: 1.05, t1: 1.22, shape: 'sphere', at: [0, 0.6, 0], radius: 3.6, dmg: 30, knock: 'down' }],
  events: [{ t: 0, call: 'under', all: true }, { t: 0.5, call: 'rumble', all: true }, { t: 0.8, call: 'rumble', all: true }, { t: 1.05, call: 'surface', all: true }],
  calls: {
    under(m) { setBurrowed(m, true); },
    rumble(m, ctx, inst) {
      const L = inst.landing;
      for (let i = 0; i < 3; i++) ctx.fx.spark({ x: L.x + (inst.r(i) - 0.5) * 5, y: ctx.world.heightAt(L.x, L.z) + 0.2, z: L.z + (inst.r(i + 4) - 0.5) * 5 }, 6, i % 2 ? '#ff7a20' : '#2a2422', 3);
      ctx.fx.shake?.(0.15, 0.25);
      ctx.bus.emit('sfx', { name: 'heavy', pos: { x: L.x, y: 0, z: L.z } });
    },
    surface(m, ctx) {
      setBurrowed(m, false);
      ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 1, z: m.pos.z }, 50, '#ff7a20', 9);
      ctx.fx.shake?.(0.7, 0.4);
      ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos });
    },
  },
  motion(tau, a) {
    const k = smooth(clamp01(tau / 0.45));
    return { x: a.origin.x + a.ux * a.step * k, z: a.origin.z + a.uz * a.step * k };
  },
  pose: mTrack([
    [0, { bodyY: -3.2 }], [1.02, { bodyY: -3.2 }], [1.2, { bodyY: 0, neck: 3.6, head: -12, jaw: 38 }, 'lin'], [1.8, { neck: 3.0, head: 22, jaw: 10 }], [2.7, {}],
  ]),
};

// ---- 3. Schlackespucke: 3 (Glutkern: 5) glühende Brocken im Bogen, 15 Schaden + Rost, bleiben 6 s als Lava-Pfützen liegen
function spuckCall(n) {
  return (m, ctx, inst, age = 0) => {
    const o = inst.origin, a = inst.yaw0;
    const from = { x: o.x + Math.sin(a) * MOUTH, y: o.y + 3.4, z: o.z + Math.cos(a) * MOUTH };
    const dx = inst.target.x - from.x, dz = inst.target.z - from.z, dist = Math.hypot(dx, dz) || 1;
    for (let i = 0; i < n; i++) {
      let tx, tz;
      if (i === 0) { tx = inst.target.x + (inst.r(0) - 0.5) * 1.6; tz = inst.target.z + (inst.r(6) - 0.5) * 1.6; }
      else {
        const ang = Math.atan2(dx, dz) + (i % 2 ? 1 : -1) * (0.22 + 0.16 * Math.ceil(i / 2) + inst.r(i) * 0.12);
        const d = Math.max(4, Math.min(22, dist * (0.85 + inst.r(i + 6) * 0.3)));
        tx = from.x + Math.sin(ang) * d; tz = from.z + Math.cos(ang) * d;
      }
      const to = { x: tx, y: ctx.world.heightAt(tx, tz), z: tz };
      const dur = 0.85 + dist * 0.025 + inst.r(i + 3) * 0.12;
      const def = { kind: 'fire', mode: 'impact', from: { ...from }, to, dur, arc: 7, radius: 0.5, splash: 1.8, hold: POOL_SECS, dmg: 15, knock: 'flinch', status: { type: 'rost' }, key: `${inst.key}:s${i}`, attackId: inst.params.attackId };
      m.projectiles.spawn(def, age);
      m.extra.pools.push({ x: tx, y: to.y, z: tz, t0: m.time + dur - age, t1: m.time + dur - age + POOL_SECS, mesh: null });
    }
    ctx.fx.spark(from, 18, '#ff7a20', 6);
    ctx.bus.emit('sfx', { name: 'telegraph', pos: from });
  };
}
const spuckPose = mTrack([
  [0, {}], [0.4, { neck: 2.4, head: -22, jaw: 30, bodyY: 0.1 }], [0.8, { neck: 3.0, head: -28, jaw: 40 }], [0.95, { neck: 2.4, head: 18, jaw: 10 }, 'lin'], [1.4, { neck: 1.6, head: 10, jaw: 4 }], [2.4, {}],
]);
const spucke = {
  id: 'gorgo_spucke', range: [7, 24], weight: 5, cooldown: 5, telegraph: 0.8, flashParts: ['kopf'], duration: 2.4, stam: 8, tempo: 1.2,
  cue: { color: '#ff9a2a', tone: 'zisch' }, cond: (m) => m.phase < 1,
  hits: [], events: [{ t: 0.85, call: 'spuck', all: true }], calls: { spuck: spuckCall(3) }, pose: spuckPose,
};
const glutspucke = {
  id: 'gorgo_glutspucke', range: [5, 24], weight: 6, cooldown: 4, telegraph: 0.8, flashParts: ['kopf'], duration: 2.4, stam: 9, tempo: 1.2,
  cue: { color: '#ff3a10', tone: 'zisch' }, cond: (m) => m.phase >= 1,
  hits: [], events: [{ t: 0.85, call: 'spuck', all: true }], calls: { spuck: spuckCall(5) }, pose: spuckPose,
};

// ---- 4. Sog: Maul öffnet sich (0,9 s), zieht Pirscher im 12-m-Kegel 2 s an; Rolle bricht den Sog; im Maul 40 Schaden
const sog = {
  id: 'gorgo_sog', range: [6.5, SOG_RANGE], weight: 4, cooldown: 9, telegraph: 0.9, flashParts: ['kopf'], duration: 3.7, stam: 12, tempo: 1.0,
  cue: { color: '#a050ff', tone: 'brumm' }, audit: [8, 11],
  marker: { at: 'self', radius: 4 }, markerUntil: SOG_FROM,
  hits: [{ t0: SOG_FROM + 0.3, t1: SOG_FROM + SOG_LEN, shape: 'sphere', at: [0, 1.4, MOUTH - 0.4], radius: 1.8, dmg: 40, knock: 'down' }],
  events: [{ t: 0.1, call: 'open', all: true }],
  calls: { open(m, ctx) { ctx.bus.emit('sfx', { name: 'roar', pos: m.pos, low: true }); } },
  pose: mTrack([
    [0, {}], [0.5, { neck: 1.6, head: -10, jaw: 30 }], [0.9, { neck: 1.8, head: -6, jaw: 52 }], [2.9, { neck: 1.8, head: -6, jaw: 52 }], [3.2, { neck: 0.4, jaw: 8 }], [3.7, {}],
  ]),
};

/** Sog-Zug auf lokale Pirscher (jeder Client für den eigenen; rein aus Angriffszeit + Position, gegen Laufrichtung kämpfbar). */
function suctionTick(m, dt) {
  const at = m.attack;
  if (!at || at.id !== 'gorgo_sog') return;
  const s = at.inst.sample(at.t);
  if (s.tau < SOG_FROM || s.tau > SOG_FROM + SOG_LEN) return;
  const rolled = (at.inst._rolled ??= new Set());
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  const mx = s.x + fx * MOUTH, mz = s.z + fz * MOUTH;
  for (const p of m.ctx.players) {
    if (!p.local || !p.alive || p.suctionImmune) continue;
    if (p.state === 'roll') { rolled.add(p.id); continue; }
    if (rolled.has(p.id)) continue; // Rolle bricht den Sog für diesen Angriff
    const dx = p.pos.x - s.x, dz = p.pos.z - s.z, d = Math.hypot(dx, dz);
    if (d > SOG_RANGE || d < 0.5) continue;
    const dot = (dx * fx + dz * fz) / d;
    if (dot < Math.cos(SOG_CONE)) continue;
    const tx = mx - p.pos.x, tz = mz - p.pos.z, td = Math.hypot(tx, tz);
    if (td < 0.8) continue;
    p.pushV.x = (tx / td) * SOG_PULL; p.pushV.z = (tz / td) * SOG_PULL;
    p.pushT = Math.max(p.pushT, dt * 1.6);
    if (Math.random() < dt * 6) m.ctx.fx.spark({ x: p.pos.x, y: p.pos.y + 1, z: p.pos.z }, 1, '#c8b0ff', 1.5);
  }
}

// ---- 5. Körperpeitsche: Halbkreis vor dem Wurm, die Segmente schlagen (20 Schaden)
const PEITSCHE_LEN = 9;
const peitsche = {
  id: 'gorgo_peitsche', range: [0, 9.5], weight: 7, cooldown: 3, telegraph: 0.8, flashParts: ['segment1', 'segment2', 'segment3'], duration: 2.3, stam: 6, tempo: 1.2,
  cue: { color: '#c070ff', tone: 'klick' }, audit: [3, 6.5],
  marker: { at: 'self', radius: PEITSCHE_LEN }, markerUntil: 1.0,
  cond: (m) => brokenCount(m) < 4,
  hits: [{ t0: 0.95, t1: 1.5, shape: 'capsule', from: [0, 1.2, 1.2], to: [0, 1.2, PEITSCHE_LEN], radius: 1.5, dmg: 20, knock: 'flinch' }],
  motion(tau, a) {
    const sign = a.r(0) < 0.5 ? 1 : -1;
    return { yaw: a.yaw0 + sign * (-Math.PI / 2 * smooth(clamp01(tau / 0.8)) + Math.PI * smooth(clamp01((tau - 0.95) / 0.55))) };
  },
  pose: mTrack([
    [0, {}], [0.7, { tailYaw: 40, neck: 0.8, head: -8, bodyY: -0.2 }], [0.95, { tailYaw: 40, neck: 0.8 }], [1.5, { tailYaw: -50, neck: 0.4, legL: 40 }, 'lin'], [2.3, {}],
  ]),
};

// ---- 6. Schnappen (nur mit >= 2 gebrochenen Segmenten): kurzer Vorstoß-Biss, ersetzt Teile des Peitschen-Repertoires
const schnappen = {
  id: 'gorgo_schnappen', range: [0, 7], weight: 6, cooldown: 3, telegraph: 0.6, flashParts: ['kopf'], duration: 1.7, stam: 5, tempo: 1.2,
  cue: { color: '#40e0d0', tone: 'schrill' }, audit: [3, 5.5],
  cond: (m) => brokenCount(m) >= 2,
  hits: [{ t0: 0.62, t1: 0.8, shape: 'capsule', from: [0, 1.4, 3], to: [0, 1.4, 6.2], radius: 1.5, dmg: 22, knock: 'flinch' }],
  motion(tau, a) { const k = smooth(clamp01((tau - 0.5) / 0.15)) * 2.6 * (1 - smooth(clamp01((tau - 0.9) / 0.6))); return { x: a.origin.x + a.dir.x * k, z: a.origin.z + a.dir.z * k }; },
  pose: mTrack([
    [0, {}], [0.45, { neck: 2.0, head: -14, jaw: 40 }], [0.58, { neck: 2.0, head: -14, jaw: 42 }], [0.7, { neck: 0.8, head: 22, jaw: 2 }, 'lin'], [1.2, { neck: 0.4, head: 8 }], [1.7, {}],
  ]),
};

// ======================================================= Definition
export const gorgo = {
  id: 'gorgo',
  name: 'Gorgo',
  hp: 16000,
  scale: 1,
  bodyRadius: 2.8,
  walk: 3.0, run: 7.2, detect: 30, prefer: 9, turn: 0.8,
  recoverAfter: (m) => (0.4 + m.rng() * 0.5) / (1.2 * m.speedMul),
  speedFactor: (m) => 1 - 0.07 * brokenCount(m), // jedes gebrochene Segment: Wurm wird langsamer
  drops: ['gorgo_segment', 'gorgo_zahn', 'gorgo_kern'],
  glitchSpots: ['kopf', 'segment3'],
  parts: [
    { id: 'kopf', label: 'Kopf', factor: 1.0, elem: { fire: 0, shock: 20, rost: 25 }, blunt: true, stunPart: true,
      spheres: [{ node: 'head', offset: [0, 0, 0.9], r: 1.7 }] },
    ...SEGS.map((id, i) => ({
      id, label: `Segment ${i + 1}`, factor: 0.6, breakHp: 500, jitter: 0.06, elem: { fire: 0, shock: 20, rost: 25 },
      spheres: [{ node: id, offset: [0, 0, 0], r: 1.65 - i * 0.1 }],
    })),
  ],
  attacks: {
    gorgo_wuehlen: wuehlen, gorgo_durchbruch: durchbruch, gorgo_spucke: spucke, gorgo_glutspucke: glutspucke,
    gorgo_sog: sog, gorgo_peitsche: peitsche, gorgo_schnappen: schnappen,
  },
  // Brocken 2.0
  teachAttack: 'gorgo_spucke', stamina: true, flinchDmg: true,
  chains: {
    gorgo_spucke: [{ atk: 'gorgo_sog', w: 2 }, { atk: null, w: 2 }],
    gorgo_glutspucke: [{ atk: 'gorgo_glutspucke', w: 3 }, { atk: 'gorgo_sog', w: 1 }, { atk: 'gorgo_wuehlen', w: 2 }],
    gorgo_peitsche: [{ atk: 'gorgo_schnappen', w: 2 }, { atk: 'gorgo_wuehlen', w: 2 }, { atk: null, w: 2 }],
    gorgo_schnappen: [{ atk: 'gorgo_peitsche', w: 2 }, { atk: null, w: 2 }],
    gorgo_sog: [{ atk: 'gorgo_peitsche', w: 2 }, { atk: null, w: 1 }],
  },
  phases: [{ at: 0.5, name: 'Glutkern', cue: '#ff7a1a', special: 'gorgo_glutspucke', enter: (m) => { m.cds.gorgo_glutspucke = 0; m.cds.gorgo_wuehlen = Math.min(m.cds.gorgo_wuehlen ?? 0, 2); } }],
  build: () => buildGorgo(),
  init(m) {
    m.burrowed = false;
    m._idleB = 0;
  },
  onBreak(m, part) {
    if (!SEGS.includes(part.id)) return;
    part.gone = true; // Hurtbox weg, Segment-Mesh verschwindet, Wurm rückt zusammen (kürzer)
    m.extra.broken.add(part.id);
    for (const mesh of m.partMeshes[part.id]) mesh.visible = false;
    m.ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 1.5, z: m.pos.z }, 30, '#ff7a20', 8);
  },
  onDamage(m, res) {
    // Schrottkran (Umgebungsschaden) trifft auch den eingegrabenen Wurm: er wird herausgezwungen und betäubt
    if (m.burrowed && res?.env && m.alive) forceEmerge(m, GORGO_STUN);
  },
  onAttackEnd(m, id) {
    if (id === 'gorgo_wuehlen' && m.burrowed && m.alive) { m.queued = 'gorgo_durchbruch'; m.recover = 0; } // Wühlen läuft immer in den Durchbruch
    if (id === 'gorgo_durchbruch' && m.phase >= 1) m.cds.gorgo_wuehlen = Math.min(m.cds.gorgo_wuehlen ?? 0, 4); // Glutkern: häufiger graben
  },
  tick(m, dt) {
    const ex = m.extra;
    // ---- Eingraben-Wächter
    if (m.burrowed) {
      if (!m.alive || m.stunT > 0) setBurrowed(m, false); // betäubt (Knallgurke/Kran) oder tot: raus aus dem Boden
      else if (m.attack || m.queued || m.chainNext) m._idleB = 0;
      else if ((m._idleB += dt) > (m.authority ? 0.6 : 1.8)) { setBurrowed(m, false); m._idleB = 0; } // Sicherheitsnetz: nie dauerhaft unsichtbar
      // Knallgurke/Falle auf der Grabbahn zwingt ihn heraus (Host entscheidet; Gäste folgen über Betäubung im Snapshot)
      if (m.burrowed && m.authority) {
        for (const e of m.ctx.effects?.list ?? []) {
          if (e.kind !== 'bomb') continue;
          const bp = e.params?.pos;
          if (bp && Math.hypot(bp.x - m.pos.x, bp.z - m.pos.z) <= BURROW_BOMB_R) { forceEmerge(m, GORGO_STUN); break; }
        }
      }
    } else m._idleB = 0;
    ex.body.visible = !m.burrowed;
    ex.mound.visible = !!m.burrowed;
    // ---- Wellen / Hügel
    const spd = Math.hypot(m.vel.x, m.vel.z);
    const moving = m.attack?.id === 'gorgo_wuehlen' ? 1 : spd / 7;
    ex.wave.phase += dt * (1.6 + Math.min(1.5, moving) * 4);
    ex.wave.amp += ((m.stunT > 0 ? 0.1 : 0.35 + Math.min(1.2, moving) * 0.9) - ex.wave.amp) * Math.min(1, dt * 4);
    if (m.burrowed) {
      const gy = m.ctx.world.heightAt(m.pos.x, m.pos.z);
      ex.moundCones.forEach((c, i) => {
        c.position.y = Math.sin(ex.wave.phase * 1.4 - i * 0.9) * 0.25 + 0.1;
        c.position.x = Math.sin(ex.wave.phase - i * 0.9) * 0.4;
        c.scale.y = 0.8 + 0.3 * Math.sin(ex.wave.phase * 1.4 - i * 0.9 + 1);
      });
      if (Math.random() < dt * 14) m.ctx.fx.spark({ x: m.pos.x + (Math.random() - 0.5) * 3, y: gy + 1.1, z: m.pos.z + (Math.random() - 0.5) * 3 }, 1, Math.random() < 0.5 ? '#ff7a20' : '#3a3330', 1.4);
    }
    // ---- Glutkern: Glutnähte + Augen leuchten stärker
    const hot = m.phase >= 1;
    ex.eyeMat.color.set(hot ? '#ff3a10' : '#ffb030');
    // ---- Lava-Pfützen (6 s) + Sog-Zug
    const pools = ex.pools;
    for (let i = pools.length - 1; i >= 0; i--) {
      const q = pools[i];
      const live = m.time >= q.t0 && m.time <= q.t1 && m.alive;
      if (live && !q.mesh && m.ctx.scene) {
        q.mesh = new THREE.Mesh(poolGeo, poolMat);
        q.mesh.position.set(q.x, q.y + 0.08, q.z);
        q.mesh.scale.setScalar(1.8);
        m.ctx.scene.add(q.mesh);
      }
      if (q.mesh) q.mesh.scale.setScalar(1.7 + Math.sin(m.time * 5 + i) * 0.1);
      if (m.time > q.t1 || !m.alive) { q.mesh?.parent?.remove(q.mesh); pools.splice(i, 1); }
    }
    suctionTick(m, dt);
  },
  snapExtra: (m) => ({ burrowed: !!m.burrowed }),
  forceEmerge,
};

const poolGeo = new THREE.CylinderGeometry(1, 1, 0.1, 10);
const poolMat = basic({ color: '#ff5a14' });
