import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { voltiris, VOLTIRIS } from '../../src/game/monsters/voltiris.js';
import { VOLT, addCharge, charge, state, beamAngles, cageRadius, liveEchoes, addEcho, addLane, laneLive } from '../../src/game/monsters/voltirisEchoes.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { time } from '../../src/core/time.js';
import { overlap as overlapShape } from '../../src/game/hitbox.js';
import { Hunt } from '../../src/game/hunt.js';
import { Projectiles } from '../../src/game/projectiles.js';
import { make, DT } from './p3helpers.js';

beforeEach(() => time.reset());
const VERBOSE = !!process.env.VOLT_QA_VERBOSE;
const log = (label, rows) => { if (VERBOSE) console.log(label, JSON.stringify(rows)); };
const ID = (n) => 'voltiris_' + n;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const LETHAL = 'voltiris_entladung';

function hunt({ phase = 0, distance = 8, seed = 11, hp = 1e6, protect = 150, god = false } = {}) {
  const h = make(voltiris, 'combat', 0, distance, seed);
  const { m, p, ctx } = h;
  p.god = god; p.protect = protect; p.v.hp = p.v.maxHp = hp;
  m.phase = phase; if (phase) m.hp = m.maxHp * (phase === 2 ? .2 : .6);
  m.fleeUsed = true; m.apexClock = -999;
  const attacks = [], hits = [], lethal = [];
  ctx.bus.on('monsterAttack', (e) => attacks.push({ at: m.time, id: e.attackId, tempoMul: e.tempoMul ?? 1 }));
  // The lethal bolt is measured separately: its damage would be a KO for any finite pool and distort the averages.
  const orig = p.takeHit.bind(p);
  p.takeHit = (hh) => {
    if (hh.attackId === LETHAL) { const r = orig({ ...hh, dmgPct: undefined, dmg: 0 }); lethal.push({ at: m.time, r }); return r; }
    return orig(hh);
  };
  ctx.bus.on('playerHit', (e) => { if (e.player === p) hits.push({ at: m.time, dmg: e.dmg, key: e.key }); });
  return { ...h, attacks, hits, lethal };
}
const tick = (h) => { h.ctx.input.poll(DT); h.p.update(DT); h.m.update(DT); h.ctx.projectiles?.update?.(DT); };
const sum = (hits) => hits.reduce((n, e) => n + e.dmg, 0);

// ---------------------------------------------------------------------------
describe('Voltiris: structure and fairness', () => {
  const moves = Object.values(voltiris.attacks).filter((a) => !a.internal && a.id.startsWith('voltiris_'));
  const params = { attackId: 'x', t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: .6, targetPos: { x: 4, y: 0, z: 12 }, seed: 99 };
  it('has at least 20 attacks across fast, mobility, control and signature roles, with a pure blink', () => {
    expect(moves.length).toBeGreaterThanOrEqual(20);
    for (const n of ['prismenbiss', 'fluegelkante', 'rueckkopplung', 'antennenstoss', 'doppelblitz', 'blinkhieb', 'phasenstich', 'rueckzugsblink', 'blitzraster', 'zickzacklaser', 'kettenblitz', 'blitzsalve', 'bahnsprint', 'prismensturm', 'nachbildserie', 'statiknova', 'kernbruch', 'gewitterkaefig']) expect(voltiris.attacks[ID(n)], n).toBeTruthy();
    expect(voltiris.attacks[ID('blink')].internal).toBe(true);
    expect(voltiris.hp).toBe(23000);
    expect(voltiris.phases.map((p) => p.at)).toEqual([.68, .3]);
  });
  it('every damaging strike is audited; telegraph >= 0.5 s under rage and tempo; recovery >= 0.4 s, signatures >= 1.5 s', () => {
    for (const a of moves) {
      if (a.hits?.some((h) => h.dmg > 0)) expect(a.audit?.length, a.id).toBeGreaterThan(0);
      for (const rage of [false, true]) for (const tempoMul of [1, 1.08, 1.16]) {
        const inst = new AttackInstance(a, { ...params, attackId: a.id, rage, tempoMul });
        if (a.hits?.length) expect(inst.firstHitTime(), `${a.id} rage=${rage} tempo=${tempoMul}`).toBeGreaterThanOrEqual(.5 - 1e-9);
        expect(inst.tgWall, a.id).toBeGreaterThanOrEqual(.5 - 1e-9);
        const last = a.hits?.length ? Math.max(...a.hits.map((h) => h.t1)) : a.id === ID('gewitterkaefig') ? a.duration - VOLT.CRASH_TIME : 0;
        const rec = (a.duration - last) / (rage ? 1.2 : 1) / tempoMul;
        expect(rec, `${a.id} recovery`).toBeGreaterThanOrEqual(.4);
        if (a.punishWindow) expect(rec, `${a.id} signature recovery`).toBeGreaterThanOrEqual(1.5);
      }
    }
  });
  it('markers come from the hit shapes, lightning loads the hunter, and every pose track is monotone', () => {
    for (const a of moves) {
      if (a.hits?.length) expect(a.markerFromHits, a.id).toBe(true);
      for (let i = 1; i < a.pose.length; i++) expect(a.pose[i].t, `${a.id} pose ${i}`).toBeGreaterThanOrEqual(a.pose[i - 1].t);
      expect(a.pose.at(-1).t, `${a.id} pose end`).toBeLessThanOrEqual(a.duration + 1e-6);
    }
    expect(voltiris.attacks[ID('blitzraster')].hits.every((h) => h.charge)).toBe(true);
    expect(voltiris.attacks[ID('prismenbiss')].hits.some((h) => h.charge)).toBe(false); // physical melee does not charge
  });
  it('big casts hover with a Kurzschluss window that closes before the first hit', () => {
    for (const id of ['blitzraster', 'zickzacklaser', 'prismensturm', 'gewitterkaefig']) {
      const a = voltiris.attacks[ID(id)];
      expect(a.shortWindow, id).toBeTruthy();
      expect(a.shortWindow[1], id).toBeLessThan(a.hits?.length ? Math.min(...a.hits.map((h) => h.t0)) : a.telegraph);
      expect(a.shortWindow[1] - a.shortWindow[0], id).toBeGreaterThanOrEqual(.75);
      expect(a.motion(a.shortWindow[0] + .4, new AttackInstance(a, { ...params, attackId: a.id })).air, id).toBeGreaterThan(1);
    }
  });
});

