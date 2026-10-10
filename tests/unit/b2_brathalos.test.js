import { describe, it, expect } from 'vitest';
import { make, DT } from './p3helpers.js';
import { brathalos } from '../../src/game/monsters/brathalos.js';
import { projPos } from '../../src/game/monsters/mprojectiles.js';

const def = { ...brathalos, hp: 1e7, fly: { ...brathalos.fly, firstGap: 1e9, gapMin: 1e9, gapMax: 1e9 } };
function collect(m, ctx, secs, dist = 7) {
  const out = [];
  ctx.bus.on('monsterAttack', (e) => out.push(e));
  for (let i = 0; i < secs / DT; i++) { ctx.players.forEach((q) => q.pos.set(0, 0, dist)); m.update(DT); }
  return out;
}

describe('Brocken 2.0 Brathalos', () => {
  it('Ketten tauchen auf, Feuerteppich kommt vor, kein Flammenstoss ohne Flügelbruch', () => {
    const { ctx, m } = make(def, 'combat', 0, 7);
    m.flyCd = 1e9;
    const ev = collect(m, ctx, 240);
    expect(ev.some((e) => e.chainIdx > 0)).toBe(true);
    const ids = new Set(ev.map((e) => e.attackId));
    expect(ids.has('brathalos_feuerteppich')).toBe(true);
    expect(ids.has('brathalos_flammenstoss')).toBe(false);
  });

  it('Flügelbruch tauscht Böe gegen Flammenstoß', () => {
    const { ctx, m } = make(def, 'combat', 0, 5);
    m.flyCd = 1e9;
    m.partById.wingL.broken = true;
    const ev = collect(m, ctx, 240, 5);
    const ids = new Set(ev.map((e) => e.attackId));
    expect(ids.has('brathalos_flammenstoss')).toBe(true);
    expect(ids.has('brathalos_boee')).toBe(false);
    expect(def.attacks.brathalos_flammenstoss.cond({ partById: { wingR: { broken: true } } })).toBe(true);
  });

  it('Phase Glutsturm erzwingt Feuerteppich', () => {
    const { ctx, m } = make(def, 'combat', 0, 9);
    m.flyCd = 1e9;
    m.hp = m.maxHp * 0.44;
    const ev = collect(m, ctx, 6, 9);
    expect(m.phase).toBe(1);
    expect(ev[0]?.attackId).toBe('brathalos_feuerteppich');
  });

  it('Feuerteppich: gleiche params -> gleiche Projektilbahnen, 3 Bälle im Fächer', () => {
    const run = () => {
      const { ctx, m } = make(def, 'combat', 0, 10);
      m.recover = 99;
      const defs = [];
      m.projectiles = { spawn: (d) => defs.push(d), update() {} };
      m.startAttack({ attackId: 'brathalos_feuerteppich', t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 2, y: 0, z: 10 }, seed: 4 });
      for (let i = 0; i < 3.2 / DT; i++) m.update(DT);
      return defs;
    };
    const a = run(), b = run();
    expect(a.length).toBe(3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const ends = a.map((d) => projPos(d, d.dur).x);
    expect(Math.max(...ends) - Math.min(...ends)).toBeGreaterThan(5);
  });
});
