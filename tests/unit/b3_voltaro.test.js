import { describe, it, expect } from 'vitest';
import { make, DT } from './p3helpers.js';
import { Player } from '../../src/game/player.js';
import { monsters } from '../../src/game/monsters/index.js';
import { voltaro, chainTargets, isGrounded } from '../../src/game/monsters/voltaro.js';

const def = { ...voltaro, hp: 1e8 };
const spy = (p) => { const hits = []; const o = p.takeHit.bind(p); p.takeHit = (h) => { hits.push({ dmg: h.dmg, attackId: h.attackId }); return o(h); }; return hits; };
const rodMock = (ctx, list) => {
  const rods = list.map((r, i) => ({ id: `rod${i}`, x: r[0], z: r[1], alive: true }));
  const destroyed = [];
  ctx.interact = {
    rods: () => rods.filter((r) => r.alive),
    destroyRod: (id) => { const r = rods.find((q) => q.id === id); if (!r?.alive) return false; r.alive = false; destroyed.push(id); ctx.bus.emit('rodDestroyed', { id }); return true; },
  };
  return destroyed;
};
const run = (m, ctx, secs, fn) => { for (let i = 0; i < secs / DT; i++) { fn?.(i); m.update(DT); } };
const addPlayer = (ctx, x, z) => { const p = new Player({ ctx, id: 'q' + ctx.players.length }); p.spawnAt(x, z, Math.PI); ctx.players.push(p); return p; };

describe('Voltaro: Definition', () => {
  it('Registry, Werte, Teile, Brocken 2.0', () => {
    expect(monsters.voltaro).toBe(voltaro);
    expect(voltaro.hp).toBe(22000);
    expect(voltaro.scale).toBe(2.4);
    expect(voltaro.glitchSpots).toEqual(['antennenkamm', 'spulen']);
    const ids = voltaro.parts.map((p) => p.id);
    for (const id of ['antennenkamm', 'prankeL', 'prankeR', 'spulen', 'tail', 'kopf', 'koerper']) expect(ids).toContain(id);
    const bp = (id) => voltaro.parts.find((p) => p.id === id);
    expect(bp('antennenkamm').breakHp).toBe(900);
    expect(bp('prankeL').breakHp).toBe(700);
    expect(bp('tail').breakHp).toBe(1000);
    expect(bp('spulen').factor).toBe(0.8);
    expect(bp('kopf').elem).toMatchObject({ fire: 20, rost: 20, shock: 0 });
    expect(voltaro.phases[0].at).toBe(0.4);
    expect(voltaro.teachAttack).toBe('voltaro_pranken');
    for (const a of Object.values(voltaro.attacks)) { expect(a.cue).toBeTruthy(); expect(a.telegraph).toBeGreaterThanOrEqual(0.5); if (a.hits?.length) expect(a.audit?.length).toBeGreaterThan(0); }
    expect(voltaro.attacks.voltaro_pranken.tempo).toBe(1.25);
  });
  it('Schwächen: Feuer nur ungeladen; Snapshot enthält Ladung', () => {
    const { ctx, m } = make(def, 'combat');
    expect(m.partById.kopf.elem.fire).toBe(20);
    m.charge = 60; run(m, ctx, 0.1);
    expect(m.partById.kopf.elem.fire).toBe(0);
    m.charge = 10; run(m, ctx, 0.1);
    expect(m.partById.kopf.elem.fire).toBe(20);
    expect(m.snapshot().flags).toMatchObject({ charge: 10, over: false });
  });
});

