// Tiny procedural 8x8 pixel icons for items (no assets). iconUrl(id) -> data URL (cached), iconEl(id) -> <img>.
import { ITEMS } from '../data/items.js';

const SHAPES = {
  potion: ['..XXXX..', '...XX...', '...XX...', '..XXXX..', '.XXXXXX.', '.XXXXXX.', '.XXXXXX.', '..XXXX..'],
  water: ['...XX...', '...XX...', '..XXXX..', '.XXXXXX.', '.XXXXXX.', '.XXXXXX.', '..XXXX..', '...XX...'],
  cake: ['........', '..X.X.X.', '.XXXXXXX', '.XXXXXXX', '.XXXXXXX', '.XXXXXXX', '.XXXXXXX', '........'],
  leaf: ['......XX', '....XXXX', '..XXXXX.', '.XXXXXX.', '.XXXXX..', 'XXXXX...', 'X.XX....', '........'],
  shroom: ['..XXXX..', '.XXXXXX.', 'XXXXXXXX', 'XXXXXXXX', '...XX...', '...XX...', '...XX...', '..XXXX..'],
  ore: ['........', '..XXX...', '.XXXXXX.', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '........'],
  gem: ['..XXXX..', '.XXXXXX.', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '...XX...', '........', '........'],
  bone: ['XX....XX', 'XXX..XXX', '.XXXXXX.', '..XXXX..', '..XXXX..', '.XXXXXX.', 'XXX..XXX', 'XX....XX'],
  bug: ['.X....X.', '..X..X..', '..XXXX..', '.XXXXXX.', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '...XX...'],
  ember: ['...X....', '..XX.X..', '.XXXXX..', '.XXXXXX.', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..'],
  scale: ['..XXXX..', '.XXXXXX.', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '.XXXXXX.', '..XXXX..', '...XX...'],
  fur: ['X.X.X.X.', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '.XXXXXX.', '..XXXX..'],
  crest: ['X..X..X.', 'XX.XX.XX', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '..XXXX..', '...XX...'],
  plate: ['XXXXXXXX', 'XXXXXXXX', 'XX.XX.XX', 'XXXXXXXX', 'XXXXXXXX', 'XX.XX.XX', 'XXXXXXXX', 'XXXXXXXX'],
  bomb: ['.....XX.', '....X...', '..XXXX..', '.XXXXXX.', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..'],
  cuke: ['......X.', '.....XX.', '....XXX.', '...XXX..', '..XXX...', '.XXX....', 'XXX.....', 'XX......'],
  trap: ['X.X.X.X.', 'XXXXXXXX', '.X.X.X.X', 'XXXXXXXX', 'X.X.X.X.', 'XXXXXXXX', '........', '........'],
  arrow: ['......XX', '.....XXX', '....XXX.', '...XXX..', '.XXX....', 'XXX.....', 'XX.X....', 'X..X....'],
  meat: ['..XXXX..', '.XXXXXXX', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX.X', '.....XXX', '......X.'], // [L]
  coin: ['..XXXX..', '.XXXXXX.', 'XXX..XXX', 'XX....XX', 'XX....XX', 'XXX..XXX', '.XXXXXX.', '..XXXX..'],
};

const cache = new Map();

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

export function drawIcon(g, shape, color, px = 1) {
  const rows = SHAPES[shape] ?? SHAPES.coin;
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (rows[y][x] !== 'X') continue;
      g.fillStyle = shade(color, y < 3 ? 1.25 : y > 5 ? 0.7 : 1);
      g.fillRect(x * px, y * px, px, px);
    }
  }
}

/** data URL (16x16) for an item id; 'schrott' gives a coin. */
export function iconUrl(id) {
  if (cache.has(id)) return cache.get(id);
  let url = '';
  try {
    const def = id === 'schrott' ? { icon: { shape: 'coin', color: '#ffd84a' } } : ITEMS[id];
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const g = c.getContext('2d');
    // dark outline pass: draw shape offset in black first
    drawIcon(g, def?.icon?.shape ?? 'coin', def?.icon?.color ?? '#888888', 1);
    url = c.toDataURL();
  } catch { /* no canvas (tests) */ }
  cache.set(id, url);
  return url;
}

export function iconEl(id, cls = 'ico') {
  const img = document.createElement('img');
  img.className = cls;
  img.src = iconUrl(id);
  img.alt = '';
  img.draggable = false;
  return img;
}

/** inline HTML <img> */
export const iconHtml = (id, cls = 'ico') => `<img class="${cls}" src="${iconUrl(id)}" alt="" draggable="false">`;
