import * as THREE from 'three';
import { compileTrack, REST } from '../anim.js';
import { lambert } from '../../render/ps1.js';
import { tex, registerTexture } from '../../render/textures.js';
import { applyMonsterHit, CRIT_MUL, HITSTOP, SHAKE } from '../combat.js';
import { createCrackPool, createCounters, MAX_CRACKS } from './glitchfx2.js';

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
    combo: { window: [0.23, 0.46], next: NEXT_FROM_CUT },
    rollCancelAt: 0.3, moveSpeed: 0.35, turnSpeed: 0.5,
  },
  kt_a2: { // Zugschnitt: waagrechter Zug nach links
    id: 'kt_a2', anim: 'kt_a2', duration: 0.55,
    hits: cut({ kind: 'horz', t0: 0.13, t1: 0.24, n: 5, p0: -80, p1: 80, mv: 22, wucht: 3, hitstop: 'light', group: 'a2' }),
    combo: { window: [0.25, 0.5], next: { ...NEXT_FROM_CUT, A: 'kt_a3' } },
    rollCancelAt: 0.32, moveSpeed: 0.35, turnSpeed: 0.5,
  },
  kt_a3: { // Kreuzhieb: zwei Diagonalen (X), 2 x BW 14 = BW 28
    id: 'kt_a3', anim: 'kt_a3', duration: 0.78,
    hits: [
      ...cut({ t0: 0.13, t1: 0.22, a0: 168, a1: 45, tilt: 30, mv: 14, wucht: 1.5, hitstop: 'light', group: 'a3a' }),
      ...cut({ t0: 0.31, t1: 0.41, a0: 168, a1: 45, tilt: -30, mv: 14, wucht: 1.5, hitstop: 'medium', group: 'a3b' }),
    ],
    combo: { window: [0.43, 0.7], next: { ...NEXT_FROM_CUT, A: 'kt_a2' } }, // wiederholbar ab Zugschnitt
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
    combo: { window: [0.2, 0.55], next: { A: 'kt_a2', holdA: 'kt_draw', B: 'kt_stance' } },
    rollCancelAt: 0.3, moveSpeed: 0, turnSpeed: 0.3,
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
    combo: { window: [0.26, 0.62], next: { A: 'kt_a2', holdA: 'kt_draw', B: 'kt_stance' } },
    rollCancelAt: 0.34, moveSpeed: 0, turnSpeed: 0.3,
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
export const KT_REST = { ...P(62, 146), arz: -10, alz: 9, tx: 8, ty: 0, py: -0.07, lrx: 14, rrx: -14, hx: 0 }; // blade raised beside the shoulder: readable from the chase camera
const BASE = { ...REST, ...KT_REST };
const A = (frames) => compileTrack(frames, BASE);
const SHEATHED = { ...P(18, -52), arz: -42, tx: 12, ty: -8, py: -0.16, lrx: 16, rrx: -20, hx: 4 }; // hand on the hilt at the belly, blade in the scabbard
const anims = {
  kt_a1: A([
    [0, {}], [0.1, { ...P(130, 168), tx: -8, py: 0, arz: -14 }], [0.12, P(130, 168), 'lin'], [0.21, { ...P(52, 60), tx: 28, py: -0.12, arz: -24 }, 'lin'], [0.36, P(52, 60)], [0.5, {}],
  ]),
  kt_a2: A([
    [0, {}], [0.11, { ...P(86, 92), ty: -78, tx: 8, py: -0.1, arz: -30 }], [0.13, {}, 'lin'], [0.24, { ty: 78, tx: 14 }, 'lin'], [0.38, { ty: 70 }], [0.55, { ...KT_REST, ty: 0 }],
  ]),
  kt_a3: A([
    [0, {}], [0.1, { ...P(132, 170), ty: 18, tx: -6, py: 0, arz: -14 }], [0.13, {}, 'lin'], [0.22, { ...P(48, 48), ty: -30, tx: 28, py: -0.12, arz: -26 }, 'lin'],
    [0.29, { ...P(130, 170), ty: -18, tx: -4, py: 0 }], [0.31, {}, 'lin'], [0.41, { ...P(46, 46), ty: 32, tx: 30, py: -0.14 }, 'lin'], [0.55, {}], [0.78, { ...KT_REST, ty: 0 }],
  ]),
  kt_iaido: A([[0, {}], [0.2, SHEATHED]]),
  kt_zieh: A([
    [0, SHEATHED], [0.04, { ...SHEATHED, ty: -40, tx: 16 }, 'lin'], [0.15, { ...P(86, 92), arz: -30, ty: 62, tx: 20, py: -0.1 }, 'lin'], [0.34, { ...P(86, 92), ty: 62 }], [0.62, { ...KT_REST, ty: 0 }],
  ]),
  kt_stance: A([ // low guard, blade angled across the body, weight back
    [0, {}], [0.07, { ...P(78, 140), arz: -34, ty: 24, tx: 4, py: -0.2, lrx: 22, rrx: -26, hx: 6 }], [0.4, { ...P(78, 140), arz: -34, ty: 24, py: -0.2 }],
    [0.52, { ...P(70, 128), arz: -30, ty: 14, py: -0.14 }], [0.75, {}],
  ]),
  kt_konter: A([
    [0, { ...P(78, 140), arz: -34, ty: 24, tx: 4, py: -0.2 }], [0.04, { ...P(132, 170), ty: 14, tx: -6, py: 0, arz: -14 }, 'lin'], [0.15, { ...P(46, 40), ty: -26, tx: 32, py: -0.14, arz: -26 }, 'lin'],
    [0.4, P(46, 40)], [0.7, { ...KT_REST, ty: 0 }],
  ]),
  kt_gleit: A([
    [0, { py: -0.3, tx: 30, ...P(90, 94), ty: -70, arz: -30 }], [0.1, { py: -0.3, tx: 30, ...P(90, 94), ty: -72 }], [0.2, { ty: 72, tx: 28, py: -0.28 }, 'lin'], [0.36, { ty: 60, py: -0.2 }], [0.55, { ...KT_REST, ty: 0 }],
  ]),
  kt_finisher: A([ // Sprung-Drehschnitt (Torso-Drehung ty statt Koerper-Gier, damit nichts nach dem Move zurueckdreht)
    [0, {}], [0.18, { py: -0.38, tx: 26, ...P(150, 178), ty: -60, lrx: 26, rrx: -18 }], [0.4, { py: 0.25, tx: -10, lrx: -14, rrx: -14, ...P(160, 180), ty: -150 }, 'lin'],
    [0.5, { py: 0.1, ...P(100, 100), ty: -60, tx: 14 }, 'lin'], [0.64, { py: -0.1, ...P(86, 92), ty: 110, tx: 30 }, 'lin'], [0.9, { py: -0.18, ty: 90, tx: 34 }],
    [1.5, { ...KT_REST, ty: 0 }],
]),
};

// ---- visuals ---------------------------------------------------------------------------------------------------
registerTexture('kt_rust', (g, n, rnd) => { // Schrott: stumpfes Grau, rostige Flecken
  g.fillStyle = '#a0a2a8'; g.fillRect(0, 0, n, n);
  const cols = ['#84868c', '#b4b6bc', '#8a4a22', '#5a4a3a', '#a85a28'];
  for (let i = 0; i < n * n * 0.5; i++) { g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1 + ((rnd() * 2) | 0), 1); }
  g.fillStyle = '#c9ced8'; g.fillRect(0, n >> 1, n, 1);
});
registerTexture('kt_bone', (g, n, rnd) => {
  g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < n * 2; i++) { g.fillStyle = rnd() < 0.5 ? '#d2c3a0' : '#f4ecd6'; g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 2); }
  g.fillStyle = '#a89878'; g.fillRect(0, n - 2, n, 1);
});
registerTexture('kt_fang', (g, n, rnd) => { // Jaggo: violette Schuppen (Halbbogen-Reihen)
  g.fillStyle = '#5a3aa8'; g.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y += 4) for (let x = (y >> 2) % 2 ? 0 : 2; x < n; x += 4) { g.fillStyle = '#7a56d0'; g.fillRect(x, y, 3, 2); g.fillStyle = '#2e1a70'; g.fillRect(x, y + 3, 3, 1); }
  g.fillStyle = '#d8c8ff'; g.fillRect(0, n - 3, n, 1);
});
registerTexture('kt_horn', (g, n, rnd) => { // Barrotz: graue Horn-/Tonplatten
  g.fillStyle = '#8c8870'; g.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y += 5) { g.fillStyle = '#a8a088'; g.fillRect(0, y, n, 2); g.fillStyle = '#4a4636'; g.fillRect(0, y + 3, n, 1); }
  for (let i = 0; i < n; i++) { g.fillStyle = '#5a4a32'; g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 2, 2); }
});
registerTexture('kt_mud', (g, n, rnd) => { // Barrotz: layered clay
  g.fillStyle = '#5a4a32'; g.fillRect(0, 0, n, n);
  const cols = ['#6a5a3c', '#4a3a24', '#7a6a48', '#3a2e1e'];
  for (let y = 0; y < n; y += 2) { g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(0, y, n, 2); }
  for (let i = 0; i < n; i++) { g.fillStyle = '#8a8a6a'; g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1); }
});
registerTexture('kt_char', (g, n, rnd) => { // Brathalos: dunkelrote Fluegelmembran mit Adern
  g.fillStyle = '#6a1010'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < n * 2; i++) { g.fillStyle = rnd() < 0.5 ? '#9a2018' : '#4a0c0a'; g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1); }
  g.fillStyle = '#c02a14'; for (let x = 3; x < n; x += 6) g.fillRect(x, 0, 1, n);
});

