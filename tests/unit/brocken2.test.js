import { describe, it, expect } from 'vitest';
import { make, DT } from './p3helpers.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { getMonsterDef } from '../../src/game/monsters/index.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { encodeAtk, decodeAtk, encodeMonster, decodeMonster } from '../../src/net/protocol.js';

const { chains: _c, phases: _p, teachAttack: _t, stamina: _s, flinchDmg: _f, ...base } = getMonsterDef('jaggo'); // Framework-Test: Jaggo ohne B2-Felder
const atk = (id, o = {}) => ({ id, range: [0, 30], weight: 1, cooldown: 0, telegraph: 0.6, duration: 1.0, hits: [{ t0: 0.6, t1: 0.8, shape: 'sphere', at: [0, 1, 2], radius: 1, dmg: 1 }], ...o });
function mk(over = {}, state = 'combat') {
  const def = { ...base, hp: 100000, attacks: { a: atk('a'), b: atk('b'), c: atk('c') }, ...over };
  return make(def, state, 0, 8);
}
const run = (ctx, m, secs) => { for (let i = 0; i < secs / DT; i++) { ctx.players.forEach((q) => q.pos.set(0, 0, 8)); m.update(DT); } };
function collect(m, ctx, secs) {
  const out = [];
  const off = ctx.bus.on('monsterAttack', (e) => out.push(e));
  run(ctx, m, secs);
  off();
  return out;
}

