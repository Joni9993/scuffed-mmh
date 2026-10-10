import { describe, it, expect } from 'vitest';
import { makeCtx, DT } from './p3helpers.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { getMonsterDef } from '../../src/game/monsters/index.js';
import { Player } from '../../src/game/player.js';
import { Revier, REVIER, scaleBoss } from '../../src/game/revier.js';
import { getQuest } from '../../src/data/quests.js';

function setup(px = 60, seed = 3) {
  const ctx = makeCtx(seed);
  const b = new Monster(getMonsterDef('barrotz'), ctx, { id: 'barrotz', x: 0, z: 0, yaw: Math.PI / 2, state: 'combat', seed: 11 });
  const j = new Monster(getMonsterDef('jaggo'), ctx, { id: 'jaggo', x: 9, z: 0, yaw: -Math.PI / 2, state: 'combat', seed: 22 });
  for (const m of [b, j]) { m.discovered = true; scaleBoss(m, 0.65); ctx.monsters.push(m); }
  const p = new Player({ ctx }); p.spawnAt(px, 20, Math.PI); ctx.players.push(p);
  const rv = new Revier(ctx, [b, j]);
  const step = (n) => { for (let i = 0; i < n; i++) { ctx.time = (ctx.time ?? 0) + DT; rv.update(DT); for (const m of ctx.monsters) m.update(DT); } };
  return { ctx, b, j, p, rv, step };
}

describe('Revierstreit', () => {
  it('Quest: 2 Brocken mit je 65 % HP', () => {
    const q = getQuest('revierstreit');
    expect(q.monsters.map((m) => m.id)).toEqual(['barrotz', 'jaggo']);
    expect(q.monsters.every((m) => m.hpMul === 0.65)).toBe(true);
    const { b, j } = setup();
    expect(b.maxHp).toBe(Math.round(getMonsterDef('barrotz').hp * 0.65));
    expect(j.maxHp).toBe(Math.round(getMonsterDef('jaggo').hp * 0.65));
  });

  it('Revierkampf: Brocken zielen aufeinander und treffen sich, nie unter 60 %', () => {
    const { ctx, b, j, rv, step } = setup();
    step(60 * 20);
    expect(b.target).toBe(j);
    expect(j.target).toBe(b);
    expect(rv.hits).toBeGreaterThan(0);
    expect(ctx.events.filter((e) => e === 'revierHit').length).toBe(rv.hits);
    expect(b.hp + j.hp).toBeLessThan(b.maxHp + j.maxHp);
    expect(b.hp).toBeGreaterThanOrEqual(b.maxHp * REVIER.FLOOR - 1);
    expect(j.hp).toBeGreaterThanOrEqual(j.maxHp * REVIER.FLOOR - 1);
    expect(rv.phase).toBe('clash'); // Pirscher weit weg: Uhr läuft nicht
  });

  it('Bündnis nach 60 s Pirscher-Nähe', () => {
    const { ctx, b, j, p, rv, step } = setup(30);
    step(60 * 59);
    expect(rv.phase).toBe('clash');
    step(60 * 2);
    expect(rv.phase).toBe('allied');
    expect(rv.reason).toBe('timer');
    expect(ctx.events).toContain('revierAlly');
    step(60 * 2);
    expect(b.target).toBe(p); expect(j.target).toBe(p);
    expect(rv.rivalOf(b)).toBeNull();
  });

  it('Bündnis bei starkem Pirscher-Treffer (> 8 % HP in 10 s)', () => {
    const { b, rv, step } = setup(30);
    step(30);
    b.applyDamage({ dmg: b.maxHp * 0.05, partId: b.parts[0].id, elemDmg: 0, attackerId: 'p1' });
    expect(rv.phase).toBe('clash');
    step(60 * 5);
    b.applyDamage({ dmg: b.maxHp * 0.04, partId: b.parts[0].id, elemDmg: 0, attackerId: 'p1' });
    expect(rv.phase).toBe('allied');
    expect(rv.reason).toBe('strong');
  });

  it('kein Bündnis, wenn die 8 % über mehr als 10 s verteilt sind', () => {
    const { b, rv, step } = setup(30);
    for (let i = 0; i < 4; i++) { b.applyDamage({ dmg: b.maxHp * 0.03, partId: b.parts[0].id, elemDmg: 0, attackerId: 'p1' }); step(60 * 6); }
    expect(rv.phase).toBe('clash');
  });

  it('Revier-Treffer zählen nicht als Pirscher-Druck', () => {
    const { rv, step } = setup(30);
    step(60 * 30);
    expect(rv.hits).toBeGreaterThan(0);
    expect(rv.log.size).toBe(0);
  });

  it('Aggro-Sperre: zweiter Brocken wartet 0,6 s auf demselben Pirscher', () => {
    const { ctx, b, j, p, rv } = setup(30);
    rv.ally('test');
    b.target = j.target = p;
    ctx._aggro = new Map([[p.id, { t: b._clock(), id: 'barrotz' }]]);
    expect(j._aggroGate()).toBe(true);
    expect(b._aggroGate()).toBe(false);
    ctx._aggro.get(p.id).t -= 0.61;
    expect(j._aggroGate()).toBe(false);
  });

  it('verbündet: Telegraphen verschiedener Brocken auf denselben Pirscher >= 0,6 s auseinander', () => {
    const { ctx, b, p, rv } = setup(14);
    rv.ally('test');
    const starts = [];
    ctx.bus.on('monsterAttack', (e) => { if (e.targetPos && (e.monsterId === 'barrotz' || e.monsterId === 'jaggo')) starts.push({ t: ctx.time, id: e.monsterId }); });
    p.god = true;
    for (let i = 0; i < 60 * 60; i++) { ctx.time = (ctx.time ?? 0) + DT; rv.update(DT); for (const m of ctx.monsters) m.update(DT); p.pos.x = 8; p.pos.z = 8; }
    expect(starts.length).toBeGreaterThan(3);
    for (let i = 1; i < starts.length; i++) if (starts[i].id !== starts[i - 1].id) expect(starts[i].t - starts[i - 1].t).toBeGreaterThanOrEqual(0.6 - 1e-6);
  });

  it('Sieg nur wenn beide tot', () => {
    const { b, j, rv } = setup(30);
    rv.ally('x');
    const kill = (m) => m.applyDamage({ dmg: 1e9, partId: m.parts[0].id, elemDmg: 0, attackerId: 'p1' });
    const all = () => [b, j].every((m) => !m.alive);
    kill(b); expect(all()).toBe(false);
    kill(j); expect(all()).toBe(true);
  });

  it('deterministisch: gleicher Seed -> gleiche HP und Treffer', () => {
    const run = () => { const s = setup(60, 9); s.step(60 * 25); return [s.b.hp, s.j.hp, s.rv.hits, s.b.pos.x.toFixed(3), s.j.pos.z.toFixed(3)]; };
    expect(run()).toEqual(run());
  });
});
