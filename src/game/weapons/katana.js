import * as THREE from 'three';
import { compileTrack, REST } from '../anim.js';
import { lambert } from '../../render/ps1.js';
import { tex, registerTexture } from '../../render/textures.js';

// Katana / Ronin-Klinge (GDD 4.4, `kt`): mittleres Tempo, zweihaendig, belohnt Konter-Timing.
//  A-Kette  Schnitt -> Zugschnitt -> Kreuzhieb (-> Zugschnitt ...)
//  A halten Ziehschnitt (Klinge in die Scheide, 0,6 s; Loslassen 0,6-0,75 s = "Blankgezogen!" +20 %)
//  B        Konterhaltung (0,4 s; Treffer in den ersten 0,25 s = negiert + Konterschnitt + Schliff +1; sonst 0,35 s Erholung)
//  Schliff  0-3: +8 % Schaden je Stufe, 40 s, jeder Konter erneuert
//  Rolle -> A Gleitschnitt;  Wucht 100 + B halten (0,3 s) = Mondsichel (setzt Schliff auf 3)

export const COUNTER_WINDOW = 0.25;     // s after stance start in which a monster hit is countered
export const STANCE_TIME = 0.4;          // active stance
export const STANCE_RECOVERY = 0.35;     // failed stance: locked recovery
export const SCHLIFF_MAX = 3;
export const SCHLIFF_TIME = 40;
export const SCHLIFF_DMG = 0.08;
export const DRAW_TIME = 0.6;            // Ziehschnitt tension
export const BLANK_WINDOW = [0.6, 0.75]; // "Blankgezogen!"
export const BLANK_MUL = 1.2;

const r2 = (n) => Math.round(n * 1000) / 1000;
const rad = (d) => (d * Math.PI) / 180;
const SH = [-0.2, 1.4, 0.12]; // blade pivot (two-handed, in front of the chest; player-local, x+ = left, z+ = forward)

/**
 * One cut = a few capsules along the blade, sliced in time, one group -> max. one hit per target.
 *  kind 'vert': blade pitch a0->a1 (0 down, 90 fwd, 180 up); `tilt` (deg) leans the plane sideways.
 *  kind 'horz': blade yaw p0->p1 (+ = toward the character's left) at height y.
 */
function cut({ kind = 'vert', t0, t1, n = 4, a0, a1, p0, p1, tilt = 0, y = 1.2, from = 0.5, to = 2.0, radius = 0.5, group, ...rest }) {
  const hits = [];
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    let d, base;
    if (kind === 'horz') {
      const p = rad(p0 + (p1 - p0) * k);
      d = [Math.sin(p), 0, Math.cos(p)];
      base = [SH[0], y, SH[2]];
    } else {
      const a = rad(a0 + (a1 - a0) * k);
      const lx = Math.sin(rad(tilt)) * 0.9;
      const len = Math.hypot(lx, Math.cos(a), Math.sin(a));
      d = [lx / len, -Math.cos(a) / len, Math.sin(a) / len];
      base = SH;
    }
    hits.push({
      ...rest, group, shape: 'capsule', radius,
      t0: r2(t0 + ((t1 - t0) * i) / n), t1: r2(t0 + ((t1 - t0) * (i + 1)) / n + 0.016),
      from: base.map((v, j) => r2(v + d[j] * from)), to: base.map((v, j) => r2(v + d[j] * to)),
    });
  }
  return hits;
}

// ---- Schliff (sharpness) state: w.data.schliff 0..3, w.data.schliffT seconds left
export function addSchliff(w, n = 1) {
  w.data.schliff = Math.min(SCHLIFF_MAX, (w.data.schliff | 0) + n);
  w.data.schliffT = SCHLIFF_TIME;
}
export const schliffLevel = (w) => w.data.schliff | 0;

const NEXT_FROM_CUT = { A: 'kt_a2', holdA: 'kt_draw', B: 'kt_stance' };

