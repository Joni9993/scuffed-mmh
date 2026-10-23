import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorld } from '../../src/game/world/index.js';
import { createBus } from '../../src/core/events.js';
import { GATHER_KINDS, GATHER_TIME, rollGather } from '../../src/data/gather.js';
import { HuntNet } from '../../src/net/sync.js';
import { MSG } from '../../src/net/protocol.js';
import { enterEye, eyeRespawn, disposeEye } from '../../src/game/monsters/gockelokEye.js';

function fakeHunt(world, point) {
  const bus = createBus(), gathered = [];
  bus.on('gathered', e => gathered.push(e));
  const player = { pos: new THREE.Vector3(point.pos.x, point.pos.y, point.pos.z), state: 'free', alive: true, local: true, weapon: { busy: false } };
  return {
    seed: 1, world, bus, player, players: [player], monsters: [], gathered,
    input: { b: { context: { down: false }, attack: { pressed: false }, roll: { pressed: false } } },
    fx: { number() {}, spark() {} }, contextLabel: null,
  };
}

function gatherOnce(world, hunt) {
  hunt.input.b.context.down = false;
  world.gather.update(1 / 60, hunt);
  hunt.input.b.context.down = true;
  world.gather.update(GATHER_TIME + 0.01, hunt);
}

function fakeNet(hunt, isHost = true) {
  const handlers = new Map(), sent = [];
  const net = {
    isHost, myId: isHost ? 'host' : 'guest',
    on(type, fn) { handlers.set(type, fn); return () => handlers.delete(type); },
    onLeave() {}, onLost() {}, sendAll() {},
    session: { send(type, data, to) { sent.push({ type, data, to }); } },
    others: () => ['guest-a', 'guest-b'],
  };
  const sync = new HuntNet(hunt, net, { players: [] });
  return { receive: (data, from = 'guest-a') => handlers.get(MSG.GATHER)(data, from), sent, sync };
}

describe('gather depletion on every map', () => {
  for (const id of ['schotterklamm', 'rostwerke', 'smaragdkueste', 'glitchgrat']) {
    it(`${id}: every point stops granting items after its initial uses`, () => {
      const world = createWorld(id, { seed: 1 });
      try {
        const expectedKinds = Object.keys(GATHER_KINDS).filter(k => (GATHER_KINDS[k].world ?? 'schotterklamm') === id);
        assert.deepEqual([...new Set(world.gatherPoints.map(p => p.kind))].sort(), expectedKinds.sort());
        for (const point of world.gatherPoints) {
          const def = GATHER_KINDS[point.kind];
          assert(Number.isInteger(point.usesLeft), point.id);
          assert.equal(point.usesLeft, point.maxUses, point.id);
          assert(point.maxUses >= def.uses[0] && point.maxUses <= def.uses[1], point.id);
          const hunt = fakeHunt(world, point);
          for (let use = 0; use < point.maxUses; use++) {
            gatherOnce(world, hunt);
            assert.equal(hunt.gathered.length, use + 1, point.id);
            assert.deepEqual(hunt.gathered[use].items, rollGather(hunt.seed, point.id, point.kind, point.zone, use));
            assert.equal(point.usesLeft, point.maxUses - use - 1, point.id);
            // Keeping the button held must not consume another use.
            world.gather.update(GATHER_TIME + 0.01, hunt);
            assert.equal(hunt.gathered.length, use + 1, point.id);
          }
          for (let i = 0; i < 3; i++) gatherOnce(world, hunt);
          assert.equal(point.usesLeft, 0, point.id);
          assert.equal(hunt.gathered.length, point.maxUses, point.id);
          assert.notEqual(hunt.contextLabel, 'Sammeln', point.id);
        }
      } finally { world.dispose(); }
    });
  }
});

