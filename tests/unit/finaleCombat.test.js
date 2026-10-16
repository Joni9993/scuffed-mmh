import { describe, expect, it, beforeEach, beforeAll } from 'vitest';
import { monsters } from '../../src/game/monsters/index.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { Player } from '../../src/game/player.js';
import { Projectiles } from '../../src/game/projectiles.js';
import { resolvePlayerHit } from '../../src/game/combat.js';
import { createWorld } from '../../src/game/world/index.js';
import { ITEMS } from '../../src/data/items.js';
import { rollBreak } from '../../src/data/drops.js';
import { time } from '../../src/core/time.js';
import { makeCtx, DT } from './p3helpers.js';

const ids = ['pyrostur', 'felsengroll', 'voltiris', 'gockelok'];
let world;
beforeAll(() => { world = createWorld('glitchgrat', { seed: 11 }); });
beforeEach(() => time.reset());
function make(def, { weapon = 'gs', actualWorld = false, seed = 11 } = {}) {
  const ctx = makeCtx(seed); if (actualWorld) ctx.world = world;
  const nest = actualWorld ? world.nestFor(def.id) : { x: 0, z: 0 };
  const m = new Monster(def, ctx, { id: def.id, ...nest, state: 'combat', seed });
  const p = new Player({ ctx, weapon, tier: 6 }); p.spawnAt(nest.x, nest.z + 8, Math.PI);
  ctx.monsters.push(m); ctx.players.push(p); m.target = p;
  ctx.projectiles = new Projectiles(ctx, { visual: false });
  let damage = 0;
  ctx.playerHit = (pl, monster, hp, ah) => {
    const res = resolvePlayerHit({ power: pl.stats.power, critChance: 0, dmgMul: pl.dmgMul }, ah.hit, hp.part, ctx.rng);
    res.attackerId = pl.id; monster.applyDamage(res); damage += res.dmg;
  };
  return { ctx, m, p, damage: () => damage };
}

