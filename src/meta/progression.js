// Jägerrang, quest unlocks, reward building/application (pure).
import { getQuest, RANK_RP } from '../data/quests.js';
import { rollReward, rollBreak } from '../data/drops.js';
import { boxAddAll, boxRemove, addSchrott } from './inventory.js';
import { BESTIARY } from '../data/compendium.js';
import { applyChestResult } from './huntChest.js';
import { recordGlitchWin } from './endgame.js';
import { isTierQuest } from '../data/glitchTiers.js';

export const MAX_JR = 14;

/** Jägerrang-Stufen: Schlüssel-Aufträge (quest.jrUp = Rang) + Rang-Punkte-Schwelle (save.rp). */
export const RANKS = [
  { jr: 2, keys: ['jaggo'], rp: RANK_RP[2] },
  { jr: 3, keys: ['barrotz'], rp: RANK_RP[3] },
  { jr: 4, keys: ['brathalos'], rp: RANK_RP[4] },
  { jr: 5, keys: ['revierstreit'], rp: RANK_RP[5] },
  { jr: 6, keys: ['kroll', 'gorgo'], rp: RANK_RP[6] },
  { jr: 7, keys: ['voltaro'], rp: RANK_RP[7] },
  { jr: 8, keys: ['blendax'], rp: RANK_RP[8] },
  { jr: 9, keys: ['mampfaffe'], rp: RANK_RP[9] },
  { jr: 10, keys: ['krachfaust'], rp: RANK_RP[10] },
  { jr: 11, keys: ['pyrostur'], rp: RANK_RP[11] },
  { jr: 12, keys: ['felsengroll'], rp: RANK_RP[12] },
  { jr: 13, keys: ['voltiris'], rp: RANK_RP[13] },
  { jr: 14, keys: ['gockelok'], rp: RANK_RP[14] },
];
export const isKeyQuest = (quest, save) => !!quest.jrUp && (!save || quest.jrUp > save.jr);

/** null wenn annehmbar, sonst { reason: 'jr'|'rp', need } (jr: nötiger Rang, rp: fehlende Rang-Punkte). */
export function questLock(save, quest) {
  const need = quest.jr ?? 1;
  if (save.jr < need) return { reason: 'jr', need };
  if (quest.jrUp && quest.jrUp > save.jr) {
    const t = RANK_RP[quest.jrUp] ?? 0;
    if ((save.rp ?? 0) < t) return { reason: 'rp', need: t - (save.rp ?? 0) };
  }
  return null;
}
export const questUnlocked = (save, quest) => !questLock(save, quest);

const openKeys = (save) => RANKS.flatMap((r) => r.keys).filter((k) => { const q = getQuest(k); return isKeyQuest(q, save) && !questLock(save, q); });

/** Fortschritt zum nächsten Rang: { jr, rp, next: {jr, rp, keys}|null, keysOpen } */
export function rankProgress(save) {
  const next = RANKS.find((r) => r.jr > save.jr) ?? null;
  return { jr: save.jr, rp: save.rp ?? 0, next };
}

/** Merge helper: add n of id to a plain {id:n} map. */
export function bump(map, id, n = 1) {
  if (n > 0) map[id] = (map[id] ?? 0) + n;
  return map;
}

/**
 * Collect everything a finished hunt pays out.
 *  quest, result ('win'|'fail'), gathered/carved: {id:n} maps, breaks: [partId...] (part breaks seen),
 *  used: {id:n} consumables spent from the box, rng: seeded rng for the drop rolls.
 * Failure keeps only what was gathered. Gather quests hand in the target items on success.
 */
export function buildRewards({ quest, result, gathered = {}, carved = {}, breaks = [], used = {}, chest = null, rng, rpMul = 1 }) {
  const win = result === 'win';
  const matMul = quest.matMul ?? 1;
  const parts = { gathered: { ...gathered }, carved: win ? { ...carved } : {}, breaks: {}, reward: {}, handedIn: {} };
  if (win) {
    for (const partId of breaks) for (const d of rollBreak(quest.monster, partId, rng, { matMul })) bump(parts.breaks, d.id, d.n);
    if (quest.monster) for (const d of rollReward(quest.monster, rng, { matMul })) bump(parts.reward, d.id, d.n);
    if (quest.type === 'gather' && quest.gather) {
      const have = parts.gathered[quest.gather.id] ?? 0;
      const give = Math.min(have, quest.gather.n);
      parts.gathered[quest.gather.id] = have - give;
      if (!parts.gathered[quest.gather.id]) delete parts.gathered[quest.gather.id];
      parts.handedIn[quest.gather.id] = give;
    }
  }
  const items = {};
  for (const m of [parts.gathered, parts.carved, parts.breaks, parts.reward]) for (const [id, n] of Object.entries(m)) bump(items, id, n);
  return { quest: quest.id, result, schrott: win ? quest.reward : 0, rp: win ? Math.round((quest.rp ?? 0) * rpMul) : 0, items, parts, used: { ...used }, chest: chest ?? null };
}