describe('invalid gather counters', () => {
  it('local gathering never grants items for missing, non-finite, fractional or excessive counters', () => {
    const world = createWorld('glitchgrat', { seed: 1 });
    try {
      const point = world.gatherPoints[0], hunt = fakeHunt(world, point);
      for (const left of [undefined, null, NaN, Infinity, -Infinity, -1, 0, 0.5, '1', point.maxUses + 1]) {
        point.usesLeft = left;
        gatherOnce(world, hunt);
        assert.equal(hunt.gathered.length, 0, String(left));
      }
      point.usesLeft = 1;
      for (const max of [undefined, NaN, Infinity, 0, 0.5, '2']) {
        point.maxUses = max;
        gatherOnce(world, hunt);
        assert.equal(hunt.gathered.length, 0, String(max));
      }
    } finally { world.dispose(); }
  });

  it('state updates reject invalid numbers without poisoning the current counter', () => {
    const world = createWorld('glitchgrat', { seed: 1 });
    try {
      const point = world.gatherPoints[0], initial = point.usesLeft;
      for (const left of [undefined, null, NaN, Infinity, -Infinity, 0.5, '1']) {
        assert.equal(world.setGatherState(point.id, left), false, String(left));
        assert.equal(point.usesLeft, initial);
      }
      assert.equal(world.setGatherState(point.id, -1), true);
      assert.equal(point.usesLeft, 0);
      assert.equal(world.setGatherState(point.id, 99), true);
      assert.equal(point.usesLeft, point.maxUses);
      assert.equal(world.setGatherState('missing-point', 1), false);
    } finally { world.dispose(); }
  });
});

describe('co-op gather arbitration', () => {
  it('grants the last use once when two guests claim it', () => {
    const world = createWorld('glitchgrat', { seed: 1 });
    try {
      for (const kind of ['graterz', 'frostkraut', 'glitchkristall', 'sternenstein']) {
        const point = world.gatherPoints.find(p => p.kind === kind);
        world.setGatherState(point.id, 1);
        const hunt = fakeHunt(world, point), net = fakeNet(hunt);
        net.receive({ id: point.id, c: 1 }, 'guest-a');
        net.receive({ id: point.id, c: 1 }, 'guest-b');
        const grants = net.sent.filter(e => e.data.it), denials = net.sent.filter(e => e.data.deny);
        assert.equal(grants.length, 1, kind);
        assert.deepEqual(grants[0].to, ['guest-a']);
        assert.equal(grants[0].data.u, 0);
        assert.equal(denials.length, 1, kind);
        assert.deepEqual(denials[0].to, ['guest-b']);
        assert.equal(point.usesLeft, 0);
      }
    } finally { world.dispose(); }
  });

  it('the host denies claims with invalid counters', () => {
    const world = createWorld('glitchgrat', { seed: 1 });
    try {
      const point = world.gatherPoints[0], hunt = fakeHunt(world, point), net = fakeNet(hunt);
      for (const left of [undefined, null, NaN, Infinity, -Infinity, -1, 0.5, '1', point.maxUses + 1]) {
        point.usesLeft = left;
        net.receive({ id: point.id, c: 1 });
      }
      assert.equal(net.sent.filter(e => e.data.it).length, 0);
      assert.equal(net.sent.filter(e => e.data.deny).length, 9);
    } finally { world.dispose(); }
  });

  it('the guest ignores malformed state/grant messages and accepts a valid final grant', () => {
    const world = createWorld('glitchgrat', { seed: 1 });
    try {
      const point = world.gatherPoints[0], hunt = fakeHunt(world, point), net = fakeNet(hunt, false);
      const initial = point.usesLeft, items = [{ id: 'frostgras', n: 1 }];
      for (const u of [undefined, null, NaN, Infinity, -1, 0.5, '0', point.maxUses + 1]) {
        net.receive({ id: point.id, u, it: items }, 'host');
        assert.equal(point.usesLeft, initial);
        assert.equal(hunt.gathered.length, 0);
      }
      net.receive({ id: point.id, u: 0, it: items }, 'host');
      assert.equal(point.usesLeft, 0);
      assert.equal(hunt.gathered.length, 1);
      assert.deepEqual(hunt.gathered[0].items, items);
    } finally { world.dispose(); }
  });
});

describe('Gockelok arena transitions', () => {
  it('entry, respawn and disposal preserve remaining and depleted gathering uses', () => {
    const world = createWorld('glitchgrat', { seed: 1 });
    let monster;
    try {
      const point = world.gatherPoints[0], empty = world.gatherPoints[1];
      world.setGatherState(point.id, 1);
      world.setGatherState(empty.id, 0);
      const points = world.gatherPoints, gather = world.gather, hunt = fakeHunt(world, point);
      monster = { home: { x: 65, z: -65 }, ctx: hunt, pos: new THREE.Vector3(65, 25.5, -65), vel: new THREE.Vector3(), revealPos: { x: 65, z: -65 } };
      const check = () => {
        assert.equal(world.gatherPoints, points);
        assert.equal(world.gather, gather);
        assert.equal(point.usesLeft, 1);
        assert.equal(empty.usesLeft, 0);
      };
      enterEye(monster); check();
      eyeRespawn(monster, hunt.player); check();
      disposeEye(monster); check();
    } finally { if (monster) disposeEye(monster); world.dispose(); }
  });
});
