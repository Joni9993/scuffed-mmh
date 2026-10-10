import { settings } from '../core/settings.js';
import { sfx } from './sfx.js';

// Prozedurale Musik (kein Asset): Rostnest = Synthwave+Jungle (85 BPM, Breakbeat-Gefühl), Jagd = dynamischer Synthwave (Intensität 0-3).
// Lookahead-Scheduler (25 ms Timer, 100 ms voraus). Reine Logik (Intensität, Patterns) ist ohne AudioContext testbar.

// ------------------------------------------------------------------ reine Logik
export const MUSIC_STEPS = [0, 0.25, 0.5, 0.75, 1];

/** Rohintensität 0..3 aus Spielzustand. monster = Hauptbrocken, player = lokaler Spieler. */
export function computeIntensity({ monster: m, player: p, glitching = false, chain = false } = {}) {
  const fight = !!m && m.state !== 'dead' && (m.state === 'combat' || m.state === 'enrage' || m.state === 'fly' || m.state === 'fall');
  if (!fight) return 0;
  const mf = m.maxHp > 0 ? m.hp / m.maxHp : 1;
  if (glitching || mf < 0.2) return 3;
  const pf = p && p.maxHp > 0 ? p.hp / p.maxHp : 1;
  if (m.rage || (m.phase ?? 0) >= 1 || pf < 0.35 || chain) return 2;
  return 1;
}

/** Hysterese: Stufe wird frühestens nach minHold Sekunden gewechselt. */
export class IntensityTracker {
  constructor(minHold = 4) { this.minHold = minHold; this.level = 0; this.held = minHold; }
  update(raw, dt) {
    this.held += dt;
    if (raw !== this.level && this.held >= this.minHold) { this.level = raw; this.held = 0; }
    return this.level;
  }
  force(l) { this.level = l; this.held = 0; }
}

export function rng32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
const HUB_CHORDS = [{ r: 45, t: [0, 3, 7] }, { r: 41, t: [0, 4, 7] }, { r: 48, t: [0, 4, 7] }, { r: 43, t: [0, 4, 7] }]; // Am F C G
const HUNT_CHORDS = [{ r: 38, t: [0, 3, 7] }, { r: 34, t: [0, 4, 7] }, { r: 41, t: [0, 4, 7] }, { r: 36, t: [0, 4, 7] }]; // Dm Bb F C
export const HUB_SECTIONS = ['A', 'B', 'A', 'BREAK']; // je 8 Takte = 32 Takte Zyklus
export const sectionOf = (bar) => HUB_SECTIONS[Math.floor(bar / 8) % 4];

/** Deterministisches Pattern für einen Takt (16 Steps). */
export function genBar(track, bar, seed = 1337) {
  const hub = track === 'hub';
  const chords = hub ? HUB_CHORDS : HUNT_CHORDS;
  const ch = chords[Math.floor(bar / 2) % 4];
  const r = rng32(seed + bar * 977 + (hub ? 1 : 7));
  const sec = hub ? sectionOf(bar) : 'A';
  const last = bar % 8 === 7;
  const kick = [], snare = [], hat = [], ghost = [], bass = [], arp = [], lead = [];
  if (hub) {
    if (sec !== 'BREAK') {
      kick.push(0); if (r() < 0.6) kick.push(10); if (sec === 'B' && r() < 0.5) kick.push(7);
      snare.push(4, 12);
      for (let i = 0; i < 16; i++) if (i % 2 === 0 || r() < 0.3) hat.push(i);
      for (let i = 0; i < 16; i++) if (!snare.includes(i) && r() < (last ? 0.4 : 0.16)) ghost.push(i);
    } else { kick.push(0); hat.push(0, 4, 8, 12); }
    const pat = sec === 'B' ? [0, 3, 6, 10, 12, 14] : [0, 6, 10, 14];
    for (const s of pat) bass.push({ s, n: ch.r - 12 + (r() < 0.2 ? 12 : 0), len: 2 });
    if (sec !== 'A' || bar % 4 === 3) for (let i = 0; i < 16; i += 2) if (r() < (sec === 'BREAK' ? 0.4 : 0.55)) arp.push({ s: i, n: ch.r + 12 + ch.t[(i / 2 + bar) % 3] + (r() < 0.2 ? 12 : 0) });
  } else {
    for (const s of [0, 4, 8, 12]) kick.push(s);
    snare.push(4, 12);
    for (let i = 0; i < 16; i++) if (i % 2 === 0 || r() < 0.4) hat.push(i);
    for (let i = 0; i < 16; i++) if (!snare.includes(i) && r() < 0.12) ghost.push(i);
    for (let i = 0; i < 16; i++) bass.push({ s: i, n: ch.r - 12 + (i % 8 === 6 ? 7 : 0), len: 1 });
    for (let i = 0; i < 16; i++) arp.push({ s: i, n: ch.r + 12 + ch.t[(i * 2 + (i >> 2)) % 3] + (i % 8 >= 4 ? 12 : 0) });
    const mel = [0, 7, 3, 10, 7, 12, 10, 7];
    for (let i = 0; i < 4; i++) lead.push({ s: i * 4 + (r() < 0.3 ? 2 : 0), n: ch.r + 24 + mel[(i + bar * 2) % 8], len: 3 });
  }
  return { chord: ch, kick, snare, hat, ghost, bass, arp, lead, sec, newChord: bar % 2 === 0 };
}

