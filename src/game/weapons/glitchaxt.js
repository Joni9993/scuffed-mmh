import { compileTrack, REST } from '../anim.js';
import { buildGlitchaxtLook, updateGlitchaxtLook } from '../gear/glitchaxtLook.js';
import { settings, saveSettings } from '../../core/settings.js';

// Glitchaxt (GDD 17.2, `ga`): Waffe aus zehn losen Datenbloecken in zwei Modi.
//  AXT (Start)  Katana-Tempo. A-Kette Hieb -> Aufwaertshieb -> Rundumschlag, A halten = Wilde Schwuenge (Puste), Treffer bauen DRUCK auf.
//               B = Schaltschlag ins Schwert (braucht >= 25 % Druck, sonst "hustet" die Waffe).
//  SCHWERT      Plattmacher-Tempo, hoher Schaden. A-Kette Schnitt -> Doppelschnitt -> Hochschnitt, jeder Treffer -8 Druck, -3 Druck/s.
//               B = Schaltschlag zurueck, B halten = Entladung (Mehrfachtreffer, verbraucht allen Druck, endet in der Axt).
//  KIPP-REGEL   Schwert <= 15 % Druck: Wackeln + Ticken. Druck 0 = BLITZ (0,4 s): B = "Sauber!" (Bonus-Schlag, +25 % Druck, Axt).
//               Verpasst = "Fehlzuendung" (rot): 0,5 s Stolpern ohne Roll-Abbruch, Axt, Druck 0.
//  Finisher "Kernschmelze" (B halten 0,3 s bei Wucht 100), Glitch "Zustandsfehler" (jeder Treffer trifft doppelt, Druck sinkt nicht).

export const DRUCK_MAX = 100;
export const SCHALT_MIN = 25;        // Axt -> Schwert braucht mindestens so viel Druck (sonst hustet die Waffe)
export const WARN_DRUCK = 15;        // Schwert: ab hier Wackeln + Ticken
export const BLITZ_WINDOW = 0.4;     // s: B im Blitz = Sauber!
export const BLITZ_GRACE = 0.08;     // s: ein B kurz VOR dem Blitz zaehlt noch (Eingabepuffer)
export const STOLPER = 0.5;          // s: Fehlzuendung
export const SAUBER_DRUCK = 25;      // Sauber! schenkt so viel Druck
export const SCHWERT_DECAY = 3;      // Druck/s im Schwert
export const SCHWERT_HIT = -8;       // Druck je Treffer im Schwert
export const WILD_COST = 12;         // Puste/s bei Wilden Schwuengen
export const FIN_DRUCK = 50;         // Druck nach der Kernschmelze
export const ZF_MUL = 0.4;           // Zustandsfehler: zweiter Treffer (GDD-Start 0,6, fuer den Glitch-Anteil getunt)
export const GLITCH_GAIN = 0.75;     // Glitch-Energie je Schaden x0,75 (staerkster Waffen-Glitch laedt langsamer)
export const ZF_END_DRUCK = 20;      // Zustandsfehler-Ende: Schwert nie mit leerem Druck zurueck (kein Blitz aus dem Nichts)
export const ENTLAD_MIN = 2;
export const ENTLAD_MAX = 6;

const SH = [-0.2, 1.4, 0.12]; // Waffen-Drehpunkt (zweihaendig vor der Brust; player-local, x+ = links, z+ = vorn)
const r2 = (n) => Math.round(n * 1000) / 1000;
const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Ein Schlag = einige Kapseln entlang des Waffenkopfes, in der Zeit gestaffelt, eine Gruppe -> hoechstens ein Treffer je Ziel. */
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
const ball = (t0, t1, radius, extra) => ({ t0, t1, shape: 'sphere', at: [0, 1.0, 1.1], radius, ...extra });

// ---- Zustand (w.data): mode 'axt'|'schwert', druck 0..100, blitzT (s uebrig, > 0 = Blitz offen), entlad, fehl
export function st(w) {
  const d = w.data;
  d.mode ??= 'axt';
  d.druck ??= 0;
  d.blitzT ??= 0;
  d.tickT ??= 0;
  d.tickPh ??= 0;
  d.fehl ??= 0;
  return d;
}
export const gaMode = (w) => st(w).mode;
export const gaDruck = (w) => st(w).druck;
export const blitzOpen = (w) => st(w).blitzT > 0;
const glitching = (w) => !!w.hooks.player?.glitching;
const isEntlad = (id) => !!id && id.startsWith('ga_entlad');
/** In diesen Moves ruht die Kipp-Regel (Druck sinkt nicht, kein Blitz). */
const KIPP_FREI = new Set(['ga_finisher', 'ga_fehl', 'ga_sauber', 'ga_schalt_s', 'ga_schalt_a']);
const kippFrei = (w) => KIPP_FREI.has(w.moveId) || isEntlad(w.moveId) || st(w).entlad || glitching(w);

