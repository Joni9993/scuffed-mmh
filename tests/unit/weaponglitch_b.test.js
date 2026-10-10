import { describe, it, expect } from 'vitest';
import { WeaponState } from '../../src/game/weapons/weapon.js';
import { bow, arrowHit, SHOTS, DEBUG_CRIT } from '../../src/game/weapons/bow.js';
import { katana, resync, RESYNC_MUL } from '../../src/game/weapons/katana.js';
import { MAX_CRACKS } from '../../src/game/weapons/glitchfx2.js';
import { initGlitch, addGlitchEnergy, activateGlitch, tickGlitch, endGlitch, glitchDmgMul } from '../../src/game/glitch.js';
import { resolvePlayerHit } from '../../src/game/combat.js';

const mkMon = (id = 'm1') => ({
  id, alive: true, pos: { x: 0, y: 0, z: 10 }, hits: [],
  parts: [{ id: 'head', factor: 1.2 }, { id: 'body', factor: 0.6 }],
  hurtParts() { return this.parts.map((pt, i) => ({ part: pt, sphere: { x: 0, y: 1 + i, z: 10, r: 1 }, pos: { x: 0, y: 1 + i, z: 10 } })); },
  applyDamage(res) { this.hits.push(res); return {}; },
});

function mkPlayer(def) {
  const calls = { numbers: [] };
  const monsters = [mkMon()];
  const ctx = {
    monsters, rng: () => 0.99, mods: {}, stats: { damage: 0, glitchDmg: 0 }, glitchSys: { hitting: null },
    bus: { emit() {} }, fx: { number: (p, d, k) => calls.numbers.push([d, k]), spark() {}, shake() {}, flash() {}, glitchTear() {}, marker() {}, clearMarker() {} },
    input: { b: { special: { pressed: false } } },
    playerHit(p, m, hp, ah) { // spiegelt hunt.playerHit
      const st = p.stats;
      const attacker = { power: st.power, critChance: 0, elems: {}, dmgMul: p.dmgMul * (p.def.dmgMul?.(p.weapon) ?? 1) * p.glitchDmgMul };
      const res = resolvePlayerHit(attacker, ah.hit, hp.part, ctx.rng, {});
      res.attackerId = p.id;
      m.applyDamage(res);
      ctx.stats.damage += res.dmg;
      ctx.last = res;
      if (p.glitching) def.glitch.onHit?.(p, res, m);
    },
  };
  const p = { id: 'p1', local: true, def, ctx, pos: { x: 0, y: 0, z: 0 }, rot: 0, sinceRoll: 99, time: 0, hitstop: 0, dmgMul: 1, stats: { power: 100 }, get glitchDmgMul() { return glitchDmgMul(this); }, get glitching() { return !!this.glitch?.active; } };
  initGlitch(p);
  p.weapon = new WeaponState(def, { player: p, drain() {}, exhausted: () => false });
  return { p, ctx, calls, mon: monsters[0] };
}
const start = (p) => { addGlitchEnergy(p, 100); activateGlitch(p); };

describe('Spannbogen: Debug-Modus', () => {
  const info = (mon) => ({ monster: mon, hp: mon.hurtParts()[1], pos: { x: 0, y: 2, z: 10 } }); // Koerper (0,6)
  it('ausserhalb unveraendert (Koerper, Entfernung 5 m)', () => {
    const { p, ctx, mon } = mkPlayer(bow);
    arrowHit(p, info(mon), SHOTS[3], 5);
    expect(ctx.last.weak).toBe(false);
    expect(ctx.last.zone).toBe(0.6);
  });
  it('im Modus: Schwachstelle + x1,5 + Sweet Spot immer', () => {
    const a = mkPlayer(bow), b = mkPlayer(bow);
    arrowHit(a.p, info(a.mon), SHOTS[3], 5); // ausserhalb
    start(b.p);
    arrowHit(b.p, info(b.mon), SHOTS[3], 5); // Koerper, zu nah
    expect(b.ctx.last.weak).toBe(true);
    expect(b.ctx.last.zone).toBe(1.2);
    const ratio = b.ctx.last.dmg / a.ctx.last.dmg;
    // 1,3 (Kern) * 1,5 (krit) * 1,2/0,6 (Zone) / 0,7 (kein Fernabzug)
    expect(ratio).toBeCloseTo((1.3 * DEBUG_CRIT * 2) / 0.7, 0);
  });
  it('Modus-Ende: wieder normal', () => {
    const { p, ctx, mon } = mkPlayer(bow);
    start(p); endGlitch(p);
    arrowHit(p, info(mon), SHOTS[3], 12);
    expect(ctx.last.weak).toBe(false);
  });
  it('Hooks ohne Szene sind harmlos', () => {
    const { p } = mkPlayer(bow);
    start(p); tickGlitch(p, 0.1); endGlitch(p);
    expect(p.glitch.active).toBe(false);
  });
});

