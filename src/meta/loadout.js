// Loadout builder + armor math (pure). Loadout = what the hunt receives:
// { name, weapon:{type,tier,branch}, armor:{head,body,legs}, items:[{id,n}], food }
import { ARMOR_PIECES, DEFAULT_ARMOR, SKILLS, SLOTS } from '../data/armor.js';
import { weaponStats } from '../data/weapons.js';
import { FOODS } from '../data/foods.js';
import { ITEMS } from '../data/items.js';
import { boxCount } from './inventory.js';

/** Damage reduction = prot / (prot + 80). */
export const damageReduction = (prot) => prot / (prot + 80);

/** Total protection of an armor set { head, body, legs } (piece ids). */
export function armorProtection(armor) {
  let sum = 0;
  for (const slot of SLOTS) sum += ARMOR_PIECES[armor?.[slot]]?.prot ?? 0;
  return sum;
}
/** Schutz inkl. Panzerhaut (+10 % bei 3 Teilen), gerundet. */
export const armorProtectionEff = (armor) => Math.round(armorProtection(armor) * skillEffects(armorSkills(armor)).protectMul);

/** Sum the Macken of all worn pieces, each capped at its max level. -> { skillId: level } */
export function armorSkills(armor) {
  const sum = {};
  for (const slot of SLOTS) {
    const p = ARMOR_PIECES[armor?.[slot]];
    if (!p) continue;
    for (const [id, lvl] of Object.entries(p.skills)) sum[id] = (sum[id] ?? 0) + lvl;
  }
  for (const id of Object.keys(sum)) sum[id] = Math.min(sum[id], SKILLS[id]?.max ?? sum[id]);
  return sum;
}

/** Gameplay numbers from skill levels (see player/hunt integration in game/loadout.js). */
export function skillEffects(skills = {}) {
  const lvl = (id) => skills[id] ?? 0;
  return {
    maxStamina: 15 * lvl('zaehe_socke'),
    flinkfuss: Math.min(2, lvl('flinkfuss')),
    flinchImmune: lvl('dickschaedel') >= 2,
    downImmune: lvl('dickschaedel') >= 3,
    crit: 0.08 * lvl('wuchtkopf'),
    fireResist: 1 - 0.8 ** lvl('hitzefell'),
    // Rostwerke-Macken (GDD 15.8)
    rustDurMul: 1 - (0.5 * lvl('panzerhaut')) / 3, // Status Rost: Dauer-Faktor (0.5 bei 3 Teilen)
    protectMul: 1 + (0.1 * lvl('panzerhaut')) / 3, // Schutz-Faktor (+10 % bei 3 Teilen)
    suctionImmune: lvl('wuehler') >= 2, // Gorgo-Sog
    windImmune: lvl('wuehler') >= 2, // Turbinen-Wind
    counterBuff: lvl('ueberladung') > 0 ? { atk: Math.round(5 * lvl('ueberladung')) / 100, dur: 8 } : null, // nach Glitch-Konter
    shockResist: 1 - 0.8 ** lvl('erdung'),
  };
}

/** Full set of effects from armor + meal. */
export function foodEffects(foodId) {
  const e = FOODS[foodId]?.effect ?? {};
  return { maxHp: e.maxHp ?? 0, maxStamina: e.maxStamina ?? 0, atk: e.atk ?? 0, resist: e.resist ?? 0, itemSpeed: e.itemSpeed ?? 0 };
}

/** Stats shown/used for a weapon state { type, tier, branch }. */
export const loadoutWeaponStats = (w) => weaponStats(w.type, w.tier, w.branch);

/** Build the loadout from the save (items clamped to what the box really holds). */
export function buildLoadout(save) {
  const type = save.loadout.weapon;
  const w = save.weapons[type] ?? { tier: 1, branch: null };
  const armor = { ...DEFAULT_ARMOR };
  for (const slot of SLOTS) {
    const id = save.loadout.armor[slot];
    if (id && save.armorOwned[id] && ARMOR_PIECES[id]?.slot === slot) armor[slot] = id;
  }
  const items = [];
  for (const e of save.loadout.items) {
    const def = ITEMS[e.id];
    const n = Math.min(e.n, def?.max ?? 0, boxCount(save, e.id));
    if (def && n > 0 && items.length < 8) items.push({ id: e.id, n });
  }
  return { name: save.name, color: save.color, weapon: { type, tier: w.tier, branch: w.branch }, armor, items, food: save.meal };
}

/** Standard gear for the debug URL (?scene=hunt) – no save involved. */
export function defaultLoadout({ weapon = 'gs', tier = 1, name = 'Pirscher' } = {}) {
  return { name, weapon: { type: weapon, tier, branch: null }, armor: { ...DEFAULT_ARMOR }, items: [], food: null, debug: true };
}
