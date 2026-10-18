import { describe,it,expect,afterEach } from 'vitest';
import * as THREE from 'three';
import { gockelok, beginEye, seamOpen } from '../../src/game/monsters/gockelok.js';
import { applyCopy, tickCopies, clearCopy } from '../../src/game/monsters/gockelokCopy.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { make,makeCtx,DT } from './p3helpers.js';
import { monsters } from '../../src/game/monsters/index.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { Player } from '../../src/game/player.js';
import { time } from '../../src/core/time.js';
import { CINE_LEN } from '../../src/game/monsters/gockelokCutscene.js';
import { inArena } from '../../src/game/monsters/gockelokEye.js';
const params={attackId:'test',t0:0,origin:{x:4,y:0,z:-3},yaw:.4,targetPos:{x:6,y:0,z:15},seed:7};
describe('Gockelok and the Eye',()=>{
  it('replays every committed attack identically with telegraphs and recovery',()=>{
    for(const a of Object.values(gockelok.attacks)){
      const host=new AttackInstance(a,{...params,rage:true}),guest=new AttackInstance(a,{...params,rage:true});
      expect(host.firstHitTime(),a.id).toBeGreaterThanOrEqual(.5);expect(a.markerFromHits).toBe(true);
      expect(host.footprints()).toEqual(guest.footprints());
      for(let t=0;t<host.duration;t+=.09){expect(host.sample(t)).toEqual(guest.sample(t));expect(host.hitsAt(t)).toEqual(guest.hitsAt(t));}
      expect(host.duration-host.wall(Math.max(...a.hits.map(h=>h.t1)))+gockelok.recoverAfter()).toBeGreaterThanOrEqual(.9);
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
    const {m}=make(gockelok);const a=m.beginAttack('gockelok_maschinenpicken',{tgMul:1});m.attack.t=a.wall(.66);m._visuals(1);
    const head=m.nodes.head.getWorldPosition(new THREE.Vector3());expect(head.y).toBeGreaterThan(.4);expect(head.y).toBeLessThan(2.3);
    let draws=0;m.mesh.traverse(n=>{if(n.isMesh)draws++;});expect(draws).toBeLessThan(30);
    for(const p of gockelok.parts)for(const s of p.spheres)expect(m.nodes[s.node]).toBeTruthy();
  });
  // Same reckless reapproaching hunter as finaleCombat's pressure comparison (Schutz 150, 30 s, 3/6/12 m, two seeds).
  it('pressure comparison: the rooster out-presses every finale dragon, the Eye far more',()=>{
    const run=(id,phase,distance,seed,eye=false)=>{
      time.reset();const ctx=makeCtx(seed),m=new Monster(monsters[id],ctx,{id,x:0,z:0,state:'combat',seed});
      const p=new Player({ctx,weapon:'gs',tier:6});p.spawnAt(0,8,Math.PI);ctx.monsters.push(m);ctx.players.push(p);m.target=p;
      p.protect=150;p.god=true;m.fleeUsed=true;m.apexClock=-999;m.phase=Math.min(phase,m.def.phases?.length??0);
      if(eye){m.gockelForm='eye';m.phase=2;m.recover=1;}
      let dmg=0;ctx.bus.on('playerHit',e=>{if(e.player===p)dmg+=e.dmg;});
      for(let i=0;i<30*60;i++){if(p.state==='free'&&!m.attack)p.spawnAt(m.pos.x+Math.sin(m.rot)*distance,m.pos.z+Math.cos(m.rot)*distance);ctx.input.poll(DT);p.update(DT);m.update(DT);}
      return dmg;
    };
    const avg=(id,phase,eye)=>{let s=0,n=0;for(const d of [3,6,12])for(const seed of [11,37]){s+=run(id,phase,d,seed,eye);n++;}return s/n;};
    const rows={};
    for(const phase of [0,2]){
      const rooster=avg('gockelok',phase);rows['rooster'+phase]=Math.round(rooster);
      for(const id of ['pyrostur','felsengroll','voltiris']){const v=avg(id,phase);rows[id+phase]=Math.round(v);expect(rooster,`rooster phase${phase} vs ${id}`).toBeGreaterThan(v*1.15);}
    }
    const eye=avg('gockelok',2,true);rows.eye=Math.round(eye);
    if(process.env.FINALE_VERBOSE)console.log('Gockelok pressure (30s, Schutz150):',JSON.stringify(rows));
    expect(eye).toBeGreaterThan(Math.max(...Object.values(rows).filter(v=>v!==rows.eye))*1.4);
  },60000);
});
describe('Gockelok cinematic and portal',()=>{
  let store;
  const mem=()=>{store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))};};
  afterEach(()=>{delete globalThis.localStorage;});
  const stage=()=>{
    const r=make(gockelok),{ctx}=r;
    ctx.world={heightAt:(x,z)=>2+.05*x,collide(){},walkable:()=>true,campPoint:{x:-40,z:0},update(){}};
    ctx.rig={cine:null,snaps:0,snap(){this.snaps++;}};ctx.hud={center(){},cinema(s){ctx.cinema=s;}};
    r.p.spawnAt(0,8,Math.PI);return r;
  };
  const run=(m,ctx,secs,each)=>{for(let t=0;t<secs;t+=DT){each?.();gockelok.tick(m,DT);}};
  it('plays at least 7 s, cannot be skipped the first time, keeps hunters invulnerable and ends in the arena',()=>{
    mem();const {m,ctx,p}=stage();
    m.applyDamage({dmg:999999,partId:'body'});expect(m.gockelForm).toBe('reveal');
    run(m,ctx,7,()=>{ctx.cineSkip=true;ctx.input.b.context.pressed=true;p.pos.set(m.pos.x,p.pos.y,m.pos.z+1);});
    expect(m.gockelForm).toBe('reveal');expect(ctx.cineLock).toBe(true);expect(ctx.rig.cine?.pos).toBeTruthy();expect(ctx.cinema.bars).toBeGreaterThan(.9);
    expect(p.takeHit({dmg:50,knock:'flinch',sourcePos:m.pos,key:'x'})).toBe('iframe');
    ctx.input.b.context.pressed=false;
    run(m,ctx,CINE_LEN-7+.1);
    expect(CINE_LEN).toBeGreaterThanOrEqual(7);
    expect(m.gockelForm).toBe('eye');expect(p.pos.y).toBe(100);expect(inArena(m,p.pos)).toBe(true);
    expect(ctx.cineLock).toBe(false);expect(ctx.rig.cine).toBe(null);expect(ctx.cinema).toBe(null);
    expect(store.get('sh.gockelok.cineSeen')).toBe('1');
    gockelok.dispose(m);
  });
  it('a seen cinematic can be skipped with interact (solo)',()=>{
    mem();store.set('sh.gockelok.cineSeen','1');const {m,ctx,p}=stage();
    m.applyDamage({dmg:999999,partId:'body'});run(m,ctx,1);
    expect(ctx.cinema.hint).toMatch(/Überspringen/);
    ctx.cineSkip=true;gockelok.tick(m,DT);
    expect(m.gockelForm).toBe('eye');expect(inArena(m,p.pos)).toBe(true);expect(ctx.cineLock).toBe(false);
    gockelok.dispose(m);
  });
  it('KO in eye form respawns on the real ground at the fallen rooster; the portal leads back into the arena',()=>{
    const {m,ctx,p}=stage();m.pos.set(10,0,-6);
    m.applyDamage({dmg:999999,partId:'body'});run(m,ctx,CINE_LEN+.1);
    expect(m.gockelForm).toBe('eye');expect(m.fallPos).toEqual({x:10,z:-6});expect(inArena(m,m.pos)).toBe(true);
    expect(ctx.world.heightAt(10,-6)).toBeCloseTo(2.5,6);
    expect(gockelok.respawnPlayer(m,p)).toBe(true);
    const d=Math.hypot(p.pos.x-10,p.pos.z+6);expect(d).toBeGreaterThan(3);expect(d).toBeLessThan(10);
    expect(p.pos.y).toBeCloseTo(2+.05*p.pos.x,6);expect(inArena(m,p.pos)).toBe(false);
    expect(gockelok.mapPos(m,p.pos).portal).toBe(true);
    gockelok.tick(m,DT);expect(inArena(m,p.pos)).toBe(false); // standing next to it does nothing
    m.target=p;gockelok.combat(m,DT);expect(m.target).not.toBe(p); // the Eye does not chase out of the arena
    p.pos.set(10.5,2.5,-5.5);gockelok.tick(m,DT);
    expect(inArena(m,p.pos)).toBe(true);expect(p.pos.y).toBe(100);
    gockelok.dispose(m);expect(ctx.world.heightAt(0,0)).toBe(2);
    const fresh=make(gockelok).m;expect(fresh.gockelForm).toBe('rooster');expect(fresh.fallPos).toBeUndefined();expect(fresh.eyeArena).toBeFalsy();
  });
});
