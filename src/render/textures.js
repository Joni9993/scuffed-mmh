import * as THREE from 'three';
import { createRng } from '../core/rng.js';

const cache = new Map();

function fromCanvas(n, paint, repeat = 1, seed = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  paint(g, n, createRng(seed));
  const tx = new THREE.CanvasTexture(c);
  tx.magFilter = tx.minFilter = THREE.NearestFilter;
  tx.generateMipmaps = false;
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.repeat.set(repeat, repeat);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

const noise = (cols, density = 1) => (g, n, rnd) => {
  g.fillStyle = cols[0];
  g.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (rnd() > density) continue;
      g.fillStyle = cols[(rnd() * cols.length) | 0];
      g.fillRect(x, y, 1, 1);
    }
};

/** Painters: name -> (g, n, rnd). Add new ones with registerTexture(). */
const painters = {
  grass: noise(['#3d5a2a', '#4a6b2f', '#34501f', '#56783a', '#2f4a1d']),
  dirt: noise(['#6b5236', '#5a4429', '#7a5e3f', '#4d3a22']),
  stone: noise(['#6a6278', '#5a536a', '#7a7088', '#4a4458']),
  bone: noise(['#e8dcc0', '#d6c8a6', '#f2e9d2']),
  cloth: noise(['#3f8a4a', '#377a40', '#489656']),
  leather: noise(['#7a4a2a', '#6a3e22', '#8a5832']),
  skin: noise(['#e8b088', '#d9a07a', '#f0bc96']),
  metal: (g, n, rnd) => {
    noise(['#8a8f99', '#777c86', '#9aa0aa'])(g, n, rnd);
    g.fillStyle = '#4a4e57';
    g.fillRect(0, 0, n, 1);
    g.fillStyle = '#c9ced8';
    g.fillRect(0, n >> 1, n, 1);
    for (let i = 0; i < 5; i++) { g.fillStyle = '#5a3a2a'; g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 2, 1); } // rust
  },
  scale: (g, n, rnd) => { // Jaggo hide: blue-violet with orange stripes
    g.fillStyle = '#5b4fb3';
    g.fillRect(0, 0, n, n);
    g.fillStyle = '#3f3590';
    for (let i = 0; i < n * 2; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1);
    g.fillStyle = '#e8873a';
    for (let y = 1; y < n; y += 5) g.fillRect(0, y, n, 2);
  },
  belly: noise(['#d8c49a', '#c8b48a', '#e2d0aa']),
  crest: (g, n) => {
    g.fillStyle = '#ff8a2a';
    g.fillRect(0, 0, n, n);
    g.fillStyle = '#c0501a';
    for (let x = 0; x < n; x += 3) g.fillRect(x, 0, 1, n);
  },
  hunter: noise(['#3f8a4a', '#377a40']),
};

export function registerTexture(name, paint) { painters[name] = paint; }

/** Cached nearest-filtered procedural texture. size 16/32 gives the PS1 look. */
export function tex(name, { size = 32, repeat = 1, seed = 7 } = {}) {
  const key = `${name}|${size}|${repeat}|${seed}`;
  if (!cache.has(key)) cache.set(key, fromCanvas(size, painters[name] || painters.stone, repeat, seed));
  return cache.get(key);
}

export function canvasTexture(n, paint, repeat = 1, seed = 1) { return fromCanvas(n, paint, repeat, seed); }

/** Soft round sprite (blob shadow, glow) as texture. */
export function radialTexture(inner = 'rgba(0,0,0,0.55)', outer = 'rgba(0,0,0,0)') {
  const key = `radial|${inner}|${outer}`;
  if (!cache.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 2, 16, 16, 16);
    gr.addColorStop(0, inner);
    gr.addColorStop(1, outer);
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    const tx = new THREE.CanvasTexture(c);
    tx.magFilter = tx.minFilter = THREE.NearestFilter;
    cache.set(key, tx);
  }
  return cache.get(key);
}
