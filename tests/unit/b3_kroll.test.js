import { describe, it, expect } from 'vitest';
import { make, DT } from './p3helpers.js';
import { kroll } from '../../src/game/monsters/kroll.js';
import { monsters, getMonsterDef } from '../../src/game/monsters/index.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';

const mk = (seed = 7) => make({ ...kroll, hp: 1e9 }, 'combat', 0, 5, seed);
const run = (ctx, m, secs) => { for (let i = 0; i < secs / DT; i++) { ctx.players.forEach((q) => { q.god = true; q.pos.set(0, 0, 5); }); m.update(DT); } };
const collect = (ctx, m, secs) => { const out = []; const off = ctx.bus.on('monsterAttack', (e) => out.push(e)); run(ctx, m, secs); off(); return out; };

describe('Kroll', () => {
  it('Registry, Teile und Werte (GDD 15.4)', () => {
    expect(getMonsterDef('kroll')).toBe(monsters.kroll);
    expect(kroll.hp).toBe(15000);
    expect(kroll.scale).toBe(2.6);
    const p = Object.fromEntries(kroll.parts.map((x) => [x.id, x]));
    expect(p.kesselpanzer).toMatchObject({ factor: 0.35, breakHp: 1400 });
    expect(p.scherenL).toMatchObject({ factor: 0.7, breakHp: 700 });
    expect(p.scherenR).toMatchObject({ factor: 0.7, breakHp: 700 });
    expect(p.augen.factor).toBe(0.9);
    expect(p.beine.factor).toBe(0.8);
    expect(p.beine.elem.shock).toBe(25);
    expect(kroll.glitchSpots).toEqual(['kesselpanzer', 'scherenL', 'scherenR']);
    expect(kroll.run).toBeLessThan(kroll.walk); // vorwaerts langsam, seitwaerts schnell
    const { m } = mk();
    for (const id of Object.keys(p)) expect(m.partById[id].mats.length, id).toBeGreaterThan(0);
  });

  it('Alle Angriffe: Cue, Telegraph >= 0,5 s, Audit-Distanzen', () => {
    for (const a of Object.values(kroll.attacks)) {
      expect(a.cue?.tone && a.cue?.color, a.id).toBeTruthy();
      expect(a.audit?.length, a.id).toBeGreaterThan(0);
      const inst = new AttackInstance(a, { attackId: a.id, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 6 }, seed: 3 });
      expect(inst.firstHitTime(), a.id).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
    const z = kroll.attacks.kroll_zange, w = kroll.attacks.kroll_wirbel, d = kroll.attacks.kroll_dampf;
    expect(z.hits).toHaveLength(2); expect(z.hits[0].dmg).toBe(22);
    expect(w.hits).toHaveLength(3); expect(w.hits[0].dmg).toBe(18);
    expect(d.hits.length).toBe(8); expect(d.hits[0].status.type).toBe('rost'); expect(d.hits[0].dmg).toBe(8);
    expect(kroll.attacks.kroll_seitrammer.hits[0].dmg).toBe(28);
    expect(kroll.attacks.kroll_druck.hits[0].dmg).toBe(35);
    expect(kroll.attacks.kroll_sprung.hits[0].dmg).toBe(30);
  });

  it('Seitrammer: 12 m seitwaerts (quer zur Blickrichtung)', () => {
    const a = kroll.attacks.kroll_seitrammer;
    const inst = new AttackInstance(a, { attackId: a.id, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 4, y: 0, z: 1 }, seed: 1 });
    const end = inst.sample(inst.duration);
    expect(Math.hypot(end.x, end.z)).toBeCloseTo(12, 0);
    expect(Math.abs(end.x)).toBeGreaterThan(11);
    expect(Math.abs(end.z)).toBeLessThan(0.5);
  });

  it('Kesseldruck: Ring um ihn, direkt unter ihm sicher, Ueberlappung trifft nur einmal', () => {
    const a = kroll.attacks.kroll_druck;
    const inst = new AttackInstance(a, { attackId: a.id, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0.4, seed: 1 });
    const t = inst.wall(1.05);
    const hits = inst.hitsAt(t);
    expect(new Set(hits.map((h) => h.idx)).size).toBe(1);
    const reach = (x, z) => hits.some((h) => (h.shape.x - x) ** 2 + (h.shape.z - z) ** 2 <= h.shape.r ** 2);
    expect(reach(0, 0)).toBe(false);
    expect(reach(1.2, 0)).toBe(false);
    for (let ang = 0; ang < 6.3; ang += 0.4) expect(reach(Math.sin(ang) * 5, Math.cos(ang) * 5)).toBe(true);
    expect(reach(8.5, 0)).toBe(false);
  });

  it('Panzerbruch: Phase 2, neue Angriffe frei, Kesseldruck gesperrt, +25 % Tempo', () => {
    const { ctx, m } = mk();
    const ids = () => { const s = new Set(); for (let i = 0; i < 200; i++) s.add(m._chooseAttack(5)?.id); return s; };
    for (const k of Object.keys(m.cds)) m.cds[k] = 0;
    let a = ids();
    expect(a.has('kroll_druck')).toBe(true);
    expect(a.has('kroll_wirbel')).toBe(false);
    const ph = [];
    ctx.bus.on('monsterPhase', (e) => ph.push(e));
    const base = m.speedMul;
    const k = m.partById.kesselpanzer;
    m._breakPart(k);
    expect(m.p2).toBe(true);
    expect(ph.some((e) => e.idx === 1)).toBe(true);
    expect(m.speedMul).toBeCloseTo(base * 1.25, 5);
    expect(k.factor).toBe(0.9);
    expect(m.partById.koerper.factor).toBe(0.9);
    expect(m.phaseSpecial).toBe('kroll_sprung');
    for (const kk of Object.keys(m.cds)) m.cds[kk] = 0;
    a = ids();
    expect(a.has('kroll_druck')).toBe(false);
    expect(a.has('kroll_wirbel')).toBe(true);
  });

  it('Phase 2: Special Krabbensprung wird nach Panzerbruch gespielt; HP-Phase bei 40 %', () => {
    const { ctx, m } = mk();
    const ev = [], ph = [];
    ctx.bus.on('monsterAttack', (e) => ev.push(e));
    ctx.bus.on('monsterPhase', (e) => ph.push(e));
    run(ctx, m, 1);
    m._breakPart(m.partById.kesselpanzer);
    run(ctx, m, 6);
    expect(ev.some((e) => e.attackId === 'kroll_sprung')).toBe(true);
    m.hp = m.maxHp * 0.35;
    run(ctx, m, 5);
    expect(ph.some((e) => e.name === 'Siedehitze')).toBe(true);
  });

  it('Krabbensprung: landet aufs Ziel, danach 1,5 s Strafe-Fenster ohne Treffer und ohne Bewegung', () => {
    const a = kroll.attacks.kroll_sprung;
    expect(a.punishWindow).toBe(1.5);
    const tgt = { x: 3, y: 0, z: 10 };
    const inst = new AttackInstance(a, { attackId: a.id, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: tgt, seed: 5 });
    const land = inst.wall(a.hits[0].t0);
    const s = inst.sample(land + 0.01);
    expect(Math.hypot(s.x - tgt.x, s.z - tgt.z)).toBeLessThan(0.6);
    expect(s.air).toBeLessThan(0.3);
    const tEnd = inst.wall(a.hits[0].t1);
    expect(inst.duration - tEnd).toBeGreaterThanOrEqual(1.5 - 1e-9);
    const s2 = inst.sample(inst.duration - 0.01);
    expect(Math.hypot(s2.x - s.x, s2.z - s.z)).toBeLessThan(0.05); // bleibt stehen
    for (let t = tEnd + 0.01; t < inst.duration; t += 0.05) expect(inst.hitsAt(t)).toHaveLength(0);
    // im Flug in der Luft
    expect(inst.sample(inst.wall(1.2)).air).toBeGreaterThan(2);
  });

  it('Blendknolle wirkt doppelt (Augenstiele)', () => {
    const { m } = mk();
    m.applyStatus('blind');
    expect(m.st.blind).toBeCloseTo(8, 3);
  });

  it('Ketten tauchen auf (Zange/Dampf -> Folgeglied), Anti-Wiederholung ueber mehrere Seeds', () => {
    const pairs = new Set();
    for (let s = 1; s <= 6; s++) {
      const { ctx, m } = mk(s);
      const ev = collect(ctx, m, 120);
      for (let i = 1; i < ev.length; i++) if (ev[i].chainIdx) pairs.add(`${ev[i - 1].attackId}>${ev[i].attackId}`);
    }
    expect([...pairs].some((p) => p.startsWith('kroll_zange>'))).toBe(true);
    expect(pairs.size).toBeGreaterThanOrEqual(2);
  });

  it('Replay-Determinismus aller Angriffe', () => {
    for (const id of Object.keys(kroll.attacks)) {
      const p = { attackId: id, t0: 0, origin: { x: 1, y: 0, z: 2 }, yaw: 0.7, targetPos: { x: 4, y: 0, z: 9 }, seed: 42 };
      const a = new AttackInstance(kroll.attacks[id], p), b = new AttackInstance(kroll.attacks[id], p);
      for (let t = 0; t < a.duration; t += 0.05) {
        expect(a.sample(t)).toEqual(b.sample(t));
        expect(a.hitsAt(t).map((h) => h.shape)).toEqual(b.hitsAt(t).map((h) => h.shape));
      }
    }
  });
});
