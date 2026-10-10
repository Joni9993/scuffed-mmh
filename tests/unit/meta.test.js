import { describe, it, expect } from 'vitest';
import { defaultSave, migrate, sanitize, exportCode, importCode, createSaveStore, CURRENT_VERSION, SAVE_KEY } from '../../src/meta/save.js';
import { boxAdd, boxRemove, missing, boxAddAll } from '../../src/meta/inventory.js';
import { craftItem, canCraftItem, upgradeWeapon, craftArmor, equipArmor, setBarItem, cookMeal, weaponUpgradeOptions } from '../../src/meta/crafting.js';
import { armorProtection, armorSkills, skillEffects, damageReduction, buildLoadout } from '../../src/meta/loadout.js';
import { buildRewards, applyHuntResult, questUnlocked } from '../../src/meta/progression.js';
import { rollCarve, rollBreak, rollReward, partTag, DROPS } from '../../src/data/drops.js';
import { weaponStats, upgradeOptions } from '../../src/data/weapons.js';
import { protectReduction } from '../../src/game/combat.js';
import { ITEMS } from '../../src/data/items.js';
import { getQuest, quests } from '../../src/data/quests.js';
import { createRng } from '../../src/core/rng.js';

const memStorage = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, m }; };
const give = (s, o) => { for (const [k, n] of Object.entries(o)) { if (k === 'schrott') s.schrott += n; else boxAdd(s, k, n); } return s; };

describe('save: versioning, migration, export/import', () => {
  it('default save is current version and valid', () => {
    const s = defaultSave();
    expect(s.version).toBe(CURRENT_VERSION);
    expect(sanitize(s)).toMatchObject({ jr: 1, schrott: 0, name: 'Pirscher' });
    expect(s.loadout.armor.head).toBe('lumpen_head');
  });
  it('migrates a v0 prototype save', () => {
    const m = migrate({ playerName: 'Ede', rank: 3, money: 420, inv: { glutbrocken: 5, bogus: 9 }, weapon: 'bow' });
    expect(m.version).toBe(CURRENT_VERSION);
    expect(m.name).toBe('Ede');
    expect(m.jr).toBe(3);
    expect(m.schrott).toBe(420);
    expect(m.box).toEqual({ glutbrocken: 5 });
    expect(m.loadout.weapon).toBe('bow');
  });
  it('rejects saves from the future and garbage', () => {
    expect(migrate({ version: 99 })).toBeNull();
    expect(migrate(null)).toBeNull();
    expect(migrate('x')).toBeNull();
  });
  it('sanitizes invalid / hostile values', () => {
    const s = sanitize({ version: 1, name: '<b>Böse</b>', jr: 99, schrott: -5, box: { flickbrause: 500, nope: 3, altknochen: -1 }, weapons: { gs: { tier: 9, branch: 'x' } }, loadout: { weapon: 'axe', armor: { head: 'brathalos_head' }, items: [{ id: 'altknochen', n: 3 }, { id: 'flickbrause', n: 99 }] }, meal: 'gift' });
    expect(s.jr).toBe(7);
    expect(s.schrott).toBe(0);
    expect(s.box).toEqual({ flickbrause: 99 });
    expect(s.weapons.gs.tier).toBe(6);
    expect(s.loadout.weapon).toBe('gs');
    expect(s.loadout.armor.head).toBe('lumpen_head'); // not owned
    expect(s.loadout.items).toEqual([{ id: 'flickbrause', n: 10 }]);
    expect(s.meal).toBeNull();
    expect(s.name).not.toMatch(/[<>]/);
  });
  it('export -> import roundtrip keeps everything', () => {
    const s = defaultSave();
    give(s, { glutbrocken: 7, jaggo_kamm: 1, schrott: 1234 });
    s.name = 'Zöe ★'; s.jr = 3; s.weapons.bow = { tier: 3, branch: 'b' }; s.clears.jaggo = 2;
    const code = exportCode(s);
    expect(code).toMatch(/^SH1\.[0-9a-f]{8}\./);
    const r = importCode(code);
    expect(r.ok).toBe(true);
    expect(r.save.box).toEqual(s.box);
    expect(r.save.schrott).toBe(1234);
    expect(r.save.jr).toBe(3);
    expect(r.save.weapons.bow).toEqual({ tier: 3, branch: 'b' });
    expect(r.save.clears.jaggo).toBe(2);
    expect(r.save.name.startsWith('Zöe')).toBe(true);
    expect(importCode(`  ${code.slice(0, 20)}\n ${code.slice(20)} `).ok).toBe(true); // whitespace tolerant
  });
  it('import detects broken codes', () => {
    const code = exportCode(defaultSave());
    expect(importCode('hallo').ok).toBe(false);
    expect(importCode(code.slice(0, -4) + 'AAAA').ok).toBe(false);
    expect(importCode('').ok).toBe(false);
    expect(importCode(null).ok).toBe(false);
  });
  it('store persists, survives corrupt storage and blocked storage', () => {
    const st = memStorage();
    const a = createSaveStore({ storage: st });
    a.give('glutbrocken', 5);
    expect(JSON.parse(st.m[SAVE_KEY]).box.glutbrocken).toBe(5);
    expect(createSaveStore({ storage: st }).get().box.glutbrocken).toBe(5);
    st.m[SAVE_KEY] = '{kaputt';
    const b = createSaveStore({ storage: st });
    expect(b.get().jr).toBe(1);
    expect(st.m[`${SAVE_KEY}.corrupt`]).toBe('{kaputt');
    const blocked = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
    const c = createSaveStore({ storage: blocked });
    expect(() => c.give('altknochen', 2)).not.toThrow();
    expect(c.get().box.altknochen).toBe(2);
    expect(c.failed).toBe(true);
    c.reset();
    expect(c.get().box).toEqual({});
  });
  it('give() caps at 99 and rejects unknown ids', () => {
    const a = createSaveStore({ storage: memStorage() });
    a.give('altknochen', 150);
    expect(a.get().box.altknochen).toBe(99);
    expect(() => a.give('quatsch', 1)).toThrow();
    a.give('schrott', 50);
    expect(a.get().schrott).toBe(50);
  });
});

