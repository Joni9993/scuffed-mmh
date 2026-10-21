import { describe, expect, it } from 'vitest';
import { GATHER_KINDS } from '../../src/data/gather.js';
import { ITEMS } from '../../src/data/items.js';
import { RECIPES } from '../../src/data/recipes.js';
import { FOODS } from '../../src/data/foods.js';
import { ARMOR_PIECES } from '../../src/data/armor.js';
import { WEAPON_UPGRADES } from '../../src/data/weapons.js';
import { defaultSave } from '../../src/meta/save.js';
import { craftItem, cookMeal, setBarItem } from '../../src/meta/crafting.js';
import { sellPrice, SHOP_STOCK } from '../../src/meta/shop.js';

const NEW = ['giftbombe', 'donnerknallgurke', 'muscheltrunk', 'dschungelbrause', 'leuchtsignal', 'runenanker', 'frostbrause', 'splitterharz', 'glitchdestillat'];
const gathered = new Map();
for (const k of Object.values(GATHER_KINDS)) {
  for (const table of [k.drops, ...Object.values(k.dropsByZone ?? {})]) {
    for (const d of table) gathered.set(d.id, k.world ?? 'schotterklamm');
  }
}
const costs = (value) => Object.entries(value ?? {}).flatMap(([key, child]) => key === 'cost' ? child ? [child] : [] : child && typeof child === 'object' ? costs(child) : []);
const craftCosts = [...Object.values(RECIPES), ...Object.values(FOODS)].map((r) => r.cost);
const allCosts = [...craftCosts, ...costs(ARMOR_PIECES), ...costs(WEAPON_UPGRADES)];

describe('gathered resources have useful, reachable crafting routes', () => {
  it('covers every base and zone-specific drop on all four maps', () => {
    expect(gathered.size).toBe(29);
    for (const [id, world] of gathered) {
      expect(ITEMS[id], id).toBeDefined();
      expect(allCosts.some((cost) => cost[id] > 0) || ITEMS[id].kind === 'consumable', id).toBe(true);
      // Later-map gatherables all have a repeatable tool, potion or meal sink.
      if (world !== 'schotterklamm') expect(craftCosts.some((cost) => cost[id] > 0), id).toBe(true);
    }
  });

  it('uses real gathered ingredients, requires no boss rare drop and cannot print Schrott', () => {
    const vendor = new Set(SHOP_STOCK.map((r) => r.id));
    for (const id of NEW) {
      const r = RECIPES[id];
      expect(r.out).toBe(1);
      for (const [mat, n] of Object.entries(r.cost)) {
        expect(gathered.has(mat), `${id}: ${mat}`).toBe(true);
        expect(Number.isInteger(n) && n > 0 && n <= 2).toBe(true);
      }
      expect(Object.keys(r.cost).some((mat) => !vendor.has(mat)), id).toBe(true);
      const ingredientSale = Object.entries(r.cost).reduce((sum, [mat, n]) => sum + sellPrice(mat) * n, 0);
      expect(sellPrice(id) * r.out, id).toBeLessThanOrEqual(ingredientSale);
    }
  });

  it.each(NEW)('crafts %s, consumes exact costs and obeys carrying limits', (id) => {
    const s = defaultSave();
    s.box = { ...RECIPES[id].cost };
    expect(craftItem(s, id)).toEqual({ ok: true, id, n: 1 });
    expect(s.box[id]).toBe(1);
    for (const mat of Object.keys(RECIPES[id].cost)) expect(s.box[mat] ?? 0).toBe(0);
    s.loadout.items = [];
    s.box[id] = 99;
    expect(setBarItem(s, id, 99)).toEqual({ ok: true, n: ITEMS[id].max });
  });

  it.each(NEW)('does not consume ingredients for missing materials or full %s storage', (id) => {
    const s = defaultSave();
    s.box = {};
    const missing = structuredClone(s);
    expect(craftItem(s, id)).toMatchObject({ ok: false, reason: 'mats' });
    expect(s).toEqual(missing);
    s.box = { ...RECIPES[id].cost, [id]: 99 };
    const full = structuredClone(s);
    expect(craftItem(s, id)).toMatchObject({ ok: false, reason: 'full' });
    expect(s).toEqual(full);
  });

  it('keeps the first-map healing and staple recipes affordable as before', () => {
    expect(RECIPES.flickbrause.cost).toEqual({ knisterkraut: 1, sprudelwasser: 1 });
    expect(RECIPES.dicke_flickbrause.cost).toEqual({ flickbrause: 1, wabbelpilz: 1 });
    expect(RECIPES.knallgurke.cost).toEqual({ glutbrocken: 1, altknochen: 1 });
    expect(RECIPES.pustekuchen.cost).toEqual({ blaublatt: 1, brummkaefer: 1 });
  });

  it('the new hybrid meal still occupies the single meal slot', () => {
    const s = defaultSave();
    s.box = { kokosnuss: 2, feuerpilz: 2, dschungelkraut: 2 };
    s.schrott = 200;
    expect(cookMeal(s, 'dschungelcurry')).toEqual({ ok: true, id: 'dschungelcurry' });
    expect(FOODS.dschungelcurry.effect.atk).toBeLessThan(FOODS.glutgulasch.effect.atk);
    expect(FOODS.dschungelcurry.effect.maxStamina).toBeLessThan(FOODS.pustebrei.effect.maxStamina);
    const once = structuredClone(s);
    expect(cookMeal(s, 'dschungelcurry')).toMatchObject({ ok: false, reason: 'has_meal' });
    expect(s).toEqual(once);
  });
});
