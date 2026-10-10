import { describe, it, expect } from 'vitest';
import { Monster } from '../../src/game/monsters/monster.js';
import { monsters } from '../../src/game/monsters/index.js';
import { Herd } from '../../src/game/monsters/herd.js';
import { jaggo } from '../../src/game/monsters/jaggo.js';
import { createBus } from '../../src/core/events.js';
import { createRng } from '../../src/core/rng.js';
import { ITEMS } from '../../src/data/items.js';
import { RECIPES } from '../../src/data/recipes.js';
import { FOODS, FOOD_ORDER } from '../../src/data/foods.js';
import { ARMOR_PIECES, ARMOR_SETS } from '../../src/data/armor.js';
import { DROPS, rollCarveAll } from '../../src/data/drops.js';
import { buildLayout, buildPastures } from '../../src/game/world/layout.js';

const DT = 1 / 60;
function ctx0() {
  return {
    world: { heightAt: () => 0, collide: () => {}, nestPoint: { x: 40, z: 0 } }, monsters: [], players: [], bus: createBus(), rng: createRng(1), time: 0,
    fx: { number() {}, spark() {}, shake() {}, flash() {}, glitch() {}, marker() {}, clearMarker() {} }, countMonsters: () => 0,
  };
}
function herd(seed = 5, kind = 'mampfer') {
  const ctx = ctx0();
  const h = new Herd({ id: 'h', kind, ctx, rng: createRng(seed), pastures: [], home: { x: 0, z: 0, r: 6 } });
  const roles = kind === 'mampfer' ? [['mampferbulle', 'bull'], ['mampfer', 'cow'], ['mampfer', 'cow'], ['mampferkalb', 'calf']] : [['hoppler', 'cow'], ['hoppler', 'cow'], ['hoppler', 'cow']];
  roles.forEach(([d, role], i) => {
    const m = new Monster(monsters[d], ctx, { id: `${d}-${i}`, x: i * 2 - 3, z: (i % 2) * 2, state: 'graze', seed: seed + i });
    ctx.monsters.push(m); h.add(m, role);
  });
  return { ctx, h };
}
const run = (ctx, n) => { for (let i = 0; i < n; i++) { ctx.time += DT; for (const m of ctx.monsters) m.update(DT); } };
const trace = (ctx) => JSON.stringify(ctx.monsters.map((m) => [m.pos.x, m.pos.z, m.state].map((v) => (typeof v === 'number' ? +v.toFixed(5) : v))));

describe('fauna data', () => {
  it('items/recipe/food/armor are valid', () => {
    for (const id of ['rohfleisch', 'mampfer_fell', 'grillsteak']) expect(ITEMS[id].baseValue).toBeGreaterThan(0);
    expect(ITEMS.grillsteak.max).toBe(3); expect(ITEMS.grillsteak.time).toBe(1.2);
    expect(RECIPES.grillsteak.cost).toEqual({ rohfleisch: 1, glutbrocken: 1 });
    for (const id of Object.keys(RECIPES.grillsteak.cost)) expect(ITEMS[id]).toBeTruthy();
    expect(FOOD_ORDER).toContain('mampfer_ragout');
    expect(FOODS.mampfer_ragout.effect.maxHp).toBe(30);
    expect(FOODS.mampfer_ragout.cost).toEqual({ schrott: 60, rohfleisch: 2 });
    expect(ARMOR_SETS.fellkluft.prot).toBe(10);
    expect(ARMOR_PIECES.fellkluft_body.skills.zaehe_socke).toBe(1);
    for (const p of ['head', 'body', 'legs']) for (const k of Object.keys(ARMOR_PIECES[`fellkluft_${p}`].cost)) expect(k === 'schrott' || ITEMS[k]).toBeTruthy();
  });
  it('carve drops', () => {
    const rng = createRng(3);
    const a = rollCarveAll('mampfer', rng);
    expect(a.find((e) => e.id === 'rohfleisch').n).toBe(2);
    expect(a.find((e) => e.id === 'altknochen').n).toBe(1);
    let fell = 0; for (let i = 0; i < 400; i++) if (rollCarveAll('mampfer', rng).some((e) => e.id === 'mampfer_fell')) fell++;
    expect(fell).toBeGreaterThan(40); expect(fell).toBeLessThan(160);
    expect(rollCarveAll('hoppler', rng)).toEqual([{ id: 'rohfleisch', n: 1 }]);
    expect(rollCarveAll('jaggo', rng)).toBeNull();
    for (const d of Object.values(monsters)) if (d.carve) expect(DROPS[d.dropId].once).toBeTruthy();
  });
  it('defs are minor + neutral and replicable', () => {
    for (const id of ['mampfer', 'mampferbulle', 'mampferkalb', 'hoppler']) { expect(monsters[id].minor).toBe(true); expect(monsters[id].id).toBe(id); expect(monsters[id].neutral).toBe(true); }
    expect(monsters.mampferbulle.attacks.mampfer_stoss.telegraph).toBeGreaterThanOrEqual(0.6);
    expect(monsters.mampferbulle.attacks.mampfer_stoss.hits[0].dmg).toBe(8);
    expect(monsters.mampferbulle.attacks.mampfer_stoss.hits[0].knock).toBe('flinch');
    expect(monsters.mampfer.hp).toBe(120); expect(monsters.hoppler.hp).toBe(20);
  });
});

