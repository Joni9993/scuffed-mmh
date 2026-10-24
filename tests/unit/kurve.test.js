// Kurven-Überarbeitung Okt 2026 (docs/KURVE.md): Bausteine (kurve.js) und die Verhaltens-Änderungen je Brocken.
// Die Druck-Zahlen selbst prüft curve.metric.test.js; hier: Bausteine, neue Angriffe (Reichweite, Determinismus, Telegraph), Anti-Umkreisen.
import { describe, it, expect, beforeEach } from 'vitest';
import { make, makeCtx, DT } from './p3helpers.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { AttackInstance, MIN_TELEGRAPH } from '../../src/game/monsters/attack.js';
import { capTired, trackTarget, leadAim, hagel } from '../../src/game/monsters/kurve.js';
import { krachfaust, KRACH, wut } from '../../src/game/monsters/krachfaust.js';
import { brathalos } from '../../src/game/monsters/brathalos.js';
import { kroll } from '../../src/game/monsters/kroll.js';
import { gorgo } from '../../src/game/monsters/gorgo.js';
import { voltaro } from '../../src/game/monsters/voltaro.js';
import { time } from '../../src/core/time.js';

beforeEach(() => time.reset());

/** Ein Angriff gegen einen stehenden (god-)Pirscher im Abstand d (+z): Summe des Schadens, der durchkommt. */
function hitDmg(def, attackId, d, { seed = 4, phase = 0 } = {}) {
  const { ctx, m, p } = make({ ...def, hp: 1e8 }, 'combat', 0, d, 7);
  p.god = true; m.phase = phase; m.recover = 99;
  let dmg = 0;
  const orig = p.takeHit.bind(p);
  p.takeHit = (h) => { const r = orig(h); if (h.dmg > 0 && r !== 'iframe' && r !== 'ignored') dmg += h.dmg * (h.dmgMul ?? 1); return r; };
  const inst = m.startAttack({ attackId, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: d }, seed });
  for (let i = 0; i < (inst.duration + 0.5) / DT; i++) { ctx.input.poll(DT); p.update(DT); m.update(DT); m.recover = 99; }
  return dmg;
}

describe('kurve.js: Bausteine', () => {
  it('capTired kürzt das Keuchen nur beim Eintritt; skip lässt lange Fenster in Ruhe', () => {
    const m = { tired: true, tiredT: 5.5 };
    capTired(m, 3.2);
    expect(m.tiredT).toBe(3.2);
    m.tiredT = 4; capTired(m, 3.2); // gleiche Erschöpfung: nicht noch einmal kürzen
    expect(m.tiredT).toBe(4);
    m.tired = false; capTired(m, 3.2); m.tired = true; m.tiredT = 6; capTired(m, 3.2, true); // neue Erschöpfung, aber skip
    expect(m.tiredT).toBe(6);
  });

  it('leadAim: Ziel + Geschwindigkeit * lead, bei 8 m gekappt, ohne lead kein Vorhalten; aimYaw dreht höchstens 0,6 rad', () => {
    const m = { _tv: { x: 3, z: 0 }, pos: { x: 0, z: 0 }, rot: 0 };
    const tgt = { pos: { x: 0, y: 0, z: 6 } };
    expect(leadAim(m, {}, tgt)).toBeNull();
    expect(leadAim(m, { lead: 1 }, tgt).pos).toEqual({ x: 3, y: 0, z: 6 });
    expect(leadAim(m, { lead: 9 }, tgt).pos.x).toBeCloseTo(8, 6);
    const r = leadAim(m, { lead: 1, aimYaw: true }, tgt);
    expect(Math.abs(r.yaw)).toBeLessThanOrEqual(0.6 + 1e-9);
    expect(r.yaw).toBeGreaterThan(0.3); // Ziel läuft nach +x -> Blick dreht zu +x
  });

  it('trackTarget glättet die Geschwindigkeit und filtert Teleports (> 14 m/s)', () => {
    const p = { id: 1, pos: { x: 0, z: 0 } }, m = { target: p };
    trackTarget(m, DT);
    for (let i = 0; i < 60; i++) { p.pos.x += 5 * DT; trackTarget(m, DT); }
    expect(m._tv.x).toBeGreaterThan(4);
    p.pos.x += 30; trackTarget(m, DT); // Teleport
    expect(m._tv.x).toBeLessThan(5);
  });

  it('hagel: n Aufschlag-Geschosse, erstes mittig aufs Vorhalte-Ziel, gleiche params -> gleiche Bahnen', () => {
    const atk = hagel({ id: 'x_hagel', n: 4, t0: 0.9, step: 0.2, lead: 0.5, range: [5, 20], telegraph: 0.8, duration: 2.4 });
    expect(atk.events).toHaveLength(4);
    expect(atk.hits).toEqual([]);
    const spawn = () => {
      const ctx = makeCtx(5), defs = [];
      const m = { projectiles: { spawn: (d) => defs.push(d) }, id: 'x' };
      const inst = new AttackInstance(atk, { attackId: 'x_hagel', t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 2, y: 0, z: 12 }, seed: 9 });
      for (const e of atk.events) atk.calls[e.call](m, ctx, inst, 0);
      return defs;
    };
    const a = spawn(), b = spawn();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a[0].to.x).toBeCloseTo(2, 6); expect(a[0].to.z).toBeCloseTo(12, 6);
    for (const d of a) expect(d.mode).toBe('impact');
    for (const d of a.slice(1)) { const r = Math.hypot(d.to.x - 2, d.to.z - 12); expect(r).toBeGreaterThanOrEqual(1.8 - 1e-6); expect(r).toBeLessThanOrEqual(3.4 + 1e-6); }
  });
});

