// Krämerladen (Krämer Kiesel): buy a fixed stock for Schrott, sell items at 40 % of baseValue. Pure.
import { ITEMS, BOX_MAX } from '../data/items.js';
import { boxAdd, boxRemove, boxCount, addSchrott } from './inventory.js';

export const SELL_RATE = 0.4;
// price = total price for `n` pieces; jr = Jägerrang needed.
export const SHOP_STOCK = [
  { id: 'flickbrause', n: 1, price: 30, jr: 1 },
  { id: 'knisterkraut', n: 1, price: 8, jr: 1 },
  { id: 'sprudelwasser', n: 1, price: 10, jr: 1 },
  { id: 'blaublatt', n: 1, price: 15, jr: 1 },
  { id: 'altknochen', n: 1, price: 12, jr: 1 },
  { id: 'brennspitze', n: 10, price: 60, jr: 2 },
  { id: 'giftspitze', n: 10, price: 60, jr: 2 },
  { id: 'klebefalle', n: 1, price: 120, jr: 2 },
  { id: 'blendknolle', n: 1, price: 70, jr: 3 },
];

export const sellPrice = (id) => Math.floor((ITEMS[id]?.baseValue ?? 0) * SELL_RATE);
export const shopEntries = (save) => SHOP_STOCK.map((e, i) => ({ ...e, index: i, locked: save.jr < e.jr }));

export function canBuy(save, index) {
  const e = SHOP_STOCK[index];
  if (!e) return { ok: false, reason: 'unknown' };
  if (save.jr < e.jr) return { ok: false, reason: 'locked' };
  if (save.schrott < e.price) return { ok: false, reason: 'schrott' };
  if (boxCount(save, e.id) + e.n > BOX_MAX) return { ok: false, reason: 'full' };
  return { ok: true };
}
export function buy(save, index) {
  const c = canBuy(save, index);
  if (!c.ok) return c;
  const e = SHOP_STOCK[index];
  addSchrott(save, -e.price);
  boxAdd(save, e.id, e.n);
  return { ok: true, id: e.id, n: e.n, price: e.price };
}
export function sell(save, id, n = 1) {
  if (!ITEMS[id]) return { ok: false, reason: 'unknown' };
  const k = Math.min(n, boxCount(save, id));
  if (k <= 0) return { ok: false, reason: 'none' };
  const gain = sellPrice(id) * k;
  boxRemove(save, id, k);
  addSchrott(save, gain);
  return { ok: true, id, n: k, gain };
}
