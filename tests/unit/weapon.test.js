import { describe, it, expect } from 'vitest';
import { WeaponState, BUFFER } from '../../src/game/weapons/weapon.js';
import { greatsword } from '../../src/game/weapons/greatsword.js';

const DT = 1 / 60;
function setup(hooks = {}) {
  const w = new WeaponState(greatsword, hooks);
  const A = { down: false, pressed: false, released: false }, B = { down: false, pressed: false, released: false };
  const inp = { A, B };
  const api = {
    w,
    step(sec = DT) {
      const n = Math.max(1, Math.round(sec / DT));
      for (let i = 0; i < n; i++) { w.update(DT, inp); A.pressed = A.released = B.pressed = B.released = false; }
    },
    press(b = 'A') { inp[b].down = true; inp[b].pressed = true; },
    release(b = 'A') { inp[b].down = false; inp[b].released = true; },
    tap(b = 'A', hold = 0.05) { api.press(b); api.step(hold); api.release(b); api.step(); },
    until(pred, max = 5) { for (let t = 0; t < max && !pred(); t += DT) api.step(); },
  };
  return api;
}

describe('greatsword combo chain', () => {
  it('A tap starts Hieb', () => {
    const s = setup();
    s.tap('A');
    expect(s.w.moveId).toBe('gs_hieb');
  });
  it('Hieb -> Querschlag -> Aufwärtshaken inside combo windows', () => {
    const s = setup();
    s.tap('A');
    s.until(() => s.w.t >= 0.55);
    s.tap('A', 0.02);
    expect(s.w.moveId).toBe('gs_quer');
    s.until(() => s.w.t >= 0.5);
    s.tap('A', 0.02);
    expect(s.w.moveId).toBe('gs_haken');
  });
  it('input pressed up to 0.25 s before the window opens is buffered', () => {
    const s = setup();
    s.tap('A');
    s.until(() => s.w.t >= 0.32); // window opens 0.5 -> press at ~0.34, 0.16 s early
    s.tap('A', 0.02);
    expect(s.w.moveId).toBe('gs_hieb');
    s.until(() => s.w.moveId !== 'gs_hieb', 1);
    expect(s.w.moveId).toBe('gs_quer');
  });
  it('input pressed earlier than the buffer is dropped', () => {
    const s = setup();
    s.tap('A');
    s.until(() => s.w.t >= 0.12);
    s.tap('A', 0.02); // 0.38 s before the window
    s.until(() => s.w.t >= 0.6);
    expect(s.w.moveId).toBe('gs_hieb');
    expect(BUFFER).toBe(0.25);
  });
  it('without input the move ends and weapon is idle', () => {
    const s = setup();
    s.tap('A');
    s.step(1.0);
    expect(s.w.moveId).toBe(null);
  });
  it('hits are only active in their window and only once per target', () => {
    const s = setup();
    s.tap('A');
    s.until(() => s.w.t >= 0.2);
    expect(s.w.activeHits().length).toBe(0);
    s.until(() => s.w.activeHits().length > 0);
    expect(s.w.t).toBeGreaterThanOrEqual(0.4 - 1e-6);
    const first = s.w.activeHits()[0];
    expect(s.w.canHit(first.group, 'm1', first.hit)).toBe(true);
    s.w.markHit(first.group, 'm1');
    s.step(0.02);
    for (const ah of s.w.activeHits()) expect(s.w.canHit(ah.group, 'm1', ah.hit)).toBe(false);
    expect(s.w.canHit(first.group, 'm2', first.hit)).toBe(true);
  });
  it('roll-cancel only from the cancel window; never while charging', () => {
    const s = setup();
    s.tap('A');
    expect(s.w.canRollCancel()).toBe(false);
    s.until(() => s.w.t >= 0.63);
    expect(s.w.canRollCancel()).toBe(true);
    const c = setup();
    c.press('A');
    c.step(0.6);
    expect(c.w.charging).toBe(true);
    expect(c.w.canRollCancel()).toBe(false);
  });
});

