import { describe,it,expect,beforeEach } from 'vitest';
import { make } from './p3helpers.js';
import { time } from '../../src/core/time.js';
import { pyrostur } from '../../src/game/monsters/pyrostur.js';
import { brathalos } from '../../src/game/monsters/brathalos.js';
import { mampfaffe } from '../../src/game/monsters/mampfaffe.js';
import { fireballDef, ProjectileSet } from '../../src/game/monsters/mprojectiles.js';
import { addScorch,addRing,tickHazards } from '../../src/game/monsters/pyrosturHazards.js';
import { createHazards } from '../../src/game/world/hazards.js';
import { encodeHit,decodeHit } from '../../src/net/protocol.js';

beforeEach(()=>time.reset());

function prepared(def=pyrostur) {
  const h=make(def);h.p.protect=0;h.p.v.hp=h.p.v.maxHp=1000;
  h.p.itemBuffs={frost:{t:60,reduction:.25}};
  h.p.weapon.superArmor=()=> 'all';
  h.hits=[];
  const take=h.p.takeHit.bind(h.p);h.p.takeHit=hit=>{h.hits.push(hit);return take(hit);};
  return h;
}

describe('actual elemental hit routing',()=>{
  it.each([
    [pyrostur,'pyrostur_ofenschneise','fire'],
    [pyrostur,'pyrostur_seitenablass','fire'],
    [pyrostur,'pyrostur_zange',undefined],
    [brathalos,'brathalos_flammenstoss','fire'],
    [brathalos,'brathalos_schwanz',undefined],
  ].map(([def,id,element])=>({def,id,element})))('$id forwards hit elements without turning physical attacks into fire', ({def,id,element})=>{
    const {m,p,hits}=prepared(def),inst=m.beginAttack(id,{teach:false});
    const first=inst.def.hits[0],t=inst.wall((first.t0+first.t1)/2),shape=inst.hitsAt(t)[0].shape;
    const center=shape.type==='capsule'?{x:(shape.a.x+shape.b.x)/2,z:(shape.a.z+shape.b.z)/2}:shape;
    p.spawnAt(center.x,center.z);
    m._attackHits(inst,t);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(h=>h.element===element)).toBe(true);
    expect(1000-p.v.hp).toBeCloseTo(hits.reduce((sum,h)=>sum+h.dmg*(element==='fire'?.75:1),0));
  });
  it('marks the ape fire burp explicitly, while leaving its other attacks physical',()=>{
    const fire=Object.values(mampfaffe.attacks).flatMap(a=>a.hits??[]).filter(h=>h.status?.type==='burn');
    expect(fire.length).toBeGreaterThan(0);expect(fire.every(h=>h.element==='fire')).toBe(true);
  });
  it.each(['fire','magma','rock'])('%s projectiles reach Player.takeHit with the appropriate element',kind=>{
    const {m,p,ctx,hits}=prepared();p.spawnAt(0,0);
    const set=new ProjectileSet(ctx,m);
    const def=kind==='fire'?fireballDef({from:{x:0,y:1,z:-2},aim:{x:0,y:1,z:2},speed:8,extra:0,key:'test'}):
      {kind,mode:'impact',from:{x:0,y:3,z:0},to:{x:0,y:0,z:0},dur:.2,arc:1,splash:2,hold:.3,dmg:28,key:'test'};
    set.spawn(def);set.update(.25);
    expect(hits).toHaveLength(1);expect(hits[0].element).toBe(kind==='rock'?undefined:'fire');
    expect(1000-p.v.hp).toBeCloseTo(28*(kind==='rock'?1:.75));
    set.clear();
  });
  it('preserves an explicitly configured projectile element',()=>{
    const {m,p,ctx,hits}=prepared();p.spawnAt(0,0);
    const set=new ProjectileSet(ctx,m);
    set.spawn({...fireballDef({from:{x:0,y:1,z:-2},aim:{x:0,y:1,z:2},speed:8,extra:0,key:'override'}),element:'shock'});
    set.update(.25);expect(hits[0].element).toBe('shock');expect(1000-p.v.hp).toBe(28);set.clear();
  });
  it.each(['fire','slag'])('%s ground fields keep their elemental identity',kind=>{
    const {m,p,hits}=prepared();p.spawnAt(0,0);
    addScorch(m,0,0,{kind,ignite:0,status:null,dmg:20});tickHazards(m);
    expect(hits).toHaveLength(1);expect(hits[0].element).toBe(kind==='fire'?'fire':undefined);
    expect(1000-p.v.hp).toBe(kind==='fire'?15:20);
  });
  it.each(['fire','quake'])('%s rings preserve elemental versus physical damage',kind=>{
    const {m,p,hits}=prepared();p.spawnAt(2,0);
    addRing(m,0,0,{kind,r0:2,rMax:5,speed:1,dmg:20,status:null});tickHazards(m);
    expect(hits).toHaveLength(1);expect(hits[0].element).toBe(kind==='fire'?'fire':undefined);
    expect(1000-p.v.hp).toBe(kind==='fire'?15:20);
  });
  it.each(['fire','slag'])('%s delayed field blasts retain the field element',kind=>{
    const {m,p,hits}=prepared();p.spawnAt(0,0);
    addScorch(m,0,0,{kind,ignite:0,secs:.1,blast:{dmg:20,r:2}});m.time=.2;tickHazards(m);
    expect(hits).toHaveLength(1);expect(hits[0].element).toBe(kind==='fire'?'fire':undefined);
    expect(1000-p.v.hp).toBe(kind==='fire'?15:20);
  });
  it('frost protection reduces actual lava ticks',()=>{
    const {p,ctx,hits}=prepared();p.spawnAt(0,0);
    createHazards({groundType:()=> 'lava'}).update(.21,ctx);
    expect(hits).toHaveLength(1);expect(hits[0].element).toBe('fire');expect(1000-p.v.hp).toBeCloseTo(3.75);
  });
});

describe('part damage precision over co-op transport',()=>{
  it.each([1.15,1.5*1.15,2.2*1.15])('preserves multiplier %s through serialized hit messages',partDmgMul=>{
    const encoded=JSON.parse(JSON.stringify(encodeHit('boss',{partId:'head',dmg:100,partDmgMul},'guest')));
    expect(decodeHit(encoded).res.partDmgMul).toBeCloseTo(partDmgMul,3);
  });
});
