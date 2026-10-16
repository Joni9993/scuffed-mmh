import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { gockelok } from '../../src/game/monsters/gockelok.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { make, DT } from './p3helpers.js';

const params = { attackId: 'test', t0: 0, origin: { x: 4, y: 0, z: -3 }, yaw: .4, targetPos: { x: 6, y: 0, z: 15 }, seed: 7 };
describe('Gockelok: five ridiculous signatures, fair recovery', () => {
  it('all moves replay identically with red damage footprints and usable recovery in rage', () => {
    for (const a of Object.values(gockelok.attacks)) {
      const host = new AttackInstance(a, { ...params, rage: true }), guest = new AttackInstance(a, { ...params, rage: true });
      expect(host.firstHitTime(), a.id).toBeGreaterThanOrEqual(.5); expect(a.markerFromHits).toBe(true); expect(a.audit.length).toBeGreaterThan(0);
      expect(host.footprints()).toEqual(guest.footprints());
      for (let t = 0; t < host.duration; t += .09) { expect(host.sample(t)).toEqual(guest.sample(t)); expect(host.hitsAt(t)).toEqual(guest.hitsAt(t)); }
      expect(host.duration - host.wall(Math.max(...a.hits.map((h) => h.t1))) + gockelok.recoverAfter(), a.id).toBeGreaterThanOrEqual(1.5);
    }
  });
  it('pecks five times; each egg produces exactly three marked fragment spokes', () => {
    expect(gockelok.attacks.gockelok_maschinenpicken.hits).toHaveLength(5);
    const eggs = gockelok.attacks.gockelok_flatterartillerie;
    expect(eggs.hits.filter((h) => h.shape === 'sphere')).toHaveLength(3);
    expect(eggs.hits.filter((h) => h.shape === 'capsule')).toHaveLength(9);
    expect(eggs.events.every((e) => e.all)).toBe(true);
    expect(new AttackInstance(eggs, params).footprints().length).toBeGreaterThanOrEqual(12);
  });
  it('comb break changes roar radius and stamina loss, while a perfect counter ends the chain', () => {
    const { m, p } = make(gockelok);
    const full = gockelok.attacks.gockelok_kikeriki, hoarse = gockelok.attacks.gockelok_kikeriki_heiser;
    gockelok.onHitPlayer(m, p, { hit: full.hits[0] }); expect(p.v.stamina).toBe(55);
    m._breakPart(m.partById.comb);
    expect(m._atkAllowed(full)).toBe(false); expect(m._atkAllowed(hoarse)).toBe(true);
    expect(hoarse.hits[0].radius).toBeLessThan(full.hits[0].radius);
    p.v.stamina = 100; gockelok.onHitPlayer(m, p, { hit: hoarse.hits[0] }); expect(p.v.stamina).toBe(80);
    m.beginAttack(hoarse.id); m.chainNext = { id: 'gockelok_schnabelbohrer' }; gockelok.onGlitchCounter(m, hoarse.id);
    expect(m.attack).toBe(null); expect(m.chainNext).toBe(null); expect(m.recover).toBeGreaterThanOrEqual(1.9);
  });
  it('spur break removes the second kick and opens an outer safe ring', () => {
    const { m } = make(gockelok);
    m._breakPart(m.partById.spur);
    const full = gockelok.attacks.gockelok_spornwirbel, broken = gockelok.attacks.gockelok_spornwirbel_bruch;
    expect(m._atkAllowed(full)).toBe(false); expect(m._atkAllowed(broken)).toBe(true);
    expect(full.hits).toHaveLength(2); expect(broken.hits).toHaveLength(1); expect(broken.hits[0].radius).toBeLessThan(full.hits[0].radius);
    expect(m.extra.spurL.scale.z).toBe(.2);
  });
  it('sprint changes direction twice, then stumbles for at least 1.5s even in rage', () => {
    const a = gockelok.attacks.gockelok_kopflosersprint, inst = new AttackInstance(a, { ...params, rage: true });
    expect(new Set(a.hits.map((h) => inst.sample(inst.wall(h.t0)).yaw)).size).toBe(3);
    expect(inst.duration - inst.wall(a.hits.at(-1).t1)).toBeGreaterThanOrEqual(1.5);
    const { m } = make(gockelok); m.chainNext = { id: 'gockelok_maschinenpicken' }; gockelok.onAttackEnd(m, a.id);
    expect(m.chainNext).toBe(null); expect(m.recover).toBeGreaterThanOrEqual(1.8);
  });
  it('brings its real head and comb into melee reach when pecking or stumbling', () => {
    const { m } = make(gockelok);
    const attack = m.beginAttack('gockelok_maschinenpicken', { tgMul: 1, rage: false });
    m.attack.t = attack.wall(.85); m._visuals(1);
    const head = m.nodes.head.getWorldPosition(new THREE.Vector3());
    expect(head.y).toBeGreaterThan(.4); expect(head.y).toBeLessThan(2.3);
    const comb = m.hurtParts().find((p) => p.part.id === 'comb');
    expect(comb.pos.y - comb.sphere.r).toBeLessThan(2);
    // The fixed-step pose filter must preserve that opening in a real attack too.
    const live = make(gockelok).m;
    live.beginAttack('gockelok_maschinenpicken', { tgMul: 1, rage: false });
    let lowest = Infinity;
    for (let i = 0; i < 100; i++) {
      live.update(DT);
      lowest = Math.min(lowest, live.nodes.head.getWorldPosition(new THREE.Vector3()).y);
    }
    expect(lowest).toBeLessThan(2.3);
    const rig = gockelok.build();
    rig.apply({ bodyY: -.75, bodyPitch: 40, bodyRoll: 0, head: 25, headYaw: 0, neck: 0,
      spread: 0, wing: 40, legL: 0, legR: 0, tailPitch: 0, tailYaw: 0 });
    rig.root.updateMatrixWorld(true);
    const low = rig.nodes.head.getWorldPosition(new THREE.Vector3());
    expect(low.y).toBeGreaterThan(.5); expect(low.y).toBeLessThan(2.4);
  });
  it('reaches all three combat states and keeps every part attached to an actual node', () => {
    const { m } = make(gockelok); m.hp = m.maxHp * .69; m._b2Tick(.01); expect(m.phase).toBe(1);
    m.hp = m.maxHp * .3; m._b2Tick(.01); expect(m.phase).toBe(2);
    const rig = gockelok.build(); let draws = 0; rig.root.traverse((n) => { if (n.isMesh) draws++; });
    for (const p of gockelok.parts) for (const s of p.spheres) expect(rig.nodes[s.node]).toBeTruthy();
    const bounds = new THREE.Box3().setFromObject(rig.root); expect(bounds.max.y).toBeGreaterThan(6); expect(bounds.max.y).toBeLessThan(8);
    expect(draws).toBeLessThan(25); expect(gockelok.speedFactor(m)).toBe(1.35);
  });
  it('egg impact at an off-center landing is dangerous but a lateral escape avoids its fragments', () => {
    const probe = (roll) => {
      const {m,p,ctx}=make(gockelok,'combat',-4,9);let damage=0;
      ctx.bus.on('playerHit',e=>{if(e.player===p)damage+=e.dmg;});m.recover=999;m.beginAttack('gockelok_flatterartillerie',{tgMul:1});
      for(let i=0;i<300;i++){if(roll&&i===55){ctx.input.setStick(1,0,'bot');ctx.input.press('roll',50);}
        ctx.input.poll(DT);p.update(DT);m.update(DT);m.recover=999;m.chainNext=null;
      }return damage;
    };
    expect(probe(false)).toBeGreaterThan(0);expect(probe(true)).toBe(0);
  });
});
