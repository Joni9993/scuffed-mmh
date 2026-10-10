// Kroll-Ueberarbeitung (Owner-Feedback Okt 2026): kleiner, Boxer-Haltung, Panzerdeckung + Konter, Scherengriff, kein Abrutschen am Hang.
import { describe, it, expect, beforeEach } from 'vitest';
import { Monster } from '../../src/game/monsters/monster.js';
import { kroll } from '../../src/game/monsters/kroll.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { Player } from '../../src/game/player.js';
import { createWorld } from '../../src/game/world/index.js';
import { time } from '../../src/core/time.js';
import { make, makeCtx, DT } from './p3helpers.js';

beforeEach(() => time.reset());

const mk = (seed = 7) => make({ ...kroll, hp: 1e9 }, 'combat', 0, 5, seed);
const hit = (m, p, dmg = 100) => {
  const before = m.hp;
  m.applyDamage({ dmg, elemDmg: 0, partId: 'koerper', blunt: 0, attackerId: p.id, rostBuild: 0 });
  return before - m.hp;
};
/** Angriff starten und bis nach dem Telegraph laufen lassen. */
const guardUp = (m, ctx, p) => {
  m.recover = 0;
  m.beginAttack('kroll_deckung');
  for (let i = 0; i < 0.7 / DT; i++) { p.pos.set(0, 0, 5); p.god = true; ctx.input.poll(DT); m.update(DT); }
};

describe('Kroll: Groesse und Haltung', () => {
  it('kleiner (SC 1,9 / Radius 2,2), Hit-Zonen passend, schneller und dichter', () => {
    expect(kroll.scale).toBe(1.9);
    expect(kroll.bodyRadius).toBe(2.2);
    expect(kroll.hp).toBeLessThan(15000);
    expect(kroll.run).toBeGreaterThanOrEqual(6.5);
    expect(kroll.turn).toBeLessThanOrEqual(1.1);
    for (const a of Object.values(kroll.attacks)) {
      for (const h of a.hits ?? []) {
        const pts = h.shape === 'capsule' ? [h.from, h.to] : [h.at];
        // keine Treffer-Zone startet weit hinter der Panzerung: Hoehe passend zur kleineren Krabbe (y <= 1,6 m)
        for (const p of pts) expect(p[1], a.id).toBeLessThanOrEqual(1.6);
      }
    }
    const z = kroll.attacks.kroll_zange.hits[0];
    expect(Math.max(z.from[2], z.to[2]) + z.radius).toBeLessThan(5.5); // Zange reicht ~5 m, nicht mehr 6+
  });

  it('Scheren in Boxer-Haltung (nicht starr nach vorn), Deckung hebt sie vors Gesicht', () => {
    const { m } = mk();
    const rig = m.rig ?? m;
    const armL = m.nodes.armL, foreL = m.nodes.clawL.parent;
    m.rigApply?.(m.pose);
    expect(armL.rotation.x).toBeLessThan(-0.3); // angehoben
    expect(Math.abs(armL.rotation.y)).toBeGreaterThan(0.3); // seitlich angewinkelt
    expect(Math.abs(foreL.rotation.y)).toBeGreaterThan(0.8); // Unterarm abgeknickt
    const idleBend = Math.abs(foreL.rotation.y);
    m.pose.guard = 1; m.rigApply(m.pose);
    expect(Math.abs(foreL.rotation.y)).toBeGreaterThan(idleBend);
    expect(rig).toBeTruthy();
  });
});