registerTexture('kt_kessel', (g, n, rnd) => { // Kroll: Kesselstahl, blaugrau, genietet
  g.fillStyle = '#7e8a96'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < n * 2; i++) { g.fillStyle = rnd() < 0.5 ? '#98a4b0' : '#5a6672'; g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1); }
  g.fillStyle = '#d8e0e8'; for (let y = 3; y < n; y += 6) { g.fillRect(2, y, 1, 1); g.fillRect(n - 3, y, 1, 1); }
});
registerTexture('kt_slag', (g, n, rnd) => { // Gorgo: Schlacke mit Glutadern
  g.fillStyle = '#2a2420'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < n * 2; i++) { g.fillStyle = rnd() < 0.5 ? '#3a322c' : '#1a1512'; g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1); }
  g.fillStyle = '#ff6a1a'; for (let i = 0; i < 8; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 3);
});
registerTexture('kt_copper', (g, n, rnd) => { // Voltaro: blankes Kupfer mit blauen Funkenpunkten
  g.fillStyle = '#e07a30'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < n * 2; i++) { g.fillStyle = rnd() < 0.5 ? '#f09a50' : '#b05a20'; g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1); }
  g.fillStyle = '#7ae0ff'; for (let i = 0; i < 5; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1);
});
registerTexture('kt_apex', (g, n, rnd) => { // Funkenfuerst: helles Stahlweiss mit blauen Leiterbahnen
  g.fillStyle = '#d8ecf8'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < n * 2; i++) { g.fillStyle = rnd() < 0.5 ? '#bcd8ee' : '#f4fbff'; g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1); }
  g.fillStyle = '#3ac0ff'; for (let y = 2; y < n; y += 5) { g.fillRect(0, y, n, 1); g.fillRect((rnd() * n) | 0, y, 1, 3); }
});

