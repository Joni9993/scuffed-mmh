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
});