/** Ziel-Pegel je Hunt-Intensität. */
export const HUNT_LAYERS = [
  { pad: 0.9, bass: 0.35, drums: 0, arp: 0, lead: 0, lp: 700 },
  { pad: 0.7, bass: 0.8, drums: 0.6, arp: 0.6, lead: 0, lp: 1400 },
  { pad: 0.7, bass: 1, drums: 0.9, arp: 0.9, lead: 0, lp: 2400 },
  { pad: 0.6, bass: 1, drums: 1, arp: 1, lead: 1, lp: 3600 },
];

// ------------------------------------------------------------------ Engine
let ctx = null, out = null, duckG = null, noise = null, timer = null, retry = null;
const tr = { hub: null, hunt: null };
let want = null;
let intensity = 0, nextT = 0, step = 0, bar = 0, lastScene = null;
const volOf = () => (settings.musicOn === false ? 0 : (settings.musicVolume ?? 0.5)) * 0.6;
const hubStep = 60 / 85 / 4, huntStep = 60 / 105 / 4;

function init() {
  if (ctx) return true;
  const a = sfx.audio?.();
  if (!a) return false;
  ctx = a.ctx;
  out = ctx.createGain(); out.gain.value = volOf();
  duckG = ctx.createGain();
  out.connect(duckG).connect(a.master);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  for (const k of ['hub', 'hunt']) {
    const g = ctx.createGain(); g.gain.value = 0; g.connect(out);
    const L = {};
    for (const l of ['pad', 'bass', 'drums', 'arp', 'lead']) { L[l] = ctx.createGain(); L[l].gain.value = k === 'hub' ? 1 : 0; }
    const sc = ctx.createGain(); L.pad.connect(sc); L.bass.connect(sc); sc.connect(g); // Sidechain-Bus
    L.drums.connect(g); L.arp.connect(g); L.lead.connect(g);
    // Pad: Lowpass + Chorus (Delay mit LFO); Arp: Echo
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = k === 'hub' ? 1100 : 700; lp.Q.value = 2;
    const chD = ctx.createDelay(0.05); chD.delayTime.value = 0.018;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.4; lg.gain.value = 0.004; lfo.connect(lg).connect(chD.delayTime); lfo.start();
    const pin = ctx.createGain();
    pin.connect(lp); lp.connect(L.pad); lp.connect(chD); chD.connect(L.pad);
    const echo = ctx.createDelay(1), fb = ctx.createGain(), ew = ctx.createGain();
    echo.delayTime.value = (k === 'hub' ? hubStep : huntStep) * 3; fb.gain.value = 0.35; ew.gain.value = 0.3;
    L.arp.connect(echo); echo.connect(fb); fb.connect(echo); echo.connect(ew); ew.connect(g);
    tr[k] = { g, L, lp, pin, sc };
  }
  return true;
}

function osc(type, f, t, dur, dest, vol, lpHz = 0, a = 0.005, det = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = f; if (det) o.detune.value = det;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + a);
  g.gain.setValueAtTime(vol, t + Math.max(a, dur - 0.06));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
  let n = o;
  if (lpHz) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lpHz; o.connect(f2); n = f2; }
  n.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.1);
}
function hit(t, dest, kind, vol) {
  if (kind === 'kick') {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g).connect(dest); o.start(t); o.stop(t + 0.25);
    return;
  }
  const s = ctx.createBufferSource(); s.buffer = noise;
  const f = ctx.createBiquadFilter(), g = ctx.createGain();
  if (kind === 'hat') { f.type = 'highpass'; f.frequency.value = 6500; g.gain.setValueAtTime(vol * 0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04); }
  else { f.type = 'bandpass'; f.frequency.value = 1600; g.gain.setValueAtTime(vol * (kind === 'ghost' ? 0.3 : 0.7), t); g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'ghost' ? 0.06 : 0.15)); }
  s.connect(f).connect(g).connect(dest); s.start(t, Math.random() * 0.5, 0.2);
}

