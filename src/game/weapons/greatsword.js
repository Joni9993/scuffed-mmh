import { compileTrack, REST } from '../anim.js';
import { buildGreatswordLook } from '../gear/weaponLook.js'; // [G]

// ---- helpers: hit shapes that follow the blade so hitboxes match the visuals.
// Right shoulder in player-local coords (x+ = character's left, z+ = forward).
const SH = [-0.45, 1.45, 0.05];
const r2 = (n) => Math.round(n * 1000) / 1000;
const rad = (d) => (d * Math.PI) / 180;

/** Blade sweeps through a vertical plane. a0->a1 = blade pitch (0 down, 90 fwd, 180 up). */
function arcVert({ t0, t1, n = 6, a0, a1, from = 0.7, to = 2.75, radius = 0.55, ...rest }) {
  const hits = [];
  const group = rest.group ?? `arc${t0}`;
  for (let i = 0; i < n; i++) {
    const a = rad(a0 + ((a1 - a0) * (i + 0.5)) / n);
    const d = [0, -Math.cos(a), Math.sin(a)];
    hits.push({
      ...rest, group, shape: 'capsule', radius,
      t0: r2(t0 + ((t1 - t0) * i) / n), t1: r2(t0 + ((t1 - t0) * (i + 1)) / n + 0.016),
      from: SH.map((v, k) => r2(v + d[k] * from)), to: SH.map((v, k) => r2(v + d[k] * to)),
    });
  }
  return hits;
}
/** Blade sweeps horizontally. p0->p1 = yaw (deg) of blade, + = toward character's left. */
function arcHorz({ t0, t1, n = 6, p0, p1, y = 1.15, from = 0.7, to = 2.75, radius = 0.55, ...rest }) {
  const hits = [];
  const group = rest.group ?? `sweep${t0}`;
  for (let i = 0; i < n; i++) {
    const p = rad(p0 + ((p1 - p0) * (i + 0.5)) / n);
    const d = [Math.sin(p), 0, Math.cos(p)];
    hits.push({
      ...rest, group, shape: 'capsule', radius,
      t0: r2(t0 + ((t1 - t0) * i) / n), t1: r2(t0 + ((t1 - t0) * (i + 1)) / n + 0.016),
      from: [r2(SH[0] + d[0] * from), y, r2(SH[2] + d[2] * from)], to: [r2(SH[0] + d[0] * to), y, r2(SH[2] + d[2] * to)],
    });
  }
  return hits;
}

const chargeSwing = (id, lvl, mv, dur, t0, t1, extra = {}) => ({
  id, anim: 'smash', duration: dur,
  hits: arcVert({ t0, t1, a0: 215, a1: 55, radius: 0.6 + lvl * 0.1, mv, blunt: [0, 20, 35, 55][lvl], wucht: lvl * 12, hitstop: lvl === 1 ? 'medium' : 'heavy', ...extra.hit }),
  combo: { window: [t1 + 0.05, dur - 0.1], next: { holdA: 'gs_wcharge', A: 'gs_hieb' } },
  rollCancelAt: t1 + 0.2, moveSpeed: 0, turnSpeed: 0.2, superArmor: false, level: lvl,
});