describe('Kroll: Panzerdeckung', () => {
  it('frontal in der Deckung -80 %, von der Seite und von hinten voll, ohne Deckung voll', () => {
    const { ctx, m, p } = mk();
    expect(hit(m, p)).toBe(100); // keine Deckung
    guardUp(m, ctx, p);
    expect(m.attack?.id).toBe('kroll_deckung');
    const front = hit(m, p);
    expect(front).toBeLessThanOrEqual(25);
    expect(front).toBeGreaterThan(0);
    p.pos.set(6, 0, 0); // Flanke (Kroll blickt +z)
    expect(hit(m, p)).toBe(100);
    p.pos.set(0, 0, -6); // Ruecken
    expect(hit(m, p)).toBe(100);
  });

  it('Treffer in der Deckung loesen einen schnellen Konterhieb aus (Telegraph am Minimum)', () => {
    const { ctx, m, p } = mk();
    const ev = [];
    ctx.bus.on('monsterAttack', (e) => ev.push(e.attackId));
    guardUp(m, ctx, p);
    hit(m, p);
    let konterAt = null;
    for (let i = 0; i < 2 / DT && konterAt === null; i++) { p.pos.set(0, 0, 5); ctx.input.poll(DT); m.update(DT); if (m.attack?.id === 'kroll_konter') konterAt = i * DT; }
    expect(ev).toContain('kroll_konter');
    expect(konterAt).toBeLessThan(0.5);
    const k = kroll.attacks.kroll_konter;
    expect(k.telegraph).toBeGreaterThanOrEqual(0.5);
    expect(k.hits[0].dmg).toBeGreaterThanOrEqual(25);
  });

  it('wird nur gewaehlt, wenn man ihn frontal zupruegelt (Hitze), Flankentreffer stauen nichts', () => {
    const { ctx, m, p } = mk();
    for (const k of Object.keys(m.cds)) m.cds[k] = 0;
    const picks = () => { const s = new Set(); for (let i = 0; i < 200; i++) s.add(m._chooseAttack(4)?.id); return s; };
    expect(picks().has('kroll_deckung')).toBe(false);
    p.pos.set(6, 0, 0);
    for (let i = 0; i < 20; i++) hit(m, p, m.maxHp * 0.01); // Flanke
    expect(picks().has('kroll_deckung')).toBe(false);
    p.pos.set(0, 0, 5);
    for (let i = 0; i < 8; i++) hit(m, p, m.maxHp * 0.01); // frontal
    expect(picks().has('kroll_deckung')).toBe(true);
    expect(ctx).toBeTruthy();
  });
});

/** Ein stehender Jaeger bei Abstand d, optionale Rolle; liefert die Treffer. */
function griffSim(d, rollAt = null, dir = 'left') {
  const ctx = makeCtx(3);
  ctx.cameraYaw = Math.PI;
  const m = new Monster({ ...kroll, hp: 1e9 }, ctx, { id: 'kroll', x: 0, z: 0, yaw: 0, state: 'combat', seed: 11 });
  m.recover = 99; ctx.monsters.push(m);
  const p = new Player({ ctx }); p.spawnAt(0, d, Math.PI); ctx.players.push(p); m.target = p;
  const taken = [];
  const orig = p.takeHit.bind(p);
  p.takeHit = (h) => { const r = orig(h); taken.push({ r, dmg: h.dmg, knock: h.knock }); return r; };
  const inst = m.beginAttack('kroll_griff');
  let fired = false;
  for (let t = 0; t < inst.duration + 1; t += DT) {
    if (rollAt !== null && !fired && t >= rollAt) { fired = true; ctx.input.setStick(dir === 'left' ? -1 : 0, dir === 'back' ? -1 : 0, 'bot'); ctx.input.press('roll', 50); }
    ctx.input.poll(DT); p.update(DT); ctx.input.setStick(0, 0, 'bot'); m.update(DT); m.recover = 99;
  }
  return taken.filter((e) => e.r === 'hit');
}

