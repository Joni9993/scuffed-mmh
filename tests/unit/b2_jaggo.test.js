import { describe, it, expect } from 'vitest';
import { make, DT } from './p3helpers.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { jaggo } from '../../src/game/monsters/jaggo.js';

const mk = (over = {}) => make({ ...jaggo, hp: 1e6, ...over }, 'combat', 0, 7);
function collect(ctx, m, secs, fn) {
  const out = [];
  ctx.bus.on('monsterAttack', (e) => out.push(e));
  for (let i = 0; i < secs / DT; i++) { ctx.players.forEach((q) => q.pos.set(0, 0, 4 + 3 * Math.sin(i * DT * 0.4))); fn?.(i * DT); m.update(DT); }
  return out;
}

describe('Brocken 2.0: Jaggo', () => {
  it('Ketten und neue Angriffe tauchen auf', () => {
    const { ctx, m } = mk();
    const ev = collect(ctx, m, 150, () => { if (m.hp < m.maxHp * 0.7) m.hp = m.maxHp * 0.7; });
    const ids = new Set(ev.map((e) => e.attackId));
    expect(ids.has('jaggo_zickzack')).toBe(true);
    expect(ids.has('jaggo_rueckhuepfer')).toBe(true);
    expect(ev.some((e) => e.chainIdx > 0)).toBe(true);
    expect(ev.some((e) => e.attackId === 'jaggo_huepfer' && e.chainIdx > 0)).toBe(true);
  });

  it('Kammbruch sperrt Rudelruf', () => {
    const { ctx, m } = mk();
    expect(m._atkAllowed(jaggo.attacks.jaggo_rudelruf)).toBe(true);
    m.partById.head.broken = true;
    expect(m._atkAllowed(jaggo.attacks.jaggo_rudelruf)).toBe(false);
    const ev = collect(ctx, m, 120, () => { m.partById.head.broken = true; });
    expect(ev.some((e) => e.attackId === 'jaggo_rudelruf')).toBe(false);
    expect(ev.length).toBeGreaterThan(5);
  });

  it('Phase bei 50 % löst Hetzjagd aus', () => {
    const { ctx, m } = mk();
    m.hp = m.maxHp * 0.49;
    const ev = collect(ctx, m, 6);
    expect(m.phase).toBe(1);
    expect(ev.some((e) => e.attackId === 'jaggo_hetzjagd')).toBe(true);
  });

  it('Replay (authority=false) liefert gleiche Hitboxen', () => {
    const { ctx, m } = mk();
    const g = new Monster(m.def, ctx, { id: 'g', authority: false, seed: 3 });
    for (const id of ['jaggo_zickzack', 'jaggo_hetzjagd', 'jaggo_rueckhuepfer']) {
      const params = { attackId: id, t0: 1, origin: { x: 0, y: 0, z: 0 }, yaw: 0.4, targetPos: { x: 2, y: 0, z: 9 }, seed: 77 };
      const i1 = g.startAttack(params), i2 = new AttackInstance(m.def.attacks[id], params);
      for (let t = 0; t < i2.duration; t += 0.05) expect(i1.hitsAt(t)).toEqual(i2.hitsAt(t));
    }
  });
});