describe('Voltaro: Ladung, Überladen, Moveset', () => {
  it('Ladung 100 -> Überladen 60 s, +30 % Tempo, Blitz-Moveset', () => {
    const { ctx, m } = make(def, 'combat', 0, 9);
    const base = m.speedMul;
    const atk = [];
    ctx.bus.on('monsterAttack', (e) => atk.push(e.attackId));
    m.charge = 99.99; m._taught = true;
    run(m, ctx, 0.2, () => ctx.players.forEach((q) => q.pos.set(0, 0, 9)));
    expect(m.over).toBeGreaterThan(55);
    expect(m.speedMul).toBeCloseTo(base * 1.3, 5);
    run(m, ctx, 40, () => ctx.players.forEach((q) => q.pos.set(0, 0, 9)));
    expect(m.over).toBeGreaterThan(0);
    expect(atk.some((a) => ['voltaro_kettenblitz', 'voltaro_donnerschlag', 'voltaro_plasma'].includes(a))).toBe(true);
    expect(m.snapshot().flags.over).toBe(true);
  });
  it('ohne Überladen keine Blitzangriffe', () => {
    const { ctx, m } = make(def, 'combat', 0, 7);
    const atk = [];
    ctx.bus.on('monsterAttack', (e) => atk.push(e.attackId));
    run(m, ctx, 25, () => { ctx.players.forEach((q) => q.pos.set(0, 0, 7)); m.charge = Math.min(m.charge, 30); });
    expect(atk.length).toBeGreaterThan(2);
    expect(atk.filter((a) => /kettenblitz|donner|plasma/.test(a))).toEqual([]);
  });
  it('Überladen läuft aus -> erschöpft', () => {
    const { ctx, m } = make(def, 'combat', 0, 40);
    m.charge = 100; run(m, ctx, 0.1);
    m.over = 0.05; run(m, ctx, 0.2);
    expect(m.over).toBe(0);
    expect(m.charge).toBe(0);
    expect(m.tired).toBe(true);
  });
  it('Kamm-Bruch beendet Überladen -> 4 s erschöpft', () => {
    const { ctx, m } = make(def, 'combat', 0, 40);
    m.charge = 100; run(m, ctx, 0.1);
    expect(m.over).toBeGreaterThan(0);
    m.applyDamage({ dmg: 1000, partId: 'antennenkamm', attackerId: 'p1' });
    expect(m.partById.antennenkamm.broken).toBe(true);
    expect(m.over).toBe(0);
    expect(m.tired).toBe(true);
    expect(m.tiredT).toBeCloseTo(4, 0);
  });
  it('Blendknolle beendet Überladen', () => {
    const { ctx, m } = make(def, 'combat', 0, 40);
    m.charge = 100; run(m, ctx, 0.1);
    m.applyStatus('blind');
    expect(m.over).toBe(0);
    expect(m.tired).toBe(true);
  });
  it('Treffer am Kamm senken Ladung', () => {
    const { m } = make(def, 'combat', 0, 40);
    m.charge = 40;
    m.applyDamage({ dmg: 400, partId: 'antennenkamm', attackerId: 'p1' });
    expect(m.charge).toBeCloseTo(30, 5);
  });
  it('umgeworfener Ableiter in der Nähe bricht Überladen ab', () => {
    const { ctx, m } = make(def, 'combat', 0, 40);
    rodMock(ctx, [[12, 0], [-60, 0]]);
    run(m, ctx, 0.6);
    m.charge = 100; run(m, ctx, 0.1);
    expect(m.over).toBeGreaterThan(0);
    ctx.interact.destroyRod('rod1'); // weit weg: egal
    expect(m.over).toBeGreaterThan(0);
    ctx.interact.destroyRod('rod0');
    expect(m.over).toBe(0);
    expect(m.tired).toBe(true);
  });
});

