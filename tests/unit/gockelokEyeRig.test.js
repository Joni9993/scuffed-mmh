import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { eyeAttackCue } from '../../src/game/monsters/gockelokRig.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { HAZ, beamCycle, tickHazards } from '../../src/game/monsters/gockelokHazards.js';
import { gockelok, beginEye } from '../../src/game/monsters/gockelok.js';
import { make, DT } from './p3helpers.js';

const shown = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
function visibleBox(root) {
  root.updateMatrixWorld(true); const box = new THREE.Box3(), b = new THREE.Box3();
  root.traverse((o) => { if (!o.isMesh || !shown(o)) return; o.geometry.computeBoundingBox(); b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(b); });
  return box;
}
function step(m, n = 30) { for (let i = 0; i < n; i++) { m.time += DT; gockelok.tick(m, DT); m._visuals(DT); } }

describe('Gockelok true form: Auge des Glitch', () => {
  it('is a huge separate model with reachable, finite hurtboxes', () => {
    const { m } = make(gockelok); step(m, 2);

    m.applyDamage({ dmg: m.maxHp, partId: 'body' }); beginEye(m); m.recover = 999; step(m);
    expect(m.gockelForm).toBe('eye');
    const box = visibleBox(m.mesh), size = box.getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(8); expect(size.x).toBeGreaterThan(10); expect(box.min.y).toBeGreaterThan(m.pos.y - .5);
    const hp = m.hurtParts(); expect(hp.length).toBeGreaterThan(8);
    for (const h of hp) for (const v of [h.sphere.x, h.sphere.y, h.sphere.z, h.sphere.r]) expect(Number.isFinite(v), h.part.id).toBe(true);
    const low = hp.filter((h) => h.sphere.y - m.pos.y < 3).map((h) => h.part.id);
    expect(low).toEqual(expect.arrayContaining(['legs', 'spur']));
    expect(Math.max(...hp.map((h) => h.sphere.y)) - m.pos.y).toBeGreaterThan(3); // actual floating pupil, not the old rooster's underground anchor
    for (const p of m.lockPoints()) expect(Number.isFinite(p.pos.y)).toBe(true);
    // the rooster rig is hidden; the eye animates over time
    expect(m.mesh.getObjectByName('Auge des Glitch').visible).toBe(true);
    const head = m.hurtParts().find((h) => h.part.id === 'head').pos.clone(); step(m, 40);
    expect(m.hurtParts().find((h) => h.part.id === 'head').pos.distanceTo(head)).toBeGreaterThan(0);
    gockelok.dispose(m);
  });
  it('a crash/stun opening sinks the pupil into melee reach', () => {
    const { m } = make(gockelok); m.applyDamage({ dmg: m.maxHp, partId: 'body' }); beginEye(m);
    m.recover = 999; m.crashOpening = 4; step(m, 60);
    const head = m.hurtParts().find((h) => h.part.id === 'head');
    expect(head.sphere.y - head.sphere.r - m.pos.y).toBeLessThan(3);
    gockelok.dispose(m);
  });
});


