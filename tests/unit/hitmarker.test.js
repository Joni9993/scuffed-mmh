// Trefferzonen-Marker (Blendax, Mampfaffe): Position und Radius kommen aus den echten Trefferformen, Gefahrenzonen sind ROT.
import { describe, it, expect, beforeEach } from 'vitest';
import { make, DT } from './p3helpers.js';
import { blendax, hpOf, lowestHp, leadPos, BLENDAX } from '../../src/game/monsters/blendax.js';
import { mampfaffe } from '../../src/game/monsters/mampfaffe.js';
import { AttackInstance, groundReach } from '../../src/game/monsters/attack.js';
import { overlap, playerCapsule } from '../../src/game/hitbox.js';
import { Player } from '../../src/game/player.js';
import { time } from '../../src/core/time.js';

beforeEach(() => time.reset());

const mk = (def, id) => new AttackInstance(def.attacks[id], { attackId: id, t0: 0, origin: { x: 3, y: 0, z: -2 }, yaw: 0.7, targetPos: { x: 9, y: 0, z: 8 }, seed: 5 });
const DEFS = { blendax, mampfaffe };
const harmful = (h) => h.dmg > 0 || h.knock === 'pin';

describe('Marker == Hitbox (Position + Radius)', () => {
  it('Spieler-Hurtbox-Annahme stimmt mit Player überein (Radius 0,4)', () => {
    const p = new Player({ ctx: make(blendax).ctx });
    expect(p.radius).toBeCloseTo(0.4);
  });
  for (const def of Object.values(DEFS)) {
    for (const atk of Object.values(def.attacks)) {
      if (!(atk.hits ?? []).some(harmful)) continue;
      it(`${atk.id}: markerFromHits, jede Hitbox hat Marker-Scheiben, die genau ihre Berührzone abdecken`, () => {
        expect(atk.markerFromHits, atk.id).toBe(true);
        const inst = mk(def, atk.id), fps = inst.footprints();
        atk.hits.forEach((h, i) => {
          const mine = fps.filter((f) => f.idx === i);
          if (!harmful(h)) { expect(mine.length).toBe(0); return; }
          expect(mine.length, `${atk.id} hit ${i}`).toBeGreaterThan(0);
          if (h.shape === 'capsule') {
            for (let k = 0; k < 9; k++) {
              const hs = inst.hitsAt(inst.wall(h.t0 + (h.t1 - h.t0) * ((k + 0.5) / 9))).find((x) => x.idx === i);
              const c = { x: (hs.shape.a.x + hs.shape.b.x) / 2, z: (hs.shape.a.z + hs.shape.b.z) / 2 };
              expect(mine.some((f) => Math.hypot(f.x - c.x, f.z - c.z) <= f.r + 0.01), `${atk.id} k=${k}`).toBe(true);
            }
            return;
          }
          for (let k = 0; k < 5; k++) { // auch bewegte Kugeln (Sprung/Ausfallschritt während des Treffers) sind abgedeckt
            const hs = inst.hitsAt(inst.wall(h.t0 + (h.t1 - h.t0) * ((k + 0.5) / 5))).find((x) => x.idx === i);
            const f = mine.find((q) => Math.hypot(q.x - hs.shape.x, q.z - hs.shape.z) <= 0.36);
            expect(f, `${atk.id} k=${k}`).toBeTruthy();
            expect(f.r).toBeCloseTo(groundReach(h.radius, hs.shape.y), 5);
          }
          const f = mine[0], hs = inst.hitsAt(inst.wall(h.t0 + 1e-4)).find((x) => x.idx === i);
          const at = (d) => playerCapsule({ x: hs.shape.x + d, y: 0, z: hs.shape.z }, 0.4, 1.7);
          expect(overlap(hs.shape, at(f.r - 0.03)), 'innen').toBe(true);
          expect(overlap(hs.shape, at(f.r + 0.03)), 'außen').toBe(false);
          expect(f.r).toBeLessThanOrEqual(h.radius + 0.4 + 1e-6);
          expect(f.r).toBeGreaterThanOrEqual(h.radius - 0.8);
        });
      });
    }
  }
});

