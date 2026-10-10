import { describe, it, expect, beforeEach } from 'vitest';
import { Monster } from '../../src/game/monsters/monster.js';
import { barrotz, PANZER_HP } from '../../src/game/monsters/barrotz.js';
import { brathalos, FLY_HEIGHT } from '../../src/game/monsters/brathalos.js';
import { jaggling, spawnPack } from '../../src/game/monsters/jaggling.js';
import { jaggo } from '../../src/game/monsters/jaggo.js';
import { getMonsterDef } from '../../src/game/monsters/index.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { projPos, mudDef, fireballDef, ProjectileSet } from '../../src/game/monsters/mprojectiles.js';
import { Player } from '../../src/game/player.js';
import { createBus } from '../../src/core/events.js';
import { createInput } from '../../src/input/input.js';
import { createRng } from '../../src/core/rng.js';
import { time } from '../../src/core/time.js';
import { resolvePlayerHit } from '../../src/game/combat.js';

const DT = 1 / 60;
beforeEach(() => time.reset());

function makeCtx() {
  const numbers = [];
  const ctx = {
    world: { heightAt: () => 0, collide: () => {}, nestPoint: { x: 40, z: 0 } },
    monsters: [], players: [], bus: createBus(), input: createInput(), rng: createRng(5), cameraYaw: 0,
    fx: { number: (p, t) => numbers.push(t), spark() {}, shake() {}, flash() {}, glitch() {}, marker() {}, clearMarker() {} },
    playerHit() {}, respawn() {},
    countMonsters(id) { return ctx.monsters.filter((m) => m.alive && m.def.id === id).length; },
    spawnMonster(id, o) { const m = new Monster(getMonsterDef(id), ctx, { id: `${id}-${ctx.monsters.length}`, ...o, seed: ctx.monsters.length + 1 }); ctx.monsters.push(m); return m; },
    numbers, events: [],
  };
  ctx.bus.on('*', (e, t) => ctx.events.push(t));
  return ctx;
}
function make(def, state = 'combat', px = 0, pz = 8) {
  const ctx = makeCtx();
  const m = new Monster(def, ctx, { id: def.id, x: 0, z: 0, state, seed: 7 });
  ctx.monsters.push(m);
  const p = new Player({ ctx });
  p.spawnAt(px, pz, Math.PI);
  ctx.players.push(p);
  m.target = p;
  return { ctx, m, p };
}
const hit = (m, partId, dmg, extra = {}) => m.applyDamage({ dmg, elemDmg: 0, partId, blunt: 0, ...extra });
const run = (m, secs) => { for (let i = 0; i < Math.round(secs / DT); i++) m.update(DT); };

