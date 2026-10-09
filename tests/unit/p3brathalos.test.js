import { describe, it, expect, beforeEach } from 'vitest';
import { brathalos } from '../../src/game/monsters/brathalos.js';
import { time } from '../../src/core/time.js';
import { make, DT } from './p3helpers.js';

beforeEach(() => time.reset());

/** Fraction of combat time spent airborne, standing hunter, monster never stunned/hurt. */
function airStats(seed, secs) {
  const { m, p } = make(brathalos, 'combat', 0, 9, seed);
  p.god = true;
  m.recover = 0;
  let air = 0, takeoffs = 0, prevFly = false, last = -1, minGap = 1e9;
  const gaps = [];
  for (let i = 0; i < secs / DT; i++) {
    m.update(DT);
    if (m.air > 0.8) air += DT;
    const fly = m.state === 'fly';
    if (fly && !prevFly) { takeoffs++; const t = i * DT; if (last >= 0) { gaps.push(t - last); minGap = Math.min(minGap, t - last); } last = t; }
    prevFly = fly;
    m.hp = m.maxHp;
  }
  return { frac: air / secs, takeoffs, gaps, minGap };
}

describe('fix 2: Brathalos does not live in the sky', () => {
  it('airborne time is ~20-25 % and take-offs are at least 30 s apart', () => {
    let tot = 0, n = 0, minGap = 1e9;
    for (let s = 1; s <= 8; s++) {
      const r = airStats(s, 600);
      tot += r.frac; n++; minGap = Math.min(minGap, r.minGap);
      if (process.env.P3_VERBOSE) console.log('seed', s, 'air %', (r.frac * 100).toFixed(1), 'takeoffs', r.takeoffs, 'gaps', r.gaps.map((g) => g.toFixed(0)).join(','));
    }
    const mean = tot / n;
    if (process.env.P3_VERBOSE) console.log('mean air %', (mean * 100).toFixed(1), 'min gap', minGap.toFixed(1));
    expect(mean).toBeGreaterThan(0.17);
    expect(mean).toBeLessThan(0.27);
    expect(minGap).toBeGreaterThanOrEqual(30);
  });
});
