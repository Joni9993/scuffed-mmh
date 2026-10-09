import { settings } from '../core/settings.js';

// Minimal procedural WebAudio SFX. No assets. Unlocked on the first user gesture.
let ctx = null, master = null, noiseBuf = null, lastPlay = {};

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = settings.volume ?? 0.6;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  const n = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

function tone({ f0, f1 = f0, dur = 0.15, type = 'sine', vol = 0.3, delay = 0, lp = 0 }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
  node.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.15, vol = 0.3, f0 = 2000, f1 = 400, type = 'lowpass', delay = 0, q = 1 }) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

const SOUNDS = {
  hit: () => { noise({ dur: 0.09, vol: 0.35, f0: 2400, f1: 500 }); tone({ f0: 180, f1: 60, dur: 0.1, vol: 0.35 }); },
  heavy: () => { noise({ dur: 0.2, vol: 0.5, f0: 1800, f1: 200 }); tone({ f0: 110, f1: 32, dur: 0.3, vol: 0.55 }); tone({ f0: 60, f1: 30, dur: 0.4, vol: 0.4, delay: 0.03 }); },
  swing: (o) => noise({ dur: o?.heavy ? 0.28 : 0.16, vol: 0.12, f0: 600, f1: o?.heavy ? 1800 : 3000, type: 'bandpass', q: 0.8 }),
  roll: () => noise({ dur: 0.28, vol: 0.14, f0: 500, f1: 2500, type: 'bandpass', q: 0.6 }),
  glitch: () => {
    for (let i = 0; i < 7; i++) tone({ f0: 200 + Math.random() * 1800, dur: 0.03, type: 'square', vol: 0.12, delay: i * 0.04 });
    noise({ dur: 0.35, vol: 0.2, f0: 6000, f1: 300, type: 'highpass' });
    tone({ f0: 900, f1: 120, dur: 0.4, type: 'sawtooth', vol: 0.12 });
  },
  roar: (o) => {
    const k = o?.low ? 0.7 : 1;
    tone({ f0: 70 * k, f1: 140 * k, dur: 0.5, type: 'sawtooth', vol: 0.4, lp: 600 });
    tone({ f0: 140 * k, f1: 50 * k, dur: 0.9, type: 'sawtooth', vol: 0.4, lp: 500, delay: 0.45 });
    noise({ dur: 1.2, vol: 0.2, f0: 900, f1: 200 });
  },
  telegraph: (o) => { tone({ f0: 880, dur: 0.07, type: 'triangle', vol: o?.big ? 0.18 : 0.1 }); tone({ f0: 660, dur: 0.1, type: 'triangle', vol: o?.big ? 0.18 : 0.1, delay: 0.09 }); },
  hurt: () => { tone({ f0: 240, f1: 70, dur: 0.22, type: 'sawtooth', vol: 0.3, lp: 900 }); noise({ dur: 0.1, vol: 0.2 }); },
  monsterHit: () => noise({ dur: 0.12, vol: 0.2, f0: 800, f1: 150 }),
  block: () => { tone({ f0: 520, f1: 480, dur: 0.12, type: 'square', vol: 0.18 }); tone({ f0: 1300, dur: 0.06, type: 'square', vol: 0.1 }); noise({ dur: 0.05, vol: 0.2, f0: 5000, f1: 2000 }); },
  break: () => { noise({ dur: 0.4, vol: 0.45, f0: 3000, f1: 150 }); tone({ f0: 300, f1: 40, dur: 0.4, type: 'sawtooth', vol: 0.3 }); },
  charge: (o) => tone({ f0: 300 + (o?.level || 1) * 160, dur: 0.12, type: 'triangle', vol: 0.18 }),
  ko: () => { tone({ f0: 330, dur: 0.25, type: 'triangle', vol: 0.25 }); tone({ f0: 247, dur: 0.25, type: 'triangle', vol: 0.25, delay: 0.25 }); tone({ f0: 165, dur: 0.6, type: 'triangle', vol: 0.25, delay: 0.5 }); },
  ui: () => tone({ f0: 660, f1: 880, dur: 0.07, type: 'square', vol: 0.08 }),
};

export const sfx = {
  unlock() {
    if (!ensure()) return;
    if (ctx.state !== 'running') ctx.resume?.();
  },
  setVolume(v) { settings.volume = v; if (master) master.gain.value = v; },
  /** play(name, {vol: 0..1, heavy, low, big, level}) */
  play(name, opts) {
    if (!ctx || ctx.state !== 'running') return;
    const fn = SOUNDS[name];
    if (!fn) return;
    const now = ctx.currentTime;
    if (now - (lastPlay[name] ?? -1) < 0.03) return; // anti-spam
    lastPlay[name] = now;
    try { fn(opts); } catch { /* audio is best-effort */ }
  },
  names: Object.keys(SOUNDS),
};

for (const ev of ['pointerdown', 'touchstart', 'keydown', 'mousedown']) {
  window.addEventListener(ev, () => sfx.unlock(), { once: false, passive: true });
}