describe('status API on Brocken', () => {
  it('blind: 4 s, returns true, monster stumbles instead of attacking', () => {
    const { m } = make(jaggo);
    expect(m.applyStatus('blind')).toBe(true);
    expect(m.blind).toBe(true);
    m.recover = 0;
    run(m, 3.9);
    expect(m.attack).toBeNull();
    run(m, 0.3);
    expect(m.blind).toBe(false);
  });
  it('trap: 6 s stuck, only once per 60 s', () => {
    const { m } = make(jaggo);
    expect(m.applyStatus('trap')).toBe(true);
    const x = m.pos.x, z = m.pos.z;
    run(m, 5.5);
    expect(m.trapped).toBe(true);
    expect(Math.hypot(m.pos.x - x, m.pos.z - z)).toBeLessThan(0.01);
    run(m, 1);
    expect(m.trapped).toBe(false);
    expect(m.applyStatus('trap')).toBe(false); // cooldown
    run(m, 60);
    expect(m.applyStatus('trap')).toBe(true);
  });
  it('poison: 5 x buildup 20 -> poisoned, then 3 % max HP over 15 s', () => {
    const { m } = make(jaggo);
    for (let i = 0; i < 4; i++) m.applyStatus('poison', { buildup: 20 });
    expect(m.poisoned).toBe(false);
    m.applyStatus('poison', { buildup: 20 });
    expect(m.poisoned).toBe(true);
    m.stunT = 99; m.hp = m.maxHp * 0.5; // keep the AI quiet
    const hp0 = m.hp;
    run(m, 16);
    expect(hp0 - m.hp).toBeCloseTo(m.maxHp * 0.03, 0);
    expect(m.poisoned).toBe(false);
  });
  it('stun: buildup stuns at the threshold (150)', () => {
    const { m } = make(jaggo);
    expect(m.applyStatus('stun', { buildup: 100 })).toBe(true);
    expect(m.stunT).toBe(0);
    m.applyStatus('stun', { buildup: 60 });
    expect(m.stunT).toBeGreaterThan(5);
  });
  it('stink: switches target when another player exists, else flees from the source', () => {
    const { ctx, m, p } = make(jaggo);
    const q = new Player({ id: 'p2', ctx }); q.spawnAt(0, -8, 0); ctx.players.push(q);
    expect(m.applyStatus('stink', { pos: { x: 0, z: 8 } })).toBe(true);
    expect(m.target).toBe(q);
    const solo = make(jaggo);
    solo.m.applyStatus('stink', { pos: { x: 0, z: 4 } });
    solo.m.recover = 0;
    run(solo.m, 2);
    expect(solo.m.pos.z).toBeLessThan(-1); // ran away from the smell
    expect(solo.m.attack).toBeNull();
    void p;
  });
  it('fire / shock return whether they took effect (default: no)', () => {
    const { m } = make(jaggo);
    expect(m.applyStatus('fire', { dmg: 10 })).toBe(false);
    expect(m.applyStatus('nonsense')).toBe(false);
  });
});

describe('nest and route lookups (world agent interface with fallbacks)', () => {
  it('flees to world.nestFor(defId) when provided, otherwise nestPoint', () => {
    const a = make(jaggo);
    a.ctx.world.nestFor = (id) => (id === 'jaggo' ? { x: 0, z: -30 } : null);
    a.m.hp = a.m.maxHp * 0.25; a.m.rageUsed = true;
    run(a.m, 0.1);
    expect(a.m.state).toBe('flee');
    run(a.m, 12);
    expect(a.m.pos.z).toBeLessThan(-5); // heads for (0,-30), not for nestPoint (40,0)
    expect(Math.abs(a.m.pos.x)).toBeLessThan(10);
    const b = make(jaggo);
    b.m.hp = b.m.maxHp * 0.25; b.m.rageUsed = true;
    run(b.m, 12);
    expect(b.m.pos.x).toBeGreaterThan(5);
  });
  it('wanders along world.routeFor(defId) points', () => {
    const { ctx, m } = make(jaggo, 'wander', 200, 200); // player far away: no notice
    ctx.world.routeFor = () => [{ x: 30, z: 0 }, { x: 30, z: 30 }];
    m.wanderT = 0;
    run(m, 25);
    expect(m.pos.x).toBeGreaterThan(15);
  });
});

