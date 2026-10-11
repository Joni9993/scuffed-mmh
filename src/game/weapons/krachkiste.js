import { compileTrack, REST } from '../anim.js';
import { buildKrachkisteLook, setSlots } from '../gear/krachkisteLook.js';
import { BUFF, sampleOfPart, pushSample, barBuffs, receiveKk, decodeKk, encodeKk } from '../buffs.js';
import { ensureKkFx, createEqualizer } from './krachkistefx.js';

// Krachkiste / Sampler (GDD 17.1, `kk`): Schrott-Lautsprecher auf Rohrstiel, zweihaendig wie ein Hammer, stumpf, Support.
//  A-Kette   Schwinger -> Gegenschwinger -> Ueberkopf-Stampfer (loop)
//  A halten  Aufdrehen (0,8 s), Loslassen = Boden-Stampfer mit Schallring; 0,8-1,05 s = "Voll aufgedreht!" (+20 %)
//  B         Abspielen: die Leiste (3 Sample-Slots, FIFO) wird als Beat gespielt -> Buffs fuer alle Pirscher im Radius 8 m, 45 s
//  Samples   jeder Schlag legt (max. 1 pro Move, erster getroffener Teil) das Sample der Zone in die Leiste: Kopf ▲ rot / Koerper ■ blau / Glieder ● gruen
//  Rolle->A  Rutsch-Schwinger;  Wucht 100 + B halten (0,3 s) = "Zugabe!" (Riesen-Stampfer, spielt die Leiste auf Stufe 3 ab)
//  Glitch    Feedback-Schleife: Leiste spielt sich alle 2 s selbst ab (ohne Leeren), jeder A-Treffer erzeugt ein Echo

export const CHARGE_TIME = 0.8;
export const VOLL_WINDOW = [0.8, 1.05];
export const VOLL_MUL = 1.2;
export const FEEDBACK_PERIOD = 2;
export const ECHO_DELAY = 0.14;
export const ECHO_HIT = { mv: 12, blunt: 18, wucht: 0, hitstop: 'none', shake: 0.05, echo: true, noSample: true };
/** Sample-Farbe -> Zonen-Ton (immer gleich, egal welcher Brocken / welche Stufe) */
export const SAMPLE_SOUND = { r: 'kkDing', b: 'kkBumm', g: 'kkTschak' };

const r2 = (n) => Math.round(n * 1000) / 1000;
const rad = (d) => (d * Math.PI) / 180;
// Schulter rechts im Spieler-Frame (x+ = links, z+ = vorn); wie beim Plattmacher, damit Treffer-Kapseln dem Kopf des Hammers folgen
const SH = [-0.45, 1.45, 0.05];

