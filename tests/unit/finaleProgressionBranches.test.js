import { describe, it, expect } from 'vitest';
import { FINALE_BRANCHES, FINALE_TRAITS, WEAPON_ORDER, WEAPON_UPGRADES, weaponStats, upgradeOptions } from '../../src/data/weapons.js';
import { makeGear, encodeGear, decodeGear, GEAR_SETS } from '../../src/data/gearlook.js';
import { ITEMS } from '../../src/data/items.js';
import { defaultSave, sanitize } from '../../src/meta/save.js';
import { upgradeWeapon, buildNewWeapon, equipWeaponState, ownedWeaponList } from '../../src/meta/crafting.js';

function fund(save,cost){save.schrott=cost.schrott??0;save.box=Object.fromEntries(Object.entries(cost).filter(([id])=>id!=='schrott'));}
describe('Glitchgrat boss weapon paths',()=>{
  it('gives every weapon three independently craftable dragon paths plus the legacy convergence',()=>{
    for(const type of WEAPON_ORDER)for(const source of ['v','x']){
      const options=upgradeOptions(type,6,source);
      expect(options.map(o=>o.branch)).toEqual(['p','f','i',null]);
      expect(new Set(options.map(o=>o.name)).size).toBe(4);
      for(const option of options){
        for(const [id,n]of Object.entries(option.cost)){expect(n).toBeGreaterThan(0);if(id!=='schrott')expect(ITEMS[id],id).toBeTruthy();}
        const save=defaultSave();save.weapons[type]={tier:6,branch:source};
        const before=JSON.stringify(save);expect(upgradeWeapon(save,type,option.branch)).toMatchObject({ok:false,reason:'mats'});expect(JSON.stringify(save)).toBe(before);
        fund(save,option.cost);expect(upgradeWeapon(save,type,option.branch)).toMatchObject({ok:true,tier:7,branch:option.branch});
        expect(save.schrott).toBe(0);expect(Object.keys(save.box)).toHaveLength(0);
        const stats=weaponStats(type,7,option.branch);expect(stats.power).toBeGreaterThan(weaponStats(type,6,source).power);
        expect(stats.finaleAspect).toBe(option.branch??'u');expect(stats.ability).toEqual(FINALE_TRAITS[option.branch??'u']);
      }
    }
  });
  it('converges each dragon into Ur at tier seven without losing its role or allowing infinite upgrades',()=>{
    for(const type of WEAPON_ORDER)for(const branch of FINALE_BRANCHES){
      const save=defaultSave();save.weapons[type]={tier:7,branch};
      expect(upgradeOptions(type,7,branch)).toHaveLength(1);
      const before=JSON.stringify(save);expect(upgradeWeapon(save,type)).toMatchObject({ok:false,reason:'mats'});expect(JSON.stringify(save)).toBe(before);
      fund(save,WEAPON_UPGRADES[7].cost);expect(upgradeWeapon(save,type)).toMatchObject({ok:true,tier:7,branch:null});
      expect(weaponStats(type,7).type).toBe(type);expect(upgradeWeapon(save,type)).toMatchObject({ok:false,reason:'maxed'});
    }
  });
  it('preserves dragon choices in active equipment, armory swaps, saves and compact network gear',()=>{
    for(const type of WEAPON_ORDER)for(const branch of [...FINALE_BRANCHES,null]){
      const weapon={type,tier:7,branch};
      expect(makeGear({weapon}).weapon).toEqual(weapon);expect(decodeGear(encodeGear({weapon})).weapon).toEqual(weapon);
      const save=defaultSave();save.weapons[type]={tier:7,branch};save.schrott=150;
      expect(buildNewWeapon(save,type).ok).toBe(true);expect(ownedWeaponList(save,type).find(w=>!w.active).branch).toBe(branch);
      expect(equipWeaponState(save,weapon).ok).toBe(true);
      const sanitized=sanitize(JSON.parse(JSON.stringify(save)));
      expect(sanitized.weapons[type]).toEqual({tier:7,branch});expect(sanitized.loadout.weapon).toBe(type);
    }
    const legacy=defaultSave();legacy.weapons.gs={tier:7,branch:null};expect(sanitize(legacy).weapons.gs).toEqual(legacy.weapons.gs);
  });
  it('rejects invalid branch requests without payment and keeps old network armor indices stable',()=>{
    const save=defaultSave();save.weapons.gs={tier:6,branch:'x'};fund(save,WEAPON_UPGRADES[7].cost);
    const before=JSON.stringify(save);expect(upgradeWeapon(save,'gs','bogus')).toMatchObject({ok:false,reason:'branch'});expect(JSON.stringify(save)).toBe(before);
    expect(GEAR_SETS.slice(0,12)).toEqual(['lumpen','fellkluft','knochenkram','jaggo','barrotz','brathalos','kroll','gorgo','voltaro','blendax','mampfaffe','krachfaust']);
    expect(GEAR_SETS.slice(12)).toEqual(['pyrostur','felsengroll','voltiris','gockelok']);
  });
  it('can keep all 28 final weapons across active equipment and storage without save truncation',()=>{
    const save=defaultSave();
    for(const type of WEAPON_ORDER){
      save.weapons[type]={tier:7,branch:null};
      for(const branch of FINALE_BRANCHES)save.armory.push({type,tier:7,branch});
    }
    expect(save.armory).toHaveLength(21);
    const restored=sanitize(JSON.parse(JSON.stringify(save)));
    expect(restored.armory).toEqual(save.armory);
    expect(ownedWeaponList(restored)).toHaveLength(28);
  });
});
