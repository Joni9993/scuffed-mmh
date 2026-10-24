import { describe, it, expect, beforeEach } from 'vitest';
import { Player } from '../../src/game/player.js';
import { createBus } from '../../src/core/events.js';
import { createInput } from '../../src/input/input.js';
import { createRng } from '../../src/core/rng.js';
import { time } from '../../src/core/time.js';
import { resolvePlayerHit } from '../../src/game/combat.js';
import { HIT_REACTION, ROLL, VIT } from '../../src/game/vitals.js';

const DT = 1 / 60;
function makeCtx() {
  const calls = { numbers: [], glitch: 0 };
  const ctx = {
    world: { heightAt: () => 0, collide: () => {} },
    monsters: [], players: [], bus: createBus(), input: createInput(), rng: createRng(1), cameraYaw: 0,
    fx: { number: (p, t) => calls.numbers.push(t), spark() {}, shake() {}, flash() {}, glitch() { calls.glitch++; } },
    playerHit() {}, respawn(p) { p.respawn(0, 0); },
  };
  ctx.calls = calls;
  return ctx;
}
function make() {
  const ctx = makeCtx();
  const p = new Player({ ctx });
  p.spawnAt(0, 0, 0);
  ctx.players.push(p);
  const events = [];
  ctx.bus.on('*', (e, type) => events.push(type));
  ctx.events = events;
  const step = (n = 1) => { for (let i = 0; i < n; i++) { ctx.input.poll(DT); p.update(DT); } };
  const secs = (s) => step(Math.round(s / DT));
  return { ctx, p, step, secs };
}
beforeEach(() => time.reset());

describe('Blocked input feedback', () => {
  it('reports a roll only after its buffer expires with insufficient stamina', () => {
    const { ctx, p, step } = make(), notes = [];
    ctx.bus.on('inputBlocked', e => notes.push(e));
    p.v.stamina = 0; p.v.sinceSpend = 0;
    ctx.input.press('roll', 30); step(3);
    expect(notes).toHaveLength(0); step(12);
    expect(notes).toHaveLength(1); expect(notes[0]).toMatchObject({ action: 'roll', reason: 'stamina' });
    expect(p.state).not.toBe('roll'); step(60); expect(notes).toHaveLength(1);
  });
  it('does not display a blocked-roll warning when the queued roll actually starts', () => {
    const { ctx, p, step } = make(), notes = [];
    ctx.bus.on('inputBlocked', e => notes.push(e));
    p.state = 'flinch'; p.stateT = .25;
    ctx.input.press('roll', 30); step(10);
    expect(p.state).toBe('roll'); expect(notes).toHaveLength(0);
  });
});

describe('Glitchgrat frost footing', () => {
  function traverse(ground, roll = false) {
    const result = make();
    result.ctx.world.groundType = () => ground;
    result.ctx.input.setStick(0, 0.8, 'test');
    if (roll) result.ctx.input.press('roll', 30);
    result.step(roll ? 34 : 120);
    return result.p;
  }

  it('runs 6% faster on frost, with the same movement controls', () => {
    const rock = traverse('rock'), frost = traverse('frost');
    expect(frost.speed / rock.speed).toBeCloseTo(1.06, 3);
    expect(frost.sprinting).toBe(rock.sprinting);
  });

  it('rolls 8% farther without extending the roll or changing stamina cost', () => {
    const rock = traverse('rock', true), frost = traverse('frost', true);
    expect(frost.pos.z / rock.pos.z).toBeCloseTo(1.08, 3);
    expect(frost.state).toBe(rock.state);
    expect(frost.rollT).toBe(rock.rollT);
    expect(frost.stamina).toBeCloseTo(rock.stamina, 5);
  });

  it('keeps the perfect-dodge and vulnerable recovery timing on frost', () => {
    const { ctx, p, step } = make();
    ctx.world.groundType = () => 'frost';
    ctx.input.press('roll', 30);
    step(1);
    p.rollT = 0.1;
    expect(p.takeHit({ dmg: 10, key: 'frost-perfect' })).toBe('perfect');
    p.rollT = 0.31;
    expect(p.takeHit({ dmg: 10, key: 'frost-recovery' })).toBe('hit');
  });
});