describe('box storage / stacking limits', () => {
  it('caps stacks at 99 and reports overflow', () => {
    const s = defaultSave();
    expect(boxAdd(s, 'altknochen', 90)).toEqual({ added: 90, overflow: 0 });
    expect(boxAdd(s, 'altknochen', 20)).toEqual({ added: 9, overflow: 11 });
    expect(s.box.altknochen).toBe(99);
  });
  it('remove is all-or-nothing', () => {
    const s = give(defaultSave(), { altknochen: 2 });
    expect(boxRemove(s, 'altknochen', 3)).toBe(false);
    expect(s.box.altknochen).toBe(2);
    expect(boxRemove(s, 'altknochen', 2)).toBe(true);
    expect(s.box.altknochen).toBeUndefined();
  });
  it('overflow is sold for Schrott', () => {
    const s = give(defaultSave(), { jaggo_schuppe: 98 });
    const r = boxAddAll(s, { jaggo_schuppe: 4 });
    expect(r.added.jaggo_schuppe).toBe(1);
    expect(r.sold.jaggo_schuppe).toBe(3);
    expect(s.schrott).toBe(3 * ITEMS.jaggo_schuppe.value);
  });
  it('missing() lists what is short', () => {
    const s = give(defaultSave(), { altknochen: 1, schrott: 50 });
    expect(missing(s, { altknochen: 3, schrott: 200 })).toEqual([{ id: 'altknochen', need: 3, have: 1 }, { id: 'schrott', need: 200, have: 50 }]);
  });
});

