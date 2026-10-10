import { describe, it, expect } from 'vitest';
import { make, DT } from './p3helpers.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { monsters, getMonsterDef } from '../../src/game/monsters/index.js';
import { gorgo } from '../../src/game/monsters/gorgo.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';

const mk = (px = 0, pz = 10, seed = 7) => make({ ...gorgo, hp: 1e9 }, 'combat', px, pz, seed);
const run = (ctx, m, secs, keep) => { for (let i = 0; i < secs / DT; i++) { ctx.players.forEach((q) => { q.god = true; if (keep) q.pos.set(keep.x, 0, keep.z); }); m.update(DT); } };
const step = (m, secs, f) => { for (let i = 0; i < secs / DT; i++) { m.update(DT); f?.(i * DT); } };

describe('Gorgo: Definition', () => {
  it('Registry, HP, Schwaeche, Teile, Glitch-Stellen', () => {
    expect(getMonsterDef('gorgo')).toBe(gorgo);
    expect(monsters.gorgo.hp).toBe(16000);
    const { m } = mk();
    expect(m.parts.map((p) => p.id)).toEqual(['kopf', 'segment1', 'segment2', 'segment3', 'segment4', 'segment5', 'segment6']);
    expect(m.partById.kopf.factor).toBe(1);
    expect(m.partById.kopf.elem).toMatchObject({ shock: 20, rost: 25, fire: 0 });
    for (let i = 1; i <= 6; i++) { const p = m.partById['segment' + i]; expect(p.factor).toBe(0.6); expect(p.breakHp).toBe(500); expect(p.elem.fire).toBe(0); }
    expect(gorgo.glitchSpots).toEqual(['kopf', 'segment3']);
    expect(gorgo.teachAttack).toBe('gorgo_spucke');
    expect(gorgo.phases[0].at).toBe(0.5);
  });
  it('jeder Angriff hat Cue; jeder mit hits meldet audit an; Telegraph >= 0.5', () => {
    for (const a of Object.values(gorgo.attacks)) {
      expect(a.cue?.tone, a.id).toBeTruthy();
      if (a.hits?.length) expect(a.audit?.length, a.id).toBeGreaterThan(0);
      expect(a.telegraph).toBeGreaterThanOrEqual(0.5);
    }
    expect(gorgo.attacks.gorgo_sog.telegraph).toBe(0.9);
  });
});

describe('Gorgo: Eingraben', () => {
  it('Graben -> unverwundbar (keine Hurtboxen/Lock-Punkte), Hügel sichtbar', () => {
    const { ctx, m } = mk();
    expect(m.hurtParts().length).toBeGreaterThan(0);
    m.beginAttack('gorgo_wuehlen');
    expect(m.burrowed).toBe(false);
    run(ctx, m, 1.2);
    expect(m.burrowed).toBe(true);
    expect(m.invulnerable).toBe(true);
    expect(m.hurtParts()).toHaveLength(0);
    expect(m.lockPoints()).toHaveLength(0);
    expect(m.extra.mound.visible).toBe(true);
    expect(m.extra.body.visible).toBe(false);
  });
  it('Wühlen läuft in den Durchbruch: Auftauchen mit Bodenwarnung >= 0,8 s unter dem Ziel', () => {
    const { ctx, m, p } = mk();
    const evs = [];
    ctx.bus.on('monsterAttack', (e) => evs.push(e));
    const marks = [];
    ctx.fx.marker = (key, pos, r) => marks.push({ t: m.time, pos: { ...pos }, r });
    m.beginAttack('gorgo_wuehlen');
    let surfaced = null, markStart = null;
    for (let i = 0; i < 12 / DT && surfaced === null; i++) {
      p.god = true; p.pos.set(0, 0, 10);
      m.update(DT);
      if (markStart === null && marks.length && m.attack?.id === 'gorgo_durchbruch') markStart = m.time;
      if (m.attack?.id === 'gorgo_durchbruch' && !m.burrowed && m.attack.t > 0.3) surfaced = m.time;
    }
    expect(evs.map((e) => e.attackId)).toContain('gorgo_durchbruch');
    expect(surfaced).not.toBeNull();
    expect(surfaced - markStart).toBeGreaterThanOrEqual(0.8);
    expect(Math.hypot(m.pos.x - 0, m.pos.z - 10)).toBeLessThan(2.5);
    const last = marks[marks.length - 1];
    expect(Math.hypot(last.pos.x, last.pos.z - 10)).toBeLessThan(2.5);
  });
  it('Durchbruch: Telegraph >= 0,8 s auch in Rotglut, 30 Schaden', () => {
    const base = { attackId: 'gorgo_durchbruch', t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 6 }, seed: 1 };
    const d = gorgo.attacks.gorgo_durchbruch;
    expect(new AttackInstance(d, base).firstHitTime()).toBeGreaterThanOrEqual(0.8);
    expect(new AttackInstance(d, { ...base, rage: true }).firstHitTime()).toBeGreaterThanOrEqual(0.8);
    expect(d.hits[0].dmg).toBe(30);
  });
  it('Durchbruch trifft den Pirscher im Kreis erst nach der Warnung', () => {
    const { m, p } = mk(0, 8);
    p.god = false;
    const hp0 = p.v.hp;
    m.beginAttack('gorgo_durchbruch');
    let hurtAt = null;
    for (let i = 0; i < 3 / DT; i++) {
      m.update(DT); p.update?.(DT);
      if (hurtAt === null && p.v.hp < hp0) hurtAt = m.attack ? m.attack.t : 99;
    }
    expect(hurtAt).not.toBeNull();
    expect(hurtAt).toBeGreaterThanOrEqual(0.8);
  });
});

