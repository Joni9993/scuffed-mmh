import { describe, it, expect } from 'vitest';
import { WeaponState } from '../../src/game/weapons/weapon.js';
import { bow, BOW, SHOTS, sweetMul, sweetCue, baseLevel, arrowHit, computeAim, solveVelocity } from '../../src/game/weapons/bow.js';
import { Projectiles } from '../../src/game/projectiles.js';
import { createVitals, spendStamina, tickStamina } from '../../src/game/vitals.js';

const DT = 1 / 60;

function fakeMonster(id, parts) {
  return {
    id, alive: true, applyCalls: [],
    hurtParts() { return parts.map((p) => ({ part: { id: p.id, factor: 1 }, sphere: { type: 'sphere', x: p.x, y: p.y, z: p.z, r: p.r }, pos: { x: p.x, y: p.y, z: p.z } })); },
    applyStatus(type, opts) { this.applyCalls.push([type, opts]); return true; },
  };
}
function fakeCtx(monsters = [], { inventory } = {}) {
  const spawned = [];
  const hits = [];
  const ctx = {
    monsters, players: [], cameraYaw: 0, rng: () => 0.5,
    world: { heightAt: () => 0, collide: (p) => p },
    bus: { emit() {} }, fx: { spark() {}, shake() {}, marker() {}, clearMarker() {} },
    inventory,
    projectiles: { spawn(o) { spawned.push(o); return o; } },
    playerHit(player, monster, hp, ah) { hits.push({ monster, part: hp.part.id, ah }); },
  };
  return { ctx, spawned, hits };
}

function setup({ sinceRoll = 99, monsters = [], ammoTip = null, inventory } = {}) {
  const v = createVitals();
  const { ctx, spawned, hits } = fakeCtx(monsters, { inventory });
  const player = { id: 'p1', sinceRoll, ctx, pos: { x: 0, y: 0, z: 0 }, rot: 0, ammoTip, lockPoint: () => null };
  let drained = 0;
  const hooks = { player, drain: (a) => { drained += a; spendStamina(v, a); }, exhausted: () => v.exhaust > 0 };
  const w = new WeaponState(bow, hooks);
  const A = { down: false, pressed: false, released: false }, B = { down: false, pressed: false, released: false };
  const inp = { A, B };
  const api = {
    w, v, player, ctx, spawned, hits, get drained() { return drained; },
    step(sec = DT) {
      const n = Math.max(1, Math.round(sec / DT));
      for (let i = 0; i < n; i++) { w.update(DT, inp); tickStamina(v, DT); player.sinceRoll += DT; A.pressed = A.released = B.pressed = B.released = false; }
    },
    press(b = 'A') { inp[b].down = true; inp[b].pressed = true; },
    release(b = 'A') { inp[b].down = false; inp[b].released = true; },
    tap(b = 'A', hold = 0.05) { api.press(b); api.step(hold); api.release(b); api.step(); },
    until(pred, max = 5) { for (let t = 0; t < max && !pred(); t += DT) api.step(); },
    shots() { return w.data.log.map((s) => s.level); },
  };
  return api;
}

describe('Spannbogen: Spannen (GDD 4.3)', () => {
  const draw = (sec, opts) => {
    const s = setup(opts);
    s.press('A');
    s.step(sec);
    const level = s.w.chargeLevel + 1;
    s.release('A');
    s.step(0.1);
    return { s, level };
  };
  it('hold A = draw; levels 1/2/3 at 0 / 0.45 / 0.9 s', () => {
    expect(BOW.levelTimes).toEqual([0.45, 0.9]);
    expect(draw(0.3).level).toBe(1);
    expect(draw(0.5).level).toBe(2);
    expect(draw(0.95).level).toBe(3);
    expect(draw(2).level).toBe(3);
  });
  it('release fires the shot of the reached level', () => {
    expect(draw(0.3).s.w.data.lastShot.type).toBe('Streuschuss');
    expect(draw(0.5).s.w.data.lastShot.type).toBe('Doppelschuss');
    expect(draw(1.0).s.w.data.lastShot.type).toBe('Durchschuss');
    expect(draw(1.0).s.w.data.lastShot.quick).toBe(false);
  });
  it('drawing moves at walking speed, costs 12 Puste/s and can be rolled out of', () => {
    const s = setup();
    s.press('A');
    s.step(1.0);
    expect(s.w.charging).toBe(true);
    expect(s.w.moveSpeedMul()).toBeGreaterThan(0.5);
    expect(s.w.moveSpeedMul()).toBeLessThanOrEqual(1);
    expect(s.drained).toBeCloseTo(12 * (1.0 - 0.15), 0); // drawing starts after the 0.15 s tap/hold threshold
    expect(s.w.canRollCancel()).toBe(true);
  });
  it('is released automatically when Puste runs out', () => {
    const s = setup();
    s.v.stamina = 3;
    s.press('A');
    s.step(1.0);
    expect(s.w.charging).toBe(false);
    expect(s.w.data.shots).toBe(1);
  });
});

