import * as THREE from 'three';
import { compileTrack, REST } from '../anim.js';
import { lambert } from '../../render/ps1.js';
import { tex } from '../../render/textures.js';
import { VIT } from '../vitals.js';

// Zwillingsklingen (GDD 4.2): schnelle Kette aus kleinen Treffern, Rausch (B) = +1 Treffer pro Move, +15 % Tempo,
// Rolle wird kurzer Dash, kostet Puste. Finisher "Schrottwirbel" (B halten bei Wucht 100).

export const RAUSCH_SPEED = 1.15;
export const DB_MV = 1.18; // phase-3 balance: slash motion values x1.18 (db DPS ~90 % of gs)
export const RAUSCH_COST = VIT.rauschCost; // Puste pro Sekunde
export const DASH = { duration: 0.3, dist: 3.2 }; // Rolle im Rausch (gleiche i-Frames, siehe ROLL.iStart/iEnd)

const SHR = [-0.45, 1.45, 0.05]; // right shoulder (player-local, x+ = left)
const SHL = [0.45, 1.45, 0.05];
const r2 = (n) => Math.round(n * 1000) / 1000;
const rad = (d) => (d * Math.PI) / 180;

/**
 * One slash = a few capsules along the blade, sliced in time, one group -> max. one hit per target.
 *  kind 'horz': blade yaw p0->p1 (deg, + = toward the character's left) at height y.
 *  kind 'vert': blade pitch a0->a1 (0 down, 90 forward, 180 up), `tilt` (deg) leans the plane toward the left.
 */
function slash(s) {
  const { hand = 'R', kind = 'horz', t0, t1, n = 3, from = 0.3, to = 2.1, radius = 0.62, y = 1.15, tilt = 0, mv, wucht = 2, hitstop = 'light', group } = s;
  const sh = hand === 'R' ? SHR : SHL;
  const hits = [];
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    let d;
    if (kind === 'horz') {
      const p = rad(s.p0 + (s.p1 - s.p0) * k);
      d = [Math.sin(p), 0, Math.cos(p)];
    } else {
      const a = rad(s.a0 + (s.a1 - s.a0) * k);
      const lx = Math.sin(rad(tilt)) * 0.9;
      const len = Math.hypot(lx, Math.cos(a), Math.sin(a));
      d = [lx / len, -Math.cos(a) / len, Math.sin(a) / len];
    }
    const base = kind === 'horz' ? [sh[0], y, sh[2]] : sh;
    hits.push({
      shape: 'capsule', radius, group, mv: r2(mv * DB_MV), wucht, hitstop, blunt: 0,
      t0: r2(t0 + ((t1 - t0) * i) / n), t1: r2(t0 + ((t1 - t0) * (i + 1)) / n + 0.016),
      from: base.map((v, j) => r2(v + d[j] * from)), to: base.map((v, j) => r2(v + d[j] * to)),
    });
  }
  return hits;
}

// ---- pose keys per slash (wind-up before t0, strike pose at t1)
const SLASH_POSE = {
  Rhorz: [{ ty: -60, arx: 80, sw: 10, tx: 6 }, { ty: 62, arx: 80, sw: 10, tx: 10 }],
  Lhorz: [{ ty: 60, alx: 80, sl: 10, tx: 6 }, { ty: -62, alx: 80, sl: 10, tx: 10 }],
  Rvert: [{ arx: 165, sw: 25, tx: -8, ty: 0 }, { arx: 55, sw: 0, tx: 22, ty: 8 }],
  Lvert: [{ alx: 165, sl: 25, tx: -8, ty: 0 }, { alx: 55, sl: 0, tx: 22, ty: -8 }],
  Rdiag: [{ arx: 150, sw: 30, ty: -35, tx: 0 }, { arx: 50, sw: 10, ty: 38, tx: 18 }],
  Ldiag: [{ alx: 150, sl: 30, ty: 35, tx: 0 }, { alx: 50, sl: 10, ty: -38, tx: 18 }],
};
const GUARD = { arx: 45, sw: 55, arz: 16, alx: 45, sl: 55, alz: 16, tx: 8, ty: 0, py: -0.06, lrx: 8, rrx: -8 };
const BASE = { ...REST, ...GUARD };
export const DB_REST = GUARD;

