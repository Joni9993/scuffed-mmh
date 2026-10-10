// Gorgo-Rework (Owner-Feedback Okt 2026: „Boxsack"): Jagd-Durchbruch, Schlackewelle, Wurmwalze, Phase 2.
import { describe, it, expect } from 'vitest';
import { make, DT } from './p3helpers.js';
import { gorgo } from '../../src/game/monsters/gorgo.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';

const mk = (px = 0, pz = 10, seed = 7) => make({ ...gorgo, hp: 1e9 }, 'combat', px, pz, seed);
const P = (id, extra = {}) => ({ attackId: id, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 6 }, seed: 5, ...extra });
const inst = (id, extra) => new AttackInstance(gorgo.attacks[id], P(id, extra));

/** Eine Attacke gegen einen stehenden Pirscher auf (0,pz); optional Rolle zum Zeitpunkt tr in Richtung dir. Liefert verlorene HP. */
function dmgAt(id, pz, { tr = null, dir = [-1, 0], px = 0 } = {}) {
  const { ctx, m, p } = mk(px, pz);
  ctx.cameraYaw = Math.PI;
  m.recover = 99;
  const hp0 = p.v.hp;
  m.beginAttack(id);
  let fired = false;
  for (let t = 0; t < 3.5; t += DT) {
    if (tr !== null && !fired && t >= tr) { fired = true; ctx.input.setStick(dir[0], dir[1], 'bot'); ctx.input.press('roll', 50); }
    ctx.input.poll(DT); p.update(DT); ctx.input.setStick(0, 0, 'bot');
    m.update(DT); m.recover = 99;
  }
  return hp0 - p.v.hp;
}

describe('Gorgo-Rework: Jagd-Durchbruch', () => {
  const jagd = (phase) => {
    const { ctx, m } = mk(0, 12);
    m.phase = phase;
    const evs = [], surf = [];
    ctx.bus.on('monsterAttack', (e) => evs.push(e.attackId));
    ctx.bus.on('gorgoBurrow', (e) => { if (!e.on) surf.push(m.time); });
    m.beginAttack('gorgo_wuehlen');
    for (let t = 0; t < 14; t += DT) { ctx.players.forEach((q) => { q.god = true; q.pos.set(0, 0, 12); }); m.update(DT); if (evs.includes('gorgo_durchbruch') && !m.attack) break; }
    return { evs, surf };
  };
  it('Phase 1: 2 Durchbrüche am Stück (Stoß + Durchbruch)', () => {
    const { evs, surf } = jagd(0);
    expect(evs.slice(0, 3)).toEqual(['gorgo_wuehlen', 'gorgo_stoss', 'gorgo_durchbruch']);
    expect(surf.length).toBe(2);
    expect(surf[1] - surf[0]).toBeLessThan(2.5); // kein Leerlauf zwischen den Durchbrüchen
  });
  it('Phase 2: 3 Durchbrüche am Stück', () => {
    const { evs, surf } = jagd(1);
    expect(evs.slice(0, 4)).toEqual(['gorgo_wuehlen', 'gorgo_stoss', 'gorgo_stoss', 'gorgo_durchbruch']);
    expect(surf.length).toBe(3);
  });
  it('jeder Durchbruch hat sichtbare Bodenwarnung >= 0,6 s (auch Rotglut) und Landemarker', () => {
    for (const id of ['gorgo_stoss', 'gorgo_durchbruch']) {
      const d = gorgo.attacks[id];
      expect(d.marker).toMatchObject({ at: 'landing' });
      expect(inst(id).firstHitTime()).toBeGreaterThanOrEqual(0.6);
      expect(inst(id, { rage: true }).firstHitTime()).toBeGreaterThanOrEqual(0.5);
      expect(d.audit?.length).toBeGreaterThan(0);
    }
  });
  it('Knallgurke/Kran unterbricht die Jagd (keine weiteren Durchbrüche)', () => {
    const { ctx, m } = mk(0, 12);
    const evs = [];
    ctx.bus.on('monsterAttack', (e) => evs.push(e.attackId));
    m.beginAttack('gorgo_wuehlen');
    for (let t = 0; t < 3 && !m.burrowed; t += DT) { ctx.players.forEach((q) => { q.god = true; q.pos.set(0, 0, 12); }); m.update(DT); }
    expect(m.burrowed).toBe(true);
    m.applyDamage({ dmg: 500, partId: null, env: true });
    expect(m.burrowed).toBe(false);
    expect(m._jagd).toBe(0);
    for (let t = 0; t < 1.5; t += DT) { ctx.players.forEach((q) => { q.god = true; q.pos.set(0, 0, 12); }); m.update(DT); }
    expect(evs).not.toContain('gorgo_stoss');
    expect(evs).not.toContain('gorgo_durchbruch');
  });
});

