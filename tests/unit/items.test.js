import { describe, it, expect, beforeEach } from 'vitest';
import { Player } from '../../src/game/player.js';
import { createBus } from '../../src/core/events.js';
import { createInput } from '../../src/input/input.js';
import { createRng } from '../../src/core/rng.js';
import { time } from '../../src/core/time.js';
import { HuntInventory } from '../../src/game/inventory.js';
import { ItemSystem, itemTiming, canRollCancel } from '../../src/game/items.js';
import { Effects, monstersNear, explode } from '../../src/game/effects.js';
import { applyLoadout } from '../../src/game/loadout.js';
import { ITEMS } from '../../src/data/items.js';
import { ROLL } from '../../src/game/vitals.js';

const DT = 1 / 60;
function make({ bar = [{ id: 'flickbrause', n: 3 }], free = {}, weapon = 'gs' } = {}) {
  const numbers = [], toasts = [], spawned = [];
  const ctx = {
    world: { heightAt: () => 0, collide: () => {} },
    monsters: [], players: [], bus: createBus(), input: createInput(), rng: createRng(1), cameraYaw: 0,
    fx: { number: (p, t) => numbers.push(t), spark() {}, shake() {}, flash() {}, glitch() {} },
    playerHit() {}, respawn(p) { p.respawn(0, 0); },
    toast: (t) => toasts.push(t), spawnEffect: (k, p) => { spawned.push([k, p]); },
  };
  const p = new Player({ ctx, weapon });
  p.spawnAt(0, 0, 0);
  ctx.players.push(p);
  const inv = new HuntInventory({ brought: bar, free });
  const sys = new ItemSystem(ctx, p, inv);
  const step = (n = 1) => { for (let i = 0; i < n; i++) { ctx.input.poll(DT); sys.update(DT); p.update(DT); } };
  const secs = (s) => step(Math.round(s / DT));
  return { ctx, p, inv, sys, step, secs, numbers, toasts, spawned };
}
beforeEach(() => time.reset());

describe('hunt inventory', () => {
  it('counts pools, consumes free -> loot -> brought, respects carry limits', () => {
    const inv = new HuntInventory({ brought: [{ id: 'flickbrause', n: 9 }], free: { flickbrause: 2 } });
    expect(inv.count('flickbrause')).toBe(11);
    expect(inv.add('flickbrause', 5)).toBe(0); // above carry limit 10
    expect(inv.add('knisterkraut', 4)).toBe(4);
    expect(inv.add('knisterkraut', 200)).toBe(95); // 99 cap
    expect(inv.consume('flickbrause', 3)).toBe(true);
    expect(inv.free.flickbrause).toBeUndefined();
    expect(inv.brought.flickbrause).toBe(8);
    expect(inv.used()).toEqual({ flickbrause: 1 });
    expect(inv.consume('flickbrause', 99)).toBe(false);
    expect(inv.count('flickbrause')).toBe(8);
  });
  it('bar: max 8 slots, free Flickbrause first, cycling skips empty stacks', () => {
    const ids = ['dicke_flickbrause', 'pustekuchen', 'blendknolle', 'stinkbombe', 'klebefalle', 'knallgurke', 'brennspitze', 'giftspitze', 'bummspitze'];
    const inv = new HuntInventory({ brought: ids.map((id) => ({ id, n: 1 })), free: { flickbrause: 2 } });
    expect(inv.items.length).toBe(8);
    expect(inv.items[0].id).toBe('flickbrause');
    inv.consume('dicke_flickbrause', 1);
    expect(inv.cycle(1)).toBe('pustekuchen');
    expect(inv.cycle(-1)).toBe('flickbrause');
    expect(inv.cycle(-1)).not.toBe('dicke_flickbrause'); // empty slot skipped
    expect(inv.select(99)).not.toBeUndefined();
  });
  it('gathered() excludes carved, picked-up consumables join the bar', () => {
    const inv = new HuntInventory({});
    inv.add('altknochen', 2);
    inv.add('jaggo_fell', 2, { carve: true });
    inv.add('sprudelwasser', 1);
    expect(inv.gathered()).toEqual({ altknochen: 2, sprudelwasser: 1 });
    expect(inv.items.map((i) => i.id)).toEqual(['sprudelwasser']);
  });
});

