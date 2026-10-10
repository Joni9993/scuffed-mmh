// Box storage (Truhe). Pure functions on a save object. Max 99 per item; surplus is converted into Schrott.
import { ITEMS, BOX_MAX } from '../data/items.js';
import { MAX_SCHROTT } from './save.js';

export const boxCount = (save, id) => save.box[id] ?? 0;

/** Add up to BOX_MAX. Returns { added, overflow } (overflow = pieces that did not fit). */
export function boxAdd(save, id, n = 1) {
  n = Math.floor(n); // nur ganze Stücke in die Truhe
  if (!ITEMS[id] || n <= 0) return { added: 0, overflow: Math.max(0, n) };
  const have = save.box[id] ?? 0;
  const added = Math.min(n, BOX_MAX - have);
  if (added > 0) save.box[id] = have + added;
  return { added, overflow: n - added };
}

/** Remove n if available. Returns true on success, false (and no change) if not enough. */
export function boxRemove(save, id, n = 1) {
  const have = save.box[id] ?? 0;
  if (n < 0 || have < n) return false;
  if (have - n > 0) save.box[id] = have - n; else delete save.box[id];
  return true;
}

/** cost = { schrott?, <itemId>: n }. -> [] when affordable, else the missing entries [{id, need, have}] */
export function missing(save, cost) {
  const out = [];
  for (const [id, need] of Object.entries(cost ?? {})) {
    const have = id === 'schrott' ? save.schrott : boxCount(save, id);
    if (have < need) out.push({ id, need, have });
  }
  return out;
}
export const canAfford = (save, cost) => missing(save, cost).length === 0;

/** Pay a cost (all-or-nothing). */
export function pay(save, cost) {
  if (!canAfford(save, cost)) return false;
  for (const [id, n] of Object.entries(cost ?? {})) {
    if (id === 'schrott') save.schrott -= n; else boxRemove(save, id, n);
  }
  return true;
}

export function addSchrott(save, n) { save.schrott = Math.min(MAX_SCHROTT, Math.max(0, save.schrott + n)); }

/**
 * Add a bundle { id: n } to the box. Pieces that do not fit are sold for Schrott.
 * -> { added:{id:n}, sold:{id:n}, schrott } (schrott = Schrott gained from overflow)
 */
export function boxAddAll(save, bundle) {
  const added = {}, sold = {};
  let schrott = 0;
  for (const [id, n] of Object.entries(bundle)) {
    const r = boxAdd(save, id, n);
    if (r.added) added[id] = r.added;
    if (r.overflow) { sold[id] = r.overflow; schrott += r.overflow * (ITEMS[id]?.value ?? 1); }
  }
  addSchrott(save, schrott);
  return { added, sold, schrott };
}

/** Total of a stack of consumables in the planned loadout bar (never more than the box holds). */
export function clampBar(save) {
  const bar = save.loadout.items;
  for (const e of bar) e.n = Math.max(0, Math.min(e.n, ITEMS[e.id].max, boxCount(save, e.id)));
  save.loadout.items = bar.filter((e) => e.n > 0);
}
