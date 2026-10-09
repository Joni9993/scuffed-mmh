import { describe, it, expect } from 'vitest';
import { createInput } from '../../src/input/input.js';

describe('abstract input', () => {
  it('press/release edges last exactly one poll', () => {
    const i = createInput();
    i.set('attack', true, 'kbd');
    i.poll(1 / 60);
    expect(i.b.attack.pressed).toBe(true);
    expect(i.b.attack.down).toBe(true);
    i.poll(1 / 60);
    expect(i.b.attack.pressed).toBe(false);
    expect(i.b.attack.heldMs).toBeGreaterThan(10);
    i.set('attack', false, 'kbd');
    i.poll(1 / 60);
    expect(i.b.attack.released).toBe(true);
    expect(i.b.attack.down).toBe(false);
  });
  it('a tap between two polls is not lost', () => {
    const i = createInput();
    i.set('roll', true, 't1');
    i.set('roll', false, 't1');
    i.poll(1 / 60);
    expect(i.b.roll.pressed).toBe(true);
    expect(i.b.roll.released).toBe(true);
    expect(i.b.roll.down).toBe(false);
  });
  it('multiple sources: down while any source holds', () => {
    const i = createInput();
    i.set('attack', true, 'a');
    i.set('attack', true, 'b');
    i.set('attack', false, 'a');
    i.poll(1 / 60);
    expect(i.b.attack.down).toBe(true);
  });
  it('debug press() holds for the given simulated ms', () => {
    const i = createInput();
    i.press('special', 100);
    let down = 0;
    for (let k = 0; k < 30; k++) { i.poll(1 / 60); if (i.b.special.down) down++; }
    expect(down).toBeGreaterThanOrEqual(5);
    expect(down).toBeLessThanOrEqual(7);
  });
  it('stick: strongest source wins', () => {
    const i = createInput();
    i.setStick(0.2, 0, 'pad');
    i.setStick(0, 0.9, 'dbg');
    i.poll(1 / 60);
    expect(i.move).toEqual({ x: 0, y: 0.9 });
    i.setStick(0, 0, 'dbg');
    i.poll(1 / 60);
    expect(i.move.x).toBeCloseTo(0.2);
  });
});