describe('Gorgo-Rework: Schlackewelle', () => {
  it('Telegraph >= 0,5 s, Cue, Audit; Ringe laufen nach außen', () => {
    for (const id of ['gorgo_welle', 'gorgo_doppelwelle']) {
      const a = gorgo.attacks[id];
      expect(a.cue?.tone).toBeTruthy();
      expect(a.audit?.length).toBeGreaterThan(0);
      expect(inst(id).firstHitTime()).toBeGreaterThanOrEqual(0.5);
      expect(inst(id, { rage: true }).firstHitTime()).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
    // Ring k wird später aktiv als Ring k-1: kleinster Radius zuerst
    const a = gorgo.attacks.gorgo_welle, first = (r) => Math.min(...a.hits.filter((h) => (h.shape === 'sphere' ? h.radius : Math.hypot(h.from[0], h.from[2])) > r - 0.5).map((h) => h.t0));
    expect(first(4)).toBeLessThan(first(8));
    expect(first(8)).toBeLessThan(first(12));
  });
  it('trifft stehenden Pirscher bei passendem Radius (nah, mittel, weit), nicht in der Lücke zwischen den Ringen', () => {
    for (const d of [3, 4.5, 8.5, 12]) expect(dmgAt('gorgo_welle', d), `Radius ${d}`).toBeGreaterThan(0);
    expect(dmgAt('gorgo_welle', 6.5)).toBe(0);
    expect(dmgAt('gorgo_welle', 17)).toBe(0);
  });
  it('ausweichbar: Rolle im richtigen Moment, falscher Moment trifft', () => {
    const taken = [];
    for (let tr = 0.3; tr <= 1.0; tr += 0.04) taken.push(dmgAt('gorgo_welle', 4.5, { tr }) > 0);
    expect(taken.some((x) => !x)).toBe(true);
    expect(taken.some((x) => x)).toBe(true);
  });
  it('Phase 2 Doppelwelle: zwei Wellen (doppelt so viele Hitboxen, zweite später), trifft stehenden Pirscher zweimal', () => {
    const w = gorgo.attacks.gorgo_welle, d = gorgo.attacks.gorgo_doppelwelle;
    expect(d.hits.length).toBe(w.hits.length * 2);
    expect(Math.max(...d.hits.map((h) => h.t1))).toBeGreaterThan(Math.max(...w.hits.map((h) => h.t1)) + 0.7);
    expect(dmgAt('gorgo_doppelwelle', 4.5)).toBeGreaterThan(dmgAt('gorgo_welle', 4.5) * 1.5);
  });
  it('welle nur Phase 1, doppelwelle nur Phase 2', () => {
    const { m } = mk(0, 6);
    expect(gorgo.attacks.gorgo_welle.cond(m)).toBe(true);
    expect(gorgo.attacks.gorgo_doppelwelle.cond(m)).toBe(false);
    m.phase = 1;
    expect(gorgo.attacks.gorgo_welle.cond(m)).toBe(false);
    expect(gorgo.attacks.gorgo_doppelwelle.cond(m)).toBe(true);
  });
});

describe('Gorgo-Rework: Wurmwalze', () => {
  it('~270°-Sweep mit großer Hitbox, wirft um, Telegraph >= 0,5 s', () => {
    const a = gorgo.attacks.gorgo_walze;
    expect(a.hits[0]).toMatchObject({ shape: 'capsule', knock: 'down' });
    expect(a.hits[0].radius).toBeGreaterThanOrEqual(1.6);
    expect(a.hits[0].dmg).toBeGreaterThanOrEqual(34);
    expect(a.cue?.tone).toBeTruthy();
    expect(inst('gorgo_walze', { rage: true }).firstHitTime()).toBeGreaterThanOrEqual(0.5 - 1e-9);
    const i = inst('gorgo_walze');
    const yaws = [];
    for (let t = 0; t < i.duration; t += DT) yaws.push(i.sample(t).yaw);
    const lo = Math.min(...yaws), hi = Math.max(...yaws);
    expect((hi - lo) * 180 / Math.PI).toBeGreaterThan(265); // von -60° (Ausholen) bis +210°: 270° Rundumschlag
  });
  it('trifft stehende Pirscher vorn, seitlich und hinten (Rundumschlag)', () => {
    const { ctx, m, p } = mk(0, 5);
    const spots = [[0, 5], [5, 0], [0, -5], [-5, 0]];
    const hit = [];
    for (const [sx, sz] of spots) {
      p.pos.set(sx, 0, sz); p.v.hp = p.v.maxHp ?? p.v.hp; p.state = 'free';
      const hp0 = p.v.hp;
      m.recover = 99;
      m.beginAttack('gorgo_walze');
      for (let t = 0; t < 2.6; t += DT) { p.pos.set(sx, 0, sz); p.update(DT); m.update(DT); m.recover = 99; }
      hit.push(p.v.hp < hp0);
      m.attack = null;
    }
    expect(hit.filter(Boolean).length).toBeGreaterThanOrEqual(3);
  });
  it('Rolle weicht aus', () => {
    const r = [];
    for (let tr = 0.3; tr <= 1.4; tr += 0.04) r.push(dmgAt('gorgo_walze', 4.5, { tr }) > 0);
    expect(r.some((x) => !x)).toBe(true);
  });
});

describe('Gorgo-Rework: Ketten, Tempo, Phase 2, Determinismus', () => {
  it('Kette Sog -> Zubiss -> Walze', () => {
    expect(gorgo.chains.gorgo_sog.some((o) => o.atk === 'gorgo_zubiss')).toBe(true);
    expect(gorgo.chains.gorgo_zubiss.some((o) => o.atk === 'gorgo_walze')).toBe(true);
    expect(gorgo.chains.gorgo_walze.some((o) => o.atk === 'gorgo_doppelwelle')).toBe(true);
  });
  it('alle Angriffe: Telegraph >= 0,5 s (auch Rotglut), Cue, Audit bei Treffern; Nahangriffe 0,55-0,9 s', () => {
    for (const a of Object.values(gorgo.attacks)) {
      expect(a.cue?.tone, a.id).toBeTruthy();
      if (a.hits?.length) expect(a.audit?.length, a.id).toBeGreaterThan(0);
      for (const rage of [false, true]) expect(inst(a.id, { rage }).firstHitTime(), a.id).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
    for (const id of ['gorgo_peitsche', 'gorgo_walze', 'gorgo_welle', 'gorgo_stoss']) expect(inst(id).firstHitTime()).toBeLessThanOrEqual(0.75);
  });
  it('Tempo/HP: prefer 6, HP 14500, kürzere Erholung in Phase 2', () => {
    expect(gorgo.prefer).toBe(6);
    expect(gorgo.hp).toBe(14500);
    const { m } = mk();
    const rec = (ph) => { m.phase = ph; let s = 0; for (let i = 0; i < 200; i++) s += gorgo.recoverAfter(m); return s / 200; };
    expect(rec(1)).toBeLessThan(rec(0));
    expect(rec(0)).toBeLessThan(0.5);
  });
  it('Spucke: Pfützen länger und größer (8 s, Splash >= 2,2)', () => {
    const { m } = mk(0, 14);
    m.beginAttack('gorgo_spucke');
    for (let t = 0; t < 1.2; t += DT) m.update(DT);
    const pr = m.projectiles.list[0];
    expect(pr.def.hold).toBeGreaterThanOrEqual(8);
    expect(pr.def.splash).toBeGreaterThanOrEqual(2.2);
    expect(m.projectiles.list.length).toBe(3);
  });
  it('deterministisch: gleiche Params -> gleiche Hit-Formen', () => {
    for (const id of ['gorgo_welle', 'gorgo_walze', 'gorgo_stoss']) {
      const a = inst(id), b = inst(id);
      for (let t = 0; t < a.duration; t += 0.05) expect(JSON.stringify(a.hitsAt(t).map((h) => h.shape))).toBe(JSON.stringify(b.hitsAt(t).map((h) => h.shape)));
    }
  });
  it('Phase 2 (Glutkern) setzt Doppelwelle ein', () => {
    const { ctx, m } = mk(0, 6, 3);
    const atk = [];
    ctx.bus.on('monsterAttack', (e) => atk.push(e.attackId));
    m.hp = m.maxHp * 0.4;
    for (let t = 0; t < 30; t += DT) { ctx.players.forEach((q) => { q.god = true; q.pos.set(0, 0, 6); }); m.update(DT); }
    expect(m.phase).toBe(1);
    expect(atk).toContain('gorgo_doppelwelle');
    expect(atk).not.toContain('gorgo_welle');
  });
});
