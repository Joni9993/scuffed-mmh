// [G] Gear look data (GDD 8.6): visual tier per armor set + compact gear codes for the network. Pure (no THREE).
import { DEFAULT_ARMOR, SLOTS, getPiece } from './armor.js';
import { WEAPON_TYPES } from './weapons.js';

/** Order of the code letters (a..f). Append only (wire format). */
export const GEAR_SETS = ['lumpen', 'fellkluft', 'knochenkram', 'jaggo', 'barrotz', 'brathalos', 'kroll', 'gorgo', 'voltaro'];
/** Visual escalation: 0 = rags ... 4 = Brathalos, 5 = Kroll/Gorgo, 6 = Voltaro (alle >= 4: Aura/Glühen). */
export const SET_TIER = { lumpen: 0, fellkluft: 1, knochenkram: 1, jaggo: 2, barrotz: 3, brathalos: 4, kroll: 5, gorgo: 5, voltaro: 6 };
const WCHAR = { gs: 'g', db: 'd', bow: 'b', kt: 'k' };
const WTYPE = { g: 'gs', d: 'db', b: 'bow', k: 'kt' };
/** Waffen-Ast je Stufe: 3 = a|b (Jaggo/Barrotz), 5 = k|g|v (Kroll/Gorgo/Voltaro), 6 = v, sonst null. */
export function gearBranch(tier, branch) {
  if (tier === 3) return branch === 'b' ? 'b' : 'a';
  if (tier === 5) return branch === 'g' || branch === 'v' ? branch : 'k';
  if (tier === 6) return 'v';
  return null;
}

export const setTier = (set) => SET_TIER[set] ?? 0;
export const pieceSet = (id) => getPiece(id)?.set ?? 'lumpen';
/** { head, body, legs } piece ids -> { head, body, legs } set ids */
export function armorSets(armor = DEFAULT_ARMOR) {
  const o = {};
  for (const s of SLOTS) o[s] = pieceSet(armor?.[s] ?? DEFAULT_ARMOR[s]);
  return o;
}

/** Normalised gear: { weapon:{type,tier,branch}, armor:{head,body,legs}, color } */
export function makeGear({ weapon, armor, color } = {}) {
  const w = weapon ?? {};
  const type = WEAPON_TYPES[w.type] ? w.type : 'gs';
  const tier = Math.min(6, Math.max(1, Math.round(w.tier ?? 1)));
  const a = {};
  for (const s of SLOTS) a[s] = getPiece(armor?.[s])?.slot === s ? armor[s] : DEFAULT_ARMOR[s];
  return { weapon: { type, tier, branch: gearBranch(tier, w.branch) }, armor: a, color: color ?? '#3f8a4a' };
}

/** 7 chars: weapon letter, tier digit, branch (a|b|-), head/body/legs set letters, colour index digit. e.g. "g3bdeb2" */
export function encodeGear(g, colorIdx = 0) {
  const x = makeGear(g);
  const sets = armorSets(x.armor);
  const L = (set) => String.fromCharCode(97 + Math.max(0, GEAR_SETS.indexOf(set)));
  return `${WCHAR[x.weapon.type]}${x.weapon.tier}${x.weapon.branch ?? '-'}${L(sets.head)}${L(sets.body)}${L(sets.legs)}${Math.max(0, Math.min(9, colorIdx | 0))}`;
}
/** -> { weapon, armor, colorIdx } or null when malformed (callers fall back to what they had). */
export function decodeGear(code) {
  if (typeof code !== 'string' || code.length < 6) return null;
  const type = WTYPE[code[0]], tier = Number(code[1]);
  if (!type || !(tier >= 1 && tier <= 6)) return null;
  const armor = {};
  for (let i = 0; i < 3; i++) {
    const set = GEAR_SETS[code.charCodeAt(3 + i) - 97];
    if (!set) return null;
    armor[SLOTS[i]] = `${set}_${SLOTS[i]}`;
  }
  return { weapon: { type, tier, branch: gearBranch(tier, code[2]) }, armor, colorIdx: Number(code[6]) || 0 };
}

/** Tier scale used by builders: bigger add-ons for higher tiers. */
export const tierScale = (tier) => 1 + 0.16 * tier;
/** Which fx the outfit earns: aura with >=2 top-tier pieces; embers with any top-tier piece; visor glow from the head piece tier. */
export function gearFxLevel(g) {
  const x = makeGear(g), sets = armorSets(x.armor);
  const tiers = SLOTS.map((s) => setTier(sets[s]));
  const top = tiers.filter((t) => t >= 4).length;
  return { top, aura: top >= 2, embers: top >= 1, visor: tiers[0], tiers, sets };
}
