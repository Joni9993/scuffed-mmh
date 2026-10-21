import { describe,it,expect,vi,beforeEach } from 'vitest';
import { createFinaleArsenal,ARSENAL } from '../../src/game/gear/finaleAbilities.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { jaggo } from '../../src/game/monsters/jaggo.js';
import { Player } from '../../src/game/player.js';
import { Hunt } from '../../src/game/hunt.js';
import { applyLoadout } from '../../src/game/loadout.js';
import { time } from '../../src/core/time.js';
import { makeCtx,DT } from './p3helpers.js';

beforeEach(()=>{time.reset();time.manual=1;});
const armor=set=>Object.fromEntries(['head','body','legs'].map(s=>[s,`${set}_${s}`]));
function fixture(branch='p',set='lumpen'){
  const h=makeCtx();h.time=0;h.stats={damage:0,hits:0};h.mods={player:{}};h.glitchSys={hitting:null};
  h.fx.marker=vi.fn();h.fx.clearMarker=vi.fn();h.fx.ring=vi.fn();h.fx.number=vi.fn();
  const p=new Player({ctx:h,weapon:'gs',tier:7,branch});h.players.push(p);h.player=p;
  applyLoadout(p,{weapon:{type:'gs',tier:7,branch},armor:armor(set),items:[],food:null});
  const m=new Monster({...jaggo,hp:100000},h,{id:'target',x:0,z:0,state:'combat',seed:3});h.monsters.push(m);m._visuals(DT);
  const arsenal=createFinaleArsenal(h),proc=[];h.bus.on('hit',e=>{if(e.finaleProc)proc.push(e);});
  const hit=(options={})=>h.bus.emit('hit',{player:p,monster:m,part:'body',dmg:p.stats.power,motionValue:100,weak:true,...options});
  const step=seconds=>{h.time+=seconds;arsenal.update(seconds);};
  const fill=()=>{for(let i=0;i<6;i++)hit();};
  return {h,p,m,arsenal,proc,hit,step,fill};
}

describe('Finale weapon abilities through real damage routing',()=>{
  for(const [branch,aspect] of [['p','p'],['f','f'],['i','i'],[null,'u']])it(`${aspect}: delays a bounded real hit, never recursively charges its own proc`,()=>{
    const {h,p,m,arsenal,proc,fill,step}=fixture(branch);if(aspect==='i')h.bus.emit('glitchCounter',{player:p});
    const hp=m.hp;fill();step(ARSENAL[aspect].delay-.01);expect(proc).toHaveLength(0);expect(m.hp).toBe(hp);
    step(.02);expect(proc).toHaveLength(1);expect(m.hp).toBeLessThan(hp);expect(proc[0].attackerId).toBe(p.id);
    expect(proc[0].blastBuild).toBe(0);expect(proc[0].finaleProc).toBe(true);if(aspect==='f')expect(proc[0].partDmgMul).toBe(2.2);
    const after=m.hp;step(20);expect(m.hp).toBe(after);expect(proc).toHaveLength(1);arsenal.dispose();
  });
  it('requires a counter for prism echoes, expires them, and primes Ur before its first target',()=>{
    const prism=fixture('i');prism.fill();prism.step(1);expect(prism.proc).toHaveLength(0);
    prism.h.bus.emit('counter',{player:prism.p});prism.step(8.1);prism.fill();prism.step(1);expect(prism.proc).toHaveLength(0);prism.arsenal.dispose();
    const ur=fixture(null);ur.h.bus.emit('glitchCounter',{player:ur.p});ur.hit();ur.step(ARSENAL.u.delay+.01);expect(ur.proc).toHaveLength(1);ur.arsenal.dispose();
  });
  it('honours cooldown and does not damage an enemy that leaves the announced area',()=>{
    const x=fixture('p');x.fill();x.step(.7);expect(x.proc).toHaveLength(1);
    x.fill();x.step(.7);expect(x.proc).toHaveLength(1);
    x.step(4);x.hit();x.m.pos.x+=20;x.m._visuals(DT);const hp=x.m.hp;x.step(.7);expect(x.m.hp).toBe(hp);expect(x.proc).toHaveLength(1);
    expect(x.h.fx.clearMarker).toHaveBeenCalled();x.arsenal.dispose();
  });
  it.each(['ko','gear','form','result'])('cancels an armed area on %s changes',kind=>{
    const x=fixture('p');x.fill();const hp=x.m.hp;
    if(kind==='ko'){x.p.state='ko';x.h.bus.emit('playerDown',{player:x.p});}
    if(kind==='gear')x.p.setWeapon('gs',6,'v');
    if(kind==='form')x.m.gockelForm='reveal';
    if(kind==='result')x.h.result='win';
    x.step(1);expect(x.proc).toHaveLength(0);expect(x.m.hp).toBe(hp);expect(x.h.fx.clearMarker).toHaveBeenCalled();x.arsenal.dispose();
  });
  it('routes a guest proc through sendHit exactly once and ignores non-local players',()=>{
    const x=fixture('p'),sendHit=vi.fn();x.h.net={isGuest:true,sendHit};const hp=x.m.hp;
    x.p.local=false;x.fill();x.step(1);expect(sendHit).not.toHaveBeenCalled();
    x.p.local=true;x.fill();x.step(.7);expect(sendHit).toHaveBeenCalledTimes(1);expect(x.m.hp).toBe(hp);
    expect(sendHit.mock.calls[0][1]).toMatchObject({attackerId:x.p.id,finaleProc:true,blastBuild:0});x.arsenal.dispose();
  });
});

