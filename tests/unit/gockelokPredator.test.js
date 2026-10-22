import { beforeEach, describe, expect, it } from 'vitest';
import { gockelok } from '../../src/game/monsters/gockelok.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { Player } from '../../src/game/player.js';
import { time } from '../../src/core/time.js';
import { overlap, playerCapsule } from '../../src/game/hitbox.js';
import { make, DT } from './p3helpers.js';

beforeEach(() => time.reset());
const VERBOSE = !!process.env.GOCKEL_QA_VERBOSE;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Full player/monster updates: armor, hit reactions, stamina, motion and i-frames stay active. */
function duel({ range = 8, seed = 11, phase = 0, hp = 150, broken = [] } = {}) {
  const h = make(gockelok, 'combat', 0, range, seed);
  const { m, p, ctx } = h;
  p.protect = 168; p.v.hp = p.v.maxHp = hp;
  m.phase = phase;
  m.hp = m.maxHp * [1, .72, .45][phase];
  m.fleeUsed = true;
  for (const id of broken) m._breakPart(m.partById[id]);
  const starts = [], hits = [], dodges = [];
  ctx.bus.on('monsterAttack', (e) => starts.push({ t: m.time, ...e }));
  ctx.bus.on('playerHit', (e) => { if (e.player === p) hits.push({ t: m.time, dmg: e.dmg, attackId: e.attackId }); });
  const takeHit = p.takeHit.bind(p);
  p.takeHit = (hit) => {
    const rolling = p.state === 'roll', result = takeHit(hit);
    if (rolling && (result === 'perfect' || result === 'iframe')) dodges.push({ t: m.time, result });
    return result;
  };
  return { ...h, starts, hits, dodges, rolled: new Set() };
}

function control(h, bot) {
  const { m, p, ctx } = h;
  let vx = 0, vz = 0;
  if (bot === 'circle' || bot === 'roll') {
    const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
    // One continuous run around the boss, with ordinary stick movement and no teleporting.
    const radial = Math.max(-.7, Math.min(.7, (12 - d) * .25));
    vx = dz / d + dx / d * radial;
    vz = -dx / d + dz / d * radial;
    // A 90 % stick runs without automatically sprinting: the roll bot must earn its own stamina.
    const length = Math.hypot(vx, vz); vx *= .9 / length; vz *= .9 / length;
  } else if (bot === 'sidestep') vx = .8;
  if (bot === 'roll' && m.attack && (p.state === 'free' || (p.state === 'roll' && p.rollT >= .34))) {
    const a = m.attack;
    // Read the announced committed hit volume and time a roll 160 ms before contact.
    // Unlike rolling at h.t0, this also works for a charge whose hit shape moves through the hunter later.
    const future = playerCapsule({ x: p.pos.x + p.vel.x * .16, y: p.pos.y, z: p.pos.z + p.vel.z * .16 }, p.radius);
    for (const hit of a.inst.hitsAt(a.t + .16)) {
      if (!h.rolled.has(hit.key) && overlap(hit.shape, future)) {
        // Roll through the telegraphed strike along the shorter route out of its follow-up volume.
        // The bot chooses among four ordinary stick directions; it receives no extra i-frames or stamina.
        let best = null;
        for (const [dx, dz] of [[vx, vz], [-vx, -vz], [vz, -vx], [-vz, vx]]) {
          let danger = 0;
          for (const lead of [.32, .44, .56]) {
            const progress = Math.min(1, lead / .5), step = 4.5 * (2 * progress - progress * progress);
            const cap = playerCapsule({ x: p.pos.x + dx * step, y: p.pos.y, z: p.pos.z + dz * step }, p.radius);
            danger += a.inst.hitsAt(a.t + lead).filter((hh) => overlap(hh.shape, cap)).length;
          }
          if (!best || danger < best.danger) best = { dx, dz, danger };
        }
        vx = best.dx; vz = best.dz;
        h.rolled.add(hit.key); ctx.input.press('roll', 50); break;
      }
    }
  }
  // cameraYaw=0: stick-right is world -x and stick-forward is world +z.
  ctx.input.setStick(-vx, vz, 'predator-bot');
}

