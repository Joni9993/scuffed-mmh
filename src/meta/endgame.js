// Endgame-Logik auf dem Speicherstand (rein): Glitch-Stufen freischalten, Bestzeiten, Splitter, Übertaktung (docs/ENDGAME.md).
import { ARMOR_PIECES } from '../data/armor.js';
import { WEAPON_TYPES } from '../data/weapons.js';
import { MAX_TIER, cleanTier, splitterForWin, WEEKLY_TIER, WEEKLY_BONUS, cleanOc, ocCost, tierMonsters } from '../data/glitchTiers.js';
import { MAX_SPLITTER } from './save.js';

const ensure = (save) => { save.glitch ??= { cleared: {}, best: {}, splitter: 0, weekly: '' }; save.oc ??= { weapons: {}, armor: {} }; return save; };

/** Höchste wählbare Stufe für einen Brocken: 0 solange er nie besiegt wurde, sonst (geschaffte Stufe + 1), max. 10. */
export function tierUnlocked(save, monsterId) {
  if (!monsterId || !(save.kills?.[monsterId] > 0)) return 0;
  return Math.min(MAX_TIER, cleanTier(save.glitch?.cleared?.[monsterId]) + 1);
}
export const tierClearedOf = (save, monsterId) => cleanTier(save.glitch?.cleared?.[monsterId]);
/** Bestzeit (s) für Brocken x Stufe; Stufe 0 = normaler Auftrag (save.best). null wenn keine. */
export function bestTime(save, quest, tier = 0) {
  const t = cleanTier(tier);
  const v = t === 0 ? save.best?.[quest.id] : save.glitch?.best?.[quest.monster]?.[t];
  return v > 0 ? v : null;
}
/** Wie viele Brocken schon auf mindestens Stufe n geschafft wurden (für Auszeichnungen/Spiegel). */
export const monstersClearedAt = (save, tier) => tierMonsters().filter((m) => cleanTier(save.glitch?.cleared?.[m]) >= tier).length;

export const addSplitter = (save, n) => { ensure(save); save.glitch.splitter = Math.min(MAX_SPLITTER, Math.max(0, save.glitch.splitter + Math.floor(n))); return save.glitch.splitter; };

/**
 * Sieg auf einer Stufen-/Wochen-Jagd verbuchen (Sieger lokal, auch Gäste ohne eigene Freischaltung).
 * -> { tier, splitter, weeklyBonus, newBest, prevBest, time, unlocked: neue Stufe|null, award: 5|10|null }
 */
export function recordGlitchWin(save, quest, time) {
  ensure(save);
  const tier = cleanTier(quest.glitchTier), out = { tier, splitter: 0, weeklyBonus: 0, newBest: false, prevBest: null, time: 0, unlocked: null, award: null };
  if (!quest.monster) return out;
  const t = Math.floor(Number(time));
  if (tier > 0) {
    const before = tierUnlocked(save, quest.monster);
    save.glitch.cleared[quest.monster] = Math.max(save.glitch.cleared[quest.monster] ?? 0, tier);
    const after = tierUnlocked(save, quest.monster);
    if (after > before) out.unlocked = after;
    out.award = tier >= 10 ? 10 : tier >= 5 ? 5 : null;
    out.splitter = splitterForWin(tier);
    if (t > 0) {
      const m = (save.glitch.best[quest.monster] ??= {}), old = m[tier];
      out.time = t; out.prevBest = old ?? null;
      if (!old || t < old) { m[tier] = t; out.newBest = true; }
    }
  } else if (quest.weekly) {
    out.splitter = splitterForWin(WEEKLY_TIER);
    if (save.glitch.weekly !== quest.weekly) { save.glitch.weekly = quest.weekly; out.weeklyBonus = WEEKLY_BONUS; }
    if (t > 0) out.time = t;
  }
  out.splitter += out.weeklyBonus;
  addSplitter(save, out.splitter);
  return out;
}

// ---- Übertaktung
export const ocOfWeapon = (save, type) => cleanOc(save.oc?.weapons?.[type]);
export const ocOfPiece = (save, id) => cleanOc(save.oc?.armor?.[id]);
/** Kopie für das Loadout: { weapons:{typ:n}, armor:{teil:n} } */
export const ocSnapshot = (save) => ({ weapons: { ...(save.oc?.weapons ?? {}) }, armor: { ...(save.oc?.armor ?? {}) } });

/** Waffentyp übertakten (+1). -> { ok, level, cost } | { ok:false, reason: 'unknown'|'maxed'|'splitter' } */
export function overclockWeapon(save, type) {
  ensure(save);
  if (!WEAPON_TYPES[type]) return { ok: false, reason: 'unknown' };
  const cur = ocOfWeapon(save, type), cost = ocCost('weapon', cur);
  if (cost === null) return { ok: false, reason: 'maxed' };
  if (save.glitch.splitter < cost) return { ok: false, reason: 'splitter', cost };
  save.glitch.splitter -= cost;
  save.oc.weapons[type] = cur + 1;
  return { ok: true, level: cur + 1, cost };
}
/** Rüstungsteil übertakten (+1); nur eigene Teile. */
export function overclockArmor(save, pieceId) {
  ensure(save);
  if (!ARMOR_PIECES[pieceId]) return { ok: false, reason: 'unknown' };
  if (!save.armorOwned?.[pieceId]) return { ok: false, reason: 'not_owned' };
  const cur = ocOfPiece(save, pieceId), cost = ocCost('armor', cur);
  if (cost === null) return { ok: false, reason: 'maxed' };
  if (save.glitch.splitter < cost) return { ok: false, reason: 'splitter', cost };
  save.glitch.splitter -= cost;
  save.oc.armor[pieceId] = cur + 1;
  return { ok: true, level: cur + 1, cost };
}
