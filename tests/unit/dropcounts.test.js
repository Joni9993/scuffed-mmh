// Owner-Feedback Okt 2026: Beute-Faktoren (Mutatoren, Feldstudie, Rotglut) dürfen nie Bruchteile von Material erzeugen.
import { describe, it, expect } from 'vitest';
import { scaleCount, rollBreak, rollReward, rollCarve } from '../../src/data/drops.js';
import { createRng } from '../../src/core/rng.js';
import { boxAdd } from '../../src/meta/inventory.js';

describe('ganze Drop-Mengen', () => {
  it('scaleCount liefert ganze Zahlen mit erhaltenem Erwartungswert', () => {
    const rng = createRng(4); let sum = 0;
    for (let i = 0; i < 4000; i++) { const n = scaleCount(3, 1.3, rng); expect(Number.isInteger(n)).toBe(true); expect(n === 3 || n === 4).toBe(true); sum += n; }
    expect(sum / 4000).toBeCloseTo(3.9, 1);
    expect(scaleCount(2, 2, rng)).toBe(4);
  });
  it('Feldstudie-Faktor (1,95) -> nur ganze Stücke bei Bruch, Belohnung und Zerlegen', () => {
    const rng = createRng(9);
    for (let i = 0; i < 300; i++) {
      for (const d of [...rollBreak('brathalos', 'head', rng, { matMul: 1.95 }), ...rollReward('brathalos', rng, { matMul: 1.95 }), rollCarve('brathalos', rng, { matMul: 1.95 })]) expect(Number.isInteger(d.n)).toBe(true);
    }
  });
  it('Truhe nimmt nur ganze Stücke', () => {
    const save = { box: {} };
    boxAdd(save, 'brathalos_schuppe', 2.7);
    expect(save.box.brathalos_schuppe).toBe(2);
  });
});