describe('Spannbogen: Schnellschuss und Rhythmus', () => {
  it('tap A = quick shot at the base level; every shot raises the base level by 1 for 1 s (max 3)', () => {
    const s = setup();
    expect(baseLevel(s.w)).toBe(1);
    for (let i = 0; i < 5; i++) { s.tap('A'); s.until(() => s.w.moveId === null, 1); }
    expect(s.shots()).toEqual([1, 2, 3, 3, 3]);
    expect(s.w.data.log.every((x) => x.quick)).toBe(true);
  });
  it('the base level falls back to 1 one second after the last shot', () => {
    const s = setup();
    s.tap('A');
    s.step(0.12);
    expect(s.w.data.shots).toBe(1);
    expect(baseLevel(s.w)).toBe(2);
    s.step(0.8);
    expect(baseLevel(s.w)).toBe(2);
    s.step(0.3);
    expect(baseLevel(s.w)).toBe(1);
    s.tap('A'); s.step(0.2);
    expect(s.shots()).toEqual([1, 1]);
  });
  it('a drawn shot raises the base level too', () => {
    const s = setup();
    s.press('A'); s.step(1.0); s.release('A'); s.until(() => s.w.moveId === null, 1);
    expect(s.shots()).toEqual([3]);
    expect(baseLevel(s.w)).toBe(2);
  });
  it('a hold right after a quick shot starts drawing (combo)', () => {
    const s = setup();
    s.tap('A');
    s.press('A');
    s.step(0.6);
    expect(s.w.charging).toBe(true);
  });
});

describe('Ausweichspannen', () => {
  it('draw started within 0.5 s after a roll starts at level 2', () => {
    const s = setup({ sinceRoll: 0.1 });
    s.press('A');
    s.step(0.2);
    expect(s.w.moveId).toBe('b_draw_r');
    expect(s.w.chargeLevel + 1).toBe(2);
    s.step(0.45);
    expect(s.w.chargeLevel + 1).toBe(3);
    s.release('A'); s.step(0.1);
    expect(s.w.data.lastShot.type).toBe('Durchschuss');
  });
  it('quick release after the roll already gives a level 2 Doppelschuss', () => {
    const s = setup({ sinceRoll: 0.05 });
    s.press('A'); s.step(0.2); s.release('A'); s.step(0.1);
    expect(s.shots()).toEqual([2]);
  });
  it('without a recent roll the draw starts at level 1', () => {
    const s = setup({ sinceRoll: 3 });
    s.press('A');
    s.step(0.3);
    expect(s.w.moveId).toBe('b_draw');
    expect(s.w.chargeLevel + 1).toBe(1);
  });
  it('a draw buffered during the roll counts as after the roll', () => {
    const s = setup({ sinceRoll: 99 });
    s.press('A');
    s.w.feed(0.2, { A: { down: true, pressed: true, released: false }, B: {} }); // rolling: only buffering
    s.player.sinceRoll = 0;
    s.step(0.05);
    expect(s.w.moveId).toBe('b_draw_r');
  });
});