// ---- Feedback (Ton + Schwebeschrift). Im Test ohne Spieler: stumm.
const emit = (w, name, o = {}) => { const p = w.hooks.player; p?.ctx?.bus?.emit?.('sfx', { name, pos: p.pos, ...o }); };
const say = (w, text, kind, dy = 2.3) => { const p = w.hooks.player; p?.ctx?.fx?.number?.({ x: p.pos.x, y: p.pos.y + dy, z: p.pos.z }, text, kind); };
const puff = (w, color, n = 8, speed = 3) => { const p = w.hooks.player; if (p?.ctx?.fx?.spark) p.ctx.fx.spark({ x: p.pos.x + Math.sin(p.rot) * 1.1, y: p.pos.y + 1.2, z: p.pos.z + Math.cos(p.rot) * 1.1 }, n, color, speed); };

export function addDruck(w, n) {
  const d = st(w);
  d.druck = clamp(d.druck + n, 0, DRUCK_MAX);
  return d.druck;
}

// ---- Kipp-Regel
function openBlitz(w) {
  const d = st(w);
  if (d.mode !== 'schwert' || d.druck > 0 || d.blitzT > 0 || kippFrei(w)) return false;
  d.blitzT = BLITZ_WINDOW;
  d.blitzN = (d.blitzN | 0) + 1;
  emit(w, 'gaPling');
  w.hooks.player?.ctx?.fx?.flash?.('rgba(255,255,255,.28)', 0.18);
  return true;
}
/** B (Tipp oder gerade gedrueckt) seit dem Blitz? Verbraucht den Eingabepuffer-Eintrag. */
function blitzPress(w) {
  const d = st(w);
  const since = BLITZ_WINDOW - d.blitzT + BLITZ_GRACE;
  for (let i = 0; i < w.events.length; i++) {
    const e = w.events[i];
    if (e.type === 'B' && e.age <= since) { w.events.splice(i, 1); return true; }
  }
  const p = w.pend.B;
  if (p && p.t <= since) { p.fired = true; return true; } // Taste unten gehalten: kein spaeteres holdB (Entladung/Finisher)
  return false;
}
function misfire(w) {
  const d = st(w);
  d.blitzT = 0;
  d.fehl++;
  const n = (settings.gaFehl | 0) + 1;
  settings.gaFehl = Math.min(9, n);
  saveSettings();
  w.startMove('ga_fehl');
  say(w, 'Fehlzündung', 'hurt');
  if (n <= 2) say(w, 'B beim Aufblitzen!', 'weak', 1.9); // Lern-Hinweis (Onboarding-Zeile gibt es zusaetzlich im Waffen-Tipp)
  return n;
}

// ---- Wahl der Moves
const hasDruck = (w) => st(w).druck >= SCHALT_MIN || glitching(w);
const swB = (w) => (st(w).mode === 'schwert' ? 'ga_schalt_a' : hasDruck(w) ? 'ga_schalt_s' : 'ga_husten');
/** Entladung: 2..6 Pulse je nach Druck */
export const entladCount = (druck) => clamp(Math.ceil((druck / DRUCK_MAX) * ENTLAD_MAX - 1e-9), ENTLAD_MIN, ENTLAD_MAX);
const holdBfn = (w) => (st(w).mode === 'schwert' ? 'ga_entlad' + entladCount(st(w).druck) : swB(w));
const aStart = (w) => (st(w).mode === 'schwert' ? 'ga_s1' : 'ga_a1');
const START = { A: aStart, holdA: (w) => (st(w).mode === 'schwert' ? 'ga_s1' : 'ga_wild1'), B: swB, holdB: holdBfn };
const idleA = (w) => {
  const p = w.hooks.player;
  const roll = p && p.sinceRoll < 0.3;
  if (st(w).mode === 'schwert') return roll ? 'ga_stich' : 'ga_s1';
  return roll ? 'ga_jump' : 'ga_a1';
};
const chain = (nextA, extra = {}) => ({ ...START, A: nextA, ...extra });

