// Waffenlager (Owner Okt 2026): mehrere Waffen je Typ, neue Stufe 1 bauen, tauschen, verschrotten, Camp-Truhe.
import { describe, it, expect } from 'vitest';
import { defaultSave, sanitize } from '../../src/meta/save.js';
import { buildNewWeapon, swapWeapon, scrapWeapon, ownedWeaponList, upgradeWeapon, equipWeaponState } from '../../src/meta/crafting.js';
import { HuntChest, applyChestResult } from '../../src/meta/huntChest.js';
import { buildLoadout } from '../../src/meta/loadout.js';

const rich = () => { const s = defaultSave(); s.schrott = 99999; s.weapons.bow = { tier: 3, branch: 'a' }; return s; };

describe('Waffenlager', () => {
  it('neue Stufe 1 bauen: alte ins Lager, neue aktiv + ausgerüstet, kostet Schrott', () => {
    const s = rich();
    const r = buildNewWeapon(s, 'bow');
    expect(r.ok).toBe(true);
    expect(s.weapons.bow).toEqual({ tier: 1, branch: null });
    expect(s.armory).toEqual([{ type: 'bow', tier: 3, branch: 'a' }]);
    expect(s.loadout.weapon).toBe('bow'); expect(s.schrott).toBe(99999 - 150);
    expect(buildNewWeapon({ ...defaultSave(), schrott: 0 }, 'gs').reason).toBe('mats');
  });
  it('die neue lässt sich auf einen anderen Ast schmieden, beide bleiben', () => {
    const s = rich(); s.box = { altknochen: 99, grossknochen: 99, jaggo_schuppe: 99, jaggo_kamm: 99, jaggo_fell: 99, barrotz_kruste: 99, barrotz_platte: 99, barrotz_schwanzleder: 99, glimmstein: 99, schrotterz: 99 };
    buildNewWeapon(s, 'bow');
    expect(upgradeWeapon(s, 'bow').ok).toBe(true);
    const r = upgradeWeapon(s, 'bow', 'b');
    if (r.ok) expect(s.weapons.bow).toEqual({ tier: 3, branch: 'b' });
    expect(ownedWeaponList(s, 'bow').length).toBe(2);
  });
  it('tauschen und verschrotten', () => {
    const s = rich(); buildNewWeapon(s, 'bow');
    expect(swapWeapon(s, 0).ok).toBe(true);
    expect(s.weapons.bow).toEqual({ tier: 3, branch: 'a' }); expect(s.armory[0]).toEqual({ type: 'bow', tier: 1, branch: null });
    const before = s.schrott; expect(scrapWeapon(s, 0).ok).toBe(true);
    expect(s.armory.length).toBe(0); expect(s.schrott).toBe(before + 20);
  });
  it('Spielstand: Lager wird geprüft und bleibt erhalten', () => {
    const s = sanitize({ armory: [{ type: 'kt', tier: 5, branch: 'g' }, { type: 'xx', tier: 1 }, { type: 'gs', tier: 9 }] });
    expect(s.armory).toEqual([{ type: 'kt', tier: 5, branch: 'g' }, { type: 'gs', tier: 6, branch: 'v' }]);
    expect(sanitize({}).armory).toEqual([]);
  });
  it('Camp-Truhe: Lager-Waffe wählen, nach der Jagd ist sie aktiv', () => {
    const s = rich(); buildNewWeapon(s, 'bow');
    const ch = new HuntChest(s, { count: () => 0 }, buildLoadout(s));
    expect(ch.allWeapons().map((w) => w.key)).toContain('bow|3|a');
    expect(ch.setWeapon('bow|3|a').ok).toBe(true);
    expect(ch.loadout().weapon).toEqual({ type: 'bow', tier: 3, branch: 'a' });
    applyChestResult(s, ch.result());
    expect(s.weapons.bow).toEqual({ tier: 3, branch: 'a' }); expect(s.loadout.weapon).toBe('bow');
    expect(equipWeaponState(s, { type: 'bow', tier: 1, branch: null }).ok).toBe(true);
  });
});