describe('Voltaro: Aufladen am Blitzableiter', () => {
  it('läuft zum nächsten intakten Ableiter (targetPos), lädt dort', () => {
    const { ctx, m } = make(def, 'combat', 0, 30);
    rodMock(ctx, [[22, 8], [-40, -40]]);
    const atk = [];
    ctx.bus.on('monsterAttack', (e) => atk.push(e));
    m._taught = true; m.charge = 5; m._lastLoad = -99;
    let max = 5;
    run(m, ctx, 22, () => { ctx.players.forEach((q) => q.pos.set(0, 0, 30)); max = Math.max(max, m.charge); });
    const a = atk.find((e) => e.attackId === 'voltaro_aufladen');
    expect(a).toBeTruthy();
    expect(a.targetPos.x).toBeCloseTo(22, 3);
    expect(a.targetPos.z).toBeCloseTo(8, 3);
    expect(max).toBeGreaterThan(40);
  });
  it('ohne Ableiter: lädt langsamer selbst', () => {
    const { ctx, m } = make(def, 'combat', 0, 30);
    m._taught = true; m.charge = 5; m._lastLoad = -99;
    const atk = [];
    ctx.bus.on('monsterAttack', (e) => atk.push(e));
    let max = 5;
    run(m, ctx, 18, () => { ctx.players.forEach((q) => q.pos.set(0, 0, 30)); max = Math.max(max, m.charge); });
    expect(atk.some((e) => e.attackId === 'voltaro_aufladen')).toBe(true);
    expect(max).toBeGreaterThan(15);
    expect(m._loadRod).toBe(false);
    expect(m.over).toBe(0);
  });
});

describe('Voltaro: Kettenblitz, Donnerschlag, Erdung', () => {
  it('chainTargets: springt transitiv im 6-m-Umkreis, Erdung nimmt aus', () => {
    const { ctx, p } = make(def, 'combat', 0, 0);
    p.pos.set(0, 0, 0);
    const b = addPlayer(ctx, 5, 0), c = addPlayer(ctx, 10, 0), d = addPlayer(ctx, 20, 0);
    const r = chainTargets(ctx, { x: 0, z: 0 });
    expect(r.map((e) => [e.p, e.gen])).toEqual([[p, 0], [b, 1], [c, 2]]);
    expect(r.some((e) => e.p === d)).toBe(false);
    ctx.time = 5; ctx.groundingZones = [{ x: 5, z: 0, r: 4, until: 20 }];
    expect(isGrounded(ctx, b)).toBe(true);
    const r2 = chainTargets(ctx, { x: 0, z: 0 });
    expect(r2.map((e) => e.p)).toEqual([p]);
    ctx.groundingZones[0].until = 1; // abgelaufen
    expect(isGrounded(ctx, b)).toBe(false);
  });
  it('Kettenblitz: 22 je Sprung auf Pirscher im Umkreis, geerdete bleiben verschont', () => {
    const { ctx, m, p } = make(def, 'combat', 0, 12);
    const b = addPlayer(ctx, 4, 12), far = addPlayer(ctx, -20, 12), g = addPlayer(ctx, 0, 17);
    ctx.time = 1; ctx.groundingZones = [{ x: 0, z: 17, r: 4, until: 50 }];
    const hp = spy(p), hb = spy(b), hf = spy(far), hg = spy(g);
    m.over = 30;
    m.startAttack({ attackId: 'voltaro_kettenblitz', t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 12 }, seed: 3 });
    m.over = 30;
    run(m, ctx, 2.2, () => { m.recover = 99; });
    expect(hp.map((h) => h.dmg)).toEqual([22]);
    expect(hb.map((h) => h.dmg)).toEqual([22]);
    expect(hf).toEqual([]);
    expect(hg).toEqual([]);
  });
  it('Donnerschlag: 5 Blitze nacheinander, Vorwarnung >= 0,6 s, Erdung schützt', () => {
    const { ctx, m, p } = make(def, 'combat', 0, 12);
    const g = addPlayer(ctx, 0, 12);
    ctx.time = 1; ctx.groundingZones = [{ x: 0, z: 12, r: 4, until: 50 }];
    p.pos.set(30, 0, 12); // weit weg vom Kreis, aber das erste Ziel liegt auf g
    const hg = spy(g);
    m.startAttack({ attackId: 'voltaro_donnerschlag', t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 12 }, seed: 5 });
    m.over = 30;
    run(m, ctx, 0.9, () => { m.recover = 99; });
    expect(m._bolts.length).toBe(5);
    for (const b of m._bolts) expect(b.at - b.warnAt).toBeGreaterThanOrEqual(0.6 - 1e-9);
    const ats = m._bolts.map((b) => b.at);
    expect([...ats].sort((a, b) => a - b)).toEqual(ats);
    run(m, ctx, 3.5, () => { m.recover = 99; });
    expect(m._bolts.length).toBe(0);
    expect(hg).toEqual([]);
    // ohne Erdung wird derselbe Kreis getroffen
    const { ctx: c2, m: m2, p: p2 } = make(def, 'combat', 0, 12);
    const h2 = spy(p2);
    m2.startAttack({ attackId: 'voltaro_donnerschlag', t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 12 }, seed: 5 });
    m2.over = 30;
    run(m2, c2, 4.5, () => { m2.recover = 99; p2.pos.set(0, 0, 12); });
    expect(h2.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Voltaro: Phase 2 (40 %)', () => {
  it('zerstört 2 Blitzableiter, Arena-Gewitter mit Vorwarnung >= 0,6 s, deterministisch', () => {
    const go = () => {
      const { ctx, m } = make(def, 'combat', 0, 40);
      const destroyed = rodMock(ctx, [[10, 0], [-14, 5], [30, 30]]);
      m._taught = true;
      m.hp = m.maxHp * 0.39;
      const bolts = [];
      run(m, ctx, 12, () => { ctx.players.forEach((q) => q.pos.set(0, 0, 40)); for (const b of m._bolts) if (!bolts.some((x) => x.n === b.n)) bolts.push({ ...b }); });
      return { m, destroyed, bolts };
    };
    const a = go(), b = go();
    expect(a.m.phase).toBe(1);
    expect(a.destroyed.length).toBe(2);
    expect(a.destroyed).toEqual(['rod0', 'rod1']);
    expect(a.bolts.length).toBeGreaterThanOrEqual(3);
    for (const x of a.bolts) expect(x.at - x.warnAt).toBeGreaterThanOrEqual(0.6 - 1e-9);
    expect(JSON.stringify(a.bolts.map((x) => [x.x, x.z, x.at]))).toBe(JSON.stringify(b.bolts.map((x) => [x.x, x.z, x.at])));
  });
  it('eigene Zerstörung der Ableiter bricht die Überladung nicht ab', () => {
    const { ctx, m } = make(def, 'combat', 0, 40);
    rodMock(ctx, [[10, 0], [-14, 5]]);
    m.charge = 100; run(m, ctx, 0.1);
    expect(m.over).toBeGreaterThan(0);
    voltaro.phases[0].enter(m);
    expect(m.over).toBeGreaterThan(0);
  });
});