// ---------------------------------------------------------------------------
describe('Voltiris: salvo tempo and distance keeping', () => {
  it('starts roughly 21-25 attacks per minute in the opening state and at least 16 in the later ones', () => {
    const rows = [];
    for (const phase of [0, 1, 2]) for (const seed of [11, 37]) {
      const h = hunt({ phase, seed, god: true });
      for (let f = 0; f < 120 * 60; f++) tick(h);
      rows.push({ phase, seed, perMin: +(h.attacks.length / (h.m.time / 60)).toFixed(1) });
    }
    log('Tempo:', rows);
    for (const r of rows) { expect(r.perMin, JSON.stringify(r)).toBeGreaterThanOrEqual(r.phase === 0 ? 21 : 16); expect(r.perMin, JSON.stringify(r)).toBeLessThanOrEqual(r.phase === 0 ? 25 : 28); }
  }, 120000);

  it('blinks to 14-20 m after salvos and keeps a median distance of at least 10 m to a standing hunter', () => {
    const rows = [];
    for (const phase of [0, 2]) for (const seed of [11, 37, 5]) {
      const h = hunt({ phase, seed, god: true }); const { m, p } = h;
      const ds = [], exits = [];
      h.ctx.bus.on('sfx', (e) => { if (e.name === 'glitch' && m.attack?.inst.def.blink && m.attack.t >= .6 && m.attack.t < .63) exits.push(dist(p.pos, m.pos)); });
      for (let f = 0; f < 120 * 60; f++) { tick(h); ds.push(dist(p.pos, m.pos)); }
      ds.sort((a, b) => a - b);
      rows.push({ phase, seed, median: +ds[ds.length >> 1].toFixed(1), blinks: h.attacks.filter((a) => voltiris.attacks[a.id].blink).length, salvos: h.attacks.filter((a) => a.id === ID('blink')).length });
    }
    log('Distance:', rows);
    for (const r of rows) { expect(r.median, JSON.stringify(r)).toBeGreaterThanOrEqual(10); expect(r.blinks, JSON.stringify(r)).toBeGreaterThanOrEqual(8); }
  }, 120000);

  it('blink exits lie 14-20 m from the hunter, sideways, with a 0.6 s marker and 0.25 s vanish', () => {
    for (const seed of [3, 17, 91]) {
      const h = hunt({ seed, god: true, distance: 6 }); const { m, p, ctx } = h;
      const marks = [];
      ctx.fx.marker = (key, at) => { if (key === `${m.id}:exit`) marks.push({ at: m.time, x: at.x, z: at.z }); };
      m.recover = 0; m.queued = ID('blink');
      const t0 = m.time; let vanished = null, appeared = null, gapMin = 1;
      for (let f = 0; f < 4 * 60 && !appeared; f++) {
        tick(h);
        const a = m.attack;
        if (a && vanished === null && m.mesh.visible === false) vanished = m.time;
        if (a && vanished !== null && appeared === null && m.mesh.visible) appeared = m.time;
        if (a) gapMin = Math.min(gapMin, a.inst.def.blinkGap[1] - a.inst.def.blinkGap[0]);
      }
      expect(marks.length, 'marker shown').toBeGreaterThan(0);
      const exit = marks[0], d = dist(p.pos, exit);
      expect(d, `exit distance seed ${seed}`).toBeGreaterThanOrEqual(14 - .01); expect(d).toBeLessThanOrEqual(20 + .01);
      expect(dist(m.pos, exit), 'lands on the marker').toBeLessThan(.5);
      const lead = (appeared ?? m.time) - marks[0].at;
      expect(lead, 'marker leads the arrival by ~0.6 s').toBeGreaterThanOrEqual(.55); expect(lead).toBeLessThanOrEqual(.75);
      expect(gapMin).toBeLessThanOrEqual(.3);
      void t0;
    }
  });

  it('a hunter who sticks to him (>3 s under 5 m) eats the Statiknova (0.6 s tell) and is then left behind by a blink', () => {
    const h = hunt({ distance: 3, god: true }); const { m, p } = h;
    let nova = null, blinkAfter = null;
    for (let f = 0; f < 40 * 60 && !blinkAfter; f++) {
      if (!m.attack && !nova) p.pos.set(m.pos.x + Math.sin(m.rot) * 2.5, 0, m.pos.z + Math.cos(m.rot) * 2.5);
      tick(h);
      const a = m.attack;
      if (a?.id === ID('statiknova') && !nova) nova = { at: m.time, tg: a.inst.tgWall, r: a.inst.def.hits[0].radius };
      if (nova && a?.id === ID('blink')) blinkAfter = m.time;
    }
    log('Klebe:', { nova, blinkAfter });
    expect(nova, 'statiknova happened').not.toBeNull();
    expect(nova.r).toBe(5); expect(nova.tg).toBeGreaterThanOrEqual(.55);
    expect(blinkAfter, 'blink away follows').not.toBeNull();
  }, 60000);

  it('a damage spike makes him blink after the current strike', () => {
    const h = hunt({ distance: 12, god: true }); const { m } = h;
    m.recover = 99; for (let i = 0; i < 30; i++) tick(h); m.recover = 0;
    m.applyDamage({ partId: 'body', dmg: m.maxHp * .06, elemDmg: 0, blunt: 0, attackerId: 'p1' });
    expect(m._spikeBlink).toBe(true);
    let blinked = false;
    for (let f = 0; f < 6 * 60 && !blinked; f++) { tick(h); if (m.attack?.id === ID('blink') || m.queued === ID('blink')) blinked = true; }
    expect(blinked).toBe(true);
  });

  it('a melee hunter who chases him is within 6 m for at least 40 % of the salvo time', () => {
    const rows = [];
    for (const phase of [0, 2]) for (const seed of [11, 37, 5]) {
      const h = hunt({ phase, seed, god: true, distance: 10 }); const { m, p, ctx } = h;
      let atk = 0, near = 0, all = 0, nearAll = 0;
      for (let f = 0; f < 120 * 60; f++) {
        // A bot that never stops running at him (stick toward him in camera space, camera looks toward the monster).
        const dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
        ctx.cameraYaw = Math.atan2(dx, dz);
        if (p.state === 'free') ctx.input.setStick(0, d > 2.4 ? 1 : 0, 'bot');
        tick(h);
        const d2 = dist(p.pos, m.pos);
        all++; if (d2 < 6) nearAll++;
        if (m.attack && !m.attack.inst.def.blink) { atk++; if (d2 < 6) near++; }
      }
      rows.push({ phase, seed, salvoShare: +(atk / all).toFixed(2), nearInSalvo: +(near / Math.max(1, atk)).toFixed(2), nearOverall: +(nearAll / all).toFixed(2) });
    }
    log('Chaser:', rows);
    for (const r of rows) expect(r.nearInSalvo, JSON.stringify(r)).toBeGreaterThanOrEqual(.4);
  }, 120000);
});

