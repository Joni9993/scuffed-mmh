import { beforeEach, describe, expect, it } from 'vitest';
import { felsengroll, FEL } from '../../src/game/monsters/felsengroll.js';
import { addPillar, covered } from '../../src/game/monsters/felsengrollPillars.js';
import { addRing, ringRadius } from '../../src/game/monsters/pyrosturHazards.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { time } from '../../src/core/time.js';
import { overlap as overlapShape } from '../../src/game/hitbox.js';
import { make, DT } from './p3helpers.js';
import { Hunt } from '../../src/game/hunt.js';
import { Projectiles } from '../../src/game/projectiles.js';

beforeEach(() => time.reset());

const VERBOSE = !!process.env.FELS_QA_VERBOSE;
const log = (label, rows) => { if (VERBOSE) console.log(label, JSON.stringify(rows)); };
const ID = (n) => 'felsengroll_' + n;

function hunt({ phase = 0, distance = 8, bearing = 0, seed = 11, enduring = false, hp = null } = {}) {
  const h = make(felsengroll, 'combat', Math.sin(bearing) * distance, Math.cos(bearing) * distance, seed);
  const { m, p, ctx } = h;
  p.god = false; p.protect = 150;
  if (enduring) p.v.hp = p.v.maxHp = 100000;
  if (hp) p.v.hp = p.v.maxHp = hp;
  m.phase = phase; m.hp = m.maxHp * (phase === 2 ? .2 : 1);
  m.fleeUsed = true; m.apexClock = -999;
  const attacks = [], hits = [];
  ctx.bus.on('monsterAttack', (e) => attacks.push({ at: m.time, id: e.attackId, tempoMul: e.tempoMul ?? 1 }));
  ctx.bus.on('playerHit', (e) => { if (e.player === p) hits.push({ at: m.time, dmg: e.dmg, key: e.key, st: `${p.state}/${p.v.stamina.toFixed(0)}/${p.v.exhaust}` }); });
  return { ...h, attacks, hits };
}
function tick(h) { h.ctx.input.poll(DT); h.p.update(DT); h.m.update(DT); }
const sum = (hits) => hits.reduce((n, e) => n + e.dmg, 0);

// ---------------------------------------------------------------------------
describe('Felsengroll: fortress tempo', () => {
  it('attacks in a heavy ~10-14 per minute rhythm (not Pyrostur\'s 20), also in the last state', () => {
    const rows = [];
    for (const phase of [0, 2]) for (const seed of [11, 37]) {
      const h = hunt({ phase, seed, enduring: true });
      const { m, p } = h;
      let approached = false;
      for (let frame = 0; frame < 90 * 60; frame++) {
        if (m.attack) approached = false;
        if (p.state === 'free' && !m.attack && !approached) {
          const bearing = [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(frame / 240) % 4];
          const d = [3, 8, 16][Math.floor(frame / 420) % 3];
          p.pos.set(m.pos.x + Math.sin(m.rot + bearing) * d, 0, m.pos.z + Math.cos(m.rot + bearing) * d);
          approached = true;
        }
        tick(h);
      }
      const rate = h.attacks.length / (m.time / 60);
      rows.push({ phase, seed, starts: h.attacks.length, perMin: +rate.toFixed(2) });
    }
    log('Tempo:', rows);
    for (const r of rows) { expect(r.perMin, JSON.stringify(r)).toBeGreaterThanOrEqual(9); expect(r.perMin, JSON.stringify(r)).toBeLessThanOrEqual(15.5); }
  }, 120000);

  it('is territorial: at range he answers with quakes, boulders or a roll instead of walking in', () => {
    const h = hunt({ distance: 22, enduring: true });
    const { m } = h;
    // The hunter keeps backing off to 22 m between attacks (a real ranged player).
    for (let i = 0; i < 40 * 60; i++) {
      if (!m.attack && h.p.state === 'free') { const dx = h.p.pos.x - m.pos.x, dz = h.p.pos.z - m.pos.z, d = Math.hypot(dx, dz) || 1; if (d < 22) h.p.pos.set(m.pos.x + dx / d * 22, 0, m.pos.z + dz / d * 22); }
      tick(h);
    }
    const far = ['rollangriff', 'stampfer', 'beben', 'felswurf', 'schlackespucke', 'sprungstampf', 'ramme', 'saeulenbruch'].map(ID);
    const nFar = h.attacks.filter((a) => far.includes(a.id)).length;
    log('Territory:', { starts: h.attacks.length, nFar, first: h.attacks[0]?.id });
    expect(far).toContain(h.attacks[0].id);
    expect(nFar).toBeGreaterThanOrEqual(5);
    expect(nFar / h.attacks.length).toBeGreaterThan(.4);
  }, 60000);
});