describe('Gefahrenzonen sind rot', () => {
  for (const [name, def] of Object.entries(DEFS)) {
    it(`${name}: jeder gezeichnete Bodenmarker eines Schadensangriffs ist rot (nie grün)`, () => {
      const drawn = new Map();
      for (const atk of Object.values(def.attacks)) {
        if (!(atk.hits ?? []).some(harmful)) continue;
        const { ctx, m } = make({ ...def, hp: 1e8 }, 'combat', 0, 9);
        ctx.fx.marker = (key, p, r, color) => { drawn.set(`${atk.id}|${key}`, { color, r }); };
        m.recover = 99; m._taught = true;
        m.beginAttack(atk.id);
        for (let i = 0; i < (atk.duration + 0.3) / DT && m.attack; i++) { ctx.players.forEach((p) => { p.god = true; p.update(DT); }); m.update(DT); m.recover = 99; }
      }
      expect(drawn.size).toBeGreaterThan(0);
      for (const [k, v] of drawn) {
        const c = parseInt(v.color.slice(1), 16);
        expect(c >> 16, k).toBeGreaterThanOrEqual(0xd0); expect((c >> 8) & 255, k).toBeLessThanOrEqual(0xb0); expect(c & 255, k).toBeLessThanOrEqual(0xb0);
      }
    });
  }
});

describe('Blendax: Sprünge zielen, Nachblitz-Sprung auf den Schwächsten', () => {
  it('Vorhalt: Sprung landet vor dem laufenden Pirscher', () => {
    const { m, p } = make({ ...blendax, hp: 1e8 }, 'combat', 0, 9);
    p.vel.set(6, 0, 0);
    m.recover = 99; m._taught = true;
    const inst = m.beginAttack('blendax_sprung');
    expect(inst.target.x).toBeGreaterThan(p.pos.x + 2);
    expect(inst.landing.x).toBeGreaterThan(0.5);
  });
  it('Sprung: große Reichweite, schneller Flug, Treffer-Radius 4, Gehen reicht nicht', () => {
    const a = blendax.attacks.blendax_sprung, h = a.hits[0];
    expect(a.range[1]).toBeGreaterThanOrEqual(BLENDAX.LEAP_MAX);
    expect(h.radius).toBeGreaterThanOrEqual(4);
    expect(h.t0 - a.telegraph).toBeLessThanOrEqual(0.4);
    expect(h.t0 * 4).toBeLessThan(h.radius + 0.4); // Gehtempo 4 m/s kommt in der Zeit bis zum Aufprall nicht aus der Zone
  });
  it('lowestHp: wenigste HP, auch wenn der nicht geblendet war (p.v.hp ist für alle Mitspieler bekannt)', () => {
    const { ctx, m, p } = make({ ...blendax, hp: 1e8 }, 'combat', 0, 9);
    const q = new Player({ ctx }); q.spawnAt(12, 3, 0); ctx.players.push(q);
    p.v.hp = 80; q.v.hp = 35;
    expect(hpOf(q)).toBe(35);
    expect(lowestHp(m)).toBe(q);
    q.v.hp = 100; expect(lowestHp(m)).toBe(p);
    expect(leadPos({ pos: { x: 1, y: 0, z: 1 }, vel: { x: 0, z: 0 } }, 1)).toEqual({ x: 1, y: 0, z: 1 });
  });
  it('nach dem Blitz springt Blendax den Schwächsten an, direkt nach Ende der Betäubung', () => {
    const { ctx, m, p } = make({ ...blendax, hp: 1e8 }, 'combat', 0, 9);
    const q = new Player({ ctx }); q.spawnAt(-10, 6, 0); ctx.players.push(q);
    ctx.cameraYaw = Math.PI;
    p.v.hp = 100; q.v.hp = 20; p.god = true; q.god = true;
    m.recover = 99; m._taught = true;
    m.target = p;
    let leapT = null, t = 0;
    const orig = m.beginAttack;
    m.beginAttack = (id, ex) => { if (id === 'blendax_sprung' && leapT === null) leapT = t; return orig(id, ex); };
    m.beginAttack('blendax_blitz');
    leapT = null;
    for (; t < 6 && leapT === null; t += DT) { ctx.players.forEach((x) => x.update(DT)); m.update(DT); if (m.attack) m.recover = 99; else if (!m.chainNext) m.recover = 99; }
    expect(leapT).not.toBeNull();
    expect(m.target).toBe(q);
    // Weiß 1 s + Betäubung 2 s ab t = 1,0 -> der Sprung beginnt bei 1,5 s: Absprung bei 2,0 s = 1 s in der Betäubung
    expect(leapT).toBeGreaterThan(1.3); expect(leapT).toBeLessThan(1.8);
  });
});