// Per-tier look. len = blade length (m), w = blade width, curve = sori, tipW = kissaki width factor.
const LOOKS = {
  1: { id: 'rust', tex: 'kt_rust', len: 0.9, w: 0.12, curve: 0.04, thick: 0.04, spineW: 0.04, spineD: 0.025, tip: 'broken', tipTaper: 0.55, tsuka: '#5a4a3a', wrap: '#4a3a2a', tsuba: '#6a6a70', saya: '#4a3a2a', cord: '#a89870' },
  2: { id: 'bone', tex: 'kt_bone', len: 1.02, w: 0.17, curve: 0.06, thick: 0.075, spineW: 0.06, spineD: 0.03, tip: 'kissaki', tipTaper: 0.8, wt: 0.1, tsuka: '#7a5a3a', wrap: '#5a3a22', tsuba: '#e8dcc0', saya: '#a8845a', cord: '#a8301c' },
  3.1: { id: 'jaggo', tex: 'kt_fang', len: 1.12, w: 0.13, curve: 0.13, thick: 0.045, spineW: 0.03, spineD: 0.018, tip: 'kissaki', tipTaper: 0.6, wt: 0.2, tsuka: '#3a2a80', wrap: '#ff9a3a', tsuba: '#ece4d0', saya: '#4a30b0', cord: '#ff5a1a' },
  3.2: { id: 'barrotz', tex: 'kt_horn', len: 0.98, w: 0.25, curve: 0.015, thick: 0.1, spineW: 0.08, spineD: 0.07, tip: 'flat', tipTaper: 0.9, tsuka: '#4a3a24', wrap: '#6a5a32', tsuba: '#7a6a4a', saya: '#6a5a3a', cord: '#6a7a3a' },
  4: { id: 'brat', emb: [0.5, 0.1, 0.02], tex: 'kt_char', len: 1.25, w: 0.18, curve: 0.1, thick: 0.05, spineW: 0.035, spineD: 0.02, tip: 'kissaki', tipTaper: 0.55, wt: 0.12, tsuka: '#1a0e0c', wrap: '#b02018', tsuba: '#c0301a', saya: '#5a1410', cord: '#ff6a1a' },
  '5k': { id: 'kroll', emb: [0, 0, 0], tex: 'kt_kessel', len: 1.18, w: 0.26, curve: 0.02, thick: 0.085, spineW: 0.07, spineD: 0.04, tip: 'flat', tipTaper: 0.85, tsuka: '#3a3e44', wrap: '#6a4a2a', tsuba: '#9aa4aa', saya: '#3a4650', cord: '#d89a50' },
  '5g': { id: 'gorgo', emb: [0.25, 0.06, 0], tex: 'kt_slag', len: 1.3, w: 0.2, curve: 0.09, thick: 0.06, spineW: 0.045, spineD: 0.03, tip: 'kissaki', tipTaper: 0.6, gap: 0.12, stagger: 0.012, wt: 0.25, tsuka: '#1a1512', wrap: '#5a2412', tsuba: '#3a3430', saya: '#241f1c', cord: '#ff6a1a' },
  '5v': { id: 'volt', emb: [0, 0.06, 0.2], tex: 'kt_copper', len: 1.25, w: 0.15, curve: 0.05, thick: 0.045, spineW: 0.035, spineD: 0.02, tip: 'fork', tipTaper: 0.8, tsuka: '#1a1e2a', wrap: '#2a3a5a', tsuba: '#b8642a', saya: '#1a1e2a', cord: '#5ad0ff' },
  6: { id: 'apex', emb: [0.2, 0.6, 1], tex: 'kt_apex', len: 1.5, w: 0.19, curve: 0.07, thick: 0.05, spineW: 0.04, spineD: 0.022, tip: 'fork', tipTaper: 0.8, tsuka: '#10141e', wrap: '#5ad0ff', tsuba: '#e89a50', saya: '#10141e', cord: '#fff0a0' },
};
/** Stufe 5/6 -> Ast-Key ('k' Kroll, 'g' Gorgo, 'v' Voltaro; Stufe 6 immer Voltaro-Funkenfuerst). */
export const katanaRwBranch = (tier, branch) => (tier >= 6 ? 'v' : branch === 'g' || branch === 'v' ? branch : 'k');
const lookFor = (tier, branch) => LOOKS[tier >= 6 ? 6 : tier === 5 ? `5${katanaRwBranch(5, branch)}` : tier >= 4 ? 4 : tier === 3 ? (branch === 'b' ? 3.2 : 3.1) : tier] ?? LOOKS[1];

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

  const L = (c) => lambert({ color: c });
  const lk = look.id;
  const big = tier >= 6 ? 1.35 : 1;
  const ex = [];
  const addHalo = (col, wid) => {
    const halo = new THREE.Mesh(new THREE.BoxGeometry(wid, look.len * 1.05, 0.05), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.position.set(0, -0.16 - look.len * 0.5, -look.curve * 0.5);
    bladeG.add(halo);
    root.userData.halo = halo;
  };

  // --- hilt (tsuka): right hand at the origin, off hand on grip2
  hilt.add(box(0.07, 0.5, 0.07, mTsuka, 0, 0.12, 0));
  const guard = box(0.2, 0.035, 0.2, mTsuba, 0, -0.15, 0);
  hilt.add(guard);
  const wrapN = lk === 'volt' || lk === 'apex' || lk === 'rust' ? 0 : 5;
  for (let i = 0; i < wrapN; i++) hilt.add(box(0.085, 0.04, 0.085, mWrap, 0, -0.06 + i * 0.1, 0));
  if (wrapN) hilt.add(box(0.1, 0.05, 0.1, mTsuba, 0, 0.38, 0)); // kashira (pommel)

  // --- blade: segments along a curve (per look: thickness, taper, stagger, slab gaps, tip style)
  const SEG = 5;
  const edges = [];
  const th = look.thick, wAt = (s) => look.w * (1 - (look.wt || 0) * s), sl = (len) => len * (look.gap ? 1 - look.gap : 1) + 0.01;
  for (let i = 0; i < SEG; i++) {
    const s0 = i / SEG, s1 = (i + 1) / SEG;
    const f0 = bladeFrame(look, s0), f1 = bladeFrame(look, s1);
    const len = Math.hypot(f1.y - f0.y, f1.z - f0.z);
    const taper = i === SEG - 1 ? look.tipTaper : 1;
    const my = (f0.y + f1.y) / 2, mz = (f0.z + f1.z) / 2 + (look.stagger ? (i % 2 ? 1 : -1) * look.stagger : 0);
    const sw = wAt((s0 + s1) / 2) * taper;
    const seg = box(th, sl(len), sw, bladeMat, 0, my, mz);
    seg.rotation.x = Math.atan2(-(f1.z - f0.z), -(f1.y - f0.y));
    bladeG.add(seg);
    const sp = box(look.spineW, sl(len), look.spineD, mSpine, 0, my, mz + sw * 0.5);
    sp.rotation.x = seg.rotation.x;
    bladeG.add(sp);
    edges.push({ f0, f1, mid: { y: my, z: mz }, rx: seg.rotation.x, sw, len });
  }
  const tipF = bladeFrame(look, 1);
  const ex2 = [];
  if (look.tip === 'kissaki') {
    const kissaki = cone(look.w * 0.5, 0.16, 4, bladeMat, 0, tipF.y - 0.06, tipF.z - look.w * 0.12, 0, 0);
    kissaki.rotation.set(Math.PI + 0.25, Math.PI / 4, 0);
    kissaki.scale.set(th / 0.055 * 0.35, 1, 1);
    bladeG.add(kissaki);
  } else if (look.tip === 'flat') { // chisel / cleaver end: one slanted cap
    const cap = box(th, 0.05, look.w * 0.7, bladeMat, 0, tipF.y - 0.03, tipF.z - look.w * 0.1);
    cap.rotation.x = 0.35;
    bladeG.add(cap);
  } else if (look.tip === 'fork') { // Voltaro antenna tines
    const n = tier >= 6 ? 3 : 2, tc = em(tier >= 6 ? '#aef0ff' : '#7ae0ff');
    for (let i = 0; i < n; i++) {
      const dz = n === 3 ? (i - 1) * 0.07 : (i ? 0.045 : -0.045);
      const pr = box(0.03, 0.2 * big, 0.026, bladeMat, 0, tipF.y - 0.08, tipF.z + dz); pr.rotation.x = dz * -1.6;
      bladeG.add(pr, box(0.034, 0.03, 0.034, tc, 0, tipF.y - 0.19 * big, tipF.z + dz * 1.5));
    }
    ex2.push(tc);
  } // 'broken' (Rost): ragged cut, no cap

  // hamon: a glowing hardening line along the edge (both flat sides)
  const hamon = (col, wd = 0.022) => {
    const m = em(col);
    for (const e of edges) { const v = box(th + 0.008, sl(e.len), wd, m, 0, e.mid.y, e.mid.z - e.sw * 0.38); v.rotation.x = e.rx; bladeG.add(v); }
    ex2.push(m);
  };

  // --- per-look silhouette + material language
  if (lk === 'rust') { // Stufe 1: Schrottklinge, schartig, umwickelter Griff
    const rustM = L('#8a4018'), dark = L('#24201c'), tape = L(look.cord);
    for (const [s, w] of [[0.18, 0.04], [0.34, 0.05], [0.52, 0.04], [0.7, 0.05], [0.86, 0.04]]) { const f = bladeFrame(look, s); bladeG.add(box(th + 0.02, 0.045, w, dark, 0, f.y, f.z - look.w * 0.5 + 0.005)); } // Scharten
    for (const [s, sx] of [[0.25, 1], [0.5, -1], [0.75, 1]]) { const f = bladeFrame(look, s); bladeG.add(box(0.012, 0.09, 0.06, rustM, sx * (th / 2 + 0.003), f.y, f.z + 0.01)); } // Rostflecken
    { const f = bladeFrame(look, 0.97); bladeG.add(box(th + 0.02, 0.04, 0.12, dark, 0, f.y, f.z)); } // abgebrochene Spitze
    guard.scale.set(1.0, 0.6, 1.0);
    hilt.add(box(0.2, 0.025, 0.06, L('#6a4a30'), 0, -0.13, 0)); // angeschraubtes Blech
    for (let i = 0; i < 8; i++) { const b = box(0.095, 0.02, 0.095, tape, 0, -0.1 + i * 0.06, 0); b.rotation.y = 0.5; hilt.add(b); } // Klebeband-Wicklung
    hilt.add(box(0.1, 0.05, 0.1, L('#4a4a50'), 0, 0.38, 0), box(0.02, 0.22, 0.02, tape, 0.07, 0.42, 0.03), box(0.015, 0.14, 0.015, tape, -0.06, 0.4, -0.03)); // Fransen
  } else if (lk === 'bone') { // Stufe 2: Knochenklinge, Wirbel-Tsuba
    const boneM = lambert({ map: tex('bone', { size: 16 }) }), ring = L('#bca880');
    for (let i = 0; i < 6; i++) { const f = bladeFrame(look, 0.12 + i * 0.14); bladeG.add(cone(0.035, 0.09, 3, boneM, 0, f.y, f.z + look.w * 0.62, Math.PI / 2, 0)); }
    for (let i = 0; i < 5; i++) { const f = bladeFrame(look, 0.14 + i * 0.17); bladeG.add(box(th + 0.012, 0.025, look.w * 0.9, ring, 0, f.y, f.z)); } // Wachstumsringe
    guard.visible = false;
    for (let i = 0; i < 5; i++) { const k = Math.abs(i - 2); hilt.add(box(0.075, 0.07 - k * 0.012, 0.1 - k * 0.015, boneM, (i - 2) * 0.075, -0.15, 0)); hilt.add(cone(0.02, 0.06, 3, boneM, (i - 2) * 0.075, -0.15, 0.065, Math.PI / 2, 0)); } // Wirbelkette
    hilt.add(box(0.12, 0.08, 0.12, boneM, 0, 0.44, 0), cone(0.05, 0.12, 4, boneM, 0, 0.53, 0, 0, 0));
    hilt.add(box(0.025, 0.28, 0.025, L(look.cord), 0.08, 0.5, 0));
  } else if (lk === 'jaggo') { // Stufe 3a: Schuppenklinge, oranger Kamm, Zahn-Tsuba
    const comb = L('#ff8a2a'), combD = L('#c04a10'), tooth = lambert({ map: tex('bone', { size: 16 }) });
    for (let i = 0; i < 9; i++) { const f = bladeFrame(look, 0.04 + i * 0.1); const h = 0.26 - i * 0.02; bladeG.add(cone(0.05 - i * 0.003, h, 3, i % 2 ? combD : comb, 0, f.y + 0.02, f.z + look.w * 0.5 + h * 0.4, 0.55, 0)); } // gezackter Kamm
    for (let i = 0; i < 4; i++) { const f = bladeFrame(look, 0.15 + i * 0.2); bladeG.add(box(th + 0.012, 0.03, look.w * 0.7, comb, 0, f.y, f.z - 0.005)); } // Streifen
    guard.scale.set(1.5, 0.9, 1.5);
    const n = 8; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const c = cone(0.035, 0.13, 3, tooth, Math.cos(a) * 0.15, -0.15, Math.sin(a) * 0.15); c.rotation.set(Math.sin(a) * Math.PI / 2, 0, -Math.cos(a) * Math.PI / 2); hilt.add(c); } // Zahnkranz-Tsuba
    hilt.add(cone(0.06, 0.2, 4, comb, 0, 0.54, 0, 0, 0));
  } else if (lk === 'barrotz') { // Stufe 3b: schwere Horn-/Plattenklinge, Schlickkruste, stumpfer Ruecken
    const clay = lambert({ map: tex('kt_mud', { size: 16 }) }), horn = L('#c4b48c'), shock = em('#9fe8ff');
    for (let i = 0; i < 3; i++) { const f = bladeFrame(look, 0.18 + i * 0.28); const b = box(th + 0.02, 0.2, look.w * 0.8, horn, 0, f.y, f.z + 0.01); b.rotation.z = (i - 1) * 0.06; bladeG.add(b); } // Hornplatten
    for (let i = 0; i < 8; i++) { const f = bladeFrame(look, 0.1 + i * 0.1); bladeG.add(box(th + 0.03, 0.07 + (i % 3) * 0.02, 0.07, clay, (i % 2 ? 0.008 : -0.008), f.y, f.z - look.w * 0.5 + 0.02)); } // Schlickkruste an der Schneide
    for (let i = 0; i < 4; i++) { const f = bladeFrame(look, 0.2 + i * 0.2); bladeG.add(box(th + 0.025, 0.1, 0.09, clay, 0, f.y, f.z + look.w * 0.32)); }
    guard.scale.set(2.3, 2.2, 1.6);
    hilt.add(box(0.26, 0.1, 0.26, clay, 0, -0.21, 0), cone(0.07, 0.22, 4, horn, 0.17, -0.1, 0, 0, -0.5), cone(0.07, 0.22, 4, horn, -0.17, -0.1, 0, 0, 0.5));
    for (const [x, y] of [[0.12, 0.2], [-0.1, 0.28], [0.05, 0.44]]) hilt.add(cone(0.035, 0.12, 4, shock, x, y, 0.05, 0, x > 0 ? -0.5 : 0.5));
    for (const s of [0.35, 0.75]) { const f = bladeFrame(look, s); bladeG.add(cone(0.03, 0.1, 4, shock, 0.05, f.y, f.z + look.w * 0.45)); }
    ex.push(shock);
  } else if (lk === 'brat') { // Stufe 4: rote Fluegelmembran-Wicklung, Horn-Spitze, Glut-Hamon
    const ember = em('#ff7a1a'), horn = L('#e8d8b0'), mem = L('#b02018'), memD = L('#6a100c');
    hamon('#ff9a2a', 0.03);
    bladeG.add(cone(0.05, 0.32, 4, horn, 0, tipF.y - 0.14, tipF.z - 0.03, Math.PI + 0.3, 0)); // Horn-Spitze
    for (let i = 0; i < 4; i++) { const f = bladeFrame(look, 0.15 + i * 0.2); bladeG.add(cone(0.04, 0.18, 3, horn, 0, f.y + 0.03, f.z + look.w * 0.62, 0.7, 0)); }
    guard.scale.set(2.4, 1.2, 1.2);
    for (const sx of [-1, 1]) {
      hilt.add(cone(0.06, 0.34, 3, horn, sx * 0.24, -0.08, 0, 0, -sx * 1.0));
      for (let j = 0; j < 3; j++) { const m = box(0.02, 0.22 - j * 0.04, 0.12 - j * 0.02, j % 2 ? memD : mem, sx * (0.1 + j * 0.07), -0.3 + j * 0.03, 0); m.rotation.z = sx * (0.25 + j * 0.15); hilt.add(m); } // Membran-Fetzen
    }
    for (let i = 0; i < 6; i++) { const m = box(0.09, 0.05, 0.09, i % 2 ? memD : mem, 0, -0.08 + i * 0.07, 0); m.rotation.y = 0.3 * (i % 2 ? 1 : -1); hilt.add(m); } // Membran-Wicklung
    hilt.add(cone(0.07, 0.2, 4, ember, 0, 0.5, 0));
    addHalo('#ff5a10', 0.2);
    ex.push(ember);
  } else if (lk === 'kroll') { // Stufe 5k: Kesselstahl, Nieten, Scheren-Tsuba, Ventil, Dampf
    const rivet = L('#d8c8b0'), seam = L('#2e3238'), brass = L('#b8862a'), steam = new THREE.MeshBasicMaterial({ color: '#e8f0f0', transparent: true, opacity: 0.4, depthWrite: false, fog: false });
    for (let i = 0; i < 4; i++) { const f = bladeFrame(look, 0.2 + i * 0.2); bladeG.add(box(th + 0.012, 0.022, look.w * 1.0, seam, 0, f.y, f.z)); } // Plattennaehte
    for (let i = 0; i < 10; i++) { const f = bladeFrame(look, 0.1 + (i >> 1) * 0.19); bladeG.add(box(th + 0.022, 0.03, 0.03, rivet, 0, f.y, f.z + (i % 2 ? 0.07 : -0.07))); } // Nietenreihen
    bladeG.add(box(0.035, look.len * 0.8, 0.04, brass, 0, -0.16 - look.len * 0.45, bladeFrame(look, 0.45).z + look.w * 0.58)); // Dampfrohr am Ruecken
    guard.visible = false;
    for (const sx of [-1, 1]) { const b = box(0.3, 0.035, 0.07, L('#9aa4aa'), 0, -0.15, 0); b.rotation.y = sx * 0.55; hilt.add(b); } // Scheren-Tsuba (zwei gekreuzte Klingen)
    hilt.add(box(0.04, 0.05, 0.1, seam, 0, -0.15, 0));
    hilt.add(box(0.09, 0.04, 0.09, brass, 0, 0.4, 0), box(0.03, 0.1, 0.03, brass, 0, 0.47, 0), box(0.14, 0.025, 0.025, L('#a82a1a'), 0, 0.53, 0), box(0.025, 0.025, 0.14, L('#a82a1a'), 0, 0.53, 0)); // Ventil mit Handrad
    for (const [x, y, z, s] of [[0.0, 0.7, 0.0, 0.1], [0.05, 0.84, 0.03, 0.13], [-0.03, 1.0, -0.02, 0.16]]) hilt.add(box(s, s * 0.8, s, steam, x, y, z)); // Dampf
    ex.push(rivet);
  } else if (lk === 'gorgo') { // Stufe 5g: segmentierte Schlackeklinge mit Glutrissen, Zahnkranz-Tsuba
    const glow = em('#ff6a1a'), hot = em('#ffd060'), tooth = L('#d8c8a0'), slag = L('#2a2420');
    bladeG.add(box(0.03, look.len * 0.98, 0.03, glow, 0, -0.16 - look.len * 0.5, -look.curve * 0.55)); // Glutkern zwischen den Segmenten
    for (const e of edges) bladeG.add(box(th * 0.6, 0.04, look.w * 0.6, hot, 0, e.f0.y, e.f0.z)); // leuchtende Fugen
    for (let i = 0; i < 5; i++) { const f = bladeFrame(look, 0.1 + i * 0.18); const r = box(0.012, 0.1, 0.015, glow, (i % 2 ? 1 : -1) * (th / 2 + 0.003), f.y, f.z - 0.02); r.rotation.x = 0.7; bladeG.add(r); } // Glutrisse
    for (let i = 0; i < 6; i++) { const f = bladeFrame(look, 0.1 + i * 0.15); bladeG.add(cone(0.035, 0.12, 3, slag, 0, f.y + 0.02, f.z + look.w * 0.65, 0.8, 0)); }
    guard.scale.set(1.3, 0.9, 1.3);
    const n = 10; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const c = cone(0.03, 0.12, 3, tooth, Math.cos(a) * 0.15, -0.15, Math.sin(a) * 0.15); c.rotation.set(Math.sin(a) * Math.PI / 2, 0, -Math.cos(a) * Math.PI / 2); hilt.add(c); } // Zahnkranz
    for (let i = 0; i < 4; i++) hilt.add(box(0.092, 0.02, 0.092, glow, 0, -0.02 + i * 0.11, 0));
    hilt.add(cone(0.06, 0.18, 4, glow, 0, 0.5, 0));
    addHalo('#ff5a10', 0.2);
    ex.push(glow, hot);
  } else { // Stufe 5v/6: Kupferklinge, Spulen, Antennen, Funken (6 = Funkenfuerst: groesser, helle Klinge, mehr Spulen)
    const apex = tier >= 6;
    const cop = L(apex ? '#ffd8a0' : '#d8782c'), spark = em(apex ? '#aef0ff' : '#7ae0ff'), hot = em('#fff0a0');
    hamon(apex ? '#7af0ff' : '#5ad8ff', apex ? 0.034 : 0.02);
    const nC = apex ? 13 : 8, coil = [cop, apex ? spark : L('#8a4a20')];
    for (let i = 0; i < nC; i++) hilt.add(box(0.112, 0.024, 0.112, coil[i % 2], 0, -0.1 + i * (apex ? 0.04 : 0.055), 0)); // Spulen-Wicklung am Griff
    guard.scale.set(apex ? 1.8 : 1.2, 0.8, 1.0);
    for (const sx of [-1, 1]) for (let j = 0; j < (apex ? 3 : 2); j++) { // Antennen-Zinken am Parier
      const h = (0.26 + j * 0.06) * big, a = sx * (0.5 + j * 0.3), px = sx * (0.14 + j * 0.05);
      const pr = box(0.02, h, 0.02, cop, px + Math.sin(a) * h * 0.5, -0.12 + Math.cos(a) * h * 0.5, 0); pr.rotation.z = -a;
      hilt.add(pr, box(0.034, 0.034, 0.034, j ? hot : spark, px + Math.sin(a) * h, -0.12 + Math.cos(a) * h, 0));
    }
    for (let i = 0; i < (apex ? 4 : 2); i++) { const f = bladeFrame(look, 0.05 + i * (apex ? 0.045 : 0.05)); bladeG.add(box(th + 0.04, 0.026, look.w + 0.04, apex && i % 2 ? spark : cop, 0, f.y, f.z)); } // Spule um die Klingenwurzel
    for (let i = 0; i < 4; i++) { const f = bladeFrame(look, 0.25 + i * 0.2); bladeG.add(cone(0.02, 0.1 * big, 4, spark, (i % 2 ? 1 : -1) * 0.05, f.y, f.z + look.w * 0.5, 0, (i % 2 ? -1 : 1) * 0.9)); } // Funken
    hilt.add(box(0.06, 0.08, 0.06, cop, 0, 0.42, 0), cone(0.03, 0.26 * big, 4, spark, 0, 0.6 * big, 0));
    if (apex) for (const [x, y, z] of [[0.14, 0.15, 0.1], [-0.16, 0.35, -0.08], [0.1, 0.6, 0.08], [-0.12, 0.85, 0.02]]) hilt.add(box(0.04, 0.04, 0.04, hot, x, y, z));
    addHalo(apex ? '#7af0ff' : '#5ad8ff', 0.2 * big);
    ex.push(spark, hot);
  }
  ex.push(...ex2);

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
  root.userData.twoHand = { lo: 0.16, hi: 0.3 }; // [G] rig two-hand solver: off hand slides along the hilt

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