describe('Gorgo: Segmente', () => {
  it('Segmentbruch kürzt den Wurm und macht ihn langsamer', () => {
    const { m } = mk();
    const v = m.pos.clone();
    const len = () => { m.sync(); m.nodes.head.getWorldPosition(v); const a = v.clone(); const last = ['segment6', 'segment5', 'segment4', 'segment3', 'segment2', 'segment1'].find((s) => !m.partById[s].broken); m.nodes[last].getWorldPosition(v); return a.distanceTo(v); };
    m.update(DT);
    const l0 = len(), s0 = m.speedMul;
    m.applyDamage({ dmg: 600, partId: 'segment6', attackerId: 'p1' });
    expect(m.partById.segment6.broken).toBe(true);
    expect(m.partById.segment6.gone).toBe(true);
    expect(m.partMeshes.segment6.every((x) => !x.visible)).toBe(true);
    m.applyDamage({ dmg: 600, partId: 'segment5', attackerId: 'p1' });
    m.update(DT);
    expect(m.speedMul).toBeLessThan(s0);
    expect(len()).toBeLessThan(l0 - 3);
    expect(m.hurtParts().some((h) => h.part.id === 'segment6')).toBe(false);
  });
  it('2 gebrochene Segmente schalten Schnappen frei', () => {
    const { m } = mk();
    const has = () => { for (let i = 0; i < 60; i++) if (m._chooseAttack(3)?.id === 'gorgo_schnappen') return true; return false; };
    m.cds = {};
    expect(has()).toBe(false);
    m.partById.segment1.broken = true; m.partById.segment2.broken = true;
    m.cds = {};
    expect(has()).toBe(true);
  });
});

describe('Gorgo: Sog', () => {
  const setup = (opts = {}) => {
    const { ctx, m, p } = mk(0, 9);
    p.god = true;
    Object.assign(p, opts);
    p.local = true;
    m.target = p;
    m.beginAttack('gorgo_sog');
    return { ctx, m, p };
  };
  it('zieht Pirscher im Kegel an', () => {
    const { m, p } = setup();
    step(m, 1.0, () => { p.update(DT); });
    const d1 = Math.hypot(p.pos.x, p.pos.z);
    step(m, 1.0, () => { p.update(DT); });
    expect(Math.hypot(p.pos.x, p.pos.z)).toBeLessThan(d1 - 1.5);
  });
  it('suctionImmune wird nicht gezogen', () => {
    const { m, p } = setup({ suctionImmune: true });
    step(m, 2.0, () => { p.update(DT); });
    expect(p.pos.z).toBeGreaterThan(8.9);
  });
  it('Rolle bricht den Sog', () => {
    const { ctx, m, p } = setup();
    step(m, 1.1, () => { p.update(DT); });
    ctx.input.setStick(1, 0, 'bot'); ctx.input.press('roll', 50); ctx.cameraYaw = Math.PI;
    let zAfter = null;
    step(m, 1.4, (t) => { ctx.input.poll(DT); p.update(DT); if (t > 0.6 && zAfter === null) zAfter = p.pos.z; });
    ctx.input.setStick(0, 0, 'bot');
    expect(Math.abs(p.pos.z - zAfter)).toBeLessThan(0.6); // nach der Rolle nicht weiter ins Maul gezogen
  });
});

