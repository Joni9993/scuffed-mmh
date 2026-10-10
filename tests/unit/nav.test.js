import { describe, it, expect, beforeAll } from 'vitest';
import { createWorld } from '../../src/game/world/index.js';
import { getNav } from '../../src/game/monsters/nav.js';
import { makeCtx, DT } from './p3helpers.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { getMonsterDef } from '../../src/game/monsters/index.js';
import { createRng } from '../../src/core/rng.js';

let w, nav;
beforeAll(() => { w = createWorld('schotterklamm', { seed: 1 }); nav = getNav(w); });

function arena(id, at, opts = {}) {
  const ctx = makeCtx();
  ctx.world = w;
  const m = new Monster(getMonsterDef(id), ctx, { id, x: at.x, z: at.z, seed: 3, ...opts });
  ctx.monsters.push(m);
  return { ctx, m };
}

function runFlee(m, limit = 120) {
  m.fleeing = true; m.fleeUsed = true; m.hp = m.maxHp * 0.2;
  let t = 0;
  while (t < limit && m.state === 'flee') { m.update(DT); t += DT; }
  return t;
}

describe('nav grid', () => {
  it('is cached per world', () => { expect(getNav(w)).toBe(nav); expect(nav).toBeTruthy(); });
  it('camp <-> every nest has a path', () => {
    for (const z of [2, 3, 4]) {
      const n = w.layout.nests[z];
      expect(nav.find(w.campPoint.x, w.campPoint.z, n.x, n.z), `camp->nest ${z}`).toBeTruthy();
      expect(nav.find(n.x, n.z, w.campPoint.x, w.campPoint.z), `nest ${z}->camp`).toBeTruthy();
    }
  });
  it('arena world has no nav (straight-line fallback)', () => { expect(getNav(createWorld('arena'))).toBeNull(); });
});

describe('monster pathing', () => {
  for (const id of ['brathalos', 'barrotz', 'jaggo']) {
    it(`${id} flees from random reachable spots into its nest`, () => {
      const rng = createRng(11);
      const nest = w.nestFor(id);
      let n = 0, tries = 0;
      while (n < 4 && tries++ < 300) {
        const x = (rng() * 2 - 1) * 100, z = (rng() * 2 - 1) * 100;
        if (!w.layout.reachable(x, z) || !nav.free(x, z) || !nav.find(x, z, nest.x, nest.z)) continue;
        n++;
        const { m } = arena(id, { x, z }, { state: 'flee' });
        runFlee(m);
        expect(m.state, `${id} from ${x.toFixed(0)},${z.toFixed(0)}`).toBe('sleep');
        expect(Math.hypot(m.pos.x - nest.x, m.pos.z - nest.z)).toBeLessThan(4);
      }
      expect(n).toBeGreaterThan(0);
    });
  }

  it('brathalos reaches its nest from camp', () => {
    const nest = w.nestFor('brathalos');
    const { m } = arena('brathalos', { x: w.campPoint.x, z: w.campPoint.z }, { state: 'flee' });
    runFlee(m);
    expect(m.state).toBe('sleep');
    expect(Math.hypot(m.pos.x - nest.x, m.pos.z - nest.z)).toBeLessThan(4);
  });

  it('stuck detection counts and repaths when pinned', () => {
    const { m } = arena('brathalos', { x: w.campPoint.x, z: w.campPoint.z }, { state: 'flee' });
    m.fleeing = true; m.fleeUsed = true;
    const start = { x: m.pos.x, z: m.pos.z };
    for (let i = 0; i < 60 * 4; i++) { m.update(DT); m.pos.x = start.x; m.pos.z = start.z; } // something keeps holding it in place
    expect(m.nv.stuckTotal).toBeGreaterThan(0);
    expect(m.nv.slide > 0 || m.nv.path !== undefined).toBe(true);
  });

  it('gives up fleeing and fights when a hunter is near', () => {
    const { ctx, m } = arena('brathalos', { x: w.campPoint.x, z: w.campPoint.z }, { state: 'flee' });
    m.fleeing = true; m.fleeUsed = true;
    m.fleeT = 76;
    ctx.players.push({ alive: true, pos: { x: m.pos.x + 10, y: 0, z: m.pos.z }, id: 'p' });
    m.update(DT);
    expect(m.state).toBe('combat');
    expect(m.fleeing).toBe(false);
  });

  it('a monster that fell into rock lands on walkable ground', () => {
    const { m } = arena('brathalos', { x: 30, z: -76 }, { state: 'fall' });
    let bad = null;
    for (let x = -100; x < 100 && !bad; x += 3) for (let z = -100; z < 100; z += 3) if (!nav.free(x, z)) { bad = { x, z }; break; }
    m.pos.set(bad.x, 10, bad.z); m.air = 0.1; m.fallV = 10; m.helpless = 2;
    m._fall(DT);
    expect(nav.free(m.pos.x, m.pos.z)).toBe(true);
  });
});
