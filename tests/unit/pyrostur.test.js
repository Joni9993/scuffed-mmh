import { describe, it, expect, beforeEach } from 'vitest';
import { pyrostur, buildPyrostur, PYRO } from '../../src/game/monsters/pyrostur.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { make } from './p3helpers.js';
import { time } from '../../src/core/time.js';
import { overlap } from '../../src/game/hitbox.js';

beforeEach(() => time.reset());
const params = (id, seed = 6) => ({ attackId: id, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 12 }, seed, t0: 0 });

describe('Pyrostur boiler apex', () => {
  it('has a complete grounded, batched rig and aligned accessible counter targets', () => {
    const rig = buildPyrostur(); rig.root.updateMatrixWorld(true);
    const meshes = []; rig.root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.length).toBeLessThanOrEqual(75); // six independent limbs, vertex-colour batched armor and sail panels
    expect(meshes.reduce((n, mesh) => n + mesh.geometry.attributes.position.count / 3, 0)).toBeLessThanOrEqual(15000);
    const { m } = make(pyrostur);
    for (const id of ['chest', 'valve']) {
      const part = m.hurtParts().find((h) => h.part.id === id);
      expect(part).toBeTruthy();
      expect(part.sphere.y - part.sphere.r).toBeLessThan(1.5);
    }
    for (const part of pyrostur.parts) for (const sp of part.spheres) expect(rig.nodes[sp.node]).toBeTruthy();
  });
  it('has the full predator moveset, many chain families and no hit without deterministic ground markers/audit', () => {
    const moves = Object.values(pyrostur.attacks).filter((a) => a.id.startsWith('pyrostur_'));
    expect(moves.length).toBeGreaterThanOrEqual(24);
    expect(Object.keys(pyrostur.chains).length).toBeGreaterThanOrEqual(3);
    for (const a of moves) {
      expect(a.markerFromHits).toBe(true); expect(a.audit.length).toBeGreaterThan(0);
      const one = new AttackInstance(a, params(a.id)), two = new AttackInstance(a, params(a.id));
      // Projectile salvos mark their landing spots through the projectile system instead.
      if (a.hits.length) expect(one.footprints().length).toBeGreaterThan(0);
      else expect(a.events.some((e) => e.all)).toBe(true);
      for (let t = 0; t < one.duration; t += .08) { expect(one.hitsAt(t)).toEqual(two.hitsAt(t)); expect(one.sample(t)).toEqual(two.sample(t)); }
      // Worst case: rage plus Glutrausch tempo. Still at least the shared 0.5 s tell.
      const rage = new AttackInstance(a, { ...params(a.id), rage: true, tempoMul: PYRO.OVERHEAT_TEMPO });
      expect(rage.tgWall).toBeGreaterThanOrEqual(.5);
      if (!a.hits.length) continue;
      expect(rage.firstHitTime()).toBeGreaterThanOrEqual(.5);
      // Quick strikes may flow into each other, but every move visibly resets;
      // signatures always leave a real punish window.
      const recovery = (a.duration - Math.max(...a.hits.map((h) => h.t1))) / rage.speed;
      expect(recovery, a.id).toBeGreaterThanOrEqual(.4);
      if (a.punishWindow) expect(recovery, a.id).toBeGreaterThanOrEqual(1.5);
    }
  });
  it('transitions through the two planned HP states', () => {
    const { m } = make(pyrostur); m.recover = 99; m.hp = m.maxHp * .64; m._b2Tick(1 / 60);
    expect(m.phase).toBe(1); expect(m.phaseSpecial).toBe('pyrostur_kometensturz');
    m.hp = m.maxHp * .29; m._b2Tick(1 / 60);
    expect(m.phase).toBe(2); expect(m.phaseSpecial).toBe('pyrostur_sonnenbruch');
  });
  it('overlapping horn and head shapes count as one impact even through super armor', () => {
    const { m, p, ctx } = make(pyrostur);
    const inst = m.beginAttack('pyrostur_hornbrecher', { teach: false });
    const t = inst.wall(.85), sample = inst.sample(t);
    p.spawnAt(sample.x + .7, sample.z + 4.6); p.v.hp = p.v.maxHp = 1000;
    p.weapon.superArmor = () => 'all';
    const shapes = inst.hitsAt(t).filter(h => p.hitCapsules().some(c => overlap(h.shape, c)));
    expect(shapes.length).toBeGreaterThanOrEqual(2);
    let hits = 0; ctx.bus.on('playerHit', () => hits++);
    m._attackHits(inst, t); m._attackHits(inst, t + .01);
    expect(hits).toBe(1);
    expect(p.state).toBe('free');
  });
  it('breaking the valve replaces bilateral steam with a single weaker lateral leak', () => {
    const { m } = make(pyrostur); m._breakPart(m.partById.valve);
    expect(m._atkAllowed(pyrostur.attacks.pyrostur_seitenablass)).toBe(false);
    expect(m._atkAllowed(pyrostur.attacks.pyrostur_leckablass)).toBe(true);
    const original = pyrostur.attacks.pyrostur_seitenablass, leak = pyrostur.attacks.pyrostur_leckablass;
    expect(original.hits).toHaveLength(2); expect(leak.hits).toHaveLength(1); expect(leak.hits[0].dmg).toBeLessThan(original.hits[0].dmg);
    pyrostur.tick(m, .016); expect(m.extra.pipe.visible).toBe(false);
  });
  it('timed chest damage counters overpressure before the explosion, even after prior chest break', () => {
    const { m } = make(pyrostur); m.rageUsed = true; m.rageCd = 99;
    m.beginAttack('pyrostur_ueberdruck', { teach: false }); m.attack.t = 1.2; m.pressure = 100;
    pyrostur.onDamage(m, { partId: 'chest', dmg: PYRO.COUNTER_DAMAGE - 1 }); expect(m.attack).toBeTruthy();
    pyrostur.onDamage(m, { partId: 'chest', dmg: 1 }); expect(m.attack).toBeNull(); expect(m.stagT).toBe(PYRO.COUNTER_TIME); expect(m.pressure).toBe(0);
    m.partById.chest.broken = true; m.stagT = 0; m.beginAttack('pyrostur_ueberdruck', { teach: false }); m.attack.t = 1.2;
    pyrostur.onDamage(m, { partId: 'chest', dmg: PYRO.COUNTER_DAMAGE }); expect(m.attack).not.toBeNull(); // cooldown prevents a stagger loop
    pyrostur.tick(m, 18.1); m.attack.t = 1.2;
    pyrostur.onDamage(m, { partId: 'chest', dmg: PYRO.COUNTER_DAMAGE }); expect(m.attack).toBeNull();
  });
  it('accepts pressure counters only during the visible opening, and scales the requirement in coop', () => {
    const { m } = make(pyrostur); m.maxHp *= 2; m.beginAttack('pyrostur_ueberdruck');
    for (const tau of [.5, 3.0]) {
      m.attack.t = m.attack.inst.wall(tau); pyrostur.onDamage(m, { partId: 'chest', dmg: 5000 });
      expect(m.attack).not.toBeNull(); expect(m.boilerCounter).toBe(0);
    }
    m.attack.t = m.attack.inst.wall(1.5);
    pyrostur.onDamage(m, { partId: 'chest', dmg: PYRO.COUNTER_DAMAGE }); expect(m.attack).not.toBeNull();
    pyrostur.onDamage(m, { partId: 'chest', dmg: PYRO.COUNTER_DAMAGE }); expect(m.attack).toBeNull();
  });
  it('chest and wings change vulnerability, pressure and movement after real breaks', () => {
    const { m } = make(pyrostur); m.pressure = 100; m._breakPart(m.partById.chest);
    expect(m.partById.chest.factor).toBe(1.05); expect(m.pressure).toBe(0); expect(m.stagT).toBeGreaterThanOrEqual(3);
    m._breakPart(m.partById.wingL); pyrostur.tick(m, .016);
    expect(m.extra.wings.wingL.scale.x).toBe(.64); expect(pyrostur.speedFactor(m)).toBe(.9); expect(m.cds.pyrostur_feuerregen).toBeGreaterThanOrEqual(12);
  });
  it('signature gives a chest safe pocket, a distant escape and a >=1.5s recovery in rage', () => {
    for (const id of ['pyrostur_feuerregen', 'pyrostur_ueberdruck']) {
      const a = pyrostur.attacks[id], inst = new AttackInstance(a, { ...params(id), rage: true });
      expect((a.duration - Math.max(...a.hits.map((h) => h.t1))) / inst.speed).toBeGreaterThanOrEqual(1.5);
      expect(inst.footprints().every((p) => Math.hypot(p.x, p.z - 1.8) > p.r)).toBe(true);
    }
  });
  it('side steam and rear tail have real contact and roll escapes at their actual attack bearings', () => {
    // The generic fairness harness only starts hunters in front; exercise these side/rear attacks here.
    const simulate = (id, x, z, rollAt = -1, stick = [-1, 0]) => {
      const { m, p, ctx } = make(pyrostur, 'combat', x, z); ctx.cameraYaw = Math.PI;
      m.recover = 99; m.rage = true; m.rageT = 999;
      let hurt = 0; const take = p.takeHit.bind(p); p.takeHit = (h) => { const r = take(h); if (r === 'hit' || r === 'block') hurt++; return r; };
      const a = m.beginAttack(id, { teach: false }); let rolled = false;
      for (let t = 0; t < a.duration + .3; t += 1 / 60) {
        if (!rolled && rollAt >= 0 && t >= rollAt) { ctx.input.setStick(...stick, 'bot'); ctx.input.press('roll', 50); rolled = true; }
        ctx.input.poll(1 / 60); p.update(1 / 60); ctx.input.setStick(0, 0, 'bot'); m.update(1 / 60); m.recover = 99;
      }
      return hurt;
    };
    for (const [id, x, z] of [['pyrostur_seitenablass', -4, 0], ['pyrostur_leckablass', 4, 0], ['pyrostur_schlackenschweif', 0, -4]]) {
      expect(simulate(id, x, z), id + ' must actually threaten this bearing').toBeGreaterThan(0);
      let escaped = false;
      for (const stick of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        for (let t = .15; t <= 1.2 && !escaped; t += .05) if (!simulate(id, x, z, t, stick)) escaped = true;
        if (escaped) break;
      }
      expect(escaped, id + ' roll escape').toBe(true);
    }
  });
});
