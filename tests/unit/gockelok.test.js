import { describe,it,expect } from 'vitest';
import * as THREE from 'three';
import { gockelok, beginEye, seamOpen } from '../../src/game/monsters/gockelok.js';
import { applyCopy, tickCopies, clearCopy } from '../../src/game/monsters/gockelokCopy.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { make,DT } from './p3helpers.js';
const params={attackId:'test',t0:0,origin:{x:4,y:0,z:-3},yaw:.4,targetPos:{x:6,y:0,z:15},seed:7};
describe('Gockelok and the Eye',()=>{
  it('replays every committed attack identically with telegraphs and recovery',()=>{
    for(const a of Object.values(gockelok.attacks)){
      const host=new AttackInstance(a,{...params,rage:true}),guest=new AttackInstance(a,{...params,rage:true});
      expect(host.firstHitTime(),a.id).toBeGreaterThanOrEqual(.5);expect(a.markerFromHits).toBe(true);
      expect(host.footprints()).toEqual(guest.footprints());
      for(let t=0;t<host.duration;t+=.09){expect(host.sample(t)).toEqual(guest.sample(t));expect(host.hitsAt(t)).toEqual(guest.hitsAt(t));}
      expect(host.duration-host.wall(Math.max(...a.hits.map(h=>h.t1)))+gockelok.recoverAfter()).toBeGreaterThanOrEqual(1.5);
    }
    expect(gockelok.attacks.gockelok_flatterartillerie).toBeUndefined();
  });
  it('keeps one hunt target, blocks transition damage and dies exactly once',()=>{
    const {m,ctx,p}=make(gockelok);let deaths=0;ctx.bus.on('monsterDead',()=>deaths++);
    const ev=m.applyDamage({dmg:999999,partId:'body'});
    expect(ev.killed).toBe(false);expect(m.gockelForm).toBe('reveal');expect(m.alive).toBe(true);expect(deaths).toBe(0);
    const hp=m.hp;expect(m.applyDamage({dmg:99999})).toBe(null);expect(m.hp).toBe(hp);
    beginEye(m);expect(m.gockelForm).toBe('eye');expect(p.pos.y).toBe(100);
    p.pos.set(0,0,0);gockelok.returnPlayer(m,p);expect(p.pos.y).toBe(100);expect(m.hp).toBe(hp);
    m.applyDamage({dmg:99999,partId:'body'});m._die();expect(deaths).toBe(1);
    gockelok.dispose(m);expect(ctx.world.heightAt(0,0)).toBe(0);expect(make(gockelok).m.gockelForm).toBe('rooster');
  });
  it('also intercepts poison death and auto-enters without a blocking hunter',()=>{
    const {m}=make(gockelok);m.hp=.01;m.st.poisonT=10;m._poisonTick(1);expect(m.gockelForm).toBe('reveal');
    gockelok.tick(m,17);expect(m.gockelForm).toBe('eye');gockelok.dispose(m);
  });
  it('comb and spur breaks remove danger and wing breaks lengthen landings',()=>{
    const {m}=make(gockelok);m.phase=2;
    for(const id of ['comb','spur','wing'])m._breakPart(m.partById[id]);
    expect(m._atkAllowed(gockelok.attacks.gockelok_kikeriki)).toBe(false);
    expect(m._atkAllowed(gockelok.attacks.gockelok_kikeriki_heiser)).toBe(true);
    expect(gockelok.attacks.gockelok_sprungsporne.hits).toHaveLength(2);
    expect(gockelok.attacks.gockelok_sprungsporne_bruch.hits).toHaveLength(1);
    gockelok.onAttackEnd(m,'gockelok_sprungsporne_bruch');expect(m.recover).toBeGreaterThanOrEqual(2.5);
    expect(m.extra.spurL.scale.z).toBe(.2);expect(m.nodes.wingL.scale.z).toBe(.6);
  });
  it('only actual seam hits interrupt; cooldown prevents permanent stagger',()=>{
    const {m}=make(gockelok);m.phase=2;m.beginAttack('gockelok_nahtsignatur',{tgMul:1});m.attack.t=.5;
    expect(seamOpen(m)).toBe(true);m._visuals(DT);
    expect(m.hurtParts().some(h=>h.part.id==='seam')).toBe(true);
    m.applyDamage({dmg:200,partId:'body'});expect(m.attack).not.toBe(null);
    m.applyDamage({dmg:200,partId:'seam'});expect(m.attack).toBe(null);expect(m.recover).toBe(4);
    m.beginAttack('gockelok_nahtsignatur',{tgMul:1});m.attack.t=.5;expect(seamOpen(m)).toBe(false);
    m._visuals(DT);expect(m.hurtParts().some(h=>h.part.id==='seam')).toBe(false);
  });
  it('pins at most two copies, does not refresh, and clears pending geometry on all cures',()=>{
    const {m,p,ctx}=make(gockelok);ctx.scene=new THREE.Scene();applyCopy(m,p);tickCopies(m,1);
    const s=p.status.fehlkopie,c=s.copies[0];p.pos.x+=10;applyCopy(m,p);
    expect(p.status.fehlkopie).toBe(s);expect(c.x).not.toBe(p.pos.x);expect(s.t).toBe(7);
    tickCopies(m,1.7);expect(s.next).toBe(1);expect(ctx.scene.children).toHaveLength(0);
    tickCopies(m,1.4);expect(s.next).toBe(2);expect(ctx.scene.children).toHaveLength(1);
    ctx.bus.emit('glitchStart',{player:p});expect(p.status.fehlkopie).toBeUndefined();expect(ctx.scene.children).toHaveLength(0);
    applyCopy(m,p);tickCopies(m,1);p.clearStatus();tickCopies(m,.01);expect(ctx.scene.children).toHaveLength(0);
    applyCopy(m,p);tickCopies(m,1);clearCopy(m,p);expect(ctx.scene.children).toHaveLength(0);
  });
  it('makes the peck head reachable and stays under the mesh budget in both forms',()=>{
    const {m}=make(gockelok);const a=m.beginAttack('gockelok_maschinenpicken',{tgMul:1});m.attack.t=a.wall(.85);m._visuals(1);
    const head=m.nodes.head.getWorldPosition(new THREE.Vector3());expect(head.y).toBeGreaterThan(.4);expect(head.y).toBeLessThan(2.3);
    let draws=0;m.mesh.traverse(n=>{if(n.isMesh)draws++;});expect(draws).toBeLessThan(30);
    for(const p of gockelok.parts)for(const s of p.spheres)expect(m.nodes[s.node]).toBeTruthy();
  });
});