describe('Endgame armour uses live player/hunt hooks',()=>{
  it('refunds stamina once for a real perfect dodge without granting free repeated refunds',()=>{
    const x=fixture('p','voltiris');x.p.state='roll';x.p.rollT=.1;x.p.v.stamina=40;
    expect(x.p.takeHit({dmg:50,key:'one-hit'})).toBe('perfect');expect(x.p.v.stamina).toBe(52);
    expect(x.p.takeHit({dmg:50,key:'one-hit'})).toBe('iframe');expect(x.p.v.stamina).toBe(52);x.arsenal.dispose();
  });
  it('reduces actual guard stamina and applies Pyrostur low-health damage only below its threshold',()=>{
    const tank=fixture('p','felsengroll');tank.p.rot=0;tank.p.weapon.blockDef=()=>({arc:180,staminaMul:1,pass:.2,wucht:1});
    tank.p.v.stamina=100;tank.p.takeHit({dmg:50,key:'guard1',sourcePos:{x:0,z:5}});const saving=100-tank.p.v.stamina;
    tank.p.guardStamMul=1;tank.p.v.stamina=100;tank.p.takeHit({dmg:50,key:'guard2',sourcePos:{x:0,z:5}});expect(saving/(100-tank.p.v.stamina)).toBeCloseTo(.76);tank.arsenal.dispose();
    const fire=fixture('p','pyrostur');fire.p.stats.elems={};fire.p.stats.crit=0;fire.h.rng=()=>1;
    const hp=fire.m.hurtParts().find(q=>q.part.id==='body'),ah={hit:{mv:100,hitstop:'none'}};
    fire.p.v.hp=fire.p.v.maxHp*.5;let before=fire.m.hp;Hunt.prototype.playerHit.call(fire.h,fire.p,fire.m,hp,ah);const normal=before-fire.m.hp;
    fire.p.v.hp=fire.p.v.maxHp*.49;before=fire.m.hp;Hunt.prototype.playerHit.call(fire.h,fire.p,fire.m,hp,ah);const heated=before-fire.m.hp;
    expect(heated/normal).toBeCloseTo(1.12,2);fire.arsenal.dispose();
  });
});