function scheduleStep(k, t, s, b, sd) {
  const T = tr[k], L = T.L, p = genBar(k, b), hub = k === 'hub';
  const dv = hub ? (p.sec === 'BREAK' ? 0.5 : 0.7) : 1;
  const tt = t + (hub && s % 2 === 1 ? sd * 0.28 : 0); // Swing
  if (s === 0 && p.newChord) { // Pad: 2 Takte, detunte Saws
    const c = p.chord;
    for (const iv of c.t.concat([12])) for (const dt of [-9, 9]) osc('sawtooth', mtof(c.r + 12 + iv), t, sd * 32, T.pin, 0.03, 0, 0.5, dt);
  }
  if (p.kick.includes(s)) {
    hit(tt, L.drums, 'kick', 0.9 * dv);
    if (!hub) { const g = T.sc.gain; g.cancelScheduledValues(tt); g.setValueAtTime(intensity >= 3 ? 0.35 : 0.85, tt); g.linearRampToValueAtTime(1, tt + sd * 3); } // Sidechain-Pumpen
  }
  if (p.snare.includes(s)) hit(tt, L.drums, 'snare', dv);
  if (p.ghost.includes(s)) hit(tt, L.drums, 'ghost', dv);
  if (p.hat.includes(s)) hit(tt, L.drums, 'hat', dv);
  for (const n of p.bass) if (n.s === s) osc('sawtooth', mtof(n.n), tt, sd * n.len * 0.9, L.bass, hub ? 0.2 : 0.17, hub ? 380 : 520);
  if (hub || intensity >= 1) for (const n of p.arp) if (n.s === s) osc(hub ? 'triangle' : 'square', mtof(n.n), tt, sd * 1.5, L.arp, hub ? 0.07 : 0.04, 1800);
  if (!hub && intensity >= 3) for (const n of p.lead) if (n.s === s) osc('sawtooth', mtof(n.n), tt, sd * n.len, L.lead, 0.05, 2400, 0.02, 6);
}

function tick() {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  if (nextT < now) nextT = now + 0.05;
  const k = want ?? lastScene;
  if (!k) return;
  const sd = k === 'hub' ? hubStep : huntStep;
  while (nextT < now + 0.1) {
    scheduleStep(k, nextT, step, bar, sd);
    nextT += sd; step++;
    if (step >= 16) { step = 0; bar++; }
  }
}

function applyLayers() {
  if (!ctx) return;
  const now = ctx.currentTime, T = tr.hunt, lay = HUNT_LAYERS[intensity];
  for (const l of ['pad', 'bass', 'drums', 'arp', 'lead']) T.L[l].gain.setTargetAtTime(lay[l], now, 0.9);
  T.lp.frequency.setTargetAtTime(lay.lp, now, 1.2);
}

export const music = {
  /** 'hub' | 'hunt' | null; Crossfade ~1,5 s. Wirkt erst nach erstem Gesture (sfx.unlock). */
  setScene(name) {
    want = name; if (name) lastScene = name;
    if (!init()) {
      if (!retry) retry = setInterval(() => { if (init()) { clearInterval(retry); retry = null; this.setScene(want); } }, 500);
      return;
    }
    const now = ctx.currentTime;
    for (const k of ['hub', 'hunt']) tr[k].g.gain.setTargetAtTime(k === name ? 1 : 0, now, 0.5);
    if (name) { step = 0; bar = 0; nextT = now + 0.1; intensity = 0; if (name === 'hunt') applyLayers(); }
    if (!timer) timer = setInterval(tick, 25);
    if (!name) setTimeout(() => { if (!want && timer) { clearInterval(timer); timer = null; } }, 2500);
  },
  setIntensity(i) { i = Math.max(0, Math.min(3, i | 0)); if (i === intensity) return; intensity = i; if (want === 'hunt') applyLayers(); },
  get intensity() { return intensity; },
  /** kurzer Sieges-Stinger */
  stinger() {
    if (!ctx || ctx.state !== 'running' || !tr.hunt) return;
    const t = ctx.currentTime + 0.05;
    [62, 66, 69, 74, 78].forEach((n, i) => osc('sawtooth', mtof(n), t + i * 0.09, 0.9 - i * 0.05, tr.hunt.g, 0.07, 3000, 0.01, 5));
  },
  /** Ducking bei großen SFX (-30 %) */
  duck(sec = 0.5) {
    if (!duckG) return;
    const t = ctx.currentTime;
    duckG.gain.cancelScheduledValues(t); duckG.gain.setTargetAtTime(0.7, t, 0.03); duckG.gain.setTargetAtTime(1, t + sec, 0.25);
  },
  refresh() { if (out) out.gain.setTargetAtTime(volOf(), ctx.currentTime, 0.05); },
};

sfx.onBig = () => music.duck();
