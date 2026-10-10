// Jägerrang, quest unlocks, reward building/application (pure).
import { getQuest } from '../data/quests.js';
import { rollReward, rollBreak } from '../data/drops.js';
import { boxAddAll, boxRemove, addSchrott } from './inventory.js';

export const MAX_JR = 4;

export const questUnlocked = (save, quest) => save.jr >= (quest.jr ?? 1);

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
export function buildRewards({ quest, result, gathered = {}, carved = {}, breaks = [], used = {}, rng }) {
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
  return { quest: quest.id, result, schrott: win ? quest.reward : 0, items, parts, used: { ...used } };
}

/**
 * Apply rewards + progression to the save. Idempotence is the caller's job (call once per hunt).
 * -> { schrott, added, sold, overflowSchrott, jrUp: newJr|null, firstClear }
 */
export function applyHuntResult(save, quest, rewards, info = {}) {
  for (const [id, n] of Object.entries(rewards.used ?? {})) boxRemove(save, id, Math.min(n, save.box[id] ?? 0));
  const r = boxAddAll(save, rewards.items ?? {});
  addSchrott(save, rewards.schrott ?? 0);
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
  return { schrott: rewards.schrott ?? 0, added: r.added, sold: r.sold, overflowSchrott: r.schrott, jrUp, firstClear };
}

export const questById = getQuest;