describe('Gorgo: Knallgurke / Schrottkran', () => {
  const burrow = () => { const t = mk(); const { ctx, m } = t; m.beginAttack('gorgo_wuehlen'); run(ctx, m, 1.4, { x: 0, z: 10 }); expect(m.burrowed).toBe(true); return t; };
  it('Knallgurke auf der Grabbahn zwingt ihn heraus + 8 s benommen', () => {
    const { ctx, m } = burrow();
    ctx.effects = { list: [{ kind: 'bomb', params: { pos: { x: m.pos.x + 1, y: 0, z: m.pos.z + 1 } } }] };
    m.update(DT);
    expect(m.burrowed).toBe(false);
    expect(m.stunT).toBeGreaterThanOrEqual(7.9);
    expect(m.attack).toBeNull();
    expect(m.hurtParts().length).toBeGreaterThan(0);
  });
  it('Knallgurke weit weg: bleibt eingegraben', () => {
    const { ctx, m } = burrow();
    ctx.effects = { list: [{ kind: 'bomb', params: { pos: { x: m.pos.x + 30, y: 0, z: m.pos.z } } }] };
    m.update(DT);
    expect(m.burrowed).toBe(true);
  });
  it('Schrottkran-Schaden (env) trifft eingegraben: taucht auf, benommen', () => {
    const { m } = burrow();
    m.applyDamage({ dmg: 500, partId: null, env: true });
    expect(m.burrowed).toBe(false);
    expect(m.stunT).toBeGreaterThan(0);
  });
});

describe('Gorgo: Phase + Spucke', () => {
  it('Glutkern bei 50 %: Phase + Glutspucke als Special', () => {
    const { ctx, m } = mk(0, 12);
    const ph = [], atk = [];
    ctx.bus.on('monsterPhase', (e) => ph.push(e)); ctx.bus.on('monsterAttack', (e) => atk.push(e.attackId));
    m.hp = m.maxHp * 0.45;
    run(ctx, m, 8, { x: 0, z: 12 });
    expect(ph[0]?.name).toBe('Glutkern');
    expect(atk).toContain('gorgo_glutspucke');
  });
  it('Spucke: 3 Brocken (Glutspucke 5), bleiben 6 s, Rost, 15', () => {
    for (const [id, n] of [['gorgo_spucke', 3], ['gorgo_glutspucke', 5]]) {
      const { m } = mk(0, 14);
      if (id === 'gorgo_glutspucke') m.phase = 1;
      m.beginAttack(id);
      let max = 0;
      step(m, 1.2, () => { max = Math.max(max, m.projectiles.list.length); });
      expect(max).toBe(n);
      const pr = m.projectiles.list[0];
      expect(pr.def.hold).toBe(6);
      expect(pr.def.status.type).toBe('rost');
      expect(pr.def.dmg).toBe(15);
    }
  });
});

describe('Gorgo: Replay-Determinismus (Gast)', () => {
  it('Host und Gast durchlaufen Wühlen->Durchbruch identisch (Position + burrowed)', () => {
    const { ctx, m: host } = mk(0, 10, 3);
    const guest = new Monster(gorgo, ctx, { id: 'gorgo-g', x: 0, z: 0, state: 'combat', seed: 99, authority: false });
    ctx.monsters.push(guest);
    const ids = [];
    ctx.bus.on('monsterAttack', (e) => { if (e.monsterId === host.id) { ids.push(e.attackId); guest.startAttack({ ...e }, 0); } });
    host.beginAttack('gorgo_wuehlen');
    const a = [], b = [], ha = new Map(), gb = new Map();
    for (let i = 0; i < 7 / DT; i++) {
      ctx.players.forEach((q) => { q.god = true; q.pos.set(0, 0, 10); });
      host.update(DT); guest.tickRemote(DT);
      if (host.attack && guest.attack && host.attack.id === guest.attack.id) {
        ha.set(host.attack.id + Math.round(host.attack.t / DT), [host.pos.x, host.pos.z, host.rot, host.burrowed]);
        gb.set(guest.attack.id + Math.round(guest.attack.t / DT), [guest.pos.x, guest.pos.z, guest.rot, guest.burrowed]);
      }
    }
    for (const [k, v] of ha) if (gb.has(k)) { a.push(v); b.push(gb.get(k)); }
    expect(ids.slice(0, 2)).toEqual(['gorgo_wuehlen', 'gorgo_durchbruch']);
    expect(a.length).toBeGreaterThan(300);
    expect(b).toEqual(a);
    expect(a.some((x) => x[3])).toBe(true);
    expect(a.some((x) => !x[3])).toBe(true);
  });
  it('Gleiche Params -> gleiche Spucke-Ziele', () => {
    const run1 = () => {
      const { m } = mk(0, 14, 5);
      const out = [];
      m.beginAttack('gorgo_spucke', { seed: 4242 });
      step(m, 1.0, () => { for (const pr of m.projectiles.list) out.push([pr.def.to.x, pr.def.to.z, pr.def.dur]); });
      return out.slice(0, 3);
    };
    expect(run1()).toEqual(run1());
  });
});