const moves = {
  kt_a1: {
    id: 'kt_a1', anim: 'kt_a1', duration: 0.5,
    hits: cut({ t0: 0.12, t1: 0.21, a0: 168, a1: 60, mv: 20, wucht: 3, hitstop: 'light', group: 'a1' }),
    combo: { window: [0.25, 0.46], next: NEXT_FROM_CUT },
    rollCancelAt: 0.3, moveSpeed: 0.35, turnSpeed: 0.5,
  },
  kt_a2: { // Zugschnitt: waagrechter Zug nach links
    id: 'kt_a2', anim: 'kt_a2', duration: 0.55,
    hits: cut({ kind: 'horz', t0: 0.13, t1: 0.24, n: 5, p0: -80, p1: 80, mv: 22, wucht: 3, hitstop: 'light', group: 'a2' }),
    combo: { window: [0.28, 0.5], next: { ...NEXT_FROM_CUT, A: 'kt_a3' } },
    rollCancelAt: 0.32, moveSpeed: 0.35, turnSpeed: 0.5,
  },
  kt_a3: { // Kreuzhieb: zwei Diagonalen (X), 2 x BW 14 = BW 28
    id: 'kt_a3', anim: 'kt_a3', duration: 0.78,
    hits: [
      ...cut({ t0: 0.13, t1: 0.22, a0: 168, a1: 45, tilt: 30, mv: 14, wucht: 1.5, hitstop: 'light', group: 'a3a' }),
      ...cut({ t0: 0.31, t1: 0.41, a0: 168, a1: 45, tilt: -30, mv: 14, wucht: 1.5, hitstop: 'medium', group: 'a3b' }),
    ],
    combo: { window: [0.45, 0.7], next: { ...NEXT_FROM_CUT, A: 'kt_a2' } }, // wiederholbar ab Zugschnitt
    rollCancelAt: 0.5, moveSpeed: 0.3, turnSpeed: 0.5,
  },

  // A halten: Klinge in die Scheide, Spannung. Zu frueh loslassen = nichts (Klinge bleibt gezogen), 0,6-0,75 s = Blankgezogen!
  kt_draw: {
    id: 'kt_draw', kind: 'charge', anim: 'kt_iaido', button: 'A', duration: 99,
    levels: [DRAW_TIME], maxHold: 99, over: 1, sauber: BLANK_WINDOW,
    releases: [undefined, 'kt_zieh'], moveSpeed: 0.25, turnSpeed: 0.5,
  },
  kt_zieh: {
    id: 'kt_zieh', anim: 'kt_zieh', duration: 0.62,
    hits: cut({ kind: 'horz', t0: 0.05, t1: 0.15, n: 5, p0: -55, p1: 60, y: 1.15, from: 0.5, to: 2.1, radius: 0.5, mv: 45, wucht: 8, hitstop: 'heavy', group: 'z', sauberMul: BLANK_MUL, sauberText: 'Blankgezogen!' }),
    lunge: { t0: 0.02, t1: 0.15, dist: 2.2 }, // reach 2.1 + lunge 2.2 = ~4 m
    combo: { window: [0.24, 0.55], next: { A: 'kt_a2', holdA: 'kt_draw', B: 'kt_stance' } },
    rollCancelAt: 0.34, moveSpeed: 0, turnSpeed: 0.3,
  },

  // Konterhaltung: 0,4 s Haltung, Treffer in den ersten 0,25 s werden gekontert (siehe def.counter). Scheitert sie: 0,35 s Erholung.
  kt_stance: {
    id: 'kt_stance', anim: 'kt_stance', duration: STANCE_TIME + STANCE_RECOVERY,
    // Wucht 100 + B halten (holdB kommt 0,3 s nach dem Druck) = Mondsichel (overrideEvent)
    combo: { window: [0.26, STANCE_TIME + STANCE_RECOVERY - 0.02], next: {} }, // leer: nur overrideEvent (holdB bei Wucht 100) kommt hier an
    rollCancelAt: STANCE_TIME + STANCE_RECOVERY, // no roll out of a failed stance (bestraft Spammen)
    moveSpeed: 0.2, turnSpeed: 0.45,
  },
  kt_konter: { // automatischer Konterschnitt
    id: 'kt_konter', anim: 'kt_konter', duration: 0.7,
    hits: cut({ t0: 0.05, t1: 0.15, n: 5, a0: 170, a1: 40, from: 0.4, to: 2.4, radius: 0.75, mv: 60, wucht: 0, hitstop: 'heavy', group: 'k', shake: 0.45 }),
    lunge: { t0: 0.0, t1: 0.14, dist: 2.2 },
    superArmor: [0, 0.45, 'all'],
    combo: { window: [0.3, 0.62], next: { A: 'kt_a2', holdA: 'kt_draw', B: 'kt_stance' } },
    rollCancelAt: 0.38, moveSpeed: 0, turnSpeed: 0.3,
  },
  kt_gleit: { // Rolle -> A
    id: 'kt_gleit', anim: 'kt_gleit', duration: 0.55,
    hits: cut({ kind: 'horz', t0: 0.1, t1: 0.2, n: 5, p0: -70, p1: 70, mv: 24, wucht: 3, hitstop: 'light', group: 'g' }),
    lunge: { t0: 0.02, t1: 0.2, dist: 3.0 },
    combo: { window: [0.25, 0.5], next: { A: 'kt_a2', holdA: 'kt_draw', B: 'kt_stance' } },
    rollCancelAt: 0.3, moveSpeed: 0, turnSpeed: 0.3,
  },
  kt_finisher: { // Mondsichel
    id: 'kt_finisher', anim: 'kt_finisher', duration: 1.5, consumeWucht: true,
    hits: [{ t0: 0.5, t1: 0.64, shape: 'sphere', at: [0, 1.0, 1.1], radius: 2.7, mv: 190, blunt: 0, wucht: 0, hitstop: 'heavy', group: 'f', shake: 0.55 }],
    arc: { t0: 0.18, t1: 0.78, h: 1.7 }, lunge: { t0: 0.18, t1: 0.7, dist: 2.6 },
    fire: [{ t: 0.66, call: 'schliff3' }],
    superArmor: 'all', rollCancelAt: 1.1, moveSpeed: 0, turnSpeed: 0.3,
  },
};

