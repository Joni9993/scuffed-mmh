import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createBus } from '../../src/core/events.js';
import { WeaponState } from '../../src/game/weapons/weapon.js';
import { greatsword } from '../../src/game/weapons/greatsword.js';
import { dualblades, ECHO_DELAY, ECHO_MUL } from '../../src/game/weapons/dualblades.js';
import { initGlitch, addGlitchEnergy, activateGlitch, tickGlitch, attachGlitch, glitchDmgMul } from '../../src/game/glitch.js';

const DT = 1 / 60;
function mkPlayer(def) {
  const bus = createBus();
  const h = { bus, time: 0, stats: { damage: 0, glitchDmg: 0 }, scene: new THREE.Scene(), mods: {}, calls: [] };
  const p = { local: true, id: 'p1', ctx: h, def, time: 0, glitchT: 0 };
  p.weapon = new WeaponState(def, { player: p });
  Object.defineProperty(p, 'glitching', { get: () => !!p.glitch?.active });
  Object.defineProperty(p, 'glitchDmgMul', { get: () => glitchDmgMul(p) });
  p.mesh = new THREE.Group();
  p.mesh.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
  h.player = p; h.players = [p];
  initGlitch(p);
  h.sys = attachGlitch(h);
  return { p, h, bus };
}
const inpOf = () => ({ A: { down: false, pressed: false, released: false }, B: { down: false, pressed: false, released: false } });

describe('Plattmacher Frame-Skip', () => {
  it('Aufladung ist sofort voll, +20 % nur auf dem Schlag im Modus', () => {
    const { p } = mkPlayer(greatsword);
    const w = p.weapon, inp = inpOf();
    const step = () => { w.update(DT, inp); tickGlitch(p, DT); inp.A.pressed = inp.A.released = false; };
    addGlitchEnergy(p, 100); activateGlitch(p);
    inp.A.down = inp.A.pressed = true;
    for (let i = 0; i < 16; i++) step(); // 0,27 s gehalten
    expect(w.charging).toBe(true);
    expect(w.chargeLevel).toBe(3);
    expect(greatsword.dmgMul(w)).toBe(1);
    inp.A.down = false; inp.A.released = true; step();
    expect(w.moveId).toBe('gs_c3');
    expect(greatsword.dmgMul(w)).toBeCloseTo(1.2);
    expect(glitchDmgMul(p)).toBe(1.3);
  });
  it('ohne Modus unveraendert', () => {
    const { p } = mkPlayer(greatsword);
    const w = p.weapon, inp = inpOf();
    inp.A.down = inp.A.pressed = true;
    for (let i = 0; i < 16; i++) { w.update(DT, inp); inp.A.pressed = false; }
    expect(w.chargeLevel).toBeLessThan(2);
    w.startMove('gs_c3');
    expect(greatsword.dmgMul(w)).toBe(1);
  });
});

describe('Zwillingsklingen Echo-Input', () => {
  function setup() {
    const { p, h, bus } = mkPlayer(dualblades);
    const mon = { id: 'm1', alive: true, hurtParts: () => [{ part: { id: 'head' }, pos: { x: 0, y: 1, z: 0 } }] };
    h.playerHit = (pl, m, hp, ah) => {
      const mul = pl.def.dmgMul(pl.weapon) * pl.glitchDmgMul;
      h.calls.push({ echo: !!pl.glitch._echoing, mul, part: hp.part.id, wucht: ah.hit.wucht });
      bus.emit('hit', { player: pl, monster: m, part: hp.part.id, partId: hp.part.id, dmg: Math.round(100 * mul) });
    };
    addGlitchEnergy(p, 100); activateGlitch(p);
    p.weapon.startMove('db_a1');
    return { p, h, mon };
  }
  const run = (p, h, sec) => { for (let t = 0; t < sec; t += DT) { h.time += DT; p.time += DT; tickGlitch(p, DT); } };
  it('Treffer wiederholt sich nach 0,4 s mit 70 %, ohne Echo-Kette und ohne Energie', () => {
    const { p, h, mon } = setup();
    const hit = p.weapon.move.hits[0];
    p.weapon.t = hit.t0;
    const e0 = p.glitch.energy;
    h.playerHit(p, mon, mon.hurtParts()[0], { hit });
    expect(h.calls.length).toBe(1);
    run(p, h, ECHO_DELAY - 0.1);
    expect(h.calls.length).toBe(1);
    run(p, h, 0.2);
    expect(h.calls.length).toBe(2);
    const e = h.calls[1];
    expect(e.echo).toBe(true); expect(e.part).toBe('head'); expect(e.wucht).toBe(0);
    expect(e.mul).toBeCloseTo(ECHO_MUL * 1.3);
    run(p, h, 1.0);
    expect(h.calls.length).toBe(2); // kein Echo vom Echo
    expect(p.glitch.active).toBe(true);
    expect(p.glitch.energy).toBeLessThan(e0 + 1e-9); // Energie nur sinkend (Leiste laeuft leer), nie Gewinn
  });
  it('ausserhalb des Modus Faktor 1 und kein Echo', () => {
    const { p, h, mon } = setup();
    p.glitch.active = false;
    expect(dualblades.dmgMul(p.weapon)).toBe(1);
    h.playerHit(p, mon, mon.hurtParts()[0], { hit: p.weapon.move.hits[0] });
    run(p, h, 1);
    expect(h.calls.length).toBe(1);
  });
  it('Geister-Pirscher wird einmal erzeugt und folgt zeitversetzt', () => {
    const { p, h } = setup();
    const ghosts = () => h.scene.children.filter((c) => c.name === 'glitchGhost');
    expect(ghosts().length).toBe(2);
    p.mesh.position.set(5, 0, 0);
    run(p, h, 0.2);
    p.mesh.position.set(9, 0, 0);
    run(p, h, 0.3);
    expect(ghosts()[0].position.x).toBe(5);
    expect(ghosts()[0].children[0].material.transparent).toBe(true);
    dualblades.glitch.onEnd(p);
    dualblades.glitch.onStart(p);
    expect(ghosts().length).toBe(2); // wiederverwendet
  });
});
