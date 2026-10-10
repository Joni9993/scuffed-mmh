import { describe, it, expect } from 'vitest';
import { make, DT } from './p3helpers.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { jaggo } from '../../src/game/monsters/jaggo.js';

const mk = (over = {}) => make({ ...jaggo, hp: 1e6, ...over }, 'combat', 0, 7);
function collect(ctx, m, secs, fn) {
  const out = [];
  ctx.bus.on('monsterAttack', (e) => out.push(e));
  for (let i = 0; i < secs / DT; i++) { ctx.players.forEach((q) => { q.god = true; q.pos.set(0, 0, 4 + 3 * Math.sin(i * DT * 0.4)); }); fn?.(i * DT); m.update(DT); }
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

  it('Kammbruch: Rudelruf bleibt (Owner-Feedback), Kopf bricht erst bei 1200', () => {
    const { m } = mk();
    expect(m.partById.head.breakHp).toBe(1200);
    m.partById.head.broken = true;
    expect(m._atkAllowed(jaggo.attacks.jaggo_rudelruf)).toBe(true);
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

  // Owner-Feedback Okt 2026
  const hitsOn = (id, px, pz, extra = {}) => {
    const inst = new AttackInstance(jaggo.attacks[id], { attackId: id, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 12 }, seed: 3, ...extra });
    const seen = new Set();
    for (let t = 0; t < inst.duration; t += DT) for (const h of inst.hitsAt(t)) {
      const sh = h.shape, P = { x: px, y: 1.2, z: pz };
      let d;
      if (sh.a) { const ax = sh.b.x - sh.a.x, ay = sh.b.y - sh.a.y, az = sh.b.z - sh.a.z, l2 = ax * ax + ay * ay + az * az || 1; const k = Math.max(0, Math.min(1, ((P.x - sh.a.x) * ax + (P.y - sh.a.y) * ay + (P.z - sh.a.z) * az) / l2)); d = Math.hypot(P.x - sh.a.x - ax * k, P.y - sh.a.y - ay * k, P.z - sh.a.z - az * k); }
      else d = Math.hypot(P.x - sh.x, P.y - sh.y, P.z - sh.z);
      if (d <= sh.r + 0.4) seen.add(h.idx);
    }
    return seen;
  };
  it('Zickzack beisst durchgehend (4 Bisse)', () => {
    expect(jaggo.attacks.jaggo_zickzack.hits.length).toBe(4);
  });
  it('Rückhüpfer ist ein 360°-Schwanzwirbel (trifft vorn, seitlich, hinten)', () => {
    for (const [x, z] of [[0, 4], [4, 0], [-4, 0], [0, -4]]) expect(hitsOn('jaggo_rueckhuepfer', x, z).size, `@${x},${z}`).toBeGreaterThan(0);
  });
  it('Hetzjagd überrennt: Körper-Hitbox trifft Jäger im Anlaufweg (umwerfen)', () => {
    const run = jaggo.attacks.jaggo_hetzjagd.hits[0];
    expect(run.knock).toBe('down');
    // Jäger steht auf halber Strecke (Kurve läuft durch die Mitte zurück auf die Linie)
    let hit = false;
    for (const z of [3, 5, 7, 9]) for (const x of [-4, -2, 0, 2, 4]) if (hitsOn('jaggo_hetzjagd', x, z).has(0)) hit = true;
    expect(hit).toBe(true);
  });
  it('Tempo 1,25, Kopf 1200', () => {
    expect(jaggo.attacks.jaggo_bissreihe.tempo).toBe(1.25);
    expect(jaggo.run).toBeCloseTo(7.75);
  });
});