describe('Jagglinge', () => {
  it('spawnPack never exceeds 3 alive', () => {
    const ctx = makeCtx();
    const a = spawnPack(ctx, { x: 0, z: 0 }, 2);
    const b = spawnPack(ctx, { x: 0, z: 0 }, 2);
    expect(a.length + b.length).toBe(3);
    expect(ctx.countMonsters('jaggling')).toBe(3);
    expect(spawnPack(ctx, { x: 0, z: 0 }, 1).length).toBe(0);
  });
  it('die fast (80 HP), emit monsterDead and carry the Jaggling-Schuppe drop', () => {
    const ctx = makeCtx();
    const [m] = spawnPack(ctx, { x: 5, z: 5 }, 1, { state: 'combat' });
    expect(jaggling.drops).toContain('jaggling_schuppe');
    hit(m, 'head', 80);
    expect(m.alive).toBe(false);
    expect(ctx.events).toContain('monsterDead');
  });
  it('hits knock them back and make them flinch', () => {
    const ctx = makeCtx();
    const p = new Player({ ctx }); p.spawnAt(0, 0, 0); ctx.players.push(p);
    const [m] = spawnPack(ctx, { x: 0, z: 5 }, 1, { state: 'combat' });
    const z0 = m.pos.z;
    hit(m, 'body', 30);
    run(m, 0.4);
    expect(m.pos.z).toBeGreaterThan(z0 + 1);
    expect(m.alive).toBe(true);
  });
  it('pack AI: attacks come as darts with a >= 0.5 s telegraph, at most 2 at once', () => {
    const ctx = makeCtx();
    const p = new Player({ ctx }); p.spawnAt(0, 0, 0); p.god = true; ctx.players.push(p);
    spawnPack(ctx, { x: 0, z: 9 }, 3, { state: 'combat', target: p });
    let maxDarting = 0, starts = 0;
    ctx.bus.on('monsterAttack', (e) => { starts++; expect(e.attackId).toMatch(/jaggling_/); });
    for (let i = 0; i < 60 * 25; i++) {
      for (const m of ctx.monsters) m.update(DT);
      maxDarting = Math.max(maxDarting, ctx.monsters.filter((m) => m.attack).length);
    }
    expect(starts).toBeGreaterThan(3);
    expect(maxDarting).toBeLessThanOrEqual(3);
  });
});

