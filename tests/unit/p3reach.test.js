import { describe, it, expect, beforeEach } from 'vitest';
import { brathalos } from '../../src/game/monsters/brathalos.js';
import { time } from '../../src/core/time.js';
import { make, DT } from './p3helpers.js';

beforeEach(() => time.reset());

// Melee reach: a Plattmacher swing reaches ~3 m up from the ground (hits up to ~4.2 m at the blade tip when overhead).
const REACH = 3.6;

describe('fix 2b: melee keeps access to Brathalos legs/tail around take-off and landing', () => {
  it('legs and tail are within melee reach for >= 4 s per flight cycle (take-off start, dive end, landing recovery)', () => {
    const { m, p } = make(brathalos, 'combat', 0, 9, 3);
    p.god = true;
    m.flyCd = 0; // fly as soon as possible
    m.recover = 0;
    let t = 0, reach = 0, started = false, cycleEnd = false;
    const trace = [];
    for (let i = 0; i < 60 * 40 && !cycleEnd; i++) {
      m.update(DT);
      t += DT;
      if (m.flying || m.attack?.id === 'brathalos_aufflug') started = true;
      const lowParts = m.hurtParts().filter((h) => (h.part.id === 'body' || h.part.id === 'tail') && h.pos.y - h.sphere.r <= REACH);
      if (started && lowParts.length) reach += DT;
      if (started && m.state === 'combat' && !m.attack && m.recover <= 0 && m.air < 0.1 && t > 8) cycleEnd = true;
      if (process.env.P3_VERBOSE && i % 30 === 0) trace.push(`${t.toFixed(1)} ${m.state} ${m.attack?.id ?? '-'} air ${m.air.toFixed(1)}`);
    }
    if (process.env.P3_VERBOSE) console.log(trace.join('\n'), '\nreach seconds', reach.toFixed(2));
    expect(reach).toBeGreaterThanOrEqual(4);
  });
});