describe('Eye attack intent and arena readability',()=>{
  const laser={id:'test_laser',telegraph:2,duration:3,tell:{kind:'laser'},hits:[{t0:2,t1:2.4,shape:'capsule',from:[0,1,2],to:[0,1,20],radius:1,dmg:100}]};
  const params={attackId:laser.id,t0:0,origin:{x:4,y:100,z:5},yaw:1.1,seed:1};
  it('charges against the actual tempo-adjusted hit clock and releases only at impact',()=>{
    const a=new AttackInstance(laser,{...params,tempoMul:1.4});
    const before=eyeAttackCue(a,a.wall(1)),near=eyeAttackCue(a,a.wall(1.99)),shot=eyeAttackCue(a,a.wall(2.05));
    expect(before.release).toBe(0);expect(near.charge).toBeGreaterThan(before.charge);expect(near.charge).toBeGreaterThan(.98);
    expect(near.impactIn).toBeCloseTo(a.wall(2)-a.wall(1.99));expect(shot.charge).toBe(0);expect(shot.release).toBe(1);
    expect(near.sample.yaw).toBe(params.yaw);expect(eyeAttackCue(a,a.wall(2.5)).hit).toBe(null);
  });
  it('shows converging charge rings and an aimed release without changing the GitHub eye silhouette',()=>{
    const {m}=make(gockelok);m.applyDamage({dmg:m.maxHp,partId:'body'});beginEye(m);step(m,90);
    const inst=new AttackInstance(laser,{...params,origin:{x:m.pos.x,y:m.pos.y,z:m.pos.z}});
    m.attack={inst,id:laser.id,t:inst.wall(1)};step(m,2);
    const group=m.mesh.getObjectByName('Auge des Glitch');
    expect(group.userData.attackCue.charge).toBeGreaterThan(0);expect(m.mesh.getObjectByName('Laserladung').visible).toBe(true);
    expect(m.mesh.getObjectByName('Laserziel').visible).toBe(true);expect(m.mesh.getObjectByName('Laserentladung').visible).toBe(false);
    m.attack.t=inst.wall(2.1);step(m,2);expect(m.mesh.getObjectByName('Laserentladung').visible).toBe(true);
    m._interrupt();step(m,2);expect(m.mesh.getObjectByName('Laserladung').visible).toBe(false);expect(m.mesh.getObjectByName('Laserziel').visible).toBe(false);
    gockelok.dispose(m);
  });
  it('gives scanlines a harmless stationary charge and a quiet window after the sweep',()=>{
    const {m,p}=make(gockelok);m.applyDamage({dmg:m.maxHp,partId:'body'});beginEye(m);
    m.formTime=HAZ.beamStart+.8;let cycle=beamCycle(m);expect(cycle.visible).toBe(true);expect(cycle.active).toBe(false);expect(cycle.angle).toBe(0);
    const c=m.eyeArena.center;p.pos.set(c.x,100,c.z+12);let hits=0;p.takeHit=()=>{hits++;return 'hit';};
    tickHazards(m,.02);expect(hits).toBe(0);
    m.formTime=HAZ.beamStart+HAZ.beamArm+.1;cycle=beamCycle(m);expect(cycle.active).toBe(true);
    m.formTime=HAZ.beamStart+HAZ.beamArm+HAZ.beamFire+.1;expect(beamCycle(m).visible).toBe(false);
    gockelok.dispose(m);
  });
  it('arms shards visibly before they can move or hit and delays damage after leaving the safe ring',()=>{
    const {m,p}=make(gockelok);m.applyDamage({dmg:m.maxHp,partId:'body'});beginEye(m);m.formTime=HAZ.shardStart;
    tickHazards(m,.01);m.hazard.shardT=0;tickHazards(m,.01);expect(m.hazard.shards).toHaveLength(2);
    const shard=m.hazard.shards[0],start={x:shard.x,z:shard.z};tickHazards(m,.3);
    expect(shard.arm).toBeGreaterThan(0);expect(shard.x).toBe(start.x);expect(shard.z).toBe(start.z);
    const c=m.eyeArena.center;p.pos.set(c.x+28,100,c.z);let zoneHits=0;p.takeHit=h=>{if(h.attackId==='gockelok_datenleere')zoneHits++;return 'hit';};
    tickHazards(m,.3);expect(zoneHits).toBe(0);tickHazards(m,.6);expect(zoneHits).toBe(1);gockelok.dispose(m);
  });
  it('marks scanline capsule reach exactly and clears countdowns during quiet patterns and cleanup',()=>{
    const {m,ctx}=make(gockelok);ctx.scene=new THREE.Scene();m.applyDamage({dmg:m.maxHp,partId:'body'});beginEye(m);
    const markers=[],cleared=[];ctx.fx.attackMarker=(...args)=>markers.push(args);ctx.fx.clearMarker=key=>cleared.push(key);
    m.formTime=HAZ.beamStart+.8;tickHazards(m,.02);
    expect(markers).toHaveLength(1);const [key,shape,y,charge,active]=markers[0];
    expect(shape.r).toBeCloseTo(HAZ.beamR+.4);expect(Math.hypot(shape.bx-shape.ax,shape.bz-shape.az)).toBeCloseTo(HAZ.beamOut-HAZ.beamIn);
    expect(y).toBe(100);expect(active).toBe(false);expect(charge).toBeGreaterThan(0);
    m.attack={inst:{def:{tell:{kind:'grid'}}}};tickHazards(m,.02);expect(cleared).toContain(key);
    m.attack=null;gockelok.dispose(m);expect(cleared.filter(k=>k===key).length).toBeGreaterThan(1);
  });

});


describe('Rooster bodily intent',()=>{
  it('brings its real head and beak down at peck impact and leaves them reachable during recovery',()=>{
    const {m}=make(gockelok);m._visuals(1);
    const idle=m.nodes.head.getWorldPosition(new THREE.Vector3());
    const inst=m.beginAttack('gockelok_maschinenpicken',{tgMul:1});
    m.attack.t=inst.wall(.85);m._visuals(1);
    const hit=m.nodes.head.getWorldPosition(new THREE.Vector3());
    expect(hit.y).toBeLessThan(idle.y-2);expect(hit.y).toBeLessThan(2.3);
    m.attack.t=inst.wall(3);m._visuals(1);
    const recovery=m.nodes.head.getWorldPosition(new THREE.Vector3());
    expect(recovery.y).toBeLessThan(idle.y-2);expect(recovery.y).toBeLessThan(2.3);
    const beak=new THREE.Vector3(0,-.08,.65);m.nodes.head.localToWorld(beak);
    expect(beak.y).toBeLessThan(2.3);expect(beak.z).toBeGreaterThan(idle.z);
    gockelok.dispose(m);
  });
});