describe('item use timing rules', () => {
  it('Flickbrause: 0.9 s use, effect lands at 45 %, roll-cancel not before', () => {
    const t = itemTiming(ITEMS.flickbrause);
    expect(t.dur).toBeCloseTo(0.9);
    expect(t.cancelAt).toBe(t.applyAt);
    expect(canRollCancel({ t: t.applyAt - 0.01, cancelAt: t.cancelAt })).toBe(false);
    expect(canRollCancel({ t: t.applyAt, cancelAt: t.cancelAt })).toBe(true);
    expect(itemTiming(ITEMS.flickbrause, 0.2).dur).toBeCloseTo(0.72);
  });
  it('use times match the GDD table', () => {
    expect(ITEMS.dicke_flickbrause.time).toBe(1.1);
    expect(ITEMS.pustekuchen.time).toBe(1.2);
    expect(ITEMS.sprudelwasser.time).toBe(0.6);
    expect(ITEMS.blendknolle.time).toBe(0.5);
    expect(ITEMS.klebefalle.time).toBe(1.5);
    expect(ITEMS.knallgurke.time).toBe(1.0);
    expect(ITEMS.brennspitze.time).toBe(0.4);
  });
  it('using roots the hunter; heal lands over ~1 s and consumes exactly one', () => {
    const { ctx, p, inv, sys, secs } = make();
    p.v.hp = 40; p.v.bruise = 0;
    ctx.input.stick = null;
    ctx.input.setStick(0, 1, 'k');
    sys.request();
    expect(sys.using).toBeTruthy();
    secs(0.3);
    expect(p.speed).toBeLessThan(0.5); // rooted although stick is pushed
    expect(inv.count('flickbrause')).toBe(3); // not yet applied
    secs(0.2);
    expect(inv.count('flickbrause')).toBe(2);
    secs(1.6);
    expect(p.v.hp).toBeCloseTo(75, 0);
    expect(sys.using).toBeNull();
  });
  it('roll before the effect lands is ignored, after it cancels the animation', () => {
    const { ctx, p, sys, secs, inv } = make();
    sys.request();
    ctx.input.press('roll', 50);
    secs(0.2); // < applyAt 0.405
    expect(p.state).toBe('free');
    expect(sys.using).toBeTruthy();
    secs(0.15);
    ctx.input.press('roll', 50);
    secs(0.3);
    expect(p.state).toBe('roll');
    expect(sys.using).toBeNull();
    expect(inv.count('flickbrause')).toBe(2); // effect had landed
  });
  it('a hit before the effect lands wastes nothing', () => {
    const { p, sys, secs, inv } = make();
    sys.request();
    secs(0.1);
    p.takeHit({ dmg: 5, knock: 'flinch', key: 'x' });
    secs(0.1);
    expect(sys.using).toBeNull();
    expect(p.itemUse).toBeNull();
    expect(inv.count('flickbrause')).toBe(3);
  });
  it('empty slot / second press while using do nothing; press during attack is buffered', () => {
    const { sys, inv, toasts, secs, p } = make({ bar: [{ id: 'flickbrause', n: 1 }] });
    sys.request();
    expect(sys.request()).toBe(false);
    secs(1.0);
    inv.consume('flickbrause', 1);
    expect(sys.request()).toBe(false);
    expect(toasts.some((t) => t.includes('leer'))).toBe(true);
    const b = make();
    b.ctx.input.press('attack', 60);
    b.step(8);
    expect(b.p.weapon.busy).toBe(true);
    expect(b.sys.request()).toBe(false);
    expect(b.sys.buffer).toBeGreaterThan(0);
    b.secs(1.5);
    expect(b.sys.buffer).toBe(0);
  });
  it('Dicke Flickbrause heals Prellung fully; Pustekuchen halves stamina cost for 60 s', () => {
    const a = make({ bar: [{ id: 'dicke_flickbrause', n: 1 }] });
    a.p.v.hp = 20; a.p.v.bruise = 30;
    a.sys.request(); a.secs(2.5);
    expect(a.p.v.bruise).toBe(0);
    expect(a.p.v.hp).toBeCloseTo(100, 0);
    const b = make({ bar: [{ id: 'pustekuchen', n: 1 }] });
    b.sys.request(); b.secs(0.7);
    expect(b.p.v.costMul).toBe(0.5);
    b.secs(61);
    expect(b.p.v.costMul).toBe(1);
  });
  it('Sprudelwasser clears player status', () => {
    const a = make({ bar: [{ id: 'sprudelwasser', n: 1 }] });
    let cleared = 0;
    a.p.clearStatus = () => { cleared++; };
    a.sys.request(); a.secs(0.7);
    expect(cleared).toBe(1);
  });
  it('throw lands at 6 m ahead or at the lock target; placement spawns in front', () => {
    const a = make({ bar: [{ id: 'blendknolle', n: 2 }, { id: 'knallgurke', n: 1 }] });
    a.p.rot = 0;
    a.sys.request(); a.secs(0.6);
    expect(a.spawned[0][0]).toBe('flash');
    expect(a.spawned[0][1].to.z).toBeCloseTo(6, 3);
    a.inv.select(1);
    a.sys.request(); a.secs(1.0);
    expect(a.spawned[1][0]).toBe('bomb');
    expect(a.spawned[1][1].pos.z).toBeCloseTo(1.5, 3);
  });
  it('bow tips set / toggle player.ammoTip, only with a bow', () => {
    const a = make({ bar: [{ id: 'brennspitze', n: 10 }] });
    a.p.weaponId = 'bow'; // bow itself lives in another worktree
    a.sys.request(); a.secs(0.5);
    expect(a.p.ammoTip).toBe('brennspitze');
    expect(a.inv.count('brennspitze')).toBe(10); // not consumed by selecting
    a.sys.request(); a.secs(0.5);
    expect(a.p.ammoTip).toBeNull();
    const g = make({ bar: [{ id: 'brennspitze', n: 10 }] });
    expect(g.sys.request()).toBe(false);
    expect(g.toasts.length).toBe(1);
  });
});