describe('greatsword charge levels (GDD 4.1)', () => {
  const holdAndRelease = (sec) => {
    const s = setup();
    s.press('A');
    s.step(sec);
    const level = s.w.chargeLevel, sauber = s.w.sauberOpen;
    s.release('A');
    s.step();
    return { s, level, sauber, id: s.w.moveId };
  };
  it('hold > 0.2 s starts charging (movement locked)', () => {
    const s = setup();
    s.press('A');
    s.step(0.3);
    expect(s.w.moveId).toBe('gs_charge');
    expect(s.w.moveSpeedMul()).toBe(0);
  });
  it('levels at 0.5 / 1.0 / 1.5 s measured from press', () => {
    expect(holdAndRelease(0.4).level).toBe(0);
    expect(holdAndRelease(0.55).level).toBe(1);
    expect(holdAndRelease(1.05).level).toBe(2);
    expect(holdAndRelease(1.55).level).toBe(3);
  });
  it('release picks the swing for the level (BW 65 / 90 / 120)', () => {
    expect(holdAndRelease(0.3).id).toBe('gs_hieb');
    expect(holdAndRelease(0.6).id).toBe('gs_c1');
    expect(holdAndRelease(1.1).id).toBe('gs_c2');
    expect(holdAndRelease(1.6).id).toBe('gs_c3');
    const r = holdAndRelease(1.6);
    expect(r.s.w.move.hits[0].mv).toBe(120);
    expect(holdAndRelease(0.6).s.w.move.hits[0].mv).toBe(65);
  });
  it('"Sauber!" window is 1.5 - 1.8 s', () => {
    expect(holdAndRelease(1.45).sauber).toBe(false);
    const ok = holdAndRelease(1.65);
    expect(ok.sauber).toBe(true);
    expect(ok.s.w.flags.sauber).toBe(true);
    const late = holdAndRelease(1.9);
    expect(late.s.w.flags.sauber).toBe(false);
    expect(late.id).toBe('gs_c3');
  });
  it('held too long (> 2.1 s) falls back to level 2', () => {
    const r = holdAndRelease(2.3);
    expect(r.id).toBe('gs_c2');
    expect(r.s.w.flags.sauber).toBe(false);
  });
  it('after a charged swing, holding A again = Wuchtladung (faster, +20 BW)', () => {
    const s = setup();
    s.press('A');
    s.step(0.6);
    s.release('A');
    s.step();
    expect(s.w.moveId).toBe('gs_c1');
    s.step(0.3);
    s.press('A');
    s.until(() => s.w.moveId === 'gs_wcharge', 1.5);
    expect(s.w.moveId).toBe('gs_wcharge');
    s.step(0.75);
    expect(s.w.chargeLevel).toBe(2);
    s.release('A');
    s.step();
    expect(s.w.moveId).toBe('gs_w2');
    expect(s.w.move.hits[0].mv).toBe(110);
  });
  it('charge level callback fires per level', () => {
    const levels = [];
    const s = setup({ onChargeLevel: (l) => levels.push(l) });
    s.press('A');
    s.step(1.6);
    expect(levels).toEqual([1, 2, 3]);
  });
});

describe('greatsword B moves', () => {
  it('B tap = Rempler with flinch super armor', () => {
    const s = setup();
    s.tap('B');
    expect(s.w.moveId).toBe('gs_rempler');
    s.until(() => s.w.t >= 0.2);
    expect(s.w.superArmor()).toBe('flinch');
    expect(s.w.lungeSpeed()).toBeGreaterThan(0);
  });
  it('A hold out of Rempler starts charge at level 1', () => {
    const s = setup();
    s.tap('B');
    s.until(() => s.w.t >= 0.2);
    s.press('A');
    s.until(() => s.w.moveId === 'gs_charge_r', 1);
    expect(s.w.moveId).toBe('gs_charge_r');
    expect(s.w.chargeLevel).toBe(1);
  });
  it('B hold = Klingenblock while held', () => {
    const s = setup();
    s.press('B');
    s.step(0.35);
    expect(s.w.blocking).toBe(true);
    expect(s.w.blockDef().pass).toBe(0.3);
    s.release('B');
    s.step(0.1);
    expect(s.w.moveId).toBe(null);
  });
  it('Wucht 100: B = Schrottbrecher, consumes Wucht, super armor', () => {
    const s = setup();
    s.w.addWucht(100);
    s.tap('B');
    expect(s.w.moveId).toBe('gs_finisher');
    expect(s.w.wucht).toBe(0);
    expect(s.w.superArmor()).toBe('all');
    s.until(() => s.w.activeHits().length > 0, 2);
    expect(s.w.activeHits()[0].hit.mv).toBe(220);
    expect(s.w.activeHits()[0].hit.blunt).toBe(80);
  });
  it('Wucht 99 is not enough', () => {
    const s = setup();
    s.w.addWucht(99);
    s.tap('B');
    expect(s.w.moveId).toBe('gs_rempler');
  });
  it('Wucht decays 5/s after 4 s without a hit', () => {
    const s = setup();
    s.w.addWucht(50);
    s.step(3.9);
    expect(s.w.wucht).toBe(50);
    s.step(2);
    expect(s.w.wucht).toBeLessThan(45);
    expect(s.w.wucht).toBeGreaterThan(38);
  });
});

describe('move data sanity', () => {
  it('all referenced moves exist and hits fit inside the move duration', () => {
    for (const m of Object.values(greatsword.moves)) {
      for (const tbl of [m.combo?.next, m.next]) for (const id of Object.values(tbl ?? {})) expect(greatsword.moves[id], `${m.id} -> ${id}`).toBeTruthy();
      for (const id of m.releases ?? []) expect(greatsword.moves[id]).toBeTruthy();
      for (const h of m.hits ?? []) expect(h.t1).toBeLessThanOrEqual(m.duration + 0.05);
    }
  });
});
