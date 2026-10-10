// Voltaro-Rework (Okt 2026): Prankenhieb mit Ausfallschritt, Blitzfeld (Muster, gestaffelt, ausweichbar), Funkenlauf mit Nachdrehen,
// Überladen-Flag im Seed, Ketten (Sprung -> Pranken/Blitzfeld), Optik-Eckdaten.
import { describe, it, expect } from 'vitest';
import { make, DT } from './p3helpers.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { voltaro, fieldPoints, OVER_FLAG, buildVoltaro } from '../../src/game/monsters/voltaro.js';

const def = { ...voltaro, hp: 1e8 };
const inst = (id, d, seed = 3, extra = {}) => new AttackInstance(voltaro.attacks[id], { attackId: id, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: d }, seed, ...extra });
const spy = (p) => { const hits = []; const o = p.takeHit.bind(p); p.takeHit = (h) => { const r = o(h); if (h.dmg > 0 && (r === 'hit' || r === 'block')) hits.push({ dmg: h.dmg, attackId: h.attackId }); return r; }; return hits; };
const patternOf = (seed) => Math.min(2, Math.floor(new AttackInstance(voltaro.attacks.voltaro_blitzfeld, { attackId: 'voltaro_blitzfeld', t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 9 }, seed }).r(0) * 3));
const seedFor = (pat) => { for (let s = 1; s < 200; s++) if (patternOf(s) === pat) return s; throw new Error('kein Seed'); };

describe('Voltaro-Rework: Prankenhieb mit Ausfallschritt', () => {
  it.each([4, 4.5, 5])('trifft einen stehenden Pirscher auf %s m', (d) => {
    const { ctx, m, p } = make(def, 'combat', 0, d, 5);
    const hits = spy(p);
    m.recover = 99;
    m.beginAttack('voltaro_pranken');
    for (let i = 0; i < 2.5 / DT; i++) { m.recover = 99; ctx.input.poll(DT); p.update(DT); m.update(DT); }
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].dmg).toBeGreaterThanOrEqual(30);
  });
  it('Ausfallschritt schiebt 3–4 m vor, dreht zum Ziel (auch seitlich) und steht vor dem Treffer', () => {
    const i = inst('voltaro_pranken', 8, 3, { yaw: 0.9 });
    const end = i.sample(i.duration - 0.01);
    const trav = Math.hypot(end.x, end.z);
    expect(trav).toBeGreaterThanOrEqual(3);
    expect(trav).toBeLessThanOrEqual(4);
    // zum Zeitpunkt des ersten Treffers schaut er auf das Ziel (0,0,8) -> yaw ~ 0
    const at = i.sample(i.firstHitTime() + 0.02);
    expect(Math.abs(at.yaw)).toBeLessThan(0.05);
    // Zielabstand klein -> kürzerer Schritt, kein Durchlaufen
    const near = inst('voltaro_pranken', 2.5), e2 = near.sample(near.duration - 0.01);
    expect(Math.hypot(e2.x, e2.z)).toBeLessThan(1.6);
  });
  it('Kombo 2–3 Hiebe: Kette pranken -> pranken2 -> pranken3', () => {
    const { ctx, m } = make(def, 'combat', 0, 4.5, 5);
    ctx.players.forEach((q) => { q.god = true; });
    const seq = [];
    ctx.bus.on('monsterAttack', (e) => seq.push(e.attackId));
    let found = false;
    for (let s = 1; s < 25 && !found; s++) {
      seq.length = 0;
      const mm = make(def, 'combat', 0, 4.5, s);
      mm.p.god = true;
      mm.ctx.bus.on('monsterAttack', (e) => seq.push(e.attackId));
      mm.m._taught = true;
      mm.m.beginAttack('voltaro_pranken');
      for (let i = 0; i < 9 / DT; i++) { mm.p.pos.set(0, 0, 4.5); mm.m.update(DT); if (seq.length >= 3) break; }
      found = seq.slice(0, 3).join() === 'voltaro_pranken,voltaro_pranken2,voltaro_pranken3';
    }
    expect(found).toBe(true);
  });
  it('Ketten: Sprung (Spulen/Plasma) -> Pranken oder Blitzfeld', () => {
    for (const id of ['voltaro_spulen', 'voltaro_plasma']) {
      const ids = voltaro.chains[id].map((o) => o.atk);
      expect(ids).toContain('voltaro_pranken');
      expect(ids).toContain('voltaro_blitzfeld');
    }
  });
});