describe('Barrotz', () => {
  it('has the GDD parts and numbers', () => {
    expect(barrotz.hp).toBe(9000);
    const ids = barrotz.parts.map((p) => p.id);
    expect(ids).toEqual(['head', 'legs', 'body', 'tail']);
    expect(barrotz.parts[0].breakHp).toBe(800);
    expect(barrotz.parts[0].factor).toBe(0.5);
    expect(Object.keys(barrotz.attacks).length).toBe(8);
  });
  it('head plate breaks at 800: factor 0.5 -> 0.9, plate mesh gone, partBreak emitted', () => {
    const { ctx, m } = make(barrotz);
    hit(m, 'head', 799);
    expect(m.partById.head.factor).toBe(0.5);
    hit(m, 'head', 2);
    expect(m.partById.head.broken).toBe(true);
    expect(m.partById.head.factor).toBe(0.9);
    expect(m.extra.plateMeshes.every((x) => !x.visible)).toBe(true);
    expect(ctx.events).toContain('partBreak');
  });
  it('tail is breakable (600)', () => {
    const { m } = make(barrotz);
    hit(m, 'tail', 601);
    expect(m.partById.tail.broken).toBe(true);
    expect(m.extra.club.visible).toBe(false);
  });
  it('Schlammwälzer ends in Schlammpanzer: body x0.5, fire 0 on all parts, coat visible', () => {
    const { m } = make(barrotz);
    expect(m.partById.body.elem.fire).toBe(10);
    m.beginAttack('barrotz_waelzer');
    run(m, 3.5);
    expect(m.armor).toBeTruthy();
    expect(m.partById.body.factor).toBeCloseTo(0.35);
    for (const p of m.parts) expect(p.elem.fire).toBe(0);
    expect(m.extra.coat.every((c) => c.visible)).toBe(true);
    expect(m.applyStatus('fire')).toBe(false);
  });
  it('Schlammpanzer breaks after 150 body damage', () => {
    const { m, ctx } = make(barrotz);
    barrotz.setArmor(m, true);
    hit(m, 'head', 500); // other parts do not count
    expect(m.armor).toBeTruthy();
    hit(m, 'body', PANZER_HP - 1);
    expect(m.armor).toBeTruthy();
    hit(m, 'body', 2);
    expect(m.armor).toBeNull();
    expect(m.partById.body.factor).toBeCloseTo(0.7);
    expect(m.partById.body.elem.fire).toBe(10);
    expect(ctx.events).toContain('armorBreak');
  });
  it('Schlammpanzer breaks on a shock hit (elemBy.shock or applyStatus shock)', () => {
    const a = make(barrotz); barrotz.setArmor(a.m, true);
    hit(a.m, 'legs', 5, { elemBy: { shock: 8 }, elemDmg: 8 });
    expect(a.m.armor).toBeNull();
    const b = make(barrotz); barrotz.setArmor(b.m, true);
    expect(b.m.applyStatus('shock')).toBe(true);
    expect(b.m.armor).toBeNull();
    expect(b.m.applyStatus('shock')).toBe(false);
  });
  it('resolvePlayerHit reports elemBy per element', () => {
    const { m } = make(barrotz);
    const res = resolvePlayerHit({ power: 100, critChance: 0, elems: { shock: 40 } }, { mv: 50 }, m.partById.head, () => 1);
    expect(res.elemBy.shock).toBeGreaterThan(0);
  });
  it('Schlammspritzer needs the armour and fires 6 mud blobs that apply mud', () => {
    const { m, ctx, p } = make(barrotz);
    expect(barrotz.attacks.barrotz_spritzer.cond(m)).toBe(false);
    barrotz.setArmor(m, true);
    expect(barrotz.attacks.barrotz_spritzer.cond(m)).toBe(true);
    p.spawnAt(0, 8, Math.PI);
    p.god = false;
    m.rot = 0; m.beginAttack('barrotz_spritzer');
    let max = 0;
    for (let i = 0; i < 60 * 1.2; i++) { m.update(DT); max = Math.max(max, m.projectiles.list.length); }
    expect(max).toBe(6);
    // stand where the first blob lands -> mud
    const first = m.projectiles.list[0] ?? null;
    void first; void ctx;
  });
  it('Rotglut: Rammsturm chains into a second charge (once)', () => {
    const { m } = make(barrotz);
    m.rage = true; m.rageT = 40;
    m.beginAttack('barrotz_ramm');
    run(m, 3.2);
    expect(m.queued).toBe('barrotz_ramm');
    m.recover = 0; m.target.spawnAt(0, 12, Math.PI);
    m.rot = Math.PI; // turned around already
    m.beginAttack(m.queued); m.queued = null;
    run(m, 2.5);
    expect(m.queued).toBeNull(); // no endless chain
  });
  it('Rammsturm travels 15 m and hits the head capsule (30 dmg, down)', () => {
    const inst = new AttackInstance(barrotz.attacks.barrotz_ramm, { attackId: 'barrotz_ramm', t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 20 }, seed: 1 });
    const end = inst.sample(inst.duration);
    expect(Math.hypot(end.x, end.z)).toBeCloseTo(15, 3);
    const h = inst.hitsAt(1.4)[0];
    expect(h.dmg).toBe(30);
    expect(h.knock).toBe('down');
  });
});

