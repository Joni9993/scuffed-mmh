import { describe, it, expect } from 'vitest';
import { createBus } from '../../src/core/events.js';
import { GLITCH, initGlitch, addGlitchEnergy, activateGlitch, tickGlitch, glitchDmgMul, attachGlitch } from '../../src/game/glitch.js';
import { calcDamage } from '../../src/game/combat.js';
import { createInput } from '../../src/input/input.js';
import { encodeGlitch, decodeGlitch } from '../../src/net/protocol.js';
import { solveLayout, checkLayout } from '../../src/input/touchLayout.js';

function setup(mods) {
  const bus = createBus();
  const calls = [];
  const def = { glitch: { name: 't', onStart: () => calls.push('start'), onEnd: () => calls.push('end'), tick: () => calls.push('tick'), onHit: (p, res) => calls.push('hit:' + res.dmg) } };
  const h = { bus, time: 0, stats: { damage: 0, glitchDmg: 0 }, mods };
  const p = { local: true, id: 'p1', ctx: h, def };
  h.player = p; h.players = [p];
  initGlitch(p);
  const sys = attachGlitch(h);
  return { h, p, bus, calls, sys };
}
const mon = { id: 'm1' };

describe('Glitch-Energie', () => {
  it('Gewinn je Quelle', () => {
    const { p, bus, h, sys } = setup();
    bus.emit('glitchCounter', { player: p }); expect(p.glitch.energy).toBe(35);
    bus.emit('counter', { player: p }); expect(p.glitch.energy).toBe(60);
    sys.hitting = p; bus.emit('partBreak', { monster: mon, part: 'head' }); sys.hitting = null; expect(p.glitch.energy).toBe(75);
    bus.emit('hit', { player: p, monster: mon, dmg: 10 }); expect(p.glitch.energy).toBe(76);
    // Teilbruch durch fremden Treffer zaehlt nicht
    h.time = 50; bus.emit('partBreak', { monster: { id: 'x' }, part: 'tail' }); expect(p.glitch.energy).toBe(76);
    // Gast: Bruch kommt kurz nach dem eigenen Treffer per Netz
    h.time = 100; bus.emit('hit', { player: p, monster: mon, dmg: 1 }); h.time = 100.4; bus.emit('partBreak', { monster: mon, part: 'tail' });
    expect(p.glitch.energy).toBe(92);
  });
  it('fremde Pirscher sammeln nicht', () => {
    const { p, bus } = setup();
    bus.emit('glitchCounter', { player: { local: false } });
    bus.emit('hit', { player: { local: false }, monster: mon, dmg: 5 });
    expect(p.glitch.energy).toBe(0);
  });
  it('Cap 100 + glitchReady einmalig', () => {
    const { p, bus } = setup();
    let ready = 0; bus.on('glitchReady', () => ready++);
    addGlitchEnergy(p, 90); addGlitchEnergy(p, 90); addGlitchEnergy(p, 90);
    expect(p.glitch.energy).toBe(100); expect(ready).toBe(1);
  });
  it('Mutator glitchGainMul', () => {
    const { p } = setup({ player: { glitchGainMul: 1.5 } });
    addGlitchEnergy(p, 10); expect(p.glitch.energy).toBe(15);
  });
});

describe('Glitch-Modus', () => {
  it('Aktivierung nur bei 100, Dauer 8 s, Hooks, Events', () => {
    const { p, bus, calls } = setup();
    const ev = []; bus.on('glitchStart', () => ev.push('S')); bus.on('glitchEnd', () => ev.push('E'));
    addGlitchEnergy(p, 99);
    expect(activateGlitch(p)).toBe(false);
    addGlitchEnergy(p, 1);
    expect(activateGlitch(p)).toBe(true);
    expect(activateGlitch(p)).toBe(false);
    expect(calls).toEqual(['start']);
    let t = 0;
    while (p.glitch.active && t < 20) { tickGlitch(p, 0.1); t += 0.1; }
    expect(t).toBeGreaterThan(7.9); expect(t).toBeLessThan(8.2);
    expect(ev).toEqual(['S', 'E']);
    expect(calls.at(-1)).toBe('end'); expect(calls.filter((c) => c === 'tick').length).toBeGreaterThan(70);
    expect(p.glitch.energy).toBe(0);
  });
  it('Schadensbonus x1,3, glitchDmg-Statistik, onHit-Hook, keine Energie im Modus', () => {
    const { p, bus, h, calls } = setup();
    expect(glitchDmgMul(p)).toBe(1);
    addGlitchEnergy(p, 100); activateGlitch(p);
    expect(glitchDmgMul(p)).toBe(1.3);
    const base = calcDamage({ power: 100, mv: 100 }).total;
    expect(calcDamage({ power: 100, mv: 100, extra: glitchDmgMul(p) }).total).toBeCloseTo(base * 1.3);
    bus.emit('hit', { player: p, monster: mon, dmg: 40 });
    expect(h.stats.glitchDmg).toBe(40); expect(calls).toContain('hit:40');
    expect(addGlitchEnergy(p, 35)).toBe(0);
  });
});

describe('Input / Layout / Netz', () => {
  it('Button glitch existiert und liefert pressed', () => {
    const i = createInput();
    i.set('glitch', true, 'kbd'); i.poll(0.016);
    expect(i.b.glitch.pressed).toBe(true);
  });
  it('Touch-Layout: glitch-Button >= 44 px, ueberlappungsfrei', () => {
    const L = solveLayout(844, 390, {});
    expect(L.buttons.glitch.vis).toBeGreaterThanOrEqual(44); expect(L.buttons.glitch.hit).toBeGreaterThanOrEqual(44);
    expect(checkLayout(L, 844, 390)).toEqual([]);
  });
  it('Net-Event encode/decode', () => {
    expect(decodeGlitch(encodeGlitch(true))).toEqual({ on: true });
    expect(decodeGlitch(JSON.parse(JSON.stringify(encodeGlitch(false))))).toEqual({ on: false });
    expect(decodeGlitch({ k: 'ko' })).toBeNull();
  });
  it('Konstanten', () => { expect(GLITCH).toMatchObject({ MAX: 100, DURATION: 8, DMG_MUL: 1.3 }); });
});