// ---------------------------------------------------------------------------
describe('Felsengroll: armour, crash and exposed core', () => {
  const crashSetup = () => {
    const h = hunt({ enduring: true, distance: 16 });
    const { m, p } = h;
    p.god = true; m.recover = 0; m.cds = {};
    addPillar(m, 0, 9, { key: 'test-pillar' });
    m.time += .6; // armed
    return h;
  };
  it('a roll that hits a pillar shatters it and crashes him: stagger, armour -60, exposed core', () => {
    const h = crashSetup(); const { m } = h;
    h.pil = m.extra.pillars[0];
    m.beginAttack(ID('rollangriff'), { teach: false });
    let crashedAt = null;
    for (let i = 0; i < 6 * 60 && crashedAt === null; i++) { tick(h); if (m._crashT > 0) crashedAt = i; }
    log('Crash:', { crashedAt, armor: m.armor, stag: m.stagT, exposed: m._exposedT, pillars: m.extra.pillars.map((p) => p.dead) });
    const pil = h.pil;
    expect(crashedAt, 'crash happened').not.toBeNull();
    expect(m.attack).toBeNull();
    expect(m.stagT).toBeGreaterThanOrEqual(FEL.CRASH_TIME - .1);
    expect(m.armor).toBeLessThanOrEqual(40 + .1);
    expect(m._exposedT).toBeGreaterThan(FEL.EXPOSED_SECS - .5);
    expect(pil.dead).toBe(true);
    // exposed core: chest and body take 1.6x, the head is never armoured
    tick(h);
    expect(m.partById.chest.factor).toBeCloseTo(m.partById.chest.baseFactor * FEL.EXPOSED_FACTOR, 2);
    expect(m.partById.head.factor).toBeCloseTo(m.partById.head.baseFactor, 2);
    // ...for eight seconds only
    for (let i = 0; i < 9 * 60; i++) { tick(h); }
    expect(m._exposedT).toBe(0);
    expect(m.partById.chest.factor).toBeLessThan(m.partById.chest.baseFactor * 1.2);
  }, 60000);
  it('the ram crashes into a pillar too, and a roll beside the pillar does not', () => {
    const h = crashSetup(); const { m } = h; const pil = m.extra.pillars[0];
    m.beginAttack(ID('ramme'), { teach: false });
    for (let i = 0; i < 4 * 60; i++) tick(h);
    expect(pil.dead).toBe(true); expect(m._exposedT + 8).toBeGreaterThan(8);
    const g = crashSetup(); const gp = g.m.extra.pillars[0]; gp.x = 12; // far off the lane
    g.m.beginAttack(ID('rollangriff'), { teach: false });
    for (let i = 0; i < 2.6 * 60; i++) tick(g);
    expect(gp.dead).toBe(false);
    expect(g.m._crashT).toBe(0);
  }, 60000);
  it('keulenwirbel smashes pillars in reach (he takes the cover away)', () => {
    const h = hunt({ enduring: true }); const { m } = h; h.p.god = true;
    addPillar(m, 6, 4, { key: 'w1' }); addPillar(m, -8, 30, { key: 'w2' });
    const [near, far] = m.extra.pillars;
    m.beginAttack(ID('keulenwirbel'), { teach: false });
    for (let i = 0; i < 3 * 60; i++) tick(h);
    expect(near.dead).toBe(true); expect(far.dead).toBe(false);
  });
  it('armour regenerates between assaults and sustained damage plus a crash opens the seams', () => {
    const h = hunt({ enduring: true }); const { m } = h;
    m.armor = 20; m.recover = 99; m.stagT = 0; m.cds = {};
    for (let i = 0; i < 10 * 60; i++) { tick(h); m.recover = 99; }
    expect(m.armor).toBeGreaterThan(45);
  });
});