describe('Krachfaust: Kurve (Nahzone, Ausdauer, Zornmarsch)', () => {
  const A = krachfaust.attacks;
  it('neue Angriffe: Telegraph, Cue (Neongrün), audit, Marker aus den Treffern, in den Ketten erreichbar', () => {
    for (const id of ['krachfaust_klatscher', 'krachfaust_schulter', 'krachfaust_zornmarsch']) {
      const a = A[id];
      expect(a, id).toBeTruthy();
      expect(a.telegraph).toBeGreaterThanOrEqual(MIN_TELEGRAPH);
      expect(a.cue.noShift).toBe(true);
      expect(a.audit?.length).toBeGreaterThan(0);
      expect(a.markerFromHits).toBe(true);
      expect(Object.values(krachfaust.chains).some((l) => l.some((o) => o.atk === id)), id).toBe(true);
    }
    expect(A.krachfaust_klatscher.punishRoll).toBe(true); // Anti-Rollen-Druck
    expect(Math.max(...Object.values(A).flatMap((a) => (a.hits ?? []).map((h) => h.dmg)))).toBeLessThanOrEqual(85);
  });

  it('Nahzone: Klatscher trifft am Körper (2 m) und auf Nahkampf-Abstand (4,5 m), Schulter auch auf 8 m; Fäuste landen weiter vorn', () => {
    expect(hitDmg(krachfaust, 'krachfaust_klatscher', 2)).toBeGreaterThan(50);
    expect(hitDmg(krachfaust, 'krachfaust_klatscher', 4.5)).toBeGreaterThan(50);
    expect(hitDmg(krachfaust, 'krachfaust_schulter', 3)).toBeGreaterThan(50);
    expect(hitDmg(krachfaust, 'krachfaust_schulter', 8)).toBeGreaterThan(50);
  });

  it('Zornmarsch nur in der Runenwut; der Brüller (Phase-Special) hängt ihn als Kettenglied an; vier Stampfer, letzter wirft um', () => {
    const z = A.krachfaust_zornmarsch;
    const { m } = make({ ...krachfaust, hp: 1e8 }, 'combat', 0, 6, 3);
    expect(z.cond(m)).toBe(false);
    m.phase = 1; expect(wut(m)).toBe(true); expect(z.cond(m)).toBe(true);
    expect(z.hits).toHaveLength(4);
    expect(z.hits[3]).toMatchObject({ knock: 'down', dmg: 72 });
    expect(krachfaust.chains.krachfaust_runenwut.some((o) => o.atk === 'krachfaust_zornmarsch')).toBe(true);
    expect(hitDmg(krachfaust, 'krachfaust_zornmarsch', 6, { phase: 1 })).toBeGreaterThan(40);
  });

  it('Ausdauer ~0,5x und Keuchen max. 3 s (Runenwut 2,2 s); nach dem Urknall bleiben es 6 s', () => {
    for (const a of Object.values(A)) if (a.stam) expect(a.stam, a.id).toBeLessThanOrEqual(8);
    const { m } = make({ ...krachfaust, hp: 1e8 }, 'combat', 0, 20, 3);
    m._taught = true; m.stamina = 0;
    m.update(DT); m.update(DT);
    expect(m.tired).toBe(true);
    expect(m.tiredT).toBeLessThanOrEqual(KRACH.TIRED + 1e-9);
    // Wut
    const w = make({ ...krachfaust, hp: 1e8 }, 'combat', 0, 20, 3).m;
    w._taught = true; w.phase = 1; w.stamina = 0; w.update(DT); w.update(DT);
    expect(w.tiredT).toBeLessThanOrEqual(KRACH.TIRED_WUT + 1e-9);
    // Finish-Fenster nach dem Urknall
    const u = make({ ...krachfaust, hp: 1e8 }, 'combat', 0, 20, 3).m;
    krachfaust.onAttackEnd(u, 'krachfaust_urknall');
    u.update(DT); u.update(DT);
    expect(u.tired).toBe(true); expect(u.tiredT).toBeGreaterThan(5);
  });

  it('weniger Faust-Lärm am Körper: Fäuste werden aus der toten Zone seltener gewählt als weiter draußen', () => {
    const { m } = make({ ...krachfaust, hp: 1e8 }, 'combat', 0, 3, 3);
    for (const id of ['krachfaust_schleimfaust', 'krachfaust_hammer', 'krachfaust_hornschlag']) {
      const a = A[id];
      expect(a.weight(m, 2), id).toBeLessThan(a.weight(m, 6));
    }
    expect(A.krachfaust_klatscher.weight(m, 2)).toBeGreaterThan(A.krachfaust_klatscher.weight(m, 7));
  });
});