// ---- animation (see anim.js). P(arm pitch, blade pitch) -> {arx, sw}: blade pitch = arx + sw
const P = (arx, bl, extra = {}) => ({ arx, sw: bl - arx, ...extra });
export const KT_REST = { ...P(54, 104), arz: -24, alz: 9, tx: 9, ty: 0, py: -0.07, lrx: 14, rrx: -14, hx: 0 };
const BASE = { ...REST, ...KT_REST };
const A = (frames) => compileTrack(frames, BASE);
const SHEATHED = { ...P(18, -52), arz: -42, tx: 12, ty: -8, py: -0.16, lrx: 16, rrx: -20, hx: 4 }; // hand on the hilt at the belly, blade in the scabbard
const anims = {
  kt_a1: A([
    [0, {}], [0.1, { ...P(130, 168), tx: -8, py: 0, arz: -14 }], [0.12, P(130, 168), 'lin'], [0.21, { ...P(52, 60), tx: 28, py: -0.12, arz: -24 }, 'lin'], [0.36, P(52, 60)], [0.5, {}],
  ]),
  kt_a2: A([
    [0, {}], [0.11, { ...P(86, 92), ty: -78, tx: 8, py: -0.1, arz: -30 }], [0.13, {}, 'lin'], [0.24, { ty: 78, tx: 14 }, 'lin'], [0.38, { ty: 70 }], [0.55, { ...P(54, 104), ty: 0, tx: 9, py: -0.07 }],
  ]),
  kt_a3: A([
    [0, {}], [0.1, { ...P(132, 170), ty: 18, tx: -6, py: 0, arz: -14 }], [0.13, {}, 'lin'], [0.22, { ...P(48, 48), ty: -30, tx: 28, py: -0.12, arz: -26 }, 'lin'],
    [0.29, { ...P(130, 170), ty: -18, tx: -4, py: 0 }], [0.31, {}, 'lin'], [0.41, { ...P(46, 46), ty: 32, tx: 30, py: -0.14 }, 'lin'], [0.55, {}], [0.78, { ...P(54, 104), ty: 0, tx: 9, py: -0.07 }],
  ]),
  kt_iaido: A([[0, {}], [0.2, SHEATHED]]),
  kt_zieh: A([
    [0, SHEATHED], [0.04, { ...SHEATHED, ty: -40, tx: 16 }, 'lin'], [0.15, { ...P(86, 92), arz: -30, ty: 62, tx: 20, py: -0.1 }, 'lin'], [0.34, { ...P(86, 92), ty: 62 }], [0.62, { ...P(54, 104), ty: 0, tx: 9, py: -0.07 }],
  ]),
  kt_stance: A([ // low guard, blade angled across the body, weight back
    [0, {}], [0.07, { ...P(78, 140), arz: -34, ty: 24, tx: 4, py: -0.2, lrx: 22, rrx: -26, hx: 6 }], [0.4, { ...P(78, 140), arz: -34, ty: 24, py: -0.2 }],
    [0.52, { ...P(70, 128), arz: -30, ty: 14, py: -0.14 }], [0.75, {}],
  ]),
  kt_konter: A([
    [0, { ...P(78, 140), arz: -34, ty: 24, tx: 4, py: -0.2 }], [0.04, { ...P(132, 170), ty: 14, tx: -6, py: 0, arz: -14 }, 'lin'], [0.15, { ...P(46, 40), ty: -26, tx: 32, py: -0.14, arz: -26 }, 'lin'],
    [0.4, P(46, 40)], [0.7, { ...P(54, 104), ty: 0, tx: 9, py: -0.07 }],
  ]),
  kt_gleit: A([
    [0, { py: -0.3, tx: 30, ...P(90, 94), ty: -70, arz: -30 }], [0.1, { py: -0.3, tx: 30, ...P(90, 94), ty: -72 }], [0.2, { ty: 72, tx: 28, py: -0.28 }, 'lin'], [0.36, { ty: 60, py: -0.2 }], [0.55, { ...P(54, 104), ty: 0, tx: 9, py: -0.07 }],
  ]),
  kt_finisher: A([
    [0, {}], [0.18, { py: -0.38, tx: 26, ...P(150, 178), ty: -50, lrx: 26, rrx: -18 }], [0.4, { py: 0.25, tx: -10, lrx: -14, rrx: -14, ...P(160, 180), pry: 180 }, 'lin'],
    [0.5, { py: 0.1, ...P(100, 100), ty: -60, pry: 300, tx: 14 }, 'lin'], [0.64, { py: -0.1, ...P(86, 92), ty: 60, pry: 540, tx: 30 }, 'lin'], [0.9, { py: -0.18, pry: 540, tx: 34 }],
    [1.5, { ...P(54, 104), ty: 0, tx: 9, py: -0.07, pry: 540, lrx: 14, rrx: -14 }],
  ]),
};
// pry keeps counting up inside a move; the renderer wraps it (rotation is periodic)

