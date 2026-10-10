import { describe, it, expect } from 'vitest';
import { createWindSchedule, windPush, WIND_WARN, WIND_SPEED } from '../../src/game/world/turbinenWind.js';
import { createWorld } from '../../src/game/world/index.js';
import { encodeGear, decodeGear } from '../../src/data/gearlook.js';
import { buildKatanaMesh } from '../../src/game/weapons/katana.js';
import { minimapIcon } from '../../src/ui/hud.js';

const w = createWorld('rostwerke', { seed: 7 });
const sample = (s, T = 200) => { const a = []; for (let t = 0; t < T; t += 0.05) { const x = s.at(t); a.push([t, x.gust, x.warn, x.dx, x.dz]); } return a; };

describe('Turbinen-Wind', () => {
  it('ist deterministisch aus dem Seed (und verschieden je Seed)', () => {
    expect(sample(createWindSchedule(5))).toEqual(sample(createWindSchedule(5)));
    expect(sample(createWindSchedule(5))).not.toEqual(sample(createWindSchedule(6)));
    const s = createWindSchedule(5); s.at(150);
    expect(s.at(30)).toEqual(createWindSchedule(5).at(30));
  });
  it('Boeen alle 8-14 s, 2-3 s lang, Ankuendigung >= 0,8 s vor Boee', () => {
    const s = createWindSchedule(3), starts = [];
    let prev = 0, warnFrom = null;
    for (let t = 0; t < 300; t += 0.02) {
      const x = s.at(t);
      if (x.warn > 0 && warnFrom === null) warnFrom = t;
      if (x.gust > 0 && prev === 0) { starts.push(t); expect(warnFrom).not.toBeNull(); expect(t - warnFrom).toBeGreaterThanOrEqual(0.8); warnFrom = null; }
      if (x.gust === 0 && x.warn === 0) warnFrom = null;
      prev = x.gust;
    }
    expect(WIND_WARN).toBeGreaterThanOrEqual(0.8);
    expect(starts.length).toBeGreaterThan(15);
    for (let i = 1; i < starts.length; i++) { const d = starts[i] - starts[i - 1]; expect(d).toBeGreaterThan(5); expect(d).toBeLessThan(15); }
    const c = s.cycle(2); expect(c.dur).toBeGreaterThanOrEqual(2); expect(c.dur).toBeLessThanOrEqual(3);
  });
  it('schiebt nur in Zone 4, nicht windImmune, ~2,5 m/s', () => {
    const s = createWindSchedule(3), c = s.cycle(1), st = s.at(c.gustStart + 1);
    expect(st.gust).toBe(1);
    const mk = (x, z, o = {}) => ({ pos: { x, z }, alive: true, ...o });
    const p4 = windPush(st, mk(60, -60), w.zoneAt);
    expect(Math.hypot(p4.x, p4.z)).toBeCloseTo(WIND_SPEED, 5);
    expect(windPush(st, mk(-60, -60), w.zoneAt)).toBeNull();
    expect(windPush(st, mk(60, 60), w.zoneAt)).toBeNull();
    expect(windPush(st, mk(60, -60, { windImmune: true }), w.zoneAt)).toBeNull();
    expect(windPush(s.at(c.start + 0.1), mk(60, -60), w.zoneAt)).toBeNull();
  });
  it('Welt liefert windAt', () => { expect(w.windAt(10)).toEqual(createWorld('rostwerke', { seed: 7 }).windAt(10)); });
});

describe('Katana Stufe 5/6', () => {
  it('Gear-Code roundtrip je Ast', () => {
    for (const [tier, br] of [[5, 'k'], [5, 'g'], [5, 'v'], [6, 'v']]) {
      const d = decodeGear(encodeGear({ weapon: { type: 'kt', tier, branch: br } }, 2));
      expect(d.weapon).toEqual({ type: 'kt', tier, branch: br });
    }
  });
  it('Look baut ohne Fehler und unterscheidet sich', () => {
    const sig = [];
    for (const [tier, br] of [[4, null], [5, 'k'], [5, 'g'], [5, 'v'], [6, 'v']]) {
      const m = buildKatanaMesh({ tier, branch: br });
      let n = 0; m.traverse(() => n++);
      sig.push(`${n}|${m.userData.kt.look.tex}|${m.userData.kt.look.cord}`);
      expect(m.userData.kt.tier).toBe(tier);
    }
    expect(new Set(sig).size).toBe(5);
  });
});

describe('Minimap', () => {
  it('eingegrabener Gorgo -> Wellen-Symbol', () => {
    expect(minimapIcon({ burrowed: true })).toBe('burrow');
    expect(minimapIcon({ burrowed: false })).toBe('dot');
    expect(minimapIcon({})).toBe('dot');
  });
});