describe('player: roll, stamina, perfect dodge', () => {
  it('roll costs 22 Puste and starts the roll state', () => {
    const { ctx, p, step } = make();
    ctx.input.press('roll', 50);
    step(2);
    expect(p.state).toBe('roll');
    expect(p.stamina).toBeCloseTo(100 - VIT.rollCost, 0);
  });
  it('vulnerable during startup (< 60 ms), i-frames afterwards', () => {
    const { ctx, p, step } = make();
    ctx.input.press('roll', 50);
    step(1);
    expect(p.state).toBe('roll');
    expect(p.takeHit({ dmg: 10, key: 'a' })).toBe('hit'); // startup
    const hp = p.hp;
    p.state = 'roll'; // (the startup hit interrupted the roll)
    p.rollT = 0.2; // safe phase
    expect(p.takeHit({ dmg: 10, key: 'b' })).toBe('iframe');
    expect(p.hp).toBe(hp);
    p.rollT = 0.31; // recovery, vulnerable again
    expect(p.takeHit({ dmg: 10, key: 'c' })).toBe('hit');
  });
  it('hit inside the first 100 ms of i-frames = perfect dodge -> Glitch-Konter', () => {
    const { ctx, p } = make();
    p.state = 'roll'; p.rollT = 0.1;
    expect(p.takeHit({ dmg: 20, key: 'bite' })).toBe('perfect');
    expect(p.hp).toBe(100);
    expect(p.glitchT).toBeGreaterThan(1.4);
    expect(time._slow).toBeCloseTo(0.35);
    expect(ctx.calls.glitch).toBe(1);
    expect(ctx.events).toContain('glitchCounter');
    // same attack key can not trigger twice
    p.rollT = 0.12;
    expect(p.takeHit({ dmg: 20, key: 'bite' })).toBe('iframe');
  });
  it('perfect window edges: 60 ms .. 160 ms after roll start', () => {
    const r = (t) => { const { p } = make(); p.state = 'roll'; p.rollT = t; return p.takeHit({ dmg: 5, key: 'k' + t }); };
    expect(r(0.059)).toBe('hit');
    expect(r(0.061)).toBe('perfect');
    expect(r(0.159)).toBe('perfect');
    expect(r(0.17)).toBe('iframe');
    expect(r(0.30)).toBe('iframe');
    expect(r(0.31)).toBe('hit');
  });
  it('Flinkfuß extends the safe window', () => {
    const { p } = make();
    p.flinkfuss = 2;
    p.state = 'roll'; p.rollT = 0.37;
    expect(p.takeHit({ dmg: 5, key: 'a' })).toBe('iframe');
    p.rollT = 0.39;
    expect(p.takeHit({ dmg: 5, key: 'b' })).toBe('hit');
  });
  it('the roll-start position counts as "would have hit" for perfect dodges', () => {
    const { p } = make();
    p.pos.set(0, 0, 0);
    p.state = 'roll'; p.rollT = 0.1; p.rollStart = { x: 0, y: 0, z: 0 };
    p.pos.set(2, 0, 0);
    expect(p.hitCapsules().length).toBe(2);
    p.rollT = 0.4;
    expect(p.hitCapsules().length).toBe(1);
  });
  it('Glitch bonus: next attack within 1.5 s deals +50 % and gives +25 Wucht (once)', () => {
    const { ctx, p, step, secs } = make();
    p.state = 'roll'; p.rollT = 0.1;
    p.takeHit({ dmg: 20, key: 'bite' });
    p.state = 'free'; p.rollT = 0;
    ctx.input.press('attack', 40);
    secs(0.1);
    expect(p.weapon.moveId).toBe('gs_hieb');
    expect(p.weapon.flags.glitch).toBe(true);
    expect(p.glitchT).toBe(0); // consumed
    const ah = { glitch: true, sauber: false, hit: p.weapon.move.hits[0] };
    const part = { id: 'head', factor: 1, elem: {} };
    const att = { power: 80, critChance: 0, elems: {}, glitch: true };
    const normal = resolvePlayerHit({ ...att, glitch: false }, ah.hit, part, ctx.rng).dmg;
    const buffed = resolvePlayerHit(att, ah.hit, part, ctx.rng).dmg;
    expect(buffed / normal).toBeCloseTo(1.5, 1);
    p.afterHit({ hitstop: 0.07, wucht: 6 }, ah);
    expect(p.weapon.wucht).toBe(31);
    p.afterHit({ hitstop: 0.07, wucht: 6 }, ah);
    expect(p.weapon.wucht).toBe(37);
  });
  it('Glitch bonus expires after 1.5 s', () => {
    const { ctx, p, secs } = make();
    p.state = 'roll'; p.rollT = 0.1;
    p.takeHit({ dmg: 20, key: 'bite' });
    p.state = 'free';
    secs(1.6);
    ctx.input.press('attack', 40);
    secs(0.1);
    expect(p.weapon.flags.glitch).toBe(false);
  });
});

