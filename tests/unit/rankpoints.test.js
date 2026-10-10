import { describe, it, expect } from 'vitest';
import { createRng } from '../../src/core/rng.js';
import { quests } from '../../src/data/quests.js';
import { resolveMods } from '../../src/data/mutators.js';
import { defaultSave, sanitize, migrate } from '../../src/meta/save.js';
import { fieldStudyQuest } from '../../src/meta/fieldstudy.js';
import { buildRewards, applyHuntResult, questLock, questUnlocked, RANKS, MAX_JR } from '../../src/meta/progression.js';

const hunt = (s, q, result = 'win', rpMul = 1) => applyHuntResult(s, q, buildRewards({ quest: q, result, rng: createRng(1), rpMul }));

describe('Rang-Punkte', () => {
  it('RANKS-Schwellen und Schlüssel', () => {
    expect(RANKS.map((r) => [r.jr, r.keys, r.rp])).toEqual([[2, ['jaggo'], 0], [3, ['barrotz'], 100], [4, ['brathalos'], 250], [5, ['revierstreit'], 450], [6, ['kroll', 'gorgo'], 800], [7, ['voltaro'], 1200]]);
    expect(MAX_JR).toBe(7);
    for (const r of RANKS) for (const k of r.keys) expect(quests[k].jrUp).toBe(r.jr);
  });
  it('Sieg gibt Basis-RP, Niederlage 0, Training 0', () => {
    const s = defaultSave();
    expect(hunt(s, quests.kraeuterlauf).rp).toBe(20);
    expect(hunt(s, quests.jaggo, 'fail').rp).toBe(0);
    expect(s.rp).toBe(20);
    expect(hunt(s, quests.training).rp).toBe(0);
  });
  it('Mutator- und Feldstudie-Faktor', () => {
    const s = defaultSave();
    const mul = resolveMods(['kein_undo', 'overflow']).reward;
    expect(hunt(s, quests.jaggo, 'win', mul).rp).toBe(Math.round(40 * mul));
    const fs = fieldStudyQuest(new Date(2026, 2, 4));
    const base = { jaggo: 40, barrotz: 60, brathalos: 80, kroll: 130, gorgo: 130, voltaro: 180 }[fs.monster];
    expect(fs.rp).toBe(Math.round(base * 1.5 * resolveMods(fs.mutators).reward));
    expect(buildRewards({ quest: fs, result: 'win', rng: createRng(1) }).rp).toBe(fs.rp);
  });
  it('Schlüssel-Auftrag gesperrt bis RP reicht', () => {
    const s = defaultSave(); s.jr = 2; s.rp = 0;
    expect(questLock(s, quests.barrotz)).toEqual({ reason: 'rp', need: 100 });
    expect(questLock(s, quests.brathalos)).toEqual({ reason: 'jr', need: 3 });
    s.rp = 100;
    expect(questUnlocked(s, quests.barrotz)).toBe(true);
    expect(questLock(s, quests.jaggo_rotglut)).toEqual({ reason: 'jr', need: 4 });
    s.jr = 4; s.rp = 449;
    expect(questLock(s, quests.revierstreit)).toEqual({ reason: 'rp', need: 1 });
    expect(questLock(s, quests.jaggo_rotglut)).toBeNull(); // Nicht-Schlüssel: nur JR
  });
  it('Kette 1 -> 7: idealer Spieler, JR 4 erreichbar, ~14 Siege', () => {
    const s = defaultSave();
    const chain = [['jaggo', 2], ['barrotz', 3], ['brathalos', 4], ['revierstreit', 5], ['kroll', 6], ['voltaro', 7]];
    const fill = ['voltaro_rotglut', 'kroll_rotglut', 'brathalos_rotglut', 'barrotz_rotglut', 'jaggo_rotglut', 'brathalos', 'barrotz', 'jaggo'];
    let wins = 0;
    const seen = [1];
    for (const [key, jr] of chain) {
      let guard = 0;
      while (s.jr < jr && guard++ < 10) {
        const q = !questLock(s, quests[key]) ? quests[key] : fill.map((id) => quests[id]).filter((x) => !x.jrUp || x.jrUp <= s.jr).find((x) => !questLock(s, x));
        hunt(s, q); wins++;
      }
      expect(s.jr).toBe(jr); seen.push(s.jr);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(wins).toBeGreaterThanOrEqual(10);
    expect(wins).toBeLessThanOrEqual(20);
    const before = s.rp; hunt(s, quests.voltaro_rotglut);
    expect(s.rp).toBe(before + 260); // RP sammeln auch nach JR 7
  });
  it('Migration alter Saves ohne rp', () => {
    const old = { ...defaultSave(), jr: 3, clears: { jaggo: 5, barrotz: 1, kraeuterlauf: 2 }, version: 2 };
    delete old.rp;
    expect(migrate(old).rp).toBe(120); // 40 + 60 + 20 je erster Clear
    const low = { ...defaultSave(), jr: 4, clears: {} }; delete low.rp;
    expect(sanitize(low).rp).toBe(250); // mindestens Schwelle des aktuellen Rangs
    expect(sanitize({ ...defaultSave(), rp: 77 }).rp).toBe(77);
    expect(sanitize({ ...defaultSave(), rp: -5 }).rp).toBe(0);
  });
});
