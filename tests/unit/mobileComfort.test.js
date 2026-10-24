import { describe, it, expect } from 'vitest';
import { solveLayout, checkLayout } from '../../src/input/touchLayout.js';
import { customLayout, cleanTouchOffsets } from '../../src/input/customLayout.js';
import { rollBlockReason, specialHint } from '../../src/game/inputFeedback.js';
import { createVitals } from '../../src/game/vitals.js';
import { showNumber, numberSlot } from '../../src/render/readability.js';

describe('Safe touch customization', () => {
  it('accepts a safe move, mirrors it, and rejects overlaps or unsafe edges', () => {
    for (const mirror of [false, true]) {
      const L = solveLayout(844, 390, { mirror });
      const safe = customLayout(L, 844, 390, {}, { glitch: { x: -.03, y: -.01 } });
      expect(safe.valid).toBe(true); expect(checkLayout(safe.layout, 844, 390)).toEqual([]);
      const b = L.buttons, overlap = { attack: { x: (b.roll.cx - b.attack.cx) / 844 * (mirror ? -1 : 1), y: (b.roll.cy - b.attack.cy) / 390 } };
      expect(customLayout(L, 844, 390, {}, overlap).valid).toBe(false);
      expect(customLayout(L, 844, 390, {}, { attack: { x: .5, y: .5 } }).layout).toBe(L);
    }
  });
  it('rejects saved garbage and never moves the Pause button', () => {
    expect(cleanTouchOffsets({ menu: { x: 1, y: 1 }, attack: { x: NaN, y: 2 } })).toEqual({});
    for (const [w, h] of [[568, 320], [844, 390], [932, 430], [1180, 820]]) for (const size of ['S', 'M', 'L']) {
      const L = solveLayout(w, h, { size });
      expect(customLayout(L, w, h, {}, {}).layout.buttons.menu).toEqual(L.buttons.menu);
    }
  });
});
describe('Action feedback preserves the combat rules', () => {
  it('distinguishes exhaustion, committed moves, items and control loss', () => {
    const p = { state: 'free', v: createVitals(), weapon: { canRollCancel: () => true } };
    p.v.stamina = 0; expect(rollBlockReason(p)).toBe('stamina'); p.v.stamina = 100;
    p.itemUse = {}; expect(rollBlockReason(p)).toBe('item'); p.itemUse = null;
    p.weapon.canRollCancel = () => false; expect(rollBlockReason(p)).toBe('recovery');
    p.state = 'pinned'; expect(rollBlockReason(p)).toBe('pinned');
  });
  it('shows the actual tap or hold input for each ready finisher', () => {
    for (const weaponId of ['gs', 'bow', 'db', 'kt', 'kk', 'ga', 'lb']) {
      expect(specialHint({ weaponId, weapon: { wucht: 99 } })).toBe('');
      expect(specialHint({ weaponId, weapon: { wucht: 100 } })).toContain(['gs', 'bow'].includes(weaponId) ? 'Tipp' : 'halten');
    }
  });
});
describe('Combat readability', () => {
  it('protects your feedback from a full pool of teammate numbers', () => {
    expect(numberSlot([{ age: .1, remote: true }, { age: .8, remote: false }], false, true)).toBe(0);
    expect(numberSlot([{ age: .1, remote: false }], true, true)).toBe(-1);
    expect(numberSlot([{ age: .1, remote: false }], true, false)).toBe(0);
  });
  it('keeps warning text and state feedback even when damage numbers are disabled', () => {
    expect(showNumber('Glitch bereit!', false, 'off')).toBe(true);
    expect(showNumber(30, true, 'own')).toBe(false);
    expect(showNumber(30, false, 'own')).toBe(true);
  });
});
