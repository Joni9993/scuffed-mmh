import { describe, it, expect } from 'vitest';
import { coopHpMul, applyCoopScale } from '../../src/game/monsters/coopScale.js';

const mk = () => ({ maxHp: 9000, hp: 9000, alive: true, parts: [{ breakHp: 800, hp: 800, broken: false }, { breakHp: 600, hp: 0, broken: true }, { hp: Infinity }] });

describe('coopScale', () => {
  it('Faktoren 1/1,7/2,3/2,8, geklemmt', () => {
    expect([0, 1, 2, 3, 4, 7].map(coopHpMul)).toEqual([1, 1, 1.7, 2.3, 2.8, 2.8]);
  });
  it('skaliert HP + Teile, gebrochene Teile bleiben', () => {
    const m = mk(); applyCoopScale(m, 4);
    expect(m.maxHp).toBe(25200); expect(m.hp).toBe(25200);
    expect(m.parts[0].hp).toBeCloseTo(2240); expect(m.parts[1].hp).toBe(0); expect(m.parts[2].hp).toBe(Infinity);
  });
  it('Beitritt/Verlassen hält HP-Anteil, Rückkehr auf 1 = Ursprung', () => {
    const m = mk(); m.hp = 4500;
    applyCoopScale(m, 2); expect(m.hp / m.maxHp).toBeCloseTo(0.5);
    applyCoopScale(m, 3); applyCoopScale(m, 1);
    expect(m.maxHp).toBe(9000); expect(m.hp).toBeCloseTo(4500, 0);
  });
  it('Kleinvieh unverändert', () => {
    const m = { ...mk(), minor: true }; applyCoopScale(m, 4); expect(m.maxHp).toBe(9000);
  });
});
