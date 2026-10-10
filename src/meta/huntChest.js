// Camp chest (Lager-Truhe) inside a hunt. Pure ledger on top of the hunt inventory; the save is only touched at hunt end
// (applyChestResult, called from applyHuntResult) so a closed tab mid-hunt loses/duplicates nothing.
//   physical box now  = save.box + delta            (delta = net of crafted outputs and spent materials)
//   available to take = save.box + delta - inv.brought0   (what is already carried is still physically in the box until used)
// Taking raises brought/brought0 like a loadout item would; putting back lowers both (spent count stays). At the end:
//   box += delta (adds first), then the normal `used` deduction, so a crafted+taken+used item nets out to 0.
import { ITEMS, BOX_MAX, isCarryable } from '../data/items.js';
import { RECIPES } from '../data/recipes.js';
import { SLOTS, ARMOR_PIECES } from '../data/armor.js';

export class HuntChest {
  /** save: the live save (read only), inv: HuntInventory, loadout: the loadout the hunt runs with (weapon/armor), hooks: { inCombat(): bool, apply(loadout) } */
  constructor(save, inv, loadout, hooks = {}) {
    this.save = save;
    this.inv = inv;
    this.delta = {};
    this.base = { ...loadout };
    this.weapon = { ...loadout.weapon };
    this.armor = { ...loadout.armor };
    this.gearChanged = false;
    this.hooks = hooks;
  }

  physical(id) { return (this.save.box[id] ?? 0) + (this.delta[id] ?? 0); } // live box: the save is untouched during the hunt
  /** how many of id can still be taken / used as craft ingredient right now */
  stock(id) { return Math.max(0, this.physical(id) - (this.inv.brought0[id] ?? 0)); }
  carried(id) { return this.inv.count(id); }
  /** carry room left for id */
  room(id) { return isCarryable(id) ? Math.max(0, ITEMS[id].max - this.inv.count(id)) : 0; }

  take(id, n = 1) {
    if (!isCarryable(id)) return { ok: false, reason: 'unknown' };
    if (this.stock(id) <= 0) return { ok: false, reason: 'none' };
    if (this.room(id) <= 0) return { ok: false, reason: 'carry_full' };
    const k = this.inv.bring(id, Math.min(n, this.stock(id)));
    return k > 0 ? { ok: true, n: k } : { ok: false, reason: 'bar_full' };
  }
  takeMax(id) { return this.take(id, 999); }

  putBack(id, n = 1) {
    const k = this.inv.unbring(id, n);
    return k > 0 ? { ok: true, n: k } : { ok: false, reason: 'not_carried' };
  }

  canCraft(id) {
    const r = RECIPES[id];
    if (!r) return { ok: false, reason: 'unknown' };
    const miss = Object.entries(r.cost).filter(([c, need]) => this.stock(c) < need).map(([c, need]) => ({ id: c, need, have: this.stock(c) }));
    if (miss.length) return { ok: false, reason: 'mats', missing: miss };
    if (this.physical(id) + r.out - Object.entries(r.cost).reduce((s, [c, k]) => s + (c === id ? k : 0), 0) > BOX_MAX) return { ok: false, reason: 'full' };
    return { ok: true };
  }

  craft(id) {
    const can = this.canCraft(id);
    if (!can.ok) return can;
    const r = RECIPES[id];
    for (const [c, need] of Object.entries(r.cost)) this.#bump(c, -need);
    this.#bump(id, r.out);
    return { ok: true, id, n: r.out };
  }

  #bump(id, d) {
    const v = (this.delta[id] ?? 0) + d;
    if (v) this.delta[id] = v; else delete this.delta[id];
  }

  // ---- gear
  ownedWeapons() { return Object.keys(this.save.weapons); }
  ownedArmor(slot) { return Object.keys(this.save.armorOwned).filter((id) => ARMOR_PIECES[id]?.slot === slot); }
  weaponState(type) { return this.save.weapons[type] ?? null; }

  setWeapon(type) {
    const w = this.save.weapons[type];
    if (!w) return { ok: false, reason: 'unknown' };
    if (type === this.weapon.type) return { ok: true, same: true };
    if (this.hooks.inCombat?.()) return { ok: false, reason: 'combat' };
    this.weapon = { type, tier: w.tier, branch: w.branch };
    this.gearChanged = true;
    this.hooks.apply?.(this.loadout());
    return { ok: true };
  }

  setArmor(pieceId) {
    const p = ARMOR_PIECES[pieceId];
    if (!p || !SLOTS.includes(p.slot)) return { ok: false, reason: 'unknown' };
    if (!this.save.armorOwned[pieceId]) return { ok: false, reason: 'not_owned' };
    if (this.armor[p.slot] === pieceId) return { ok: true, same: true };
    this.armor = { ...this.armor, [p.slot]: pieceId };
    this.gearChanged = true;
    this.hooks.apply?.(this.loadout());
    return { ok: true };
  }

  /** the loadout the hunt should run with right now (base loadout fields + chosen weapon/armor) */
  loadout() { return { ...this.base, weapon: { ...this.weapon }, armor: { ...this.armor } }; }
  /** payload for rewards.chest (applied once by applyHuntResult) */
  result() {
    return { delta: { ...this.delta }, loadout: this.gearChanged ? { weapon: this.weapon.type, armor: { ...this.armor } } : null };
  }
}

/** Apply rewards.chest to a save (called by applyHuntResult before the `used` deduction). Never creates items out of thin air:
 *  positive deltas were crafted from materials that the negative deltas remove; removals are clamped to what the box really holds. */
export function applyChestResult(save, chest) {
  if (!chest) return;
  for (const [id, d] of Object.entries(chest.delta ?? {})) {
    if (d > 0 && ITEMS[id]) save.box[id] = Math.min(BOX_MAX, (save.box[id] ?? 0) + d);
  }
  for (const [id, d] of Object.entries(chest.delta ?? {})) {
    if (d < 0) { const left = (save.box[id] ?? 0) + d; if (left > 0) save.box[id] = left; else delete save.box[id]; }
  }
  const lo = chest.loadout;
  if (lo) {
    if (save.weapons[lo.weapon]) save.loadout.weapon = lo.weapon;
    for (const slot of SLOTS) {
      const id = lo.armor?.[slot];
      if (id && save.armorOwned[id] && ARMOR_PIECES[id]?.slot === slot) save.loadout.armor[slot] = id;
    }
  }
}
