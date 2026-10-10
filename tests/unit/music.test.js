import { describe, it, expect } from 'vitest';
import { computeIntensity, IntensityTracker, genBar, sectionOf } from '../../src/audio/music.js';
import { settings } from '../../src/core/settings.js';

const m = (o = {}) => ({ state: 'combat', hp: 100, maxHp: 100, rage: false, phase: 0, ...o });
const p = (hp = 100) => ({ hp, maxHp: 100 });

describe('music', () => {
  it('Intensität aus Zuständen', () => {
    expect(computeIntensity({ monster: m({ state: 'wander' }), player: p() })).toBe(0);
    expect(computeIntensity({ monster: null })).toBe(0);
    expect(computeIntensity({ monster: m(), player: p() })).toBe(1);
    expect(computeIntensity({ monster: m({ rage: true }), player: p() })).toBe(2);
    expect(computeIntensity({ monster: m({ phase: 1 }), player: p() })).toBe(2);
    expect(computeIntensity({ monster: m(), player: p(30) })).toBe(2);
    expect(computeIntensity({ monster: m(), player: p(), chain: true })).toBe(2);
    expect(computeIntensity({ monster: m(), player: p(), glitching: true })).toBe(3);
    expect(computeIntensity({ monster: m({ hp: 15 }), player: p() })).toBe(3);
    expect(computeIntensity({ monster: m({ state: 'dead', hp: 0 }), player: p() })).toBe(0);
  });
  it('Hysterese 4 s', () => {
    const t = new IntensityTracker(4);
    expect(t.update(1, 0.1)).toBe(1);
    expect(t.update(3, 1)).toBe(1);
    expect(t.update(3, 2)).toBe(1);
    expect(t.update(3, 1.5)).toBe(3);
    expect(t.update(0, 1)).toBe(3);
  });
  it('Pattern deterministisch', () => {
    for (const k of ['hub', 'hunt']) for (let b = 0; b < 40; b++) expect(genBar(k, b)).toEqual(genBar(k, b));
    expect(sectionOf(0)).toBe('A'); expect(sectionOf(24)).toBe('BREAK'); expect(sectionOf(32)).toBe('A');
    expect(genBar('hub', 3).chord).not.toEqual(genBar('hub', 0).chord);
  });
  it('Settings-Default', () => {
    expect(settings.musicOn).toBe(true);
    expect(settings.musicVolume).toBe(0.5);
  });

  it('Rostwerke-Stil: deterministisch, Amboss + Dampf, phrygische Akkorde', async () => {
    const { genBar } = await import('../../src/audio/music.js');
    const a = genBar('rost', 3), b = genBar('rost', 3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.anvil.length).toBeGreaterThan(0);
    expect(a.steam).toEqual([8]); // Takt 3 von 4: Dampfventil
    expect(genBar('rost', 0).chord.r).toBe(40); // Em
    expect(genBar('rost', 2).chord.r).toBe(41); // F (bII)
  });
});