describe('Kroll: Scherengriff', () => {
  it('trifft einen stehenden Jaeger (auch aus der Distanz) hart und wirft um', () => {
    for (const d of [3, 7, 11]) {
      const h = griffSim(d);
      expect(h.length, `d=${d}`).toBeGreaterThanOrEqual(1);
      expect(h[0].knock).toBe('down');
      expect(h[0].dmg).toBeGreaterThanOrEqual(40);
    }
  });
  it('ist per Rolle ausweichbar (es gibt ein Zeitfenster ohne Treffer)', () => {
    let safe = 0;
    for (let t = 0.3; t < 1.4; t += DT * 2) if (griffSim(5, t, 'left').length === 0) safe++;
    expect(safe).toBeGreaterThan(3);
  });
  it('Telegraph >= 0,5 s, Cue vorhanden, Vorwaertsschub', () => {
    const a = kroll.attacks.kroll_griff;
    expect(a.cue.tone && a.cue.color).toBeTruthy();
    expect(a.audit.length).toBeGreaterThan(0);
    const inst = new AttackInstance(a, { attackId: a.id, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 8 }, seed: 1, tgMul: 0.5 });
    expect(inst.firstHitTime()).toBeGreaterThanOrEqual(0.5 - 1e-9);
    const end = inst.sample(inst.duration);
    expect(Math.hypot(end.x, end.z)).toBeGreaterThan(4); // schiesst nach vorn
  });
});

describe('Kroll: HP-Phase 2 und Ketten', () => {
  it('Doppelsprung nur in Phase 2; Phase 2 ist schneller und haerter', () => {
    const { ctx, m, p } = mk();
    for (const k of Object.keys(m.cds)) m.cds[k] = 0;
    const picks = () => { const s = new Set(); for (let i = 0; i < 300; i++) s.add(m._chooseAttack(11)?.id); return s; };
    expect(picks().has('kroll_doppelsprung')).toBe(false);
    const sp0 = m.speedMul, dm0 = m.dmgMul;
    m.hp = m.maxHp * 0.35;
    for (let i = 0; i < 90; i++) { p.pos.set(0, 0, 5); p.god = true; ctx.input.poll(DT); m.update(DT); m.hp = m.maxHp * 0.35; }
    expect(m.phase).toBe(1);
    for (const k of Object.keys(m.cds)) m.cds[k] = 0;
    expect(picks().has('kroll_doppelsprung')).toBe(true);
    expect(m.speedMul).toBeGreaterThan(sp0);
    expect(m.dmgMul).toBeGreaterThan(dm0);
  });
  it('neue Ketten: Seitrammer -> Griff, Sprung -> Griff, Dampf -> Seitrammer (Phase 2)', () => {
    const c = kroll.chains;
    expect(c.kroll_seitrammer.some((x) => x.atk === 'kroll_griff')).toBe(true);
    expect(c.kroll_sprung.some((x) => x.atk === 'kroll_griff')).toBe(true);
    expect(c.kroll_doppelsprung.some((x) => x.atk === 'kroll_griff')).toBe(true);
    expect(c.kroll_dampf.some((x) => x.atk === 'kroll_seitrammer' && x.cond)).toBe(true);
    for (const id of ['kroll_griff', 'kroll_deckung', 'kroll_konter', 'kroll_doppelsprung']) {
      const a = kroll.attacks[id];
      expect(a.cue?.tone && a.cue?.color, id).toBeTruthy();
      expect(a.audit?.length, id).toBeGreaterThan(0);
    }
  });
  it('deterministisch: gleiche Startparameter -> gleiche Bewegung (neue Angriffe)', () => {
    for (const id of ['kroll_griff', 'kroll_deckung', 'kroll_konter', 'kroll_doppelsprung']) {
      const p = { attackId: id, t0: 0, origin: { x: 1, y: 0, z: 2 }, yaw: 0.7, targetPos: { x: 4, y: 0, z: 12 }, seed: 42 };
      const a = new AttackInstance(kroll.attacks[id], p), b = new AttackInstance(kroll.attacks[id], p);
      for (let t = 0; t < a.duration; t += 0.05) {
        expect(a.sample(t)).toEqual(b.sample(t));
        expect(a.hitsAt(t).map((h) => h.shape)).toEqual(b.hitsAt(t).map((h) => h.shape));
      }
    }
  });
});