describe('Voltaro: Schwanz', () => {
  it('Schwanz abtrennbar (1000), Spulensprung danach gesperrt', () => {
    const { m } = make(def, 'combat', 0, 40);
    expect(m._atkAllowed(m.def.attacks.voltaro_spulen)).toBe(true);
    const ev = m.applyDamage({ dmg: 1100, partId: 'tail', attackerId: 'p1' });
    expect(ev.broke).toBe(true);
    expect(m.severedTail).toBeTruthy();
    expect(m.extra.tail2.visible).toBe(false);
    expect(m.snapshot().flags.tailGone).toBe(true);
    expect(m._atkAllowed(m.def.attacks.voltaro_spulen)).toBe(false);
  });
});

describe('Voltaro: Determinismus', () => {
  it('gleicher Seed + gleiche Spieler -> gleiche Angriffe und Ladung', () => {
    const sim = () => {
      const { ctx, m } = make(def, 'combat', 0, 9, 21);
      rodMock(ctx, [[18, 0]]);
      const ev = [];
      ctx.bus.on('monsterAttack', (e) => ev.push([e.attackId, e.t0, e.seed, e.targetPos?.x, e.targetPos?.z, e.chainIdx ?? 0]));
      m.charge = 55;
      run(m, ctx, 70, (i) => ctx.players.forEach((q) => q.pos.set(Math.sin(i / 90) * 6, 0, 9 + Math.cos(i / 130) * 4)));
      return { ev, charge: m.charge, over: m.over, hp: m.hp };
    };
    const a = sim(), b = sim();
    expect(a.ev.length).toBeGreaterThan(8);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