describe('Sweet Spot', () => {
  it('8-16 m = x1.0, otherwise x0.7', () => {
    expect(sweetMul(7.9)).toBe(0.7);
    expect(sweetMul(8)).toBe(1);
    expect(sweetMul(12)).toBe(1);
    expect(sweetMul(16)).toBe(1);
    expect(sweetMul(16.1)).toBe(0.7);
    expect(sweetMul(3)).toBe(0.7);
    expect(sweetCue(5)).toBe('near');
    expect(sweetCue(10)).toBe('sweet');
    expect(sweetCue(30)).toBe('far');
  });
  it('arrow damage uses the distance multiplier (BW goes through ctx.playerHit)', () => {
    const s = setup();
    const m = fakeMonster('m1', [{ id: 'head', x: 0, y: 1, z: 12, r: 1 }]);
    const info = { monster: m, hp: m.hurtParts()[0], pos: { x: 0, y: 1, z: 12 } };
    const spec = { ...SHOTS[3], tip: null, dmgMul: 1 };
    arrowHit(s.player, info, spec, 12);
    arrowHit(s.player, info, spec, 5);
    expect(s.hits[0].ah.hit.mv).toBe(16);
    expect(s.hits[1].ah.hit.mv).toBeCloseTo(16 * 0.7);
    expect(s.hits[0].ah.hit.hitstop).toBe('none'); // arrows must not freeze the shooter
  });
});

describe('Schusstypen', () => {
  const fire = (level) => {
    const s = setup({ monsters: [] });
    s.press('A');
    s.step(level === 1 ? 0.3 : level === 2 ? 0.5 : 1.0);
    s.release('A');
    s.step(0.2);
    return s;
  };
  it('Stufe 1 = Streuschuss: 3 arrows in a 25 degree fan, BW 6', () => {
    const s = fire(1);
    expect(s.spawned.length).toBe(3);
    const ang = s.spawned.map((a) => Math.atan2(a.vel.x, a.vel.z));
    expect(Math.abs(ang[2] - ang[0])).toBeCloseTo((25 * Math.PI) / 180, 1);
    expect(SHOTS[1].mv).toBe(6);
  });
  it('Stufe 2 = Doppelschuss: 2 straight arrows, BW 10', () => {
    const s = fire(2);
    expect(s.spawned.length).toBe(2);
    expect(s.spawned[0].vel.x).toBeCloseTo(s.spawned[1].vel.x);
    expect(s.spawned[0].pos.x).not.toBeCloseTo(s.spawned[1].pos.x);
    expect(SHOTS[2].mv).toBe(10);
  });
  it('Stufe 3 = Durchschuss: 1 arrow piercing up to 3 parts, BW 16, Wucht +2 per part', () => {
    const s = fire(3);
    expect(s.spawned.length).toBe(1);
    expect(s.spawned[0].pierce).toBe(3);
    expect(SHOTS[3].mv).toBe(16);
    expect(SHOTS[3].wucht).toBe(2);
    expect(SHOTS[1].wucht).toBe(3);
  });
  it('ballistics: gravity-compensated velocity reaches the target', () => {
    const from = { x: 0, y: 1.4, z: 0 }, to = { x: 0, y: 3, z: 12 };
    const v = solveVelocity(from, to);
    const t = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) / BOW.speed;
    expect(from.z + v.z * t).toBeCloseTo(12, 0);
    expect(from.y + v.y * t - 0.5 * BOW.gravity * t * t).toBeCloseTo(3, 1);
  });
});

describe('Zielen', () => {
  it('without lock: camera forward, auto-aim to the nearest part within 10 degrees', () => {
    const near = fakeMonster('a', [{ id: 'body', x: 1, y: 2, z: 10, r: 0.5 }]); // ~5.7 deg off
    const far = fakeMonster('b', [{ id: 'body', x: 0, y: 2, z: 20, r: 0.5 }]);
    const s = setup({ monsters: [near, far] });
    const aim = computeAim(s.player);
    expect(aim.target.z).toBe(10);
    expect(aim.dist).toBeCloseTo(Math.hypot(1, 10));
  });
  it('a part further than 10 degrees away is ignored', () => {
    const m = fakeMonster('a', [{ id: 'body', x: 5, y: 2, z: 10, r: 0.5 }]);
    const s = setup({ monsters: [m] });
    expect(computeAim(s.player).target).toBe(null);
  });
  it('with lock-on the locked part is the target', () => {
    const m = fakeMonster('a', [{ id: 'body', x: 0, y: 2, z: 10, r: 0.5 }]);
    const s = setup({ monsters: [m] });
    s.player.lockPoint = () => ({ x: 8, y: 3, z: 6 });
    const aim = computeAim(s.player);
    expect(aim.target).toEqual({ x: 8, y: 3, z: 6 });
    expect(aim.yaw).toBeCloseTo(Math.atan2(8, 6));
  });
});

