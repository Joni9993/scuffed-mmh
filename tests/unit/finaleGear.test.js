import { describe, it, expect } from 'vitest';
import { WEAPON_ORDER, WEAPON_TYPES, WEAPON_UPGRADES, MAX_WEAPON_TIER, weaponStats, upgradeOptions } from '../../src/data/weapons.js';
import { makeGear, encodeGear, decodeGear, gearBranch } from '../../src/data/gearlook.js';
import { defaultSave, sanitize } from '../../src/meta/save.js';
import { upgradeWeapon } from '../../src/meta/crafting.js';
import { ITEMS } from '../../src/data/items.js';
import { getWeapon } from '../../src/game/weapons/index.js';

const countMeshes = (root) => { let count = 0; root.traverse((o) => { if (o.isMesh) count++; }); return count; };

describe('Glitch-Transzendenz final seven-weapon reward', () => {
  it('upgrades both previous branches once, using all four bosses and ore', () => {
    expect(MAX_WEAPON_TIER).toBe(7);
    const cost = WEAPON_UPGRADES[7].cost;
    for (const key of ['pyrostur_schuppe', 'felsengroll_panzer', 'voltiris_horn', 'gockel_sporn', 'gockel_feder', 'ur_gockelei', 'glitchgrat_erz']) {
      expect(cost[key]).toBeGreaterThan(0); expect(ITEMS[key]).toBeTruthy();
    }
    for (const type of WEAPON_ORDER) for (const branch of ['v', 'x']) {
      const previous = weaponStats(type, 6, branch), final = weaponStats(type, 7);
      expect(WEAPON_TYPES[type].tiers).toHaveLength(7); expect(final.power).toBeGreaterThan(previous.power);
      expect(final.branch).toBeNull(); expect(final.crit).toBeGreaterThanOrEqual(previous.crit);
      expect(upgradeOptions(type, 6, branch)).toHaveLength(4); expect(upgradeOptions(type, 7)).toHaveLength(0);
      const save = defaultSave(); save.weapons[type] = { tier: 6, branch };
      const old = JSON.stringify(save); expect(upgradeWeapon(save, type).ok).toBe(false); expect(JSON.stringify(save)).toBe(old);
      save.schrott = cost.schrott; save.box = Object.fromEntries(Object.entries(cost).filter(([k]) => k !== 'schrott'));
      expect(upgradeWeapon(save, type)).toMatchObject({ ok: true, tier: 7, branch: null });
      expect(upgradeWeapon(save, type).reason).toBe('maxed');
    }
  });
  it('roundtrips all seven types over network gear and save/armory sanitization', () => {
    const save = defaultSave();
    for (const type of WEAPON_ORDER) {
      const weapon = { type, tier: 7, branch: null };
      expect(makeGear({ weapon }).weapon).toEqual(weapon); expect(decodeGear(encodeGear({ weapon })).weapon).toEqual(weapon);
      expect(gearBranch(7, 'x')).toBeNull(); save.weapons[type] = { tier: 7, branch: null };
    }
    save.armory = WEAPON_ORDER.map((type) => ({ type, tier: 7, branch: null }));
    expect(sanitize(JSON.parse(JSON.stringify(save))).weapons).toEqual(save.weapons);
    expect(sanitize(JSON.parse(JSON.stringify(save))).armory).toEqual(save.armory);
  });
  it('keeps each real weapon rig, animation hooks and sockets with bounded boss geometry', () => {
    for (const type of WEAPON_ORDER) {
      const def = getWeapon(type), previous = def.buildMesh({ tier: 6, branch: 'v' }), final = def.buildMesh({ tier: 7 });
      expect(final.userData.transcendence.type).toBe(type);
      expect(countMeshes(final) - countMeshes(previous)).toBeLessThanOrEqual(type === 'ga' ? 9 : 3);
      for (const key of ['muzzle', 'twoHand', 'bow', 'katana', 'ga', 'lb']) if (previous.userData[key]) expect(final.userData[key]).toBeTruthy();
      expect(final.userData.twoHand).toEqual(previous.userData.twoHand);
      const trim = final.userData.transcendence;
      expect(trim.material.userData.ps1.uJit.value).toBe(.032);
      expect(trim.ornament.geometry.attributes.position.count).toBeLessThan(8000);
      expect(final.userData.fx.reduce((n, s) => n + s.rate, 0)).toBeLessThanOrEqual(3);
      if (type === 'db') expect(final.userData.offhand.userData.transcendence.type).toBe('db');
      // Building another weapon must not overwrite the first weapon's geometry or uniform.
      const other = def.buildMesh({ tier: 7 }); expect(other).not.toBe(final);
      expect(other.userData.transcendence.material).not.toBe(trim.material);
    }
  });
});
