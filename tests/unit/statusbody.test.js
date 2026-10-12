import { describe, it, expect } from 'vitest';
import { make, DT } from './p3helpers.js';
import { jaggo } from '../../src/game/monsters/jaggo.js';
import { encodeMonster, decodeMonster } from '../../src/net/protocol.js';

const snap = (o) => ({ id: 'j', def: 'jaggo', x: 0, y: 0, z: 0, rot: 0, state: 'combat', hpPct: 1, parts: [], ...o });

describe('Brocken-Koerpersprache', () => {
  it('Betaeubt: Sterne-Kranz sichtbar, Pose sackt ab, Farbe gelb', () => {
    const { m } = make(jaggo);
    m.authority = false; m.stunT = 5;
    for (let i = 0; i < 60; i++) m.update(DT);
    expect(m._sfx.stars.every((s) => s.visible)).toBe(true);
    expect(m.pose.bodyY).toBeLessThan(-0.2);
    const t = m._statusTint();
    expect(t[0]).toBeGreaterThan(0.1); expect(t[1]).toBeGreaterThan(0.1);
    m.stunT = 0;
    m.update(DT);
    expect(m._sfx.stars.some((s) => s.visible)).toBe(false);
  });

  it('mehrere Status: Farbe wechselt reihum statt nur die staerkste', () => {
    const { m } = make(jaggo);
    m.rage = true; m.st.poisonT = 10;
    const seen = new Set();
    for (let t = 0; t < 3; t += 0.1) { m.time = t; const c = m._statusTint(); seen.add(c[2] > c[0] * 0.3 ? 'poison' : 'rage'); }
    expect(seen).toEqual(new Set(['rage', 'poison']));
  });

  it('Erschoepft: Kopf haengt, Atemwolken kommen', () => {
    const { m } = make(jaggo);
    m.authority = false; m.tired = true;
    for (let i = 0; i < 120; i++) m.update(DT);
    expect(m.pose.neck).toBeGreaterThan(0.3);
    expect(m._sfx.head).toBeGreaterThan(0); // mind. eine Atemwolke gespawnt
  });

  it('Netz: Blind/Falle/Gift/Gestank kommen beim Gast an', () => {
    const d = decodeMonster(encodeMonster(snap({ blind: true, trap: true, poison: true, stink: true })));
    expect([d.blind, d.trap, d.poison, d.stink]).toEqual([true, true, true, true]);
    const n = decodeMonster(encodeMonster(snap({})));
    expect([n.blind, n.trap, n.poison, n.stink]).toEqual([false, false, false, false]);
  });
});