describe('Spitzen (Munition)', () => {
  it('Brennspitze adds fire element 12, Giftspitze poison buildup 20, Bummspitze stun 8 (applyStatus)', () => {
    const s = setup();
    const m = fakeMonster('m1', [{ id: 'head', x: 0, y: 1, z: 12, r: 1 }]);
    const info = { monster: m, hp: m.hurtParts()[0], pos: { x: 0, y: 1, z: 12 } };
    arrowHit(s.player, info, { ...SHOTS[3], tip: 'brennspitze' }, 12);
    expect(s.hits[0].ah.elems).toEqual({ fire: 12 });
    arrowHit(s.player, info, { ...SHOTS[3], tip: 'giftspitze' }, 12);
    expect(m.applyCalls).toEqual([['poison', { buildup: 20 }]]);
    arrowHit(s.player, info, { ...SHOTS[3], tip: 'bummspitze' }, 12);
    expect(m.applyCalls[1]).toEqual(['stun', { buildup: 8 }]);
  });
  it('without applyStatus (monster not ready) the stun falls back to blunt buildup', () => {
    const s = setup();
    const m = fakeMonster('m1', [{ id: 'head', x: 0, y: 1, z: 12, r: 1 }]);
    delete m.applyStatus;
    arrowHit(s.player, { monster: m, hp: m.hurtParts()[0], pos: { x: 0, y: 1, z: 12 } }, { ...SHOTS[3], tip: 'bummspitze' }, 12);
    expect(s.hits[0].ah.hit.blunt).toBe(8);
  });
  it('each shot consumes one tip; empty inventory clears player.ammoTip', () => {
    let n = 1;
    const inventory = { consume: (id, k) => (n >= k ? ((n -= k), true) : false), count: () => n };
    const s = setup({ ammoTip: 'brennspitze', inventory });
    s.tap('A'); s.until(() => s.w.moveId === null, 1);
    expect(s.w.data.log[0].tip).toBe('brennspitze');
    expect(n).toBe(0);
    expect(s.player.ammoTip).toBe(null);
    s.tap('A'); s.until(() => s.w.moveId === null, 1);
    expect(s.w.data.log[1].tip).toBe(null);
  });
  it('arrows glow gold in the sweet spot and dim outside', () => {
    const s = setup();
    s.tap('A'); s.until(() => s.spawned.length > 0, 1);
    const a = s.spawned[0];
    expect(a.glow({ pos: { x: 0, z: 12 } })).toBe('sweet');
    expect(a.glow({ pos: { x: 0, z: 4 } })).toBe('weak');
  });
});

describe('Bogenhieb und Pfeilregen', () => {
  it('B = Bogenhieb (melee, BW 14)', () => {
    const s = setup();
    s.tap('B');
    expect(s.w.moveId).toBe('b_hieb');
    expect(s.w.move.hits[0].mv).toBe(14);
  });
  it('Pfeilregen only at Wucht 100: 1.2 s mark, then 20 arrows of BW 9', () => {
    const s = setup();
    s.w.wucht = 99; s.w.sinceWuchtHit = 0;
    s.tap('B');
    expect(s.w.moveId).toBe('b_hieb');
    const f = setup();
    f.w.wucht = 100; f.w.sinceWuchtHit = 0;
    f.tap('B', 0.02);
    expect(f.w.moveId).toBe('b_finisher');
    expect(f.w.wucht).toBe(0);
    f.step(1.1);
    expect(f.spawned.length).toBe(0);
    f.step(1.3);
    expect(f.spawned.length).toBe(20);
    expect(BOW.rain.mark).toBe(1.2);
    expect(BOW.rain.mv).toBe(9);
    expect(f.spawned.every((a) => a.vel.y < 0)).toBe(true);
  });
});