// ---- Moves. Druck-Delta je Treffer steht im Hit (`druck`), Wucht +3 je Treffer.
const AX = { moveSpeed: 0.35, turnSpeed: 0.5 };   // Axt: Katana-Tempo
const SW = { moveSpeed: 0.05, turnSpeed: 0.45 };  // Schwert: Plattmacher-Tempo
const moves = {
  // ---- Axt
  ga_a1: { // Hieb
    id: 'ga_a1', anim: 'ga_a1', duration: 0.68,
    hits: cut({ t0: 0.2, t1: 0.3, a0: 170, a1: 58, mv: 32, wucht: 3, druck: 8, hitstop: 'light', group: 'a1' }),
    combo: { window: [0.48, 0.62], next: chain('ga_a2', { holdA: 'ga_wild1' }) }, rollCancelAt: 0.49, ...AX,
  },
  ga_a2: { // Aufwaertshieb
    id: 'ga_a2', anim: 'ga_a2', duration: 0.66,
    hits: cut({ t0: 0.2, t1: 0.3, a0: 25, a1: 175, mv: 30, wucht: 3, druck: 8, hitstop: 'light', group: 'a2' }),
    combo: { window: [0.5, 0.66], next: chain('ga_a3', { holdA: 'ga_wild1' }) }, rollCancelAt: 0.51, ...AX,
  },
  ga_a3: { // Rundumschlag (breit)
    id: 'ga_a3', anim: 'ga_a3', duration: 0.95,
    hits: cut({ kind: 'horz', t0: 0.3, t1: 0.45, n: 6, p0: -115, p1: 115, mv: 40, wucht: 4, druck: 12, hitstop: 'medium', radius: 0.7, group: 'a3' }),
    combo: { window: [0.74, 0.94], next: chain('ga_a1', { holdA: 'ga_wild1' }) }, rollCancelAt: 0.76, moveSpeed: 0.3, turnSpeed: 0.4,
  },
  ga_wild1: { // Wilde Schwuenge (A halten): wiederholt, rueckt vor, kostet Puste
    id: 'ga_wild1', anim: 'ga_wild1', duration: 0.4,
    hits: cut({ t0: 0.1, t1: 0.18, n: 3, a0: 165, a1: 60, mv: 22, wucht: 2, druck: 6, hitstop: 'light', group: 'w' }),
    lunge: { t0: 0.06, t1: 0.2, dist: 0.9 },
    combo: { window: [0.22, 0.38], next: chain('ga_a1', { holdA: 'ga_wild2' }) }, rollCancelAt: 0.26, moveSpeed: 0.2, turnSpeed: 0.5,
  },
  ga_wild2: {
    id: 'ga_wild2', anim: 'ga_wild2', duration: 0.4,
    hits: cut({ kind: 'horz', t0: 0.1, t1: 0.18, n: 4, p0: 75, p1: -75, mv: 22, wucht: 2, druck: 6, hitstop: 'light', group: 'w' }),
    lunge: { t0: 0.06, t1: 0.2, dist: 0.9 },
    combo: { window: [0.22, 0.38], next: chain('ga_a1', { holdA: 'ga_wild1' }) }, rollCancelAt: 0.26, moveSpeed: 0.2, turnSpeed: 0.5,
  },
  ga_husten: { // zu wenig Druck: Pixel-Puff + Klack, keine Strafe
    id: 'ga_husten', anim: 'ga_husten', duration: 0.35,
    fire: [{ t: 0.05, call: 'husten' }],
    combo: { window: [0.2, 0.33], next: START }, rollCancelAt: 0.1, moveSpeed: 0.5, turnSpeed: 0.6,
  },
  ga_schalt_s: { // Schaltschlag ins Schwert (trifft beim Morph)
    id: 'ga_schalt_s', anim: 'ga_schalt_s', duration: 0.6,
    hits: cut({ t0: 0.14, t1: 0.24, a0: 165, a1: 70, mv: 34, wucht: 3, druck: 0, hitstop: 'medium', group: 'ss' }),
    fire: [{ t: 0.12, call: 'toSchwert' }],
    combo: { window: [0.3, 0.55], next: START }, rollCancelAt: 0.35, moveSpeed: 0.2, turnSpeed: 0.5,
  },
  ga_jump: { // Rolle -> A (Axt): Sprungspalter
    id: 'ga_jump', anim: 'ga_jump', duration: 0.7,
    hits: cut({ t0: 0.24, t1: 0.34, a0: 170, a1: 45, mv: 38, wucht: 4, druck: 8, hitstop: 'medium', group: 'j' }),
    lunge: { t0: 0.05, t1: 0.28, dist: 2.5 }, arc: { t0: 0.05, t1: 0.34, h: 1.0 },
    combo: { window: [0.4, 0.65], next: chain('ga_a2', { holdA: 'ga_wild1' }) }, rollCancelAt: 0.45, moveSpeed: 0, turnSpeed: 0.3,
  },
  // ---- Schwert
  ga_s1: { // Schnitt
    id: 'ga_s1', anim: 'ga_s1', duration: 0.65,
    hits: cut({ t0: 0.26, t1: 0.36, n: 5, a0: 205, a1: 60, mv: 34, wucht: 3, druck: SCHWERT_HIT, hitstop: 'medium', from: 0.6, to: 2.3, radius: 0.55, group: 's1' }),
    combo: { window: [0.37, 0.6], next: chain('ga_s2', { holdA: 'ga_s2' }) }, rollCancelAt: 0.45, ...SW,
  },
  ga_s2: { // Doppelschnitt: 2 x BW 22
    id: 'ga_s2', anim: 'ga_s2', duration: 0.75,
    hits: [
      ...cut({ t0: 0.14, t1: 0.22, a0: 180, a1: 50, tilt: 25, mv: 22, wucht: 2, druck: SCHWERT_HIT, hitstop: 'light', from: 0.6, to: 2.3, radius: 0.55, group: 's2a' }),
      ...cut({ t0: 0.3, t1: 0.38, a0: 180, a1: 48, tilt: -25, mv: 22, wucht: 2, druck: SCHWERT_HIT, hitstop: 'medium', from: 0.6, to: 2.3, radius: 0.55, group: 's2b' }),
    ],
    combo: { window: [0.41, 0.7], next: chain('ga_s3', { holdA: 'ga_s3' }) }, rollCancelAt: 0.48, ...SW,
  },
  ga_s3: { // Hochschnitt
    id: 'ga_s3', anim: 'ga_s3', duration: 0.8,
    hits: cut({ t0: 0.26, t1: 0.36, n: 5, a0: -30, a1: 175, mv: 44, wucht: 5, druck: SCHWERT_HIT, hitstop: 'heavy', from: 0.6, to: 2.3, radius: 0.55, group: 's3' }),
    combo: { window: [0.41, 0.78], next: chain('ga_s1', { holdA: 'ga_s1' }) }, rollCancelAt: 0.5, ...SW,
  },
  ga_schalt_a: { // Schaltschlag zurueck in die Axt (immer erlaubt, kein Bonus, keine Strafe)
    id: 'ga_schalt_a', anim: 'ga_schalt_a', duration: 0.5,
    hits: cut({ t0: 0.12, t1: 0.2, a0: 165, a1: 62, mv: 30, wucht: 3, druck: 0, hitstop: 'light', group: 'sa' }),
    fire: [{ t: 0.1, call: 'toAxt' }],
    combo: { window: [0.26, 0.46], next: START }, rollCancelAt: 0.3, moveSpeed: 0.3, turnSpeed: 0.5,
  },
  ga_stich: { // Rolle -> A (Schwert): Ausfallstich
    id: 'ga_stich', anim: 'ga_stich', duration: 0.62,
    hits: [{ t0: 0.1, t1: 0.22, shape: 'capsule', radius: 0.45, from: [SH[0], 1.3, 0.5], to: [SH[0], 1.3, 2.4], mv: 30, wucht: 3, druck: SCHWERT_HIT, hitstop: 'medium', group: 'st' }],
    lunge: { t0: 0.02, t1: 0.2, dist: 3.0 },
    combo: { window: [0.32, 0.56], next: chain('ga_s2', { holdA: 'ga_s2' }) }, rollCancelAt: 0.38, moveSpeed: 0, turnSpeed: 0.3,
  },
  // ---- Kipp-Regel
  ga_sauber: { // B im Blitz: Bonus-Schlag BW 50, +25 % Druck, Axt
    id: 'ga_sauber', anim: 'ga_sauber', duration: 0.6,
    hits: cut({ t0: 0.09, t1: 0.2, n: 5, a0: 170, a1: 50, mv: 50, wucht: 10, druck: 0, hitstop: 'heavy', sauberMul: 1, sauberText: 'Sauber!', from: 0.5, to: 2.2, radius: 0.6, group: 'sb' }),
    fire: [{ t: 0, call: 'sauberStart' }],
    lunge: { t0: 0.04, t1: 0.2, dist: 1.4 },
    combo: { window: [0.32, 0.55], next: START }, rollCancelAt: 0.34, moveSpeed: 0.2, turnSpeed: 0.5,
  },
  ga_fehl: { // verpasst: Fehlzuendung, 0,5 s Stolpern, KEIN Roll-Abbruch
    id: 'ga_fehl', anim: 'ga_fehl', duration: STOLPER,
    fire: [{ t: 0, call: 'fehlStart' }],
    rollCancelAt: STOLPER, moveSpeed: 0.15, turnSpeed: 0.2,
  },
  // ---- Finisher "Kernschmelze" (B halten 0,3 s bei Wucht 100, beide Modi)
  ga_finisher: {
    id: 'ga_finisher', anim: 'ga_finisher', duration: 1.7, consumeWucht: true,
    hits: [ball(0.72, 0.86, 3.0, { mv: 210, blunt: 0, wucht: 0, druck: 0, hitstop: 'heavy', group: 'f', shake: 0.6 })],
    fire: [{ t: 0.72, call: 'kernEnde' }],
    superArmor: 'all', rollCancelAt: 1.3, moveSpeed: 0, turnSpeed: 0.3,
  },
};

