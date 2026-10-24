import { describe, it, expect } from 'vitest';
import { WEAPON_LESSONS, newLessonProgress, recordLesson } from '../../src/data/weaponLessons.js';
import { weapons } from '../../src/game/weapons/index.js';
import { WEAPON_ORDER } from '../../src/data/weapons.js';
import { WeaponState } from '../../src/game/weapons/weapon.js';
import { trainRefill } from '../../src/game/training.js';

describe('Waffenschule: executable curriculum', () => {
  it.each(WEAPON_ORDER)('%s: every lesson has an achievable target and teaches defense, finisher and glitch', id => {
    const c = WEAPON_LESSONS[id], def = weapons[id];
    expect(c).toBeTruthy(); expect(c.steps.length).toBeGreaterThanOrEqual(7);
    expect(new Set(c.steps.map(s => s.id)).size).toBe(c.steps.length);
    expect(c.steps.some(s => s.defense === 'dodge')).toBe(true);
    expect(c.steps.some(s => s.glitch)).toBe(true);
    const fin = c.steps.find(s => s.wucht);
    expect(def.moves[fin.rule.moves[0]].consumeWucht).toBe(true);
    for (const s of c.steps) {
      expect(s.how.length).toBeGreaterThan(20); expect(s.why.length).toBeGreaterThan(20);
      expect(s.cue, `${id}/${s.id}: visible reminder`).toBeTruthy();
      expect(s.cue.length).toBeLessThanOrEqual(62);
      for (const move of s.rule.moves ?? []) expect(def.moves[move], `${id}/${s.id}/${move}`).toBeTruthy();
      if (s.rule.prefix) expect(Object.keys(def.moves).some(k => k.startsWith(s.rule.prefix))).toBe(true);
    }
  });
  it('only the requested technique in the requested state earns progress', () => {
    const i = WEAPON_LESSONS.db.steps.findIndex(s => s.id === 'rage'), p = newLessonProgress('db', i);
    expect(recordLesson(p, 'weaponMove', { rausch: true })).toBe(false);
    expect(recordLesson(p, 'hit', { rausch: false })).toBe(false);
    for (let n = 0; n < 3; n++) recordLesson(p, 'hit', { rausch: true });
    expect(p.done).toBe(true); recordLesson(p, 'hit', { rausch: true }); expect(p.count).toBe(3);
  });
  it('bow distance and real charge results, rather than any A press, are checked', () => {
    const p = newLessonProgress('bow', WEAPON_LESSONS.bow.steps.findIndex(s => s.id === 'shot'));
    for (const distance of [0, 7, 17, NaN, undefined]) expect(recordLesson(p, 'hit', { distance })).toBe(false);
    for (const distance of [8, 12, 16]) recordLesson(p, 'hit', { distance });
    expect(p.done).toBe(true);
    const c = newLessonProgress('gs', WEAPON_LESSONS.gs.steps.findIndex(s => s.id === 'charge'));
    expect(recordLesson(c, 'hit', { sauber: false })).toBe(false);
    expect(recordLesson(c, 'hit', { sauber: true })).toBe(true); expect(c.done).toBe(true);
  });
  it('a real WeaponState can enter every finisher through its declared input', () => {
    for (const id of WEAPON_ORDER) {
      const def = weapons[id], w = new WeaponState(def, { player: { local: false, ctx: { bus: { emit() {} }, players: [] } } });
      w.wucht = 100;
      const expected = WEAPON_LESSONS[id].steps.find(s => s.wucht).rule.moves[0];
      expect(def.overrideEvent(w, ['gs', 'bow'].includes(id) ? 'B' : 'holdB'), id).toBe(expected);
    }
  });
  it('guided lessons keep real stamina and do not accidentally turn B into a finisher', () => {
    const p = { v: { maxHp: 100, hp: 2, bruise: 3, stamina: 12, maxStamina: 100, exhaust: 1 }, weapon: { wucht: 0 }, glitch: { energy: 0, active: false }, ctx: { bus: { emit() {} } } };
    trainRefill(p, 8, false, false);
    expect(p.v.hp).toBe(100); expect(p.v.stamina).toBe(12); expect(p.v.exhaust).toBe(1); expect(p.weapon.wucht).toBe(0);
  });
});