describe('HUD', () => {
  it('shows level, shot name and the sweet spot cue while drawing', () => {
    const s = setup();
    s.press('A');
    s.step(0.5);
    const st = bow.status(s.w);
    expect(st.level).toBe(2);
    expect(st.text).toMatch(/Doppelschuss/);
  });
});

describe('Projectiles', () => {
  const line = (n, z0 = 5, gap = 2) => fakeMonster('m', Array.from({ length: n }, (_, i) => ({ id: 'p' + i, x: 0, y: 1, z: z0 + i * gap, r: 0.6 })));
  const mkPr = (monsters) => new Projectiles({ monsters, players: [], world: { heightAt: () => 0, collide: (p) => p } }, { visual: false });
  it('a piercing arrow hits at most 3 parts of 5 in its path, nearest first', () => {
    const m = line(5);
    const pr = mkPr([m]);
    const got = [];
    pr.spawn({ pos: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: 0, z: 40 }, pierce: 3, onHit: (i) => got.push(i.hp.part.id) });
    for (let i = 0; i < 60; i++) pr.update(DT);
    expect(got).toEqual(['p0', 'p1', 'p2']);
    expect(pr.list.length).toBe(0);
  });
  it('pierce 1 stops at the first part; each part is hit at most once', () => {
    const m = fakeMonster('m', [{ id: 'a', x: 0, y: 1, z: 5, r: 1 }, { id: 'a', x: 0, y: 1, z: 5.4, r: 1 }, { id: 'b', x: 0, y: 1, z: 8, r: 1 }]);
    const pr = mkPr([m]);
    const got = [];
    pr.spawn({ pos: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: 0, z: 40 }, pierce: 1, onHit: (i) => got.push(i.hp.part.id) });
    for (let i = 0; i < 40; i++) pr.update(DT);
    expect(got).toEqual(['a']);
    const pr2 = mkPr([m]);
    const got2 = [];
    pr2.spawn({ pos: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: 0, z: 40 }, pierce: 3, onHit: (i) => got2.push(i.hp.part.id) });
    for (let i = 0; i < 40; i++) pr2.update(DT);
    expect(got2).toEqual(['a', 'b']);
  });
  it('fast arrows do not tunnel through small parts (swept test)', () => {
    const m = fakeMonster('m', [{ id: 'a', x: 0, y: 1, z: 6, r: 0.2 }]);
    const pr = mkPr([m]);
    let n = 0;
    pr.spawn({ pos: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: 0, z: 90 }, onHit: () => n++ });
    for (let i = 0; i < 30; i++) pr.update(DT);
    expect(n).toBe(1);
  });
  it('gravity bends the path, the ground stops the arrow, dead monsters are ignored', () => {
    const m = fakeMonster('m', [{ id: 'a', x: 0, y: 1, z: 6, r: 0.5 }]);
    m.alive = false;
    const pr = mkPr([m]);
    let ended = null, n = 0;
    const p = pr.spawn({ pos: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: 0, z: 20 }, gravity: 20, onHit: () => n++, onEnd: (_, r) => (ended = r) });
    for (let i = 0; i < 60; i++) pr.update(DT);
    expect(n).toBe(0);
    expect(ended).toBe('ground');
    expect(p.pos.y).toBe(0);
    expect(p.pos.z).toBeGreaterThan(3);
  });
  it('monster-team projectiles hit players, not monsters', () => {
    const m = fakeMonster('m', [{ id: 'a', x: 0, y: 1, z: 3, r: 1 }]);
    const player = { id: 'p1', alive: true, state: 'free', hitCapsules: () => [{ type: 'capsule', a: { x: 0, y: 0.4, z: 6 }, b: { x: 0, y: 1.3, z: 6 }, r: 0.4 }] };
    const pr = new Projectiles({ monsters: [m], players: [player], world: { heightAt: () => 0, collide: (p) => p } }, { visual: false });
    const got = [];
    pr.spawn({ team: 'monster', pos: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: 0, z: 20 }, onHit: (i) => got.push(i.kind) });
    for (let i = 0; i < 30; i++) pr.update(DT);
    expect(got).toEqual(['player']);
  });
});