describe('Brocken 2.0', () => {
  it('ohne def-Daten: keine neuen params', () => {
    const { ctx, m } = mk();
    const ev = collect(m, ctx, 6);
    expect(ev.length).toBeGreaterThan(0);
    for (const e of ev) { expect(e.tgMul).toBeUndefined(); expect(e.chainIdx).toBeUndefined(); expect(e.teach).toBeUndefined(); }
  });

  it('Ketten: max 3 Glieder, End-recover >= 1.0, kurze Pause, deterministisch', () => {
    const chains = { a: [{ atk: 'a', w: 1 }] };
    const seqs = [];
    for (let k = 0; k < 2; k++) {
      const { ctx, m } = mk({ chains, attacks: { a: atk('a', { tgVar: false }) } });
      const ev = collect(m, ctx, 20);
      seqs.push(ev.map((e) => `${e.attackId}:${e.chainIdx ?? 0}:${e.seed}`));
      let len = 0, maxLen = 0;
      for (const e of ev) { len = (e.chainIdx ?? 0) === 0 ? 1 : len + 1; maxLen = Math.max(maxLen, len); }
      expect(maxLen).toBe(3);
      const l1 = ev.find((e) => e.chainIdx === 1), l0 = ev[ev.indexOf(l1) - 1];
      expect(l1.t0 - l0.t0 - 1.0).toBeLessThan(0.45);
      expect(l1.t0 - l0.t0 - 1.0).toBeGreaterThanOrEqual(0.09);
      const l2 = ev.find((e) => e.chainIdx === 2), nxt = ev[ev.indexOf(l2) + 1];
      expect(nxt.t0 - l2.t0 - 1.0).toBeGreaterThanOrEqual(0.99);
    }
    expect(seqs[0]).toEqual(seqs[1]);
  });

  it('Replay (authority=false): gleiche Instanz, tgMul wirkt, min 0.5 s, attackStart-Event', () => {
    const { ctx, m } = mk({ attacks: { a: atk('a', { telegraph: 0.55 }) } });
    const g = new Monster(m.def, ctx, { id: 'g', authority: false, seed: 3 });
    const params = { attackId: 'a', t0: 1, origin: { x: 0, y: 0, z: 0 }, yaw: 0, seed: 9, tgMul: 0.85, chainIdx: 1 };
    const i1 = g.startAttack(params), i2 = new AttackInstance(m.def.attacks.a, params);
    expect(i1.tgWall).toBe(i2.tgWall);
    expect(i1.tgWall).toBeGreaterThanOrEqual(0.5);
    expect(new AttackInstance(m.def.attacks.a, { ...params, tgMul: 1.25 }).tgWall).toBeCloseTo(0.6875, 3);
    expect(new AttackInstance(m.def.attacks.a, { ...params, rage: true }).tgWall).toBeGreaterThanOrEqual(0.5);
    const seen = [];
    ctx.bus.on('attackStart', (e) => seen.push(e));
    g.startAttack({ ...params, teach: true });
    expect(seen[0].chainIdx).toBe(1);
    expect(seen[0].teach).toBe(true);
  });

  it('Timing-Variation: tgMul in [0.85,1.25]; tgVar:false schaltet ab', () => {
    const { ctx, m } = mk({ brocken2: true, attacks: { a: atk('a'), b: atk('b', { tgVar: false, weight: 0 }) } });
    const ev = collect(m, ctx, 15);
    const mul = ev.filter((e) => e.tgMul !== undefined && !e.teach).map((e) => e.tgMul);
    expect(mul.length).toBeGreaterThan(0);
    for (const x of mul) { expect(x).toBeGreaterThanOrEqual(0.85); expect(x).toBeLessThanOrEqual(1.25); }
    expect(m.beginAttack('b').params.tgMul).toBeUndefined();
  });

  it('Abbruch der Kette bei glitchCounter', () => {
    const chains = { a: [{ atk: 'a', w: 1 }] };
    const { ctx, m } = mk({ chains, attacks: { a: atk('a', { tgVar: false }) } });
    m.beginAttack('a');
    run(ctx, m, 0.5);
    ctx.bus.emit('glitchCounter', { player: ctx.players[0] });
    const ev = [];
    ctx.bus.on('monsterAttack', (e) => ev.push(e));
    run(ctx, m, 1.2);
    expect(m.chainNext).toBeNull();
    expect(ev.some((e) => e.chainIdx)).toBe(false);
  });

  it('Betäubung beendet Kette', () => {
    const { m } = mk({ chains: { a: [{ atk: 'a', w: 1 }] } });
    m.chainNext = { id: 'a', idx: 1 };
    m._addStun(1e6);
    expect(m.chainNext).toBeNull();
  });

  it('Erschöpfung -> tired, Event, danach stamina 60', () => {
    const { ctx, m } = mk({ stamina: true, attacks: { a: atk('a', { stam: 100 }) } });
    const ev = [];
    ctx.bus.on('monsterTired', (e) => ev.push(e.on));
    run(ctx, m, 3);
    expect(m.tired).toBe(true);
    expect(m.snapshot().flags.tired).toBe(true);
    expect(ev[0]).toBe(true);
    run(ctx, m, 6.5);
    expect(ev).toContain(false);
    expect(m.stamina).toBeGreaterThanOrEqual(0);
  });

  it('Phasenwechsel: Cue-Event, special wird als nächster Angriff gestartet', () => {
    const { ctx, m } = mk({ phases: [{ at: 0.7, name: 'Wut', cue: 'x', special: 'c' }], attacks: { a: atk('a'), c: atk('c', { weight: 0, phase: 1 }) } });
    const ph = [], ev = [];
    ctx.bus.on('monsterPhase', (e) => ph.push(e));
    ctx.bus.on('monsterAttack', (e) => ev.push(e));
    expect(m._chooseAttack(8)?.id).toBe('a');
    m.hp = m.maxHp * 0.65;
    run(ctx, m, 4);
    expect(ph).toHaveLength(1);
    expect(ph[0].idx).toBe(1);
    expect(m.snapshot().phase).toBe(1);
    expect(ev.some((e) => e.attackId === 'c')).toBe(true);
  });

  it('needsBroken / lockedByBreak', () => {
    const { m } = mk({ attacks: { a: atk('a', { lockedByBreak: 'head' }), b: atk('b', { needsBroken: 'head' }) } });
    const ids = () => { const s = new Set(); for (let i = 0; i < 40; i++) s.add(m._chooseAttack(8)?.id); return [...s]; };
    expect(ids()).toEqual(['a']);
    m.partById.head.broken = true;
    expect(ids()).toEqual(['b']);
  });

  it('Lehrangriff: erster Angriff teachAttack, tgMul 1.4, keine Kette, Event', () => {
    const { ctx, m } = mk({ teachAttack: 'b', chains: { b: [{ atk: 'a', w: 1 }] }, attacks: { a: atk('a'), b: atk('b') } });
    const ev = [], te = [];
    ctx.bus.on('monsterAttack', (e) => ev.push(e));
    ctx.bus.on('teach', (e) => te.push(e));
    run(ctx, m, 12);
    expect(ev[0].attackId).toBe('b');
    expect(ev[0].tgMul).toBe(1.4);
    expect(ev[0].teach).toBe(true);
    expect(te[0].attackId).toBe('b');
    expect(ev[1].chainIdx).toBeUndefined();
    expect(ev.slice(1).every((e) => !e.teach)).toBe(true);
  });

  it('Flinch in Telegraph-Phase, max 1x/8 s', () => {
    const { ctx, m } = mk({ flinchDmg: 50, attacks: { a: atk('a', { telegraph: 1.0, duration: 1.5 }) } });
    const f = [];
    ctx.bus.on('monsterFlinch', () => f.push(1));
    m.beginAttack('a');
    run(ctx, m, 0.2);
    m.applyDamage({ dmg: 60, partId: 'body', attackerId: 'p1' });
    expect(f).toHaveLength(1);
    expect(m.attack).toBeNull();
    m.beginAttack('a');
    m.applyDamage({ dmg: 60, partId: 'body', attackerId: 'p1' });
    expect(f).toHaveLength(1);
  });

  it('Anti-Rollen-Spam: punishRoll-Gewicht x2, Telegraph <= 1.1 s', () => {
    const { m, p } = mk({ brocken2: true, attacks: { a: atk('a', { punishRoll: true, telegraph: 0.8 }) } });
    for (let i = 0; i < 4; i++) { p.state = 'roll'; m._b2Tick(DT); p.state = 'free'; m._b2Tick(DT); m.time += 0.5; }
    expect(m._rollCount()).toBe(4);
    expect(m._weightOf(m.def.attacks.a, 8)).toBe(2);
    const t = m.beginAttack('a').params.tgMul;
    expect(0.8 * t).toBeLessThanOrEqual(1.1 + 1e-9);
    expect(t).toBeGreaterThanOrEqual(1);
  });

  it('Aggro-Budget: zweiter Brocken wartet 0.6 s', () => {
    const { ctx, m, p } = mk({ brocken2: true });
    const m2 = new Monster(m.def, ctx, { id: 'm2', x: 3, z: 0, state: 'combat', seed: 4 });
    m2.target = p;
    m.beginAttack('a');
    expect(m2._aggroOk()).toBe(false);
    expect(m._aggroOk()).toBe(true);
  });

  it('Retarget: Event + recover >= 0.5', () => {
    const { ctx, m, p } = mk({ brocken2: true });
    const q = new p.constructor({ ctx, id: 'p2' });
    q.spawnAt(1, 1, 0);
    ctx.players.push(q);
    m.target = p;
    p.pos.set(0, 0, 60);
    const ev = [];
    ctx.bus.on('retarget', (e) => ev.push(e));
    for (let i = 0; i < 20 && !ev.length; i++) { m.target = p; m.recover = 0; m._pickTarget(); } // 15 % Zufallswahl
    expect(ev[0].playerId).toBe('p2');
    expect(m.recover).toBeGreaterThanOrEqual(0.5);
  });

  it('encodeAtk/decodeAtk Roundtrip mit neuen Feldern und Defaults', () => {
    const params = { attackId: 'a', t0: 3.5, origin: { x: 1, y: 0, z: 2 }, yaw: 1.2, targetPos: { x: 4, y: 0, z: 5 }, seed: 77, rage: true, tgMul: 1.234, chainIdx: 2, teach: true };
    const d = decodeAtk(encodeAtk('m1', params, 10));
    expect(d.params).toMatchObject({ tgMul: 1.234, chainIdx: 2, teach: true, rage: true, attackId: 'a' });
    const plain = decodeAtk(encodeAtk('m1', { ...params, tgMul: undefined, chainIdx: 0, teach: false }, 10)).params;
    expect(plain.tgMul).toBeUndefined(); expect(plain.chainIdx).toBeUndefined(); expect(plain.teach).toBeUndefined();
    const s = decodeMonster(encodeMonster({ id: 'x', def: 'jaggo', x: 0, y: 0, z: 0, rot: 0, state: 'combat', hpPct: 1, tired: true, phase: 2, atk: 0, parts: [] }));
    expect(s.tired).toBe(true); expect(s.phase).toBe(2);
  });
});
