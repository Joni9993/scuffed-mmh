import { beforeEach, describe, expect, it } from 'vitest';
import { pyrostur, PYRO } from '../../src/game/monsters/pyrostur.js';
import { addScorch, addRing, ringRadius, SCORCH } from '../../src/game/monsters/pyrosturHazards.js';
import { time } from '../../src/core/time.js';
import { overlap as overlapShape } from '../../src/game/hitbox.js';
import { make, DT } from './p3helpers.js';

beforeEach(() => time.reset());

const VERBOSE = !!process.env.PYRO_QA_VERBOSE;
const log = (label, rows) => { if (VERBOSE) console.log(label, JSON.stringify(rows)); };

function hunt({ phase = 0, distance = 8, bearing = 0, seed = 11, enduring = false, hp = null } = {}) {
  const h = make(pyrostur, 'combat', Math.sin(bearing) * distance, Math.cos(bearing) * distance, seed);
  const { m, p, ctx } = h;
  p.god = false; p.protect = 150;
  if (enduring) p.v.hp = p.v.maxHp = 100000;
  if (hp) p.v.hp = p.v.maxHp = hp;
  m.phase = phase; m.hp = m.maxHp * (phase === 2 ? .2 : 1);
  m.fleeUsed = true; m.apexClock = -999;
  const attacks = [], hits = [];
  ctx.bus.on('monsterAttack', (e) => attacks.push({ at: m.time, id: e.attackId, tempoMul: e.tempoMul ?? 1 }));
  ctx.bus.on('playerHit', (e) => { if (e.player === p) hits.push({ at: m.time, dmg: e.dmg, key: e.key }); });
  return { ...h, attacks, hits };
}
function tick(h) { h.ctx.input.poll(DT); h.p.update(DT); h.m.update(DT); }
const sum = (hits) => hits.reduce((n, e) => n + e.dmg, 0);
const quant = (arr, q) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

// ---------------------------------------------------------------------------
describe('Pyrostur predator: tempo and aggression', () => {
  // Measured (see report) then thresholds set ~15 % below.
  const FLOOR = { 0: { rate: 17.5, med: .6 }, 2: { rate: 15.8, med: .3 } };
  it('keeps a high attack tempo and phase 2 is faster than phase 0', () => {
    const rows = [], agg = { 0: { rate: [], med: [] }, 2: { rate: [], med: [] } };
    for (const phase of [0, 2]) for (const seed of [11, 37]) {
      const h = hunt({ phase, seed, enduring: true });
      const { m, p } = h;
      let approached = false, wasAttacking = false, endAt = null;
      const gaps = [];
      let prevStarts = 0;
      for (let frame = 0; frame < 90 * 60; frame++) {
        if (m.attack) approached = false;
        if (p.state === 'free' && !m.attack && !approached) {
          const bearing = [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(frame / 240) % 4];
          const d = [3, 8, 16][Math.floor(frame / 420) % 3];
          p.pos.set(m.pos.x + Math.sin(m.rot + bearing) * d, 0, m.pos.z + Math.cos(m.rot + bearing) * d);
          approached = true;
        }
        tick(h);
        if (h.attacks.length > prevStarts) {
          prevStarts = h.attacks.length;
          if (endAt !== null) gaps.push(m.time - endAt);
          endAt = null;
        }
        const attacking = !!m.attack;
        if (wasAttacking && !attacking) endAt = m.time;
        wasAttacking = attacking;
      }
      const rate = h.attacks.length / (m.time / 60), med = quant(gaps, .5), p90 = quant(gaps, .9);
      agg[phase].rate.push(rate); agg[phase].med.push(med);
      rows.push({ phase, seed, starts: h.attacks.length, perMin: +rate.toFixed(2), medGap: +med.toFixed(2), p90Gap: +p90.toFixed(2) });
    }
    log('Tempo:', rows);
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    for (const r of rows) {
      expect(r.perMin, JSON.stringify(r)).toBeGreaterThanOrEqual(FLOOR[r.phase].rate);
      expect(r.medGap, JSON.stringify(r)).toBeLessThanOrEqual(FLOOR[r.phase].med);
    }
    const faster = avg(agg[2].rate) > avg(agg[0].rate) || avg(agg[2].med) < avg(agg[0].med);
    expect(faster, JSON.stringify(rows)).toBe(true);
  }, 120000);
});