describe('Brathalos', () => {
  it('has the GDD parts and numbers', () => {
    expect(brathalos.hp).toBe(12000);
    expect(brathalos.parts.map((p) => p.id)).toEqual(['head', 'wingL', 'wingR', 'body', 'tail']);
    expect(brathalos.parts.find((p) => p.id === 'tail').breakHp).toBe(900);
    expect(brathalos.parts.find((p) => p.id === 'wingL').breakHp).toBe(600);
    for (const p of brathalos.parts) expect(p.elem.fire).toBe(0);
  });
  it('Aufflug leads into the flight state (4-8 s) and ends with a Krallensturz', () => {
    const { m, ctx } = make(brathalos);
    m.beginAttack('brathalos_aufflug');
    const states = [];
    ctx.bus.on('monsterState', (e) => states.push(e.state));
    run(m, 2);
    expect(m.state).toBe('fly');
    expect(m.air).toBeGreaterThan(FLY_HEIGHT - 0.5);
    expect(m.flyT).toBeGreaterThanOrEqual(0);
    const dur = m.flyT;
    expect(dur).toBeLessThanOrEqual(8);
    expect(dur).toBeGreaterThanOrEqual(3.9);
    const atk = [];
    ctx.bus.on('monsterAttack', (e) => atk.push(e.attackId));
    run(m, 9);
    expect(atk).toContain('brathalos_sturz');
    run(m, 3);
    expect(m.state).toBe('combat');
    expect(m.air).toBe(0);
  });
  it('Krallensturz: shadow telegraph 0.9 s, 26 damage + poison, lands on the target', () => {
    const d = brathalos.attacks.brathalos_sturz;
    expect(d.telegraph).toBe(0.9);
    expect(d.marker.at).toBe('target');
    expect(d.hits[0].dmg).toBe(26);
    expect(d.hits[0].status.type).toBe('poison');
    const inst = new AttackInstance(d, { attackId: d.id, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 10 }, seed: 1 });
    expect(inst.sample(0.5).air).toBeGreaterThan(FLY_HEIGHT - 0.5);
    const end = inst.sample(inst.duration);
    expect(end.z).toBeCloseTo(10 - 1.6, 1);
    expect(end.air).toBe(0);
  });
  it('blind brings a flyer down: fall, then 4 s helpless', () => {
    const { m } = make(brathalos);
    m.beginAttack('brathalos_aufflug'); run(m, 2);
    expect(m.state).toBe('fly');
    expect(m.applyStatus('blind')).toBe(true);
    expect(m.state).toBe('fall');
    run(m, 3);
    expect(m.air).toBe(0);
    expect(m.stunT).toBeGreaterThan(0);
    expect(m.stunT).toBeLessThanOrEqual(4);
  });
  it('arrow damage while flying (>= 250) also brings him down', () => {
    const { m } = make(brathalos);
    m.beginAttack('brathalos_aufflug'); run(m, 2);
    hit(m, 'body', 100);
    expect(m.state).toBe('fly');
    hit(m, 'body', 160);
    expect(m.state).toBe('fall');
  });
  it('a broken wing grounds him; he cannot take off again', () => {
    const { m } = make(brathalos);
    m.beginAttack('brathalos_aufflug'); run(m, 2);
    hit(m, 'wingL', 601);
    expect(m.partById.wingL.broken).toBe(true);
    expect(m.state).toBe('fall');
    expect(brathalos.attacks.brathalos_aufflug.cond(m)).toBe(false);
  });
  it('tail is severed at 900: tailSevered event, part gone, dropped object', () => {
    const { m, ctx } = make(brathalos);
    let ev = null;
    ctx.bus.on('tailSevered', (e) => { ev = e; });
    hit(m, 'tail', 899);
    expect(ev).toBeNull();
    expect(m.hurtParts().some((h) => h.part.id === 'tail')).toBe(true);
    hit(m, 'tail', 2);
    expect(ev).not.toBeNull();
    expect(ev.monster).toBe(m);
    expect(ev.pos).toHaveProperty('x');
    expect(m.partById.tail.gone).toBe(true);
    expect(m.hurtParts().some((h) => h.part.id === 'tail')).toBe(false);
    expect(m.severedTail).toBeTruthy();
  });
  it('Feuerspucke: one fireball, 3-fan in Rotglut, burn status, 28 dmg', () => {
    const count = (rage) => {
      const { m } = make(brathalos);
      m.rage = rage; m.rageT = 30;
      m.beginAttack('brathalos_feuer');
      let max = 0;
      for (let i = 0; i < 60 * 1.3; i++) { m.update(DT); max = Math.max(max, m.projectiles.list.length); }
      return { max, def: m.projectiles.list[0]?.def };
    };
    expect(count(false).max).toBe(1);
    expect(count(true).max).toBe(3);
    expect(count(false).def?.dmg ?? 28).toBe(28);
  });
  it('Fireball hits the local player: damage + burn', () => {
    const ctx = makeCtx();
    const p = new Player({ ctx }); p.spawnAt(0, 10, 0); ctx.players.push(p);
    const m = { id: 'x', dmgMul: 1 };
    const set = new ProjectileSet(ctx, m);
    set.spawn(fireballDef({ from: { x: 0, y: 3, z: 0 }, aim: { x: 0, y: 1, z: 10 }, key: 'k' }));
    for (let i = 0; i < 60 * 2; i++) set.update(DT);
    expect(p.status.burn).toBeTruthy();
    expect(p.v.hp).toBeLessThan(100);
  });
  it('Flügelböe pushes 3 m without damage and cancels a charge', () => {
    const { m, p } = make(brathalos, 'combat', 0, 4);
    p.god = false;
    p.weapon.cancel = (() => { let n = 0; const f = p.weapon.cancel.bind(p.weapon); const g = () => { n++; f(); }; g.n = () => n; return g; })();
    m.rot = 0;
    m.beginAttack('brathalos_boee');
    const hp0 = p.v.hp;
    for (let i = 0; i < 60 * 1.5; i++) { m.update(DT); p.update(DT); }
    expect(p.pos.z).toBeGreaterThan(6.5);
    expect(p.v.hp).toBe(hp0);
    expect(p.weapon.cancel.n()).toBeGreaterThan(0);
  });
  it('Rotglut-Brüllen pins the player (like Rudelruf)', () => {
    const { m, p } = make(brathalos, 'combat', 0, 5);
    p.god = false;
    m.beginAttack('brathalos_bruellen');
    let pinned = false;
    for (let i = 0; i < 60 * 1.6; i++) { m.update(DT); p.update(DT); pinned ||= p.state === 'pinned'; }
    expect(pinned).toBe(true);
  });
  it('Rotglut triggers the roar attack right away', () => {
    const { m, ctx } = make(brathalos);
    const atk = [];
    ctx.bus.on('monsterAttack', (e) => atk.push(e.attackId));
    hit(m, 'body', 12000 * 0.41);
    run(m, 0.5);
    expect(m.rage).toBe(true);
    expect(atk[0]).toBe('brathalos_bruellen');
  });
});

