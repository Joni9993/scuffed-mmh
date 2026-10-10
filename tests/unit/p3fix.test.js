// Phase 3 (balancing & bugfix) regression tests.
import { describe, it, expect, beforeEach } from 'vitest';
import { jaggo } from '../../src/game/monsters/jaggo.js';
import { time } from '../../src/core/time.js';
import { resolvePlayerHit } from '../../src/game/combat.js';
import { make, makeCtx, DT } from './p3helpers.js';
import { jaggling, spawnPack, MAX_JAGGLINGE } from '../../src/game/monsters/jaggling.js';

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

describe('fix 5: ambient Jagglinge', () => {
  it('ambient packs do not count against the Rudelruf cap and vice versa', () => {
    const ctx = makeCtx();
    const amb = spawnPack(ctx, { x: 30, z: 30 }, 3, { ambient: true });
    expect(amb.length).toBe(3);
    expect(amb.every((m) => m.ambient)).toBe(true);
    const call = spawnPack(ctx, { x: 0, z: 0 }, 2, { state: 'combat' });
    expect(call.length).toBe(2); // the call still gets its pack although 3 ambient ones are alive
    const more = spawnPack(ctx, { x: 0, z: 0 }, 5);
    expect(more.length).toBe(MAX_JAGGLINGE - 2);
  });
  it('ambient Jagglinge wander around their home and give up a chase when the hunter is far away', () => {
    const { ctx, m, p } = make(jaggling, 'wander');
    m.ambient = true; m.home = { x: 0, z: 0 };
    p.spawnAt(0, 60, 0);
    m.target = p; m.discovered = true; m.setState('combat');
    for (let i = 0; i < 20; i++) m.update(DT);
    expect(m.state).toBe('wander');
    for (let i = 0; i < 60 * 40; i++) m.update(DT);
    expect(Math.hypot(m.pos.x, m.pos.z)).toBeLessThan(26); // stays near home, not on a Brocken route
    expect(ctx).toBeTruthy();
  });
});
