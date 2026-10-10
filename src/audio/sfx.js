import { settings } from '../core/settings.js';

// Procedural WebAudio: SFX with a fixed voice pool (16 voices, each = gain + stereo panner, reused), distance
// attenuation + panning relative to the camera, per-zone ambient loops, jingles. No assets. Unlocked on first gesture.
//
//   bus.emit('sfx', { name, pos?, ...opts })  ->  sfx.playAt(...) (wired by sfx.attach(hunt))
//   Volumes: settings.volume (master), settings.sfxVolume (effects, default 1), settings.ambientVolume (default 1).

const VOICES = 16;
let ctx = null, master = null, sfxBus = null, ambBus = null, noiseBuf = null;
let crushDry = null, crushWet = null; // Glitch-Modus: Bitcrush (WaveShaper-Treppe) parallel zum trockenen Pfad
let crushOn = false;
let voices = [];
let dest = null; // where tone()/noise() currently connect (the voice's input)
const lastPlay = {};

function ensure() {
  if (ctx) return ctx;
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try { ctx = new AC(); } catch { return null; }
  master = ctx.createGain();
  master.gain.value = settings.volume ?? 0.6;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = settings.sfxVolume ?? 1;
  // Bitcrush: sfxBus -> dry -> master  |  sfxBus -> staircase WaveShaper (~3 bit) -> highshelf cut -> wet -> master. Umschalten per Gain, kein Neuaufbau.
  crushDry = ctx.createGain(); crushWet = ctx.createGain(); crushWet.gain.value = 0;
  const shaper = ctx.createWaveShaper();
  const N = 16, curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.round(x * N) / N; }
  shaper.curve = curve;
  const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 5200;
  sfxBus.connect(crushDry).connect(master);
  sfxBus.connect(shaper).connect(lpf).connect(crushWet).connect(master);
  ambBus = ctx.createGain();
  ambBus.gain.value = settings.ambientVolume ?? 1;
  ambBus.connect(master);
  const n = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  for (let i = 0; i < VOICES; i++) {
    const input = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { input.connect(pan); pan.connect(sfxBus); } else input.connect(sfxBus);
    voices.push({ input, pan, until: 0, prio: 0 });
  }
  return ctx;
}

// ------------------------------------------------------------------ primitives (connect to `dest`)
function tone({ f0, f1 = f0, dur = 0.15, type = 'sine', vol = 0.3, delay = 0, lp = 0, vib = 0 }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
  if (vib) { // vibrato for screeches
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = 22; lg.gain.value = vib;
    l.connect(lg).connect(o.frequency);
    l.start(t); l.stop(t + dur + 0.02);
  }
  node.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.15, vol = 0.3, f0 = 2000, f1 = 400, type = 'lowpass', delay = 0, q = 1 }) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

const rr = (a, b) => a + Math.random() * (b - a);
const pitch = (k = 0.12) => 1 + (Math.random() - 0.5) * 2 * k;

// ------------------------------------------------------------------ sounds
// ---- Lesbarkeit: Windup-Toene pro Angriff (Klangfarbe + Tonhoehe aus cues.js), Laenge = Telegraph-Dauer
const WINDUP = {
  brumm: (f, d, v) => { tone({ f0: f * 0.5, f1: f * 0.62, dur: d, type: 'sawtooth', vol: 0.2 * v, lp: 380 }); tone({ f0: f * 0.25, f1: f * 0.31, dur: d, vol: 0.3 * v }); },
  schrill: (f, d, v) => { tone({ f0: f * 3, f1: f * 4.2, dur: d, type: 'square', vol: 0.09 * v, vib: 60 }); tone({ f0: f * 6, f1: f * 7, dur: d, type: 'triangle', vol: 0.07 * v }); },
  knurr: (f, d, v) => { tone({ f0: f * 0.8, f1: f * 0.55, dur: d, type: 'sawtooth', vol: 0.2 * v, lp: 700, vib: 90 }); noise({ dur: d, vol: 0.12 * v, f0: 500, f1: 250, type: 'bandpass', q: 2 }); },
  zisch: (f, d, v) => { noise({ dur: d, vol: 0.2 * v, f0: 2500, f1: 7000, type: 'bandpass', q: 1.2 }); tone({ f0: f * 4, f1: f * 5, dur: d, type: 'sine', vol: 0.05 * v }); },
  droehn: (f, d, v) => { tone({ f0: f * 0.4, f1: f * 0.8, dur: d, type: 'sawtooth', vol: 0.22 * v, lp: 600 }); tone({ f0: f * 0.2, f1: f * 0.4, dur: d, type: 'square', vol: 0.14 * v, lp: 300 }); },
  klick: (f, d, v) => { const n = Math.max(3, Math.round(d / 0.09)); for (let i = 0; i < n; i++) tone({ f0: f * 5, f1: f * 3, dur: 0.035, type: 'square', vol: 0.12 * v, delay: (d * i) / n }); },
};

