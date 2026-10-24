// Glitch-Stufen (Endgame-Schleife, docs/ENDGAME.md): pro Brocken-Auftrag wählbar 0-10, feste gestapelte Mutatoren + Beute.
// Reine Daten + reine Hilfsfunktionen (kein Speicherstand, kein DOM) – Netz, Hunt, Brett und Schmiede lesen von hier.
import { cleanTierMutatorIds } from './mutators.js';
import { quests } from './quests.js';

export const MAX_TIER = 10;

/**
 * Stufentabelle. Jede Stufe = feste, deterministische Mutatoren-Kombi (keine Duplikate je Stufe, Stufe 10 = 5) + Beute-Faktor.
 *  matMul     Material-Beute (ersetzt die Einzel-Boni der Mutatoren: sonst wären 5 gestapelte `reward`-Faktoren x3,7)
 *  payMul     Faktor auf Schrott und Rang-Punkte (1 + 0,1 je Stufe)
 * Fairness: Telegraph nie unter 0,5 s (attack.js klemmt) – einziger Telegraph-Mutator ist Hotfix (x0,85, nie gestapelt).
 */
const T = (tier, mutators, matMul) => ({ tier, mutators, matMul, payMul: Math.round((1 + 0.1 * tier) * 100) / 100 });
export const TIERS = [
  null, // Stufe 0 = normaler Auftrag
  T(1, ['overflow'], 1.2),
  T(2, ['speicherleck', 'null_zeiger'], 1.4),
  T(3, ['uebertaktet', 'schreibschutz'], 1.6),
  T(4, ['kein_undo', 'overflow', 'timeout'], 1.85),
  T(5, ['lag_spitze', 'downgrade', 'speicherleck'], 2.1),
  T(6, ['uebertaktet', 'redundanz', 'fehlende_texturen'], 2.4),
  T(7, ['overflow', 'kein_undo', 'null_zeiger', 'lag_spitze'], 2.7),
  T(8, ['speicherleck', 'hotfix', 'schreibschutz', 'timeout'], 3.0),
  T(9, ['uebertaktet', 'overflow', 'fehlende_texturen', 'redundanz'], 3.4),
  T(10, ['overflow', 'uebertaktet', 'hotfix', 'speicherleck', 'downgrade'], 4.0),
];

/** Ganze Stufe 0-10 (alles andere -> 0). */
export const cleanTier = (t) => { const n = Math.floor(Number(t)); return Number.isFinite(n) ? Math.min(MAX_TIER, Math.max(0, n)) : 0; };
export const tierInfo = (t) => TIERS[cleanTier(t)] ?? null;
/** Mutatoren-IDs einer Stufe (Kopie). Stufe 0 -> []. */
export const tierMutators = (t) => [...(tierInfo(t)?.mutators ?? [])];

/** Welche Aufträge haben Glitch-Stufen: echte Jagden auf einen Brocken (kein Sammeln, Training, Rotglut-Preset, Revierstreit, Feldstudie). */
export const isTierQuest = (q) => !!q && q.type === 'hunt' && !!q.monster && !q.hidden && !q.training && !q.variant && !q.multi && !q.fieldStudy && !q.glitchTier && !q.weekly;
/** Brocken, die Stufen haben (Reihenfolge = Bretter-Reihenfolge); Schlüssel = Brocken-ID. */
export const tierQuestIds = () => Object.values(quests).filter(isTierQuest).map((q) => q.id);
export const tierMonsters = () => tierQuestIds().map((id) => quests[id].monster);

// ---- Belohnung: Glitch-Splitter
export const SPLITTER_FACTOR = 4; // pro Sieg = Stufe x Faktor
export const WEEKLY_TIER = 6; // Wochen-Glitch zählt wie Stufe 6 (Splitter, Schrott, RP)
export const WEEKLY_BONUS = 40; // erster Wochen-Sieg
export const WEEKLY_MAT = 2.5;
export const splitterForWin = (tier) => cleanTier(tier) * SPLITTER_FACTOR;