describe('Finale integration and accessibility', () => {
  for (const weapon of ['gs', 'db', 'bow', 'kt', 'ga', 'kk', 'lb']) {
    it(`${weapon}: real attacks/projectiles damage grounded Pyrostur from a reachable part`, () => {
      let dealt = 0;
      const probe = make(monsters.pyrostur, { weapon });
      const count = probe.m.lockPoints().length;
      for (let idx = 0; idx < count && dealt === 0; idx++) {
        const s = make(monsters.pyrostur, { weapon }); const { m, p, ctx } = s;
        m.recover = 999; p.god = true;
        const part = m.lockPoints()[idx].pos;
        const dx = part.x - m.pos.x, dz = part.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
        const gap = ['bow', 'lb'].includes(weapon) ? 10 : 1.5;
        p.spawnAt(part.x + dx / d * gap, part.z + dz / d * gap);
        p.rot = Math.atan2(part.x - p.pos.x, part.z - p.pos.z);
        p.lock = { monster: m, idx };
        for (let i = 0; i < 300; i++) {
          const period = weapon === 'bow' ? 21 : weapon === 'lb' ? 15 : 6;
          ctx.input.set('attack', i % period < 3, 'bot'); ctx.input.poll(DT);
          p.update(DT); ctx.projectiles.update(DT); m._visuals(DT);
        }
        dealt += s.damage();
        if (dealt && ['bow', 'lb'].includes(weapon)) expect(ctx.projectiles.stats.hits).toBeGreaterThan(0);
      }
      expect(dealt).toBeGreaterThan(0);
    });
  }

  for (const id of ids) {
    it(`${id}: two threshold transitions and 90 seconds seeded combat have finite transforms`, () => {
      const { m, p, ctx } = make(monsters[id], { actualWorld: true });
      p.god = true; m.fleeUsed = true;
      const phases = new Set([m.phase]);
      let attacks = 0; ctx.bus.on('monsterAttack', () => attacks++);
      for (let i = 0; i < 90 * 60; i++) {
        if (i === 20 * 60) m.hp = m.maxHp * 0.6;
        if (i === 45 * 60) m.hp = m.maxHp * 0.2;
        // Keep a living hunter nearby across migration, testing combat instead of abandonment.
        if (!m.attack) p.spawnAt(m.pos.x, m.pos.z + 7, Math.PI);
        ctx.input.poll(DT); p.update(DT); m.update(DT); phases.add(m.phase);
        for (const n of [m.pos.x, m.pos.y, m.pos.z, m.rot, m.air, ...Object.values(m.pose)]) expect(Number.isFinite(n)).toBe(true);
      }
      expect(attacks).toBeGreaterThan(5);
      expect([...phases].sort()).toEqual([0, 1, 2]);
    });

    it(`${id}: every breakable part rewards a registered material and damaging attack is audited`, () => {
      const def = monsters[id];
      for (const p of def.parts.filter((p) => p.breakHp)) {
        const drops = rollBreak(id, p.id, () => 0);
        expect(drops.length, `${id}/${p.id} missing break reward`).toBeGreaterThan(0);
        for (const d of drops) expect(ITEMS[d.id], d.id).toBeTruthy();
      }
      for (const a of Object.values(def.attacks)) if (a.hits?.some((h) => h.dmg > 0)) {
        expect(a.audit?.length, a.id).toBeGreaterThan(0);
        expect(a.duration - Math.max(...a.hits.map((h) => h.t1)), a.id).toBeGreaterThanOrEqual(0.6);
      }
    });
  }

  it('pressure comparison reports actual damage to an armored stationary hunter without inflating boss values', () => {
    const rows = [];
    for (const id of ['voltaro', 'krachfaust', ...ids]) {
      const { m, p, ctx } = make(monsters[id]);
      // 90 Schutz is an equipped late-game set; huge HP prevents a KO truncating the sample.
      p.protect = 90; p.v.hp = p.v.maxHp = 100000; m.fleeUsed = true; m.apexClock = -999;
      const start = p.hp; let starts = 0; ctx.bus.on('monsterAttack', () => starts++);
      for (let i = 0; i < 45 * 60; i++) { ctx.input.poll(DT); p.update(DT); m.update(DT); }
      rows.push({ id, damage45s: Math.round(start - p.hp), attacks: starts });
      expect(Number.isFinite(p.hp)).toBe(true);
      expect(starts).toBeGreaterThan(0);
    }
    if (process.env.FINALE_VERBOSE) console.log('Stationary hunter, Schutz 90, 45s, seed11:', JSON.stringify(rows));
  });

  it('reapproaching pressure covers close/mid/far distances, two phases and two seeds with late-game armor', () => {
    const rows = [];
    for (const phase of [0, 2]) for (const id of ids) for (const distance of [3, 6, 12]) for (const seed of [11, 37]) {
      const { m, p, ctx } = make(monsters[id], { seed });
      p.protect = 150; p.god = true; m.fleeUsed = true; m.apexClock = -999;
      m.phase = Math.min(phase, m.def.phases?.length ?? 0);
      let damage = 0, starts = 0;
      ctx.bus.on('playerHit', (e) => { if (e.player === p) damage += e.dmg; });
      ctx.bus.on('monsterAttack', () => starts++);
      for (let i = 0; i < 30 * 60; i++) {
        // An intentionally reckless melee hunter returns in front after
        // recovering. Committed attacks still get their genuine miss/spacing.
        if (p.state === 'free' && !m.attack) p.spawnAt(m.pos.x + Math.sin(m.rot) * distance, m.pos.z + Math.cos(m.rot) * distance);
        ctx.input.poll(DT); p.update(DT); m.update(DT);
      }
      rows.push({ id, phase: m.phase, distance, seed, damage30s: Math.round(damage), attacks: starts });
      expect(Number.isFinite(damage)).toBe(true);
    }
    if (process.env.FINALE_VERBOSE) console.log('Reapproaching hunter, Schutz150, 30s:', JSON.stringify(rows));
    for (const id of ids) for (const phase of [0, 2]) {
      const cases = rows.filter((r) => r.id === id && r.phase === phase);
      const average = cases.reduce((sum, r) => sum + r.damage30s, 0) / cases.length;
      expect(average, `${id} phase${phase} pressure stalled`).toBeGreaterThanOrEqual(60);
      for (const distance of [3, 6, 12]) {
        const atDistance = cases.filter((r) => r.distance === distance);
        expect(atDistance.reduce((sum, r) => sum + r.damage30s, 0) / atDistance.length,
          `${id} phase${phase} safe camping at ${distance}m`).toBeGreaterThanOrEqual(25);
      }
      for (const row of cases) {
        expect(row.attacks, `${id} phase${phase} d${row.distance} seed${row.seed}`).toBeGreaterThanOrEqual(3);
        expect(row.damage30s, `${id} phase${phase} d${row.distance} seed${row.seed} never reaches hunter`).toBeGreaterThan(0);
      }
    }
  });
});
