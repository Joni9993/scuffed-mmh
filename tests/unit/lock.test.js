import { describe, it, expect } from 'vitest';
import { stepLock } from '../../src/input/lock.js';
import { createInput } from '../../src/input/input.js';

const mk = (over = {}) => ({ alive: true, d: 10, ...over });
const ev = (target, o = {}) => ({ toggle: false, next: false, prev: false, acquire: () => target, valid: (m) => m.alive && m.d <= 70, parts: () => 3, ...o });

describe('lock toggle state machine', () => {
  it('tap when off locks the best target, tap again unlocks', () => {
    const m = mk();
    let l = stepLock(null, ev(m, { toggle: true }));
    expect(l).toEqual({ monster: m, idx: 0 });
    l = stepLock(l, ev(m));
    expect(l.monster).toBe(m); // stays on without input
    l = stepLock(l, ev(m, { toggle: true }));
    expect(l).toBe(null);
    l = stepLock(l, ev(m, { toggle: true }));
    expect(l.monster).toBe(m); // and on again
  });
  it('tap with no target in range stays off', () => {
    expect(stepLock(null, ev(null, { toggle: true }))).toBe(null);
  });
  it('part cycling: next / prev wrap around, only while locked', () => {
    const m = mk();
    expect(stepLock(null, ev(m, { next: true }))).toBe(null);
    let l = { monster: m, idx: 0 };
    l = stepLock(l, ev(m, { next: true })); expect(l.idx).toBe(1);
    l = stepLock(l, ev(m, { next: true })); l = stepLock(l, ev(m, { next: true })); expect(l.idx).toBe(0);
    l = stepLock(l, ev(m, { prev: true })); expect(l.idx).toBe(2);
    expect(stepLock(l, ev(m, { prev: true })).monster).toBe(m);
  });
  it('lock turns off by itself when the monster dies or is out of range', () => {
    const m = mk();
    const l = { monster: m, idx: 1 };
    m.alive = false;
    expect(stepLock(l, ev(m))).toBe(null);
    m.alive = true; m.d = 80;
    expect(stepLock(l, ev(m))).toBe(null);
  });
  it('a dead lock plus a tap in the same step locks the next target instead of toggling off', () => {
    const dead = mk({ alive: false }), next = mk();
    const l = stepLock({ monster: dead, idx: 0 }, ev(next, { toggle: true }));
    expect(l.monster).toBe(next);
  });
  it('input layer: lock is an edge, keyboard Q / pad RB / touch tap all produce exactly one toggle per press', () => {
    const i = createInput();
    let on = null;
    const frame = () => { i.poll(1 / 60); on = stepLock(on, ev(mk(), { toggle: i.b.lock.pressed, next: i.b.lockNext.pressed, prev: i.b.lockPrev.pressed })); };
    i.set('lock', true, 'kbd'); frame(); expect(on).not.toBe(null);
    for (let k = 0; k < 40; k++) frame(); // holding does not retrigger
    expect(on).not.toBe(null);
    i.set('lock', false, 'kbd'); frame(); expect(on).not.toBe(null);
    i.press('lock', 40); for (let k = 0; k < 6; k++) frame(); // touch tap
    expect(on).toBe(null);
    i.set('lockNext', true, 'pad'); frame(); expect(on).toBe(null); // part cycling without lock does nothing
  });
});