const SOUNDS = {
  windup: (o) => { const d = Math.max(0.15, Math.min(3, o?.dur ?? 0.5)); (WINDUP[o?.timbre] ?? WINDUP.brumm)(o?.f ?? 180, d, o?.teach ? 1.5 : 1); if (o?.teach) noise({ dur: 0.12, vol: 0.15, f0: 3000, f1: 800, type: 'bandpass' }); },
  tired: () => { noise({ dur: 0.3, vol: 0.2, f0: 1500, f1: 400, type: 'bandpass' }); noise({ dur: 0.3, vol: 0.2, f0: 1400, f1: 350, type: 'bandpass', delay: 0.4 }); tone({ f0: 160, f1: 90, dur: 0.5, vol: 0.2, lp: 500, delay: 0.1 }); },
  eye: () => { tone({ f0: 330, f1: 330, dur: 0.12, type: 'triangle', vol: 0.18 }); tone({ f0: 495, f1: 520, dur: 0.22, type: 'triangle', vol: 0.18, delay: 0.1 }); },
  phase: () => { tone({ f0: 90, f1: 40, dur: 0.9, type: 'sawtooth', vol: 0.4, lp: 400 }); noise({ dur: 0.6, vol: 0.3, f0: 2000, f1: 200 }); },
  // ---- combat (existing + variations)
  hit: (o) => {
    const k = o?.kind;
    if (k === 'armor') { noise({ dur: 0.07, vol: 0.3, f0: 5000, f1: 2500, type: 'highpass' }); tone({ f0: 1500 * pitch(), f1: 1100, dur: 0.1, type: 'square', vol: 0.14 }); tone({ f0: 140, f1: 70, dur: 0.1, vol: 0.3 }); }
    else if (k === 'weak' || o?.weak) { noise({ dur: 0.1, vol: 0.38, f0: 3200, f1: 700 }); tone({ f0: 240 * pitch(), f1: 70, dur: 0.12, vol: 0.38 }); tone({ f0: 1200, f1: 1800, dur: 0.12, type: 'triangle', vol: 0.12, delay: 0.02 }); }
    else if (k === 'crit' || o?.crit) { noise({ dur: 0.14, vol: 0.42, f0: 3600, f1: 500 }); tone({ f0: 200, f1: 50, dur: 0.18, vol: 0.45 }); tone({ f0: 1600, f1: 2400, dur: 0.18, type: 'triangle', vol: 0.14, delay: 0.03 }); tone({ f0: 2400, dur: 0.1, type: 'triangle', vol: 0.1, delay: 0.1 }); }
    else { noise({ dur: 0.09, vol: 0.35, f0: 2400 * pitch(), f1: 500 }); tone({ f0: 180 * pitch(), f1: 60, dur: 0.1, vol: 0.35 }); }
  },
  hitFlesh: () => SOUNDS.hit({ kind: 'flesh' }),
  hitArmor: () => SOUNDS.hit({ kind: 'armor' }),
  hitWeak: () => SOUNDS.hit({ kind: 'weak' }),
  hitCrit: () => SOUNDS.hit({ kind: 'crit' }),
  heavy: () => { noise({ dur: 0.2, vol: 0.5, f0: 1800, f1: 200 }); tone({ f0: 110, f1: 32, dur: 0.3, vol: 0.55 }); tone({ f0: 60, f1: 30, dur: 0.4, vol: 0.4, delay: 0.03 }); },
  swing: (o) => noise({ dur: o?.heavy ? 0.28 : 0.16, vol: 0.12, f0: 600, f1: o?.heavy ? 1800 : 3000, type: 'bandpass', q: 0.8 }),
  roll: () => noise({ dur: 0.28, vol: 0.14, f0: 500, f1: 2500, type: 'bandpass', q: 0.6 }),
  glitchOn: () => { // lauter Eintritts-Sound: Riss + Absturz + Bass-Schlag
    for (let i = 0; i < 14; i++) tone({ f0: 150 + Math.random() * 3000, dur: 0.025, type: i % 2 ? 'square' : 'sawtooth', vol: 0.2, delay: i * 0.018 });
    noise({ dur: 0.5, vol: 0.4, f0: 9000, f1: 200, type: 'highpass' });
    tone({ f0: 1400, f1: 70, dur: 0.5, type: 'sawtooth', vol: 0.22 });
    tone({ f0: 70, f1: 32, dur: 0.6, vol: 0.55, delay: 0.1 });
    tone({ f0: 440, f1: 880, dur: 0.15, type: 'square', vol: 0.12, delay: 0.25 });
  },
  glitchOff: () => { noise({ dur: 0.3, vol: 0.2, f0: 4000, f1: 150, type: 'highpass' }); tone({ f0: 600, f1: 60, dur: 0.35, type: 'sawtooth', vol: 0.14 }); },
  glitch: () => {
    for (let i = 0; i < 9; i++) tone({ f0: 200 + Math.random() * 2200, dur: 0.03, type: i % 2 ? 'square' : 'sawtooth', vol: 0.12, delay: i * 0.035 });
    noise({ dur: 0.38, vol: 0.22, f0: 7000, f1: 300, type: 'highpass' });
    tone({ f0: 900, f1: 90, dur: 0.45, type: 'sawtooth', vol: 0.13 });
    tone({ f0: 60, f1: 40, dur: 0.4, vol: 0.3, delay: 0.05 });
  },
  /** roar({kind:'jaggo'|'jaggling'|'barrotz'|'brathalos', size:number(scale), low}) */
  roar: (o) => {
    const kind = o?.kind;
    const size = o?.size ?? (kind === 'jaggling' ? 1 : kind === 'jaggo' ? 2.1 : kind === 'barrotz' ? 2.4 : kind === 'brathalos' ? 2.6 : 2);
    const k = (o?.low ? 0.7 : 1) * Math.pow(2 / Math.max(0.6, size), 0.55);
    if (kind === 'jaggling') { // small chirp
      tone({ f0: 900, f1: 1500, dur: 0.12, type: 'square', vol: 0.14, lp: 3000 }); tone({ f0: 1500, f1: 700, dur: 0.16, type: 'square', vol: 0.14, lp: 3000, delay: 0.11 });
    } else if (kind === 'jaggo') { // raptor shriek
      tone({ f0: 380 * k, f1: 980 * k, dur: 0.35, type: 'sawtooth', vol: 0.3, lp: 2200, vib: 40 });
      tone({ f0: 980 * k, f1: 260 * k, dur: 0.7, type: 'sawtooth', vol: 0.32, lp: 1800, delay: 0.33, vib: 55 });
      noise({ dur: 1.0, vol: 0.16, f0: 2400, f1: 400, type: 'bandpass', q: 0.7 });
      tone({ f0: 90 * k, f1: 60 * k, dur: 0.9, vol: 0.3 });
    } else if (kind === 'barrotz') { // deep bellow
      tone({ f0: 55, f1: 80, dur: 0.6, type: 'sawtooth', vol: 0.45, lp: 320 });
      tone({ f0: 80, f1: 38, dur: 1.2, type: 'sawtooth', vol: 0.45, lp: 280, delay: 0.55 });
      tone({ f0: 41, f1: 30, dur: 1.5, vol: 0.4 });
      noise({ dur: 1.6, vol: 0.2, f0: 500, f1: 90 });
    } else if (kind === 'brathalos') { // wyvern screech with a flame hiss
      tone({ f0: 620, f1: 1700, dur: 0.4, type: 'sawtooth', vol: 0.26, lp: 3500, vib: 70 });
      tone({ f0: 1700, f1: 420, dur: 0.9, type: 'sawtooth', vol: 0.28, lp: 3000, delay: 0.38, vib: 90 });
      tone({ f0: 70, f1: 50, dur: 1.2, type: 'sawtooth', vol: 0.3, lp: 300 });
      noise({ dur: 1.4, vol: 0.2, f0: 5000, f1: 900, type: 'highpass' });
    } else { // generic, scaled by size
      tone({ f0: 70 * k, f1: 140 * k, dur: 0.5, type: 'sawtooth', vol: 0.4, lp: 600 });
      tone({ f0: 140 * k, f1: 50 * k, dur: 0.9, type: 'sawtooth', vol: 0.4, lp: 500, delay: 0.45 });
      noise({ dur: 1.2, vol: 0.2, f0: 900, f1: 200 });
    }
  },
  telegraph: (o) => { tone({ f0: 880, dur: 0.07, type: 'triangle', vol: o?.big ? 0.18 : 0.1 }); tone({ f0: 660, dur: 0.1, type: 'triangle', vol: o?.big ? 0.18 : 0.1, delay: 0.09 }); },
  hurt: () => { tone({ f0: 240, f1: 70, dur: 0.22, type: 'sawtooth', vol: 0.3, lp: 900 }); noise({ dur: 0.1, vol: 0.2 }); },
  monsterHit: () => noise({ dur: 0.12, vol: 0.2, f0: 800, f1: 150 }),
  block: () => { tone({ f0: 520, f1: 480, dur: 0.12, type: 'square', vol: 0.18 }); tone({ f0: 1300, dur: 0.06, type: 'square', vol: 0.1 }); noise({ dur: 0.05, vol: 0.2, f0: 5000, f1: 2000 }); },
  break: () => { noise({ dur: 0.4, vol: 0.45, f0: 3000, f1: 150 }); tone({ f0: 300, f1: 40, dur: 0.4, type: 'sawtooth', vol: 0.3 }); },
  charge: (o) => tone({ f0: 300 + (o?.level || 1) * 160, dur: 0.12, type: 'triangle', vol: 0.18 }),
  ko: () => { tone({ f0: 330, dur: 0.25, type: 'triangle', vol: 0.25 }); tone({ f0: 247, dur: 0.25, type: 'triangle', vol: 0.25, delay: 0.25 }); tone({ f0: 165, dur: 0.6, type: 'triangle', vol: 0.25, delay: 0.5 }); },

  // ---- UI
  ui: () => tone({ f0: 660, f1: 880, dur: 0.07, type: 'square', vol: 0.08 }),
  uiTick: () => tone({ f0: 1100, dur: 0.035, type: 'square', vol: 0.06 }),
  uiConfirm: () => { tone({ f0: 660, dur: 0.06, type: 'square', vol: 0.08 }); tone({ f0: 990, dur: 0.1, type: 'square', vol: 0.08, delay: 0.06 }); },
  uiBack: () => { tone({ f0: 660, dur: 0.06, type: 'square', vol: 0.08 }); tone({ f0: 440, dur: 0.1, type: 'square', vol: 0.08, delay: 0.06 }); },
  zone: () => { tone({ f0: 392, dur: 0.25, type: 'sine', vol: 0.12 }); tone({ f0: 587, dur: 0.4, type: 'sine', vol: 0.12, delay: 0.14 }); },

  // ---- items / gathering
  itemUse: () => { for (let i = 0; i < 3; i++) tone({ f0: 240 + i * 40, f1: 420 + i * 50, dur: 0.09, vol: 0.2, delay: i * 0.11 }); noise({ dur: 0.3, vol: 0.05, f0: 1200, f1: 600, type: 'bandpass' }); },
  gatherTick: () => noise({ dur: 0.07, vol: 0.12, f0: 1400 * pitch(0.3), f1: 900, type: 'bandpass', q: 1.2 }),
  gather: () => {
    noise({ dur: 0.18, vol: 0.18, f0: 900, f1: 3200, type: 'bandpass', q: 0.9 });
    tone({ f0: 660, dur: 0.12, type: 'triangle', vol: 0.18, delay: 0.05 });
    tone({ f0: 880, dur: 0.12, type: 'triangle', vol: 0.18, delay: 0.14 });
    tone({ f0: 1320, dur: 0.22, type: 'triangle', vol: 0.14, delay: 0.24 });
  },
  carve: () => { noise({ dur: 0.18, vol: 0.2, f0: 2600, f1: 900, type: 'bandpass', q: 1.5 }); tone({ f0: 180, f1: 90, dur: 0.1, vol: 0.2, delay: 0.05 }); },
  sizzle: () => noise({ dur: 0.35, vol: 0.2, f0: 6000, f1: 2500, type: 'highpass' }),

  // ---- footsteps per ground type
  step_grass: (o) => { const v = o?.run ? 0.07 : 0.05; noise({ dur: 0.07, vol: v, f0: 2200 * pitch(0.2), f1: 800, type: 'bandpass', q: 0.8 }); tone({ f0: 90 * pitch(), f1: 60, dur: 0.05, vol: v * 0.8 }); },
  step_rock: (o) => { const v = o?.run ? 0.09 : 0.065; noise({ dur: 0.05, vol: v, f0: 4200 * pitch(0.2), f1: 1800, type: 'highpass' }); tone({ f0: 130 * pitch(), f1: 70, dur: 0.06, vol: v }); },
  step_mud: (o) => { const v = o?.run ? 0.1 : 0.075; noise({ dur: 0.16, vol: v, f0: 700 * pitch(0.2), f1: 220, type: 'lowpass' }); tone({ f0: 160 * pitch(0.3), f1: 55, dur: 0.14, vol: v * 0.9 }); },
  step_lava: () => { noise({ dur: 0.1, vol: 0.08, f0: 3600, f1: 1400, type: 'highpass' }); tone({ f0: 120, f1: 70, dur: 0.08, vol: 0.06 }); },

  // ---- jingles
  questComplete: () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { tone({ f0: f, dur: 0.22, type: 'triangle', vol: 0.2, delay: i * 0.14 }); tone({ f0: f * 2, dur: 0.18, type: 'square', vol: 0.04, delay: i * 0.14 }); });
    tone({ f0: 1046.5, dur: 0.9, type: 'triangle', vol: 0.2, delay: 0.62 }); tone({ f0: 783.99, dur: 0.9, type: 'triangle', vol: 0.14, delay: 0.62 }); tone({ f0: 523.25, dur: 0.9, type: 'triangle', vol: 0.14, delay: 0.62 });
  },
  questFail: () => {
    [330, 294, 262, 196].forEach((f, i) => tone({ f0: f, f1: f * 0.97, dur: 0.32, type: 'sawtooth', vol: 0.14, lp: 900, delay: i * 0.24 }));
    tone({ f0: 98, f1: 90, dur: 0.9, type: 'triangle', vol: 0.22, delay: 0.96 });
  },
};

