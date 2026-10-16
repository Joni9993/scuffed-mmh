import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { HuntNet } from '../../src/net/sync.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { Player } from '../../src/game/player.js';
import { monsters } from '../../src/game/monsters/index.js';
import { createWorld } from '../../src/game/world/index.js';
import { makeCtx, DT } from './p3helpers.js';
import { time } from '../../src/core/time.js';
import { MIGRATION } from '../../src/game/monsters/apexFlight.js';

let world, clock;
beforeAll(() => { world = createWorld('glitchgrat', { seed: 7 }); });
beforeEach(() => { time.reset(); clock = 10000; vi.spyOn(performance, 'now').mockImplementation(() => clock); });
afterEach(() => vi.restoreAllMocks());

function pair(id) {
  const endpoints = [], hunts = [];
  for (let index = 0; index < 2; index++) {
    const handlers = new Map();
    const send = (kind, data) => {
      const other = endpoints[1 - index];
      for (const fn of other?.handlers.get(kind) ?? []) fn(JSON.parse(JSON.stringify(data)), `p${index}`);
    };
    const endpoint = { isHost: index === 0, myId: `p${index}`, hostId: 'p0', handlers, rtt: 0,
      on(kind, fn) { if (!handlers.has(kind)) handlers.set(kind, new Set()); handlers.get(kind).add(fn); return () => handlers.get(kind).delete(fn); },
      sendAll: send, sendHost: send, dispose() {}, onLeave() {}, onLost() {},
      session: { send, member: () => ({ colorIdx: 0 }) }, rttOf: () => 0 };
    endpoints.push(endpoint);
    const ctx = makeCtx(7); ctx.world = world; ctx.scene = new THREE.Scene(); ctx.timeLeft = 1500; ctx.teamKo = 0;
    ctx.netFinish = vi.fn(); ctx.netAbort = vi.fn();
    const n = world.nestFor(id), m = new Monster(monsters[id], ctx, { id: 'boss', ...n, state: 'combat', seed: 7, authority: index === 0 });
    ctx.monsters.push(m); m.recover = 999; m.fleeUsed = true;
    const p = new Player({ ctx, id: `p${index}` }); p.spawnAt(n.x, n.z + 12, Math.PI); p.god = true;
    ctx.player = p; ctx.players.push(p); m.target = p;
    ctx.net = new HuntNet(ctx, endpoint, { players: [] });
    hunts.push(ctx);
  }
  const step = (frames) => {
    for (let i = 0; i < frames; i++) {
      clock += DT * 1000;
      hunts[0].net.update(DT); hunts[1].net.update(DT);
      hunts[0].monsters[0].update(DT); hunts[1].monsters[0].tickRemote(DT);
    }
  };
  return { host: hunts[0], guest: hunts[1], m: hunts[0].monsters[0], remote: hunts[1].monsters[0], step };
}

describe('Glitchgrat through the real HuntNet protocol handlers', () => {
  for (const id of ['pyrostur', 'felsengroll', 'voltiris', 'gockelok']) {
    it(`${id}: replays attack, phase, breaks, guest damage and death`, () => {
      const { host, guest, m, remote, step } = pair(id);
      const attack = Object.values(m.def.attacks).find((a) => !a.internal && a.hits?.some((h) => h.dmg));
      m.beginAttack(attack.id, { tgMul: 1.1, tempoMul: 1.15 });
      expect(remote.attack?.id).toBe(attack.id);
      expect(remote.attack.inst.duration).toBeCloseTo(m.attack.inst.duration, 6);
      step(20);
      expect(remote.pos.distanceTo(m.pos)).toBeLessThan(.05);
      m._interrupt(); m.phase = 2; step(20);
      expect(remote.phase).toBe(2);
      const part = m.parts.find((p) => p.breakHp);
      m._breakPart(part);
      expect(remote.partById[part.id].broken).toBe(true);
      step(20);
      const hp = m.hp;
      guest.net.sendHit(remote, { dmg: 100, elemDmg: 0, partId: 'body', blunt: 0 });
      expect(m.hp).toBeLessThan(hp);
      expect(host.net.stats.hitsApplied).toBe(1);
      for (let i = 0; i < 20 && m.alive; i++) guest.net.sendHit(remote, { dmg: 4000, elemDmg: 0, partId: 'body', blunt: 0 });
      expect(m.alive).toBe(false); expect(remote.alive).toBe(false);
    });
  }

  it('migrates over different elevations on host and guest, landing in the same safe zone', () => {
    const { host, guest, m, remote, step } = pair('pyrostur');
    const to = world.layout.nests[3];
    m.setState('fly');
    m.beginAttack(MIGRATION, { targetPos: { ...to, y: world.heightAt(to.x, to.z) }, rage: false, tgMul: 1, tempoMul: 1 });
    expect(remote.attack.id).toBe(MIGRATION);
    for (let i = 0; i < 50; i++) {
      step(10);
      expect(remote.pos.distanceTo(m.pos)).toBeLessThan(.06);
      expect(Number.isFinite(remote.air)).toBe(true);
    }
    step(40);
    expect(m.state).toBe('combat'); expect(remote.state).toBe('combat');
    expect(world.zoneAt(remote.pos.x, remote.pos.z)).toBe(3);
    expect(remote.pos.y).toBeCloseTo(world.heightAt(to.x, to.z), 1);
    expect(host.net.stats.txM).toBeGreaterThan(20); expect(guest.net.stats.rxM).toBeGreaterThan(20);
  });
});
