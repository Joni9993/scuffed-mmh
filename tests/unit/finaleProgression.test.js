import { describe, it, expect } from 'vitest';
import { quests, RANK_RP, questList } from '../../src/data/quests.js';
import { defaultSave, sanitize, exportCode, importCode } from '../../src/meta/save.js';
import { applyHuntResult, buildRewards, questLock, MAX_JR } from '../../src/meta/progression.js';
import { createRng } from '../../src/core/rng.js';
import { DROPS, rollBreak, rollCarve } from '../../src/data/drops.js';
import { ITEMS } from '../../src/data/items.js';
import { BESTIARY_IDS } from '../../src/data/compendium.js';
import { monsters } from '../../src/game/monsters/index.js';

const order = ['pyrostur', 'felsengroll', 'voltiris', 'gockelok'];
describe('complete Glitchgrat progression', () => {
  it('unlocks all four hunts in order without an extra RP grind, keeps existing saves', () => {
    const save = sanitize({ ...defaultSave(), jr: 10, rp: RANK_RP[10], clears: { krachfaust: 1 } });
    expect(questList().filter((q) => order.includes(q.id)).map((q) => q.id)).toEqual(order);
    order.forEach((id, index) => {
      const q = quests[id];
      expect(questLock(save, q)).toBeNull();
      if (order[index + 1]) expect(questLock(save, quests[order[index + 1]])?.reason).toBe('jr');
      const fail = buildRewards({ quest: q, result: 'fail', rng: createRng(7) });
      applyHuntResult(save, q, fail);
      expect(save.jr).toBe(10 + index);
      const win = buildRewards({ quest: q, result: 'win', rng: createRng(7), breaks: monsters[id].parts.filter((p) => p.breakHp).map((p) => p.id) });
      const result = applyHuntResult(save, q, win, { time: 450 });
      expect(result.jrUp).toBe(11 + index);
      expect(save.kills[id]).toBe(1);
      expect(BESTIARY_IDS).toContain(id);
      expect(win.schrott).toBe(q.reward);
      for (const material of Object.keys(win.items)) expect(ITEMS[material]).toBeTruthy();
    });
    expect(save.jr).toBe(MAX_JR);
    expect(save.box.ur_gockelei).toBeGreaterThanOrEqual(1);
    expect(importCode(exportCode(save)).save).toMatchObject({ jr: 14, clears: { gockelok: 1, krachfaust: 1 } });
  });

  it('carves and every meaningful break yield usable whole materials', () => {
    for (const id of order) {
      expect(DROPS[id]).toBeTruthy();
      const rng = createRng(2);
      expect(rollCarve(id, rng)).toBeTruthy();
      for (const part of monsters[id].parts.filter((p) => p.breakHp)) {
        const drops = rollBreak(id, part.id, rng);
        expect(drops.length, `${id}/${part.id}`).toBeGreaterThan(0);
        for (const drop of drops) { expect(ITEMS[drop.id]).toBeTruthy(); expect(Number.isInteger(drop.n)).toBe(true); }
      }
    }
  });
});
