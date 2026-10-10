import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WEAPON_ORDER, WEAPON_TYPES, weaponStats, upgradeOptions, WEAPON_UPGRADES } from '../../src/data/weapons.js';
import { ARMOR_SETS, SET_ORDER, SKILLS, SLOTS, getPiece } from '../../src/data/armor.js';
import { DROPS, rollCarve, rollBreak, rollReward, partTag } from '../../src/data/drops.js';
import { quests, questList, QUEST_ORDER } from '../../src/data/quests.js';
import { ITEMS } from '../../src/data/items.js';
import { GEAR_SETS, SET_TIER, encodeGear, decodeGear, makeGear } from '../../src/data/gearlook.js';
import { defaultSave, sanitize } from '../../src/meta/save.js';
import { upgradeWeapon, craftArmor } from '../../src/meta/crafting.js';
import { armorSkills, skillEffects, armorProtection } from '../../src/meta/loadout.js';
import { buildRewards, applyHuntResult, questUnlocked, MAX_JR } from '../../src/meta/progression.js';
import { boxAdd } from '../../src/meta/inventory.js';
import { createRng } from '../../src/core/rng.js';
import { buildArmor } from '../../src/game/gear/armor.js';
import { GearParts } from '../../src/render/gearfx.js';
import { buildGreatswordLook, buildDualBladeLook, buildBowLook } from '../../src/game/gear/weaponLook.js';

// Rostwerke-Materialien: legt ein anderer Agent in data/items.js an (GDD 15.7) -> hier als "zugesagt" gefuehrt.
const PROMISED = ['kupferdraht', 'schlacke', 'rostkaefer', 'giftschlamm', 'funkenstein', 'kroll_panzer', 'kroll_schere', 'kroll_auge', 'gorgo_segment', 'gorgo_zahn', 'gorgo_kern', 'voltaro_kamm', 'voltaro_spule', 'voltaro_fell', 'voltaro_herz'];
const known = (id) => id === 'schrott' || !!ITEMS[id] || PROMISED.includes(id);
// Fehlen die Materialien noch in data/items.js, werden sie nur fuer diesen Test als Stub registriert.
for (const id of PROMISED) ITEMS[id] ??= { id, name: id, kind: 'material', max: 99, value: 1 };
const give = (s, items) => { for (const [id, n] of Object.entries(items)) { if (id === 'schrott') s.schrott += n; else boxAdd(s, id, n); } };

describe('Waffen Stufe 5/6', () => {
  it('alle Rezepte nutzen existierende oder zugesagte IDs', () => {
    for (const t of WEAPON_ORDER) {
      for (const b of ['k', 'g', 'v']) for (const id of Object.keys(WEAPON_UPGRADES[5][t][b].cost)) expect(known(id), `${t}5${b} ${id}`).toBe(true);
      for (const id of Object.keys(WEAPON_UPGRADES[6][t].cost)) expect(known(id), `${t}6 ${id}`).toBe(true);
    }
    for (const set of ['kroll', 'gorgo', 'voltaro']) for (const sl of SLOTS) for (const id of Object.keys(getPiece(`${set}_${sl}`).cost)) expect(known(id), `${set}_${sl} ${id}`).toBe(true);
  });
  it('Stufe 5 (3 Aeste) und Stufe 6 (nur Voltaro) fuer alle 4 Waffen, Kraft waechst', () => {
    for (const t of WEAPON_ORDER) {
      const p4 = weaponStats(t, 4).power;
      const opts = upgradeOptions(t, 4);
      expect(opts.map((o) => o.branch)).toEqual(['k', 'g', 'v']);
      for (const o of opts) { expect(o.tier).toBe(5); expect(o.stats.power).toBeGreaterThan(p4 + 10); expect(o.stats.power).toBeLessThan(p4 + 30); }
      expect(weaponStats(t, 5, 'k')).toMatchObject({ elems: { rust: expect.any(Number) }, partDmgMul: 1.25 });
      expect(weaponStats(t, 5, 'g')).toMatchObject({ crit: 0.15, elems: { fire: expect.any(Number) } });
      expect(weaponStats(t, 5, 'v').elems.shock).toBeGreaterThan(0);
      expect(upgradeOptions(t, 5, 'k')).toEqual([]);
      expect(upgradeOptions(t, 5, 'g')).toEqual([]);
      const o6 = upgradeOptions(t, 5, 'v');
      expect(o6.length).toBe(1);
      expect(o6[0].name).toMatch(/^Funkenfürst-/);
      expect(o6[0].cost.voltaro_herz).toBe(1);
      expect(o6[0].stats.power).toBeGreaterThan(weaponStats(t, 5, 'v').power);
      expect(upgradeOptions(t, 6, 'v')).toEqual([]);
      expect(WEAPON_TYPES[t].tiers.length).toBe(6);
    }
  });
  it('Schmiede: 4 -> 5 Voltaro -> 6; Kroll-Ast endet bei 5; Save-Sanitize', () => {
    const s = defaultSave();
    s.weapons.kt = { tier: 4, branch: 'b' };
    expect(upgradeWeapon(s, 'kt', 'x').reason).toBe('branch');
    expect(upgradeWeapon(s, 'kt', 'v').reason).toBe('mats');
    give(s, WEAPON_UPGRADES[5].kt.v.cost);
    expect(upgradeWeapon(s, 'kt', 'v')).toMatchObject({ ok: true, tier: 5, branch: 'v' });
    give(s, WEAPON_UPGRADES[6].kt.cost);
    expect(upgradeWeapon(s, 'kt')).toMatchObject({ ok: true, tier: 6, branch: 'v', name: 'Funkenfürst-Katana' });
    expect(upgradeWeapon(s, 'kt').reason).toBe('maxed');
    s.weapons.gs = { tier: 4, branch: null };
    give(s, WEAPON_UPGRADES[5].gs.k.cost);
    expect(upgradeWeapon(s, 'gs', 'k')).toMatchObject({ ok: true, tier: 5, branch: 'k' });
    expect(upgradeWeapon(s, 'gs').reason).toBe('maxed');
    expect(sanitize({ weapons: { gs: { tier: 5, branch: 'g' }, db: { tier: 6, branch: 'x' }, bow: { tier: 5, branch: 'zz' } } }).weapons).toMatchObject({ gs: { tier: 5, branch: 'g' }, db: { tier: 6, branch: 'v' }, bow: { tier: 5, branch: 'k' } });
  });
});

