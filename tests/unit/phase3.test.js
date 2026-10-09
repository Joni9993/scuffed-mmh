// Phase 3 (balancing & bugfix) regression tests.
import { describe, it, expect, beforeEach } from 'vitest';
import { Monster } from '../../src/game/monsters/monster.js';
import { jaggo } from '../../src/game/monsters/jaggo.js';
import { brathalos } from '../../src/game/monsters/brathalos.js';
import { getMonsterDef } from '../../src/game/monsters/index.js';
import { Player } from '../../src/game/player.js';
import { createBus } from '../../src/core/events.js';
import { createInput } from '../../src/input/input.js';
import { createRng } from '../../src/core/rng.js';
import { time } from '../../src/core/time.js';
import { resolvePlayerHit } from '../../src/game/combat.js';

const DT = 1 / 60;
beforeEach(() => time.reset());

export function makeCtx(seed = 5) {
  const ctx = {
    world: { heightAt: () => 0, collide: () => {}, nestPoint: { x: 40, z: 0 } },
    monsters: [], players: [], bus: createBus(), input: createInput(), rng: createRng(seed), cameraYaw: 0,
    fx: { number() {}, spark() {}, shake() {}, flash() {}, glitch() {}, marker() {}, clearMarker() {} },
    playerHit() {}, respawn() {},
    countMonsters(id) { return ctx.monsters.filter((m) => m.alive && m.def.id === id).length; },
    spawnMonster(id, o) { const m = new Monster(getMonsterDef(id), ctx, { id: `${id}-${ctx.monsters.length}`, ...o, seed: ctx.monsters.length + 1 }); ctx.monsters.push(m); return m; },
    events: [],
  };
  ctx.bus.on('*', (e, t) => ctx.events.push(t));
  return ctx;
}
export function make(def, state = 'combat', px = 0, pz = 8, seed = 7) {
  const ctx = makeCtx();
  const m = new Monster(def, ctx, { id: def.id, x: 0, z: 0, state, seed });
  ctx.monsters.push(m);
  const p = new Player({ ctx });
  p.spawnAt(px, pz, Math.PI);
  ctx.players.push(p);
  m.target = p;
  return { ctx, m, p };
}

describe('fix 1: elemental damage is applied once', () => {
  it('applyDamage removes exactly res.dmg HP (dmg already contains the element share)', () => {
    const { m } = make(jaggo);
    const part = m.partById.head; // fire weak (25)
    const attacker = { power: 100, critChance: 0, elems: { fire: 40 } };
    const res = resolvePlayerHit(attacker, { mv: 50 }, part, () => 1);
    expect(res.elemDmg).toBeGreaterThan(0);
    // dmg = phys + elem
    expect(res.dmg).toBe(Math.round(100 * 0.5 * part.factor + res.elemDmg));
    const hp0 = m.hp;
    m.applyDamage(res);
    expect(hp0 - m.hp).toBe(res.dmg);
  });
  it('break HP and rage burst use the same single total', () => {
    const { m } = make(jaggo);
    const part = m.partById.head;
    const res = resolvePlayerHit({ power: 100, critChance: 0, elems: { fire: 40 } }, { mv: 50 }, part, () => 1);
    const hp0 = part.hp;
    m.applyDamage(res);
    expect(hp0 - part.hp).toBe(res.dmg);
  });
});
