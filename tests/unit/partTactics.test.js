import { describe, it, expect } from 'vitest';
import { monsters } from '../../src/game/monsters/index.js';
import { PART_TACTICS, partTactic, partCondition } from '../../src/data/partTactics.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';

describe('Tactical part breaks', () => {
  it('every explicit hint references a real breakable part; every breakable part has a plan', () => {
    for (const [id, parts] of Object.entries(PART_TACTICS)) for (const part of Object.keys(parts)) expect(monsters[id].parts.find(p => p.id === part)?.breakHp, `${id}/${part}`).toBeGreaterThan(0);
    for (const def of Object.values(monsters)) for (const part of def.parts ?? []) if (part.breakHp) {
      const text = partTactic({ def }, part); expect(text.before.length).toBeGreaterThan(20); expect(text.after.length).toBeGreaterThan(20);
    }
  });
  it('condition reports functional states and remains correct when HP scales in coop', () => {
    expect(partCondition({ gone: true, broken: true })).toBe('Abgetrennt');
    expect(partCondition({ broken: true })).toBe('Gebrochen');
    for (const mul of [1, 1.53, 3.24]) {
      expect(partCondition({ hp: 24 * mul, breakHp: 100 * mul })).toBe('Kurz vor Bruch');
      expect(partCondition({ hp: 50 * mul, breakHp: 100 * mul })).toBe('Angeschlagen');
    }
  });
  it('Barrotz loses his outer sweep, gains a matching short marker and increases charge pressure', () => {
    const a = monsters.barrotz.attacks, normal = a.barrotz_feger, short = a.barrotz_stummelfeger;
    expect(normal.lockedByBreak).toBe('tail'); expect(short.needsBroken).toBe('tail');
    expect(Math.abs(short.hits[0].to[2])).toBeLessThan(Math.abs(normal.hits[0].to[2]) * .7);
    expect(short.marker.radius).toBeCloseTo(normal.marker.radius * .65);
    expect(short.hits[0].radius).toBeLessThan(normal.hits[0].radius);
    expect(a.barrotz_ramm.weight({ partById: { tail: { broken: true } } })).toBeGreaterThan(a.barrotz_ramm.weight({ partById: { tail: { broken: false } } }));
    const params = { origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: -4 }, seed: 3 };
    const host = new AttackInstance(short, params), guest = new AttackInstance(short, JSON.parse(JSON.stringify(params)));
    for (let t = 0; t < 2; t += .03) expect(guest.hitsAt(t)).toEqual(host.hitsAt(t));
  });
  it('Brathalos compensates his damaged head with more fire-carpet pressure', () => {
    const a = monsters.brathalos.attacks.brathalos_feuerteppich;
    expect(a.weight({ partById: { head: { broken: true } } })).toBe(6);
    expect(a.weight({ partById: { head: { broken: false } } })).toBe(3);
  });
});