const DUR = { tired: 1, phase: 1, roar: 1.8, questComplete: 1.6, questFail: 1.9, glitch: 0.5, glitchOn: 0.8, glitchOff: 0.4, ko: 1.2, gather: 0.5, heavy: 0.5, break: 0.5, step_mud: 0.2, itemUse: 0.5, sizzle: 0.4 };
const PRIO = { windup: 3, phase: 3, tired: 2, eye: 2, roar: 3, questComplete: 4, questFail: 4, ko: 3, hurt: 3, glitch: 3, glitchOn: 4, glitchOff: 3, gather: 2, heavy: 2, break: 2, hit: 2, hitCrit: 2, hitWeak: 2 };
const MIN_GAP = { windup: 0.05, step_grass: 0.06, step_rock: 0.06, step_mud: 0.06, step_lava: 0.06, hit: 0.03, gatherTick: 0.1 };

// ------------------------------------------------------------------ ambient (per zone)
const amb = { built: false, wind: null, cricket: null, rumble: null, bubbleG: null, w: [0, 0, 0, 0], nextBubble: 0, nextCrackle: 0, on: true };

function buildAmbient() {
  if (amb.built || !ctx) return;
  amb.built = true;
  const loopNoise = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(0, Math.random()); return s; };
  // wind: band-passed noise whose centre drifts
  const wind = ctx.createGain(); wind.gain.value = 0;
  const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 520; wf.Q.value = 0.7;
  const wl = ctx.createOscillator(), wlg = ctx.createGain(); wl.frequency.value = 0.13; wlg.gain.value = 260; wl.connect(wlg).connect(wf.frequency); wl.start();
  loopNoise().connect(wf).connect(wind).connect(ambBus);
  // crickets: 4.3 kHz tone chopped by a fast LFO
  const cr = ctx.createGain(); cr.gain.value = 0;
  const co = ctx.createOscillator(); co.frequency.value = 4300;
  const chop = ctx.createGain(); chop.gain.value = 0;
  const cl = ctx.createOscillator(), clg = ctx.createGain(); cl.type = 'square'; cl.frequency.value = 13; clg.gain.value = 0.5; cl.connect(clg).connect(chop.gain);
  const cl2 = ctx.createOscillator(), cl2g = ctx.createGain(); cl2.frequency.value = 0.6; cl2g.gain.value = 0.4; cl2.connect(cl2g).connect(chop.gain);
  // Grillen (4,3-kHz-Dauerton) entfernt – Owner-Feedback: schrill. Knoten bleiben stumm, damit setAmbient unverändert läuft.
  co.connect(chop).connect(cr);
  // lava rumble: low noise with slow throb
  const rum = ctx.createGain(); rum.gain.value = 0;
  const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 130;
  const rl = ctx.createOscillator(), rlg = ctx.createGain(); rl.frequency.value = 0.35; rlg.gain.value = 40; rl.connect(rlg).connect(rf.frequency); rl.start();
  loopNoise().connect(rf).connect(rum).connect(ambBus);
  amb.wind = wind; amb.cricket = cr; amb.rumble = rum;
}
const AMB_WIND = [0.035, 0.07, 0.03, 0.05], AMB_RUMBLE = [0, 0, 0.02, 0.16], AMB_CRICKET = [0.006, 0, 0.004, 0];

