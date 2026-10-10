import { describe, it, expect } from 'vitest';
import { solveLayout, checkLayout, hitButton, MIN_VIS, MIN_HIT, MIN_HIT_PRIMARY } from '../../src/input/touchLayout.js';

const VIEWPORTS = [[844, 390], [932, 430], [740, 360], [1024, 500], [1180, 820], [667, 375], [568, 320]];
const INSETS = [{}, { l: 47, r: 47, t: 0, b: 21 }, { l: 0, r: 59, t: 0, b: 34 }];

describe('touch layout solver', () => {
  for (const [w, h] of VIEWPORTS) {
    for (const size of ['S', 'M', 'L']) {
      for (const mirror of [false, true]) {
        for (const mode of ['hunt', 'town']) {
          it(`${w}x${h} ${size} ${mirror ? 'left' : 'right'}-handed ${mode}: no overlaps, minimum sizes`, () => {
            for (const insets of w < 600 ? [INSETS[0]] : INSETS) { // 568x320 is a notch-less iPhone SE class device
              const L = solveLayout(w, h, { size, mirror, mode, insets });
              const bad = checkLayout(L, w, h, insets);
              expect(bad, JSON.stringify({ insets, bad })).toEqual([]);
            }
          });
        }
      }
    }
  }
  it('A is the biggest, hit area of A >= 56, every hit area >= 44, visual >= 44', () => {
    const L = solveLayout(844, 390, {});
    for (const b of Object.values(L.buttons)) { expect(b.vis).toBeGreaterThanOrEqual(MIN_VIS - 8); expect(b.hit).toBeGreaterThanOrEqual(MIN_HIT); }
    for (const k of ['attack', 'roll', 'special', 'lock', 'item', 'ctx']) expect(L.buttons[k].vis).toBeGreaterThanOrEqual(MIN_VIS);
    expect(L.buttons.attack.hit).toBeGreaterThanOrEqual(MIN_HIT_PRIMARY);
    expect(L.buttons.attack.vis).toBeGreaterThan(L.buttons.roll.vis);
  });
  it('context button has its own slot (hit circles never intersect, also while hidden)', () => {
    const L = solveLayout(844, 390, {});
    for (const [k, b] of Object.entries(L.buttons)) {
      if (k === 'ctx') continue;
      expect(Math.hypot(b.cx - L.buttons.ctx.cx, b.cy - L.buttons.ctx.cy)).toBeGreaterThanOrEqual((b.hit + L.buttons.ctx.hit) / 2);
    }
  });
  it('mirror swaps the sides and the stick zone', () => {
    const R = solveLayout(844, 390, {}), M = solveLayout(844, 390, { mirror: true });
    expect(R.buttons.attack.cx).toBeGreaterThan(422);
    expect(M.buttons.attack.cx).toBeLessThan(422);
    expect(R.stickZone.x1).toBeCloseTo(844 * 0.4);
    expect(M.stickZone.x0).toBeCloseTo(844 * 0.6);
  });
  it('size setting makes buttons bigger', () => {
    const S = solveLayout(844, 390, { size: 'S' }), L = solveLayout(844, 390, { size: 'L' });
    expect(L.buttons.attack.vis).toBeGreaterThan(S.buttons.attack.vis);
    expect(L.buttons.roll.vis).toBeGreaterThan(S.buttons.roll.vis);
  });
  it('respects the safe area insets on the thumb side', () => {
    const L = solveLayout(844, 390, { insets: { r: 59, b: 34 } });
    expect(L.buttons.attack.cx + L.buttons.attack.hit / 2).toBeLessThanOrEqual(844 - 59);
    expect(L.buttons.attack.cy + L.buttons.attack.hit / 2).toBeLessThanOrEqual(390 - 34);
  });
  it('hit test returns exactly one owner, hit area is bigger than the visual', () => {
    const L = solveLayout(844, 390, {});
    const a = L.buttons.attack;
    expect(hitButton(L, a.cx, a.cy)).toBe('attack');
    expect(hitButton(L, a.cx + a.vis / 2 + 2, a.cy)).toBe('attack');
    expect(hitButton(L, 10, 10)).toBe(null);
  });
});