describe('player: hit reactions', () => {
  it('damage applies Prellung and defence (Lumpen 5 protect)', () => {
    const { p } = make();
    p.takeHit({ dmg: 30, key: 'a', knock: 'none' });
    expect(p.hp).toBeCloseTo(100 - 30 * (1 - 5 / 85), 3);
    expect(p.v.bruise).toBeCloseTo((100 - p.hp) / 2, 3);
  });
  it('flinch lasts 0.3 s and cancels the move; super armor ignores flinch', () => {
    const { ctx, p, step, secs } = make();
    ctx.input.press('special', 40);
    secs(0.3);
    expect(p.weapon.moveId).toBe('gs_rempler');
    p.takeHit({ dmg: 10, key: 'a', knock: 'flinch' });
    expect(p.state).toBe('free'); // Rempler: Superrüstung gegen Zucken
    p.weapon.reset();
    p.takeHit({ dmg: 10, key: 'b', knock: 'flinch' });
    expect(p.state).toBe('flinch');
    secs(HIT_REACTION.flinch + 0.05);
    expect(p.state).toBe('free');
  });
  it('knock down 1.0 s, recovery roll possible after 0.4 s, i-frames when standing up', () => {
    const { ctx, p, secs } = make();
    p.takeHit({ dmg: 22, key: 'a', knock: 'down' });
    expect(p.state).toBe('down');
    ctx.input.press('roll', 40);
    secs(0.2);
    expect(p.state).toBe('down'); // too early
    secs(0.3);
    ctx.input.press('roll', 40);
    secs(0.1);
    expect(p.state).toBe('roll');
    const q = make();
    q.p.takeHit({ dmg: 22, key: 'a', knock: 'down' });
    q.secs(1.05);
    expect(q.p.state).toBe('free');
    expect(q.p.invuln).toBeGreaterThan(0.4);
    expect(q.p.takeHit({ dmg: 22, key: 'b', knock: 'down' })).toBe('iframe');
  });
  it('Klingenblock: frontal hit does 30 % damage and costs Puste = dmg x 0.8', () => {
    const { ctx, p, secs } = make();
    p.rot = 0;
    ctx.input.press('special', 600);
    secs(0.4);
    expect(p.weapon.blocking).toBe(true);
    const res = p.takeHit({ dmg: 40, key: 'a', knock: 'down', sourcePos: { x: 0, y: 0, z: 5 } });
    expect(res).toBe('block');
    expect(p.hp).toBeCloseTo(100 - 40 * (1 - 5 / 85) * 0.3, 2);
    expect(p.stamina).toBeCloseTo(100 - 40 * (1 - 5 / 85) * 0.8, 0);
    expect(p.state).toBe('free');
    expect(p.weapon.wucht).toBe(5);
    // from behind: no block
    expect(p.takeHit({ dmg: 10, key: 'b', knock: 'none', sourcePos: { x: 0, y: 0, z: -5 } })).toBe('hit');
  });
  it('0 HP = Umgekippt, respawn at camp after 3 s, team event emitted', () => {
    const { ctx, p, secs } = make();
    p.takeHit({ dmg: 500, key: 'a' });
    expect(p.state).toBe('ko');
    expect(ctx.events).toContain('playerDown');
    expect(p.alive).toBe(false);
    secs(3.1);
    expect(p.state).toBe('free');
    expect(p.hp).toBe(100);
    expect(p.invuln).toBeGreaterThan(0);
  });
  it('god mode takes no damage', () => {
    const { p } = make();
    p.god = true;
    p.takeHit({ dmg: 500, key: 'a' });
    expect(p.hp).toBe(100);
  });
});

describe('player: movement & Puste', () => {
  it('sprint (Shift) drains 15 Puste/s and reaches 8.5 m/s; walk 4, run 6', () => {
    const { ctx, p, secs } = make();
    ctx.input.setStick(0, 0.5, 't');
    secs(0.6);
    expect(p.speed).toBeCloseTo(4 * (0.5 / 0.7), 0);
    ctx.input.setStick(0, 0.85, 't');
    secs(0.6);
    expect(p.speed).toBeCloseTo(6, 0);
    ctx.input.setSprint(true, 'kbd');
    ctx.input.setStick(0, 1, 't');
    secs(1.0);
    expect(p.speed).toBeCloseTo(8.5, 0);
    expect(p.stamina).toBeLessThan(88);
    expect(p.stamina).toBeGreaterThan(80);
  });
  it('full stick push for 0.4 s sprints', () => {
    const { ctx, p, secs } = make();
    ctx.input.setStick(0, 1, 't');
    secs(0.3);
    expect(p.sprinting).toBe(false);
    secs(0.3);
    expect(p.sprinting).toBe(true);
  });
  it('running dry gives 1.2 s Außer Puste: walk only, no roll', () => {
    const { ctx, p, secs } = make();
    ctx.input.setSprint(true, 'kbd');
    ctx.input.setStick(0, 1, 't');
    secs(8);
    expect(p.v.exhaust).toBeGreaterThan(0);
    expect(p.speed).toBeLessThanOrEqual(4.2);
    ctx.input.press('roll', 40);
    secs(0.1);
    expect(p.state).toBe('free');
  });
  it('moves camera-relative: stick up = forward along camera yaw', () => {
    const { ctx, p, secs } = make();
    ctx.cameraYaw = Math.PI / 2; // looking +x
    ctx.input.setStick(0, 0.9, 't');
    secs(0.5);
    expect(p.pos.x).toBeGreaterThan(1);
    expect(Math.abs(p.pos.z)).toBeLessThan(0.1);
  });
  it('greatsword charge: cannot move while charging, can turn', () => {
    const { ctx, p, secs } = make();
    ctx.input.set('attack', true, 'k');
    secs(0.5);
    expect(p.weapon.charging).toBe(true);
    ctx.input.setStick(0, 0.9, 't');
    secs(0.5);
    expect(p.speed).toBeLessThan(0.3);
  });
});
