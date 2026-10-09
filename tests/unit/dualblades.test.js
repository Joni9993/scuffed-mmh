import { describe, it, expect } from 'vitest';
import { WeaponState } from '../../src/game/weapons/weapon.js';
import { dualblades, RAUSCH_COST, DASH } from '../../src/game/weapons/dualblades.js';
import { createVitals, spendStamina, tickStamina, ROLL } from '../../src/game/vitals.js';

const DT = 1 / 60;
/** Harness like weapon.test.js, plus a vitals object so Rausch drain / exhaustion behave like in the Player. */
function setup({ sinceRoll = 99 } = {}) {
  const v = createVitals();
  const player = { sinceRoll };
  const hooks = { player, drain: (a) => spendStamina(v, a), exhausted: () => v.exhaust > 0 };
  const w = new WeaponState(dualblades, hooks);
  const A = { down: false, pressed: false, released: false }, B = { down: false, pressed: false, released: false };
  const inp = { A, B };
  const api = {
    w, v, player,
    step(sec = DT) {
      const n = Math.max(1, Math.round(sec / DT));
      for (let i = 0; i < n; i++) {
        w.update(DT, inp); tickStamina(v, DT); player.sinceRoll += DT;
        A.pressed = A.released = B.pressed = B.released = false;
      }
    },
    press(b = 'A') { inp[b].down = true; inp[b].pressed = true; },
    release(b = 'A') { inp[b].down = false; inp[b].released = true; },
    tap(b = 'A', hold = 0.05) { api.press(b); api.step(hold); api.release(b); api.step(); },
    until(pred, max = 5) { for (let t = 0; t < max && !pred(); t += DT) api.step(); },
    hits() { return w.move?.hits?.length ?? 0; },
  };
  return api;
}
const hitCount = (id) => dualblades.moves[id].hits.reduce((s, h) => s.add(h.group), new Set()).size;

describe('Zwillingsklingen A-Kette (GDD 4.2)', () => {
  it('Doppelschnitt (2 x BW 12) -> Kreuzschnitt (2 x BW 14) -> Drehschnitt (3 x BW 10) -> Doppelschnitt (loop)', () => {
    const s = setup();
    s.tap('A');
    expect(s.w.moveId).toBe('db_a1');
    expect(hitCount('db_a1')).toBe(2);
    expect(new Set(dualblades.moves.db_a1.hits.map((h) => h.mv))).toEqual(new Set([12]));
    s.until(() => s.w.t >= 0.3);
    s.tap('A', 0.02);
    s.until(() => s.w.moveId !== 'db_a1', 1);
    expect(s.w.moveId).toBe('db_a2');
    expect(hitCount('db_a2')).toBe(2);
    expect(dualblades.moves.db_a2.hits[0].mv).toBe(14);
    s.until(() => s.w.t >= 0.5);
    s.tap('A', 0.02);
    s.until(() => s.w.moveId !== 'db_a2', 1);
    expect(s.w.moveId).toBe('db_a3');
    expect(hitCount('db_a3')).toBe(3);
    expect(dualblades.moves.db_a3.hits[0].mv).toBe(10);
    s.until(() => s.w.t >= 0.62);
    s.tap('A', 0.02);
    s.until(() => s.w.moveId !== 'db_a3', 1);
    expect(s.w.moveId).toBe('db_a1');
  });
  it('the chain is loopable and can be walked through slowly, rolling out after the cancel point', () => {
    const s = setup();
    s.tap('A');
    expect(s.w.moveSpeedMul()).toBeGreaterThan(0);
    expect(s.w.moveSpeedMul()).toBeLessThan(1);
    expect(s.w.canRollCancel()).toBe(false);
    s.until(() => s.w.canRollCancel(), 1);
    expect(s.w.t).toBeGreaterThanOrEqual(0.3);
  });
  it('every hit gives +2 Wucht', () => {
    for (const id of ['db_a1', 'db_a2', 'db_a3', 'db_jump', 'db_a1r']) for (const h of dualblades.moves[id].hits) expect(h.wucht).toBe(2);
  });
  it('without input the chain ends', () => {
    const s = setup();
    s.tap('A');
    s.step(1.2);
    expect(s.w.moveId).toBe(null);
  });
});

describe('Sprungschnitt', () => {
  it('A right after a roll = Sprungschnitt (2 x BW 18, 3 m forward)', () => {
    const s = setup({ sinceRoll: 0.1 });
    s.tap('A');
    expect(s.w.moveId).toBe('db_jump');
    const m = s.w.move;
    expect(new Set(m.hits.map((h) => h.mv))).toEqual(new Set([18]));
    expect(new Set(m.hits.map((h) => h.group)).size).toBe(2);
    expect(m.lunge.dist).toBe(3);
  });
  it('A long after the roll starts the normal chain', () => {
    const s = setup({ sinceRoll: 2 });
    s.tap('A');
    expect(s.w.moveId).toBe('db_a1');
  });
  it('A buffered during the roll fires as Sprungschnitt when the roll ends', () => {
    const s = setup({ sinceRoll: 99 });
    s.w.feed(DT, { A: { down: false, pressed: true, released: false }, B: {} }); // pressed while rolling
    s.player.sinceRoll = 0; // roll ended
    s.step();
    expect(s.w.moveId).toBe('db_jump');
  });
});

