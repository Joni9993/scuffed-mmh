import { describe, it, expect } from 'vitest';
import {
  createVitals, damageVitals, tickPrellung, spendStamina, tickStamina, canRoll, rollPhase, rollSpeed, ROLL, VIT,
} from '../../src/game/vitals.js';

describe('Prellung', () => {
  it('50 % of damage becomes recoverable red HP', () => {
    const v = createVitals();
    damageVitals(v, 40);
    expect(v.hp).toBe(60);
    expect(v.bruise).toBe(20);
  });
  it('does not regenerate for 3 s after a hit, then 2 HP/s', () => {
    const v = createVitals();
    damageVitals(v, 40);
    for (let i = 0; i < 60 * 2.9; i++) tickPrellung(v, 1 / 60);
    expect(v.hp).toBe(60);
    for (let i = 0; i < 60 * 3.1; i++) tickPrellung(v, 1 / 60); // 3 s of regen window = 6 HP
    expect(v.hp).toBeGreaterThan(65);
    expect(v.hp).toBeLessThan(67);
    expect(v.bruise).toBeLessThan(15);
  });
  it('a new hit resets the delay and bruise is capped by missing HP', () => {
    const v = createVitals();
    damageVitals(v, 10);
    for (let i = 0; i < 200; i++) tickPrellung(v, 1 / 60);
    const hp = v.hp;
    damageVitals(v, 10);
    tickPrellung(v, 1);
    expect(v.hp).toBe(hp - 10);
    expect(v.bruise + v.hp).toBeLessThanOrEqual(v.maxHp);
  });
  it('bruise fully heals to at most hp + bruise', () => {
    const v = createVitals();
    damageVitals(v, 60);
    for (let i = 0; i < 60 * 40; i++) tickPrellung(v, 1 / 60);
    expect(v.bruise).toBeCloseTo(0, 5);
    expect(v.hp).toBeCloseTo(70, 3);
  });
});

describe('Puste', () => {
  it('regen is 30/s after a 0.4 s pause', () => {
    const v = createVitals();
    spendStamina(v, 50);
    for (let i = 0; i < 24; i++) tickStamina(v, 1 / 60); // 0.4 s
    expect(v.stamina).toBeCloseTo(50, 3);
    for (let i = 0; i < 60; i++) tickStamina(v, 1 / 60);
    expect(v.stamina).toBeCloseTo(80, 0);
  });
  it('roll costs 22, sprint 15/s', () => {
    const v = createVitals();
    spendStamina(v, VIT.rollCost);
    expect(v.stamina).toBe(78);
    for (let i = 0; i < 60; i++) spendStamina(v, VIT.sprintCost / 60);
    expect(v.stamina).toBeCloseTo(63, 3);
  });
  it('0 Puste = 1.2 s Außer Puste: no roll, no regen', () => {
    const v = createVitals();
    expect(spendStamina(v, 100)).toBe(true);
    expect(v.exhaust).toBe(VIT.exhaustTime);
    expect(canRoll(v)).toBe(false);
    for (let i = 0; i < 60; i++) tickStamina(v, 1 / 60);
    expect(v.stamina).toBe(0);
    for (let i = 0; i < 20; i++) tickStamina(v, 1 / 60);
    expect(v.exhaust).toBe(0);
    for (let i = 0; i < 30; i++) tickStamina(v, 1 / 60);
    expect(v.stamina).toBeGreaterThan(0);
    expect(canRoll(v)).toBe(true);
  });
  it('Pustekuchen halves costs', () => {
    const v = createVitals();
    v.costMul = 0.5;
    spendStamina(v, 22);
    expect(v.stamina).toBe(89);
  });
});

describe('roll i-frames (GDD 3.3)', () => {
  it('exact phases', () => {
    expect(rollPhase(0.0).phase).toBe('startup');
    expect(rollPhase(0.059).invuln).toBe(false);
    expect(rollPhase(0.06).phase).toBe('perfect');
    expect(rollPhase(0.16).phase).toBe('perfect');
    expect(rollPhase(0.161).phase).toBe('safe');
    expect(rollPhase(0.30).invuln).toBe(true);
    expect(rollPhase(0.301).phase).toBe('recovery');
    expect(rollPhase(0.301).invuln).toBe(false);
    expect(rollPhase(0.49).phase).toBe('recovery');
    expect(rollPhase(0.5).phase).toBe('done');
  });
  it('i-frame window is 240 ms', () => {
    let n = 0;
    for (let i = 0; i < 600; i++) if (rollPhase(i / 1000).invuln) n++;
    expect(n).toBeGreaterThanOrEqual(240);
    expect(n).toBeLessThanOrEqual(242);
  });
  it('Flinkfuß extends i-frames by 40 ms per level', () => {
    expect(rollPhase(0.33, 0).invuln).toBe(false);
    expect(rollPhase(0.33, 0.04).invuln).toBe(true);
    expect(rollPhase(0.37, 0.08).invuln).toBe(true);
    expect(rollPhase(0.39, 0.08).invuln).toBe(false);
  });
  it('perfect window is the first 100 ms of i-frames', () => {
    let first = null, last = null;
    for (let i = 0; i < 600; i++) {
      if (rollPhase(i / 1000).phase === 'perfect') { first ??= i; last = i; }
    }
    expect(first).toBe(60);
    expect(last - first).toBeGreaterThanOrEqual(100);
    expect(last - first).toBeLessThanOrEqual(101);
  });
  it('roll covers 4.5 m over 0.5 s', () => {
    let d = 0;
    const dt = 1 / 600;
    for (let t = 0; t < ROLL.duration; t += dt) d += rollSpeed(t) * dt;
    expect(d).toBeCloseTo(4.5, 1);
  });
});
