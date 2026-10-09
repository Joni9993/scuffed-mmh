import { registerTexture } from '../../render/textures.js';

// Procedural 32 px textures for Schotterklamm. Each zone gets its own ground so the player knows where they are.
const noise = (cols, density = 1) => (g, n, rnd) => {
  g.fillStyle = cols[0];
  g.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (rnd() > density) continue;
      g.fillStyle = cols[(rnd() * cols.length) | 0];
      g.fillRect(x, y, 1, 1);
    }
  }
};
const dots = (g, n, rnd, cols, count, w = 1, h = 1) => {
  for (let i = 0; i < count; i++) { g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, w, h); }
};

let done = false;
export function registerWorldTextures() {
  if (done) return;
  done = true;
  // Zone 1: bright, slightly yellow meadow with flower pixels
  registerTexture('meadow', (g, n, r) => { noise(['#4a7a2c', '#58883a', '#3f6e25', '#68964a', '#4f8030'])(g, n, r); dots(g, n, r, ['#f2e26a', '#f4f0f0', '#e07ab0'], 6); });
  // Zone 2: pale bone-dust, pebbles
  registerTexture('pit', (g, n, r) => { noise(['#a89270', '#9a8462', '#b8a27e', '#8a7656'])(g, n, r); dots(g, n, r, ['#6a5c48', '#d8ceb4'], 14, 2, 1); });
  // Zone 3: murky swamp turf
  registerTexture('swamp', (g, n, r) => { noise(['#4a5a30', '#3e4c28', '#56663a', '#34402a'])(g, n, r); dots(g, n, r, ['#2a2a20', '#6a7a40'], 12, 2, 2); });
  // Zone 4: dark basalt with ember specks
  registerTexture('basalt', (g, n, r) => { noise(['#3a3238', '#2e282e', '#463c44', '#241f26'])(g, n, r); dots(g, n, r, ['#b8402a', '#e8702a'], 5); });
  registerTexture('mud', (g, n, r) => { noise(['#4a3622', '#3c2a1a', '#58422a', '#2e2014'])(g, n, r); dots(g, n, r, ['#7a6244'], 8, 3, 1); });
  registerTexture('lava', (g, n, r) => {
    noise(['#ff7a1a', '#ff9a2a', '#e85a10', '#ffc040'])(g, n, r);
    g.fillStyle = '#7a2208';
    for (let i = 0; i < 7; i++) g.fillRect((r() * n) | 0, (r() * n) | 0, 6, 1);
  });
  registerTexture('wood', (g, n, r) => {
    g.fillStyle = '#5a4634'; g.fillRect(0, 0, n, n);
    for (let x = 0; x < n; x += 2) { g.fillStyle = r() < 0.5 ? '#46362a' : '#6c5640'; g.fillRect(x, 0, 1 + (r() < 0.3 ? 1 : 0), n); }
  });
  registerTexture('cliff', (g, n, r) => {
    noise(['#8c7e78', '#7c706c', '#9c8e86', '#6e6460'])(g, n, r);
    for (let y = 3; y < n; y += 8) { g.fillStyle = '#54494a'; g.fillRect(0, y, n, 1); }
  });
  registerTexture('path', noise(['#7a6244', '#6a5238', '#8a7050', '#5a4430']));
}