function trackFor(slashes, dur, extra = []) {
  const frames = [[0, {}]];
  let last = 0;
  for (const s of slashes) {
    const [wind, strike] = SLASH_POSE[s.hand + (s.kind === 'horz' ? 'horz' : s.tilt ? 'diag' : 'vert')];
    let tw = Math.max(s.t0 - 0.07, last + 0.01);
    if (tw >= s.t0) tw = (last + s.t0) / 2;
    frames.push([r2(tw), wind], [r2(s.t1), strike, 'lin']);
    last = s.t1;
  }
  for (const [t, p, m] of extra) frames.push([t, p, m]);
  frames.sort((a, b) => a[0] - b[0]);
  frames.push([Math.max(dur, last + 0.1), { ...GUARD, ty: 0 }]);
  return compileTrack(frames, BASE);
}

// ---- move table
const SLASHES = {
  a1: [
    { hand: 'R', kind: 'horz', t0: 0.09, t1: 0.19, p0: -70, p1: 70, mv: 12 },
    { hand: 'L', kind: 'horz', t0: 0.2, t1: 0.3, p0: 70, p1: -70, mv: 12 },
  ],
  a2: [
    { hand: 'R', kind: 'vert', tilt: 25, t0: 0.11, t1: 0.21, a0: 160, a1: 45, mv: 14 },
    { hand: 'L', kind: 'vert', tilt: -25, t0: 0.23, t1: 0.33, a0: 160, a1: 45, mv: 14 },
  ],
  a3: [
    { hand: 'R', kind: 'horz', t0: 0.12, t1: 0.24, p0: -100, p1: 100, mv: 10, n: 4 },
    { hand: 'L', kind: 'horz', t0: 0.24, t1: 0.36, p0: 100, p1: -100, mv: 10, n: 4 },
    { hand: 'R', kind: 'horz', t0: 0.36, t1: 0.48, p0: -100, p1: 100, mv: 10, n: 4 },
  ],
  jump: [
    { hand: 'R', kind: 'vert', tilt: 20, t0: 0.15, t1: 0.24, a0: 170, a1: 40, mv: 18 },
    { hand: 'L', kind: 'vert', tilt: -20, t0: 0.26, t1: 0.35, a0: 170, a1: 40, mv: 18 },
  ],
};
// Rausch: one extra hit per move
const EXTRA = {
  a1: { hand: 'R', kind: 'vert', t0: 0.32, t1: 0.41, a0: 170, a1: 40, mv: 12 },
  a2: { hand: 'R', kind: 'vert', tilt: 0, t0: 0.35, t1: 0.45, a0: 170, a1: 35, mv: 14, radius: 0.7 },
  a3: { hand: 'L', kind: 'horz', t0: 0.48, t1: 0.6, p0: 100, p1: -100, mv: 10, n: 4 },
  jump: { hand: 'R', kind: 'vert', t0: 0.37, t1: 0.46, a0: 170, a1: 40, mv: 18 },
};

const next = (base) => (w) => (w.data.rausch ? base + 'r' : base);

