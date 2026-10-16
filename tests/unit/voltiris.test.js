import { describe, it, expect } from 'vitest';
import { voltiris } from '../../src/game/monsters/voltiris.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { make, DT } from './p3helpers.js';

const params = { attackId: 'test', t0: 0, origin: { x: 3, y: 0, z: -2 }, yaw: .6, targetPos: { x: 7, y: 0, z: 15 }, seed: 17 };
describe('Voltiris: committed lightning and a readable real body', () => {
  it('replays every shape and footprint identically, including rage and moved origins', () => {
    for (const a of Object.values(voltiris.attacks)) {
      if (!a.hits?.length) continue;
      for (const rage of [false, true]) {
        const host = new AttackInstance(a, { ...params, rage }), guest = new AttackInstance(a, { ...params, rage });
        expect(host.firstHitTime(), a.id).toBeGreaterThanOrEqual(.5);
        expect(host.footprints(), a.id).toEqual(guest.footprints());
        for (let t = 0; t < host.duration; t += .07) { expect(host.sample(t)).toEqual(guest.sample(t)); expect(host.hitsAt(t)).toEqual(guest.hitsAt(t)); }
        const last = Math.max(...a.hits.map((h) => h.t1));
        expect(host.duration - host.wall(last), a.id).toBeGreaterThanOrEqual(1);
      }
    }
  });
  it('antenna break removes the central lightning lane and an entire storm side', () => {
    const { m } = make(voltiris);
    const normal = voltiris.attacks.voltiris_blitzraster, broken = voltiris.attacks.voltiris_blitzraster_bruch;
    expect(m._atkAllowed(normal)).toBe(true); expect(m._atkAllowed(broken)).toBe(false);
    m._breakPart(m.partById.antenna);
    expect(m._atkAllowed(normal)).toBe(false); expect(m._atkAllowed(broken)).toBe(true);
    expect(broken.hits).toHaveLength(2); expect(broken.hits.every((h) => Math.abs(h.from[0]) === 4)).toBe(true);
    expect(voltiris.attacks.voltiris_prismensturm_bruch.hits.length).toBeLessThan(voltiris.attacks.voltiris_prismensturm.hits.length / 2);
    expect(m.extra.antenna.scale.y).toBeLessThan(.5);
  });
  it('wing break shortens the echo series and permanently removes visual echoes', () => {
    const { m } = make(voltiris);
    m.beginAttack('voltiris_nachbildserie'); voltiris.tick(m, .01);
    expect(m.extra.echoes.every((e) => e.visible)).toBe(true);
    m._breakPart(m.partById.wing); voltiris.tick(m, .01);
    expect(m.extra.echoes.every((e) => !e.visible)).toBe(true);
    expect(m._atkAllowed(voltiris.attacks.voltiris_nachbildserie)).toBe(false);
    expect(m._atkAllowed(voltiris.attacks.voltiris_nachbild_bruch)).toBe(true);
    expect(voltiris.attacks.voltiris_nachbild_bruch.hits).toHaveLength(2);
  });
  it('phases unlock different answers; a signature counter cancels followups', () => {
    const { m } = make(voltiris);
    expect(m._atkAllowed(voltiris.attacks.voltiris_zickzacklaser)).toBe(false);
    m.hp = m.maxHp * .65; m._b2Tick(.01); expect(m.phase).toBe(1);
    m.hp = m.maxHp * .25; m._b2Tick(.01); expect(m.phase).toBe(2);
    m.beginAttack('voltiris_zickzacklaser'); m.chainNext = { id: 'voltiris_antennenstoss' };
    voltiris.onGlitchCounter(m, 'voltiris_zickzacklaser');
    expect(m.attack).toBe(null); expect(m.chainNext).toBe(null); expect(m.recover).toBeGreaterThanOrEqual(1.8);
  });
  it('every hit part resolves to an actual rig node, with merged silhouette geometry', () => {
    const rig = voltiris.build(); let draws = 0; rig.root.traverse((n) => { if (n.isMesh) draws++; });
    for (const p of voltiris.parts) for (const s of p.spheres) expect(rig.nodes[s.node], `${p.id}/${s.node}`).toBeTruthy();
    expect(draws).toBeLessThan(20); expect(rig.extra.wingL.children[0].geometry.attributes.position.count).toBeGreaterThan(36);
  });
  it('rear-tail hazard actually hits a rear hunter and can be escaped by a real lateral roll', () => {
    const probe = (roll) => {
      const { m, p, ctx } = make(voltiris, 'combat', 0, -4.6); let damage = 0;
      ctx.bus.on('playerHit', (e) => { if (e.player === p) damage += e.dmg; });
      m.recover = 999; m.beginAttack('voltiris_rueckkopplung', { tgMul: 1 });
      for (let i=0;i<180;i++) { if (roll && i===29) { ctx.input.setStick(-1,0,'bot');ctx.input.press('roll',50); }
        ctx.input.poll(DT);p.update(DT);m.update(DT);m.recover=999;m.chainNext=null;
      }
      return damage;
    };
    expect(probe(false)).toBeGreaterThan(0);expect(probe(true)).toBe(0);
  });
});
