import { describe, it, expect } from 'vitest';
import { HuntChest, applyChestResult } from '../../src/meta/huntChest.js';
import { HuntInventory } from '../../src/game/inventory.js';
import { defaultSave } from '../../src/meta/save.js';
import { buildLoadout } from '../../src/meta/loadout.js';
import { applyHuntResult, buildRewards } from '../../src/meta/progression.js';
import { getQuest } from '../../src/data/quests.js';
import { createRng } from '../../src/core/rng.js';
import { applyLoadout } from '../../src/game/loadout.js';
import { createVitals } from '../../src/game/vitals.js';

const mk = (box = {}, { combat = false } = {}) => {
  const save = defaultSave();
  Object.assign(save.box, box);
  const lo = buildLoadout(save);
  const inv = new HuntInventory({ brought: lo.items, free: { flickbrause: 2 } });
  const applied = [];
  const ch = new HuntChest(save, inv, lo, { inCombat: () => combat, apply: (l) => applied.push(l) });
  return { save, inv, ch, applied };
};
const finish = (save, ch, inv, result = 'win') => applyHuntResult(save, getQuest('jaggo'), buildRewards({ quest: getQuest('jaggo'), result, used: inv.used(), chest: ch.result(), rng: createRng(1) }));

describe('camp chest: take / put back', () => {
  it('takes up to the carry max and the box stock, never more', () => {
    const { ch, inv } = mk({ flickbrause: 5 });
    expect(ch.take('flickbrause', 3).n).toBe(3);
    expect(inv.count('flickbrause')).toBe(2 + 3); // 2 free + 3 taken
    expect(ch.stock('flickbrause')).toBe(2);
    expect(ch.take('flickbrause', 99).n).toBe(2); // stock limit
    expect(ch.take('flickbrause', 1).ok).toBe(false);
  });
  it('respects the carry max (free supplies count)', () => {
    const { ch, inv } = mk({ flickbrause: 50 });
    ch.takeMax('flickbrause');
    expect(inv.count('flickbrause')).toBeLessThanOrEqual(10);
    expect(ch.take('flickbrause').reason).toBe('carry_full');
  });
  it('materials cannot be taken', () => {
    const { ch } = mk({ altknochen: 9 });
    expect(ch.take('altknochen').ok).toBe(false);
  });
  it('put back returns only brought items and is leak-free at the end', () => {
    const { ch, inv, save } = mk({ flickbrause: 5 });
    ch.take('flickbrause', 4);
    expect(ch.putBack('flickbrause', 3).n).toBe(3);
    expect(ch.putBack('flickbrause', 9).n).toBe(1);
    expect(ch.putBack('flickbrause', 1).ok).toBe(false); // free supplies stay
    finish(save, ch, inv);
    expect(save.box.flickbrause).toBe(5);
  });
  it('taken then used is deducted from the box exactly once', () => {
    const { ch, inv, save } = mk({ flickbrause: 5 });
    ch.take('flickbrause', 3);
    inv.consume('flickbrause', 4); // free 2 first, then 2 of the taken
    finish(save, ch, inv);
    expect(save.box.flickbrause).toBe(3);
  });
  it('item bar full blocks new ids', () => {
    const ids = ['flickbrause', 'dicke_flickbrause', 'pustekuchen', 'blendknolle', 'stinkbombe', 'klebefalle', 'knallgurke', 'grillsteak', 'brennspitze'];
    const { ch } = mk(Object.fromEntries(ids.map((i) => [i, 3])));
    const oks = ids.map((i) => ch.take(i, 1).ok);
    expect(oks.filter(Boolean).length).toBeLessThanOrEqual(8);
    expect(oks.includes(false)).toBe(true);
  });
});