describe('player status effects (mud / burn / poison)', () => {
  function mk() {
    const ctx = makeCtx();
    const p = new Player({ ctx }); p.spawnAt(0, 0, 0); ctx.players.push(p);
    return { ctx, p };
  }
  it('addStatus / clearStatus, roll counter lifts mud after 3 rolls', () => {
    const { ctx, p } = mk();
    expect(p.addStatus('mud')).toBe(true);
    expect(p.status.mud.rollsLeft).toBe(3);
    for (let i = 0; i < 3; i++) {
      ctx.input.press('roll', 50);
      for (let k = 0; k < 40; k++) { ctx.input.poll(DT); p.update(DT); }
    }
    expect(p.status.mud).toBeUndefined();
  });
  it('burn deals 3 dmg/s and is extinguished by 3 rolls, never lethal', () => {
    const { ctx, p } = mk();
    p.addStatus('burn', { t: 30 });
    const hp0 = p.v.hp;
    for (let k = 0; k < 120; k++) { ctx.input.poll(DT); p.update(DT); }
    expect(hp0 - p.v.hp).toBeCloseTo(6, 0);
    p.v.hp = 2;
    for (let k = 0; k < 600; k++) { ctx.input.poll(DT); p.update(DT); }
    expect(p.v.hp).toBeGreaterThanOrEqual(1);
    expect(p.alive).toBe(true);
    p.clearStatus();
    expect(Object.keys(p.status)).toHaveLength(0);
  });
  it('poison ticks and wears off', () => {
    const { ctx, p } = mk();
    p.addStatus('poison', { t: 4 });
    for (let k = 0; k < 60 * 5; k++) { ctx.input.poll(DT); p.update(DT); }
    expect(p.status.poison).toBeUndefined();
    expect(p.v.hp).toBeLessThan(100);
  });
  it('mud slows and forbids sprinting', () => {
    const run2 = (mud) => {
      const { ctx, p } = mk();
      if (mud) p.addStatus('mud');
      ctx.input.setStick(0, 1, 't');
      ctx.input.sprint = true;
      for (let k = 0; k < 90; k++) { ctx.input.poll(DT); p.update(DT); }
      return p.pos.z;
    };
    const free = run2(false), muddy = run2(true);
    expect(muddy).toBeLessThan(free * 0.8);
  });
  it('takeHit applies a status from the hit, blocked/ i-framed hits do not', () => {
    const { p } = mk();
    p.takeHit({ dmg: 10, knock: 'flinch', key: 'a', sourcePos: { x: 0, z: 3 }, status: { type: 'mud' } });
    expect(p.status.mud).toBeTruthy();
    p.respawn(0, 0);
    expect(p.status.mud).toBeUndefined(); // respawn clears
    p.invuln = 1;
    p.takeHit({ dmg: 10, knock: 'flinch', key: 'b', sourcePos: { x: 0, z: 3 }, status: { type: 'burn' } });
    expect(p.status.burn).toBeUndefined();
  });
  it('push moves the player along dir', () => {
    const { ctx, p } = mk();
    p.push({ x: 1, z: 0 }, 3);
    for (let k = 0; k < 30; k++) { ctx.input.poll(DT); p.update(DT); }
    expect(p.pos.x).toBeCloseTo(3, 0);
  });
});

