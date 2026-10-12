// Schmiede-Glow: Hilfsfunktionen canCraftArmor / canUpgradeWeapon (gleiche Prüfung wie craftArmor / upgradeWeapon).
import { describe, it, expect } from 'vitest';
import { defaultSave } from '../../src/meta/save.js';
import { ARMOR_PIECES } from '../../src/data/armor.js';
import { canCraftArmor, craftArmor, canUpgradeWeapon, weaponUpgradeOptions } from '../../src/meta/crafting.js';

const id = Object.keys(ARMOR_PIECES).find((k) => ARMOR_PIECES[k].cost);
describe('Schmiede-Glow', () => {
  it('Rüstung: arm = nein, reich = ja, besitzt = nein', () => {
    const s = defaultSave(); s.schrott = 0; s.box = {};
    expect(canCraftArmor(s, id).ok).toBe(false);
    s.schrott = 99999; s.box = Object.fromEntries(Object.keys(ARMOR_PIECES[id].cost).map((k) => [k, 99]));
    expect(canCraftArmor(s, id).ok).toBe(true);
    expect(craftArmor(s, id).ok).toBe(true);
    expect(canCraftArmor(s, id).reason).toBe('owned');
    expect(canCraftArmor(s, 'nix').ok).toBe(false);
  });
  it('Waffe: folgt weaponUpgradeOptions', () => {
    const s = defaultSave(); s.schrott = 0; s.box = {};
    expect(canUpgradeWeapon(s, 'bow')).toBe(weaponUpgradeOptions(s, 'bow').some((o) => o.ok));
    s.schrott = 99999; s.box = { altknochen: 99, grossknochen: 99, jaggo_schuppe: 99, jaggo_kamm: 99, jaggo_fell: 99, glimmstein: 99, schrotterz: 99 };
    expect(canUpgradeWeapon(s, 'bow')).toBe(weaponUpgradeOptions(s, 'bow').some((o) => o.ok));
  });
});
