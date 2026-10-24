// Wochen-Glitch (docs/ENDGAME.md): aus dem Kalenderdatum deterministisch, kein Server.
// Pro ISO-Woche 1 Brocken + feste Kombi aus 4 Mutatoren (+ Bonus-Splitter beim ersten Sieg der Woche, siehe meta/endgame.js).
import { createRng } from '../core/rng.js';
import { quests } from '../data/quests.js';
import { MUTATOR_ORDER, GLITCH_MUTATOR_ORDER } from '../data/mutators.js';
import { tierQuestIds, glitchQuest, weekSeed } from '../data/glitchTiers.js';
import { isoWeek, weekKey } from './fieldstudy.js';

export const WEEKLY_COUNT = 4;
const POOL = [...MUTATOR_ORDER, ...GLITCH_MUTATOR_ORDER];
const CLASH = [['timeout', 'redundanz']]; // Zeitlimit -30 % und +20 % Leben zusammen wäre kein Spiel mehr

/** { key, year, week, questId (Basis-Auftrag), monster, mutators:[4], seed } – gleiche Woche = gleiches Ergebnis. */
export function weeklyGlitch(date = new Date()) {
  const { year, week } = isoWeek(date), key = weekKey(date);
  const rng = createRng(year * 100 + week + 424242);
  rng(); rng();
  const ids = tierQuestIds();
  const questId = ids[Math.floor(rng() * ids.length)];
  const pool = [...POOL], mutators = [];
  while (mutators.length < WEEKLY_COUNT) {
    const pick = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    if (CLASH.some(([a, b]) => (pick === a && mutators.includes(b)) || (pick === b && mutators.includes(a)))) continue;
    mutators.push(pick);
  }
  return { key, year, week, questId, monster: quests[questId].monster, mutators, seed: weekSeed(key) };
}

/** Auftrag fürs Brett (Anzeige/Posten): Basis-Auftrag mit festen Mutatoren, `weekly` = Wochenschlüssel. */
export function weeklyQuest(date = new Date()) {
  const w = weeklyGlitch(date), base = quests[w.questId];
  const { quest } = glitchQuest(base, { weekly: w.key, mutators: w.mutators });
  return { ...quest, id: 'wochenglitch', baseId: base.id, name: `Wochen-Glitch KW ${w.week}`, desc: `${base.name}: ${w.mutators.length} feste Mutatoren, Beute x2,5. Der erste Sieg der Woche gibt Bonus-Splitter.` };
}
