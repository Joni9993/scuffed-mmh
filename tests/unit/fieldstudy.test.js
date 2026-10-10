import { describe, it, expect } from 'vitest';
import { currentFieldStudy, fieldStudyQuest, registerFieldStudy, isoWeek, weekKey, getBestTime, recordBestTime } from '../../src/meta/fieldstudy.js';
import { getQuest } from '../../src/data/quests.js';
import { MUTATORS } from '../../src/data/mutators.js';

const mem = () => { const o = {}; return { getItem: (k) => o[k] ?? null, setItem: (k, v) => { o[k] = String(v); } }; };

describe('Feldstudie', () => {
  it('ISO-Kalenderwochen inkl. Jahreswechsel', () => {
    expect(isoWeek(new Date(2026, 9, 10))).toEqual({ year: 2026, week: 41 });
    expect(isoWeek(new Date(2026, 11, 31))).toEqual({ year: 2026, week: 53 }); // 2026 hat 53 KW
    expect(isoWeek(new Date(2027, 0, 1))).toEqual({ year: 2026, week: 53 });
    expect(isoWeek(new Date(2027, 0, 4))).toEqual({ year: 2027, week: 1 });
    expect(isoWeek(new Date(2024, 11, 30))).toEqual({ year: 2025, week: 1 });
  });

  it('gleiche Woche = gleicher Auftrag, nächste Woche anders', () => {
    const a = currentFieldStudy(new Date(2026, 9, 5)), b = currentFieldStudy(new Date(2026, 9, 11, 23, 59));
    expect(a).toEqual(b);
    const c = currentFieldStudy(new Date(2026, 9, 12));
    expect(c.week).toBe(a.week + 1);
    expect(c.seed).not.toBe(a.seed);
    // über viele Wochen wechseln Brocken und Mutatoren
    const mons = new Set(), muts = new Set();
    for (let w = 0; w < 30; w++) { const f = currentFieldStudy(new Date(2026, 0, 5 + 7 * w)); mons.add(f.monster); f.mutators.forEach((m) => muts.add(m)); }
    expect(mons.size).toBeGreaterThan(1);
    expect(muts.size).toBeGreaterThan(3);
  });

  it('Jahreswechsel: KW 53/1 gültig, 2 verschiedene bekannte Mutatoren, Seed >= 2', () => {
    for (const d of [new Date(2026, 11, 28), new Date(2027, 0, 1), new Date(2027, 0, 4), new Date(2027, 11, 31), new Date(2028, 0, 1)]) {
      const f = currentFieldStudy(d);
      expect(f.mutators).toHaveLength(2);
      expect(new Set(f.mutators).size).toBe(2);
      expect(f.mutators.every((m) => MUTATORS[m])).toBe(true);
      expect(f.seed).toBeGreaterThanOrEqual(2);
      expect(['jaggo', 'barrotz', 'brathalos', 'kroll', 'gorgo', 'voltaro']).toContain(f.monster);
    }
    expect(currentFieldStudy(new Date(2026, 11, 31)).key).toBe(currentFieldStudy(new Date(2027, 0, 1)).key);
    expect(currentFieldStudy(new Date(2027, 0, 1)).key).not.toBe(currentFieldStudy(new Date(2027, 0, 4)).key);
  });

  it('Quest-Objekt: fester Seed, feste Mutatoren, Bonus-Belohnung, registriert', () => {
    const d = new Date(2026, 9, 10);
    const q = fieldStudyQuest(d), f = currentFieldStudy(d);
    expect(q.fixedSeed).toBe(f.seed);
    expect(q.mutators).toEqual(f.mutators);
    expect(q.reward).toBeGreaterThan(0);
    expect(q.name).toBe(`Feldstudie KW ${f.week}`);
    registerFieldStudy(d);
    expect(getQuest('feldstudie').fieldStudy).toBe(weekKey(d));
  });

  it('Bestzeit pro Woche lokal speichern', () => {
    const st = mem();
    expect(getBestTime('2026-W41', st)).toBeNull();
    expect(recordBestTime('2026-W41', 300, st)).toBe(true);
    expect(recordBestTime('2026-W41', 350, st)).toBe(false);
    expect(recordBestTime('2026-W41', 280.44, st)).toBe(true);
    expect(getBestTime('2026-W41', st)).toBe(280.4);
    expect(getBestTime('2026-W42', st)).toBeNull();
  });
});