// ---- visuals ---------------------------------------------------------------------------------------------------
registerTexture('kt_rust', (g, n, rnd) => {
  g.fillStyle = '#8a5a3a'; g.fillRect(0, 0, n, n);
  const cols = ['#6a3e22', '#a8703c', '#7a4a2a', '#5a3a2a', '#b88a5a'];
  for (let i = 0; i < n * n * 0.6; i++) { g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1); }
  g.fillStyle = '#c9ced8'; g.fillRect(0, n >> 1, n, 1);
});
registerTexture('kt_bone', (g, n, rnd) => {
  g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < n * 2; i++) { g.fillStyle = rnd() < 0.5 ? '#d2c3a0' : '#f4ecd6'; g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 2); }
  g.fillStyle = '#a89878'; g.fillRect(0, n - 2, n, 1);
});
registerTexture('kt_fang', (g, n, rnd) => { // Jaggo: violet-blue hide with orange stripes
  g.fillStyle = '#4a3f9a'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < n * 2; i++) { g.fillStyle = '#3a3080'; g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1); }
  g.fillStyle = '#ff9a3a'; for (let y = 2; y < n; y += 5) g.fillRect(0, y, n, 1);
  g.fillStyle = '#d8d0f0'; g.fillRect(0, n - 3, n, 1);
});
registerTexture('kt_mud', (g, n, rnd) => { // Barrotz: layered clay
  g.fillStyle = '#5a4a32'; g.fillRect(0, 0, n, n);
  const cols = ['#6a5a3c', '#4a3a24', '#7a6a48', '#3a2e1e'];
  for (let y = 0; y < n; y += 2) { g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(0, y, n, 2); }
  for (let i = 0; i < n; i++) { g.fillStyle = '#8a8a6a'; g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1); }
});
registerTexture('kt_char', (g, n, rnd) => { // Brathalos: charred scales with ember cracks
  g.fillStyle = '#2a1816'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < n * 2; i++) { g.fillStyle = rnd() < 0.5 ? '#3a2220' : '#1a0e0c'; g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1); }
  g.fillStyle = '#ff6a1a'; for (let i = 0; i < 6; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 2);
});

// Per-tier look. len = blade length (m), w = blade width, curve = sori, tipW = kissaki width factor.
const LOOKS = {
  1: { tex: 'kt_rust', len: 0.95, w: 0.11, curve: 0.05, tsuka: '#6a5a44', wrap: '#4a3a2a', tsuba: '#6a4a30', saya: '#6a4a2a', cord: '#7a6a4a' },
  2: { tex: 'kt_bone', len: 1.02, w: 0.12, curve: 0.06, tsuka: '#d6c8a6', wrap: '#7a4a2a', tsuba: '#e8dcc0', saya: '#a8845a', cord: '#a8301c' },
  3.1: { tex: 'kt_fang', len: 1.1, w: 0.14, curve: 0.08, tsuka: '#c0501a', wrap: '#ff9a3a', tsuba: '#ff8a2a', saya: '#3a30a0', cord: '#ff5a1a' },
  3.2: { tex: 'kt_mud', len: 1.06, w: 0.16, curve: 0.04, tsuka: '#4a3a24', wrap: '#6a7a3a', tsuba: '#5a4a32', saya: '#6a5a3a', cord: '#6a7a3a' },
  4: { tex: 'kt_char', len: 1.22, w: 0.16, curve: 0.09, tsuka: '#1a0e0c', wrap: '#8a1a10', tsuba: '#c0301a', saya: '#3a1a14', cord: '#ff6a1a' },
};
const lookFor = (tier, branch) => LOOKS[tier >= 4 ? 4 : tier === 3 ? (branch === 'b' ? 3.2 : 3.1) : tier] ?? LOOKS[1];