describe('crafting', () => {
  it('fails with insufficient materials and changes nothing', () => {
    const s = give(defaultSave(), { knisterkraut: 1 });
    const before = JSON.stringify(s.box);
    const r = craftItem(s, 'flickbrause');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('mats');
    expect(r.missing).toEqual([{ id: 'sprudelwasser', need: 1, have: 0 }]);
    expect(JSON.stringify(s.box)).toBe(before);
  });
  it('crafts a Flickbrause, bow tips come in tens', () => {
    const s = give(defaultSave(), { knisterkraut: 2, sprudelwasser: 1, glutbrocken: 1, altknochen: 1 });
    expect(craftItem(s, 'flickbrause')).toMatchObject({ ok: true, n: 1 });
    expect(s.box.flickbrause).toBe(1);
    expect(s.box.knisterkraut).toBe(1);
    expect(s.box.sprudelwasser).toBeUndefined();
    expect(craftItem(s, 'brennspitze')).toMatchObject({ ok: true, n: 10 });
    expect(s.box.brennspitze).toBe(10);
  });
  it('Dicke Flickbrause eats a Flickbrause', () => {
    const s = give(defaultSave(), { flickbrause: 2, wabbelpilz: 1 });
    craftItem(s, 'dicke_flickbrause');
    expect(s.box.flickbrause).toBe(1);
    expect(s.box.dicke_flickbrause).toBe(1);
  });
  it('refuses when the box would overflow', () => {
    const s = give(defaultSave(), { glutbrocken: 1, altknochen: 1, brennspitze: 95 });
    expect(canCraftItem(s, 'brennspitze')).toEqual({ ok: false, reason: 'full' });
  });
  it('weapon upgrade tier 2 -> branch at tier 3 -> tier 4', () => {
    const s = defaultSave();
    expect(upgradeWeapon(s, 'gs').reason).toBe('mats');
    give(s, { altknochen: 3, schrotterz: 5, schrott: 2000, jaggo_schuppe: 4, jaggo_fell: 2, barrotz_kruste: 4, barrotz_platte: 1 });
    expect(upgradeWeapon(s, 'gs')).toMatchObject({ ok: true, tier: 2 });
    expect(s.schrott).toBe(1800);
    expect(weaponUpgradeOptions(s, 'gs').map((o) => o.branch)).toEqual(['a', 'b']);
    expect(upgradeWeapon(s, 'gs').reason).toBe('branch'); // must choose
    expect(upgradeWeapon(s, 'gs', 'b')).toMatchObject({ ok: true, tier: 3, branch: 'b', name: 'Barrotz-Brecher' });
    expect(s.weapons.gs).toEqual({ tier: 3, branch: 'b' });
    expect(s.box.barrotz_kruste).toBeUndefined();
    expect(s.box.jaggo_schuppe).toBe(4); // other branch's mats untouched
    give(s, { brathalos_schuppe: 4, brathalos_membran: 2, glutsack: 1, glimmstein: 2, schrott: 800 });
    expect(upgradeWeapon(s, 'gs')).toMatchObject({ ok: true, tier: 4 });
    expect(upgradeWeapon(s, 'gs').reason).toBe('branch');
  });
  it('weapon stats per branch (existing API intact)', () => {
    expect(weaponStats('gs', 1)).toMatchObject({ name: 'Rostplatte', power: 80, crit: 0.05 });
    expect(weaponStats('gs', 3).name).toBe('Jaggo-Hackbeil');
    expect(weaponStats('gs', 3, 'b')).toMatchObject({ name: 'Barrotz-Brecher', power: 128, bluntMul: 1.3, branch: 'b' });
    expect(weaponStats('db', 3, 'b').elems).toEqual({ shock: 14 });
    expect(weaponStats('db', 3, 'a').crit).toBe(0.15);
    expect(weaponStats('bow', 4).poisonMul).toBe(1.5);
    expect(weaponStats('gs', 4).elems.fire).toBe(25);
    expect(upgradeOptions('bow', 4).length).toBe(3); expect(upgradeOptions('bow', 6)).toEqual([]);
  });
  it('armor crafting, ownership and equipping', () => {
    const s = defaultSave();
    expect(craftArmor(s, 'knochenkram_head').reason).toBe('mats');
    expect(craftArmor(s, 'lumpen_head').reason).toBe('owned');
    expect(equipArmor(s, 'knochenkram_head').reason).toBe('not_owned');
    give(s, { schrott: 100, altknochen: 2, grossknochen: 1 });
    expect(craftArmor(s, 'knochenkram_head').ok).toBe(true);
    expect(s.schrott).toBe(0);
    expect(equipArmor(s, 'knochenkram_head').ok).toBe(true);
    expect(s.loadout.armor.head).toBe('knochenkram_head');
    expect(craftArmor(s, 'knochenkram_head').reason).toBe('owned');
  });
  it('item bar: max 8 distinct, clamped to carry limit and box', () => {
    const s = give(defaultSave(), { flickbrause: 20, sprudelwasser: 2 });
    expect(setBarItem(s, 'flickbrause', 50)).toEqual({ ok: true, n: 10 });
    expect(setBarItem(s, 'sprudelwasser', 5)).toEqual({ ok: true, n: 2 });
    expect(setBarItem(s, 'altknochen', 1).ok).toBe(false); // material
    expect(setBarItem(s, 'flickbrause', 0).n).toBe(0);
    expect(s.loadout.items).toEqual([{ id: 'sprudelwasser', n: 2 }]);
    for (const id of ['flickbrause', 'dicke_flickbrause', 'pustekuchen', 'blendknolle', 'stinkbombe', 'klebefalle', 'knallgurke', 'brennspitze', 'giftspitze']) { boxAdd(s, id, 5); setBarItem(s, id, 1); }
    expect(s.loadout.items.length).toBe(8);
    boxAdd(s, 'bummspitze', 5);
    expect(setBarItem(s, 'bummspitze', 1).reason).toBe('bar_full');
  });
  it('cooking: one meal, costs Schrott + items', () => {
    const s = give(defaultSave(), { schrott: 50, glutbrocken: 1 });
    expect(cookMeal(s, 'glutgulasch').reason).toBe('mats');
    s.schrott = 200;
    expect(cookMeal(s, 'glutgulasch').ok).toBe(true);
    expect(s.schrott).toBe(120);
    expect(s.meal).toBe('glutgulasch');
    expect(cookMeal(s, 'eintopf').reason).toBe('has_meal');
  });
});

