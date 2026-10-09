// Phase 3 (balancing & bugfix) regression tests.
import { describe, it, expect, beforeEach } from 'vitest';
import { jaggo } from '../../src/game/monsters/jaggo.js';
import { time } from '../../src/core/time.js';
import { resolvePlayerHit } from '../../src/game/combat.js';
import { make } from './p3helpers.js';

beforeEach(() => time.reset());

describe('fix 1: elemental damage is applied once', () => {
  it('applyDamage removes exactly res.dmg HP (dmg already contains the element share)', () => {
    const { m } = make(jaggo);
    const part = m.partById.head; // fire weak (25)
    const attacker = { power: 100, critChance: 0, elems: { fire: 40 } };
    const res = resolvePlayerHit(attacker, { mv: 50 }, part, () => 1);
    expect(res.elemDmg).toBeGreaterThan(0);
    expect(res.dmg).toBe(Math.round(100 * 0.5 * part.factor + res.elemDmg)); // dmg = phys + elem
    const hp0 = m.hp;
    m.applyDamage(res);
    expect(hp0 - m.hp).toBe(res.dmg);
  });
  it('part break HP uses the same single total', () => {
    const { m } = make(jaggo);
    const part = m.partById.head;
    const res = resolvePlayerHit({ power: 100, critChance: 0, elems: { fire: 40 } }, { mv: 50 }, part, () => 1);
    const hp0 = part.hp;
    m.applyDamage(res);
    expect(hp0 - part.hp).toBe(res.dmg);
  });
});
