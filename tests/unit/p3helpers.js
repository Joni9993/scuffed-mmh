// Shared harness for phase-3 tests (not a test file itself).
import { Monster } from '../../src/game/monsters/monster.js';
import { getMonsterDef } from '../../src/game/monsters/index.js';
import { Player } from '../../src/game/player.js';
import { createBus } from '../../src/core/events.js';
import { createInput } from '../../src/input/input.js';
import { createRng } from '../../src/core/rng.js';

export const DT = 1 / 60;

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