// ---------------------------------------------------------------------------
describe('Felsengroll: pillar cover', () => {
  const quiet = () => { const h = hunt({ enduring: true }); h.m.recover = 9999; h.m.stagT = 0; return h; };
  const ringRun = (withPillar) => {
    const h = quiet(); const { m, p, ctx } = h;
    p.pos.set(0, 0, 14);
    addRing(m, 0, 0, { r0: 6, rMax: 24, speed: 13, dmg: 140, kind: 'quake', status: null, attackId: 'felsengroll_bebenwelle' });
    if (withPillar) { addPillar(m, 0, 8, { key: 'cov' }); m.time += .4; }
    for (let i = 0; i < 180; i++) { ctx.input.set('roll', false, 'bot'); tick(h); }
    return h;
  };
  it('a quake ring hits an idle hunter once, but not one standing behind a pillar', () => {
    expect(ringRun(false).hits).toHaveLength(1);
    expect(ringRun(true).hits).toHaveLength(0);
  }, 60000);
  it('boulder impacts and slag blasts are shielded too; the pillar must be on the line', () => {
    const { m } = quiet();
    addPillar(m, 0, 8, { key: 'cov2' }); m.time += .5;
    expect(felsengroll.cover(m, { x: 0, z: 0 }, { pos: { x: 0, z: 14 } })).toBe(true);
    expect(felsengroll.cover(m, { x: 0, z: 0 }, { pos: { x: 6, z: 14 } })).toBe(false);
    expect(covered(m, { x: 0, z: 14 }, { x: 0, z: 20 })).toBe(false);
  });
  it('a hunter behind a pillar is not hit by boulders thrown at him, one in the open is', () => {
    const run = (withPillar) => {
      const h = hunt({ enduring: true, distance: 18 }); const { m } = h;
      m.recover = 9999;
      if (withPillar) { addPillar(m, 0, 10, { key: 'rk' }); m.time += .5; }
      m.projectiles.spawn({ kind: 'rock', mode: 'impact', from: { x: 0, y: 4, z: -10 }, to: { x: 0, y: 0, z: 18 }, dur: 1, arc: 10, radius: .6, splash: 2.2, hold: .2, dmg: 170, knock: 'down', key: 'rk-1' });
      for (let i = 0; i < 3 * 60; i++) { tick(h); h.ctx.projectiles?.update?.(DT); }
      return h.hits.length;
    };
    expect(run(false)).toBeGreaterThan(0);
    expect(run(true)).toBe(0);
  }, 60000);
});

// ---------------------------------------------------------------------------
describe('Felsengroll: hazards', () => {
  const quiet = (opts) => { const h = hunt({ enduring: true, ...opts }); h.m.recover = 9999; h.m.stagT = 0; return h; };
  it('slag slows, ticks lightly and detonates when the fuse ends', () => {
    const h = quiet(); const { m, p } = h;
    p.pos.set(3, 0, 3);
    const w = { x: 3, z: 3 };
    // via a real attack event so the field has the production options
    m.beginAttack(ID('schlackespucke'), { teach: false });
    const hz = () => m.extra.hazards?.scorch ?? [];
    for (let i = 0; i < 3 * 60 && hz().length < 3; i++) tick(h);
    expect(hz().length).toBe(3);
    for (const s of hz()) { expect(s.kind).toBe('slag'); expect(s.blast.dmg).toBeGreaterThanOrEqual(150); expect(s.status.type).toBe('mud'); expect(s.dmg).toBeLessThan(30); }
    void w;
    for (let i = 0; i < 8 * 60; i++) { tick(h); m.recover = 99; }
    expect(hz()).toHaveLength(0);
  }, 60000);
});