describe('armor, skills, damage reduction', () => {
  it('reduction = prot / (prot + 80)', () => {
    expect(damageReduction(0)).toBe(0);
    expect(damageReduction(80)).toBe(0.5);
    expect(damageReduction(28)).toBeCloseTo(28 / 108, 6);
    expect(damageReduction(60)).toBe(protectReduction(60)); // same formula as the combat code
  });
  it('protection is the sum of the three pieces', () => {
    expect(armorProtection({ head: 'lumpen_head', body: 'lumpen_body', legs: 'lumpen_legs' })).toBe(15);
    expect(armorProtection({ head: 'brathalos_head', body: 'jaggo_body', legs: 'knochenkram_legs' })).toBe(28 + 18 + 12);
    expect(armorProtection({})).toBe(0);
  });
  it('sums Macken per piece and caps at max level', () => {
    const jag = { head: 'jaggo_head', body: 'jaggo_body', legs: 'jaggo_legs' };
    expect(armorSkills(jag)).toEqual({ flinkfuss: 2 }); // 3 pieces, max 2
    expect(skillEffects(armorSkills(jag)).flinkfuss).toBe(2);
    const mix = { head: 'knochenkram_head', body: 'knochenkram_body', legs: 'jaggo_legs' };
    expect(armorSkills(mix)).toEqual({ zaehe_socke: 2, flinkfuss: 1 });
    expect(skillEffects(armorSkills(mix)).maxStamina).toBe(30);
    const bar = { head: 'barrotz_head', body: 'barrotz_body', legs: 'lumpen_legs' };
    expect(skillEffects(armorSkills(bar))).toMatchObject({ flinchImmune: true, downImmune: false });
    const barFull = { head: 'barrotz_head', body: 'barrotz_body', legs: 'barrotz_legs' };
    expect(skillEffects(armorSkills(barFull)).downImmune).toBe(true);
    const brat = { head: 'brathalos_head', body: 'brathalos_body', legs: 'brathalos_legs' };
    expect(skillEffects(armorSkills(brat)).crit).toBeCloseTo(0.24, 6);
    expect(skillEffects(armorSkills(brat)).fireResist).toBeGreaterThan(0.4);
    expect(armorSkills({ head: 'lumpen_head' })).toEqual({});
  });
  it('buildLoadout follows the contract and clamps the bar', () => {
    const s = give(defaultSave(), { flickbrause: 3 });
    s.loadout.items = [{ id: 'flickbrause', n: 10 }, { id: 'pustekuchen', n: 2 }];
    s.meal = 'eintopf';
    const l = buildLoadout(s);
    expect(l).toMatchObject({ name: 'Pirscher', weapon: { type: 'gs', tier: 1, branch: null }, armor: { head: 'lumpen_head' }, food: 'eintopf' });
    expect(l.items).toEqual([{ id: 'flickbrause', n: 3 }]);
  });
});