describe('Kroll: kein Abrutschen am Hang (Rostwerke)', () => {
  const world = createWorld('rostwerke', { seed: 1 });
  const L = world.layout;
  // Startpunkte in Krolls Zone 2 (Nest, Hang-/Klippenrand, Deck-Rampe, Mittelkamm)
  const SPOTS = [[-92, 92], [-56, 100], [-20, 90], [-30, 50], [-95, 40]];
  it.each(SPOTS)('60 s Kampf ab (%i, %i): keine Sprunege, bleibt begehbar und im Revier', (sx, sz) => {
    for (const seed of [3, 7]) {
      time.reset();
      const ctx = makeCtx(seed); ctx.world = world;
      const m = new Monster({ ...kroll, hp: 1e9 }, ctx, { id: 'kroll', x: sx, z: sz, yaw: 0, state: 'combat', seed });
      ctx.monsters.push(m);
      const p = new Player({ ctx }); p.spawnAt(sx + 8, sz + 3, Math.PI); ctx.players.push(p); m.target = p; p.god = true;
      let px = m.pos.x, pz = m.pos.z, py = m.pos.y, ang = 0, maxJ = 0, maxDy = 0, minSdf = 1e9, maxFar = 0;
      for (let t = 0; t < 60; t += DT) {
        ang += DT * 0.25;
        p.pos.set(sx + Math.sin(ang) * 14, 0, sz + Math.cos(ang) * 14); p.pos.y = world.heightAt(p.pos.x, p.pos.z);
        ctx.input.poll(DT); p.update(DT); m.update(DT);
        maxJ = Math.max(maxJ, Math.hypot(m.pos.x - px, m.pos.z - pz)); maxDy = Math.max(maxDy, Math.abs(m.pos.y - py));
        minSdf = Math.min(minSdf, L.sdfAt(m.pos.x, m.pos.z)); maxFar = Math.max(maxFar, Math.hypot(m.pos.x - sx, m.pos.z - sz));
        px = m.pos.x; pz = m.pos.z; py = m.pos.y;
      }
      expect(maxJ, `Sprung ${sx},${sz} seed ${seed}`).toBeLessThan(1.3); // nur Lunges/Ramm-Frames (<= ~0,9 m je Frame)
      expect(maxDy, 'Hoehensprung').toBeLessThan(1.0);
      expect(minSdf, 'nie in der Klippe').toBeGreaterThan(0);
      expect(maxFar, 'bleibt in der Naehe seines Jaegers (kein Wegrutschen)').toBeLessThan(45);
    }
  }, 120000);

  it('Seitrammer/Sprung/Griff werden am Gelaende gekuerzt (nie bis in die Klippe)', () => {
    const ctx = makeCtx(5); ctx.world = world;
    const m = new Monster({ ...kroll, hp: 1e9 }, ctx, { id: 'kroll', x: -56, z: 100, yaw: 0, state: 'combat', seed: 5 });
    ctx.monsters.push(m);
    for (const [id, tgt] of [['kroll_seitrammer', { x: -50, y: 0, z: 100 }], ['kroll_sprung', { x: -56, y: 0, z: 120 }], ['kroll_griff', { x: -56, y: 0, z: 118 }]]) {
      for (let yaw = 0; yaw < 6.3; yaw += 0.7) {
        const inst = m.startAttack({ attackId: id, t0: 0, origin: { x: -56, y: 0, z: 100 }, yaw, targetPos: tgt, seed: 9 });
        for (let t = 0; t < inst.duration; t += 0.05) { const s = inst.sample(t); expect(L.sdfAt(s.x, s.z), `${id} yaw ${yaw.toFixed(1)}`).toBeGreaterThan(0.5); }
        m.attack = null;
      }
    }
  });
});
