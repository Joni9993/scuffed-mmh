// Wöchentliche Feldstudie (GDD 16.8): Datum = Seed. Gleiche ISO-Kalenderwoche -> gleicher Auftrag (Brocken, 2 Mutatoren, Seed).
import { createRng } from '../core/rng.js';
import { quests, setFieldStudyQuest, MONSTER_RP } from '../data/quests.js';
import { MUTATOR_ORDER, resolveMods } from '../data/mutators.js';
import { getMonsterDef } from '../game/monsters/index.js';

export const FIELDSTUDY_ID = 'feldstudie';
const BASE = [['jaggo', 1, 300], ['barrotz', 2, 500], ['brathalos', 3, 800]]; // [Brocken, JR, Basis-Schrott]
const EXTRA = ['kroll', 'gorgo', 'voltaro']; // nur falls im Monster-Register vorhanden
const BONUS = 1.5, MAT_BONUS = 1.25;
const BEST_KEY = 'gh_fieldstudy_best';

const has = (id) => { try { return !!getMonsterDef(id); } catch { return false; } };

/** ISO-8601-Kalenderwoche: { year, week } (Jahr der Woche, nicht des Datums). */
export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // Donnerstag der Woche
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return { year, week };
}
export const weekKey = (date) => { const { year, week } = isoWeek(date); return `${year}-W${String(week).padStart(2, '0')}`; };

/** Deterministischer Wochenauftrag. */
export function currentFieldStudy(date = new Date()) {
  const { year, week } = isoWeek(date);
  const rng = createRng(year * 100 + week);
  rng(); rng();
  const pool = BASE.map(([id, jr, reward]) => ({ id, jr, reward, world: 'schotterklamm' }));
  for (const id of EXTRA) if (has(id)) pool.push({ id, jr: 4, reward: 1000, world: 'rostwerke' });
  const b = pool[Math.floor(rng() * pool.length)];
  const ids = [...MUTATOR_ORDER], mutators = [];
  while (mutators.length < 2) mutators.push(ids.splice(Math.floor(rng() * ids.length), 1)[0]);
  const seed = 2 + Math.floor(rng() * 1e9);
  return { key: weekKey(date), year, week, monster: b.id, jr: b.jr, world: b.world, mutators, seed, reward: Math.round(b.reward * BONUS) };
}

/** Quest-Objekt (Format data/quests.js) zur Feldstudie. */
export function fieldStudyQuest(date = new Date()) {
  const f = currentFieldStudy(date);
  return {
    id: FIELDSTUDY_ID, name: `Feldstudie KW ${f.week}`, type: 'hunt', monster: f.monster, world: f.world, timeLimit: 20 * 60, reward: f.reward, jr: f.jr,
    rp: Math.round((MONSTER_RP[f.monster] ?? 60) * BONUS * resolveMods(f.mutators).reward),
    mutators: f.mutators, fixedSeed: f.seed, fieldStudy: f.key, matMul: Math.round(resolveMods(f.mutators).reward * MAT_BONUS * 1000) / 1000,
    desc: 'Wochenauftrag: gleicher Brocken, gleiche Mutatoren, gleicher Seed für alle. Bestzeit zählt. +50 % Schrott.',
  };
}

/** Feldstudie dieser Woche im Quest-Register anmelden (idempotent). */
export function registerFieldStudy(date = new Date()) {
  const q = fieldStudyQuest(date);
  if (quests[FIELDSTUDY_ID]?.fieldStudy !== q.fieldStudy) setFieldStudyQuest(q);
  return quests[FIELDSTUDY_ID];
}

// ---- Bestzeit pro Woche (lokal)
const st = (store) => store ?? globalThis.localStorage;
function readBest(store) { try { return JSON.parse(st(store).getItem(BEST_KEY) || '{}') || {}; } catch { return {}; } }
export function getBestTime(key = weekKey(), store) { const t = readBest(store)[key]; return typeof t === 'number' ? t : null; }
/** Zeit (s) eintragen; true wenn neue Bestzeit. */
export function recordBestTime(key, seconds, store) {
  if (!(seconds > 0)) return false;
  const all = readBest(store), old = all[key];
  if (typeof old === 'number' && old <= seconds) return false;
  all[key] = Math.round(seconds * 10) / 10;
  try { st(store).setItem(BEST_KEY, JSON.stringify(all)); } catch { return false; }
  return true;
}

registerFieldStudy();