// Entladung (Schwert, B halten): n Pulse + Abschluss. Mehr Druck = mehr Pulse (2..6).
for (let n = ENTLAD_MIN; n <= ENTLAD_MAX; n++) {
  const t0 = 0.4, dt = 0.11, tf = t0 + n * dt + 0.08, dur = tf + 0.5;
  const hits = [];
  for (let i = 0; i < n; i++) hits.push(ball(r2(t0 + i * dt), r2(t0 + i * dt + 0.08), 2.3, { mv: 14, wucht: 1, druck: 0, hitstop: 'light', group: 'e' + i, shake: 0.12 }));
  hits.push(ball(r2(tf), r2(tf + 0.12), 2.8, { mv: 40, wucht: 3, druck: 0, hitstop: 'heavy', group: 'ef', shake: 0.4 }));
  moves['ga_entlad' + n] = {
    id: 'ga_entlad' + n, anim: 'ga_entlad', duration: r2(dur), hits, n,
    fire: [{ t: 0, call: 'entladStart' }, { t: r2(tf + 0.02), call: 'entladEnde' }],
    rollCancelAt: r2(tf + 0.15), moveSpeed: 0, turnSpeed: 0.3,
  };
}

// ---- Animation (siehe anim.js). Waffenneigung = arx + sw.
const P = (arx, bl, extra = {}) => ({ arx, sw: bl - arx, ...extra });
export const GA_REST = { ...P(64, 148), arz: -10, alz: 9, tx: 8, ty: 0, py: -0.07, lrx: 14, rrx: -14, hx: 0 };
const BASE = { ...REST, ...GA_REST };
const A = (frames) => compileTrack(frames, BASE);
const shake = (t0, n, step, amp, key = 'tz') => Array.from({ length: n }, (_, i) => [r2(t0 + i * step), { [key]: i % 2 ? -amp : amp }]);
const anims = {
  ga_a1: A([[0, {}], [0.14, { ...P(135, 172), tx: -10, py: 0, arz: -14 }], [0.2, P(135, 172), 'lin'], [0.3, { ...P(52, 58), tx: 30, py: -0.12, arz: -24 }, 'lin'], [0.46, P(52, 58)], [0.62, {}]]),
  ga_a2: A([[0, {}], [0.1, { ...P(40, 30), tx: 20, py: -0.12, arz: -10 }], [0.2, P(40, 30), 'lin'], [0.3, { ...P(150, 175), tx: -8, py: 0.04 }, 'lin'], [0.5, P(150, 175)], [0.66, {}]]),
  ga_a3: A([[0, {}], [0.24, { ty: -112, ...P(88, 92), tx: 6, py: -0.1, arz: -24 }], [0.3, { ty: -112 }, 'lin'], [0.45, { ty: 118, tx: 12 }, 'lin'], [0.62, { ty: 112 }], [0.95, { ...GA_REST, ty: 0 }]]),
  ga_wild1: A([[0, {}], [0.07, { ...P(130, 165), tx: -6, py: 0, arz: -14 }], [0.1, P(130, 165), 'lin'], [0.18, { ...P(54, 60), tx: 28, py: -0.1, arz: -22 }, 'lin'], [0.3, P(54, 60)], [0.4, {}]]),
  ga_wild2: A([[0, {}], [0.07, { ty: 78, ...P(86, 92), tx: 6, py: -0.1, arz: -28 }], [0.1, { ty: 78 }, 'lin'], [0.18, { ty: -78, tx: 14 }, 'lin'], [0.3, { ty: -70 }], [0.4, { ...GA_REST, ty: 0 }]]),
  ga_husten: A([[0, {}], [0.06, { tx: -6, hx: -10, py: 0.02, ...P(76, 164) }], [0.13, { tx: 14, hx: 12, py: -0.1 }], [0.35, {}]]),
  ga_schalt_s: A([[0, {}], [0.1, { ...P(125, 172), tx: -8, py: 0, arz: -14 }], [0.14, P(125, 172), 'lin'], [0.24, { ...P(60, 70), tx: 28, py: -0.12 }, 'lin'], [0.4, P(60, 70)], [0.6, {}]]),
  ga_schalt_a: A([[0, {}], [0.08, { ...P(125, 172), tx: -8, py: 0 }], [0.11, P(125, 172), 'lin'], [0.2, { ...P(58, 62), tx: 26, py: -0.1 }, 'lin'], [0.32, P(58, 62)], [0.5, {}]]),
  ga_jump: A([
    [0, {}], [0.05, { py: -0.2, tx: 20, ...P(140, 175) }], [0.2, { py: 0.3, tx: -8, lrx: 25, rrx: -20, ...P(160, 178) }], [0.24, P(160, 178), 'lin'],
    [0.34, { py: -0.08, tx: 32, ...P(54, 58), lrx: 10, rrx: -8 }, 'lin'], [0.5, P(54, 58)], [0.7, { ...GA_REST, py: 0 }],
  ]),
  ga_s1: A([
    [0, {}], [0.1, { arx: 150, sw: 55, tx: -6, py: -0.04 }], [0.22, { arx: 172, sw: 38, tx: -10, py: 0.02, lrx: 12, rrx: -10 }], [0.26, { arx: 172, sw: 33 }, 'lin'],
    [0.36, { arx: 62, sw: -2, tx: 30, py: -0.1 }, 'lin'], [0.5, { arx: 62, sw: -2, tx: 30 }], [0.65, { ...GA_REST, lrx: 0, rrx: 0, py: -0.07 }],
  ]),
  ga_s2: A([
    [0, {}], [0.07, { ...P(140, 180), ty: 20, tx: -6, py: 0, arz: -14 }], [0.14, { ...P(140, 180), ty: 20 }, 'lin'], [0.22, { ...P(50, 50), ty: -30, tx: 28, py: -0.12, arz: -26 }, 'lin'],
    [0.25, { ...P(130, 178), ty: -18, tx: -4, py: 0 }], [0.3, { ...P(130, 178), ty: -18 }, 'lin'], [0.38, { ...P(48, 48), ty: 32, tx: 30, py: -0.14 }, 'lin'], [0.55, P(48, 48)], [0.75, { ...GA_REST, ty: 0 }],
  ]),
  ga_s3: A([
    [0, {}], [0.18, { py: -0.28, tx: 22, arx: -35, sw: 0, lrx: 20, rrx: -15 }], [0.26, { arx: -35, sw: 0 }, 'lin'], [0.36, { arx: 150, sw: 25, tx: -14, py: 0.04 }, 'lin'],
    [0.55, { arx: 150, sw: 25 }], [0.8, { ...GA_REST, lrx: 0, rrx: 0, py: -0.07 }],
  ]),
  ga_stich: A([
    [0, {}], [0.07, { arx: 62, sw: 28, tx: 8, ty: 28, py: -0.12 }], [0.1, { ty: 28 }, 'lin'], [0.22, { arx: 88, sw: 4, tx: 24, ty: -12, py: -0.16 }, 'lin'], [0.36, { arx: 88, sw: 4, ty: -12 }], [0.62, { ...GA_REST, ty: 0 }],
  ]),
  ga_entlad: A([ // Klinge rein, in den Boden rammen, Pulse (Zittern), Abschluss
    [0, {}], [0.18, { py: -0.18, tx: 14, ...P(112, 70), alx: 70 }], [0.38, { py: -0.34, tx: 34, ...P(46, 38), lrx: 18, rrx: -14 }, 'lin'],
    ...shake(0.42, 14, 0.07, 3), [1.45, { tz: 0, py: -0.3, tx: 32 }], [1.7, { ...GA_REST, py: -0.07, tz: 0 }],
  ]),
  ga_sauber: A([[0, {}], [0.06, { ...P(138, 176), tx: -10, py: 0.02 }], [0.09, P(138, 176), 'lin'], [0.2, { ...P(48, 52), tx: 34, py: -0.14 }, 'lin'], [0.4, P(48, 52)], [0.6, {}]]),
  ga_fehl: A([ // stolpern
    [0, {}], [0.08, { tx: 36, hx: 26, py: -0.14, arx: 28, sw: 100, alx: 24, lrx: 24, rrx: -20, tz: 6 }], [0.22, { tx: 24, tz: -6, lrx: -14, rrx: 18, hx: 12 }], [0.36, { tx: 14, tz: 2, py: -0.1 }], [0.5, {}],
  ]),
  ga_finisher: A([ // Ueberladen (Waffe hoch, Zittern), Explosion mit Rammstoss
    [0, {}], [0.2, { py: -0.3, tx: 18, ...P(158, 176), alx: 120, lrx: 22, rrx: -16 }], ...shake(0.24, 8, 0.06, 4), [0.7, { tz: 0, py: 0.1, tx: -12, ...P(172, 178) }],
    [0.78, { py: -0.14, tx: 40, ...P(60, 0), alx: 40, lrx: 20, rrx: -10 }, 'lin'], [1.1, { py: -0.14, tx: 40, ...P(60, 0) }], [1.7, { ...GA_REST, py: -0.07, tz: 0 }],
  ]),
};