// ---------------------------------------------------------------------------
describe('Pyrostur predator: Glutrausch cycle', () => {
  for (const phase of [0, 2]) it(`phase ${phase}: overheat speeds attacks, then ends in a vent that resets pressure`, () => {
    const h = hunt({ phase, enduring: true });
    const { m, p } = h;
    m.cds = {};
    m.pressure = 100;
    let guard = 0;
    while (!(m.overheat > 0) && guard++ < 600) tick(h);
    expect(m.overheat, 'overheat starts').toBeGreaterThan(0);
    const heatStart = m.time, mark = h.attacks.length;
    let ventStart = null, endOfHeat = null;
    const ventId = phase >= 2 ? 'pyrostur_sonnenbruch' : 'pyrostur_ueberdruck';
    for (let f = 0; f < 90 * 60 && ventStart === null; f++) {
      // keep the hunter alive and near so the fight keeps going
      if (f % 120 === 0 && p.state === 'free' && !m.attack) p.pos.set(m.pos.x + 7, 0, m.pos.z + 7);
      tick(h);
      if (endOfHeat === null && !(m.overheat > 0)) endOfHeat = m.time;
      const v = h.attacks.slice(mark).find((a) => a.id === ventId);
      if (v) ventStart = v.at;
    }
    const during = h.attacks.slice(mark).filter((a) => a.at > heatStart && a.at < (endOfHeat ?? Infinity) && a.id !== ventId);
    log('Glutrausch:', { phase, heatStart: +heatStart.toFixed(1), endOfHeat, ventStart, n: during.length, tempo: during.map((a) => a.tempoMul) });
    expect(during.length, 'attacks during overheat').toBeGreaterThanOrEqual(3);
    for (const a of during) expect(a.tempoMul).toBeCloseTo(PYRO.OVERHEAT_TEMPO, 2);
    expect(ventStart, 'vent attack started').not.toBeNull();
    expect(endOfHeat === null || ventStart - endOfHeat <= 6.5, `vent within 6 s of expiry: ${ventStart} vs ${endOfHeat}`).toBe(true);
    // overheat itself lasts the configured time (vent may follow immediately)
    expect(endOfHeat - heatStart).toBeGreaterThan(PYRO.OVERHEAT_SECS - 1.5);
    expect(endOfHeat - heatStart).toBeLessThan(PYRO.OVERHEAT_SECS + 1.5);
    // run until the vent finishes
    for (let f = 0; f < 60 * 12 && !(m.attack === null && m.pressure < 100 && m.time > ventStart + 2); f++) tick(h);
    expect(m.overheat).toBe(0);
    expect(m.pressure).toBeLessThanOrEqual(phase >= 2 ? 35 + 20 : 20);
  }, 120000);

  it('breaking the chest during overheat ends it', () => {
    const h = hunt({ enduring: true });
    const { m } = h;
    m.pressure = 100;
    let g = 0; while (!(m.overheat > 0) && g++ < 600) tick(h);
    expect(m.overheat).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) tick(h);
    m._breakPart(m.partById.chest);
    expect(m.overheat).toBe(0);
    expect(m.pressure).toBe(0);
    expect(m._ventDue).toBe(false);
    expect(m.stagT).toBeGreaterThanOrEqual(PYRO.COUNTER_TIME - .001);
    for (let i = 0; i < 240; i++) tick(h);
    expect(m.overheat).toBe(0);
  }, 60000);
});

