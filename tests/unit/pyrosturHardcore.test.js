import { beforeEach, describe, expect, it } from 'vitest';
import { pyrostur } from '../../src/game/monsters/pyrostur.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { time } from '../../src/core/time.js';
import { Hunt } from '../../src/game/hunt.js';
import { Projectiles } from '../../src/game/projectiles.js';
import { overlap } from '../../src/game/hitbox.js';
import { make, DT } from './p3helpers.js';

beforeEach(() => time.reset());

function hunt({ phase = 0, distance = 8, bearing = 0, seed = 11, enduring = false } = {}) {
  const h = make(pyrostur, 'combat', Math.sin(bearing) * distance, Math.cos(bearing) * distance, seed);
  const { m, p, ctx } = h;
  p.god = false; p.protect = 150;
  if (enduring) p.v.hp = p.v.maxHp = 100000;
  m.phase = phase; m.hp = m.maxHp * (phase === 2 ? .2 : 1);
  m.fleeUsed = true; m.apexClock = -999;
  const attacks = [], hits = [];
  ctx.bus.on('monsterAttack', (e) => attacks.push({ at: m.time, id: e.attackId }));
  ctx.bus.on('playerHit', (e) => { if (e.player === p) hits.push({ at: m.time, dmg: e.dmg }); });
  return { ...h, attacks, hits };
}
function tick(h) { h.ctx.input.poll(DT); h.p.update(DT); h.m.update(DT); }
const printable = (rows) => JSON.stringify(rows);