// ---- Glitch "Zustandsfehler" (GDD 17.2): jeder Schlag trifft als Axt UND Schwert (zweiter Treffer 60 %), Druck sinkt nicht, Wechsel = Sauber!
function zfHit(p, res, monster) {
  if (p.glitch._zf || !monster?.alive || !p.ctx?.playerHit) return;
  const w = p.weapon;
  let src = null;
  const hits = w?.move?.hits;
  if (hits) for (let i = 0; i < hits.length; i++) { const h = hits[i]; if (w.t >= h.t0 && w.t <= h.t1 + 0.02) { src = h; break; } }
  if (!src && hits?.length) src = hits[hits.length - 1];
  if (!src) return;
  const hp = monster.hurtParts().find((h) => h.part.id === res.partId);
  if (!hp) return;
  p.glitch._zf = true; // dmgMul 0,6 + kein weiterer Zweittreffer
  try {
    p.ctx.playerHit(p, monster, hp, { hit: { ...src, wucht: 0, druck: 0, hitstop: 'none', shake: 0.05 }, group: 'zf', sauber: false, glitch: false });
  } finally { p.glitch._zf = false; }
  p.ctx.fx?.spark?.(hp.pos, 8, '#18e6ff', 6);
}

export const glitchaxt = {
  id: 'ga',
  name: 'Glitchaxt',
  tierMesh: true,
  glitchGainMul: GLITCH_GAIN,
  // B: Tipp = Schaltschlag, Halten (0,3 s) = Entladung (Schwert) / Kernschmelze bei Wucht 100
  holdThreshold: { A: 0.2, B: 0.3 },
  idle: { A: idleA, holdA: START.holdA, B: swB, holdB: holdBfn },
  moves,
  anims,
  rest: GA_REST,
  overrideEvent: (w, type) => (type === 'holdB' && w.wucht >= 100 ? 'ga_finisher' : undefined),
  on: {
    toSchwert(w) {
      const d = st(w);
      d.mode = 'schwert';
      if (glitching(w)) w.flags.sauber = true; // Zustandsfehler: jeder Wechsel = Sauber!
      emit(w, 'gaMorph');
    },
    toAxt(w) {
      const d = st(w);
      d.mode = 'axt';
      d.blitzT = 0;
      if (glitching(w)) w.flags.sauber = true;
      emit(w, 'gaMorph');
    },
    husten(w) {
      emit(w, 'gaHusten');
      puff(w, '#ff2bd6', 7, 2.5);
    },
    sauberStart(w) {
      const d = st(w);
      w.flags.sauber = true;
      d.mode = 'axt';
      d.blitzT = 0;
      d.sauberN = (d.sauberN | 0) + 1;
      addDruck(w, SAUBER_DRUCK);
      emit(w, 'gaMorph');
      puff(w, '#ffffff', 10, 4);
    },
    fehlStart(w) {
      const d = st(w);
      d.mode = 'axt';
      d.druck = 0;
      d.blitzT = 0;
      emit(w, 'gaKnall');
      puff(w, '#ff3a3a', 16, 6);
      const p = w.hooks.player;
      p?.ctx?.fx?.shake?.(0.3, 0.25);
      p?.ctx?.fx?.flash?.('rgba(255,40,40,.3)', 0.2);
    },
    entladStart(w) {
      const d = st(w);
      d.entlad = true;
      d.druck = 0;
      emit(w, 'gaMorph');
    },
    entladEnde(w) {
      const d = st(w);
      d.entlad = false;
      d.mode = 'axt';
      emit(w, 'gaMorph');
    },
    kernEnde(w) {
      const d = st(w);
      d.mode = 'axt';
      d.druck = FIN_DRUCK;
      d.blitzT = 0;
      emit(w, 'gaKnall', { big: true });
      w.hooks.player?.ctx?.fx?.flash?.('rgba(255,120,255,.35)', 0.25);
    },
  },
  /** KO/Respawn (WeaponState.reset): Axt, Druck 0, alle Kipp-Timer aus */
  onReset(w) {
    const d = w.data;
    d.mode = 'axt'; d.druck = 0; d.blitzT = 0; d.tickT = 0; d.tickPh = 0; d.ticking = false; d.entlad = false;
  },
  onUpdate(w, dt) {
    const d = st(w);
    const id = w.moveId;
    if (d.entlad && !isEntlad(id)) { d.entlad = false; d.mode = 'axt'; } // Entladung abgebrochen (Treffer/Tod): sauber in der Axt landen
    // Blitz: B = Sauber!, verpasst = Fehlzuendung
    if (d.blitzT > 0) {
      if (blitzPress(w)) { d.blitzT = 0; w.startMove('ga_sauber'); } else {
        d.blitzT -= dt;
        if (d.blitzT <= 0) { d.blitzT = 0; misfire(w); }
      }
    } else if (d.mode === 'schwert' && !kippFrei(w)) {
      // Schwert: -3 Druck/s; <= 15 % tickt, 0 = Blitz
      d.druck = Math.max(0, d.druck - SCHWERT_DECAY * dt);
      if (d.druck <= 0) openBlitz(w);
    }
    // Ticken (schneller werdend)
    const ticking = d.mode === 'schwert' && d.druck > 0 && d.druck <= WARN_DRUCK && !kippFrei(w);
    d.ticking = ticking;
    if (ticking) {
      d.tickT -= dt;
      if (d.tickT <= 0) {
        d.tickT = 0.1 + 0.3 * (d.druck / WARN_DRUCK);
        d.tickPh ^= 1;
        d.tickN = (d.tickN | 0) + 1;
        emit(w, 'gaTick', { f: 1 + (1 - d.druck / WARN_DRUCK) * 0.6 });
      }
    } else d.tickT = 0;
    // Wilde Schwuenge: solange A gehalten wird, wiederholen; kosten Puste
    if (id === 'ga_wild1' || id === 'ga_wild2') {
      w.hooks.drain?.(WILD_COST * dt);
      const down = w.pend.A?.fired;
      if (down && !w.hooks.exhausted?.() && !w.events.some((e) => e.type === 'holdA')) w.events.push({ type: 'holdA', age: 0, btn: 'A', heldT: w.pend.A.t });
    }
  },
  /** Treffer-Hook (player.afterHit): Druck-Delta aus dem Hit. Im Glitch sinkt der Druck nicht. */
  onHit(p, res, ah) {
    const w = p.weapon;
    if (ah?.group === 'zf') return;
    const dd = ah?.hit?.druck ?? 0;
    if (!dd) return;
    const d = st(w);
    if (dd < 0 && (glitching(w) || d.entlad)) return;
    addDruck(w, dd);
    if (dd < 0 && d.druck <= 0) openBlitz(w);
  },
  /** Netz: Modus + Druck (5-%-Stufen) + Blitz im Pose-Level (Remote-Avatare haben sonst nur den Anim-Namen) */
  poseLevel(w) {
    const d = st(w);
    return Math.round(d.druck / 5) + (d.mode === 'schwert' ? 32 : 0) + (d.blitzT > 0 ? 64 : 0);
  },
  /** Zustandsfehler: zweiter Treffer 60 % */
  dmgMul: (w) => (w.hooks.player?.glitch?._zf ? ZF_MUL : 1),
  glitch: {
    name: 'Zustandsfehler',
    onStart(p) {
      const d = st(p.weapon);
      d.blitzT = 0;
    },
    onEnd(p) {
      const d = st(p.weapon);
      if (d.mode === 'schwert') d.druck = Math.max(d.druck, ZF_END_DRUCK);
    },
    tick() {},
    onHit(p, res, monster) { zfHit(p, res, monster); },
  },
  buildMesh: ({ tier = 1, branch = null } = {}) => buildGlitchaxtLook(tier, branch),
  updateMesh(w, mesh, dt, player) {
    if (!mesh?.userData.ga) return;
    const remote = player?.remote;
    const d = mesh.userData.ga;
    let mode, druck, blitz, anim, at;
    if (remote) { // Netz-Avatar: Modus/Druck aus dem zuletzt gesehenen Pose-Level (nur waehrend eines Moves gesendet)
      if (remote.wp) { const lv = remote.wp.level | 0; d.rMode = lv & 32 ? 'schwert' : 'axt'; d.rBlitz = !!(lv & 64); d.rDruck = (lv & 31) * 5; }
      mode = d.rMode ?? 'axt'; druck = d.rDruck ?? 0; blitz = d.rBlitz ?? false;
      anim = remote.wp?.name ?? null; at = remote.wp?.t ?? 0;
    } else {
      const s = w.data ?? {};
      mode = s.mode ?? 'axt'; druck = s.druck ?? 0; blitz = (s.blitzT ?? 0) > 0;
      anim = w.move?.anim ?? null; at = w.t ?? 0;
    }
    const glitch = !!(player?.glitching || w.data?.glitchVis);
    updateGlitchaxtLook(mesh, { mode, druck, blitz, glitch, anim, at }, dt);
  },
  /** HUD: Modus-Chip (AXT/SCHWERT) + Druck-Level (4 Stufen); Blitz = "Sauber!"-Chip */
  status(w) {
    const d = st(w);
    const lv = Math.max(0, Math.ceil(d.druck / 25 - 1e-9));
    if (d.blitzT > 0) return { text: 'Sauber: B!', level: 0, max: 4, sauber: true };
    const pct = Math.round(d.druck / 5) * 5;
    const fin = w.wucht >= 100 ? ' · Kern: B halten' : '';
    if (d.mode === 'schwert') {
      if (d.ticking) return { text: `SCHWERT ${pct}%!`, level: d.tickPh ? 1 : 0, max: 4 };
      return { text: `SCHWERT ${pct}%${fin}`, level: lv, max: 4 };
    }
    return { text: `AXT ${pct}%${fin}`, level: lv, max: 4 };
  },
};