function run(h, bot = 'stand', seconds = 30) {
  let travelled = 0;
  for (let f = 0; f < seconds / DT && h.p.alive; f++) {
    control(h, bot);
    const x = h.p.pos.x, z = h.p.pos.z;
    h.ctx.input.poll(DT); h.p.update(DT); h.m.update(DT);
    travelled += Math.hypot(h.p.pos.x - x, h.p.pos.z - z);
  }
  return { bot, time: +h.m.time.toFixed(2), damage: +h.hits.reduce((n, e) => n + e.dmg, 0).toFixed(2), hits: h.hits.length, attacks: h.starts.length, ko: !h.p.alive, travelled: +travelled.toFixed(1), dodges: h.dodges.length, rollAttempts: h.rolled.size };
}

describe('Gockelok rooster predator pressure', () => {
  it('measures real armored hunter pressure over near, mid and ranged positions', () => {
    const rows = [];
    for (const range of [3, 10, 24]) for (const seed of [11, 37]) rows.push({ range, seed, ...run(duel({ range, seed }), 'stand', 30) });
    if (VERBOSE) console.log('Gockel stationary', JSON.stringify(rows));
    for (const row of rows) {
      expect(row.ko, JSON.stringify(row)).toBe(true);
      expect(row.time, JSON.stringify(row)).toBeLessThanOrEqual(15);
    }
  });

  it.each([11, 37, 91])('pressures movement and rewards deliberate rolls beyond walking in a circle (seed %s)', (seed) => {
    const rows = [];
    for (const bot of ['sidestep', 'circle', 'roll']) {
      const h = duel({ range: 18, seed, hp: 10000 }); rows.push(run(h, bot, 36));
    }
    if (VERBOSE) console.log('Gockel movement', seed, JSON.stringify(rows));
    const [side, circle, roll] = rows;
    expect(side.damage, JSON.stringify(side)).toBeGreaterThan(80);
    expect(circle.damage, JSON.stringify(circle)).toBeGreaterThan(80);
    expect(circle.hits).toBeGreaterThanOrEqual(3);
    expect(roll.travelled).toBeGreaterThan(80);
    expect(roll.damage, JSON.stringify(rows)).toBeLessThan(circle.damage * .7);
    expect(roll.dodges).toBeGreaterThan(0);
  });

  it('chains spatial attacks at a sustained tempo and releases pressure after finishers', () => {
    const rows = [];
    for (const phase of [0, 1, 2]) {
      const h = duel({ range: 12, phase, hp: 10000 });
      const openings = []; let idle = 0, lastEnd = 0;
      h.ctx.bus.on('attackStart', () => { if (idle > 0) openings.push({ idle, lastEnd }); idle = 0; });
      for (let f = 0; f < 30 / DT; f++) {
        h.ctx.input.poll(DT); h.p.update(DT); h.m.update(DT);
        if (h.m.attack) lastEnd = h.m.attack.inst.params.chainIdx ?? 0;
        else idle += DT;
      }
      const chainStarts = h.starts.filter((e) => e.chainIdx > 0);
      const groups = []; for (const start of h.starts) {
        if (!start.chainIdx || !groups.length) groups.push([]);
        groups.at(-1).push(start.chainIdx ?? 0);
      }
      rows.push({ phase, starts: h.starts.length, chainStarts: chainStarts.length, groups, openings });
      expect(h.starts.length, JSON.stringify(rows.at(-1))).toBeGreaterThanOrEqual(12);
      expect(chainStarts.length).toBeGreaterThanOrEqual(2);
      expect(openings.some((o) => o.lastEnd > 0 && o.idle >= 1.3), JSON.stringify(openings)).toBe(true);
      // At least one complete 3/4/5-action sequence, with no chain exceeding the phase cap.
      expect(groups.some((g) => g.length === phase + 3), JSON.stringify(groups)).toBe(true);
      for (const group of groups) {
        expect(group.length).toBeLessThanOrEqual(phase + 3);
        expect(group).toEqual(Array.from({ length: group.length }, (_, i) => i));
      }
    }
    if (VERBOSE) console.log('Gockel tempo', JSON.stringify(rows));
  });

  it.each(['bow', 'lb'])('pressures a ranged %s partner without steering an already announced attack', (weapon) => {
    const h = duel({ range: 3, hp: 10000 });
    const ranged = new Player({ id: 'ranged', weapon, local: false, ctx: h.ctx });
    ranged.spawnAt(18, 20); ranged.v.hp = ranged.v.maxHp = 10000;
    h.ctx.players.push(ranged);
    let rangedCommit = null; const targets = [];
    h.ctx.bus.on('monsterAttack', (event) => {
      targets.push(h.m.target.id);
      if (h.m.target === ranged && !rangedCommit) rangedCommit = { ...event };
    });
    run(h, 'stand', 24);
    expect(rangedCommit, `no attack aimed at ${weapon} partner`).not.toBeNull();
    expect(targets).toContain(h.p.id);
    expect(targets).toContain(ranged.id);
    const def = gockelok.attacks[rangedCommit.attackId];
    const host = new AttackInstance(def, rangedCommit), guest = new AttackInstance(def, structuredClone(rangedCommit));
    const before = host.footprints();
    ranged.pos.x -= 30; ranged.pos.z += 15; // direction change after authoritative commitment
    for (let t = 0; t <= host.duration; t += .07) {
      expect(host.sample(t)).toEqual(guest.sample(t));
      expect(host.hitsAt(t)).toEqual(guest.hitsAt(t));
    }
    expect(host.footprints()).toEqual(before);
    expect(distance(rangedCommit.targetPos, ranged.pos)).toBeGreaterThan(20);
  });

  it.each([6, 30])('predicts a remote hunter moving at %s m/s from real positions and serializes the capped lead', (speed) => {
    const h = duel({ hp: 10000 });
    const ranged = new Player({ id: 'remote-bow', weapon: 'bow', local: false, ctx: h.ctx });
    ranged.spawnAt(18, 20); h.ctx.players.push(ranged); h.m.recover = 99;
    // Network avatars supply positions; their Player.vel remains zero.
    for (let f = 0; f < 30; f++) {
      ranged.pos.x += speed * DT;
      h.ctx.input.poll(DT); h.p.update(DT); h.m.update(DT);
    }
    h.m.target = ranged;
    const attack = h.m.beginAttack('gockelok_krallensprung');
    const message = h.starts.at(-1), lead = message.targetPos.x - ranged.pos.x;
    expect(ranged.vel.length()).toBe(0);
    expect(lead).toBeGreaterThan(1);
    expect(lead).toBeLessThanOrEqual(3.5);
    if (speed > 10) expect(lead).toBeCloseTo(3.5);
    expect(message.targetPos.z).toBeCloseTo(ranged.pos.z);
    const replay = new AttackInstance(gockelok.attacks[message.attackId], message);
    ranged.pos.x -= 20;
    expect(attack.hitsAt(attack.firstHitTime())).toEqual(replay.hitsAt(replay.firstHitTime()));
    expect(attack.sample(attack.wall(.98))).toEqual(replay.sample(replay.wall(.98)));
  });

  it('breaking the crown cancels a committed crow and allows a genuine damage opening', () => {
    const h = duel({ range: 5, phase: 2, hp: 10000 });
    h.m.beginAttack('gockelok_kikeriki', { tgMul: 1 });
    h.ctx.input.poll(DT); h.p.update(DT); h.m.update(DT);
    const part = h.m.partById.comb;
    h.m.applyDamage({ dmg: 2500, partId: 'comb' });
    expect(part.broken).toBe(true);
    expect(h.m.attack).toBeNull();
    const starts = h.starts.length, hp = h.m.hp;
    run(h, 'stand', .8);
    expect(h.starts.length).toBe(starts);
    h.m.applyDamage({ dmg: 100, partId: 'body' });
    expect(h.m.hp).toBeLessThan(hp);
    expect(h.m.gockelForm).toBe('rooster');
  });
});