describe('effects & loadout', () => {
  const fakeMonster = (x, z, over = {}) => ({ alive: true, pos: { x, z, y: 0 }, bodyRadius: 1, parts: [{ id: 'head', factor: 1, stunPart: true }], ...over });
  const fakeHunt = (monsters) => {
    const calls = [];
    const h = { scene: { add() {}, remove() {} }, world: { heightAt: () => 0 }, monsters, bus: createBus(), fx: { spark() {}, flash() {}, shake() {}, number: (p, t) => calls.push(t) }, calls };
    h.effects = new Effects(h);
    return h;
  };
  it('flash blinds monsters near the landing point only', () => {
    const near = fakeMonster(5, 0, { applyStatus: (...a) => { near.got = a; return true; } });
    const far = fakeMonster(30, 0, { applyStatus: () => { far.got = true; } });
    const h = fakeHunt([near, far]);
    h.effects.spawn('flash', { from: { x: 0, y: 1, z: 0 }, to: { x: 5, z: 0 } });
    for (let i = 0; i < 50; i++) h.effects.update(DT);
    expect(near.got[0]).toBe('blind');
    expect(far.got).toBeUndefined();
    expect(h.effects.list.length).toBe(0);
  });
  it('trap arms after 0.5 s, sticks once, and stays if the monster refuses', () => {
    let accept = false;
    const m = fakeMonster(0, 0, { applyStatus: (t) => (t === 'trap' ? accept : false) });
    const h = fakeHunt([m]);
    h.effects.spawn('trap', { pos: { x: 0, y: 0, z: 0 } });
    h.effects.update(0.2);
    expect(h.effects.list.length).toBe(1);
    h.effects.update(0.5);
    expect(h.effects.list.length).toBe(1); // monster on top but refused (cooldown)
    accept = true;
    h.effects.update(DT);
    expect(h.effects.list.length).toBe(0);
  });
  it('bomb: 3 s fuse, then 120 damage with stun build-up on the head', () => {
    const hits = [];
    const m = fakeMonster(2, 0, { applyDamage: (r) => { hits.push(r); } });
    const h = fakeHunt([m]);
    h.effects.spawn('bomb', { pos: { x: 0, y: 0, z: 0 } });
    h.effects.update(2.9);
    expect(hits.length).toBe(0);
    h.effects.update(0.2);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ dmg: 120, blunt: 50, partId: 'head' });
    expect(monstersNear([m], { x: 0, z: 0 }, 1.5).length).toBe(1);
    expect(typeof explode).toBe('function');
  });
  it('loadout: armor protection, Macken, food, Dickschädel wrapper', () => {
    const { p } = make();
    applyLoadout(p, { name: 'x', weapon: { type: 'gs', tier: 3, branch: 'b' }, armor: { head: 'barrotz_head', body: 'barrotz_body', legs: 'barrotz_legs' }, items: [], food: 'eintopf' });
    expect(p.protect).toBe(72);
    expect(p.stats.name).toBe('Barrotz-Brecher');
    expect(p.v.maxHp).toBe(125);
    expect(p.v.hp).toBe(125);
    p.takeHit({ dmg: 10, knock: 'down', key: 'a' });
    expect(p.state).toBe('free'); // Dickschädel 3: neither flinch nor down
    const q = make().p;
    applyLoadout(q, { name: 'x', weapon: { type: 'bow', tier: 4, branch: null }, armor: { head: 'jaggo_head', body: 'jaggo_body', legs: 'knochenkram_legs' }, items: [], food: 'glutgulasch' });
    expect(q.flinkfuss).toBe(2);
    expect(q.dmgMul).toBeCloseTo(1.1);
    expect(q.v.maxStamina).toBe(115);
    expect(q.iframeExtend).toBeCloseTo(2 * ROLL.flinkfussPerLevel);
  });
});
