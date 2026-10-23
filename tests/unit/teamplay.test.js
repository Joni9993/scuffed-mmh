import { describe, it, expect, vi } from 'vitest';
import { createTeamplay, cleanTeamPing } from '../../src/game/teamplay.js';
import { createBus } from '../../src/core/events.js';

function setup(guest = false) {
  const players = ['a', 'b', 'c'].map(id => ({ id, name: id.toUpperCase(), alive: true, pos: { x: 0, z: 0 }, glitch: { energy: 100, active: false } }));
  const monster = { id: 'boss', def: { name: 'Jaggo' }, maxHp: 1000, alive: true, partById: { head: { id: 'head', label: 'Kopf' } } };
  const h = { time: 0, players, player: players[0], monsters: [monster], bus: createBus(), net: { isGuest: guest, broadcastTeam: vi.fn(), requestTeamPing: vi.fn() } };
  const api = h.teamplay = createTeamplay(h);
  const damage = (owner, dmg = 30, extra = {}) => h.bus.emit('monsterDamaged', { monster, res: { attackerId: owner, dmg, ...extra } });
  return { h, api, monster, damage };
}
describe('Shared hero moments', () => {
  it('a teammate must actually exploit a host-confirmed opening; self hits and environmental damage do not count', () => {
    const { h, api, monster, damage } = setup();
    h.bus.emit('partBreak', { monster, part: 'head', attackerId: 'a' });
    damage('a', 200); damage('b', 200, { env: true }); expect(api.summary()).toHaveLength(0);
    damage('b', 10); expect(api.summary()).toHaveLength(0);
    damage('b', 20); expect(api.summary()[0]).toMatchObject({ title: 'Vorlage verwandelt', participants: ['a', 'b'] });
    damage('c', 200); expect(api.summary()).toHaveLength(1);
  });
  it('expired, solo and client-predicted windows cannot grant credit', () => {
    for (const mode of ['expired', 'solo', 'guest']) {
      const { h, api, monster, damage } = setup(mode === 'guest');
      if (mode === 'solo') h.players.splice(1);
      h.bus.emit('partBreak', { monster, part: 'head', attackerId: 'a' });
      if (mode === 'expired') h.time = 3;
      damage('b', 200); expect(api.summary(), mode).toHaveLength(0);
    }
  });
  it.each(['trap', 'flash'])('%s: the item user receives setup credit, not the host', kind => {
    const { h, api, monster, damage } = setup();
    h.bus.emit('monsterOpening', { monster, kind, attackerId: 'b' }); damage('a');
    expect(api.summary()[0].participants).toEqual(['b', 'a']);
  });
  it('an actual interrupted attack on a low-health teammate is recognized as a rescue', () => {
    const { h, api, monster } = setup();
    h.bus.emit('partBreak', { monster, attackerId: 'a', threatened: 'c' });
    expect(api.summary()[0]).toMatchObject({ title: 'Rettung in letzter Sekunde', participants: ['a', 'c'] });
  });
  it('a nearby Krachkiste attack buff followed by damage creates a shared moment; distance and expiry matter', () => {
    const { h, api, damage } = setup();
    h.players[2].pos.x = 20;
    api.support('b', { x: 0, z: 0, buffs: [{ c: 'r', lvl: 1 }] });
    damage('c', 100); expect(api.summary()).toHaveLength(0);
    damage('a', 50); expect(api.summary()[0]).toMatchObject({ title: 'Im selben Takt', participants: ['b', 'a'] });
    h.time = 20; api.update(); damage('c', 100); expect(api.summary()).toHaveLength(1);
  });
  it('all guests receive the same event once, and the immutable summary survives later notifications', () => {
    const host = setup(), guest = setup(true);
    host.h.bus.emit('partBreak', { monster: host.monster, attackerId: 'a' }); host.damage('b');
    for (const [e] of host.h.net.broadcastTeam.mock.calls) { guest.api.receive(JSON.parse(JSON.stringify(e))); guest.api.receive(e); }
    expect(guest.api.summary()).toEqual(host.api.summary());
    expect(guest.api.summary()).toHaveLength(1);
  });
  it('pings validate the living sender, existing target and cooldown, and ignore injected world positions', () => {
    const { h, api } = setup();
    expect(cleanTeamPing({ kind: 'focus', monster: 'boss', part: 'missing' }, h, 'a')).toBeNull();
    expect(cleanTeamPing({ kind: 'trap' }, h, 'unknown')).toBeNull();
    expect(api.ping({ kind: 'trap', x: 999, z: NaN }, 'b')).toBe(true);
    expect(h.net.broadcastTeam.mock.calls[0][0]).toMatchObject({ owner: 'b', x: 0, z: 0 });
    expect(api.ping({ kind: 'glitch' }, 'b')).toBe(false);
    h.time = 4; expect(api.ping({ kind: 'focus', monster: 'boss', part: 'head' }, 'b')).toBe(true);
  });
});
