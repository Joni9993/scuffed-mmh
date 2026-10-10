// Jägerrang, quest unlocks, reward building/application (pure).
import { getQuest, RANK_RP } from '../data/quests.js';
import { rollReward, rollBreak } from '../data/drops.js';
import { boxAddAll, boxRemove, addSchrott } from './inventory.js';
import { applyChestResult } from './huntChest.js';

export const MAX_JR = 7; // 2 Jaggo, 3 Barrotz, 4 Brathalos, 5 Revierstreit, 6 Kroll/Gorgo, 7 Voltaro

/** Jägerrang-Stufen: Schlüssel-Aufträge (quest.jrUp = Rang) + Rang-Punkte-Schwelle (save.rp). */
export const RANKS = [
  { jr: 2, keys: ['jaggo'], rp: RANK_RP[2] },
  { jr: 3, keys: ['barrotz'], rp: RANK_RP[3] },
  { jr: 4, keys: ['brathalos'], rp: RANK_RP[4] },
  { jr: 5, keys: ['revierstreit'], rp: RANK_RP[5] },
  { jr: 6, keys: ['kroll', 'gorgo'], rp: RANK_RP[6] },
  { jr: 7, keys: ['voltaro'], rp: RANK_RP[7] },
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
  let jrUp = null, firstClear = false;
  if (rewards.result === 'win') {
    save.stats.wins++;
    firstClear = !save.clears[quest.id];
    save.clears[quest.id] = (save.clears[quest.id] ?? 0) + 1;
    if (quest.monster) save.kills[quest.monster] = (save.kills[quest.monster] ?? 0) + 1;
    const t = Math.floor(Number(info.time));
    if (t > 0 && (!save.best[quest.id] || t < save.best[quest.id])) save.best[quest.id] = t;
    if (quest.jrUp && save.jr < quest.jrUp) { save.jr = Math.min(MAX_JR, quest.jrUp); jrUp = save.jr; }
  } else save.stats.fails++;
  const st = save.stats;
  st.playtime += Math.max(0, Math.min(86400, Math.floor(Number(info.time) || 0)));
  st.kos += Math.max(0, Math.floor(Number(info.kos) || 0));
  st.carves += Math.max(0, Math.floor(Number(info.carves) || 0));
  st.glitch += Math.max(0, Math.floor(Number(info.glitch) || 0));
  save.meal = null; // one meal per hunt
  return { schrott: rewards.schrott ?? 0, added: r.added, sold: r.sold, overflowSchrott: r.schrott, jrUp, firstClear, rp: (save.rp ?? 0) - rpBefore, keyOpen: openKeys(save).filter((k) => !openBefore.includes(k)) };
}

export const questById = getQuest;