// ---------- Waffen-Glitch: Desync-Schnitte (GDD 16.2)
export const RESYNC_MUL = 1.5;
const _lv = new THREE.Vector3();
/** Waehrend der Desync-Schnitte macht ein Treffer ~keinen Sofortschaden (dmgMul ~0 -> 1 Schaden), der echte Wert wandert in den Riss. */
const desyncOn = (p) => !!(p?.glitching && p._ds);

/** Alle Risse gleichzeitig ausloesen: je (Brocken, Teil) EIN Sammeltreffer ueber den normalen Treffer-Pfad (Netz/Gaeste), keine Energie. */
export function resync(p) {
  const ds = p._ds, ctx = p.ctx;
  if (!ds || !ds.cracks.length) return 0;
  const groups = new Map();
  for (const c of ds.cracks) {
    const k = c.monster.id + '|' + c.partId;
    let g = groups.get(k);
    if (!g) groups.set(k, g = { monster: c.monster, partId: c.partId, raw: 0, pos: c.pos });
    g.raw += c.dmg;
  }
  ds.cracks = [];
  ds.pool?.burst();
  let total = 0;
  for (const g of groups.values()) {
    if (!g.monster.alive) continue;
    let left = Math.max(1, Math.round(g.raw * RESYNC_MUL));
    while (left > 0) { // Netz: ein Treffer max. 5000 (protocol.MAX_HIT_DMG)
      const dmg = Math.min(left, 4900); left -= dmg;
      const res = { dmg, elemDmg: 0, elemBy: {}, crit: false, weak: false, zone: 1, blunt: 0, stunEligible: false, wucht: 0, partId: g.partId, hitstop: HITSTOP.heavy, shake: SHAKE.heavy, attackerId: p.id };
      if (ctx.glitchSys) ctx.glitchSys.hitting = p;
      applyMonsterHit(g.monster, res, ctx);
      if (ctx.glitchSys) ctx.glitchSys.hitting = null;
      total += dmg;
      if (ctx.stats) { ctx.stats.damage = (ctx.stats.damage ?? 0) + dmg; ctx.stats.glitchDmg = (ctx.stats.glitchDmg ?? 0) + dmg; }
      ctx.fx?.number?.({ x: g.pos.x, y: g.pos.y + 0.8, z: g.pos.z }, dmg, 'gbig');
    }
    ctx.fx?.spark?.(g.pos, 30, '#ff2a3a', 8);
  }
  if (total > 0) {
    p.hitstop = Math.max(p.hitstop ?? 0, HITSTOP.heavy); // Hitstop 120 ms
    ctx.fx?.shake?.(0.5, 0.3); ctx.fx?.flash?.('rgba(255,30,50,.35)', 0.25); ctx.fx?.glitchTear?.(0.3);
    ctx.bus?.emit?.('sfx', { name: 'heavy', pos: p.pos });
  }
  return total;
}