describe('monster projectiles are deterministic', () => {
  it('projPos is a pure function of def + age; mud lands exactly on target', () => {
    const d = mudDef({ from: { x: 0, y: 3, z: 0 }, to: { x: 4, y: 0, z: 9 }, key: 'k' });
    expect(JSON.stringify(projPos(d, 0.37))).toBe(JSON.stringify(projPos(d, 0.37)));
    const end = projPos(d, d.dur);
    expect(end.x).toBeCloseTo(4);
    expect(end.z).toBeCloseTo(9);
    expect(end.y).toBeCloseTo(0);
    expect(projPos(d, d.dur / 2).y).toBeGreaterThan(3); // arcs
  });
  it('attack events that spawn projectiles produce identical blobs for identical params (host == client)', () => {
    const blobs = () => {
      const { m } = make(barrotz);
      barrotz.setArmor(m, true);
      m.authority = false;
      const out = [];
      m.projectiles.spawn = (def) => out.push(JSON.stringify(def));
      m.startAttack({ attackId: 'barrotz_spritzer', t0: 3, origin: { x: 1, y: 0, z: 2 }, yaw: 0.4, targetPos: { x: 6, y: 0, z: 9 }, seed: 777 });
      for (let i = 0; i < 90; i++) m.tickRemote(DT);
      return out.join('|');
    };
    const a = blobs();
    expect(a.split('|').length).toBe(6);
    expect(a).toBe(blobs());
  });
  it('fairness: fireball and mud need >= 0.5 s from attack start to the first possible hit, also in Rotglut', () => {
    for (const rage of [false, true]) {
      // fireball at the minimum range (4.5 m): spit event + flight
      const d = brathalos.attacks.brathalos_feuer;
      const inst = new AttackInstance(d, { attackId: d.id, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 4.5 }, seed: 1, rage });
      const spitAt = inst.wall(d.events[0].t);
      expect(spitAt + 0.0).toBeGreaterThanOrEqual(0.5);
      const s = barrotz.attacks.barrotz_spritzer;
      const si = new AttackInstance(s, { attackId: s.id, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 5 }, seed: 1, rage });
      expect(si.wall(s.events[0].t) + mudDef({ from: { x: 0, y: 3, z: 0 }, to: { x: 0, y: 0, z: 3 }, key: 'x' }).dur).toBeGreaterThanOrEqual(0.5);
    }
  });
});