describe('herd behaviour', () => {
  it('is deterministic with a seeded rng', () => {
    const a = herd(9), b = herd(9);
    run(a.ctx, 900); run(b.ctx, 900);
    expect(trace(a.ctx)).toBe(trace(b.ctx));
    const c = herd(10); run(c.ctx, 900);
    expect(trace(c.ctx)).not.toBe(trace(a.ctx));
  });
  it('stampedes together away from a predator and calms down afterwards', () => {
    const { ctx, h } = herd(4);
    run(ctx, 120);
    const j = new Monster(jaggo, ctx, { id: 'jaggo', x: -12, z: 0, state: 'wander', seed: 1 });
    j.update = () => {}; ctx.monsters.push(j);
    run(ctx, 40);
    expect(h.mode).toBe('flee');
    run(ctx, 300);
    const herdMs = ctx.monsters.filter((m) => m.herd);
    for (const m of herdMs) { expect(m.state).toBe('flee'); expect(m.pos.x).toBeGreaterThan(-3); }
    const cx = herdMs.reduce((s, m) => s + m.pos.x, 0) / herdMs.length;
    expect(cx).toBeGreaterThan(8);
    for (const m of herdMs) expect(Math.hypot(m.pos.x - cx, m.pos.z - h.center.z)).toBeLessThan(14);
    ctx.monsters.splice(ctx.monsters.indexOf(j), 1);
    run(ctx, 60 * 20);
    expect(h.mode).not.toBe('flee');
  });
  it('hit calf: bull charges exactly once (8 dmg flinch attack, telegraph >= 0.6 s)', () => {
    const { ctx, h } = herd(2);
    const p = { id: 'p1', alive: true, pos: { x: 8, y: 0, z: 0 } };
    ctx.players.push(p);
    const calf = ctx.monsters.find((m) => m.fa.role === 'calf');
    calf.applyDamage({ dmg: 5, partId: 'body', attackerId: 'p1', blunt: 0 });
    const bull = ctx.monsters[0];
    expect(bull.attack?.id).toBe('mampfer_stoss');
    expect(h.bullUsed).toBe(true);
    bull.attack = null;
    calf.applyDamage({ dmg: 5, partId: 'body', attackerId: 'p1', blunt: 0 });
    expect(bull.attack).toBeNull();
    expect(h.mode).toBe('flee');
  });
  it('hoppler group flees when a hunter is closer than 6 m', () => {
    const { ctx, h } = herd(3, 'hoppler');
    const p = { id: 'p1', alive: true, pos: { x: 40, y: 0, z: 0 } };
    ctx.players.push(p);
    run(ctx, 60); expect(h.mode).not.toBe('flee');
    p.pos.x = 4; run(ctx, 30); expect(h.mode).toBe('flee');
  });
  it('minor culling hides far animals', () => {
    const { ctx } = herd(1);
    ctx.players.push({ id: 'p1', local: true, alive: true, pos: { x: 200, y: 0, z: 0 } });
    run(ctx, 2);
    expect(ctx.monsters[1].culled).toBe(true);
    ctx.players[0].pos.x = 10; run(ctx, 2);
    expect(ctx.monsters[1].culled).toBe(false);
  });
});

describe('predation', () => {
  it('Jaggo kills a Mampfer then eats (fressen, ~6 s); a hit ends it', () => {
    const { ctx } = herd(6);
    const j = new Monster(jaggo, ctx, { id: 'jaggo', x: 8, z: 0, state: 'wander', seed: 3 });
    ctx.monsters.push(j);
    j.pred = { cd: 0, prey: null, t: 0 };
    let ate = false;
    for (let i = 0; i < 60 * 25 && !ate; i++) { ctx.time += DT; for (const m of ctx.monsters) m.update(DT); ate = j.state === 'fressen'; }
    expect(ate).toBe(true);
    expect(ctx.monsters.filter((m) => m.def.prey && !m.alive).length).toBe(1);
    expect(j.eating).toBe(true);
    run(ctx, 60 * 3); expect(j.state).toBe('fressen');
    run(ctx, 60 * 4); expect(j.state).not.toBe('fressen');
    j.pred.cd = 0; j.pred.prey = null;
    // eat again, then interrupt with a hit
    j.setState('fressen'); j.eatT = 6;
    j.applyDamage({ dmg: 10, partId: 'body', attackerId: 'p1', blunt: 0 });
    expect(j.state).toBe('notice');
  });
});

describe('pastures', () => {
  it('exist in zones 1 and 3 and are linked', () => {
    const L = buildLayout(1);
    const p = buildPastures(L);
    expect(p.filter((q) => q.zone === 1).length).toBeGreaterThanOrEqual(3);
    expect(p.filter((q) => q.zone === 3).length).toBeGreaterThanOrEqual(3);
    expect(p.every((q) => q.links.length > 0)).toBe(true);
    expect(JSON.stringify(buildPastures(L))).toBe(JSON.stringify(p));
  });
});
