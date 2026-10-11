import { describe, it, expect, beforeEach } from 'vitest';
import { MUTATORS, resolveMods, cleanMutatorIds, rewardLabel } from '../../src/data/mutators.js';
import { getQuest, quests } from '../../src/data/quests.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { AttackInstance, MIN_TELEGRAPH } from '../../src/game/monsters/attack.js';
import { jaggo } from '../../src/game/monsters/jaggo.js';
import { Player } from '../../src/game/player.js';
import { createBus } from '../../src/core/events.js';
import { createInput } from '../../src/input/input.js';
import { createRng } from '../../src/core/rng.js';
import { time } from '../../src/core/time.js';
import { HuntInventory } from '../../src/game/inventory.js';
import { ItemSystem } from '../../src/game/items.js';
import { createVitals, tickStamina, spendStamina } from '../../src/game/vitals.js';
import { fieldStudyQuest } from '../../src/meta/fieldstudy.js';
import { QuestBoardState } from '../../src/net/questboard.js';

const DT = 1 / 60;
function ctxOf(mods) {
  return {
    world: { heightAt: () => 0, collide: () => {}, nestPoint: { x: 40, z: 0 } },
    monsters: [], players: [], bus: createBus(), input: createInput(), rng: createRng(1), cameraYaw: 0,
    fx: { number() {}, spark() {}, shake() {}, flash() {}, glitch() {}, marker() {}, clearMarker() {} },
    playerHit() {}, respawn() {}, countMonsters: () => 0, spawnMonster() {}, mods: resolveMods(mods),
  };
}
function mk(mods) {
  const ctx = ctxOf(mods);
  const m = new Monster(jaggo, ctx, { id: 'jaggo', x: 0, z: 0, state: 'combat', seed: 7 });
  ctx.monsters.push(m);
  const p = new Player({ ctx }); p.spawnAt(0, 8, Math.PI); ctx.players.push(p); m.target = p;
  return { ctx, m, p };
}
beforeEach(() => time.reset());

describe('resolveMods', () => {
  it('leer = neutral', () => { expect(resolveMods([])).toMatchObject({ monster: {}, player: {}, hunt: {}, reward: 1 }); });
  it('Multiplikatoren multiplizieren, Flags OR, reward multipliziert', () => {
    const r = resolveMods(['overflow', 'uebertaktet']);
    expect(r.monster.dmgMul).toBeCloseTo(1.4); expect(r.monster.speedMul).toBeCloseTo(1.25); expect(r.monster.recoverMul).toBeCloseTo(0.7);
    expect(r.reward).toBeCloseTo(1.3 * 1.3, 3);
    const r2 = resolveMods(['rotglut', 'fehlende_texturen']);
    expect(r2.monster.rageAlways).toBe(true); expect(r2.monster.hideColorCues).toBe(true); expect(r2.monster.hpMul).toBe(1.4);
    expect(resolveMods(['kein_undo']).player.healItems).toBe(false);
  });
  it('unbekannte/doppelte IDs fliegen raus', () => {
    expect(cleanMutatorIds(['overflow', 'overflow', 'nix', 5])).toEqual(['overflow']);
    expect(cleanMutatorIds(['speicherleck', 'overflow', 'kein_undo'])).toHaveLength(2);
  });
  it('Belohnungs-Label', () => { expect(rewardLabel(MUTATORS.overflow)).toBe('+30 % Beute & RP'); });
});