describe('Voltaro-Rework: Blitzfeld', () => {
  it.each([0, 1, 2])('Muster %i: 4–6 Punkte, gestaffelt, ausweichbar (sichere Lücke <= 4,5 m vom Ziel)', (pat) => {
    const i = inst('voltaro_blitzfeld', 9, seedFor(pat));
    for (const over of [false, true]) {
      const pts = fieldPoints(i, over);
      expect(pts.length).toBeGreaterThanOrEqual(4);
      expect(pts.length).toBeLessThanOrEqual(6);
      const ds = pts.map((q) => q.d);
      for (let k = 1; k < ds.length; k++) expect(ds[k] - ds[k - 1]).toBeGreaterThanOrEqual(0.2 - 1e-9);
      const r = 2.0 + (over ? 0.3 : 0) + 0.45; // Radius + Pirscher-Kapsel
      let best = Infinity;
      for (let x = -9; x <= 9; x += 0.25) for (let z = 0; z <= 18; z += 0.25) {
        if (pts.some((q) => Math.hypot(q.x - x, q.z - z) <= r)) continue;
        best = Math.min(best, Math.hypot(x, z - 9));
      }
      expect(best).toBeLessThanOrEqual(4.5);
    }
  });
  it('Detonationen: Marker >= 0,6 s vorher, gestaffelte Zeiten; Stehenbleiben tut weh, Lücke nutzen nicht', () => {
    for (const pat of [0, 1, 2]) {
      const run = (dodge) => {
        const { ctx, m, p } = make(def, 'combat', 0, 9, 5);
        const hits = spy(p);
        const seed = seedFor(pat);
        m.recover = 99;
        m.startAttack({ attackId: 'voltaro_blitzfeld', t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 9 }, seed });
        let bolts = null, safe = null;
        for (let i = 0; i < 4.2 / DT; i++) {
          m.recover = 99;
          if (!bolts && m._bolts.length) {
            bolts = m._bolts.map((b) => ({ ...b }));
            if (dodge) { // nächste sichere Stelle suchen und hinlaufen (Teleport = beste Reaktion nach der Warnung)
              let best = Infinity;
              for (let x = -9; x <= 9; x += 0.25) for (let z = 0; z <= 18; z += 0.25) if (!bolts.some((b) => Math.hypot(b.x - x, b.z - z) <= b.r + 0.6) && Math.hypot(x, z - 9) < best) { best = Math.hypot(x, z - 9); safe = [x, z]; }
            }
          }
          if (safe) p.pos.set(safe[0], 0, safe[1]);
          m.update(DT);
        }
        return { bolts, hits };
      };
      const stay = run(false), dodge = run(true);
      expect(stay.bolts.length).toBeGreaterThanOrEqual(4);
      expect(stay.bolts.length).toBeLessThanOrEqual(6);
      for (const b of stay.bolts) expect(b.at - b.warnAt).toBeGreaterThanOrEqual(0.6 - 1e-9);
      const ats = stay.bolts.map((b) => b.at).sort((a, b) => a - b);
      for (let k = 1; k < ats.length; k++) expect(ats[k] - ats[k - 1]).toBeGreaterThan(0.1);
      expect(ats[ats.length - 1] - ats[0]).toBeGreaterThan(0.8);
      if (pat !== 2) expect(stay.hits.length).toBeGreaterThanOrEqual(1);
      expect(dodge.hits.length).toBe(0);
    }
  });
  it('deterministisch: gleiche Parameter -> gleiche Punkte', () => {
    const a = fieldPoints(inst('voltaro_blitzfeld', 11, 77)), b = fieldPoints(inst('voltaro_blitzfeld', 11, 77));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('Voltaro-Rework: Funkenlauf', () => {
  it('Sturmangriff: läuft übers Ziel hinaus, dreht 1x um 180°, läuft zurück und endet mit Schwanz-Schlag', () => {
    const d = 11, i = inst('voltaro_funkenlauf', d, 3);
    const tw = (tau) => i.wall(tau);
    const p1 = i.sample(tw(1.55)), mid = i.sample(tw(2.05)), p2 = i.sample(tw(2.65));
    expect(p1.z).toBeGreaterThan(d + 3); // übers Ziel hinaus
    expect(Math.abs(Math.abs(mid.yaw - p1.yaw) - Math.PI)).toBeLessThan(0.05); // genau eine Halbdrehung
    expect(p2.z).toBeLessThan(d); // zurück durchs Ziel
    // Yaw dreht nur im Drehfenster (1x nachdrehen), davor/danach konstant
    expect(Math.abs(i.sample(tw(1.3)).yaw - p1.yaw)).toBeLessThan(1e-6);
    expect(Math.abs(i.sample(tw(2.4)).yaw - mid.yaw)).toBeLessThan(1e-6);
    // Schwanz-Schlag: Kapsel nach hinten, Treffer erst nach der Rückkehr, Fächer < 60° (seitliches Ausweichen entkommt)
    const tail = voltaro.attacks.voltaro_funkenlauf.hits.at(-1);
    expect(tail.shape).toBe('capsule');
    expect(tail.t0).toBeGreaterThan(2.65);
    const yaws = [2.7, 2.8, 2.9, 3.0, 3.1, 3.2].map((t) => i.sample(tw(t)).yaw);
    expect(Math.max(...yaws) - Math.min(...yaws)).toBeLessThan(1.7);
    // ein stehender Pirscher im Ziel wird getroffen (Rückstoß/Schutzzeit nach dem ersten Treffer verhindert nicht den Treffer selbst)
    const { ctx, m, p } = make(def, 'combat', 0, d, 5);
    const hits = spy(p);
    m.recover = 99;
    m.beginAttack('voltaro_funkenlauf');
    for (let k = 0; k < 6 / DT; k++) { m.recover = 99; ctx.input.poll(DT); p.update(DT); m.update(DT); }
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Voltaro-Rework: Überladen & Werte', () => {
  it('Seed-Flag (Bit 30): Hauptangriffe laufen nach dem Telegraph schneller, Telegraph bleibt >= 0,5 s', () => {
    for (const id of ['voltaro_pranken', 'voltaro_funkenlauf', 'voltaro_blitzfeld', 'voltaro_spulen']) {
      const a = inst(id, 6, 5), b = inst(id, 6, 5 | OVER_FLAG);
      expect(b.duration).toBeLessThan(a.duration * 0.95);
      if (voltaro.attacks[id].hits.length) expect(b.firstHitTime()).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
  });
  it('Überladen: Ketten brechen nicht ab (kein null-Glied), Blitzfeld wird häufiger gewählt', () => {
    const { m } = make(def, 'combat', 0, 9);
    const w = voltaro.attacks.voltaro_blitzfeld.weight;
    const base = w(m);
    m.over = 30;
    expect(w(m)).toBeGreaterThan(base);
    for (const list of Object.values(voltaro.chains)) for (const o of list) if (o.atk === null && o.cond) expect(o.cond(m, 5)).toBe(false);
  });
  it('Kettenblitz im Überladen setzt zwei markierte Nachzünder', () => {
    const { ctx, m } = make(def, 'combat', 0, 12);
    m.over = 30;
    m.startAttack({ attackId: 'voltaro_kettenblitz', t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 12 }, seed: 3 | OVER_FLAG });
    let seen = 0;
    for (let i = 0; i < 1.6 / DT; i++) { m.recover = 99; m.update(DT); seen = Math.max(seen, m._bolts.length); }
    expect(seen).toBeGreaterThanOrEqual(2);
  });
  it('HP 18500, Rohschaden JR6-Niveau, Optik: 4 Spulentürme + Kopfkranz + Schwanz mit Teil-IDs', () => {
    expect(voltaro.hp).toBe(18500);
    expect(voltaro.attacks.voltaro_pranken.hits[0].dmg).toBeGreaterThanOrEqual(35);
    const b = buildVoltaro({ scale: 2.4 });
    expect(b.partMeshes.spulen.length).toBeGreaterThanOrEqual(20);
    expect(b.partMeshes.antennenkamm.length).toBeGreaterThanOrEqual(10);
    expect(b.partMeshes.tail.length).toBeGreaterThanOrEqual(8);
    expect(b.partMeshes.prankeL.length).toBeGreaterThan(5);
    for (const n of ['body', 'neck', 'head', 'jaw', 'comb', 'tail1', 'tail2', 'tail3', 'legFL', 'legFR', 'legRL', 'legRR']) expect(b.nodes[n]).toBeTruthy();
  });
});