describe('drops (seeded determinism)', () => {
  it('same seed -> same carves; different seed differs eventually', () => {
    const roll = (seed) => { const r = createRng(seed); return Array.from({ length: 12 }, () => rollCarve('jaggo', r).id); };
    expect(roll(5)).toEqual(roll(5));
    expect(new Set([roll(1).join(), roll(2).join(), roll(3).join()]).size).toBeGreaterThan(1);
  });
  it('carve tables only drop their own materials, weights are respected', () => {
    const r = createRng(42);
    const counts = {};
    for (let i = 0; i < 4000; i++) { const c = rollCarve('brathalos', r); counts[c.id] = (counts[c.id] ?? 0) + 1; }
    expect(Object.keys(counts).every((id) => DROPS.brathalos.carve.some((e) => e.id === id))).toBe(true);
    expect(counts.brathalos_rubin / 4000).toBeGreaterThan(0.015);
    expect(counts.brathalos_rubin / 4000).toBeLessThan(0.05); // ~3 %
    expect(counts.brathalos_schuppe).toBeGreaterThan(counts.glutsack);
  });
  it('tail table, matMul', () => {
    expect(rollCarve('barrotz', createRng(1), { tail: true }).id).toBe('barrotz_schwanzleder');
    expect(rollCarve('jaggo', createRng(1), { matMul: 2 }).n).toBe(2);
    expect(rollCarve('nobody', createRng(1))).toBeNull();
  });
  it('guaranteed break bonuses (Kopfbruch -> Kamm), part id aliases', () => {
    expect(rollBreak('jaggo', 'head', createRng(1))).toEqual([{ id: 'jaggo_kamm', n: 1 }]);
    expect(rollBreak('barrotz', 'kopfplatte', createRng(1))[0].id).toBe('barrotz_platte');
    expect(rollBreak('brathalos', 'wingL', createRng(1))).toEqual([{ id: 'brathalos_membran', n: 1 }]);
    expect(rollBreak('brathalos', 'wingR', createRng(1), { matMul: 2 })).toEqual([{ id: 'brathalos_membran', n: 2 }]);
    expect(rollBreak('jaggo', 'legs', createRng(1))).toEqual([]);
    expect(partTag('Flügel L')).toBe('wing');
  });
  it('quest rewards are deterministic', () => {
    expect(rollReward('jaggo', createRng(9))).toEqual(rollReward('jaggo', createRng(9)));
    expect(rollReward('jaggo', createRng(9))[0].id).toBe('jaggo_schuppe');
  });
});