const moves = {
  gs_hieb: {
    id: 'gs_hieb', anim: 'overhead', duration: 0.9,
    hits: arcVert({ t0: 0.4, t1: 0.52, a0: 205, a1: 60, mv: 48, wucht: 6, hitstop: 'medium' }),
    combo: { window: [0.5, 0.85], next: { A: 'gs_quer', holdA: 'gs_charge', B: 'gs_rempler' } },
    rollCancelAt: 0.62, moveSpeed: 0, turnSpeed: 0.5,
  },
  gs_quer: {
    id: 'gs_quer', anim: 'sweep', duration: 0.8,
    hits: arcHorz({ t0: 0.32, t1: 0.46, p0: -80, p1: 80, mv: 36, wucht: 5, hitstop: 'medium' }),
    combo: { window: [0.45, 0.75], next: { A: 'gs_haken', holdA: 'gs_charge', B: 'gs_rempler' } },
    rollCancelAt: 0.55, moveSpeed: 0, turnSpeed: 0.5,
  },
  gs_haken: {
    id: 'gs_haken', anim: 'upper', duration: 1.0,
    hits: arcVert({ t0: 0.38, t1: 0.5, a0: -35, a1: 175, mv: 52, wucht: 8, hitstop: 'heavy', launch: true }),
    combo: { window: [0.55, 0.9], next: { A: 'gs_hieb', holdA: 'gs_charge', B: 'gs_rempler' } },
    rollCancelAt: 0.68, moveSpeed: 0, turnSpeed: 0.5,
  },

  gs_charge: {
    id: 'gs_charge', kind: 'charge', anim: 'charge', button: 'A', duration: 99,
    levels: [0.5, 1.0, 1.5], maxHold: 2.1, over: 2, sauber: [1.5, 1.8],
    releases: ['gs_hieb', 'gs_c1', 'gs_c2', 'gs_c3'], moveSpeed: 0, turnSpeed: 0.35,
  },
  // Wuchtladung: after a charged swing, holding A again charges faster and hits +20 BW harder
  gs_wcharge: {
    id: 'gs_wcharge', kind: 'charge', anim: 'charge', button: 'A', duration: 99,
    levels: [0.35, 0.7, 1.05], maxHold: 1.6, over: 2, sauber: [1.05, 1.3],
    releases: ['gs_hieb', 'gs_w1', 'gs_w2', 'gs_w3'], moveSpeed: 0, turnSpeed: 0.35, wuchtladung: true,
  },
  // Aus Rempler direkt A halten: startet bei Stufe 1
  gs_charge_r: {
    id: 'gs_charge_r', kind: 'charge', anim: 'charge', button: 'A', duration: 99, startT: 0.5,
    levels: [0.5, 1.0, 1.5], maxHold: 2.1, over: 2, sauber: [1.5, 1.8],
    releases: ['gs_hieb', 'gs_c1', 'gs_c2', 'gs_c3'], moveSpeed: 0, turnSpeed: 0.35,
  },
  gs_c1: chargeSwing('gs_c1', 1, 65, 1.0, 0.42, 0.54),
  gs_c2: chargeSwing('gs_c2', 2, 90, 1.1, 0.44, 0.56),
  gs_c3: chargeSwing('gs_c3', 3, 120, 1.25, 0.46, 0.58),
  gs_w1: chargeSwing('gs_w1', 1, 85, 0.85, 0.3, 0.42),
  gs_w2: chargeSwing('gs_w2', 2, 110, 0.9, 0.32, 0.44),
  gs_w3: chargeSwing('gs_w3', 3, 140, 1.0, 0.34, 0.46),

  gs_rempler: {
    id: 'gs_rempler', anim: 'bump', duration: 0.6,
    hits: [{ t0: 0.14, t1: 0.3, shape: 'sphere', at: [0, 1.1, 1.0], radius: 0.95, mv: 26, blunt: 30, wucht: 4, hitstop: 'medium', group: 'b' }],
    combo: { window: [0.3, 0.58], next: { holdA: 'gs_charge_r', A: 'gs_hieb' } },
    lunge: { t0: 0.06, t1: 0.26, dist: 1.8 },
    superArmor: [0, 0.45, 'flinch'], rollCancelAt: 0.4, moveSpeed: 0, turnSpeed: 0.4,
  },
  gs_block: {
    id: 'gs_block', kind: 'hold', anim: 'block', button: 'B', duration: 99, minTime: 0.15,
    block: { arc: 75, pass: 0.3, staminaMul: 0.8, wucht: 5 },
    next: { A: 'gs_hieb' },
    moveSpeed: 0.3, turnSpeed: 0.8,
  },
  gs_finisher: {
    id: 'gs_finisher', anim: 'finisher', duration: 1.9, consumeWucht: true,
    hits: [{ t0: 0.78, t1: 0.9, shape: 'sphere', at: [0, 0.6, 2.0], radius: 3.0, mv: 220, blunt: 80, wucht: 0, hitstop: 'heavy', group: 'f', shake: 0.6 }],
    arc: { t0: 0.25, t1: 0.78, h: 1.8 }, lunge: { t0: 0.25, t1: 0.78, dist: 3.2 },
    superArmor: 'all', rollCancelAt: 1.4, moveSpeed: 0, turnSpeed: 0.3,
  },
};