// ---------------------------------------------------------------------------
describe('Pyrostur predator: hazards', () => {
  const quiet = (opts) => { const h = hunt({ enduring: true, ...opts }); h.m.recover = 9999; h.m.stagT = 0; return h; };

  it('scorch ticks repeatedly with a strong burn, rolls through the tick are safe, expired scorch is removed', () => {
    const h = quiet();
    const { m, p } = h;
    p.pos.set(3, 0, 3);
    addScorch(m, p.pos.x, p.pos.z, { r: 2.2, secs: 3 });
    const hz = m.extra.hazards;
    expect(hz.scorch).toHaveLength(1);
    const dpsSeen = [];
    for (let i = 0; i < 4 * 60; i++) { tick(h); if (p.status.burn) dpsSeen.push(p.status.burn.dps); }
    log('Scorch:', { hits: h.hits.length, dps: dpsSeen[0] });
    expect(h.hits.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...dpsSeen)).toBeGreaterThan(3);
    for (let i = 0; i < 6 * 60; i++) tick(h);
    expect(hz.scorch).toHaveLength(0);

    // roll through the ignition tick: no hit while i-frames cover it
    const g = quiet();
    g.p.pos.set(3, 0, 3);
    addScorch(g.m, 3, 3, { r: 9, secs: 4 });
    const t0 = g.m.extra.hazards.scorch[0].t0;
    let rolled = false;
    for (let i = 0; i < 90; i++) {
      if (!rolled && g.m.time >= t0 - .15) { g.ctx.input.set('roll', true, 'bot'); rolled = true; } else g.ctx.input.set('roll', false, 'bot');
      tick(g);
      if (g.m.time < t0 + .4) expect(g.hits.length, `hit at ${g.m.time - t0}`).toBe(0);
    }
    expect(rolled).toBe(true);
  }, 60000);

  const ringRun = (rollLead) => {
    const h = quiet();
    const { m, p, ctx } = h;
    p.pos.set(0, 0, 8);
    addRing(m, 10, 8, { r0: 1.5, rMax: 16, speed: 15, dmg: 170 });
    const ring = m.extra.hazards.rings[0];
    // predicted contact time for a standing hunter (analytic): |d - r| <= width + radius
    const contact = (10 - 1.5 - ring.width - (p.radius ?? .4)) / ring.speed;
    let pressed = false;
    for (let i = 0; i < 90; i++) {
      const press = rollLead !== null && !pressed && m.time - ring.t0 >= contact - rollLead;
      if (press) pressed = true;
      ctx.input.set('roll', press, 'bot');
      tick(h);
    }
    return { h, contact, ring };
  };
  it('a shock ring hits an idle hunter exactly once; a well-timed roll avoids it', () => {
    const idle = ringRun(null);
    log('Ring:', { contact: idle.contact, hits: idle.h.hits.length });
    expect(idle.h.hits).toHaveLength(1);
    const rolled = ringRun(.1);
    expect(rolled.h.hits).toHaveLength(0);
    expect(ringRadius(rolled.ring, rolled.ring.t0 + 1)).toBeGreaterThan(15);
  }, 60000);
});

// ---------------------------------------------------------------------------
describe('Pyrostur predator: host and guest determinism', () => {
  const params = (id) => ({ attackId: id, t0: 1, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 4, y: 0, z: 12 }, seed: 424242 });
  for (const id of ['pyrostur_kometensturz', 'pyrostur_schlackensalve', 'pyrostur_flammenpeitsche', 'pyrostur_ueberdruck']) it(`${id}: guest replay builds identical hazards and projectiles`, () => {
    const run = (authority) => {
      const { m, p } = make(pyrostur, 'combat', 40, 40, 7);
      p.god = true; // far away and immortal: only the replicated spawns are compared
      m.authority = authority;
      m.time = 1;
      let spawns = 0;
      const orig = m.projectiles.spawn.bind(m.projectiles);
      m.projectiles.spawn = (...a) => { spawns++; return orig(...a); };
      m.startAttack(params(id));
      const hz = { scorch: [], rings: [] };
      const snap = () => {
        const h = m.extra.hazards ?? { scorch: [], rings: [] };
        for (const s of h.scorch) if (!hz.scorch.some((o) => o.key === s.key)) hz.scorch.push({ key: s.key, x: +s.x.toFixed(4), z: +s.z.toFixed(4), r: s.r, t0: +s.t0.toFixed(4), t1: +s.t1.toFixed(4) });
        for (const r of h.rings) if (!hz.rings.some((o) => o.key === r.key)) hz.rings.push({ key: r.key, x: +r.x.toFixed(4), z: +r.z.toFixed(4), r0: r.r0, rMax: r.rMax, speed: r.speed, t0: +r.t0.toFixed(4), dmg: r.dmg });
      };
      let ended = false;
      for (let i = 0; i < 9 * 60 && !ended; i++) {
        if (authority) m.update(DT); else m.tickRemote(DT);
        snap();
        ended = m.attack === null; // host would pick a new move afterwards: stop at the first end
      }
      return { hz, spawns, ended };
    };
    const host = run(true), guest = run(false);
    log('Determinism:', { id, scorch: host.hz.scorch.length, rings: host.hz.rings.length, spawns: host.spawns });
    expect(host.ended && guest.ended).toBe(true);
    expect(guest.hz.scorch).toEqual(host.hz.scorch);
    expect(guest.hz.rings).toEqual(host.hz.rings);
    expect(guest.spawns).toBe(host.spawns);
    if (id === 'pyrostur_kometensturz') { expect(host.hz.rings.length).toBe(1); expect(host.hz.scorch.length).toBe(6); }
    if (id === 'pyrostur_schlackensalve') expect(host.spawns).toBeGreaterThan(0);
    if (id === 'pyrostur_ueberdruck') expect(host.hz.rings.length).toBe(1);
  }, 60000);
});

