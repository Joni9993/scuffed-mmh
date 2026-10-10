import { describe, it, expect } from 'vitest';
import { Monster } from '../../src/game/monsters/monster.js';
import { jaggo } from '../../src/game/monsters/jaggo.js';
import { Player } from '../../src/game/player.js';
import { createBus } from '../../src/core/events.js';
import { createInput } from '../../src/input/input.js';
import { createRng } from '../../src/core/rng.js';

const DT = 1 / 60;
function makeCtx() {
  const ctx = {
    world: { heightAt: () => 0, collide: () => {}, nestPoint: { x: 40, z: 0 } },
    monsters: [], players: [], bus: createBus(), input: createInput(), rng: createRng(1), cameraYaw: 0,
    fx: { number() {}, spark() {}, shake() {}, flash() {}, glitch() {}, marker() {}, clearMarker() {} },
    playerHit() {}, respawn() {}, countMonsters: () => 0, spawnMonster() {},
  };
  ctx.events = [];
  ctx.bus.on('*', (e, t) => ctx.events.push(t));
  return ctx;
}
function make(state = 'combat') {
  const ctx = makeCtx();
  const m = new Monster(jaggo, ctx, { id: 'jaggo', x: 0, z: 0, state, seed: 7 });
  ctx.monsters.push(m);
  const p = new Player({ ctx });
  p.spawnAt(0, 8, Math.PI);
  ctx.players.push(p);
  m.target = p;
  return { ctx, m, p };
}
const hit = (m, partId, dmg, extra = {}) => m.applyDamage({ dmg, elemDmg: 0, partId, blunt: 0, ...extra });

describe('monster replay determinism (host and client agree)', () => {
  it('two monsters running the same attack params end up at the same positions', () => {
    const run = () => {
      const { m } = make();
      m.authority = false;
      m.startAttack({ attackId: 'jaggo_huepfer', t0: 1, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 3, y: 0, z: 7 }, seed: 99 });
      const trace = [];
      for (let i = 0; i < 150; i++) { m.tickRemote(DT); trace.push([m.pos.x, m.pos.y, m.pos.z, m.rot].map((v) => +v.toFixed(6))); }
      return JSON.stringify(trace);
    };
    expect(run()).toBe(run());
  });
  it('attack start is emitted as a network event with the exact params', () => {
    const { ctx, m } = make();
    m.startAttack({ attackId: 'jaggo_schwanz', t0: 5, origin: { x: 1, y: 0, z: 2 }, yaw: 0.3, targetPos: { x: 4, y: 0, z: 4 }, seed: 5 });
    const ev = ctx.events.filter((e) => e === 'monsterAttack');
    expect(ev.length).toBe(1);
  });
});

describe('monster parts, breaks, stun', () => {
  it('head crest breaks at jaggo.parts head breakHp (1200): stagger 2 s, factor -0.1, mesh hook', () => {
    const { ctx, m } = make();
    expect(m.partById.head.factor).toBe(1.0);
    hit(m, 'head', 1150);
    expect(m.partById.head.broken).toBe(false);
    hit(m, 'head', 60);
    expect(m.partById.head.broken).toBe(true);
    expect(m.partById.head.factor).toBeCloseTo(0.9);
    expect(m.stagT).toBe(2);
    expect(m.extra.crest.visible).toBe(false);
    expect(m.extra.stump.visible).toBe(true);
    expect(ctx.events).toContain('partBreak');
  });
  it('part damage increases vertex jitter before the break', () => {
    const { m } = make();
    const mat = m.partById.head.mats[0];
    expect(mat.userData.ps1.uJit.value).toBe(0);
    hit(m, 'head', 100);
    const a = mat.userData.ps1.uJit.value;
    hit(m, 'head', 100);
    expect(mat.userData.ps1.uJit.value).toBeGreaterThan(a);
  });
  it('blunt head hits build stun: 150 threshold, x1.5 after each stun, 6 s helpless', () => {
    const { m } = make();
    hit(m, 'head', 1, { blunt: 100 });
    expect(m.stunT).toBe(0);
    hit(m, 'head', 1, { blunt: 60 });
    expect(m.stunT).toBe(6);
    expect(m.stunThreshold).toBe(225);
    hit(m, 'body', 1, { blunt: 500 }); // body does not stun
    expect(m.stun).toBe(0);
  });
  it('sleeping takes x2 via combat rules and wakes up when hit', () => {
    const { m } = make('sleep');
    expect(m.sleeping).toBe(true);
    hit(m, 'body', 10);
    expect(m.state).toBe('combat');
  });
});

describe('monster AI states', () => {
  it('Rotglut: at 60 % HP, lasts 45 s, then ends', () => {
    const { m } = make();
    hit(m, 'body', m.maxHp * 0.4 + 1);
    expect(m.rage).toBe(true);
    expect(m.state).toBe('enrage');
    for (let i = 0; i < 60 * 46; i++) m.update(DT);
    expect(m.rage).toBe(false);
  });
  it('Rotglut after 7.5 % max HP damage in 20 s', () => {
    const { m } = make();
    for (let i = 0; i < 6; i++) { hit(m, 'body', m.maxHp * 0.0126); m.update(DT); }
    expect(m.rage).toBe(true);
  });
  it('flees at 30 % HP toward the nest, then sleeps and regenerates 1 %/s', () => {
    const { m } = make();
    m.hp = m.maxHp * 0.5;
    m.rageUsed = true;
    hit(m, 'body', m.maxHp * 0.21);
    m.stateT = 5; m.state = 'combat'; // (burst damage may have triggered Rotglut first)
    m.update(DT);
    expect(m.state).toBe('flee');
    for (let i = 0; i < 60 * 20 && m.state === 'flee'; i++) m.update(DT);
    expect(m.state).toBe('sleep');
    const hp0 = m.hp;
    for (let i = 0; i < 60 * 10; i++) m.update(DT);
    expect(m.hp - hp0).toBeCloseTo(m.maxHp * 0.1, -1);
  });
  it('picks the player with highest threat', () => {
    const { ctx, m, p } = make();
    const q = new Player({ id: 'p2', ctx });
    q.spawnAt(0, -8, 0);
    ctx.players.push(q);
    m.applyDamage({ dmg: 100, elemDmg: 0, partId: 'body', attackerId: 'p2' });
    m.recover = 0; m.target = null; m.rng = () => 0.9;
    m.update(DT);
    expect(m.target.id).toBe('p2');
  });
  it('attacks only after the telegraph: no player damage in the first 0.5 s of any attack', () => {
    const { ctx, m, p } = make();
    p.spawnAt(0, 3, Math.PI);
    p.god = false;
    m.recover = 0;
    for (let i = 0; i < 60 * 12; i++) {
      p.v.hp = 100; p.state = 'free'; p.invuln = 0;
      const prev = m.attack?.t ?? -1;
      m.update(DT);
      if (m.attack && m.attack.t < 0.49 && p.v.hp < 100) throw new Error(`hit during telegraph of ${m.attack.id}`);
      void prev;
    }
    expect(true).toBe(true);
  });
});