export const RAUSCH_TIME = 0.78; // Rausch moves run at 78 % of the time (faster, one extra hit)
export const moves = {};
const defs = {
  a1: { id: 'db_a1', dur: 0.55, win: [0.24, 0.5], cancel: 0.34, nextA: 'db_a2' },
  a2: { id: 'db_a2', dur: 0.6, win: [0.28, 0.55], cancel: 0.38, nextA: 'db_a3' },
  a3: { id: 'db_a3', dur: 0.8, win: [0.42, 0.74], cancel: 0.54, nextA: 'db_a1' },
  jump: { id: 'db_jump', dur: 0.7, win: [0.38, 0.65], cancel: 0.5, nextA: 'db_a1' },
};
const anims = {};
const sc = (arr, k) => arr.map((f) => [r2(f[0] * k), ...f.slice(1)]);
for (const [key, d] of Object.entries(defs)) {
  for (const extra of [false, true]) {
    const k = extra ? RAUSCH_TIME : 1;
    // Rausch: the extra hit has to land before the chain may continue (unscaled timeline), then everything is sped up
    const win = d.win.slice();
    let dur = d.dur, cancel = d.cancel;
    if (extra) {
      win[0] = Math.max(win[0], EXTRA[key].t1 + 0.04);
      win[1] = Math.max(win[1], win[0] + 0.22);
      dur = Math.max(dur, win[1] + 0.08);
      cancel = Math.max(cancel, EXTRA[key].t1 + 0.04);
    }
    const list = (extra ? [...SLASHES[key], EXTRA[key]] : SLASHES[key]).map((s) => ({ ...s, t0: r2(s.t0 * k), t1: r2(s.t1 * k) }));
    const hits = list.map((s, i) => slash({ ...s, group: `${key}${i}` })).flat();
    const nxt = d.nextA;
    const m = {
      id: d.id + (extra ? 'r' : ''), anim: 'db_' + key + (extra ? 'r' : ''), duration: r2(dur * k), hits,
      moveSpeed: key === 'a3' ? 0.45 : 0.5, turnSpeed: 0.6,
      combo: { window: [r2(win[0] * k), r2(win[1] * k)], next: { A: (w) => (w.data.rausch ? nxt + 'r' : nxt), holdA: (w) => (w.data.rausch ? nxt + 'r' : nxt), B: 'db_toggle', holdB: 'db_toggle' } },
      rollCancelAt: r2(cancel * k),
    };
    if (key === 'jump') {
      m.lunge = { t0: r2(0.05 * k), t1: r2(0.3 * k), dist: 3 };
      m.arc = { t0: r2(0.05 * k), t1: r2(0.36 * k), h: 1.0 };
      m.moveSpeed = 0; m.turnSpeed = 0.3;
    }
    moves[m.id] = m;
    const spin = key === 'a3' ? sc([[0.1, { pry: 0 }], [extra ? 0.6 : 0.48, { pry: 360 }, 'lin']], k) : [];
    const arc = key === 'jump' ? sc([[0.05, { py: -0.1 }], [0.2, { py: 0.35, lrx: 40, rrx: -20 }], [0.45, { py: -0.05 }]], k) : [];
    anims[m.anim] = trackFor(list, m.duration, [...spin, ...arc]);
  }
}

moves.db_toggle = {
  id: 'db_toggle', anim: 'db_toggle', duration: 0.28, moveSpeed: 0.8, turnSpeed: 0.8,
  fire: [{ t: 0.04, call: 'toggle' }],
  combo: { window: [0.1, 0.26], next: { A: next('db_a1'), holdA: next('db_a1') } },
  rollCancelAt: 0.1,
};
anims.db_toggle = compileTrack([
  [0, {}], [0.08, { arx: 120, sw: 20, alx: 120, sl: 20, tx: -6, py: -0.1 }], [0.16, { arx: 150, sw: 10, alx: 150, sl: 10, arz: 30, alz: 30, tx: -10, py: 0.0 }], [0.28, {}],
], BASE);

// Schrottwirbel: 1.8 s Wirbel, 12 x BW 14, frei lenkbar
moves.db_finisher = {
  id: 'db_finisher', anim: 'db_finisher', duration: 1.95, consumeWucht: true,
  hits: [{ t0: 0.15, t1: 1.8, shape: 'sphere', at: [0, 1.0, 0.5], radius: 2.3, mv: 14, wucht: 0, hitstop: 'light', blunt: 0, group: 'fin', multi: true, interval: 0.13, shake: 0.12 }],
  superArmor: 'all', rollCancelAt: 1.5, moveSpeed: 1.0, turnSpeed: 0, steer: true,
};
anims.db_finisher = compileTrack([
  [0, {}], [0.15, { arx: 85, sw: 5, alx: 85, sl: 5, arz: 14, alz: 14, tx: 22, py: -0.12, pry: 0 }],
  [1.8, { pry: 2520 }, 'lin'], [1.95, { pry: 2520, arx: 45, sw: 55, alx: 45, sl: 55, tx: 8, py: -0.06 }],
], BASE);