describe('Monster-Hooks', () => {
  it('speedMul / dmgMul wirken auf Brocken, nicht auf Kleinvieh', () => {
    const base = mk([]).m, fast = mk(['uebertaktet', 'overflow']).m;
    expect(fast.speedMul / base.speedMul).toBeCloseTo(1.25);
    expect(fast.dmgMul / base.dmgMul).toBeCloseTo(1.4);
    fast.minor = true; expect(fast.speedMul).toBe(base.speedMul);
  });
  it('Telegraph nie unter MIN_TELEGRAPH, auch mit telegraphMul', () => {
    const def = { id: 'x', range: [0, 9], telegraph: 0.6, duration: 1.4, hits: [] };
    const inst = new AttackInstance(def, { attackId: 'x', t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 5 }, seed: 1, tgMul: 0.2 });
    expect(inst.tgWall).toBeGreaterThanOrEqual(MIN_TELEGRAPH);
    const { m } = mk([]); m.ctx.mods.monster.telegraphMul = 0.1;
    m.beginAttack(Object.keys(jaggo.attacks)[0]);
    if (m.attack) expect(m.attack.inst.tgWall).toBeGreaterThanOrEqual(MIN_TELEGRAPH);
  });
  it('regenPct heilt erst nach Pause ohne Treffer', () => {
    const { m } = mk(['speicherleck']);
    m.hp = m.maxHp * 0.5; m.applyDamage({ dmg: 1, elemDmg: 0, partId: m.parts[0].id, blunt: 0 });
    const h0 = m.hp;
    for (let i = 0; i < 60; i++) m.mutatorTick(DT);
    expect(m.hp).toBe(h0); // 1 s nach Treffer: noch nichts
    for (let i = 0; i < 600; i++) m.mutatorTick(DT);
    expect(m.hp).toBeGreaterThan(h0);
    expect(m.hp - h0).toBeLessThan(m.maxHp * 0.15);
    const o = mk([]).m; o.hp = 10; for (let i = 0; i < 600; i++) o.mutatorTick(DT); expect(o.hp).toBe(10);
  });
  it('rageAlways / hideColorCues liegen als Flags vor', () => {
    expect(mk(['rotglut']).m.mm.rageAlways).toBe(true);
    expect(mk(['fehlende_texturen']).m.mm.hideColorCues).toBe(true);
  });
  it('lagSpike (Rubberband) ist deterministisch', () => {
    const run = () => {
      const { m } = mk(['lag_spitze']); m.attack = null; m.chainNext = null; m.recover = 0;
      const z = []; for (let i = 0; i < 1500; i++) { m.mutatorTick(DT); z.push(m.pos.z); } return z;
    };
    const a = run(); expect(a[1499]).toBeGreaterThan(0); expect(JSON.stringify(a)).toBe(JSON.stringify(run()));
  });
});

describe('Sichtbare Mutatoren', () => {
  it('Feldstudie-Quest traegt Mutatoren bis in ctx.mods.monster', () => {
    const q = fieldStudyQuest(new Date('2026-10-07'));
    expect(q.mutators.length).toBeGreaterThan(0);
    const mods = resolveMods(q.mutators); expect(mods.ids).toEqual(q.mutators);
    expect(Object.keys(mods.monster).length + Object.keys(mods.player).length).toBeGreaterThan(0);
    const { m } = mk(q.mutators); expect(m.mm).toBeTruthy();
  });
  it('Speicherleck heilt in 10 s ohne Treffer ~4 % maxHp (0,4 %/s), auch im Flug', () => {
    for (const st of ['combat', 'fly']) {
      const { m } = mk(['speicherleck']); m.state = st; m.hp = m.maxHp * 0.5; m._sinceHit = 5;
      for (let i = 0; i < 600; i++) m.mutatorTick(DT);
      expect(m.hp - m.maxHp * 0.5).toBeGreaterThanOrEqual(m.maxHp * 0.035); expect(m.hp - m.maxHp * 0.5).toBeLessThan(m.maxHp * 0.05);
    }
  });
  it('Speicherleck-FX: gruene Zahl + sfx + mutfx', () => {
    const { ctx, m } = mk(['speicherleck']); const nums = [], ev = [];
    ctx.fx.number = (p, t, k) => nums.push([t, k]); ctx.bus.on('mutfx', (e) => ev.push(e.kind));
    m.hp = m.maxHp * 0.5; m._sinceHit = 5; for (let i = 0; i < 180; i++) m.mutatorTick(DT);
    expect(nums.length).toBeGreaterThanOrEqual(2); expect(nums[0][1]).toBe('mheal'); expect(ev).toContain('heal');
  });
  it('Lag-Spitze: Vorwarnung (Marker) vor dem Sprung, Sprung zieht an den Spieler ran', () => {
    const { ctx, m, p } = mk(['lag_spitze']); const marks = []; ctx.fx.marker = (id, pos) => marks.push(pos);
    p.pos.z = 30; m.chainNext = null; m.attack = null; m.recover = 0;
    let warned = -1, jumped = -1; const d0 = Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z);
    for (let i = 0; i < 900 && jumped < 0; i++) {
      const c = m.lagCount ?? 0; m.mutatorTick(DT);
      if (marks.length && warned < 0) warned = i;
      if ((m.lagCount ?? 0) > c) jumped = i;
    }
    expect(warned).toBeGreaterThan(0); expect(jumped - warned).toBeGreaterThanOrEqual(25); // >= ~0,45 s Vorwarnung
    expect(Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z)).toBeLessThan(d0 - 2);
    expect(m.recover).toBeLessThanOrEqual(0.1);
  });
  it('Lag-Spitze: nah am Ziel springt er in die Flanke, nie in den Spieler', () => {
    const { m, p } = mk(['lag_spitze']); m.chainNext = null; m.attack = null; m.recover = 0; p.pos.z = 4;
    for (let i = 0; i < 900 && !m.lagCount; i++) m.mutatorTick(DT);
    expect(m.lagCount).toBe(1);
    const d = Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z); expect(d).toBeGreaterThanOrEqual(m.bodyRadius + 1.5);
    expect(Math.abs(m.pos.x)).toBeGreaterThan(1.5); // seitlich versetzt
  });
  it('Lag-Spitze: nie waehrend eines Angriffs, Angriff bricht Vorwarnung ab', () => {
    const { m, p } = mk(['lag_spitze']); p.pos.z = 30; m.chainNext = null; m.recover = 0; m.attack = null;
    let inWarn = false;
    for (let i = 0; i < 900; i++) { m.mutatorTick(DT); if (m._lagWarn) { inWarn = true; break; } }
    expect(inWarn).toBe(true);
    m.attack = { inst: {} }; const z0 = m.pos.z, n0 = m.lagCount ?? 0;
    for (let i = 0; i < 120; i++) m.mutatorTick(DT);
    expect(m._lagWarn).toBeNull(); expect(m.pos.z).toBe(z0); expect(m.lagCount ?? 0).toBe(n0);
  });
});

