import { describe, it, expect } from 'vitest';
import { pickAwards } from '../../src/meta/awards.js';

describe('pickAwards', () => {
  it('solo leer → mindestens eine', () => {
    expect(pickAwards({}).length).toBe(1);
    expect(pickAwards(undefined)[0].id).toBe('dabei');
  });
  it('deterministisch, max 3', () => {
    const s = { damage: 5000, hits: 80, perfect: 6, kos: 3, glitchDmg: 900, rolls: 20, time: 200 };
    const a = pickAwards(s);
    expect(a).toEqual(pickAwards(s));
    expect(a.length).toBe(3);
    for (const x of a) expect(x.title && x.text && x.id).toBeTruthy();
  });
  it('Trottel bei KOs, Glitch-Gott nur mit glitchDmg', () => {
    expect(pickAwards({ kos: 4 }).map((x) => x.id)).toContain('trottel');
    expect(pickAwards({ damage: 10, kos: 0 }).map((x) => x.id)).not.toContain('glitchgott');
  });
  it('Koop: Mitspieler mit mehr KOs nimmt Trottel', () => {
    expect(pickAwards({ kos: 2 }, [{ kos: 5 }]).map((x) => x.id)).not.toContain('trottel');
  });
});