function oneShot(fn, vol, pan = 0) { // ambient blips go through the SFX voices so they obey the voice cap
  const v = takeVoice(0);
  if (!v) return;
  v.input.gain.value = vol; if (v.pan) v.pan.pan.value = pan;
  dest = v.input; v.until = ctx.currentTime + 0.5; v.prio = 0;
  try { fn(); } catch { /* best effort */ }
}

function takeVoice(prio) {
  const now = ctx.currentTime;
  let best = null;
  for (const v of voices) if (v.until <= now) return v;
  for (const v of voices) if (v.prio < prio && (!best || v.until < best.until)) best = v;
  return best;
}

let primed = false;
export const sfx = {
  unlock() {
    if (!ensure()) return;
    if (ctx.state !== 'running') { try { ctx.resume?.()?.catch?.(() => {}); } catch { /* ignore */ } }
    if (!primed) { // iOS: a started (silent) source inside the gesture fully unlocks output
      primed = true;
      try { const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0); } catch { /* ignore */ }
    }
  },
  /** true when the AudioContext exists and is not running (suspended / interrupted) */
  get blocked() { return !!ctx && ctx.state !== 'running'; },
  /** Glitch-Modus: Bitcrush-Filter auf alle SFX (Ambient bleibt sauber). */
  setCrush(on) {
    crushOn = !!on;
    if (!ctx || !crushDry) return;
    const t = ctx.currentTime;
    crushDry.gain.setTargetAtTime(on ? 0.15 : 1, t, 0.02);
    crushWet.gain.setTargetAtTime(on ? 0.95 : 0, t, 0.02);
  },
  get crushing() { return crushOn; },
  /** master volume 0..1 */
  setVolume(v) { settings.volume = v; if (master) master.gain.value = v; },
  setSfxVolume(v) { settings.sfxVolume = v; if (sfxBus) sfxBus.gain.value = v; },
  setAmbientVolume(v) { settings.ambientVolume = v; if (ambBus) ambBus.gain.value = v; },

  /** play(name, {vol: 0..1, pan: -1..1, heavy, low, big, level, kind, size, run}) */
  play(name, opts = {}) {
    if (!ctx || ctx.state !== 'running') return;
    const fn = SOUNDS[name];
    if (!fn) return;
    const now = ctx.currentTime;
    if (now - (lastPlay[name] ?? -1) < (MIN_GAP[name] ?? 0.03)) return; // anti-spam
    const prio = PRIO[name] ?? 1;
    const v = takeVoice(prio);
    if (!v) return; // voice cap reached
    lastPlay[name] = now;
    v.input.gain.cancelScheduledValues(now);
    v.input.gain.value = opts.vol ?? 1;
    if (v.pan) v.pan.pan.value = opts.pan ?? 0;
    v.until = now + (name === 'windup' && opts.dur ? opts.dur + 0.1 : (DUR[name] ?? 0.45));
    v.prio = prio;
    dest = v.input;
    try { fn(opts); } catch { /* audio is best-effort */ }
  },

  /** Position-aware play: distance attenuation + stereo pan relative to the listener (camera yaw). */
  playAt(e, listener, yaw = 0) {
    if (!ctx || ctx.state !== 'running') return;
    let vol = 1, pan = 0;
    if (e.pos && listener) {
      const dx = e.pos.x - listener.x, dz = e.pos.z - listener.z, d = Math.hypot(dx, dz);
      if (d > 80 && !(PRIO[e.name] >= 3)) return;
      vol = 1 / (1 + d / 18);
      if (d > 1.5) pan = Math.max(-1, Math.min(1, ((-Math.cos(yaw) * dx + Math.sin(yaw) * dz) / d) * 0.85)) * Math.min(1, d / 5);
    }
    this.play(e.name, { ...e, vol: (e.vol ?? 1) * vol, pan });
  },

  /** Wire a hunt: bus 'sfx' events + a few game events that have their own jingles. Returns detach(). */
  attach(hunt) {
    const b = hunt.bus, offs = [];
    offs.push(b.on('sfx', (e) => this.playAt(e, hunt.player?.pos, hunt.cameraYaw ?? 0)));
    offs.push(b.on('glitchStart', (e) => { if (e?.player?.local !== false) { this.setCrush(true); this.play('glitchOn', { vol: 1 }); } }));
    offs.push(b.on('glitchEnd', (e) => { if (e?.player?.local !== false) { this.setCrush(false); this.play('glitchOff', { vol: 0.8 }); } }));
    offs.push(() => this.setCrush(false));
    offs.push(b.on('questComplete', () => this.play('questComplete', { vol: 1 })));
    offs.push(b.on('questFailed', () => this.play('questFail', { vol: 1 })));
    offs.push(b.on('itemUsed', () => this.play('itemUse', { vol: 0.8 })));
    offs.push(b.on('zoneEnter', () => this.play('zone', { vol: 0.7 })));
    offs.push(b.on('carved', () => this.play('carve', { vol: 0.8 })));
    return () => offs.forEach((o) => o?.());
  },

  /** Ambient mix from the 4 zone blend weights (call every frame; cheap). */
  setAmbient(w) {
    if (!ctx || ctx.state !== 'running') return;
    buildAmbient();
    const now = ctx.currentTime;
    let changed = false;
    for (let i = 0; i < 4; i++) if (Math.abs(amb.w[i] - w[i]) > 0.01) changed = true;
    if (changed || !amb.on) {
      for (let i = 0; i < 4; i++) amb.w[i] = w[i];
      let wi = 0, ru = 0, cr = 0;
      for (let i = 0; i < 4; i++) { wi += AMB_WIND[i] * w[i]; ru += AMB_RUMBLE[i] * w[i]; cr += AMB_CRICKET[i] * w[i]; }
      amb.wind.gain.setTargetAtTime(wi, now, 0.5);
      amb.rumble.gain.setTargetAtTime(ru, now, 0.5);
      amb.cricket.gain.setTargetAtTime(cr, now, 0.5);
      amb.on = true;
    }
    // zone 3: mud bubbles, zone 4: ember crackle (random one-shots)
    if (w[2] > 0.15 && now >= amb.nextBubble) {
      amb.nextBubble = now + 0.35 + Math.random() * 1.3;
      const f = rr(140, 320);
      oneShot(() => { tone({ f0: f, f1: f * 2.4, dur: 0.09, vol: 0.5 }); tone({ f0: f * 1.5, f1: f * 3.2, dur: 0.06, vol: 0.25, delay: 0.07 }); }, 0.2 * w[2], rr(-0.6, 0.6));
    }
    if (w[3] > 0.15 && now >= amb.nextCrackle) {
      amb.nextCrackle = now + 0.12 + Math.random() * 0.7;
      oneShot(() => noise({ dur: 0.03 + Math.random() * 0.03, vol: 0.5, f0: 5000 + Math.random() * 3000, f1: 2500, type: 'highpass' }), 0.1 * w[3], rr(-0.7, 0.7));
    }
  },
  stopAmbient() {
    if (!ctx || !amb.built) return;
    const now = ctx.currentTime;
    for (const g of [amb.wind, amb.rumble, amb.cricket]) g.gain.setTargetAtTime(0, now, 0.15);
    amb.w = [0, 0, 0, 0]; amb.on = false;
  },
  names: Object.keys(SOUNDS),
  get voiceCount() { return voices.length; },
  get activeVoices() { return ctx ? voices.filter((v) => v.until > ctx.currentTime).length : 0; },
};

