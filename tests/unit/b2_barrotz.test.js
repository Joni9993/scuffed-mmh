import { describe, it, expect } from 'vitest';
import { make, DT } from './p3helpers.js';
import { barrotz } from '../../src/game/monsters/barrotz.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';

const mk = () => make({ ...barrotz, hp: 1e9 }, 'combat', 0, 5);
const run = (ctx, m, secs) => { for (let i = 0; i < secs / DT; i++) { ctx.players.forEach((q) => { q.god = true; q.pos.set(0, 0, 5); }); m.update(DT); } };
const collect = (ctx, m, secs) => { const out = []; const off = ctx.bus.on('monsterAttack', (e) => out.push(e)); run(ctx, m, secs); off(); return out; };

describe('Barrotz Brocken 2.0', () => {
  it('Ketten tauchen auf (Hammer -> Folgeglied)', () => {
    const pairs = new Set();
    for (let s = 1; s <= 6; s++) {
      const { ctx, m } = make({ ...barrotz, hp: 1e9 }, "combat", 0, 5, s);
      const ev = collect(ctx, m, 120);
      for (let i = 1; i < ev.length; i++) if (ev[i].chainIdx) pairs.add(`${ev[i - 1].attackId}>${ev[i].attackId}`);
    }
    expect([...pairs].some((p) => p.startsWith('barrotz_hammer>'))).toBe(true);
    expect(pairs.size).toBeGreaterThanOrEqual(2);
  });

  it('Kopfbruch aendert Moveset: Hammer weg, Kopfstoss da', () => {
    const { m } = mk();
    const ids = () => { const s = new Set(); for (let i = 0; i < 80; i++) s.add(m._chooseAttack(3)?.id); return s; };
    let a = ids();
    expect(a.has('barrotz_hammer')).toBe(true);
    expect(a.has('barrotz_kopfstoss')).toBe(false);
    m.partById.head.broken = true;
    a = ids();
    expect(a.has('barrotz_hammer')).toBe(false);
    expect(a.has('barrotz_kopfstoss')).toBe(true);
  });

  it('Phase Schlammwut bei 45 %: Cue-Event + Doppel-Stampfer als Special', () => {
    const { ctx, m } = mk();
    const ph = [], ev = [];
    ctx.bus.on('monsterPhase', (e) => ph.push(e));
    ctx.bus.on('monsterAttack', (e) => ev.push(e));
    m.hp = m.maxHp * 0.4;
    run(ctx, m, 5);
    expect(ph[0]?.name).toBe('Schlammwut');
    expect(ev.some((e) => e.attackId === 'barrotz_doppelstampfer')).toBe(true);
  });

  it('Doppel-Stampfer: Gesamt-Telegraph <= 1,1 s, 2 Treffer; alle Angriffe mit Cue; Hoerner punishRoll', () => {
    const d = barrotz.attacks.barrotz_doppelstampfer;
    expect(d.hits).toHaveLength(2);
    expect(d.hits[1].t0).toBeLessThanOrEqual(1.1 + 1e-9);
    expect(d.hits[0].t0).toBeGreaterThanOrEqual(0.5);
    expect(barrotz.attacks.barrotz_hoerner.punishRoll).toBe(true);
    for (const a of Object.values(barrotz.attacks)) expect(a.cue?.tone && a.cue?.color).toBeTruthy();
  });

  it('Replay-Determinismus der neuen Angriffe', () => {
    for (const id of ['barrotz_doppelstampfer', 'barrotz_hoerner', 'barrotz_kopfstoss']) {
      const p = { attackId: id, t0: 0, origin: { x: 1, y: 0, z: 2 }, yaw: 0.7, targetPos: { x: 4, y: 0, z: 6 }, seed: 42 };
      const a = new AttackInstance(barrotz.attacks[id], p), b = new AttackInstance(barrotz.attacks[id], p);
      for (let t = 0; t < a.duration; t += 0.05) {
        expect(a.sample(t)).toEqual(b.sample(t));
        expect(a.hitsAt(t).map((h) => h.shape)).toEqual(b.hitsAt(t).map((h) => h.shape));
      }
    }
  });

  // Owner-Feedback Okt 2026
  const hitOn = (id, px, pz, yaw = 0) => {
    const inst = new AttackInstance(barrotz.attacks[id], { attackId: id, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw, targetPos: { x: px, y: 0, z: pz }, seed: 3 });
    for (let t = 0; t < inst.duration; t += DT) for (const h of inst.hitsAt(t)) {
      const sh = h.shape, c = sh.a && sh.b ? sh : null;
      // Abstand Punkt (px,1,pz) zur Kapsel/Kugel
      const P = { x: px, y: 1, z: pz };
      let d;
      if (c) { const ax = c.b.x - c.a.x, ay = c.b.y - c.a.y, az = c.b.z - c.a.z, l2 = ax * ax + ay * ay + az * az || 1; const k = Math.max(0, Math.min(1, ((P.x - c.a.x) * ax + (P.y - c.a.y) * ay + (P.z - c.a.z) * az) / l2)); d = Math.hypot(P.x - c.a.x - ax * k, P.y - c.a.y - ay * k, P.z - c.a.z - az * k); }
      else d = Math.hypot(P.x - sh.x, P.y - sh.y, P.z - sh.z);
      if (d <= (sh.r ?? sh.radius)) return { t, dmg: h.dmg };
    }
    return null;
  };
  it('Schwanzfeger trifft im Vollkreis (vorn, seitlich, hinten)', () => {
    for (const [x, z] of [[0, 4], [4, 0], [-4, 0], [0, -4]]) expect(hitOn('barrotz_feger', x, z), `@${x},${z}`).not.toBeNull();
  });
  it('Walze rollt auf den Jäger zu und trifft hart (40)', () => {
    const r = hitOn('barrotz_waelzer', 0, 9);
    expect(r).not.toBeNull(); expect(r.dmg).toBe(40);
    const inst = new AttackInstance(barrotz.attacks.barrotz_waelzer, { attackId: 'barrotz_waelzer', t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 9 }, seed: 3 });
    const end = inst.sample(inst.duration);
    expect(end.z).toBeGreaterThan(9); // rollt durch den Jäger durch
    expect(inst.duration).toBeCloseTo(3.4, 1); // nicht schneller als vorher
  });
  it('Tempo 1,2 + Angriffe 15 % größer', () => {
    const h = barrotz.attacks.barrotz_hammer;
    expect(h.tempo).toBe(1.2);
    expect(h.hits[0].radius).toBeCloseTo(3.6 * 1.15, 5);
    const inst = new AttackInstance(h, { attackId: h.id, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, seed: 1 });
    expect(inst.duration).toBeCloseTo(2.1 / 1.2, 2);
    expect(barrotz.run).toBeCloseTo(7.2);
  });
});

