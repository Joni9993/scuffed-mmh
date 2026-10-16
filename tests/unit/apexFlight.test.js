import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld } from '../../src/game/world/index.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { felsengroll } from '../../src/game/monsters/felsengroll.js';
import { apexMigration, MIGRATION, withApexFlight } from '../../src/game/monsters/apexFlight.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { encodeAtk, decodeAtk } from '../../src/net/protocol.js';
import { makeCtx, DT } from './p3helpers.js';
import { time } from '../../src/core/time.js';

let world;
beforeAll(() => { world = createWorld('glitchgrat', { seed: 11 }); });
beforeEach(() => time.reset());
function setup(authority = true) {
  const ctx = makeCtx(); ctx.world = { ...world, collide: vi.fn() };
  // Registry decorators mutate exported defs. Build a deliberately raw definition
  // so this test does not accidentally compose the flight hooks twice.
  const def = withApexFlight({
    id: felsengroll.id, name: felsengroll.name, hp: felsengroll.hp, scale: 1,
    bodyRadius: felsengroll.bodyRadius, walk: 3.4, run: 6.4, turn: 1.2,
    build: felsengroll.build, parts: felsengroll.parts,
    attacks: Object.fromEntries(Object.entries(felsengroll.attacks).filter(([id]) => id !== MIGRATION)),
  }, [3, 2, 1]);
  const n = world.layout.nests[3];
  const m = new Monster(def, ctx, { id: 'flight-test', ...n, state: 'combat', authority });
  ctx.monsters.push(m); m.recover = 0;
  return { m, ctx, def };
}
function start(m, zone = 2) {
  const n = world.layout.nests[zone]; m.setState('fly');
  return m.beginAttack(MIGRATION, { targetPos: { ...n, y: world.heightAt(n.x, n.z) }, rage: false, tgMul: 1, tempoMul: 1 });
}

describe('Apex Cinema flight', () => {
  it('lands hit geometry at real Glitchgrat destination height with host/guest protocol replay', () => {
    const { m } = setup(); const host = start(m, 1);
    const wire = encodeAtk(m.id, host.params, 1);
    const guest = new AttackInstance(apexMigration, decodeAtk(wire).params);
    for (let t = 0; t <= host.duration; t += 0.1) {
      const a = host.sample(t), b = guest.sample(t);
      for (const key of ['x', 'z', 'air', 'groundY']) expect(a[key]).toBeCloseTo(b[key], 3);
    }
    const n = world.layout.nests[1], ground = world.heightAt(n.x, n.z);
    const s = host.sample(host.wall(6.85));
    expect(s.groundY).toBeCloseTo(ground);
    expect(s.air).toBeCloseTo(0);
    const h = host.hitsAt(host.wall(6.9))[0].shape;
    expect(h.y).toBeCloseTo(ground + 0.8);
    expect(Math.abs(host.origin.y - ground)).toBeGreaterThan(1);
    const replayHit = guest.hitsAt(guest.wall(6.9))[0].shape;
    for (const key of ['x', 'y', 'z', 'r']) expect(h[key]).toBeCloseTo(replayHit[key], 3);
  });

  it('gives three seconds of landing markers, retains melee uptime, and skips terrain collisions airborne', () => {
    const { m, ctx, def } = setup();
    m.apexClock = 64.9;
    expect(def.combat(m, DT)).not.toBe(true);
    m.apexClock = 65;
    expect(def.combat(m, DT)).toBe(true);
    expect(m.attack.id).toBe(MIGRATION);
    expect(apexMigration.markerLead).toBeGreaterThanOrEqual(3);
    const inst = m.attack.inst, fp = inst.footprints()[0];
    expect(inst.wall(fp.t0) - inst.wall(fp.t0 - apexMigration.markerLead)).toBeGreaterThanOrEqual(3);
    expect(65 / (65 + m.attack.inst.duration)).toBeGreaterThan(0.75);
    ctx.fx.marker = vi.fn();
    m._runAttack(inst.wall(fp.t0 - apexMigration.markerLead + 0.01));
    m._visuals(DT);
    expect(ctx.fx.marker).toHaveBeenCalled();
    expect(m.air).toBeGreaterThan(20);
    expect(ctx.world.collide).not.toHaveBeenCalled();
    m._runAttack(m.attack.inst.duration);
    expect(m.air).toBe(0);
    expect(m.state).toBe('combat');
    expect(m.pos.y).toBeCloseTo(world.heightAt(m.pos.x, m.pos.z));
    expect(m.recover).toBeGreaterThanOrEqual(1.5);
  });

  it('does not migrate during a chain, phase transition, tired window or on a guest', () => {
    for (const state of [{ chainNext: { id: 'x' } }, { phaseT: 1 }, { tired: true }, { recover: 1 }]) {
      const { m, def } = setup(); m.apexClock = 80; Object.assign(m, state);
      expect(def.combat(m, DT)).not.toBe(true); expect(m.attack).toBeNull();
    }
    const { m, def } = setup(false); m.apexClock = 80;
    expect(def.combat(m, DT)).not.toBe(true); expect(m.attack).toBeNull();
  });

  it('interrupting in midair recovers safely without leaving a flying softlock', () => {
    const { m } = setup(); start(m); m._runAttack(2);
    m._interrupt();
    // Shared flight guard must settle interrupted migrations in one update.
    m.update(DT);
    expect(m.attack).toBeNull();
    expect(m.air).toBe(0);
    expect(m.state).not.toBe('fly');
    expect(m.pos.y).toBeCloseTo(world.heightAt(m.pos.x, m.pos.z));
  });

  it('low health retreat uses the same flight and reaches its real nest asleep', () => {
    const { m, def } = setup();
    const n = world.layout.nests[2]; m.pos.set(n.x, world.heightAt(n.x, n.z), n.z);
    m.hp = m.maxHp * 0.25; m._startFlee();
    expect(def.flee(m, DT)).toBe(true);
    expect(m.attack.id).toBe(MIGRATION);
    const nest = world.nestFor('felsengroll');
    m._runAttack(m.attack.inst.duration);
    expect(m.pos.x).toBeCloseTo(nest.x); expect(m.pos.z).toBeCloseTo(nest.z);
    expect(m.state).toBe('sleep'); expect(m.fleeing).toBe(false); expect(m.air).toBe(0);
  });
});