describe('Ruestungs-Sets + Macken', () => {
  const armorOf = (set) => ({ head: `${set}_head`, body: `${set}_body`, legs: `${set}_legs` });
  it('Schutz und Macken laut GDD 15.8', () => {
    expect([ARMOR_SETS.kroll.prot, ARMOR_SETS.gorgo.prot, ARMOR_SETS.voltaro.prot]).toEqual([34, 36, 40]);
    expect(SET_ORDER.slice(-3)).toEqual(['kroll', 'gorgo', 'voltaro']);
    for (const id of ['panzerhaut', 'wuehler', 'ueberladung', 'erdung']) expect(SKILLS[id].desc(2)).toBeTruthy();
    const k = skillEffects(armorSkills(armorOf('kroll')));
    expect(k.rustDurMul).toBeCloseTo(0.5); expect(k.protectMul).toBeCloseTo(1.1);
    expect(skillEffects(armorSkills({ ...armorOf('lumpen'), head: 'kroll_head' })).rustDurMul).toBeGreaterThan(0.8);
    expect(skillEffects(armorSkills({ ...armorOf('lumpen'), head: 'gorgo_head' })).suctionImmune).toBe(false);
    const g = skillEffects(armorSkills({ ...armorOf('lumpen'), head: 'gorgo_head', body: 'gorgo_body' }));
    expect(g.suctionImmune).toBe(true); expect(g.windImmune).toBe(true);
    const v = skillEffects(armorSkills(armorOf('voltaro')));
    expect(v.counterBuff).toEqual({ atk: 0.15, dur: 8 });
    expect(v.shockResist).toBeGreaterThan(0.4);
    expect(skillEffects({}).counterBuff).toBeNull();
    expect(armorProtection(armorOf('voltaro'))).toBe(120);
  });
  it('Teile schmiedbar (Materialien noetig)', () => {
    const s = defaultSave();
    expect(craftArmor(s, 'kroll_head').reason).toBe('mats');
    give(s, getPiece('kroll_head').cost);
    expect(craftArmor(s, 'kroll_head')).toMatchObject({ ok: true });
  });
  it('Gear-Optik: Codes, Tier, Builder bauen ohne Fehler und mit Aufbauten', () => {
    for (const set of ['kroll', 'gorgo', 'voltaro']) {
      expect(GEAR_SETS).toContain(set);
      expect(SET_TIER[set]).toBeGreaterThanOrEqual(5);
      const P = {};
      for (const k of ['torso', 'head', 'armR', 'armL', 'legL', 'legR']) P[k] = new GearParts();
      const r = buildArmor(P, armorOf(set), '#44aa66');
      expect(r.sets.head).toBe(set);
      for (const p of Object.values(P)) expect(p.merge().attributes.position.count).toBeGreaterThan(0);
      expect(Object.values(P).reduce((a, p) => a + p.geos.length, 0)).toBeGreaterThan(60);
    }
    for (const [type, tier, branch] of [['gs', 5, 'k'], ['db', 5, 'g'], ['bow', 6, 'v'], ['kt', 5, 'v'], ['kt', 6, 'v']]) {
      const g = { weapon: { type, tier, branch }, armor: armorOf('voltaro') };
      expect(decodeGear(encodeGear(g, 3))).toMatchObject({ weapon: { type, tier, branch }, colorIdx: 3 });
    }
    expect(makeGear({ weapon: { type: 'gs', tier: 5, branch: 'zz' } }).weapon.branch).toBe('k');
    for (const tier of [5, 6]) for (const branch of ['k', 'g', 'v']) {
      for (const g of [buildGreatswordLook(tier, branch), buildDualBladeLook(tier, branch), buildBowLook(tier, branch)]) {
        expect(g).toBeInstanceOf(THREE.Group);
        expect(g.userData.fx.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('Drops', () => {
  const rng = () => createRng(7);
  it('kroll / gorgo / voltaro: carve, breaks, reward mit bekannten IDs', () => {
    for (const m of ['kroll', 'gorgo', 'voltaro']) {
      const d = DROPS[m];
      const ids = [...d.carve.map((e) => e.id), ...d.tail.map((e) => e.id), ...Object.values(d.breaks).flat().map((e) => e.id), ...d.reward.map((e) => e.id)];
      for (const id of ids) expect(known(id), `${m} ${id}`).toBe(true);
      expect(rollCarve(m, rng())).toBeTruthy();
      expect(rollReward(m, rng()).length).toBeGreaterThan(0);
    }
    expect(DROPS.voltaro.tail.length).toBeGreaterThan(0);
    expect(rollCarve('voltaro', rng(), { tail: true })).toBeTruthy();
    expect(partTag('kesselpanzer')).toBe('panzer');
    expect(partTag('scherenL')).toBe('schere');
    expect(partTag('antennenkamm')).toBe('kamm');
    expect(rollBreak('kroll', 'kesselpanzer', rng())[0].id).toBe('kroll_panzer');
    expect(rollBreak('gorgo', 'segment3', rng())[0].id).toBe('gorgo_segment');
    expect(rollBreak('voltaro', 'antennenkamm', rng())[0].id).toBe('voltaro_kamm');
    expect(rollBreak('voltaro', 'tail', rng()).length).toBeGreaterThan(0);
    // alte Brocken unveraendert: Kopfbruch Brathalos
    expect(rollBreak('brathalos', 'head', rng())[0].id).toBe('brathalos_schuppe');
  });
});

describe('Quests + JR-Gating', () => {
  it('Quests existieren in den Rostwerken mit passenden JR', () => {
    const q = quests;
    expect([q.kroll.jr, q.gorgo.jr, q.voltaro.jr]).toEqual([5, 5, 6]);
    for (const id of ['kroll', 'gorgo', 'voltaro', 'rostiger_ausflug', 'kroll_rotglut', 'gorgo_rotglut', 'voltaro_rotglut']) {
      expect(q[id].world).toBe('rostwerke');
      expect(QUEST_ORDER).toContain(id);
      expect(questList().some((x) => x.id === id)).toBe(true);
    }
    expect(q.rostiger_ausflug.type).toBe('gather');
    expect(known(q.rostiger_ausflug.gather.id)).toBe(true);
    for (const id of ['kroll_rotglut', 'gorgo_rotglut', 'voltaro_rotglut']) {
      expect(q[id].jr).toBe(7); expect(q[id].mutators).toEqual(['rotglut']); expect(q[id].matMul).toBeGreaterThan(1);
    }
    expect(q.training.jr).toBe(0);
    expect(q.jaggo_rotglut.jr).toBe(4); // bestehende Rotglut bleibt
  });
  it('JR: Revierstreit -> 5, Kroll/Gorgo -> 6, Voltaro -> 7, nie zurueck', () => {
    expect(MAX_JR).toBe(7);
    const s = defaultSave();
    const win = (qu) => applyHuntResult(s, qu, buildRewards({ quest: qu, result: 'win', rng: createRng(1) }), { time: 100 });
    s.jr = 4; s.rp = 450;
    expect(questUnlocked(s, quests.kroll)).toBe(false);
    expect(win(quests.revierstreit).jrUp).toBe(5);
    s.rp = 800;
    expect(questUnlocked(s, quests.kroll)).toBe(true);
    expect(questUnlocked(s, quests.voltaro)).toBe(false);
    expect(win(quests.kroll).jrUp).toBe(6);
    expect(win(quests.gorgo).jrUp).toBeNull();
    s.rp = 1200;
    expect(questUnlocked(s, quests.voltaro)).toBe(true);
    expect(questUnlocked(s, quests.voltaro_rotglut)).toBe(false);
    expect(win(quests.voltaro).jrUp).toBe(7);
    expect(questUnlocked(s, quests.voltaro_rotglut)).toBe(true);
    expect(win(quests.jaggo).jrUp).toBeNull();
    expect(s.jr).toBe(7);
    expect(sanitize({ jr: 99 }).jr).toBe(7);
  });
});