// ---- visuals
function bladeMesh(mats, flip) {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.82, 0.035), mats.metal);
  blade.position.y = -0.62;
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.26, 0.035), mats.metal);
  tip.position.set(0.045 * flip, -1.15, 0);
  tip.rotation.z = 0.35 * flip;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.8, 0.05), mats.bone);
  edge.position.set(0.075 * flip, -0.62, 0);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.12), mats.brass);
  guard.position.y = -0.17;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.07), mats.leather);
  grip.position.y = 0.0;
  const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.1), mats.brass);
  pommel.position.y = 0.17;
  g.add(blade, tip, edge, guard, grip, pommel);
  // Rausch halo: additive red ghosts fanned around the grip
  const halo = [];
  for (let i = 0; i < 3; i++) {
    const hm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.3, 0.05), mats.aura[i]);
    hm.position.y = -0.68;
    const piv = new THREE.Group();
    piv.add(hm);
    piv.visible = false;
    g.add(piv);
    halo.push(piv);
  }
  g.userData.halo = halo;
  return g;
}

export function buildDualBladesMesh() {
  const mats = {
    metal: lambert({ map: tex('metal', { size: 16 }), emissive: new THREE.Color(0, 0, 0) }),
    bone: lambert({ map: tex('bone', { size: 16 }) }),
    brass: lambert({ color: '#b8862e' }),
    leather: lambert({ map: tex('leather', { size: 16 }) }),
    aura: [0.28, 0.2, 0.12].map((o) => new THREE.MeshBasicMaterial({ color: '#ff2a1a', transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })),
  };
  const right = bladeMesh(mats, 1);
  const left = bladeMesh(mats, -1);
  right.userData.offhand = left;
  right.userData.db = { mats, halos: [...right.userData.halo, ...left.userData.halo], k: 0, t: 0 };
  return right;
}

export const dualblades = {
  id: 'db',
  name: 'Zwillingsklingen',
  // B: Tipp = Rausch an/aus, Halten (0,3 s) bei Wucht 100 = Schrottwirbel
  holdThreshold: { A: 0, B: 0.3 },
  idle: {
    A: (w) => (w.hooks.player && w.hooks.player.sinceRoll < 0.3 ? (w.data.rausch ? 'db_jumpr' : 'db_jump') : w.data.rausch ? 'db_a1r' : 'db_a1'),
    holdA: (w) => (w.data.rausch ? 'db_a1r' : 'db_a1'),
    B: 'db_toggle',
    holdB: 'db_toggle',
  },
  moves,
  anims,
  rest: DB_REST,
  overrideEvent: (w, type) => (type === 'holdB' && w.wucht >= 100 ? 'db_finisher' : undefined),
  on: {
    toggle(w) {
      if (w.data.rausch) { w.data.rausch = false; return; }
      if (w.hooks.exhausted?.()) return;
      w.data.rausch = true;
    },
  },
  onUpdate(w, dt) {
    if (!w.data.rausch) return;
    w.hooks.drain?.(RAUSCH_COST * dt);
    if (w.hooks.exhausted?.()) w.data.rausch = false;
  },
  /** Rausch: +15 % Tempo */
  speedMul: (w) => (w.data.rausch ? RAUSCH_SPEED : 1),
  /** Rausch: Rolle wird Dash (0,3 s, gleiche i-Frames) */
  rollOverride: (w) => (w.data.rausch ? DASH : null),
  buildMesh: buildDualBladesMesh,
  /** red glow + halo while Rausch is on */
  updateMesh(w, mesh, dt) {
    const d = mesh?.userData.db;
    if (!d) return;
    d.t += dt;
    const on = w.data.rausch ? 1 : 0;
    d.k += (on - d.k) * (1 - Math.exp(-12 * dt));
    const pulse = 0.75 + 0.25 * Math.sin(d.t * 22);
    const k = d.k * pulse;
    d.mats.metal.emissive.setRGB(0.95 * k, 0.12 * k, 0.05 * k);
    const hot = w.busy && w.move.hits?.length ? 1 : 0.35;
    for (let i = 0; i < d.halos.length; i++) {
      const piv = d.halos[i], j = i % 3;
      piv.visible = d.k > 0.05;
      const spread = (0.14 + j * 0.16) * hot;
      piv.rotation.set(spread * (j % 2 ? 1 : -1), 0, spread * 0.6);
    }
  },
  status(w) {
    const fin = w.wucht >= 100;
    if (w.data.rausch) return { text: fin ? 'Rausch · Wirbel: B halten' : 'Rausch', level: 1, max: 1 };
    if (fin) return { text: 'Wirbel: B halten', level: 0, max: 0 };
    return null;
  },
};