describe('Spieler-Hooks', () => {
  it('Kein Undo: Heil-Item wird nicht verbraucht', () => {
    const ctx = ctxOf(['kein_undo']); ctx.toast = () => {}; ctx.spawnEffect = () => {};
    const p = new Player({ ctx }); p.spawnAt(0, 0, 0); ctx.players.push(p);
    const inv = new HuntInventory({ brought: [{ id: 'flickbrause', n: 3 }], free: {} });
    const sys = new ItemSystem(ctx, p, inv);
    p.v.hp = 40; sys.request();
    for (let i = 0; i < 180; i++) { ctx.input.poll(DT); sys.update(DT); p.update(DT); }
    expect(inv.count('flickbrause')).toBe(3);
    expect(p.v.hp).toBeLessThanOrEqual(40);
  });
  it('staminaMul bremst Puste-Regeneration', () => {
    const a = createVitals(), b = createVitals(); b.regenMul = 0.5;
    for (const v of [a, b]) { spendStamina(v, 50); for (let i = 0; i < 60; i++) tickStamina(v, DT); }
    expect(a.stamina).toBeGreaterThan(b.stamina);
  });
});

describe('Rotglut-Preset = altes Verhalten', () => {
  it('hpMul 1,4, Dauerwut, Beute x2 (quest.matMul aus dem Mutator)', () => {
    const r = resolveMods(getQuest('jaggo_rotglut').mutators);
    expect(r.monster.hpMul).toBe(1.4); expect(r.monster.rageAlways).toBe(true); expect(r.reward).toBe(2); expect(getQuest("jaggo_rotglut").matMul).toBe(2);
    for (const id of ['jaggo_rotglut', 'barrotz_rotglut', 'brathalos_rotglut']) expect(quests[id].mutators).toEqual(['rotglut']);
  });
});

describe('Auftragsbrett trägt Mutatoren', () => {
  it('post -> join -> start enthält bereinigte Mutatoren', () => {
    const st = new QuestBoardState();
    st.apply('a', { a: 'post', questId: 'jaggo', mutators: ['overflow', 'nix', 'kein_undo', 'speicherleck'] });
    expect(st.posts[0].mutators).toEqual(['overflow', 'kein_undo']);
    st.apply('b', { a: 'join', postId: st.posts[0].postId });
    expect(st.snapshot().posts[0].mutators).toEqual(['overflow', 'kein_undo']);
    st.apply('a', { a: 'ready', r: true });
    const r = st.apply('b', { a: 'ready', r: true });
    expect(r.start.mutators).toEqual(['overflow', 'kein_undo']);
  });
});
