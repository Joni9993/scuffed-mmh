import { describe, it, expect } from 'vitest';
import { defaultSave, migrate, sanitize, CURRENT_VERSION } from '../../src/meta/save.js';
import { buildRewards, applyHuntResult } from '../../src/meta/progression.js';
import { getQuest } from '../../src/data/quests.js';
import { craftItem, craftArmor } from '../../src/meta/crafting.js';
import { boxAdd } from '../../src/meta/inventory.js';
import { createRng } from '../../src/core/rng.js';

const run = (s, id, result, info) => {
  const q = getQuest(id);
  return applyHuntResult(s, q, buildRewards({ quest: q, result, rng: createRng(1) }), info);
};

describe('stats recording', () => {
  it('records kills, best time, totals on a win', () => {
    const s = defaultSave();
    run(s, 'jaggo', 'win', { time: 300, kos: 1, carves: 3, glitch: 4 });
    run(s, 'jaggo', 'win', { time: 250, kos: 0, carves: 2, glitch: 1 });
    run(s, 'jaggo', 'win', { time: 400 });
    expect(s.kills.jaggo).toBe(3);
    expect(s.best.jaggo).toBe(250);
    expect(s.stats).toMatchObject({ hunts: 3, wins: 3, kos: 1, carves: 5, glitch: 5, playtime: 950 });
  });
  it('a fail counts the hunt and playtime but no kill or best', () => {
    const s = defaultSave();
    run(s, 'jaggo', 'fail', { time: 120, kos: 3 });
    expect(s.kills).toEqual({});
    expect(s.best).toEqual({});
    expect(s.stats).toMatchObject({ hunts: 1, fails: 1, kos: 3, playtime: 120 });
  });
  it('counts crafted items and gear', () => {
    const s = defaultSave();
    boxAdd(s, 'knisterkraut', 2); boxAdd(s, 'sprudelwasser', 2);
    craftItem(s, 'flickbrause');
    expect(s.stats.crafted).toBe(1);
    craftItem(s, 'stinkbombe'); // fails: no mats
    expect(s.stats.crafted).toBe(1);
    expect(craftArmor(s, 'fellkluft_head').ok).toBe(false);
    expect(s.stats.crafted).toBe(1);
  });
});

describe('stats migration', () => {
  it('v1 save gains new fields, kills estimated from clears', () => {
    const m = migrate({ version: 1, name: 'Alt', clears: { jaggo: 4, kraeuterlauf: 2 }, stats: { hunts: 9, wins: 6, fails: 3 } });
    expect(m.version).toBe(CURRENT_VERSION);
    expect(m.kills).toEqual({ jaggo: 4 });
    expect(m.best).toEqual({});
    expect(m.stats).toMatchObject({ hunts: 9, wins: 6, fails: 3, kos: 0, carves: 0, crafted: 0, glitch: 0, playtime: 0 });
  });
  it('sanitize drops junk', () => {
    const s = sanitize({ version: 2, kills: { jaggo: 5, 'bad id!': 2, x: -1 }, best: { jaggo: 90, y: 0 }, stats: { kos: 'abc', playtime: 12.7 } });
    expect(s.kills).toEqual({ jaggo: 5 });
    expect(s.best).toEqual({ jaggo: 90 });
    expect(s.stats.kos).toBe(0);
    expect(s.stats.playtime).toBe(12);
  });
});