describe('Pyrostur endgame behavior regression', () => {
  it('an idle fully armored hunter cannot camp safely at melee, midrange, rear or bow distance', () => {
    const rows = [];
    for (const phase of [0, 2]) for (const seed of [11, 37]) for (const distance of [3, 8, 16]) for (const bearing of [0, Math.PI / 2, Math.PI]) {
      const h = hunt({ phase, seed, distance, bearing });
      h.p.v.hp = h.p.v.maxHp = 190;
      let elapsed = 0;
      while (elapsed < 60 && h.p.state !== 'ko') { tick(h); elapsed += DT; }
      rows.push({ phase, seed, distance, bearing: Math.round(bearing * 180 / Math.PI), ko: h.p.state === 'ko', seconds: +elapsed.toFixed(1), firstHit: h.hits[0]?.at, attacks: h.attacks.length, damage: Math.round(h.hits.reduce((n, e) => n + e.dmg, 0)) });
    }
    if (process.env.PYRO_QA_VERBOSE) console.log('Idle Schutz150 actual hunter, real knockback and recovery:', printable(rows));
    for (const row of rows) {
      expect(row.ko, printable(row)).toBe(true);
      expect(row.seconds, printable(row)).toBeLessThanOrEqual(45);
      expect(row.firstHit, printable(row)).toBeLessThan(15);
    }
  }, 120000);

  it('keeps changing its decisions beyond the first minute instead of settling into a two-move loop', () => {
    const rows = [];
    for (const phase of [0, 2]) for (const seed of [11, 37]) {
      const h = hunt({ phase, seed, enduring: true });
      let inactive = 0, longestInactive = 0, longestReason = null, approached = false;
      for (let frame = 0; frame < 120 * 60; frame++) {
        // A reckless hunter reapproaches only between attacks. During an attack
        // real tracking, commitment, knockback and miss spacing remain intact.
        if (h.m.attack) approached = false;
        if (h.p.state === 'free' && !h.m.attack && !approached) {
          const bearing = [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(frame / 240) % 4];
          const d = [3, 8, 16][Math.floor(frame / 420) % 3];
          h.p.pos.set(h.m.pos.x + Math.sin(h.m.rot + bearing) * d, 0, h.m.pos.z + Math.cos(h.m.rot + bearing) * d);
          approached = true;
        }
        tick(h);
        inactive = h.m.attack ? 0 : inactive + DT;
        if (inactive > longestInactive) {
          longestInactive = inactive;
          longestReason = { at: +h.m.time.toFixed(1), state: h.m.state, tired: h.m.tired, recover: +h.m.recover.toFixed(2), distance: +h.p.pos.distanceTo(h.m.pos).toFixed(1) };
        }
      }
      const first = h.attacks.filter((a) => a.at < 60), second = h.attacks.filter((a) => a.at >= 60);
      rows.push({ phase, seed, starts: h.attacks.length, firstKinds: new Set(first.map((a) => a.id)).size, secondKinds: new Set(second.map((a) => a.id)).size, longestInactive: +longestInactive.toFixed(2), longestReason, ids: [...new Set(h.attacks.map((a) => a.id))] });
    }
    if (process.env.PYRO_QA_VERBOSE) console.log('Two minute varied approach:', printable(rows));
    for (const row of rows) {
      // Long multi-stage attacks count once; a count target must not force
      // short attacks or remove earned recovery merely to increase frequency.
      expect(row.starts, printable(row)).toBeGreaterThanOrEqual(16);
      expect(row.firstKinds, printable(row)).toBeGreaterThanOrEqual(5);
      expect(row.secondKinds, printable(row)).toBeGreaterThanOrEqual(5);
      expect(row.longestInactive, printable(row)).toBeLessThan(8);
    }
  }, 120000);

  it('every damaging move visibly articulates the real rig and locomotion moves cover meaningful distance', () => {
    const rows = [];
    for (const def of Object.values(pyrostur.attacks).filter((a) => a.hits?.some((h) => h.dmg > 0))) {
      const { m } = hunt({ enduring: true });
      const inst = new AttackInstance(def, { attackId: def.id, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 13 }, seed: 11, t0: 0 });
      m.attack = { id: def.id, inst, t: 0 };
      const transforms = new Map(); let motion = 0, turning = 0;
      for (let t = 0; t < inst.duration; t += DT) {
        m.attack.t = t; m._visuals(DT);
        const s = inst.sample(t); motion = Math.max(motion, Math.hypot(s.x, s.z, s.air)); turning = Math.max(turning, Math.abs(s.yaw));
        for (const [id, node] of Object.entries(m.nodes)) {
          const values = [...node.position.toArray(), ...node.rotation.toArray().slice(0, 3)];
          if (!transforms.has(id)) transforms.set(id, { base: values, delta: 0 });
          const rec = transforms.get(id);
          rec.delta = Math.max(rec.delta, ...values.map((v, i) => Math.abs(v - rec.base[i])));
          expect(values.every(Number.isFinite), `${def.id}/${id}`).toBe(true);
        }
      }
      const animatedJoints = [...transforms.values()].filter((r) => r.delta > .12).length;
      rows.push({ id: def.id, animatedJoints, motion: +motion.toFixed(2), turning: +turning.toFixed(2) });
      expect(animatedJoints, def.id + ' must move actual render joints').toBeGreaterThanOrEqual(3);
      if (def.motion) expect(motion > 1.5 || turning > .7, def.id + ' must move or rotate its body meaningfully').toBe(true);
    }
    if (process.env.PYRO_QA_VERBOSE) console.log('Actual rig articulation and world locomotion:', printable(rows));
  }, 120000);

  it('continues to fight back against actual tier 6x and 7 attack spam with armor and a 190 HP meal', () => {
    const rows = [];
    for (const weapon of ['gs', 'db', 'bow', 'kt', 'ga', 'kk', 'lb']) for (const tier of [6, 7]) {
      const h = hunt({ distance: 7, seed: 37 });
      const { p, m, ctx } = h;
      p.setWeapon(weapon, tier, tier === 6 ? 'x' : null);
      p.v.hp = p.v.maxHp = 190;
      p.lock = { monster: m, idx: 0 };
      ctx.projectiles = new Projectiles(ctx, { visual: false });
      // Invoke the production resolution path, including element, blast,
      // part breaks, stun, rage, weapon on-hit effects and hit feedback.
      ctx.mods = { player: {} }; ctx.glitchSys = {}; ctx.stats = { damage: 0, hits: 0 };
      ctx.playerHit = Hunt.prototype.playerHit.bind(ctx);
      const occupancy = { stagger: 0, stun: 0, tired: 0, trapped: 0, attacking: 0 };
      let completed = 0;
      const onAttackEnd = m.def.onAttackEnd;
      // Observe completion without mutating the shared monster definition.
      const ended = new Set();
      let elapsed = 0;
      while (elapsed < 60 && p.state !== 'ko' && m.alive) {
        const target = p.lockPoint() ?? m.pos;
        const dx = target.x - p.pos.x, dz = target.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
        const gap = weapon === 'bow' || weapon === 'lb' ? 9 : 1.5;
        ctx.input.setStick(d > gap ? -dx / d : 0, d > gap ? dz / d : 0, 'bot');
        // Press repeatedly rather than hold-only: all weapon input buffers
        // receive real presses/releases, with no rolls, blocks or healing.
        const period = weapon === 'bow' ? 21 : weapon === 'lb' ? 15 : 9;
        ctx.input.set('attack', Math.floor(elapsed / DT) % period < 3, 'bot');
        ctx.time = elapsed;
        ctx.input.poll(DT); p.update(DT); ctx.projectiles.update(DT);
        const a = m.attack;
        m.update(DT);
        if (a && a.t >= a.inst.duration && !ended.has(a)) { ended.add(a); completed++; }
        occupancy.stagger += m.stagT > 0 ? DT : 0;
        occupancy.stun += m.stunT > 0 ? DT : 0;
        occupancy.tired += m.tired ? DT : 0;
        occupancy.trapped += m.trapped ? DT : 0;
        occupancy.attacking += m.attack ? DT : 0;
        elapsed += DT;
      }
      expect(m.def.onAttackEnd).toBe(onAttackEnd);
      rows.push({ weapon, tier, seconds: +elapsed.toFixed(1), hunterKO: p.state === 'ko', bossDead: !m.alive, hp: +p.hp.toFixed(1), dealt: ctx.stats.damage, hits: ctx.stats.hits, received: Math.round(h.hits.reduce((n, e) => n + e.dmg, 0)), starts: h.attacks.length, completed, ...Object.fromEntries(Object.entries(occupancy).map(([k, v]) => [k, +v.toFixed(1)])) });
    }
    if (process.env.PYRO_QA_VERBOSE) console.log('Actual weapon mash, real movement, 190 HP/Schutz150:', printable(rows));
    for (const row of rows) {
      expect(row.bossDead, printable(row) + ' attack-only bot must not rush down the elder').toBe(false);
      expect(row.completed, printable(row) + ' elder must finish attacks under assault').toBeGreaterThanOrEqual(row.hunterKO ? 2 : 3);
      expect(row.received, printable(row) + ' passive offense cannot negate all pressure').toBeGreaterThanOrEqual(95);
    }
  }, 120000);

  for (const strategy of [
    { weapon: 'gs', x: -4, z: 4, pre: 0, prepared: false },
    { weapon: 'bow', x: 10, z: 17, pre: 0, prepared: true },
    { weapon: 'lb', x: 12, z: 7, pre: 0, prepared: true },
  ]) it(`${strategy.weapon}: a prepared real weapon strategy reaches the exposed chest and counters pressure`, () => {
    const { m, p, ctx } = hunt({ seed: 11 });
    p.spawnAt(strategy.x, strategy.z, Math.PI);
    p.setWeapon(strategy.weapon, 7, null);
    p.v.hp = p.v.maxHp = 190; p.lock = { monster: m, idx: 1 };
    // Prepared ranged finishers spend the resource earned during the preceding
    // fight. No damage, aim, attack timeline or counter result is manufactured.
    if (strategy.prepared) p.weapon.addWucht(100);
    m.recover = 999; m.rageUsed = true; m.rageCd = 999;
    ctx.mods = { player: {} }; ctx.glitchSys = {}; ctx.stats = { damage: 0, hits: 0 };
    ctx.projectiles = new Projectiles(ctx, { visual: false });
    ctx.playerHit = Hunt.prototype.playerHit.bind(ctx);
    const contacts = [];
    ctx.bus.on('hit', (e) => contacts.push({ t: +ctx.time.toFixed(3), part: e.part, dmg: e.dmg }));
    let started = false;
    for (let frame = 0; frame < (3 + strategy.pre) * 60 && !m._pyroCounterCd; frame++) {
      const t = frame * DT - strategy.pre; ctx.time = t;
      if (t >= 0 && !started) { m.beginAttack('pyrostur_ueberdruck', { teach: false, yaw: 0 }); started = true; }
      ctx.input.set('attack', strategy.weapon === 'gs' && (t < 1.5 || (t > 1.62 && frame % 9 < 3)), 'bot');
      // Ranged users react to the initial tell; the sticky explosive has its
      // genuine travel time and 1.5 second fuse before its damage can count.
      ctx.input.set('special', strategy.prepared && t > .35 && t < 1.15, 'bot');
      ctx.input.poll(DT); p.update(DT); ctx.projectiles.update(DT); m.update(DT);
    }
    expect(m._pyroCounterCd, `${strategy.weapon}: production attacks must trigger the actual counter: ${JSON.stringify(contacts)}`).toBeGreaterThan(0);
    expect(m.attack).toBeNull();
    expect(m.stagT).toBeGreaterThan(0);
    expect(p.hp).toBe(190);
  });

  it('overlapping jaw and horn shapes stay one impact even through a real super-armor move', () => {
    let exercised = 0;
    for (const id of ['pyrostur_kesselramme', 'pyrostur_hornbrecher']) {
      const def = pyrostur.attacks[id];
      const inst = new AttackInstance(def, { attackId: id, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 8 }, seed: 11, t0: 0 });
      const t = inst.wall(def.hits[0].t0 + .025), hits = inst.hitsAt(t);
      let found = false;
      const { m, p, ctx } = hunt();
      p.v.hp = p.v.maxHp = 190;
      p.setWeapon('gs', 7, null);
      p.weapon.move = p.def.moves.gs_finisher; p.weapon.t = .1;
      expect(p.weapon.superArmor()).toBe('all');
      for (let x = -3; x <= 3 && !found; x += .2) for (let z = 2; z <= 9 && !found; z += .2) {
        p.pos.set(x, 0, z);
        const caps = p.hitCapsules();
        if (hits.filter((h) => caps.some((c) => overlap(h.shape, c))).length < 2) continue;
        const count = []; ctx.bus.on('playerHit', (e) => count.push(e));
        m._attackHits(inst, t); m._attackHits(inst, t + DT);
        expect(count, id + ' composite collision must not multiply damage').toHaveLength(1);
        expect(190 - p.hp, id).toBeLessThanOrEqual(Math.max(...hits.map((h) => h.dmg)) * 80 / 230 + .001);
        expect(p.state).not.toBe('ko');
        exercised++; found = true;
      }
      expect(found, id + ' must exercise an actual overlap between two shapes').toBe(true);
    }
    expect(exercised).toBe(2);
  }, 120000);
});