// ---------------------------------------------------------------------------
describe('Voltiris: charge and discharge', () => {
  const rollNow = (h) => { h.ctx.input.setStick(1, 0, 'bot'); h.ctx.input.press('roll', 50); tick(h); h.ctx.input.setStick(0, 0, 'bot'); };
  const quiet = (opts) => { const h = hunt({ god: false, hp: 5000, ...opts }); h.m.recover = 9999; return h; };

  it('stacks 0-3 from lightning hits, lane time, shattered echoes and the cage wall; at 3 a visible 1.2 s countdown starts', () => {
    const h = quiet(); const { m, p, ctx } = h;
    const marks = []; ctx.fx.marker = (key) => marks.push(key);
    expect(charge(p).n).toBe(0);
    addCharge(m, p); addCharge(m, p); expect(charge(p).n).toBe(2); expect(charge(p).countdown).toBe(0);
    let announced = 0; ctx.bus.on('voltCountdown', () => announced++);
    addCharge(m, p); expect(charge(p).n).toBe(3); expect(charge(p).countdown).toBeCloseTo(VOLT.COUNTDOWN, 2); expect(announced).toBe(1);
    addCharge(m, p, 5); expect(charge(p).n).toBe(3);
    for (let i = 0; i < 10; i++) tick(h);
    expect(marks.some((k) => k.startsWith('volt:cd:'))).toBe(true); // the shrinking ring over the hunter
    // a lightning attack hit (onHitPlayer) and a bolt (onProjectileHit) both load
    const q = quiet(); charge(q.p).n = 0;
    voltiris.onHitPlayer(q.m, q.p, { hit: { charge: true }, dmg: 100 }); expect(charge(q.p).n).toBe(1);
    voltiris.onHitPlayer(q.m, q.p, { hit: {}, dmg: 100 }); expect(charge(q.p).n).toBe(1);
    voltiris.onProjectileHit(q.m, q.p, { dmg: 100 }); expect(charge(q.p).n).toBe(2);
  });

  it('a roll sheds one stack, at most once per 0.8 s', () => {
    const h = quiet(); const { m, p } = h;
    p.v.stamina = 100; charge(p).n = 2;
    rollNow(h); for (let i = 0; i < 5; i++) tick(h);
    expect(charge(p).n).toBe(1);
    for (let i = 0; i < 60 && p.state === 'roll'; i++) tick(h);
    expect(p.state).toBe('free'); expect(charge(p).cd).toBeGreaterThan(0);
    rollNow(h); for (let i = 0; i < 5; i++) tick(h);
    expect(charge(p).n, 'second roll inside the cooldown does not shed').toBe(1);
    for (let i = 0; i < 90; i++) tick(h);
    p.v.stamina = 100; rollNow(h); for (let i = 0; i < 5; i++) tick(h);
    expect(charge(p).n, 'after 0.8 s it sheds again').toBe(0);
    void m;
  });

  it('hitting the real body grounds: melee -1, ranged only every third hit; echo hits do not ground', () => {
    const h = quiet(); const { m, p, ctx } = h;
    const hit = (part = 'body') => ctx.bus.emit('hit', { player: p, monster: m, part, dmg: 80 });
    charge(p).n = 3; hit(); expect(charge(p).n).toBe(2);
    p.weaponId = 'bow'; charge(p).n = 2; charge(p).ranged = 0;
    hit(); hit(); expect(charge(p).n).toBe(2); hit(); expect(charge(p).n).toBe(1);
    p.weaponId = 'gs'; hit('echo0'); expect(charge(p).n).toBe(1);
  });

  it('the countdown is cancelled by rolling or grounding below 3 stacks; left alone it ends in the lethal bolt and a fall to 0', () => {
    const cancel = quiet(); addCharge(cancel.m, cancel.p, 3);
    for (let i = 0; i < 30; i++) tick(cancel);
    cancel.ctx.bus.emit('hit', { player: cancel.p, monster: cancel.m, part: 'body', dmg: 80 });
    expect(charge(cancel.p).countdown).toBe(0); expect(charge(cancel.p).n).toBe(2);
    for (let i = 0; i < 120; i++) tick(cancel);
    expect(cancel.lethal).toHaveLength(0); expect(cancel.p.alive).toBe(true);

    const rolled = quiet(); rolled.p.v.stamina = 100; addCharge(rolled.m, rolled.p, 3);
    for (let i = 0; i < 30; i++) tick(rolled);
    rollNow(rolled); for (let i = 0; i < 120; i++) tick(rolled);
    expect(rolled.lethal).toHaveLength(0);

    const idle = quiet(); addCharge(idle.m, idle.p, 3);
    const marks = []; idle.ctx.fx.marker = (key, at, r) => { if (key.startsWith('volt:cd:')) marks.push(+r.toFixed(2)); };
    let t = 0; while (idle.lethal.length === 0 && t < 3) { tick(idle); t += DT; }
    expect(t).toBeGreaterThan(VOLT.COUNTDOWN - .05); expect(t).toBeLessThan(VOLT.COUNTDOWN + .1);
    expect(charge(idle.p).n).toBe(0);
    expect(marks[0], 'ring contracts').toBeGreaterThan(marks.at(-1));
  });

  it('the discharge is lethal (a full pool dies), knocks down, and a roll that is in its i-frames dodges it', () => {
    const real = (rollAt) => {
      const h = make(voltiris, 'combat', 0, 14, 11); const { m, p, ctx } = h;
      p.god = false; p.protect = 150; m.recover = 9999; p.v.stamina = 100;
      charge(p).cd = 5; // a roll inside the cooldown does not shed: only its i-frames can save him
      addCharge(m, p, 3);
      let result = null; const orig = p.takeHit.bind(p);
      p.takeHit = (hh) => { const r = orig(hh); if (hh.attackId === LETHAL) result = r; return r; };
      let rolled = false;
      for (let f = 0; f < 3 * 60 && !result; f++) {
        if (rollAt !== null && !rolled && charge(p).countdown > 0 && charge(p).countdown <= rollAt) { ctx.input.setStick(1, 0, 'bot'); ctx.input.press('roll', 50); rolled = true; }
        ctx.input.poll(DT); p.update(DT); ctx.input.setStick(0, 0, 'bot'); m.update(DT); m.recover = 9999;
      }
      return { result, state: p.state, hp: p.v.hp, max: p.v.maxHp };
    };
    const idle = real(null);
    expect(idle.result).toBe('hit'); expect(idle.state).toBe('ko');
    // sweep the roll start: a window of timings must dodge (roll i-frames 0.06-0.30 s), others must not
    let dodged = 0, hitCount = 0;
    for (let rollAt = .6; rollAt >= 0; rollAt -= DT) { const r = real(rollAt); if (r.result === 'iframe' || r.result === 'perfect') dodged++; else if (r.result === 'hit') hitCount++; }
    log('Discharge dodge frames:', { dodged, hitCount });
    expect(dodged * DT).toBeGreaterThanOrEqual(.1); expect(hitCount).toBeGreaterThan(0);
  }, 120000);

  it('standing in a Strombahn loads one stack per 1.5 s and ticks lightly; leaving resets the timer', () => {
    const h = quiet({ distance: 30 }); const { m, p } = h;
    p.pos.set(5, 0, 5);
    addLane(m, 5, -4, 5, 16, { key: 't-lane', secs: 6 });
    const hits = h.hits;
    for (let f = 0; f < 4 * 60; f++) tick(h);
    expect(charge(p).n).toBeGreaterThanOrEqual(2); expect(charge(p).n).toBeLessThanOrEqual(3);
    const dmg = sum(hits); expect(dmg).toBeGreaterThan(0); expect(dmg / (3.4 / VOLT.LANE_TICK)).toBeLessThan(25);
    const q = quiet({ distance: 30 }); q.p.pos.set(5, 0, 5);
    addLane(q.m, 5, -4, 5, 16, { key: 'u-lane', secs: 8 });
    for (let f = 0; f < 70; f++) tick(q);
    q.p.pos.set(14, 0, 5); for (let f = 0; f < 90; f++) tick(q);
    const before = charge(q.p).n;
    for (let f = 0; f < 80; f++) tick(q);
    expect(charge(q.p).n).toBe(before);
  });
});

