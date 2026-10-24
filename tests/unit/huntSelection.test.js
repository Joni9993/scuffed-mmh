import { describe, it, expect, vi } from 'vitest';
import { resolveHuntQuest } from '../../src/game/huntQuest.js';
import { resolveLoadout } from '../../src/game/huntmeta.js';
import { getQuest } from '../../src/data/quests.js';
import { tierMutators } from '../../src/data/glitchTiers.js';
import { MUTATORS } from '../../src/data/mutators.js';
import { defaultSave } from '../../src/meta/save.js';
import { createBrett, createLocalBoard, startSolo } from '../../src/ui/hubPanelsB.js';
import { createHuntModifiers } from '../../src/ui/huntModifiers.js';

describe('hunt difficulty is independent of the equipped weapon', () => {
  it.each([1, 2, 7, 10])('weapon tier %i cannot activate Glitch rules', tier => {
    for (const glitchTier of [undefined, 0]) {
      const opts = { quest: 'jaggo', weapon: 'gs', tier, glitchTier, mutators: [] };
      expect(resolveHuntQuest(opts)).toEqual({ quest: getQuest('jaggo'), glitch: false });
      expect(resolveLoadout(opts).weapon.tier).toBe(tier);
    }
  });

  it('7 → 0 removes all tier rules and reward multipliers without changing the weapon', () => {
    const opts = { quest: 'jaggo', weapon: 'gs', tier: 3, mutators: [] };
    const hard = resolveHuntQuest({ ...opts, glitchTier: 7 });
    expect(hard.quest.glitchTier).toBe(7);
    expect(hard.quest.mutators).toEqual(tierMutators(7));
    const normal = resolveHuntQuest({ ...opts, glitchTier: 0 });
    expect(normal.quest).toBe(getQuest('jaggo'));
    expect(normal.quest.mutators ?? []).toEqual([]);
    expect(normal.quest.reward).toBe(getQuest('jaggo').reward);
    expect(resolveLoadout(opts).weapon.tier).toBe(3);
  });

  it('weapon tier cannot override weekly rules or manually selected mutators', () => {
    const weekly = resolveHuntQuest({ quest: 'jaggo', tier: 7, weekly: '2026-W43', mutators: ['hotfix', 'schreibschutz'] });
    expect(weekly.quest.weekly).toBe('2026-W43');
    expect(weekly.quest.glitchTier).toBe(0);
    expect(weekly.quest.mutators).toEqual(['hotfix', 'schreibschutz']);
    expect(resolveHuntQuest({ quest: 'jaggo', tier: 7, glitchTier: 0, mutators: ['speicherleck'] }).glitch).toBe(false);
  });
});

describe('board → posted hunt → scene rules', () => {
  it('starts tier 7, then explicitly posts and starts tier 0 with no modifiers', () => {
    const save = defaultSave(); save.clears.jaggo = 1; save.kills.jaggo = 1; save.glitch.cleared.jaggo = 7; save.weapons.gs.tier = 7;
    const store = { get: () => save }, app = { goto: vi.fn() };
    const adapter = createLocalBoard({ name: () => save.name, start: (q, ids, extra) => startSolo(app, store, q, ids, extra) });
    const panel = createBrett({ save, store, app, adapter, rerender() {} });
    panel.render(); panel.click('qsel', { k: 'jaggo' });
    for (let n = 0; n < 7; n++) panel.click('tup', { k: 'jaggo' });
    panel.click('post', { k: 'jaggo' });
    expect(adapter.getPosted()[0]).toMatchObject({ tier: 7, mutators: tierMutators(7) });
    expect(panel.render()).toContain(MUTATORS.lag_spitze.desc);
    adapter.setReady(true);
    let opts = app.goto.mock.lastCall[1];
    expect(opts.glitchTier).toBe(7);
    expect(resolveHuntQuest(opts).quest.glitchTier).toBe(7);
    adapter.unpost();
    for (let n = 0; n < 7; n++) panel.click('tdn', { k: 'jaggo' });
    panel.click('mutclr', {}); panel.click('post', { k: 'jaggo' });
    expect(adapter.getPosted()[0]).toMatchObject({ tier: 0, mutators: [], weekly: null });
    adapter.setReady(true); opts = app.goto.mock.lastCall[1];
    expect(opts.glitchTier).toBe(0); expect(opts.loadout.weapon.tier).toBe(7);
    expect(resolveHuntQuest(opts).quest).toBe(getQuest('jaggo'));
    panel.dispose();
  });

  it('explains every resolved hunt modifier, including tier-only rules', () => {
    const { quest } = resolveHuntQuest({ quest: 'jaggo', glitchTier: 8 });
    const panel = createHuntModifiers({ adapter: { quest, ids: quest.mutators, timeLimit: 840 } });
    const html = panel.render();
    for (const id of quest.mutators) expect(html).toContain(MUTATORS[id].desc);
    expect(html).toContain('14:00'); expect(html).toContain('Glitch-Stufe 8');
  });
});