describe('Rausch', () => {
  it('B tap toggles Rausch on and off', () => {
    const s = setup();
    expect(s.w.data.rausch).toBeFalsy();
    s.tap('B');
    s.step(0.3);
    expect(s.w.data.rausch).toBe(true);
    s.tap('B');
    s.step(0.3);
    expect(s.w.data.rausch).toBe(false);
  });
  it('+1 hit per move in Rausch, +15 % Tempo, Rolle wird Dash mit gleichen i-Frames', () => {
    for (const k of ['a1', 'a2', 'a3', 'jump']) expect(hitCount(`db_${k}r`)).toBe(hitCount(`db_${k}`) + 1);
    const s = setup();
    expect(dualblades.speedMul(s.w)).toBe(1);
    expect(dualblades.rollOverride(s.w)).toBe(null);
    s.tap('B'); s.step(0.3);
    expect(dualblades.speedMul(s.w)).toBeCloseTo(1.15);
    expect(dualblades.rollOverride(s.w)).toEqual(DASH);
    expect(DASH.duration).toBe(0.3);
    expect(DASH.duration).toBeLessThan(ROLL.duration);
    expect(DASH.duration).toBeGreaterThanOrEqual(ROLL.iEnd); // i-frame window (0.06 - 0.30) still fits
    s.tap('A');
    expect(s.w.moveId).toBe('db_a1r');
    expect(s.hits()).toBe(dualblades.moves.db_a1.hits.length + dualblades.moves.db_a1r.hits.length - dualblades.moves.db_a1.hits.length);
  });
  it('the chain stays in Rausch variants', () => {
    const s = setup();
    s.tap('B'); s.step(0.3);
    s.tap('A');
    s.until(() => s.w.t >= 0.3);
    s.tap('A', 0.02);
    s.until(() => s.w.moveId !== 'db_a1r', 1);
    expect(s.w.moveId).toBe('db_a2r');
  });
  it('drains 10 Puste per second', () => {
    expect(RAUSCH_COST).toBe(10);
    const s = setup();
    s.tap('B'); s.step(0.3);
    const before = s.v.stamina;
    s.step(2);
    expect(before - s.v.stamina).toBeCloseTo(20, 0);
    expect(s.w.data.rausch).toBe(true);
  });
  it('ends at 0 Puste', () => {
    const s = setup();
    s.v.stamina = 5;
    s.tap('B'); s.step(0.3);
    expect(s.w.data.rausch).toBe(true);
    s.step(0.8);
    expect(s.v.stamina).toBe(0);
    expect(s.w.data.rausch).toBe(false);
  });
  it('cannot be switched on while exhausted', () => {
    const s = setup();
    spendStamina(s.v, 500);
    expect(s.v.exhaust).toBeGreaterThan(0);
    s.tap('B'); s.step(0.3);
    expect(s.w.data.rausch).toBeFalsy();
  });
});

describe('Schrottwirbel (Finisher)', () => {
  it('is only available at Wucht 100 and needs B held 0.3 s', () => {
    const s = setup();
    s.w.wucht = 99; s.w.sinceWuchtHit = 0;
    s.press('B'); s.step(0.5); s.release('B'); s.step();
    expect(s.w.moveId).not.toBe('db_finisher');
    const f = setup();
    f.w.wucht = 100; f.w.sinceWuchtHit = 0;
    f.press('B');
    f.step(0.25);
    expect(f.w.moveId).not.toBe('db_finisher');
    f.step(0.15);
    expect(f.w.moveId).toBe('db_finisher');
  });
  it('B tap at Wucht 100 still toggles Rausch (finisher only on hold)', () => {
    const s = setup();
    s.w.wucht = 100; s.w.sinceWuchtHit = 0;
    s.tap('B'); s.step(0.3);
    expect(s.w.moveId).not.toBe('db_finisher');
    expect(s.w.data.rausch).toBe(true);
  });
  it('lasts 1.8 s of hits, 12 x BW 14, steerable, consumes Wucht', () => {
    const s = setup();
    s.w.wucht = 100; s.w.sinceWuchtHit = 0;
    s.press('B'); s.step(0.4);
    const m = s.w.move;
    expect(m.id).toBe('db_finisher');
    expect(s.w.wucht).toBe(0);
    expect(m.hits[0].mv).toBe(14);
    const span = m.hits[0].t1 - m.hits[0].t0, n = Math.floor(span / m.hits[0].interval) + 1;
    expect(n).toBeGreaterThanOrEqual(12);
    expect(m.hits[0].t1).toBeCloseTo(1.8);
    expect(s.w.moveSpeedMul()).toBeGreaterThan(0.9);
    expect(s.w.superArmor()).toBe('all');
  });
  it('can be used from inside a chain (combo window)', () => {
    const s = setup();
    s.tap('A');
    s.w.wucht = 100; s.w.sinceWuchtHit = 0;
    s.press('B');
    s.step(0.7);
    s.until(() => s.w.moveId === 'db_finisher', 1);
    expect(s.w.moveId).toBe('db_finisher');
  });
});

describe('HUD status', () => {
  it('shows Rausch and finisher readiness', () => {
    const s = setup();
    expect(dualblades.status(s.w)).toBe(null);
    s.w.wucht = 100;
    expect(dualblades.status(s.w).text).toMatch(/Wirbel/);
    s.tap('B'); s.step(0.3);
    expect(dualblades.status(s.w).text).toMatch(/Rausch/);
  });
});
