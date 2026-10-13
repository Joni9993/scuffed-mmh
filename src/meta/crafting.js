// Crafting & equipment rules (Schmiede, Truhe, Kochtopf). Pure functions on a save object.
// Every action returns { ok:true, ... } or { ok:false, reason, missing? } and leaves the save untouched on failure.
import { ITEMS, BOX_MAX } from '../data/items.js';
import { RECIPES } from '../data/recipes.js';
import { upgradeOptions, weaponStats } from '../data/weapons.js';
import { ARMOR_PIECES } from '../data/armor.js';
import { FOODS } from '../data/foods.js';
import { missing, pay, boxAdd, boxCount, clampBar, addSchrott } from './inventory.js';
import { BAR_SLOTS, ARMORY_MAX } from './save.js';

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
  save.stats.crafted = (save.stats.crafted ?? 0) + 1;
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

/** Upgrade a weapon. At tier 2 -> 3 pass the chosen branch ('a' | 'b'). Tier 4 keeps the tier-3 branch; tier 5 picks k|g|v (Kroll/Gorgo/Voltaro), tier 6: v (nur aus 5v) oder x (Sprenger, aus jedem Stufe-5-Ast). */
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
  save.weapons[type] = { tier: opt.tier, branch: opt.tier === 4 ? w.branch : opt.branch }; // 5: k|g|v, 6: v|x
  save.stats.crafted = (save.stats.crafted ?? 0) + 1;
  return { ok: true, tier: opt.tier, branch: save.weapons[type].branch, name: opt.name };
}

// ---- Waffenlager: mehrere Waffen je Typ. save.weapons[type] = aktive (wird geschmiedet/getragen), save.armory = weitere im Lager.
export const NEW_WEAPON_COST = { schrott: 150 };
const sameW = (a, b) => a.type === b.type && a.tier === b.tier && (a.branch ?? null) === (b.branch ?? null);
/** Alle Waffen: aktive je Typ zuerst, dann das Lager. [{type, tier, branch, active, idx(Lager-Index|-1), name}] */
export function ownedWeaponList(save, type = null) {
  const out = [];
  for (const [t, w] of Object.entries(save.weapons)) if (!type || t === type) out.push({ type: t, tier: w.tier, branch: w.branch, active: true, idx: -1 });
  (save.armory ?? []).forEach((w, i) => { if (!type || w.type === type) out.push({ ...w, active: false, idx: i }); });
  for (const w of out) w.name = weaponStats(w.type, w.tier, w.branch).name;
  return out;
}

/** Neue Stufe-1-Waffe bauen: die bisherige aktive Waffe des Typs wandert ins Lager, die neue ist aktiv (und wird gleich ausgerüstet). */
export function buildNewWeapon(save, type) {
  const w = save.weapons[type];
  if (!w) return { ok: false, reason: 'unknown' };
  save.armory ??= [];
  if (save.armory.length >= ARMORY_MAX) return { ok: false, reason: 'armory_full' };
  const m = missing(save, NEW_WEAPON_COST);
  if (m.length) return { ok: false, reason: 'mats', missing: m };
  pay(save, NEW_WEAPON_COST);
  save.armory.push({ type, tier: w.tier, branch: w.branch ?? null });
  save.weapons[type] = { tier: 1, branch: null };
  save.loadout.weapon = type;
  save.stats.crafted = (save.stats.crafted ?? 0) + 1;
  return { ok: true, name: weaponStats(type, 1).name };
}

/** Lager-Waffe idx zur aktiven Waffe ihres Typs machen (Tausch) und ausrüsten. */
export function swapWeapon(save, idx) {
  const w = save.armory?.[idx];
  if (!w) return { ok: false, reason: 'unknown' };
  const cur = save.weapons[w.type];
  save.armory[idx] = { type: w.type, tier: cur.tier, branch: cur.branch ?? null };
  save.weapons[w.type] = { tier: w.tier, branch: w.branch ?? null };
  save.loadout.weapon = w.type;
  return { ok: true, name: weaponStats(w.type, w.tier, w.branch).name };
}

/** Waffe {type,tier,branch} tragen: aktive -> nur ausrüsten, Lager -> tauschen. */
export function equipWeaponState(save, ws) {
  const cur = save.weapons[ws.type];
  if (!cur) return { ok: false, reason: 'unknown' };
  if (sameW({ type: ws.type, ...cur }, ws)) { save.loadout.weapon = ws.type; return { ok: true }; }
  const idx = (save.armory ?? []).findIndex((w) => sameW(w, ws));
  return idx < 0 ? { ok: false, reason: 'unknown' } : swapWeapon(save, idx);
}

/** Lager-Waffe verschrotten (+ ein bisschen Schrott zurück). Aktive Waffen kann man nicht verschrotten. */
export const scrapValue = (w) => 20 * w.tier;
export function scrapWeapon(save, idx) {
  const w = save.armory?.[idx];
  if (!w) return { ok: false, reason: 'unknown' };
  save.armory.splice(idx, 1);
  addSchrott(save, scrapValue(w));
  return { ok: true, schrott: scrapValue(w), name: weaponStats(w.type, w.tier, w.branch).name };
}

/** Rüstungsteil jetzt schmiedbar (noch nicht im Besitz, alle Materialien da)? Prüfung + fehlende Mats. */
export function canCraftArmor(save, pieceId) {
  const p = ARMOR_PIECES[pieceId];
  if (!p) return { ok: false, reason: 'unknown' };
  if (save.armorOwned[pieceId] || !p.cost) return { ok: false, reason: 'owned' };
  const m = missing(save, p.cost);
  if (m.length) return { ok: false, reason: 'mats', missing: m };
  return { ok: true };
}

/** Nächste Waffenstufe dieses Typs jetzt bezahlbar? (mind. eine Option mit ok) */
export const canUpgradeWeapon = (save, type) => weaponUpgradeOptions(save, type).some((o) => o.ok);

export function craftArmor(save, pieceId) {
  const p = ARMOR_PIECES[pieceId];
  const can = canCraftArmor(save, pieceId);
  if (!can.ok) return can;
  pay(save, p.cost);
  save.armorOwned[pieceId] = true;
  save.stats.crafted = (save.stats.crafted ?? 0) + 1;
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