describe('progression: JR unlocks and rewards', () => {
  it('quests unlock by JR (GDD 8.4)', () => {
    const s = defaultSave();
    expect(questUnlocked(s, quests.kraeuterlauf)).toBe(true);
    expect(questUnlocked(s, quests.jaggo)).toBe(true);
    expect(questUnlocked(s, quests.barrotz)).toBe(false);
    expect(questUnlocked(s, quests.jaggo_rotglut)).toBe(false);
    s.jr = 4;
    expect(questUnlocked(s, quests.jaggo_rotglut)).toBe(true);
  });
  it('JR rises after the first Jaggo, Barrotz, Brathalos – never falls', () => {
    const s = defaultSave();
    const win = (q) => applyHuntResult(s, q, buildRewards({ quest: q, result: 'win', rng: createRng(1) }));
    expect(win(quests.jaggo).jrUp).toBe(2);
    expect(s.jr).toBe(2);
    expect(win(quests.jaggo).jrUp).toBeNull();
    s.rp = 1000; // Schwellen: rankpoints.test.js
    expect(win(quests.barrotz).jrUp).toBe(3);
    expect(win(quests.brathalos).jrUp).toBe(4);
    expect(win(quests.kraeuterlauf).jrUp).toBeNull();
    expect(s.jr).toBe(4);
    expect(s.clears.jaggo).toBe(2);
  });
  it('win pays Schrott, break bonus and quest drops; Rotglut doubles materials', () => {
    const q = getQuest('jaggo');
    const rw = buildRewards({ quest: q, result: 'win', gathered: { knisterkraut: 2 }, carved: { jaggo_fell: 2 }, breaks: ['head'], rng: createRng(3) });
    expect(rw.schrott).toBe(300);
    expect(rw.items.jaggo_kamm).toBe(1);
    expect(rw.items.knisterkraut).toBe(2);
    expect(rw.items.jaggo_fell).toBeGreaterThanOrEqual(2);
    const rot = buildRewards({ quest: getQuest('jaggo_rotglut'), result: 'win', breaks: ['head'], rng: createRng(3) });
    expect(rot.items.jaggo_kamm).toBe(2);
  });
  it('failure keeps only gathered items', () => {
    const rw = buildRewards({ quest: getQuest('jaggo'), result: 'fail', gathered: { altknochen: 3 }, carved: { jaggo_fell: 1 }, breaks: ['head'], rng: createRng(1) });
    expect(rw.schrott).toBe(0);
    expect(rw.items).toEqual({ altknochen: 3 });
    const s = defaultSave();
    const r = applyHuntResult(s, getQuest('jaggo'), rw);
    expect(s.box.altknochen).toBe(3);
    expect(s.jr).toBe(1);
    expect(r.jrUp).toBeNull();
    expect(s.stats.fails).toBe(1);
  });
  it('Kräuterlauf hands in 10 Knisterkraut', () => {
    const q = getQuest('kraeuterlauf');
    const rw = buildRewards({ quest: q, result: 'win', gathered: { knisterkraut: 13, blaublatt: 1 }, rng: createRng(1) });
    expect(rw.parts.handedIn.knisterkraut).toBe(10);
    expect(rw.items).toEqual({ knisterkraut: 3, blaublatt: 1 });
    expect(rw.schrott).toBe(100);
  });
  it('applying: spent consumables leave the box, meal is cleared, overflow sold', () => {
    const s = give(defaultSave(), { flickbrause: 5, altknochen: 99 });
    s.meal = 'eintopf';
    const rw = buildRewards({ quest: getQuest('jaggo'), result: 'win', gathered: { altknochen: 2 }, used: { flickbrause: 3 }, rng: createRng(1) });
    const r = applyHuntResult(s, getQuest('jaggo'), rw);
    expect(s.box.flickbrause).toBe(2);
    expect(s.box.altknochen).toBe(99);
    expect(r.sold.altknochen).toBe(2);
    expect(s.meal).toBeNull();
    expect(s.schrott).toBe(300 + 2 * ITEMS.altknochen.value);
  });
});