/**
 * Jagd vorzeitig verlassen (Pause "Verlassen", Host weg, ...): kein Ergebnis-Bildschirm, aber Verbrauchtes (Spitzen, Tränke) wird
 * abgebucht, Truhen-Aenderungen und Gesammeltes bleiben erhalten. Sonst kaemen verschossene Spitzen in der Stadt zurueck.
 */
export function applyHuntLeave(save, { used = {}, gathered = {}, chest = null } = {}) {
  applyChestResult(save, chest);
  for (const [id, n] of Object.entries(used)) boxRemove(save, id, Math.min(n, save.box[id] ?? 0));
  boxAddAll(save, gathered);
}

/**
 * Apply rewards + progression to the save. Idempotence is the caller's job (call once per hunt).
 * -> { schrott, added, sold, overflowSchrott, jrUp: newJr|null, firstClear }
 */
export function applyHuntResult(save, quest, rewards, info = {}) {
  applyChestResult(save, rewards.chest); // camp chest: crafted/spent stock + gear first, so crafted-and-used items net out
  for (const [id, n] of Object.entries(rewards.used ?? {})) boxRemove(save, id, Math.min(n, save.box[id] ?? 0));
  const r = boxAddAll(save, rewards.items ?? {});
  addSchrott(save, rewards.schrott ?? 0);
  const rpBefore = save.rp ?? 0, openBefore = openKeys(save);
  if (rewards.result === 'win') save.rp = Math.min(1e9, rpBefore + Math.max(0, Math.floor(rewards.rp ?? 0)));
  save.stats.hunts++;
  // Kompendium: jeder Kampf gegen einen Brocken zählt (auch verloren)
  save.fights ??= {};
  const book = [];
  if (quest.type === 'hunt' && !quest.hidden) for (const id of new Set([quest.monster, ...(quest.monsters ?? []).map((x) => x.id)].filter(Boolean))) {
    const before = save.fights[id] ?? 0, after = Math.min(99999, before + 1);
    save.fights[id] = after;
    const b = BESTIARY.find((x) => x.id === id);
    if (b) for (const e of b.entries) if (e.at > before && e.at <= after) book.push({ monster: b.name, name: e.name });
  }
  let jrUp = null, firstClear = false, glitch = null, best = null;
  if (rewards.result === 'win') {
    save.stats.wins++;
    const variant = !!(quest.glitchTier || quest.weekly); // Glitch-Stufe/Wochen-Glitch: eigene Bestzeiten, nie Rang-Aufstieg
    firstClear = !variant && !save.clears[quest.id];
    save.clears[quest.id] = (save.clears[quest.id] ?? 0) + 1;
    const firstKill = !!quest.monster && !(save.kills[quest.monster] > 0);
    if (quest.monster) save.kills[quest.monster] = (save.kills[quest.monster] ?? 0) + 1;
    const t = Math.floor(Number(info.time));
    if (variant) {
      glitch = recordGlitchWin(save, quest, t);
      if (glitch.tier > 0 && glitch.time > 0) best = { tier: glitch.tier, time: glitch.time, prev: glitch.prevBest, isNew: glitch.newBest };
    } else {
      if (firstKill && isTierQuest(quest)) glitch = { tier: 0, splitter: 0, weeklyBonus: 0, unlocked: 1, award: null }; // erster Sieg gegen diesen Brocken: Glitch-Stufe 1 offen
      if (t > 0) { const prev = save.best[quest.id] ?? null; best = { tier: 0, time: t, prev, isNew: !prev || t < prev }; if (best.isNew) save.best[quest.id] = t; }
      if (quest.jrUp && save.jr < quest.jrUp) { save.jr = Math.min(MAX_JR, quest.jrUp); jrUp = save.jr; }
    }
  } else save.stats.fails++;
  const st = save.stats;
  st.playtime += Math.max(0, Math.min(86400, Math.floor(Number(info.time) || 0)));
  st.kos += Math.max(0, Math.floor(Number(info.kos) || 0));
  st.carves += Math.max(0, Math.floor(Number(info.carves) || 0));
  st.glitch += Math.max(0, Math.floor(Number(info.glitch) || 0));
  save.meal = null; // one meal per hunt
  return { schrott: rewards.schrott ?? 0, added: r.added, sold: r.sold, overflowSchrott: r.schrott, jrUp, firstClear, rp: (save.rp ?? 0) - rpBefore, glitch, best, keyOpen: openKeys(save).filter((k) => !openBefore.includes(k)), book };
}

export const questById = getQuest;