describe('camp chest: crafting', () => {
  it('spends box stock, produces into the box, no duplication across take+use', () => {
    const { ch, inv, save } = mk({ knisterkraut: 1, sprudelwasser: 1 });
    expect(ch.craft('flickbrause').ok).toBe(true);
    expect(ch.craft('flickbrause').ok).toBe(false); // out of materials
    expect(ch.stock('flickbrause')).toBe(1);
    ch.take('flickbrause', 1);
    inv.consume('flickbrause', 3); // 2 free + the crafted one
    finish(save, ch, inv);
    expect(save.box.flickbrause ?? 0).toBe(0);
    expect(save.box.knisterkraut ?? 0).toBe(0);
    expect(save.box.sprudelwasser ?? 0).toBe(0);
  });
  it('crafted but never used ends up in the box', () => {
    const { ch, inv, save } = mk({ knisterkraut: 2, sprudelwasser: 2 });
    ch.craft('flickbrause');
    finish(save, ch, inv);
    expect(save.box.flickbrause).toBe(1);
    expect(save.box.knisterkraut).toBe(1);
  });
  it('chained recipes use crafted intermediates and net out', () => {
    const { ch, save, inv } = mk({ knisterkraut: 1, sprudelwasser: 1, wabbelpilz: 1 });
    ch.craft('flickbrause');
    expect(ch.craft('dicke_flickbrause').ok).toBe(true);
    finish(save, ch, inv);
    expect(save.box.dicke_flickbrause).toBe(1);
    expect(save.box.flickbrause ?? 0).toBe(0);
  });
  it('already carried items are not craft ingredients', () => {
    const { ch } = mk({ flickbrause: 1, wabbelpilz: 1 });
    ch.take('flickbrause', 1);
    expect(ch.canCraft('dicke_flickbrause').ok).toBe(false);
    ch.putBack('flickbrause', 1);
    expect(ch.canCraft('dicke_flickbrause').ok).toBe(true);
  });
  it('failed hunt keeps chest bookkeeping too', () => {
    const { ch, inv, save } = mk({ knisterkraut: 1, sprudelwasser: 1 });
    ch.craft('flickbrause');
    finish(save, ch, inv, 'fail');
    expect(save.box.flickbrause).toBe(1);
  });
  it('applyChestResult never goes negative / ignores nonsense', () => {
    const save = defaultSave();
    applyChestResult(save, { delta: { knisterkraut: -5, nope: 3 }, loadout: null });
    expect(save.box.knisterkraut).toBeUndefined();
    expect(save.box.nope).toBeUndefined();
    applyChestResult(save, null);
  });
});

describe('camp chest: gear', () => {
  it('weapon swap blocked in combat, allowed otherwise, applies loadout', () => {
    const a = mk({}, { combat: true });
    expect(a.ch.setWeapon('bow')).toEqual({ ok: false, reason: 'combat' });
    expect(a.applied.length).toBe(0);
    const b = mk();
    expect(b.ch.setWeapon('bow').ok).toBe(true);
    expect(b.applied.at(-1).weapon.type).toBe('bow');
  });
  it('armor swap only for owned pieces; persists to the save at the end', () => {
    const { ch, save, inv } = mk();
    expect(ch.setArmor('barrotz_head').reason).toBe('not_owned');
    save.armorOwned.fellkluft_head = true;
    expect(ch.setArmor('fellkluft_head').ok).toBe(true);
    expect(save.loadout.armor.head).not.toBe('fellkluft_head'); // nothing written mid-hunt
    ch.setWeapon('kt');
    finish(save, ch, inv);
    expect(save.loadout.armor.head).toBe('fellkluft_head');
    expect(save.loadout.weapon).toBe('kt');
  });
  it('no gear change -> loadout untouched', () => {
    const { ch, save, inv } = mk();
    const before = JSON.stringify(save.loadout);
    finish(save, ch, inv);
    expect(JSON.stringify(save.loadout)).toBe(before);
  });
  it('applyLoadout twice does not stack bonuses and gives no free heal', () => {
    const save = defaultSave();
    const p = { v: createVitals(), def: {}, takeHit: (h) => h };
    const base = buildLoadout(save);
    const lo = { ...base, food: 'eintopf' };
    applyLoadout(p, lo);
    const hpFed = p.v.maxHp, stFed = p.v.maxStamina;
    applyLoadout(p, lo, { reapply: true });
    applyLoadout(p, lo, { reapply: true });
    expect(p.v.maxHp).toBe(hpFed);
    expect(p.v.maxStamina).toBe(stFed);
    p.v.hp = 10;
    applyLoadout(p, lo, { reapply: true });
    expect(p.v.hp).toBe(10);
  });
});