describe('Brathalos: Kurve (Nahkampf am Boden, Vorhalten)', () => {
  const A = brathalos.attacks;
  it('neue Angriffe: Biss, Flammenkranz, Glutregen (Telegraph >= 0,5 s, audit, Ketten)', () => {
    for (const id of ['brathalos_biss', 'brathalos_kranz', 'brathalos_glutregen']) {
      const a = A[id];
      expect(a, id).toBeTruthy();
      expect(a.telegraph).toBeGreaterThanOrEqual(MIN_TELEGRAPH);
      expect(a.audit?.length).toBeGreaterThan(0);
      expect(a.cue.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(Object.values(brathalos.chains).some((l) => l.some((o) => o.atk === id)), id).toBe(true);
    }
    expect(A.brathalos_kranz.punishRoll).toBe(true);
  });

  it('Nahzone: Schnabelhieb trifft auf 3 und 5 m, Flammenkranz auch am Körper (2 m) und auf 4,5 m', () => {
    expect(hitDmg(brathalos, 'brathalos_biss', 3)).toBeGreaterThan(30);
    expect(hitDmg(brathalos, 'brathalos_biss', 5)).toBeGreaterThan(30);
    expect(hitDmg(brathalos, 'brathalos_kranz', 2)).toBeGreaterThan(25);
    expect(hitDmg(brathalos, 'brathalos_kranz', 4.5)).toBeGreaterThan(25);
  });

  it('Glutregen: vier Aufschlag-Geschosse mit Marker, ab 7 m; trifft den stehenden Pirscher in 12 m', () => {
    expect(A.brathalos_glutregen.events).toHaveLength(4);
    expect(A.brathalos_glutregen.range[0]).toBeGreaterThanOrEqual(7);
    expect(A.brathalos_glutregen.hits).toEqual([]);
  });

  it('Vorhalten: Feuerball zielt auf die Stelle, an der der laufende Pirscher gleich steht (host-autoritativ in params, deterministisch)', () => {
    const { m, p } = make({ ...brathalos, hp: 1e8 }, 'combat', 0, 10, 3);
    m._tv = { x: 4, z: 0 }; m.recover = 99;
    const inst = m.beginAttack('brathalos_feuer', { tgMul: 1 });
    expect(inst.params.targetPos.x).toBeCloseTo(p.pos.x + 4 * A.brathalos_feuer.lead, 6);
    expect(inst.params.targetPos.x).toBeGreaterThan(p.pos.x + 3);
    m.attack = null;
    m._tv = { x: 0, z: 0 };
    expect(m.beginAttack('brathalos_feuer', { tgMul: 1 }).params.targetPos.x).toBeCloseTo(p.pos.x, 6); // stehendes Ziel: kein Versatz
  });

  it('ist der Aufflug fällig, endet die Kette; sonst Ketten bis 4 Glieder; Keuchen max. 3,2 s', () => {
    const { m } = make({ ...brathalos, hp: 1e8 }, 'combat', 0, 20, 3);
    m.flyCd = 5; expect(brathalos.chainMax(m)).toBe(3);
    m.flyCd = 0; expect(brathalos.chainMax(m)).toBe(0);
    m._taught = true; m.flyCd = 1e9; m.stamina = 0; m.update(DT); m.update(DT);
    expect(m.tired).toBe(true); expect(m.tiredT).toBeLessThanOrEqual(3.2 + 1e-9);
  });

  it('Flammenstoß: auch mit heilen Flügeln ab dem Glutsturm (Phase 2), davor nur nach Flügelbruch', () => {
    const { m } = make({ ...brathalos, hp: 1e8 }, 'combat', 0, 5, 3);
    expect(A.brathalos_flammenstoss.cond(m)).toBe(false);
    m.phase = 1; expect(A.brathalos_flammenstoss.cond(m)).toBe(true);
  });
});

describe('Kroll: Seitrammer rammt auf den Pirscher zu', () => {
  const a = kroll.attacks.kroll_seitrammer;
  const inst = (target, yaw = 0) => new AttackInstance(a, { attackId: a.id, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw, targetPos: target, seed: 1 });
  it('Ziel frontal: Körper dreht die Flanke zum Ziel, Ramme läuft 12 m durch das Ziel', () => {
    const i = inst({ x: 0, y: 0, z: 5 });
    const end = i.sample(i.duration);
    expect(end.z).toBeGreaterThan(11); expect(Math.abs(end.x)).toBeLessThan(0.5);
    const mid = i.sample(i.tgWall * 0.95); // Ende der Ansage: quer zur Laufrichtung
    expect(Math.abs(Math.abs(mid.yaw % (2 * Math.PI)) - Math.PI / 2)).toBeLessThan(0.35);
  });
  it('Ziel seitlich: wie bisher quer, 12 m', () => {
    const i = inst({ x: 4, y: 0, z: 1 });
    const end = i.sample(i.duration);
    expect(Math.hypot(end.x, end.z)).toBeCloseTo(12, 0);
    expect(end.x * 1 + end.z * 0.25).toBeGreaterThan(11.5); // Richtung (4,1)
  });
  it('Ziel direkt am Körper (< 1,5 m): Rückfall auf den Seitenramm quer zur Blickrichtung', () => {
    const end = (() => { const i = inst({ x: 0.5, y: 0, z: 0.5 }); return i.sample(i.duration); })();
    expect(Math.abs(end.x)).toBeGreaterThan(11); expect(Math.abs(end.z)).toBeLessThan(0.5);
  });
  it('Vorhalten: Scherenhiebe und Ramme tragen lead; Keuchen max. 3,2 s', () => {
    expect(kroll.attacks.kroll_zange.lead).toBeGreaterThan(0);
    expect(kroll.attacks.kroll_griff.lead).toBeGreaterThan(0);
    expect(a.lead).toBeGreaterThan(0);
    expect(kroll.aimTarget).toBe(leadAim);
  });
});

describe('Gorgo: Schlackenhagel, Vorhalten der Durchbrüche', () => {
  const h = gorgo.attacks.gorgo_hagel;
  it('Hagel: 5 Klumpen ab 7 m, Rost, Aufschlag-Marker; Durchbrüche führen vor', () => {
    expect(h).toBeTruthy();
    expect(h.telegraph).toBeGreaterThanOrEqual(MIN_TELEGRAPH);
    expect(h.events).toHaveLength(5);
    expect(h.range[0]).toBeGreaterThanOrEqual(7);
    expect(h.audit?.length).toBeGreaterThan(0);
    expect(gorgo.attacks.gorgo_stoss.lead).toBeGreaterThan(0);
    expect(gorgo.attacks.gorgo_durchbruch.lead).toBeGreaterThan(0);
    expect(Object.values(gorgo.chains).some((l) => l.some((o) => o.atk === 'gorgo_hagel'))).toBe(true);
  });
  it('Hagel feuert 5 Aufschlag-Geschosse mit Rost, deterministisch', () => {
    const run = () => {
      const { ctx, m } = make({ ...gorgo, hp: 1e8 }, 'combat', 0, 12, 3);
      m.recover = 99;
      const defs = [];
      m.projectiles = { spawn: (d) => defs.push(d), update() {}, clear() {} };
      m.startAttack({ attackId: 'gorgo_hagel', t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 1, y: 0, z: 12 }, seed: 5 });
      for (let i = 0; i < 3 / DT; i++) { m.update(DT); m.recover = 99; }
      return defs;
    };
    const a = run(), b = run();
    expect(a).toHaveLength(5);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (const d of a) { expect(d.mode).toBe('impact'); expect(d.status.type).toBe('rost'); }
  });
});

