// Gather point data (GDD 6.1). Pure data + one pure roll function, so drops are deterministic and testable.
import { createRng, hashSeed } from '../core/rng.js';

/** Kinds. zones = where the world places them, count = [per zone] number of points, uses = [min,max]. */
export const GATHER_KINDS = {
  kraeuterbusch: {
    name: 'Kräuterbusch', zones: { 1: 4, 3: 2 }, uses: [1, 3], sparkle: '#9dffb0',
    drops: [{ id: 'knisterkraut', w: 70, n: [1, 2] }, { id: 'blaublatt', w: 30, n: [1, 1] }],
    dropsByZone: { 3: [{ id: 'knisterkraut', w: 50, n: [1, 2] }, { id: 'blaublatt', w: 50, n: [1, 1] }] },
  },
  pilzring: {
    name: 'Pilzring', zones: { 3: 3 }, uses: [1, 3], sparkle: '#ffa6f0',
    drops: [{ id: 'wabbelpilz', w: 60, n: [1, 2] }, { id: 'stinkmorchel', w: 40, n: [1, 1] }],
  },
  erzader: {
    name: 'Erzader', zones: { 2: 4, 4: 3 }, uses: [1, 3], sparkle: '#9fe8ff',
    drops: [{ id: 'schrotterz', w: 85, n: [1, 2] }, { id: 'glimmstein', w: 15, n: [1, 1] }],
    dropsByZone: { 4: [{ id: 'schrotterz', w: 72, n: [1, 2] }, { id: 'glimmstein', w: 28, n: [1, 1] }] },
  },
  knochenhaufen: {
    name: 'Knochenhaufen', zones: { 2: 4 }, uses: [1, 3], sparkle: '#fff6d0',
    drops: [{ id: 'altknochen', w: 75, n: [1, 2] }, { id: 'grossknochen', w: 25, n: [1, 1] }],
  },
  kaeferschwarm: {
    name: 'Käferschwarm', zones: { 1: 2, 3: 2 }, uses: [1, 2], sparkle: '#c8ff6a',
    drops: [{ id: 'brummkaefer', w: 60, n: [1, 2] }, { id: 'blitzkaefer', w: 40, n: [1, 1] }],
  },
  glutspalte: {
    name: 'Glutspalte', zones: { 4: 4 }, uses: [1, 3], sparkle: '#ffb040',
    drops: [{ id: 'glutbrocken', w: 100, n: [1, 2] }],
  },
  sprudelquelle: {
    name: 'Sprudelquelle', zones: { 1: 2, 3: 2 }, uses: [1, 3], sparkle: '#8fd8ff',
    drops: [{ id: 'sprudelwasser', w: 100, n: [1, 1] }],
  },
  // ---- Rostwerke (world: 'rostwerke' -> only that map places them; Schotterklamm ignores these)
  kupferdraht: {
    name: 'Kupferdraht-Rolle', world: 'rostwerke', zones: { 2: 8 }, uses: [1, 3], sparkle: '#ffb070',
    drops: [{ id: 'kupferdraht', w: 100, n: [1, 2] }],
  },
  schlacke: {
    name: 'Schlackehaufen', world: 'rostwerke', zones: { 1: 8 }, uses: [1, 3], sparkle: '#ff8a40',
    drops: [{ id: 'schlacke', w: 100, n: [1, 2] }],
  },
  rostkaefer: {
    name: 'Rostkäfer-Nest', world: 'rostwerke', zones: { 3: 5 }, uses: [1, 3], sparkle: '#d8b050',
    drops: [{ id: 'rostkaefer', w: 100, n: [1, 2] }],
  },
  giftschlamm: {
    name: 'Giftschlamm-Pfütze', world: 'rostwerke', zones: { 3: 4 }, uses: [1, 2], sparkle: '#80ff50',
    drops: [{ id: 'giftschlamm', w: 100, n: [1, 1] }],
  },
  funkenstein: {
    name: 'Funkenstein', world: 'rostwerke', zones: { 4: 3 }, uses: [1, 2], sparkle: '#a8e8ff',
    drops: [{ id: 'funkenstein', w: 100, n: [1, 1] }],
  },
};

/** German display names of the gatherable materials (for floating pickup text). */
export const GATHER_ITEM_NAMES = {
  knisterkraut: 'Knisterkraut', blaublatt: 'Blaublatt', wabbelpilz: 'Wabbelpilz', stinkmorchel: 'Stinkmorchel',
  schrotterz: 'Schrotterz', glimmstein: 'Glimmstein', altknochen: 'Altknochen', grossknochen: 'Großknochen',
  brummkaefer: 'Brummkäfer', blitzkaefer: 'Blitzkäfer', glutbrocken: 'Glutbrocken', sprudelwasser: 'Sprudelwasser',
  kupferdraht: 'Kupferdraht', schlacke: 'Schlacke', rostkaefer: 'Rostkäfer', giftschlamm: 'Giftschlamm', funkenstein: 'Funkenstein',
};

export const GATHER_TIME = 0.8; // seconds of holding the context button
export const GATHER_RANGE = 2.3; // metres

export function dropTable(kind, zone) {
  const k = GATHER_KINDS[kind];
  return k.dropsByZone?.[zone] ?? k.drops;
}

function pickWeighted(table, rng) {
  let sum = 0;
  for (const d of table) sum += d.w;
  let r = rng() * sum;
  for (const d of table) { r -= d.w; if (r <= 0) return d; }
  return table[table.length - 1];
}

/**
 * Deterministic drops for one use of one point. Depends only on (huntSeed, pointId, useIndex), so every peer rolls
 * the same result. useIndex = how many times the point was used before (0-based).
 * Returns [{id, n}] (merged).
 */
export function rollGather(huntSeed, pointId, kind, zone, useIndex = 0) {
  const rng = createRng(hashSeed(`${huntSeed}|${pointId}|${useIndex}`));
  const table = dropTable(kind, zone);
  const out = new Map();
  const add = (d) => out.set(d.id, (out.get(d.id) ?? 0) + rng.int(d.n[0], d.n[1]));
  add(pickWeighted(table, rng));
  if (rng() < 0.35) add(pickWeighted(table, rng));
  return [...out].map(([id, n]) => ({ id, n }));
}