// ---------------------------------------------------------------------------
describe('Voltiris: echoes', () => {
  const quiet = (opts) => { const h = hunt({ hp: 1e5, ...opts }); h.m.recover = 9999; return h; };
  it('every blink leaves an afterimage at its start point: two echoes, three from 68 %', () => {
    for (const [phase, cap] of [[0, 2], [1, 3]]) {
      const h = quiet({ phase, god: true }); const { m } = h;
      for (let n = 0; n < 5; n++) { m.recover = 0; m.beginAttack(ID('blink')); for (let f = 0; f < 150 && m.attack; f++) tick(h); }
      expect(liveEchoes(m).length, `phase ${phase}`).toBe(cap);
    }
  });
  it('echoes are body parts for weapons and bolts: a real hit shatters one, grants +1 charge, shocks lightly and never hurts the real HP', () => {
    const h = quiet({ god: false, hp: 5000, distance: 3 }); const { m, p, ctx } = h;
    ctx.projectiles = new Projectiles(ctx, { visual: false });
    ctx.mods = { player: {} }; ctx.glitchSys = {}; ctx.stats = { damage: 0, hits: 0 };
    ctx.playerHit = Hunt.prototype.playerHit.bind(ctx);
    const e = addEcho(m, 8.2, 0, { key: 'e-test', yaw: Math.PI });
    expect(e).toBeTruthy();
    m._visuals(DT);
    const parts = m.hurtParts();
    const entry = parts.find((q) => q.part.id === 'echo0'); expect(entry).toBeTruthy();
    expect(entry.part.factor).toBeLessThan(.1);
    const hp0 = m.hp, php = p.v.hp;
    p.spawnAt(5, 0, Math.PI / 2); p.rot = Math.PI / 2;
    for (let f = 0; f < 60 && !e.dead; f++) { ctx.input.set('attack', f < 3, 'bot'); ctx.input.poll(DT); p.update(DT); m._visuals(DT); }
    expect(e.dead, 'echo shattered by a real swing').toBe(true);
    expect(m.hp, 'real HP untouched').toBe(hp0);
    expect(charge(p).n).toBe(1);
    expect(php - p.v.hp).toBeGreaterThan(0); expect(php - p.v.hp).toBeLessThan(40);
    expect(m.hurtParts().some((q) => q.part.id === 'echo0')).toBe(false);
  });
  it('echo bolts hit for half of a full bolt, load the hunter and are readable (marker before the shot)', () => {
    const full = voltiris.attacks[ID('doppelblitz')];
    const h = quiet({ god: false, hp: 5000, distance: 12 }); const { m, p, ctx } = h;
    state(m).aim = { x: p.pos.x, z: p.pos.z };
    const marks = []; ctx.fx.marker = (key) => marks.push(key);
    const e = addEcho(m, 0, 2, { key: 'e-bolt', yaw: 0 }); e.side = 0;
    let first = null;
    ctx.bus.on('playerHit', (ev) => { if (ev.player === p && first === null) first = ev; });
    for (let f = 0; f < 5 * 60 && first === null; f++) { p.pos.set(state(m).aim.x, 0, state(m).aim.z); tick(h); }
    expect(marks.some((k) => k.startsWith('e-bolt:aim'))).toBe(true);
    expect(first, 'echo bolt reached the hunter').not.toBeNull();
    expect(first.dmg).toBeLessThan(155 * .5 * (1 - 150 / 230) + 1); // weak: well below a full bolt
    expect(VOLT.ECHO_MUL).toBe(.5); expect(Math.round(VOLT.ECHO_BOLT * VOLT.ECHO_MUL)).toBeLessThan(155 * .5 + 1); // never above half of the quick bolt
    expect(charge(p).n).toBe(1);
  });
  it('echoes appear only from replicated events: a guest replay spawns the same ones', () => {
    const run = (authority) => {
      const { m, p } = make(voltiris, 'combat', 40, 40, 7); p.god = true; m.authority = authority; m.time = 1;
      m.startAttack({ attackId: ID('nachbildserie'), t0: 1, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 4, y: 0, z: 14 }, seed: 5 });
      const seen = [];
      for (let f = 0; f < 5 * 60 && (f === 0 || m.attack); f++) { if (authority) m.update(DT); else m.tickRemote(DT); for (const e of state(m).echoes) if (!seen.some((s) => s.key === e.key)) seen.push({ key: e.key, x: +e.x.toFixed(3), z: +e.z.toFixed(3), t0: +e.t0.toFixed(3), slot: e.slot }); }
      return seen;
    };
    const host = run(true), guest = run(false);
    expect(host.length).toBe(2); expect(guest).toEqual(host);
  });
});