// ---------------------------------------------------------------------------
describe('Pyrostur predator: aerial moves', () => {
  it('kometensturz lifts him high, lifts his hurt spheres, and a broken wing crashes him', () => {
    const h = hunt({ enduring: true, distance: 20 });
    const { m } = h;
    m.beginAttack('pyrostur_kometensturz', { teach: false });
    while (m.attack && m.attack.t < 1.4) tick(h);
    expect(m.attack).toBeTruthy();
    expect(m.air).toBeGreaterThan(6);
    const ys = m.hurtParts().map((e) => e.sphere.y);
    log('Aerial:', { air: +m.air.toFixed(2), minY: Math.min(...ys), spheres: ys.length });
    expect(Math.min(...ys), 'all hurt spheres out of melee reach').toBeGreaterThan(5);
    m._breakPart(m.partById.wingL);
    expect(m.attack).toBeNull();
    expect(m.stagT).toBeGreaterThanOrEqual(PYRO.CRASH_TIME - .001);
    let t = 0;
    while (m.air > 0 && t < 3) { tick(h); t += DT; }
    log('Crash:', { secs: +t.toFixed(2), air: m.air });
    expect(m.air).toBe(0);
    expect(t).toBeLessThanOrEqual(1.1);
  }, 60000);
});

// ---------------------------------------------------------------------------
describe('Pyrostur predator: fairness and readability', () => {
  function skilledStep(h) {
    const { m, p, ctx } = h;
    let roll = false, away = null;
    const caps = p.hitCapsules();
    const free = p.state === 'free' && p.v.exhaust <= 0 && p.v.stamina >= 22;
    const dxm = p.pos.x - m.pos.x, dzm = p.pos.z - m.pos.z, dm = Math.hypot(dxm, dzm) || 1;
    away = { x: dxm / dm, z: dzm / dm };
    if (free && m.attack) {
      const a = m.attack;
      const hs = a.inst.hitsAt(a.t + .12);
      for (const x of hs) {
        if (x.dmg <= 0 || a.inst.hitSet.has(p.id + '|' + (x.hit.group ?? x.idx))) continue;
        if (caps.some((c) => overlapShape(x.shape, c))) { roll = true; break; }
      }
    }
    const hz = m.extra.hazards;
    if (free && !roll && hz) for (const r of hz.rings) {
      if (m.time < r.t0 || r.hit.has(p.id)) continue;
      const d = Math.hypot(p.pos.x - r.x, p.pos.z - r.z), rr = ringRadius(r, m.time + .12);
      if (Math.abs(d - rr) <= r.width + .45 && ringRadius(r, m.time) <= d + r.width) { roll = true; break; }
    }
    let wx = 0, wz = 0;
    if (hz) for (const s of hz.scorch) {
      if (m.time > s.t1 || m.time < s.t0 - .6) continue;
      const dx = p.pos.x - s.x, dz = p.pos.z - s.z, d = Math.hypot(dx, dz);
      if (d < s.r + 1.2) { wx += dx / (d || 1); wz += dz / (d || 1); }
    }
    if (roll) { ctx.input.setStick(-away.x, away.z, 'bot'); ctx.input.set('roll', true, 'bot'); return true; }
    ctx.input.set('roll', false, 'bot');
    if (wx || wz) { const l = Math.hypot(wx, wz); ctx.input.setStick(-wx / l, wz / l, 'bot'); } else ctx.input.setStick(0, 0, 'bot');
    return false;
  }
  it('a skilled roller takes far less damage than an idle hunter', () => {
    const rows = [];
    for (const seed of [11, 37]) {
      const idle = hunt({ phase: 0, seed, enduring: true });
      const bot = hunt({ phase: 0, seed, enduring: true });
      let rolls = 0;
      for (let f = 0; f < 60 * 60; f++) {
        tick(idle);
        if (skilledStep(bot)) rolls++;
        tick(bot);
      }
      const di = sum(idle.hits), db = sum(bot.hits);
      rows.push({ seed, idle: Math.round(di), idleHits: idle.hits.length, bot: Math.round(db), botHits: bot.hits.length, ratio: +(db / di).toFixed(3), rollPresses: rolls });
    }
    log('Fairness:', rows);
    for (const r of rows) {
      expect(r.idle, JSON.stringify(r)).toBeGreaterThan(0);
      expect(r.ratio, JSON.stringify(r)).toBeLessThanOrEqual(.25);
    }
  }, 120000);
});