// ---- Übertaktung (Schmiede): Zusatzwert im Speicherstand, +1...+5
export const OC_MAX = 5;
export const OC_WEAPON_POWER = 0.04; // +4 % Kraft je Stufe
export const OC_ARMOR_PROT = 0.05; // +5 % Schutz des Teils je Stufe
export const OC_COST_WEAPON = [20, 40, 70, 110, 160]; // Splitter für +1..+5 (zusammen 400)
export const OC_COST_ARMOR = [10, 20, 35, 55, 80]; // je Rüstungsteil (zusammen 200)
export const cleanOc = (n) => { const v = Math.floor(Number(n)); return Number.isFinite(v) ? Math.min(OC_MAX, Math.max(0, v)) : 0; };
export const ocPowerMul = (n) => 1 + OC_WEAPON_POWER * cleanOc(n);
export const ocProtMul = (n) => 1 + OC_ARMOR_PROT * cleanOc(n);
/** Kosten der nächsten Stufe (aktuell n -> n+1), null wenn voll. */
export const ocCost = (kind, n) => { const c = cleanOc(n); return c >= OC_MAX ? null : (kind === 'armor' ? OC_COST_ARMOR : OC_COST_WEAPON)[c]; };
export const ocLabel = (n) => (cleanOc(n) ? `+${cleanOc(n)}` : '');

// ---- Wochen-Glitch
const WEEK_RE = /^\d{4}-W\d{2}$/;
export const cleanWeekKey = (k) => (typeof k === 'string' && WEEK_RE.test(k) ? k : null);
/** Seed aus dem Wochenschlüssel (gleiche Zahl bei allen Mitspielern, unabhängig von deren Uhr). */
export function weekSeed(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return 2 + ((h >>> 0) % 1000000000);
}

/**
 * Brett-Auftrag bereinigen (Host, netz-sicher): { tier, weekly, mutators }.
 *  Stufe > 0 -> Mutatoren kommen aus der Tabelle, nie aus der Nachricht; Wochen-Glitch -> bis 5 bekannte IDs; sonst wie bisher max. 2.
 */
export function cleanPostGlitch(questId, msg = {}, cleanBase = (ids) => ids) {
  const q = quests[questId];
  if (!isTierQuest(q)) return { tier: 0, weekly: null, mutators: cleanBase(msg.mutators) };
  const tier = cleanTier(msg.tier);
  if (tier > 0) return { tier, weekly: null, mutators: tierMutators(tier) };
  const weekly = cleanWeekKey(msg.weekly);
  if (weekly) return { tier: 0, weekly, mutators: cleanTierMutatorIds(msg.mutators) };
  return { tier: 0, weekly: null, mutators: cleanBase(msg.mutators) };
}

/**
 * Auftrag für eine Stufen-/Wochen-Jagd: Kopie des Basis-Auftrags mit festen Mutatoren, Beute-Faktor, Schrott/RP-Faktor.
 * opts: { tier, weekly, mutators } – Stufe > 0 ignoriert opts.mutators (Tabelle gilt). Gibt `{ quest, glitch }` zurück;
 * glitch = true heißt: opts.mutators nicht noch einmal als Brett-Mutatoren zählen (sonst doppelte Beute).
 */
export function glitchQuest(base, opts = {}) {
  if (!isTierQuest(base)) return { quest: base, glitch: false };
  const tier = cleanTier(opts.tier), weekly = tier > 0 ? null : cleanWeekKey(opts.weekly);
  if (!tier && !weekly) return { quest: base, glitch: false };
  let mutators, matMul, pay, label;
  if (tier) { const t = TIERS[tier]; mutators = [...t.mutators]; matMul = t.matMul; pay = t.payMul; label = `Glitch-Stufe ${tier}`; }
  else { mutators = cleanTierMutatorIds(opts.mutators); matMul = WEEKLY_MAT; pay = Math.round((1 + 0.1 * WEEKLY_TIER) * 100) / 100; label = `Wochen-Glitch ${weekly.slice(5)}`; }
  const quest = {
    ...base, name: `${base.name} · ${label}`, mutators, matMul,
    reward: Math.round(base.reward * pay), rp: Math.round((base.rp ?? 0) * pay),
    jrUp: undefined, // Stufen-/Wochen-Jagden schalten nie einen Rang frei (der Basis-Auftrag war ja schon geschafft)
    glitchTier: tier, weekly, ...(weekly ? { fixedSeed: weekSeed(weekly) } : {}),
  };
  return { quest, glitch: true };
}
