import { describe, it, expect } from 'vitest';
import { defaultSave } from '../../src/meta/save.js';
import { boxAdd } from '../../src/meta/inventory.js';
import { buy, sell, canBuy, sellPrice, SHOP_STOCK } from '../../src/meta/shop.js';

describe('shop', () => {
  it('buys with Schrott, respects JR and box cap', () => {
    const s = defaultSave();
    expect(canBuy(s, 0).reason).toBe('schrott');
    s.schrott = 100;
    expect(buy(s, 0)).toMatchObject({ ok: true, id: 'flickbrause', price: 30 });
    expect(s.schrott).toBe(70);
    const spitze = SHOP_STOCK.findIndex((e) => e.id === 'brennspitze');
    expect(buy(s, spitze).reason).toBe('locked');
    s.jr = 2;
    expect(buy(s, spitze).ok).toBe(true);
    expect(s.box.brennspitze).toBe(10);
    s.box.flickbrause = 99; s.schrott = 500;
    expect(buy(s, 0).reason).toBe('full');
  });
  it('sells at 40 % of base value', () => {
    expect(sellPrice('flickbrause')).toBe(12);
    expect(sellPrice('knisterkraut')).toBe(3);
    const s = defaultSave();
    boxAdd(s, 'altknochen', 5);
    expect(sell(s, 'altknochen', 3)).toMatchObject({ ok: true, n: 3, gain: 12 });
    expect(s.box.altknochen).toBe(2);
    expect(sell(s, 'altknochen', 10).n).toBe(2);
    expect(sell(s, 'altknochen').reason).toBe('none');
    expect(sell(s, 'quatsch').reason).toBe('unknown');
  });
});