if (typeof window !== 'undefined' && window.addEventListener) {
  for (const ev of ['pointerdown', 'touchstart', 'keydown', 'mousedown']) {
    window.addEventListener(ev, () => sfx.unlock(), { once: false, passive: true });
  }
}

/**
 * iOS/Safari: keep the context alive. Resume on every user gesture (not just the first; iOS re-suspends after
 * calls/lock screen/tab switch) and when the page becomes visible again.
 */
export function installAudioAutoResume(doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null) {
  if (typeof doc?.addEventListener !== 'function' || typeof win?.addEventListener !== 'function') return () => {};
  const gesture = () => { if (!ctx || ctx.state !== 'running') sfx.unlock(); };
  const vis = () => { if (!doc.hidden) { if (ctx && ctx.state !== 'running') sfx.unlock(); } };
  const evs = ['touchstart', 'touchend', 'pointerdown', 'mousedown', 'keydown', 'click'];
  for (const e of evs) doc.addEventListener(e, gesture, { passive: true, capture: true });
  doc.addEventListener('visibilitychange', vis);
  win.addEventListener('pageshow', vis);
  win.addEventListener('focus', vis);
  return () => {
    for (const e of evs) doc.removeEventListener(e, gesture, { capture: true });
    doc.removeEventListener('visibilitychange', vis);
    win.removeEventListener('pageshow', vis);
    win.removeEventListener('focus', vis);
  };
}
installAudioAutoResume();