const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
const cone = (r, h, seg, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); return m; };
const em = (hex) => new THREE.MeshBasicMaterial({ color: hex, fog: false });

/** Blade axis in the weapon frame: from the guard (y = -0.16) along -Y, curving toward -Z (the cutting edge). Returns the world-ish frame at s in 0..1. */
function bladeFrame(look, s) {
  const y0 = -0.16, L = look.len;
  const z = -look.curve * s * s * 1.6;
  return { y: y0 - L * s, z, ang: Math.atan2(-look.curve * 3.2 * s, 1) };
}

export function buildKatanaMesh({ tier = 1, branch = null } = {}) {
  const look = lookFor(tier, branch);
  const root = new THREE.Group();
  const bladeG = new THREE.Group(); // everything that is "inside the scabbard" while sheathed
  const hilt = new THREE.Group();
  root.add(hilt, bladeG);
  const bladeMat = lambert({ map: tex(look.tex, { size: 16 }), emissive: new THREE.Color(0, 0, 0) });
  const mTsuka = lambert({ color: look.tsuka }), mWrap = lambert({ color: look.wrap }), mTsuba = lambert({ color: look.tsuba });
  const mSpine = lambert({ map: tex(look.tex, { size: 16 }), color: '#8a8a8a', emissive: new THREE.Color(0, 0, 0) });

  // --- hilt (tsuka): right hand at the origin, off hand on grip2
  hilt.add(box(0.07, 0.5, 0.07, mTsuka, 0, 0.12, 0));
  for (let i = 0; i < 5; i++) hilt.add(box(0.085, 0.04, 0.085, mWrap, 0, -0.06 + i * 0.1, 0));
  hilt.add(box(0.1, 0.05, 0.1, mTsuba, 0, 0.38, 0)); // kashira (pommel)
  const guard = box(0.2, 0.035, 0.2, mTsuba, 0, -0.15, 0);
  hilt.add(guard);

  // --- blade: segments along a curve
  const SEG = 5;
  const edges = [];
  for (let i = 0; i < SEG; i++) {
    const s0 = i / SEG, s1 = (i + 1) / SEG;
    const f0 = bladeFrame(look, s0), f1 = bladeFrame(look, s1);
    const len = Math.hypot(f1.y - f0.y, f1.z - f0.z);
    const taper = i === SEG - 1 ? 0.7 : 1;
    const seg = box(0.04, len + 0.01, look.w * taper, bladeMat, 0, (f0.y + f1.y) / 2, (f0.z + f1.z) / 2);
    seg.rotation.x = Math.atan2(-(f1.z - f0.z), -(f1.y - f0.y)); // bend toward -Z (the edge)
    bladeG.add(seg);
    const sp = box(0.04, len + 0.01, 0.022, mSpine, 0, (f0.y + f1.y) / 2, (f0.z + f1.z) / 2 + look.w * taper * 0.5);
    sp.rotation.x = seg.rotation.x;
    bladeG.add(sp);
    edges.push({ f0, f1, mid: { y: (f0.y + f1.y) / 2, z: (f0.z + f1.z) / 2 }, rx: seg.rotation.x });
  }
  const tipF = bladeFrame(look, 1);
  const kissaki = cone(look.w * 0.5, 0.16, 4, bladeMat, 0, tipF.y - 0.06, tipF.z - look.w * 0.12, 0, 0);
  kissaki.rotation.set(Math.PI + 0.25, Math.PI / 4, 0);
  kissaki.scale.set(0.35, 1, 1);
  bladeG.add(kissaki);

  // --- tier decoration (stronger = more extreme)
  const ex = [];
  if (tier <= 1) { // Rostkatana: rusty, notched, frayed cord
    const rustM = lambert({ color: '#7a3a14' }), dark = lambert({ color: '#2a1a10' });
    for (const [s, w] of [[0.3, 0.03], [0.55, 0.04], [0.8, 0.03]]) { const f = bladeFrame(look, s); bladeG.add(box(0.034, 0.05, w, dark, 0, f.y, f.z - look.w * 0.5)); }
    for (const s of [0.2, 0.45, 0.7]) { const f = bladeFrame(look, s); bladeG.add(box(0.034, 0.07, 0.05, rustM, 0, f.y, f.z + 0.01)); }
    hilt.add(box(0.02, 0.2, 0.02, lambert({ color: look.cord }), 0.07, 0.42, 0.03));
  } else if (tier === 2) { // Knochenkatana: serrated spine, vertebra guard, leather wrap
    const boneM = lambert({ map: tex('bone', { size: 16 }) });
    for (let i = 0; i < 6; i++) { const f = bladeFrame(look, 0.12 + i * 0.14); bladeG.add(cone(0.035, 0.09, 3, boneM, 0, f.y, f.z + look.w * 0.62, Math.PI / 2, 0)); }
    guard.scale.set(1.5, 1.6, 1.1);
    hilt.add(box(0.12, 0.1, 0.12, boneM, 0, -0.2, 0), cone(0.05, 0.12, 4, boneM, 0, 0.47, 0, 0, 0));
    hilt.add(box(0.025, 0.28, 0.025, lambert({ color: look.cord }), 0.08, 0.5, 0));
  } else if (tier === 3 && branch !== 'b') { // Jaggo-Reissahn: fang-shaped blade, crest spikes, red cord
    const crest = lambert({ map: tex('crest', { size: 16 }) });
    for (let i = 0; i < 6; i++) { const s = 0.1 + i * 0.14; const f = bladeFrame(look, s); bladeG.add(cone(0.05 - i * 0.004, 0.18 - i * 0.012, 3, crest, 0, f.y + 0.03, f.z + look.w * 0.66, 0.5, 0)); }
    const fang = lambert({ map: tex('bone', { size: 16 }) });
    bladeG.add(cone(0.07, 0.24, 4, fang, 0, tipF.y + 0.22, tipF.z - look.w * 0.5 + 0.02, Math.PI - 0.15, 0));
    guard.scale.set(1.9, 1.4, 1.2);
    hilt.add(cone(0.05, 0.2, 3, fang, 0.17, -0.1, 0, 0, -0.6), cone(0.05, 0.2, 3, fang, -0.17, -0.1, 0, 0, 0.6));
    hilt.add(box(0.03, 0.34, 0.03, lambert({ color: look.cord }), 0.09, 0.5, 0), box(0.03, 0.22, 0.03, lambert({ color: look.cord }), 0.1, 0.72, 0.04));
  } else if (tier === 3) { // Barrotz-Schlickschneide: thick mud-crusted edge, shock crystals
    const clay = lambert({ map: tex('kt_mud', { size: 16 }) });
    for (let i = 0; i < 6; i++) { const f = bladeFrame(look, 0.12 + i * 0.14); bladeG.add(box(0.06, 0.1, 0.07, clay, (i % 2 ? 0.01 : -0.01), f.y, f.z - look.w * 0.5)); }
    for (let i = 0; i < 3; i++) { const f = bladeFrame(look, 0.25 + i * 0.25); bladeG.add(box(0.05, 0.13, 0.09, clay, 0, f.y, f.z + 0.02)); }
    guard.scale.set(2.0, 2.0, 1.4);
    hilt.add(box(0.2, 0.08, 0.24, clay, 0, -0.2, 0));
    const shock = em('#9fe8ff');
    for (const [x, y] of [[0.12, 0.2], [-0.1, 0.28], [0.05, 0.44]]) hilt.add(cone(0.035, 0.12, 4, shock, x, y, 0.05, 0, x > 0 ? -0.5 : 0.5));
    for (const s of [0.35, 0.75]) { const f = bladeFrame(look, s); bladeG.add(cone(0.03, 0.1, 4, shock, 0.03, f.y, f.z + look.w * 0.6)); }
    ex.push(shock);
  } else { // Brathalos-Glutkatana: charred blade with ember vein, wing-spike guard, fins, glow
    const ember = em('#ff7a1a'), hot = em('#ffd060');
    for (let i = 0; i < SEG; i++) { const e = edges[i]; const v = box(0.034, e.f1.y !== e.f0.y ? Math.hypot(e.f1.y - e.f0.y, e.f1.z - e.f0.z) : 0.2, 0.02, i % 2 ? ember : hot, 0, e.mid.y, e.mid.z); v.rotation.x = e.rx; bladeG.add(v); }
    const fin = lambert({ map: tex('kt_char', { size: 16 }) });
    for (let i = 0; i < 7; i++) { const f = bladeFrame(look, 0.08 + i * 0.12); bladeG.add(cone(0.06 - i * 0.004, 0.26 - i * 0.02, 3, fin, 0, f.y + 0.05, f.z + look.w * 0.72, 0.7, 0)); }
    guard.scale.set(2.6, 1.6, 1.3);
    for (const sx of [-1, 1]) {
      hilt.add(cone(0.06, 0.34, 3, fin, sx * 0.24, -0.08, 0, 0, -sx * 1.0), cone(0.04, 0.22, 3, ember, sx * 0.3, -0.2, 0.02, 0, -sx * 1.5));
    }
    hilt.add(cone(0.07, 0.2, 4, ember, 0, 0.5, 0), box(0.03, 0.4, 0.03, lambert({ color: look.cord }), 0.09, 0.6, 0));
    const halo = new THREE.Mesh(new THREE.BoxGeometry(0.2, look.len * 1.05, 0.05), new THREE.MeshBasicMaterial({ color: '#ff5a10', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.position.set(0, -0.16 - look.len * 0.5, -look.curve * 0.5);
    bladeG.add(halo);
    root.userData.halo = halo;
    ex.push(ember, hot);
  }

  // Schliff glow shell (additive, scales with the level)
  const shellMat = new THREE.MeshBasicMaterial({ color: '#ffd040', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const shell = new THREE.Group();
  for (const e of edges) {
    const sg = box(0.065, Math.hypot(e.f1.y - e.f0.y, e.f1.z - e.f0.z) + 0.03, look.w * 1.35, shellMat, 0, e.mid.y, e.mid.z);
    sg.rotation.x = e.rx;
    shell.add(sg);
  }
  shell.visible = false;
  bladeG.add(shell);

  // off-hand grip target (pommel end of the handle)
  const grip2 = new THREE.Object3D();
  grip2.position.set(0, 0.24, 0);
  root.add(grip2);
  root.userData.grip2 = grip2;

  // scabbard on the belt (not part of the weapon in hand)
  root.userData.hip = buildSaya(look);
  root.userData.hip.position.set(...SAYA.pos);
  root.userData.hip.quaternion.set(...SAYA.quat);
  root.userData.kt = { bladeG, shell, shellMat, bladeMat, mSpine, ember: ex, look, tier, branch, hip: root.userData.hip, k: 0, t: 0, level: 0, sheathed: false };
  return root;
}

// Scabbard: local -Y = along the blade, mouth at the origin. Placed so that it matches the iaido pose (see SAYA below).
function buildSaya(look) {
  const g = new THREE.Group();
  const lac = lambert({ color: look.saya });
  const len = look.len + 0.04;
  g.add(box(0.09, len, 0.14, lac, 0, -len / 2 - 0.0, -0.01));
  g.add(box(0.1, 0.07, 0.14, lambert({ color: look.tsuba }), 0, -0.02, -0.01)); // koiguchi (mouth)
  g.add(box(0.09, 0.08, 0.12, lambert({ color: look.tsuba }), 0, -len, -0.01)); // kojiri (tip)
  g.add(box(0.095, 0.05, 0.13, lambert({ color: look.cord }), 0, -0.22, -0.01)); // cord wrap
  return g;
}

// Scabbard mount in torso space, derived from the iaido pose (tools: scripts in tests/unit/katana.test.js check it stays in reach).
export const SAYA = { pos: [0.039, 0.184, 0.049], quat: [0.4887, 0, 0.1104, 0.8654] };

const LEVEL_EM = [[0, 0, 0], [0.6, 0.48, 0.02], [0.9, 0.28, 0.02], [1, 0.95, 0.75]];
const LEVEL_SHELL = [0, 0.16, 0.3, 0.55];
const LEVEL_SHELL_COL = ['#000000', '#ffd830', '#ff6a10', '#ffffff'];

export const katana = {
  id: 'kt',
  name: 'Katana',
  tierMesh: true,
  // A: Tipp (Release < 0,2 s) / Halten = Ziehschnitt.  B: Tipp sofort bei Druck (Konter-Reaktionszeit), holdB nach 0,3 s = Mondsichel
  holdThreshold: { A: 0.2, B: 0.3 },
  earlyTap: { B: true },
  idle: {
    A: (w) => (w.hooks.player && w.hooks.player.sinceRoll < 0.3 ? 'kt_gleit' : 'kt_a1'),
    holdA: 'kt_draw',
    B: 'kt_stance',
  },
  moves,
  anims,
  rest: KT_REST,
  overrideEvent: (w, type) => (type === 'holdB' && w.wucht >= 100 ? 'kt_finisher' : undefined),
  on: {
    schliff3(w) { addSchliff(w, SCHLIFF_MAX); },
  },
  /** takeHit hook (player.js): countering is possible while this returns true */
  counter: {
    arc: 100,
    invuln: 0.4,
    active: (w) => w.moveId === 'kt_stance' && w.t <= COUNTER_WINDOW,
    onCounter(w) {
      addSchliff(w, 1);
      w.addWucht(15);
      w.startMove('kt_konter');
    },
  },
  /** Schliff: +8 % Schaden je Stufe (hunt.playerHit) */
  dmgMul: (w) => 1 + SCHLIFF_DMG * schliffLevel(w),
  poseLevel: (w) => (w.charging ? w.chargeLevel : schliffLevel(w)),
  onUpdate(w, dt) {
    if ((w.data.schliff | 0) > 0) {
      w.data.schliffT -= dt;
      if (w.data.schliffT <= 0) { w.data.schliff = 0; w.data.schliffT = 0; }
    }
  },
  buildMesh: buildKatanaMesh,
  /** blade colour by Schliff, sheathed look while drawing, ember flicker (tier 4) */
  updateMesh(w, mesh, dt, player) {
    const d = mesh?.userData.kt;
    if (!d) return;
    d.t += dt;
    const remote = player?.remote;
    let lvl = schliffLevel(w);
    if (remote) { if (remote.wp) d.remoteLevel = remote.wp.charging ? (d.remoteLevel ?? 0) : remote.wp.level; lvl = d.remoteLevel ?? 0; }
    d.k += (lvl - d.k) * (1 - Math.exp(-10 * dt));
    const lo = Math.floor(d.k), hi = Math.min(3, lo + 1), f = d.k - lo;
    const pulse = lvl >= 3 ? 0.88 + 0.12 * Math.sin(d.t * 26) : 1;
    const e = [0, 1, 2].map((i) => (LEVEL_EM[lo][i] + (LEVEL_EM[hi][i] - LEVEL_EM[lo][i]) * f) * pulse);
    // Brathalos: always glowing embers
    const t4 = d.tier >= 4;
    const emb = t4 ? 0.12 + 0.06 * Math.sin(d.t * 9) : 0;
    d.bladeMat.emissive.setRGB(Math.min(1, e[0] + emb), Math.min(1, e[1] + emb * 0.35), Math.min(1, e[2] + emb * 0.05));
    d.mSpine.emissive.copy(d.bladeMat.emissive);
    d.bladeMat.color.setScalar(1 - 0.28 * d.k);
    const sh = (LEVEL_SHELL[lo] + (LEVEL_SHELL[hi] - LEVEL_SHELL[lo]) * f) * pulse;
    d.shell.visible = sh > 0.02;
    d.shellMat.opacity = sh;
    d.shellMat.color.set(LEVEL_SHELL_COL[Math.round(d.k)]);
    if (mesh.userData.halo) mesh.userData.halo.material.opacity = 0.09 + 0.05 * Math.sin(d.t * 11) + lvl * 0.05;
    // sheathed while the blade is "in the Saya": the draw charge and the first frames of the Ziehschnitt
    const pn = remote ? remote.wp?.name : w.move?.anim;
    const pt = remote ? remote.wp?.t ?? 0 : w.t;
    const sheathed = pn === 'kt_iaido' || (pn === 'kt_zieh' && pt < 0.035);
    d.bladeG.visible = !sheathed;
    d.sheathed = sheathed;
  },
  status(w) {
    const lv = schliffLevel(w);
    const t = Math.ceil(w.data.schliffT || 0);
    if (w.charging) {
      if (w.sauberOpen) return { text: 'Blankgezogen!', level: lv, max: SCHLIFF_MAX };
      return { text: lv ? `Schliff ${lv} · ${t}s` : 'Ziehen', level: lv, max: SCHLIFF_MAX };
    }
    if (w.wucht >= 100) return { text: lv ? `Mondsichel: B halten · S${lv}` : 'Mondsichel: B halten', level: lv, max: SCHLIFF_MAX };
    if (lv) return { text: `Schliff ${lv} · ${t}s`, level: lv, max: SCHLIFF_MAX };
    return null;
  },
};