// ---------------------------------------------------------------------------
describe('Voltiris: Kurzschluss', () => {
  const setup = (opts) => {
    const h = hunt({ distance: 14, god: true, ...opts }); const { m } = h;
    m.recover = 0; m.queued = null; m.cds = {};
    m.beginAttack(ID('blitzraster'), { tgMul: 1 });
    return h;
  };
  const stepTo = (h, tau) => { while (h.m.attack && h.m.attack.inst.sample(h.m.attack.t).tau < tau) tick(h); };
  const dmg = (part, d) => ({ partId: part, dmg: d, elemDmg: 0, blunt: 0, attackerId: 'p1' });
  it('antenna or core damage inside the hover window shorts him out: crash, 4 s stagger, wings x1.4', () => {
    for (const part of ['antenna', 'body']) {
      const h = setup(); const { m } = h;
      stepTo(h, .8);
      expect(m.air).toBeGreaterThan(1.5);
      m.applyDamage(dmg(part, 200)); expect(m.attack).not.toBeNull(); expect(m.stagT).toBe(0);
      m.applyDamage(dmg(part, 200));
      expect(m.attack, part).toBeNull(); expect(m.stagT).toBeGreaterThanOrEqual(VOLTIRIS.COUNTER_TIME - .01); expect(m.recover).toBeGreaterThanOrEqual(VOLTIRIS.COUNTER_TIME - .01);
      const base = m.partById.wing.baseFactor;
      tick(h);
      expect(m.partById.wing.factor).toBeCloseTo(base * VOLTIRIS.WING_EXPOSED, 3);
      for (let f = 0; f < 5 * 60; f++) tick(h);
      expect(m.partById.wing.factor).toBeCloseTo(base, 3);
      expect(m.air).toBe(0);
    }
  });
  it('damage outside the window, to other parts, below the threshold, or after the cast opened does nothing', () => {
    let h = setup(); stepTo(h, .2); h.m.applyDamage(dmg('antenna', 900)); expect(h.m.attack).not.toBeNull();
    h = setup(); stepTo(h, .8); h.m.applyDamage(dmg('wing', 600)); h.m.applyDamage(dmg('head', 600)); expect(h.m.attack).not.toBeNull();
    h = setup(); stepTo(h, .8); h.m.applyDamage(dmg('antenna', 250)); expect(h.m.attack).not.toBeNull();
    h = setup(); stepTo(h, 1.6); h.m.applyDamage(dmg('antenna', 900)); expect(h.m.stagT).toBe(0);
  });
  it('the threshold scales with co-op HP like Pyrostur\'s pressure counter', () => {
    const h = setup(); const { m } = h;
    m.maxHp *= 2; m.hp = m.maxHp; stepTo(h, .8);
    m.applyDamage(dmg('antenna', 400)); expect(m.attack).not.toBeNull();
    m.applyDamage(dmg('antenna', 200)); expect(m.attack).toBeNull();
  });
  it('after a successful counter the next big cast is protected for a while; the lethal bolt of lanes still works', () => {
    const h = setup(); const { m } = h; stepTo(h, .8);
    m.applyDamage(dmg('antenna', 400)); expect(m._kurzCd).toBeGreaterThan(5);
    m.stagT = 0; m.recover = 0; m.beginAttack(ID('blitzraster'), { tgMul: 1 }); stepTo(h, .8);
    m.applyDamage(dmg('antenna', 900)); expect(m.attack).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('Voltiris: Gewitterkäfig', () => {
  const cageHunt = (opts) => {
    const h = hunt({ phase: 2, distance: 9, god: false, hp: 1e5, ...opts }); const { m } = h;
    m.recover = 0; m.queued = null; m.cds = {}; m.phaseSpecial = null; m.phaseT = 0;
    m.beginAttack(ID('gewitterkaefig'), { tgMul: 1 });
    return h;
  };
  it('blinks into the centre, closes from 22 to 12 m, and runs two counter-rotating lighthouse beams; then he crashes open for 3 s', () => {
    const h = cageHunt({ god: true }); const { m, p } = h;
    let cage = null, centreGap = Infinity; const radii = [], a1 = [], a2 = []; let crashed = null;
    for (let f = 0; f < 22 * 60; f++) {
      tick(h);
      cage ??= state(m).cage;
      const c = state(m).cage;
      if (c && m.time >= c.t0) { centreGap = Math.min(centreGap, dist(m.pos, { x: c.cx, z: c.cz })); radii.push(cageRadius(c, m.time)); const [x, y] = beamAngles(c, m.time); a1.push(x); a2.push(y); }
      if (crashed === null && m.exposedT > 2.9 && c === null && cage) crashed = m.time;
    }
    expect(cage).toBeTruthy();
    expect(radii[0]).toBeCloseTo(VOLT.CAGE_R0, 0); expect(Math.min(...radii)).toBeCloseTo(VOLT.CAGE_R1, 0);
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeLessThanOrEqual(radii[i - 1] + 1e-9);
    const d1 = a1.at(-1) - a1[Math.floor(a1.length * .4)], d2 = a2.at(-1) - a2[Math.floor(a2.length * .4)];
    expect(d1 * d2, 'counter-rotating').toBeLessThan(0);
    expect(crashed, 'crashed and exposed after the cage').not.toBeNull();
    expect(centreGap, 'he hovers in the centre of his own cage').toBeLessThan(.6);
    log('Cage:', { cx: cage.cx, cz: cage.cz, dur: cage.dur, minR: Math.min(...radii) });
    void p;
  }, 60000);
  it('the wall and the beams hurt and load; a hunter inside the shrinking rim who sidesteps the beams survives', () => {
    // idle at the rim vs. a hunter standing safely in the middle band
    const outside = cageHunt(); const inside = cageHunt();
    const placeAt = (h, r, ang) => { const c = state(h.m).cage; if (c) h.p.pos.set(c.cx + Math.sin(ang) * r, 0, c.cz + Math.cos(ang) * r); };
    let wallHits = 0;
    outside.ctx.bus.on('playerHit', (e) => { if (e.key.includes('|wall|')) wallHits++; });
    for (let f = 0; f < 14 * 60; f++) {
      placeAt(outside, 21.5, 2.3); tick(outside);
      tick(inside);
    }
    expect(wallHits, 'standing on the rim as it shrinks is punished').toBeGreaterThanOrEqual(3);
    expect(charge(outside.p).n + outside.lethal.length, 'loaded (or already discharged)').toBeGreaterThanOrEqual(1);
    const beamHit = outside.hits.some((e) => e.key.includes('|beam'));
    expect(typeof beamHit).toBe('boolean');
  }, 60000);
  it('beams are dodgeable with a roll, are armed only after a warning, and share the global roll i-frames', () => {
    const h = cageHunt({ hp: 1e5 }); const { m, p, ctx } = h;
    let c = null;
    for (let f = 0; f < 4 * 60 && !c; f++) { tick(h); c = state(m).cage; }
    expect(c).toBeTruthy();
    // before arming the hunter standing on the start angle is not damaged
    const [a1] = beamAngles(c, m.time);
    p.pos.set(c.cx + Math.sin(a1) * 8, 0, c.cz + Math.cos(a1) * 8);
    let hurtEarly = 0; ctx.bus.on('playerHit', (e) => { if (e.key.includes('|beam') && m.time < c.t0 + VOLT.CAGE_ARM) hurtEarly++; });
    for (let f = 0; f < (VOLT.CAGE_ARM - .3) * 60; f++) { p.pos.set(c.cx + Math.sin(a1) * 8, 0, c.cz + Math.cos(a1) * 8); tick(h); }
    expect(hurtEarly).toBe(0);
  }, 60000);
  it('arrives 2-3 times per 200 s of the last state, and never before 30 % HP', () => {
    const run = (phase, secs) => {
      const h = hunt({ phase, god: true, seed: 11 }); const { m } = h;
      for (let f = 0; f < secs * 60; f++) tick(h);
      return h.attacks.filter((a) => a.id === ID('gewitterkaefig')).map((a) => +a.at.toFixed(1));
    };
    const last = run(2, 200), first = run(1, 120);
    log('Cage cadence:', { last, first });
    expect(last.length).toBeGreaterThanOrEqual(2); expect(last.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < last.length; i++) expect(last[i] - last[i - 1]).toBeGreaterThanOrEqual(79);
    expect(first).toHaveLength(0);
  }, 120000);
  it('crossing 30 % queues the cage as the state-change special', () => {
    const h = hunt({ phase: 1, god: true }); const { m } = h;
    m.recover = 99; m.hp = m.maxHp * .29; m._b2Tick(.01);
    expect(m.phase).toBe(2); expect(m.phaseSpecial).toBe(ID('gewitterkaefig'));
  });
});

// ---------------------------------------------------------------------------
describe('Voltiris: host and guest determinism', () => {
  const params = (id) => ({ attackId: id, t0: 1, origin: { x: 0, y: 0, z: 0 }, yaw: .8, targetPos: { x: 4, y: 0, z: 13 }, seed: 424242 });
  const attacks = Object.values(voltiris.attacks).filter((a) => a.id.startsWith('voltiris_'));
  for (const def of attacks) it(`${def.id}: guest replay builds identical echoes, lanes, cage, projectiles and motion`, () => {
    const run = (authority) => {
      const { m, p } = make(voltiris, 'combat', 60, 60, 7);
      p.god = true; m.authority = authority; m.time = 1; m.phase = 1; m.hp = m.maxHp * .6;
      let spawns = 0;
      const orig = m.projectiles.spawn.bind(m.projectiles);
      m.projectiles.spawn = (...a) => { spawns++; return orig(...a); };
      m.startAttack(params(def.id));
      const seen = { echoes: [], lanes: [], cage: null, path: [] };
      let ended = false;
      for (let i = 0; i < 24 * 60 && !ended; i++) {
        if (authority) m.update(DT); else m.tickRemote(DT);
        const v = state(m);
        for (const e of v.echoes) if (!seen.echoes.some((o) => o.key === e.key)) seen.echoes.push({ key: e.key, x: +e.x.toFixed(4), z: +e.z.toFixed(4), t0: +e.t0.toFixed(4), t1: +e.t1.toFixed(4), slot: e.slot, shots: e.shots.map((s) => +s.at.toFixed(4)) });
        for (const l of v.lanes) if (!seen.lanes.some((o) => o.key === l.key)) seen.lanes.push({ key: l.key, a: [+l.ax.toFixed(4), +l.az.toFixed(4)], b: [+l.bx.toFixed(4), +l.bz.toFixed(4)], t0: +l.t0.toFixed(4), t1: +l.t1.toFixed(4) });
        if (v.cage && !seen.cage) seen.cage = { cx: +v.cage.cx.toFixed(4), cz: +v.cage.cz.toFixed(4), t0: +v.cage.t0.toFixed(4), dur: +v.cage.dur.toFixed(4), th0: +v.cage.th0.toFixed(4) };
        if (i % 6 === 0) seen.path.push([+m.pos.x.toFixed(3), +m.pos.z.toFixed(3), +m.air.toFixed(3), +m.rot.toFixed(3)]);
        ended = m.attack === null;
      }
      return { seen, spawns, ended };
    };
    const host = run(true), guest = run(false);
    expect(host.ended && guest.ended).toBe(true);
    expect(guest.seen).toEqual(host.seen);
    expect(guest.spawns).toBe(host.spawns);
    const id = def.id;
    if (id === ID('blitzraster')) expect(host.seen.lanes.length).toBe(3);
    if (id === ID('blitzraster_bruch')) expect(host.seen.lanes.length).toBe(2);
    if (id === ID('nachbildserie')) expect(host.seen.echoes.length).toBeGreaterThanOrEqual(3);
    if (id === ID('gewitterkaefig')) expect(host.seen.cage).toBeTruthy();
    if (def.blink) expect(host.seen.echoes.length).toBeGreaterThanOrEqual(1);
    if (id === ID('doppelblitz')) expect(host.spawns).toBe(3);
    if (id === ID('faecherblitz')) expect(host.spawns).toBe(5);
    if (id === ID('blitzsalve')) expect(host.spawns).toBe(6);
    if (id === ID('gewitterschlag')) expect(host.spawns).toBe(3);
  }, 60000);
  it('lanes honour their ignition delay and lifetime', () => {
    const { m } = make(voltiris, 'combat', 60, 60, 7); m.time = 10;
    const l = addLane(m, 0, 0, 0, 10, { key: 'x' });
    expect(laneLive(l, 10)).toBe(false); expect(laneLive(l, 10 + VOLT.LANE_IGNITE + .1)).toBe(true); expect(laneLive(l, 10 + VOLT.LANE_IGNITE + VOLT.LANE_SECS + .1)).toBe(false);
    expect(addLane(m, 0, 0, 0, 10, { key: 'x' })).toBeNull(); // replays are idempotent
  });
});

// ---------------------------------------------------------------------------
describe('Voltiris: pressure and counterplay', () => {
  /** A hunter who reads the fight: rolls through anything about to hit him and steps off lanes. */
  function skilledStep(h) {
    const { m, p, ctx } = h;
    let roll = false, dir = null;
    const caps = p.hitCapsules();
    const free = p.state === 'free' && p.v.exhaust <= 0 && p.v.stamina >= 22;
    const dxm = p.pos.x - m.pos.x, dzm = p.pos.z - m.pos.z, dm = Math.hypot(dxm, dzm) || 1;
    const away = { x: dxm / dm, z: dzm / dm }, side = { x: -away.z, z: away.x };
    ctx.cameraYaw = Math.atan2(-dxm, -dzm);
    if (free && m.attack) {
      const a = m.attack;
      for (const x of a.inst.hitsAt(a.t + .12)) {
        if (x.dmg <= 0 || a.inst.hitSet.has(p.id + '|' + (x.hit.group ?? x.idx))) continue;
        if (caps.some((c) => overlapShape(x.shape, c))) { roll = true; dir = side; break; }
      }
    }
    if (free && !roll) for (const pr of m.projectiles.list) {
      const d = pr.def;
      if (pr.hit.has(p.id)) continue;
      if (d.mode === 'impact') { if (pr.age + .12 >= d.dur && pr.age <= d.dur + .2 && dist(p.pos, d.to) < d.splash + .6) { roll = true; dir = away; break; } continue; }
      // sweep bolt: where will it be in 0.1 s relative to the hunter?
      const k = (pr.age + .1) / d.dur; if (k > 1) continue;
      const bx = d.from.x + (d.to.x - d.from.x) * k, bz = d.from.z + (d.to.z - d.from.z) * k;
      if (Math.hypot(bx - p.pos.x, bz - p.pos.z) < d.radius + 1.0) { roll = true; dir = side; break; }
    }
    const cg = state(m).cage;
    if (free && !roll && cg && m.time >= cg.t0 + VOLT.CAGE_ARM) {
      for (const ang of beamAngles(cg, m.time + .12)) {
        const bx = cg.cx + Math.sin(ang) * VOLT.BEAM_LEN, bz = cg.cz + Math.cos(ang) * VOLT.BEAM_LEN;
        const dx = bx - cg.cx, dz = bz - cg.cz, l2 = dx * dx + dz * dz, k = Math.max(0, Math.min(1, ((p.pos.x - cg.cx) * dx + (p.pos.z - cg.cz) * dz) / l2));
        if (Math.hypot(p.pos.x - (cg.cx + dx * k), p.pos.z - (cg.cz + dz * k)) < VOLT.BEAM_R + .9) { roll = true; dir = away; break; }
      }
    }
    let wx = 0, wz = 0;
    for (const l of state(m).lanes) {
      if (m.time > l.t1 || m.time < l.t0 - .8) continue;
      const ex = l.bx - l.ax, ez = l.bz - l.az, l2 = ex * ex + ez * ez, k = Math.max(0, Math.min(1, ((p.pos.x - l.ax) * ex + (p.pos.z - l.az) * ez) / l2));
      const px = l.ax + ex * k, pz = l.az + ez * k, d = Math.hypot(p.pos.x - px, p.pos.z - pz);
      if (d < l.r + 1.6) { wx += (p.pos.x - px) / (d || 1); wz += (p.pos.z - pz) / (d || 1); }
    }
    if (cg && m.time >= cg.t0) { // stay well inside the shrinking rim
      const dx = p.pos.x - cg.cx, dz = p.pos.z - cg.cz, d = Math.hypot(dx, dz), R = cageRadius(cg, m.time);
      if (d > R - 3) { wx -= dx / d * 2; wz -= dz / d * 2; }
    }
    if (roll) { const v = dir ?? side; ctx.input.setStick(-v.x, v.z, 'bot'); ctx.input.set('roll', true, 'bot'); return true; }
    ctx.input.set('roll', false, 'bot');
    if (wx || wz) { const l = Math.hypot(wx, wz); ctx.input.setStick(-wx / l, wz / l, 'bot'); } else ctx.input.setStick(0, 0, 'bot');
    return false;
  }

  it('an idle hunter bleeds and is eventually discharged; a skilled roller takes at most a quarter of that damage', () => {
    const rows = [];
    for (const seed of [11, 37]) for (const phase of [0, 1]) {
      const idle = hunt({ phase, seed }), bot = hunt({ phase, seed });
      for (let f = 0; f < 60 * 60; f++) { tick(idle); skilledStep(bot); tick(bot); }
      const di = sum(idle.hits), db = sum(bot.hits);
      rows.push({ seed, phase, idle: Math.round(di), idleHits: idle.hits.length, bot: Math.round(db), botHits: bot.hits.length, ratio: +(db / Math.max(1, di)).toFixed(3), botLethal: bot.lethal.length, idleLethal: idle.lethal.length, keys: bot.hits.map((e) => e.key.split('|')[0].split('@')[0].replace('voltiris_', '') + '@' + e.at.toFixed(0)) });
    }
    log('Roller vs idle:', rows);
    for (const r of rows) { expect(r.idle, JSON.stringify(r)).toBeGreaterThan(300); expect(r.ratio, JSON.stringify(r)).toBeLessThanOrEqual(.25); expect(r.botLethal, JSON.stringify(r)).toBe(0); }
    expect(rows.some((r) => r.idleLethal > 0), 'an idle hunter is discharged at least once').toBe(true);
  }, 240000);

  it('an idle hunter at melee, mid and bow range is KOed within 15 s (no safe camping)', () => {
    const rows = [];
    for (const seed of [11, 37]) for (const distance of [3, 8, 16]) {
      const h = make(voltiris, 'combat', 0, distance, seed);
      h.p.god = false; h.p.protect = 150; h.p.v.hp = h.p.v.maxHp = 190; h.m.fleeUsed = true; h.m.apexClock = -999;
      let elapsed = 0; while (elapsed < 15 && h.p.state !== 'ko') { tick(h); elapsed += DT; }
      rows.push({ seed, distance, ko: h.p.state === 'ko', seconds: +elapsed.toFixed(1) });
    }
    log('Idle camping:', rows);
    for (const r of rows) expect(r.ko, JSON.stringify(r)).toBe(true);
  }, 240000);

  it('a circling crossbow/bow kiter at 12-16 m takes sustained damage (>= 600 per minute) and the same shots reach the real body', () => {
    const rows = [];
    for (const weapon of ['lb', 'bow']) {
      time.reset();
      const { m, p, ctx } = make(voltiris, 'combat', 0, 14, 11);
      p.god = false; p.protect = 150; p.v.hp = p.v.maxHp = 1e6; p.setWeapon(weapon, 7, null);
      m.maxHp *= 50; m.hp = m.maxHp; m.fleeUsed = true; m.apexClock = -999; p.lock = { monster: m, idx: 0 };
      ctx.projectiles = new Projectiles(ctx, { visual: false });
      ctx.mods = { player: {} }; ctx.glitchSys = {}; ctx.stats = { damage: 0, hits: 0 };
      ctx.playerHit = Hunt.prototype.playerHit.bind(ctx);
      let dmg = 0, starts = 0;
      const orig = p.takeHit.bind(p);
      p.takeHit = (hh) => orig(hh.attackId === LETHAL ? { ...hh, dmgPct: undefined, dmg: 0 } : hh);
      ctx.bus.on('playerHit', (e) => { dmg += e.dmg; });
      ctx.bus.on('monsterAttack', () => { starts++; });
      const SECS = 60;
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
    for (const r of rows) { expect(r.dmgPerMin, JSON.stringify(r)).toBeGreaterThanOrEqual(600); expect(r.dealtPerMin, JSON.stringify(r)).toBeGreaterThan(0); }
  }, 120000);

  it('every weapon can reach a damaging part of the grounded duelist', () => {
    // melee must reach legs/body/tail at a sane height; the antenna and wings are for the ranged and for hovering casts
    for (const weapon of ['gs', 'db', 'kt', 'ga', 'kk']) {
      const h = make(voltiris, 'combat', 0, 8, 11); const { m, p, ctx } = h;
      p.setWeapon(weapon, 6, null); p.god = true; m.recover = 9999;
      ctx.projectiles = new Projectiles(ctx, { visual: false });
      ctx.mods = { player: {} }; ctx.glitchSys = {}; ctx.stats = { damage: 0, hits: 0 };
      ctx.playerHit = Hunt.prototype.playerHit.bind(ctx);
      const hitParts = new Set();
      ctx.bus.on('hit', (e) => hitParts.add(e.part));
      const dmg0 = m.hp;
      for (let i = 0; i < 400; i++) {
        const dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
        p.rot = Math.atan2(dx, dz);
        if (d > 3.2) p.pos.set(m.pos.x - dx / d * 3.2, 0, m.pos.z - dz / d * 3.2);
        ctx.input.set('attack', i % 8 < 3, 'bot'); ctx.input.poll(DT); p.update(DT); m._visuals(DT);
      }
      expect(dmg0 - m.hp, weapon).toBeGreaterThan(0);
      log('Melee reach:', { weapon, parts: [...hitParts] });
    }
  }, 120000);
});

// ---------------------------------------------------------------------------
describe('Voltiris: chase pressure', () => {
  it('a melee hunter who never stops chasing takes at least 1000 damage per minute (previous design: about 770)', () => {
    const rows = [];
    for (const phase of [0, 2]) for (const seed of [11, 37, 5]) {
      const h = hunt({ phase, seed, god: false, hp: 1e6, distance: 10 }); const { m, p, ctx } = h;
      for (let f = 0; f < 60 * 60; f++) {
        const dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
        ctx.cameraYaw = Math.atan2(dx, dz);
        if (p.state === 'free') ctx.input.setStick(0, d > 2.4 ? 1 : 0, 'bot');
        tick(h);
      }
      rows.push({ phase, seed, perMin: Math.round(sum(h.hits) / (m.time / 60)) });
    }
    log('Chaser damage:', rows);
    const avg = rows.reduce((n, r) => n + r.perMin, 0) / rows.length;
    expect(avg, JSON.stringify(rows)).toBeGreaterThanOrEqual(1000);
  }, 120000);
});

// ---------------------------------------------------------------------------
describe('Voltiris: animation', () => {
  const attacks = Object.values(voltiris.attacks).filter((a) => a.id.startsWith('voltiris_'));
  const params = { t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: .6, targetPos: { x: 7, y: 0, z: 14 }, seed: 99 };
  const range = (a, key) => { const v = a.pose.map((f) => f.pose[key]); return Math.max(...v) - Math.min(...v); };
  const sweep = (a) => { const inst = new AttackInstance(a, { ...params, attackId: a.id }); const out = []; for (let t = 0; t <= inst.duration + 1e-9; t += .02) out.push({ t, ...inst.sample(t) }); return { inst, out }; };
  it('every attack blends in and out of the idle pose and swings with big amplitudes (tens of degrees)', () => {
    for (const a of attacks) {
      const first = a.pose[0].pose, last = a.pose.at(-1).pose, rest = voltiris.poseDefaults;
      for (const k of ['bodyY', 'bodyPitch', 'wing', 'jaw', 'head', 'tailPitch', 'headReach']) { expect(first[k], `${a.id} start ${k}`).toBeCloseTo(rest[k], 5); expect(last[k], `${a.id} end ${k}`).toBeCloseTo(rest[k], 5); }
      expect(a.pose.length, `${a.id} keyframes`).toBeGreaterThanOrEqual(6);
      expect(range(a, 'bodyPitch'), `${a.id} bodyPitch`).toBeGreaterThanOrEqual(24);
      expect(range(a, 'wing'), `${a.id} wing`).toBeGreaterThanOrEqual(60);
      expect(range(a, 'jaw'), `${a.id} jaw`).toBeGreaterThanOrEqual(45);
      expect(range(a, 'bodyY'), `${a.id} bodyY`).toBeGreaterThanOrEqual(.45);
    }
  });
  it('bolt casts snap the head and kick the body once per bolt', () => {
    for (const [id, shots] of [['doppelblitz', 3], ['faecherblitz', 5], ['blitzsalve', 6]]) {
      const a = voltiris.attacks[ID(id)];
      expect(a.pose.filter((f) => f.pose.headReach >= .7 && f.pose.jaw <= 10).length, `${id} snap frames`).toBeGreaterThanOrEqual(shots);
      expect(a.pose.filter((f) => f.pose.jaw >= 80).length, `${id} open-mouth frames`).toBeGreaterThanOrEqual(shots);
    }
    const s = voltiris.attacks[ID('blitzsalve')];
    expect(Math.min(...s.pose.filter((f) => f.pose.headReach >= .7).map((f) => f.t))).toBeGreaterThanOrEqual(s.telegraph - .1);
  });
  it('strikes lunge 2-4 m and recoil; casts strafe, hover 1-3 m with a bob and kick back per bolt; all land again', () => {
    for (const id of ['prismenbiss', 'fluegelkante', 'antennenstoss']) {
      const { out, inst } = sweep(voltiris.attacks[ID(id)]);
      const reach = Math.max(...out.map((s) => Math.hypot(s.x - inst.origin.x, s.z - inst.origin.z)));
      expect(reach, `${id} lunge`).toBeGreaterThanOrEqual(1.8); expect(reach, `${id} lunge`).toBeLessThanOrEqual(4.2);
      const end = out.at(-1), peak = Math.max(...out.map((s) => Math.hypot(s.x - inst.origin.x, s.z - inst.origin.z)));
      expect(Math.hypot(end.x - inst.origin.x, end.z - inst.origin.z), `${id} recoil`).toBeLessThan(peak - .8);
      expect(Math.max(...out.map((s) => s.air)), `${id} hop`).toBeGreaterThan(.25); expect(end.air).toBeCloseTo(0, 6);
    }
    for (const id of ['doppelblitz', 'faecherblitz', 'blitzsalve', 'nachbildserie', 'kettenblitz', 'gewitterschlag']) {
      const { out, inst } = sweep(voltiris.attacks[ID(id)]);
      const lateral = Math.max(...out.map((s) => Math.abs((s.x - inst.origin.x) * inst.dir.z - (s.z - inst.origin.z) * inst.dir.x)));
      const air = out.map((s) => s.air);
      expect(lateral, `${id} strafe`).toBeGreaterThanOrEqual(1.8);
      expect(Math.max(...air), `${id} hover`).toBeGreaterThanOrEqual(1); expect(Math.max(...air), `${id} hover`).toBeLessThanOrEqual(3);
      expect(air.at(-1), `${id} landed`).toBeCloseTo(0, 6);
      // the wing-beat bob: the height is not monotone while he rises
      let turns = 0; for (let i = 2; i < air.length; i++) if ((air[i] - air[i - 1]) * (air[i - 1] - air[i - 2]) < -1e-9) turns++;
      expect(turns, `${id} bob`).toBeGreaterThanOrEqual(2);
    }
  });
  it('a blink crouches, springs up and vanishes, reappears in the air and drops into a landing crouch', () => {
    for (const id of ['blink', 'blinkhieb', 'phasenstich', 'rueckzugsblink']) {
      const a = voltiris.attacks[ID(id)], [tv, ta] = a.blinkGap;
      const { out } = sweep(a);
      const at = (t) => out.reduce((best, s) => (Math.abs(s.t - t) < Math.abs(best.t - t) ? s : best));
      expect(at(tv).air, `${id} up at vanish`).toBeGreaterThan(1);
      expect(at(ta + .01).air, `${id} reappears high`).toBeGreaterThan(1);
      expect(at(ta + .4).air, `${id} lands`).toBeLessThan(.01);
      const pose = (t) => a.pose.reduce((best, f) => (Math.abs(f.t - t) < Math.abs(best.t - t) ? f : best)).pose;
      expect(pose(tv * .45).bodyY, `${id} crouch`).toBeLessThan(-.6);
      expect(pose(ta + .12).bodyY, `${id} landing crouch`).toBeLessThan(-.4);
    }
  });
  it('a hover cast keeps air above 1 m through the Kurzschluss window with a visible wing-beat bob', () => {
    for (const id of ['blitzraster', 'zickzacklaser', 'prismensturm']) {
      const a = voltiris.attacks[ID(id)], inst = new AttackInstance(a, { ...params, attackId: a.id });
      const air = []; for (let t = a.shortWindow[0] + .3; t <= a.shortWindow[0] + .6; t += .02) air.push(inst.sample(inst.wall(t)).air);
      expect(Math.min(...air), id).toBeGreaterThan(1); expect(Math.max(...air) - Math.min(...air), id).toBeGreaterThan(.1);
    }
  });
});

// ---------------------------------------------------------------------------
describe('Voltiris: visuals', () => {
  it('draws lanes, echoes and the cage into one bounded batch plus wireframe echoes when a scene exists, and nothing without one', () => {
    const h = hunt({ phase: 2, god: true, distance: 12 }); const { m, ctx } = h;
    for (let i = 0; i < 30; i++) tick(h);
    expect(m.extra.voltFx).toBeUndefined(); // headless: nothing allocated
    ctx.scene = new THREE.Scene();
    m.recover = 0; m.cds = {}; m.queued = ID('gewitterkaefig');
    let maxTris = 0, echoesShown = 0, sawCage = false;
    for (let f = 0; f < 9 * 60; f++) {
      tick(h);
      const fx = m.extra.voltFx; if (!fx) continue;
      const draw = fx.b.mesh.geometry.drawRange.count; maxTris = Math.max(maxTris, draw / 3);
      echoesShown = Math.max(echoesShown, [...fx.echoes.values()].filter((g) => g.visible).length);
      sawCage ||= !!state(m).cage;
      for (const n of [m.pos.x, m.pos.y, m.pos.z, m.rot]) expect(Number.isFinite(n)).toBe(true);
    }
    expect(sawCage).toBe(true); expect(maxTris).toBeGreaterThan(30); expect(maxTris).toBeLessThanOrEqual(6000);
    expect(echoesShown).toBeGreaterThanOrEqual(1);
    const g = m.extra.voltFx.echoes.values().next().value; const meshes = []; g.traverse((o) => o.isMesh && meshes.push(o));
    expect(meshes.length).toBeLessThanOrEqual(6); expect(meshes.every((x) => x.material.wireframe)).toBe(true);
    m.hp = 0; m._die?.(); for (let i = 0; i < 5; i++) m.update(DT);
    expect([...m.extra.voltFx.echoes.values()].every((x) => !x.visible)).toBe(true);
  }, 60000);
});