describe('Katana: Desync-Schnitte', () => {
  const hit = (s, partId = 'head') => {
    s.p.weapon.activeHits = () => [{ hit: { mv: 100 } }];
    s.ctx.playerHit(s.p, s.mon, s.mon.hurtParts().find((e) => e.part.id === partId), { hit: { mv: 100, hitstop: 'light' } });
  };
  it('ausserhalb des Modus normaler Schaden, keine Risse', () => {
    const s = mkPlayer(katana);
    hit(s);
    expect(s.mon.hits[0].dmg).toBe(120); // 100 * 1.0 * 1.2
    expect(s.p._ds).toBeFalsy();
  });
  it('im Modus: Treffer ohne Sofortschaden (Mindestschaden 1)', () => {
    const s = mkPlayer(katana);
    start(s.p);
    hit(s); hit(s);
    expect(s.mon.hits.map((h) => h.dmg)).toEqual([1, 1]);
    expect(s.p._ds.cracks.length).toBe(2);
  });
  it('Resync bei Ende = Summe x1,5 (inkl. Grundbonus x1,3 -> ca. x1,95)', () => {
    const s = mkPlayer(katana);
    start(s.p);
    hit(s); hit(s); hit(s, 'body');
    s.mon.hits.length = 0;
    endGlitch(s.p);
    const head = s.mon.hits.find((h) => h.partId === 'head'), body = s.mon.hits.find((h) => h.partId === 'body');
    const one = 100 * 1.2 * 1.3; // normaler Treffer inkl. Modus-Bonus
    expect(head.dmg).toBe(Math.round(2 * one * RESYNC_MUL));
    expect(body.dmg).toBe(Math.round(100 * 0.6 * 1.3 * RESYNC_MUL));
    expect(head.hitstop).toBeCloseTo(0.12);
    expect(s.p.hitstop).toBeGreaterThanOrEqual(0.12);
    expect(s.ctx.stats.glitchDmg).toBe(head.dmg + body.dmg);
    expect(s.p._ds).toBeNull();
    expect(head.dmg / (2 * 120)).toBeCloseTo(1.95, 2); // Faktor gegenueber normalen Treffern
  });
  it('Resync per Spezial-Taste, Modus laeuft weiter', () => {
    const s = mkPlayer(katana);
    start(s.p);
    hit(s);
    s.ctx.input.b.special.pressed = true;
    s.mon.hits.length = 0;
    tickGlitch(s.p, 0.016);
    expect(s.mon.hits.length).toBe(1);
    expect(s.mon.hits[0].dmg).toBe(Math.round(156 * RESYNC_MUL));
    expect(s.p.glitching).toBe(true);
    expect(s.p._ds.cracks.length).toBe(0);
    s.mon.hits.length = 0;
    tickGlitch(s.p, 0.016); // ohne Risse nichts
    expect(s.mon.hits.length).toBe(0);
  });
  it('Risse-Cap: ueber MAX_CRACKS kein neuer Riss, Schaden bleibt erhalten', () => {
    const s = mkPlayer(katana);
    start(s.p);
    for (let i = 0; i < MAX_CRACKS + 5; i++) hit(s);
    expect(s.p._ds.cracks.length).toBe(MAX_CRACKS);
    s.mon.hits.length = 0;
    resync(s.p);
    const sum = s.mon.hits.reduce((a, h) => a + h.dmg, 0);
    expect(sum).toBe(Math.round((MAX_CRACKS + 5) * 156 * RESYNC_MUL));
  });
  it('Resync-Treffer grosser Summen werden fuers Netz gesplittet (<= 5000)', () => {
    const s = mkPlayer(katana);
    s.p.stats.power = 100000;
    start(s.p);
    hit(s);
    s.mon.hits.length = 0;
    resync(s.p);
    expect(s.mon.hits.length).toBeGreaterThan(1);
    expect(Math.max(...s.mon.hits.map((h) => h.dmg))).toBeLessThanOrEqual(5000);
  });
});
