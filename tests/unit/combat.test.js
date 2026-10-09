import { describe, it, expect } from 'vitest';
import { calcDamage, resolvePlayerHit, protectReduction, HITSTOP } from '../../src/game/combat.js';
import { createRng } from '../../src/core/rng.js';

describe('damage formula (GDD 3.5)', () => {
  it('Schaden = Kraft x BW x Zone', () => {
    const d = calcDamage({ power: 80, mv: 48, zone: 1.0 });
    expect(d.total).toBeCloseTo(38.4, 5);
    expect(calcDamage({ power: 80, mv: 48, zone: 0.6 }).total).toBeCloseTo(23.04, 5);
  });
  it('crit x1.25, glitch x1.5, sauber x1.15 multiply', () => {
    const base = calcDamage({ power: 100, mv: 100, zone: 1 }).total;
    expect(calcDamage({ power: 100, mv: 100, zone: 1, crit: true }).total).toBeCloseTo(base * 1.25);
    expect(calcDamage({ power: 100, mv: 100, zone: 1, glitch: true }).total).toBeCloseTo(base * 1.5);
    expect(calcDamage({ power: 100, mv: 100, zone: 1, sauber: true }).total).toBeCloseTo(base * 1.15);
    expect(calcDamage({ power: 100, mv: 100, zone: 1, crit: true, glitch: true, sauber: true }).total).toBeCloseTo(base * 1.25 * 1.5 * 1.15);
  });
  it('adds element damage on top (elem power x zone factor)', () => {
    const d = calcDamage({ power: 100, mv: 50, zone: 1, elem: 25, elemZone: 0.25 });
    expect(d.phys).toBeCloseTo(50);
    expect(d.elemDmg).toBeCloseTo(6.25);
    expect(d.total).toBeCloseTo(56.25);
  });
  it('defence = protect / (protect + 80)', () => {
    expect(protectReduction(80)).toBeCloseTo(0.5);
    expect(protectReduction(5)).toBeCloseTo(5 / 85);
  });
});

describe('resolvePlayerHit', () => {
  const head = { id: 'head', factor: 1.0, elem: { fire: 25 } };
  const body = { id: 'body', factor: 0.7, elem: {} };
  const hit = { mv: 65, blunt: 20, wucht: 12, hitstop: 'heavy' };
  const att = { power: 80, critChance: 0, elems: {} };
  const rng = createRng(1);

  it('weak spots (factor >= 0.9) are flagged, body is not', () => {
    expect(resolvePlayerHit(att, hit, head, rng).weak).toBe(true);
    expect(resolvePlayerHit(att, hit, body, rng).weak).toBe(false);
    expect(resolvePlayerHit(att, hit, head, rng).dmg).toBe(Math.round(80 * 0.65));
  });
  it('glitch bonus and sleeping bonus', () => {
    const g = resolvePlayerHit({ ...att, glitch: true }, hit, head, rng);
    expect(g.dmg).toBe(Math.round(80 * 0.65 * 1.5));
    const s = resolvePlayerHit(att, hit, head, rng, { sleeping: true });
    expect(s.dmg).toBe(Math.round(80 * 0.65 * 2));
  });
  it('crit is deterministic with seeded rng', () => {
    const a = resolvePlayerHit({ ...att, critChance: 1 }, hit, head, createRng(5));
    expect(a.crit).toBe(true);
    expect(a.dmg).toBe(Math.round(80 * 0.65 * 1.25));
  });
  it('elements use part zone factor', () => {
    const r = resolvePlayerHit({ ...att, elems: { fire: 100 } }, hit, head, rng);
    expect(r.elemDmg).toBe(25);
  });
  it('carries blunt, wucht and hitstop size', () => {
    const r = resolvePlayerHit(att, hit, head, rng);
    expect(r.blunt).toBe(20);
    expect(r.wucht).toBe(12);
    expect(r.hitstop).toBe(HITSTOP.heavy);
  });
});