const glitch = {
  name: 'Desync-Schnitte',
  onStart(p) {
    const ctx = p.ctx;
    const ds = p._ds = { cracks: [], pool: null, counters: null };
    if (ctx?.scene) {
      ds.pool = p._dsPool ??= createCrackPool(MAX_CRACKS);
      if (typeof document !== 'undefined') ds.counters = p._dsCounters ??= createCounters(3);
      if (ds.counters) for (const c of ds.counters.list) ctx.scene.add(c.sp);
    }
  },
  onEnd(p) {
    resync(p); // Modus-Ende loest alle Risse aus
    const ds = p._ds;
    if (ds) { ds.pool?.clear(); ds.counters?.list.forEach((c) => { c.sp.visible = false; c.sp.removeFromParent(); }); }
    p._ds = null;
  },
  tick(p, dt) {
    const ds = p._ds;
    if (!ds) return;
    if (p.ctx?.input?.b?.special?.pressed && ds.cracks.length) resync(p); // "RESYNC": Spezial-Taste
    if (ds.pool) ds.pool.update(p.time ?? 0, dt);
    if (ds.counters) { // Zaehler ueber dem Brocken
      const seen = new Map();
      for (const c of ds.cracks) seen.set(c.monster, (seen.get(c.monster) ?? 0) + 1);
      let slot = 0;
      for (const [m, n] of seen) {
        if (slot >= 3) break;
        let top = m.pos.y + 2;
        for (const hp of m.hurtParts?.() ?? []) top = Math.max(top, hp.sphere.y + hp.sphere.r);
        ds.counters.set(slot++, { x: m.pos.x, y: top + 0.8, z: m.pos.z }, 'x' + n + ' RESYNC');
      }
      ds.counters.hideFrom(slot);
    }
  },
  onHit(p, res, monster) {
    const ds = p._ds;
    if (!ds || !monster) return;
    const w = p.weapon, ctx = p.ctx;
    const mv = w?.activeHits?.()[0]?.hit.mv ?? 60;
    const dmg = (p.stats?.power ?? 10) * (mv / 100) * (res.zone ?? 1) * (res.crit ? CRIT_MUL : 1)
      * (1 + SCHLIFF_DMG * schliffLevel(w)) * (p.dmgMul ?? 1) * (ctx?.mods?.player?.dmgMul ?? 1) * (p.glitchDmgMul ?? 1) + (res.elemDmg ?? 0);
    const hp = monster.hurtParts?.().find((e) => e.part.id === res.partId);
    const pos = hp ? { x: hp.pos.x, y: hp.pos.y, z: hp.pos.z } : { x: monster.pos.x, y: monster.pos.y + 1, z: monster.pos.z };
    if (ds.cracks.length >= MAX_CRACKS) { ds.cracks[ds.cracks.length - 1].dmg += dmg; return; } // Cap: Schaden bleibt erhalten, kein neuer Riss
    const node = hp?.part.sph?.[0]?.node;
    let local = pos;
    if (node?.worldToLocal) local = node.worldToLocal(_lv.set(pos.x, pos.y, pos.z));
    const crack = ds.pool?.spawn(node, local, 0.8 + Math.min(0.8, dmg / 150)) ?? null;
    ds.cracks.push({ monster, partId: res.partId, dmg, pos, crack });
  },
};

export const katana = {
  id: 'kt',
  glitch,
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
  dmgMul: (w) => (desyncOn(w.hooks.player) ? 1e-4 : 1 + SCHLIFF_DMG * schliffLevel(w)), // Desync: kein Sofortschaden
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
    const emb = t4 ? 0.12 + (d.tier >= 6 ? 0.14 : 0) + 0.06 * Math.sin(d.t * 9) : 0; // Funkenfuerst (6) staerker
    const ec = d.look.emb ?? [1, 0.35, 0.05]; // Glutfarbe je Brocken (Voltaro blau, Kroll keiner)
    d.bladeMat.emissive.setRGB(Math.min(1, e[0] + emb * ec[0]), Math.min(1, e[1] + emb * ec[1]), Math.min(1, e[2] + emb * ec[2]));
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