// ---------------------------------------------------------------------------
describe('Felsengroll: host and guest determinism', () => {
  const params = (id) => ({ attackId: id, t0: 1, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 4, y: 0, z: 12 }, seed: 424242 });
  for (const n of ['saeulenbruch', 'meteor', 'schlackespucke', 'felswurf', 'bruchlinie', 'stampfer', 'weltenbruch']) it(`${ID(n)}: guest replay builds identical hazards, pillars and projectiles`, () => {
    const id = ID(n);
    const run = (authority) => {
      const { m, p } = make(felsengroll, 'combat', 40, 40, 7);
      p.god = true;
      m.authority = authority; m.time = 1;
      let spawns = 0;
      const orig = m.projectiles.spawn.bind(m.projectiles);
      m.projectiles.spawn = (...a) => { spawns++; return orig(...a); };
      m.startAttack(params(id));
      const hz = { scorch: [], rings: [], pillars: [] };
      const snap = () => {
        const h = m.extra.hazards ?? { scorch: [], rings: [] };
        for (const s of h.scorch) if (!hz.scorch.some((o) => o.key === s.key)) hz.scorch.push({ key: s.key, x: +s.x.toFixed(4), z: +s.z.toFixed(4), r: s.r, t0: +s.t0.toFixed(4), t1: +s.t1.toFixed(4), kind: s.kind });
        for (const r of h.rings) if (!hz.rings.some((o) => o.key === r.key)) hz.rings.push({ key: r.key, x: +r.x.toFixed(4), z: +r.z.toFixed(4), r0: r.r0, rMax: r.rMax, speed: r.speed, t0: +r.t0.toFixed(4), dmg: r.dmg });
        for (const q of m.extra.pillars ?? []) if (!hz.pillars.some((o) => o.key === q.key)) hz.pillars.push({ key: q.key, x: +q.x.toFixed(4), z: +q.z.toFixed(4), t0: +q.t0.toFixed(4), t1: +q.t1.toFixed(4) });
      };
      let ended = false;
      for (let i = 0; i < 16 * 60 && !ended; i++) {
        if (authority) m.update(DT); else m.tickRemote(DT);
        snap();
        ended = m.attack === null;
      }
      return { hz, spawns, ended };
    };
    const host = run(true), guest = run(false);
    log('Determinism:', { id, scorch: host.hz.scorch.length, rings: host.hz.rings.length, pillars: host.hz.pillars.length, spawns: host.spawns });
    expect(host.ended && guest.ended).toBe(true);
    expect(guest.hz).toEqual(host.hz);
    expect(guest.spawns).toBe(host.spawns);
    if (n === 'saeulenbruch') expect(host.hz.pillars.length).toBe(4);
    if (n === 'meteor') { expect(host.hz.rings.length).toBe(1); expect(host.hz.pillars.length).toBe(4); }
    if (n === 'schlackespucke') { expect(host.hz.scorch.length).toBe(3); expect(host.spawns).toBe(3); }
    if (n === 'felswurf') expect(host.spawns).toBe(3);
    if (n === 'stampfer') expect(host.hz.rings.length).toBe(1);
    if (n === 'weltenbruch') expect(host.hz.scorch.length).toBe(6);
  }, 60000);

  it('Lavaader (tempoMul > 1) makes new pillars spew slag, ordinary pillars do not', () => {
    const run = (tempoMul) => {
      const { m, p } = make(felsengroll, 'combat', 40, 40, 7); p.god = true; m.time = 1;
      m.startAttack({ attackId: ID('saeulenbruch'), t0: 1, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 12 }, seed: 5, tempoMul });
      let n = 0;
      for (let i = 0; i < 5 * 60; i++) { m.update(DT); n = Math.max(n, m.extra.hazards?.scorch.length ?? 0); }
      return n;
    };
    expect(run(1)).toBe(0);
    expect(run(1.08)).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
describe('Felsengroll: aerial and burrowing signatures', () => {
  it('meteor climbs to ~9 m, lifts the hurt spheres out of melee reach and lands with a quake ring starting outside the crater', () => {
    const h = hunt({ enduring: true, distance: 20 }); const { m } = h;
    m.beginAttack(ID('meteor'), { teach: false });
    while (m.attack && m.attack.t < 1.5) tick(h);
    expect(m.air).toBeGreaterThan(7);
    expect(Math.min(...m.hurtParts().map((e) => e.sphere.y - e.sphere.r))).toBeGreaterThan(2);
    const def = felsengroll.attacks[ID('meteor')];
    expect(def.hits[0].radius + .4).toBeLessThan(5); // a single roll (4.5 m) leaves the crater disc
  }, 60000);
  it('weltenbruch spokes shatter pillars along their lane while a pillar elsewhere survives the first lap', () => {
    const h = hunt({ enduring: true, distance: 30 }); const { m } = h; h.p.god = true;
    const lane = felsengroll.attacks[ID('weltenbruch')].hits[0];
    const dx = lane.to[0] - lane.from[0], dz = lane.to[2] - lane.from[2], l = Math.hypot(dx, dz);
    addPillar(m, dx / l * 16, dz / l * 16, { key: 'spoke' });
    const spoke = m.extra.pillars[0];
    m.beginAttack(ID('weltenbruch'), { teach: false });
    for (let i = 0; i < 4 * 60; i++) tick(h);
    expect(spoke.dead).toBe(true);
  }, 60000);
});

// ---------------------------------------------------------------------------
describe('Felsengroll: fairness and readability', () => {
  function skilledStep(h) {
    const { m, p, ctx } = h;
    let roll = false, dir = null;
    const caps = p.hitCapsules();
    const free = p.state === 'free' && p.v.exhaust <= 0 && p.v.stamina >= 22;
    const dxm = p.pos.x - m.pos.x, dzm = p.pos.z - m.pos.z, dm = Math.hypot(dxm, dzm) || 1;
    const away = { x: dxm / dm, z: dzm / dm };
    if (free && m.attack) {
      const a = m.attack;
      for (const x of a.inst.hitsAt(a.t + .12)) {
        if (x.dmg <= 0 || a.inst.hitSet.has(p.id + '|' + (x.hit.group ?? x.idx))) continue;
        if (caps.some((c) => overlapShape(x.shape, c))) { roll = true; dir = { x: -away.z, z: away.x }; break; } // sidestep lanes and rolls
      }
    }
    const hz = m.extra.hazards;
    if (free && !roll && hz) for (const r of hz.rings) {
      if (m.time < r.t0 || r.hit.has(p.id)) continue;
      const d = Math.hypot(p.pos.x - r.x, p.pos.z - r.z), rr = ringRadius(r, m.time + .12);
      if (Math.abs(d - rr) <= r.width + .45 && ringRadius(r, m.time) <= d + r.width && !felsengroll.cover(m, { x: r.x, z: r.z }, p)) {
        roll = true; break;
      }
    }
    if (free && !roll) for (const pr of m.projectiles.list) { // boulder about to land on us
      const d = pr.def;
      if (d.mode === 'impact' && pr.age + .12 >= d.dur && pr.age <= d.dur + .2 && Math.hypot(p.pos.x - d.to.x, p.pos.z - d.to.z) < d.splash + .5) { roll = true; break; }
    }
    let wx = 0, wz = 0;
    if (hz) for (const s of hz.scorch) {
      if (m.time > s.t1 || m.time < s.t0 - .6) continue;
      const dx = p.pos.x - s.x, dz = p.pos.z - s.z, d = Math.hypot(dx, dz);
      if (d < s.r + 1.5) { wx += dx / (d || 1); wz += dz / (d || 1); }
    }
    if (roll) { const v = dir ?? away; ctx.input.setStick(-v.x, v.z, 'bot'); ctx.input.set('roll', true, 'bot'); return true; }
    ctx.input.set('roll', false, 'bot');
    if (wx || wz) { const l = Math.hypot(wx, wz); ctx.input.setStick(-wx / l, wz / l, 'bot'); } else ctx.input.setStick(0, 0, 'bot');
    return false;
  }
  it('a skilled roller takes far less damage than an idle hunter', () => {
    const rows = [];
    for (const seed of [11, 37]) {
      const idle = hunt({ phase: 0, seed, enduring: true });
      const bot = hunt({ phase: 0, seed, enduring: true });
      for (let f = 0; f < 60 * 60; f++) { tick(idle); skilledStep(bot); tick(bot); }
      const di = sum(idle.hits), db = sum(bot.hits);
      rows.push({ seed, idle: Math.round(di), idleHits: idle.hits.length, bot: Math.round(db), botHits: bot.hits.length, ratio: +(db / di).toFixed(3), keys: bot.hits.map((e) => e.key.split('|')[0] + ' ' + e.st + ' @' + e.at.toFixed(1)) });
    }
    log('Fairness:', rows);
    for (const r of rows) { expect(r.idle, JSON.stringify(r)).toBeGreaterThan(0); expect(r.ratio, JSON.stringify(r)).toBeLessThanOrEqual(.25); }
  }, 120000);
  it('an idle fully armored hunter cannot camp safely at melee, midrange, rear or bow distance', () => {
    const rows = [];
    for (const seed of [11, 37]) for (const distance of [3, 8, 16]) for (const bearing of [0, Math.PI / 2, Math.PI]) {
      const h = hunt({ phase: 0, seed, distance, bearing });
      h.p.v.hp = h.p.v.maxHp = 190;
      let elapsed = 0;
      while (elapsed < 80 && h.p.state !== 'ko') { tick(h); elapsed += DT; }
      rows.push({ seed, distance, bearing: Math.round(bearing * 180 / Math.PI), ko: h.p.state === 'ko', seconds: +elapsed.toFixed(1) });
    }
    log('Idle:', rows);
    for (const row of rows) expect(row.ko, JSON.stringify(row)).toBe(true);
  }, 240000);
});

// Quake rhythm: a crossbow bot that circles at 12-16 m and never dodges must still bleed.
describe('Felsengroll punishes ranged kiters with the quake rhythm', () => {
  it('a circling crossbow/bow bot takes sustained damage', () => {
    const rows = [];
    for (const weapon of ['lb', 'bow']) {
      time.reset();
      const { m, p, ctx } = make(felsengroll, 'combat', 0, 16, 11);
      p.god = false; p.protect = 150; p.v.hp = p.v.maxHp = 1e6; p.setWeapon(weapon, 7, null);
      m.maxHp *= 50; m.hp = m.maxHp; m.fleeUsed = true; p.lock = { monster: m, idx: 0 };
      ctx.projectiles = new Projectiles(ctx, { visual: false });
      ctx.mods = { player: {} }; ctx.glitchSys = {}; ctx.stats = { damage: 0, hits: 0 };
      ctx.playerHit = Hunt.prototype.playerHit.bind(ctx);
      let dmg = 0, starts = 0;
      ctx.bus.on('playerHit', (e) => { dmg += e.dmg; });
      ctx.bus.on('monsterAttack', () => { starts++; });
      const SECS = 45;
      for (let t = 0; t < SECS; t += DT) {
        const dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
        let sx = -dz / d * -.9, sy = dx / d * .9;
        if (d > 16) { sx += -dx / d; sy += dz / d; } else if (d < 12) { sx += dx / d; sy -= dz / d; }
        const L = Math.hypot(sx, sy); ctx.input.setStick(sx / L, sy / L, 'bot');
        ctx.input.set('attack', Math.floor(t / DT) % (weapon === 'bow' ? 21 : 15) < 3, 'bot');
        ctx.time = t; ctx.input.poll(DT); p.update(DT); ctx.projectiles.update(DT); m.update(DT);
      }
      rows.push({ weapon, dmgPerMin: Math.round(dmg / SECS * 60), dealtPerMin: Math.round(ctx.stats.damage / SECS * 60), starts });
    }
    log('Ranged kiter pressure:', rows);
    for (const r of rows) expect(r.dmgPerMin, JSON.stringify(r)).toBeGreaterThanOrEqual(450);
  }, 60000);
});
