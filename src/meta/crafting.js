// Crafting & equipment rules (Schmiede, Truhe, Kochtopf). Pure functions on a save object.
// Every action returns { ok:true, ... } or { ok:false, reason, missing? } and leaves the save untouched on failure.
import { ITEMS, BOX_MAX } from '../data/items.js';
import { RECIPES } from '../data/recipes.js';
import { upgradeOptions } from '../data/weapons.js';
import { ARMOR_PIECES } from '../data/armor.js';
import { FOODS } from '../data/foods.js';
import { missing, pay, boxAdd, boxCount, clampBar } from './inventory.js';
import { BAR_SLOTS } from './save.js';

export function canCraftItem(save, recipeId) {
  const r = RECIPES[recipeId];
  if (!r) return { ok: false, reason: 'unknown' };
  const m = missing(save, r.cost);
  if (m.length) return { ok: false, reason: 'mats', missing: m };
  if (boxCount(save, recipeId) + r.out > BOX_MAX) return { ok: false, reason: 'full' };
  return { ok: true };
}

export function craftItem(save, recipeId) {
  const can = canCraftItem(save, recipeId);
  if (!can.ok) return can;
  const r = RECIPES[recipeId];
  pay(save, r.cost);
  boxAdd(save, recipeId, r.out);
  return { ok: true, id: recipeId, n: r.out };
}

/** Current weapon state of a type: { tier, branch }. */
export const weaponOf = (save, type) => save.weapons[type];

/** Options for the next upgrade with affordability: [{tier, branch, name, cost, stats, ok, missing}] */
export function weaponUpgradeOptions(save, type) {
  const w = save.weapons[type];
  return upgradeOptions(type, w.tier, w.branch).map((o) => {
    const m = missing(save, o.cost);
    return { ...o, ok: m.length === 0, missing: m };
  });
}

/** Upgrade a weapon. At tier 2 -> 3 pass the chosen branch ('a' | 'b'). Tier 4 keeps the tier-3 branch. */
export function upgradeWeapon(save, type, branch = null) {
  const w = save.weapons[type];
  if (!w) return { ok: false, reason: 'unknown' };
  const opts = upgradeOptions(type, w.tier, w.branch);
  if (!opts.length) return { ok: false, reason: 'maxed' };
  const opt = opts.length === 1 ? opts[0] : opts.find((o) => o.branch === branch);
  if (!opt) return { ok: false, reason: 'branch' };
  const m = missing(save, opt.cost);
  if (m.length) return { ok: false, reason: 'mats', missing: m };
  pay(save, opt.cost);
  save.weapons[type] = { tier: opt.tier, branch: opt.tier === 4 ? w.branch : opt.branch };
  return { ok: true, tier: opt.tier, branch: save.weapons[type].branch, name: opt.name };
}

export function craftArmor(save, pieceId) {
  const p = ARMOR_PIECES[pieceId];
  if (!p) return { ok: false, reason: 'unknown' };
  if (save.armorOwned[pieceId] || !p.cost) return { ok: false, reason: 'owned' };
  const m = missing(save, p.cost);
  if (m.length) return { ok: false, reason: 'mats', missing: m };
  pay(save, p.cost);
  save.armorOwned[pieceId] = true;
  return { ok: true, id: pieceId, name: p.name };
}

export function equipWeapon(save, type) {
  if (!save.weapons[type]) return { ok: false, reason: 'unknown' };
  save.loadout.weapon = type;
  return { ok: true };
}

export function equipArmor(save, pieceId) {
  const p = ARMOR_PIECES[pieceId];
  if (!p) return { ok: false, reason: 'unknown' };
  if (!save.armorOwned[pieceId]) return { ok: false, reason: 'not_owned' };
  save.loadout.armor[p.slot] = pieceId;
  return { ok: true };
}

/**
 * Set how many pieces of a consumable go into the item bar (max 8 distinct, <= carry limit and <= box count).
 * n = 0 removes it. Returns { ok, n } with the clamped amount.
 */
export function setBarItem(save, id, n) {
  const def = ITEMS[id];
  if (!def || (def.kind !== 'consumable' && def.kind !== 'ammo')) return { ok: false, reason: 'unknown' };
  const bar = save.loadout.items;
  const idx = bar.findIndex((e) => e.id === id);
  const want = Math.max(0, Math.min(Math.floor(n), def.max, boxCount(save, id)));
  if (want === 0) { if (idx >= 0) bar.splice(idx, 1); return { ok: true, n: 0 }; }
  if (idx >= 0) bar[idx].n = want;
  else if (bar.length >= BAR_SLOTS) return { ok: false, reason: 'bar_full' };
  else bar.push({ id, n: want });
  return { ok: true, n: want };
}

/** Move a bar slot one position to the front (tap-to-sort in the Truhe). */
export function barMoveFront(save, index) {
  const bar = save.loadout.items;
  if (index <= 0 || index >= bar.length) return;
  const [e] = bar.splice(index, 1);
  bar.unshift(e);
}

export function cookMeal(save, foodId) {
  const f = FOODS[foodId];
  if (!f) return { ok: false, reason: 'unknown' };
  if (save.meal) return { ok: false, reason: 'has_meal' };
  const m = missing(save, f.cost);
  if (m.length) return { ok: false, reason: 'mats', missing: m };
  pay(save, f.cost);
  save.meal = foodId;
  return { ok: true, id: foodId };
}

export { clampBar };