describe('Voltaro: Funkenschauer, Vorhalten, Ausdauer', () => {
  const f = voltaro.attacks.voltaro_funkenschauer;
  it('Funkenschauer: 5 Blitze, auch ohne Überladen, Telegraph + Vorwarnung >= 0,5 s, in Ketten', () => {
    expect(f).toBeTruthy();
    expect(f.telegraph).toBeGreaterThanOrEqual(MIN_TELEGRAPH);
    expect(f.audit?.length).toBeGreaterThan(0);
    expect(f.cond).toBeUndefined();
    expect(Object.values(voltaro.chains).some((l) => l.some((o) => o.atk === 'voltaro_funkenschauer'))).toBe(true);
  });
  it('plant fünf Einschläge auf das Vorhalte-Ziel, deterministisch aus dem Seed', () => {
    const run = () => {
      const { m } = make({ ...voltaro, hp: 1e8 }, 'combat', 0, 12, 3);
      m.recover = 99;
      m.startAttack({ attackId: 'voltaro_funkenschauer', t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 2, y: 0, z: 12 }, seed: 7 });
      for (let i = 0; i < 1.2 / DT; i++) { m.update(DT); m.recover = 99; }
      return m._bolts.map((b) => [Math.round(b.x * 100), Math.round(b.z * 100), b.dmg, +(b.warnAt - 0).toFixed(2) >= 0]);
    };
    const a = run(), b = run();
    expect(a.length).toBe(5);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a[0][0]).toBe(200); expect(a[0][1]).toBe(1200); // erster Einschlag mittig auf dem Ziel
  });
  it('Hiebe/Blitzmuster führen vor, zweiter Hieb setzt näher an, Ausdauer gesenkt', () => {
    for (const id of ['voltaro_pranken', 'voltaro_pranken2', 'voltaro_pranken3', 'voltaro_blitzfeld']) expect(voltaro.attacks[id].lead, id).toBeGreaterThan(0);
    expect(voltaro.aimTarget).toBe(leadAim);
    expect(voltaro.attacks.voltaro_pranken2.hits[0].radius).toBeGreaterThan(1.9);
    for (const a of Object.values(voltaro.attacks)) if (a.stam) expect(a.stam, a.id).toBeLessThanOrEqual(6);
  });
});