// ---- animation tracks (see anim.js). Blade pitch = arx + sw.
// [G] two-handed ready stance: arms forward-down, blade pointing up-forward (pitch 120); the left hand follows the hilt (rig two-hand solver)
export const GS_REST = { arx: 55, sw: 65 };
const A = (frames) => compileTrack(frames, { ...REST, ...GS_REST });
const anims = {
  overhead: A([
    [0, {}], [0.16, { arx: 150, sw: 55, tx: -6, py: -0.04 }], [0.38, { arx: 172, sw: 38, tx: -10, py: 0.02, lrx: 12, rrx: -10 }],
    [0.4, { arx: 172, sw: 33 }, 'lin'], [0.52, { arx: 62, sw: -2, tx: 30, py: -0.1 }, 'lin'], [0.7, { arx: 62, sw: -2, tx: 30, py: -0.1 }], [0.9, { arx: GS_REST.arx, sw: GS_REST.sw, tx: 3, py: 0, lrx: 0, rrx: 0 }],
  ]),
  sweep: A([
    [0, {}], [0.22, { ty: -85, arx: 80, sw: 10, alx: 50, tx: 5, py: -0.05 }], [0.32, { ty: -90, arx: 80, sw: 10 }, 'lin'],
    [0.46, { ty: 90, arx: 80, sw: 10, tx: 8 }, 'lin'], [0.6, { ty: 92 }], [0.8, { ty: 0, arx: GS_REST.arx, sw: GS_REST.sw, alx: -12, tx: 3, py: 0 }],
  ]),
  upper: A([
    [0, {}], [0.3, { py: -0.28, tx: 22, arx: -35, sw: 0, lrx: 20, rrx: -15 }], [0.38, { arx: -35, sw: 0 }, 'lin'],
    [0.5, { arx: 150, sw: 25, tx: -14, py: 0.04 }, 'lin'], [0.7, { arx: 150, sw: 25 }], [1.0, { arx: GS_REST.arx, sw: GS_REST.sw, tx: 3, py: 0, lrx: 0, rrx: 0 }],
  ]),
  charge: A([
    [0, {}], [0.25, { py: -0.2, tx: 14, arx: -20, sw: 30, alx: 30, lrx: 24, rrx: -18, ty: -25 }],
  ]),
  smash: A([
    [0, { py: -0.2, tx: 14, arx: -20, sw: 30, alx: 30, lrx: 24, rrx: -18, ty: -25 }], [0.3, { arx: 170, sw: 45, tx: -12, py: 0.02, ty: 0 }],
    [0.42, { arx: 172, sw: 43 }, 'lin'], [0.56, { arx: 62, sw: -2, tx: 34, py: -0.14, lrx: 14, rrx: -8 }, 'lin'], [0.8, { arx: 62, sw: -2, tx: 34 }],
    [1.1, { arx: GS_REST.arx, sw: GS_REST.sw, tx: 3, py: 0, lrx: 0, rrx: 0, ty: 0, alx: -12 }],
  ]),
  bump: A([
    [0, {}], [0.1, { tx: 12, ty: -20, py: -0.1, arx: 70, sw: 90, alx: 70, lrx: 20, rrx: -20 }], [0.26, { tx: 40, ty: 25, py: -0.12, lrx: 25, rrx: -10 }],
    [0.45, { tx: 30 }], [0.6, { tx: 3, ty: 0, py: 0, arx: GS_REST.arx, sw: GS_REST.sw, alx: -12, lrx: 0, rrx: 0 }],
  ]),
  block: A([[0, {}], [0.1, { arx: 85, sw: 95, alx: 80, alz: -5, py: -0.1, tx: 8, lrx: 14, rrx: -10 }]]),
  finisher: A([
    [0, {}], [0.2, { py: -0.35, tx: 25, arx: 160, sw: 40, alx: 120, lrx: 25, rrx: -20 }], [0.4, { py: 0.2, tx: -10, lrx: -15, rrx: -15, arx: 175, sw: 30 }],
    [0.76, { py: 0.1, arx: 175, sw: 30 }], [0.84, { py: -0.1, arx: 60, sw: -2, tx: 40, alx: 40, lrx: 20, rrx: -10 }], [1.3, { arx: 60, sw: -2, tx: 40 }],
    [1.9, { arx: GS_REST.arx, sw: GS_REST.sw, tx: 3, py: 0, alx: -12, lrx: 0, rrx: 0 }],
  ]),
};

/** [G] opts: { tier, branch } -> tier-specific look (see gear/weaponLook.js); the grip is two-handed (userData.twoHand) */
export function buildGreatswordMesh({ tier = 1, branch = null } = {}) {
  return buildGreatswordLook(tier, branch);
}

export const greatsword = {
  id: 'gs',
  name: 'Plattmacher',
  holdThreshold: { A: 0.2, B: 0.2 },
  idle: { A: 'gs_hieb', holdA: 'gs_charge', B: 'gs_rempler', holdB: 'gs_block' },
  moves,
  anims,
  rest: GS_REST, // [G]
  sprintArx: 45,
  // Wucht 100 + B = Finisher "Schrottbrecher"
  overrideEvent: (w, type) => ((type === 'B' || type === 'holdB') && w.wucht >= 100 ? 'gs_finisher' : undefined),
  buildMesh: buildGreatswordMesh,
  /** HUD status line */
  status(w) {
    if (w.charging) return { text: w.chargeLevel ? `Stufe ${w.chargeLevel}` : 'Laden', level: w.chargeLevel, max: 3, sauber: w.sauberOpen };
    return null;
  },
};