/** Kopf des Hammers schwingt durch eine senkrechte Ebene. a0->a1 = Stiel-Pitch (0 unten, 90 vorn, 180 oben). */
function arcVert({ t0, t1, n = 5, a0, a1, from = 1.15, to = 2.35, radius = 0.58, ...rest }) {
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
/** Kopf schwingt waagrecht. p0->p1 = Gier des Stiels (+ = zur Linken des Pirschers) in Hoehe y. */
function arcHorz({ t0, t1, n = 5, p0, p1, y = 1.1, from = 1.15, to = 2.35, radius = 0.58, ...rest }) {
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

// ---- Leiste / Zustand: w.data.kk = { bar:['r'|'b'|'g'], sampledInst, pump, pumpC }
export function kkState(w) {
  return (w.data.kk ??= { bar: [], sampledInst: -1, pump: 0, pumpC: 'r', echo: [], open: 0 });
}
const playerOf = (w) => w.hooks?.player ?? null;
/** Welcher Zug kommt bei B: leer = Schallstoss, 3 verschiedene = Remix, sonst Abspielen */
export function playMoveId(w) {
  const bar = kkState(w).bar;
  if (!bar.length) return 'kk_stoss';
  return barBuffs(bar).remix ? 'kk_remix' : 'kk_play';
}
const NEXT = { A: 'kk_a1', holdA: 'kk_wind', B: playMoveId, holdB: playMoveId };

const chain = (id, next) => ({ ...NEXT, A: next });
const moves = {
  kk_a1: { // Schwinger (von rechts nach links)
    id: 'kk_a1', anim: 'kk_a1', duration: 0.7,
    hits: arcHorz({ t0: 0.24, t1: 0.36, p0: -80, p1: 80, mv: 30, blunt: 14, wucht: 4, hitstop: 'medium', group: 'a1' }),
    combo: { window: [0.42, 0.66], next: chain('kk_a1', 'kk_a2') },
    rollCancelAt: 0.48, moveSpeed: 0.2, turnSpeed: 0.5,
  },
  kk_a2: { // Gegenschwinger
    id: 'kk_a2', anim: 'kk_a2', duration: 0.7,
    hits: arcHorz({ t0: 0.24, t1: 0.36, p0: 80, p1: -80, mv: 30, blunt: 14, wucht: 4, hitstop: 'medium', group: 'a2' }),
    combo: { window: [0.42, 0.66], next: chain('kk_a2', 'kk_a3') },
    rollCancelAt: 0.48, moveSpeed: 0.2, turnSpeed: 0.5,
  },
  kk_a3: { // Ueberkopf-Stampfer
    id: 'kk_a3', anim: 'kk_a3', duration: 1.0,
    hits: arcVert({ t0: 0.46, t1: 0.58, a0: 205, a1: 60, radius: 0.62, mv: 46, blunt: 30, wucht: 4, hitstop: 'heavy', group: 'a3' }),
    combo: { window: [0.66, 0.94], next: chain('kk_a3', 'kk_a1') },
    rollCancelAt: 0.7, moveSpeed: 0, turnSpeed: 0.4,
  },

  // A halten: Aufdrehen. Zu frueh loslassen = normaler Schwinger; 0,8-1,05 s = "Voll aufgedreht!"
  kk_wind: {
    id: 'kk_wind', kind: 'charge', anim: 'kk_wind', button: 'A', duration: 99,
    levels: [CHARGE_TIME], maxHold: 99, over: 1, sauber: VOLL_WINDOW,
    releases: ['kk_a1', 'kk_stampf'], moveSpeed: 0.2, turnSpeed: 0.45,
  },
  kk_stampf: { // Boden-Stampfer mit Schallring
    id: 'kk_stampf', anim: 'kk_stampf', duration: 1.0,
    hits: [{ t0: 0.34, t1: 0.46, shape: 'sphere', at: [0, 0.3, 1.5], radius: 2.5, mv: 70, blunt: 35, wucht: 6, hitstop: 'heavy', group: 's', shake: 0.45, sauberMul: VOLL_MUL, sauberText: 'Voll aufgedreht!' }],
    fire: [{ t: 0.36, call: 'ring' }],
    combo: { window: [0.5, 0.92], next: NEXT },
    rollCancelAt: 0.62, moveSpeed: 0, turnSpeed: 0.3,
  },

  // B: Abspielen (Beat). Gehen langsam moeglich.
  kk_play: {
    id: 'kk_play', anim: 'kk_play', duration: 1.0,
    fire: [{ t: 0.42, call: 'play' }],
    combo: { window: [0.72, 0.95], next: NEXT },
    rollCancelAt: 0.6, moveSpeed: 0.45, turnSpeed: 0.5,
  },
  kk_remix: { // 3 verschiedene Samples: alle drei Buffs + Druckwelle (BW 40, Radius 4 m)
    id: 'kk_remix', anim: 'kk_remix', duration: 1.1,
    hits: [{ t0: 0.44, t1: 0.54, shape: 'sphere', at: [0, 0.8, 0], radius: 4, mv: 40, blunt: 20, wucht: 3, hitstop: 'medium', group: 'rx', shake: 0.35, noSample: true }],
    fire: [{ t: 0.42, call: 'play' }],
    combo: { window: [0.8, 1.04], next: NEXT },
    rollCancelAt: 0.66, moveSpeed: 0.3, turnSpeed: 0.5,
  },
  kk_stoss: { // Leiste leer: kurzer Schallstoss (BW 10, stoesst Kleinvieh weg)
    id: 'kk_stoss', anim: 'kk_stoss', duration: 0.6,
    hits: [{ t0: 0.16, t1: 0.26, shape: 'sphere', at: [0, 1.1, 1.0], radius: 1.5, mv: 10, wucht: 1, hitstop: 'light', group: 'st', noSample: true }],
    fire: [{ t: 0.17, call: 'stoss' }],
    combo: { window: [0.3, 0.55], next: NEXT },
    rollCancelAt: 0.34, moveSpeed: 0.4, turnSpeed: 0.5,
  },
  kk_rutsch: { // Rolle -> A: flacher Rutsch-Schwinger, trifft tief
    id: 'kk_rutsch', anim: 'kk_rutsch', duration: 0.7,
    hits: arcHorz({ t0: 0.12, t1: 0.26, p0: -75, p1: 75, y: 0.5, radius: 0.6, mv: 28, blunt: 10, wucht: 4, hitstop: 'light', group: 'r' }),
    lunge: { t0: 0.02, t1: 0.26, dist: 2.5 },
    combo: { window: [0.3, 0.62], next: chain('kk_rutsch', 'kk_a2') },
    rollCancelAt: 0.42, moveSpeed: 0, turnSpeed: 0.3,
  },
  kk_finisher: { // "Zugabe!"
    id: 'kk_finisher', anim: 'kk_finisher', duration: 1.8, consumeWucht: true,
    hits: [{ t0: 0.78, t1: 0.9, shape: 'sphere', at: [0, 0.4, 1.7], radius: 3.0, mv: 200, blunt: 70, wucht: 0, hitstop: 'heavy', group: 'f', shake: 0.6, noSample: true }],
    arc: { t0: 0.2, t1: 0.78, h: 1.6 }, lunge: { t0: 0.2, t1: 0.78, dist: 2.8 },
    fire: [{ t: 0.8, call: 'finale' }],
    superArmor: 'all', rollCancelAt: 1.3, moveSpeed: 0, turnSpeed: 0.3,
  },
};

// ---- Animation (siehe anim.js). Stiel-Pitch = arx + sw (0 unten, 90 vorn, 180 oben); Membran zeigt bei Pitch 180 nach vorn.
export const KK_REST = { arx: 55, sw: 65 };
const A = (frames) => compileTrack(frames, { ...REST, ...KK_REST });
const RESTK = { arx: KK_REST.arx, sw: KK_REST.sw, tx: 3, ty: 0, py: 0, alx: -12, lrx: 0, rrx: 0 };
const WIND = { py: -0.2, tx: 14, arx: -20, sw: 30, alx: 30, lrx: 24, rrx: -18, ty: -25 };
const BOOM = { arx: 128, sw: 50, tx: -6, py: 0.03, alx: 100, lrx: 6, rrx: -6 }; // Lautsprecher ueber den Kopf, Membran nach vorn
const anims = {
  kk_a1: A([
    [0, {}], [0.16, { ty: -85, arx: 80, sw: 10, alx: 50, tx: 5, py: -0.05 }], [0.24, { ty: -90 }, 'lin'], [0.36, { ty: 90, tx: 8 }, 'lin'], [0.5, { ty: 92 }], [0.7, RESTK],
  ]),
  kk_a2: A([
    [0, { ty: 90, arx: 80, sw: 10, tx: 8 }], [0.14, { ty: 94, alx: 50, py: -0.05 }], [0.24, { ty: 90 }, 'lin'], [0.36, { ty: -90, tx: 8 }, 'lin'], [0.5, { ty: -92 }], [0.7, RESTK],
  ]),
  kk_a3: A([
    [0, {}], [0.22, { arx: 150, sw: 55, tx: -6, py: -0.04 }], [0.44, { arx: 172, sw: 38, tx: -10, py: 0.02, lrx: 12, rrx: -10 }],
    [0.46, { arx: 172, sw: 33 }, 'lin'], [0.58, { arx: 62, sw: -2, tx: 30, py: -0.1 }, 'lin'], [0.78, { arx: 62, sw: -2, tx: 30, py: -0.1 }], [1.0, { ...RESTK, lrx: 0, rrx: 0 }],
  ]),
  kk_wind: A([[0, {}], [0.25, WIND]]),
  kk_stampf: A([
    [0, WIND], [0.22, { arx: 165, sw: 45, tx: -12, py: 0.02, ty: 0, lrx: 6, rrx: -6 }], [0.34, { arx: 172, sw: 43 }, 'lin'],
    [0.46, { arx: 62, sw: -2, tx: 34, py: -0.14, lrx: 14, rrx: -8 }, 'lin'], [0.7, { arx: 62, sw: -2, tx: 34 }], [1.0, RESTK],
  ]),
  kk_play: A([
    [0, {}], [0.2, BOOM], [0.3, { py: -0.03, tx: 2 }], [0.4, { py: 0.04, tx: -6 }], [0.5, { py: -0.03, tx: 2 }], [0.6, { py: 0.04, tx: -6 }], [0.72, { py: 0 }], [1.0, RESTK],
  ]),
  kk_remix: A([
    [0, {}], [0.2, { ...BOOM, arx: 140, sw: 40 }], [0.3, { py: -0.08, tx: 4, pry: 0 }], [0.4, { py: 0.08, tx: -8 }], [0.5, { py: -0.08, tx: 4 }], [0.6, { py: 0.08, tx: -8 }], [0.82, { py: 0, pry: 0 }], [1.1, RESTK],
  ]),
  kk_stoss: A([
    [0, {}], [0.1, { arx: 118, sw: 40, tx: -4, py: -0.04, alx: 90 }], [0.18, { arx: 128, sw: 54, tx: 22, py: -0.08 }, 'lin'], [0.34, { arx: 128, sw: 54, tx: 22 }], [0.6, RESTK],
  ]),
  kk_rutsch: A([
    [0, { py: -0.3, tx: 30, arx: 90, sw: 5, ty: -70, alx: 50 }], [0.1, { py: -0.3, tx: 30, ty: -72 }], [0.26, { ty: 72, tx: 28, py: -0.28 }, 'lin'], [0.42, { ty: 60, py: -0.2 }], [0.7, RESTK],
  ]),
  kk_finisher: A([
    [0, {}], [0.2, { py: -0.35, tx: 25, arx: 160, sw: 40, alx: 120, lrx: 25, rrx: -20 }], [0.4, { py: 0.2, tx: -10, lrx: -15, rrx: -15, arx: 175, sw: 30 }],
    [0.76, { py: 0.1, arx: 175, sw: 30 }], [0.84, { py: -0.1, arx: 60, sw: -2, tx: 40, alx: 40, lrx: 20, rrx: -10 }], [1.3, { arx: 60, sw: -2, tx: 40 }],
    [1.8, { ...RESTK, lrx: 0, rrx: 0 }],
  ]),
};

// ---------------------------------------------------------------- Samples / Abspielen
const topOf = (p) => ({ x: p.pos.x, y: p.pos.y + 2.0, z: p.pos.z });
const chestOf = (p) => ({ x: p.pos.x, y: p.pos.y + 1.3, z: p.pos.z });

/** Sample der Zone in die Leiste legen (FIFO) + Ton, Membran-Pump, fliegendes Symbol. */
export function addSample(p, color, at = null) {
  const w = p.weapon, kk = kkState(w), ctx = p.ctx;
  pushSample(kk.bar, color);
  kk.pump = 1; kk.pumpC = color;
  ctx?.bus?.emit('sfx', { name: SAMPLE_SOUND[color], vol: 0.95 });
  ctx?.bus?.emit('kkBar', { player: p, bar: kk.bar.slice() });
  if (at) ensureKkFx(ctx)?.symbol(at, p, color);
  return kk.bar;
}

/** Optik + Ton fuer ein Abspielen (lokal und bei Mitspielern). ev = dekodiertes kk-Event. */
export function kkPlayFx(ctx, ev, { finale = false } = {}) {
  const cols = ev.remix ? ['r', 'b', 'g'] : ev.bar.length ? ev.bar : ev.buffs.map((b) => b.c);
  const pos = { x: ev.x, y: ctx.world?.heightAt?.(ev.x, ev.z) ?? 0, z: ev.z };
  ensureKkFx(ctx)?.ring(pos, cols, BUFF.RADIUS);
  ctx.bus?.emit('sfx', { name: 'kkBeat', pos, bar: ev.bar, finale });
  if (ev.remix) ctx.bus?.emit('sfx', { name: 'kkRemix', pos });
}

/**
 * B: Leiste abspielen. opts.finale = Zugabe (alles Stufe 3), opts.auto = Glitch-Schleife (Leiste bleibt, keine Heilung).
 * Wendet den Buff lokal auf alle Pirscher im Radius an und schickt ihn ans Netz ('kkPlay' -> HuntNet). -> Buff-Plan
 */
export function playBar(p, { finale = false, auto = false } = {}) {
  const w = p.weapon, kk = kkState(w), ctx = p.ctx;
  const bar = kk.bar.slice();
  const plan = barBuffs(bar, finale ? 3 : 0);
  if (plan.empty) return plan;
  const ev = { x: p.pos.x, z: p.pos.z, bar, buffs: plan.buffs, remix: plan.remix, auto };
  if (ctx) {
    receiveKk(ctx, ev, auto ? { heal: () => {} } : undefined);
    kkPlayFx(ctx, ev, { finale });
    ctx.bus?.emit('kkPlay', { player: p, ev: encodeKk(ev), finale });
    if (plan.remix) ctx.fx?.number?.(topOf(p), 'REMIX!', 'weak');
  }
  if (!auto) {
    kk.bar.length = 0;
    ctx?.bus?.emit('kkBar', { player: p, bar: [] });
  }
  return plan;
}

/** HuntNet: Abspielen eines Mitspielers (EV k:'kk'). Wendet den Buff auf alle Pirscher im Radius an (lokal: Buff + Heilung). -> betroffene Pirscher */
export function onKkEvent(hunt, d) {
  const ev = decodeKk(d);
  if (!ev) return [];
  const hit = receiveKk(hunt, ev, ev.auto ? { heal: () => {} } : undefined);
  kkPlayFx(hunt, ev);
  return hit;
}

function shoveMinors(p) {
  const ctx = p.ctx;
  for (const m of ctx?.monsters ?? []) {
    if (!m.alive || !m.minor || m.authority === false) continue;
    const dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z, d = Math.hypot(dx, dz);
    if (d > 3.2 || d < 1e-3) continue;
    const fx = Math.sin(p.rot), fz = Math.cos(p.rot);
    if ((dx * fx + dz * fz) / d < 0.3) continue; // nur nach vorn
    m.pos.x += (dx / d) * 1.8; m.pos.z += (dz / d) * 1.8;
  }
}

// ---------------------------------------------------------------- Waffen-Glitch: Feedback-Schleife
const gl = (p) => (p.glitch._kk ??= { auto: FEEDBACK_PERIOD, echo: [] });
function fireEcho(p, e) {
  const ctx = p.ctx;
  if (!e.mon?.alive || !ctx?.playerHit) return;
  const hp = e.mon.hurtParts().find((h) => h.part.id === e.partId);
  if (!hp) return;
  p.glitch._echoing = true;
  try {
    ctx.playerHit(p, e.mon, hp, { hit: { ...ECHO_HIT, group: 'echo' }, group: 'echo', sauber: false, glitch: false });
  } finally { p.glitch._echoing = false; }
  ctx.fx?.spark?.(hp.pos, 8, '#ff3df0', 5);
}

const glitch = {
  name: 'Feedback-Schleife',
  onStart(p) {
    const g = gl(p);
    g.auto = FEEDBACK_PERIOD; g.echo.length = 0;
    if (p.mesh?.add) { g.eq ??= createEqualizer(p.mesh); g.eq.setVisible(true); } // Equalizer-Balken um den Pirscher
  },
  onEnd(p) {
    const g = p.glitch._kk;
    if (!g) return;
    g.echo.length = 0;
    g.eq?.setVisible(false);
  },
  tick(p, dt) {
    const g = gl(p);
    g.eq?.update(p.time ?? 0);
    g.auto -= dt;
    if (g.auto <= 0) { g.auto += FEEDBACK_PERIOD; playBar(p, { auto: true }); } // spielt sich selbst ab, Leiste bleibt
    for (let i = g.echo.length - 1; i >= 0; i--) {
      const e = g.echo[i];
      if ((e.t -= dt) > 0) continue;
      g.echo.splice(i, 1);
      fireEcho(p, e);
    }
  },
  onHit(p, res, monster) {
    if (p.glitch._echoing || !monster) return;
    const w = p.weapon, src = w?.move?.hits?.[0];
    if (!src || src.noSample || src.echo) return; // nur A-Treffer (kein Remix/Stoss/Finisher/Echo)
    const g = gl(p);
    if (g.echo.length >= 6) return;
    g.echo.push({ t: ECHO_DELAY, mon: monster, partId: res.partId });
  },
};

// ---------------------------------------------------------------- Waffe
const TRAP = { kk_play: [0.12, 0.3, 0.78, 1.0], kk_remix: [0.12, 0.3, 0.85, 1.1], kk_stoss: [0.04, 0.14, 0.32, 0.55], kk_finisher: [0.5, 0.78, 1.4, 1.75] };
const trap = (t, [a, b, c, d]) => (t <= a || t >= d ? 0 : t < b ? (t - a) / (b - a) : t <= c ? 1 : 1 - (t - c) / (d - c));
const CHEX = { r: [1, 0.29, 0.23], b: [0.23, 0.55, 1], g: [0.27, 0.88, 0.35] };

export const krachkiste = {
  id: 'kk',
  name: 'Krachkiste',
  tierMesh: true,
  // A: Tipp = Schwinger, Halten = Aufdrehen.  B: Tipp = Abspielen, Halten (0,3 s) bei Wucht 100 = Zugabe
  holdThreshold: { A: 0.2, B: 0.3 },
  idle: {
    A: (w) => (w.hooks.player && w.hooks.player.sinceRoll < 0.3 ? 'kk_rutsch' : 'kk_a1'),
    holdA: 'kk_wind',
    B: playMoveId,
    holdB: playMoveId,
  },
  moves,
  anims,
  rest: KK_REST,
  sprintArx: 45,
  overrideEvent: (w, type) => (type === 'holdB' && w.wucht >= 100 ? 'kk_finisher' : undefined),
  on: {
    play(w) { const p = playerOf(w); if (p) playBar(p); },
    ring(w) {
      const p = playerOf(w), ctx = p?.ctx;
      if (!ctx) return;
      const at = { x: p.pos.x + Math.sin(p.rot) * 1.5, y: p.pos.y, z: p.pos.z + Math.cos(p.rot) * 1.5 };
      ctx.fx?.ring?.(at, 0.4, 2.5, { color: w.flags.sauber ? '#ffe14d' : '#ffffff', life: 0.45 });
      ctx.fx?.shake?.(0.25, 0.2);
    },
    stoss(w) { const p = playerOf(w); if (p) { shoveMinors(p); p.ctx?.bus?.emit('sfx', { name: 'kkTschak', pos: p.pos, vol: 0.5 }); } },
    finale(w) {
      const p = playerOf(w);
      if (!p) return;
      p.ctx?.fx?.number?.(topOf(p), 'Zugabe!', 'weak');
      playBar(p, { finale: true });
    },
  },
  /** Treffer-Hook (player.afterHit): Sample der getroffenen Zone, max. 1 pro Move */
  onHit(p, res, ah, info) {
    if (ah.hit?.noSample) return;
    const w = p.weapon, kk = kkState(w);
    if (kk.sampledInst === w.instance) return;
    kk.sampledInst = w.instance;
    addSample(p, sampleOfPart(res.partId), info?.at ?? null);
  },
  buildMesh: ({ tier = 1, branch = null } = {}) => buildKrachkisteLook(tier, branch),
  glitch,
  /** Membran pumpt in Zonen-Farbe, Instrument klappt beim Abspielen auf (Remix maximal), Kragen leuchtet gemaess Leiste */
  updateMesh(w, mesh, dt, p) {
    const d = mesh?.userData.kk;
    if (!d) return;
    d.t += dt;
    const remote = p?.remote;
    const name = remote ? remote.wp?.name : w.move?.anim;
    const mt = remote ? remote.wp?.t ?? 0 : w.t;
    const env = TRAP[name];
    const glitching = !!p?.glitching;
    let target = env ? trap(mt, env) * (name === 'kk_remix' ? 1.35 : 1) : 0;
    if (glitching) target = Math.max(target, 0.3 + 0.2 * Math.sin(d.t * 9));
    d.open += (target - d.open) * (1 - Math.exp(-16 * dt));
    const o = d.open;
    for (const pv of d.pivots) {
      const g = pv.g;
      if (pv.kind === 'rot') g.rotation[pv.axis] = pv.rest + (pv.max - pv.rest) * (pv.cap ? Math.min(o, pv.cap) : o) + pv.wob * Math.sin(d.t * (19 + pv.ph * 3) + pv.ph) * Math.min(1, o);
      else if (pv.kind === 'eq') g.scale.y = 0.5 + 0.55 * Math.min(1.2, o) * (0.45 + 0.55 * Math.abs(Math.sin(d.t * 13 + pv.ph)));
      else if (pv.kind === 'spin') { pv.ang += dt * pv.rate * o; g.rotation[pv.axis] = pv.ang; }
      else if (pv.kind === 'arc') { g.visible = o > pv.showAt; g.scale.set(Math.min(1.2, o), 0.6 + 0.4 * Math.abs(Math.sin(d.t * 31)), 1); }
    }
    // Kragen: Leiste (lokal aus w.data, Mitspieler per kkb-Event)
    setSlots(d, w.data.kk?.bar ?? []);
    // Membran: pumpt bei Treffern / im Beat in Zonen-Farbe
    const kk = w.data.kk;
    let pump = 0, c = CHEX.r;
    if (kk) { kk.pump = Math.max(0, kk.pump - dt * 4.5); pump = kk.pump; c = CHEX[kk.pumpC] ?? c; }
    if (env && o > 0.2) pump = Math.max(pump, 0.35 + 0.3 * Math.abs(Math.sin(d.t * 22)));
    const mm = d.mem.mesh;
    const s = 1 + 0.2 * pump, sz = 1 + 0.35 * pump;
    const jit = glitching ? 0.04 * Math.sin(d.t * 90) : 0;
    mm.scale.set(s + jit, s - jit, sz);
    if (glitching) d.mem.mat.emissive.setRGB(0.75 * (0.5 + 0.5 * Math.sin(d.t * 40)) + pump * 0.2, 0.05, 0.6);
    else d.mem.mat.emissive.setRGB(c[0] * pump * 0.6, c[1] * pump * 0.6, c[2] * pump * 0.6);
  },
  /** HUD-Status: 3 Slots ▲■● in Farbe, bei 3 verschiedenen REMIX */
  status(w) {
    const kk = w.data.kk, bar = kk?.bar ?? [];
    const fin = w.wucht >= 100;
    let text = '';
    if (w.charging) text = w.sauberOpen ? 'Voll aufgedreht!' : 'Aufdrehen';
    else if (fin) text = 'Zugabe: B halten';
    else if (bar.length === 3 && barBuffs(bar).remix) text = 'REMIX';
    else if (bar.length) text = 'B = Abspielen';
    return { text, level: 0, max: 0, sauber: w.sauberOpen, sauberText: 'Voll aufgedreht!', slots: [0, 1, 2].map((i) => bar[i] ?? ''), remix: bar.length === 3 && barBuffs(bar).remix };
  },
};
