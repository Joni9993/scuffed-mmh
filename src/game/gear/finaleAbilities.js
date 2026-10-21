import { applyMonsterHit, resolvePlayerHit } from '../combat.js';

export const ARSENAL = {
  p:{name:'Kesselherz',color:'#ff9650',delay:.65,radius:3,mult:1.1,cooldown:4},
  f:{name:'Weltenbruch',color:'#e7bb77',delay:.45,radius:4,mult:.9,cooldown:5},
  i:{name:'Prismennachhall',color:'#9fefff',delay:.35,radius:2.4,mult:.55,cooldown:.45},
  u:{name:'Nahtschneider',color:'#b2ffe7',delay:.6,radius:3.2,mult:1.25,cooldown:6},
};
const aspect=p=>p?.stats?.tier===7?(p.stats.finaleAspect??'u'):null;
const signature=p=>`${p.weaponId}:${p.stats?.tier}:${p.stats?.branch??''}`;

/** Local-owned effects use the normal host/guest damage path. Secondary hits never
 * feed themselves, consume extra ammo, or invoke weapon-specific hit callbacks. */
export function createFinaleArsenal(h) {
  const states=new Map(),pending=[];
  const clearQueued=p=>{for(let i=pending.length-1;i>=0;i--)if(pending[i].player===p){h.fx.clearMarker?.(pending[i].key);pending.splice(i,1);}};
  function state(p){
    let s=states.get(p);const sig=signature(p),a=aspect(p);
    if(!s||s.signature!==sig){clearQueued(p);s={signature:sig,aspect:a,gauge:0,cooldown:0,echoes:0,echoUntil:0,target:null,targetForm:null};states.set(p,s);}
    return s;
  }
  function reset(p){clearQueued(p);states.delete(p);if(p)p.finaleStatus=null;}
  function queue(p,m,part,s){
    const cfg=ARSENAL[s.aspect],hit=m.hurtParts?.().find(q=>q.part.id===part),pos=hit?.pos??m.pos;
    if(!cfg||!pos||pending.filter(q=>q.player===p).length>=4)return;
    const at={x:pos.x,y:h.world.heightAt(pos.x,pos.z),z:pos.z};
    const slot=[0,1,2,3].find(n=>!pending.some(q=>q.key===`finale:${p.id}:${n}`));
    pending.push({player:p,monster:m,part,form:m.gockelForm,at,key:`finale:${p.id}:${slot}`,left:cfg.delay,cfg,aspect:s.aspect,signature:s.signature,power:p.stats.power,mul:Math.min(2,(p.dmgMul??1)*(p.glitchDmgMul??1))});
    s.cooldown=cfg.cooldown;h.fx.ring?.(at,.2,cfg.radius,{color:cfg.color,life:cfg.delay});
  }
  const offHit=h.bus.on('hit',e=>{
    const p=e.player,m=e.monster;
    if(!p?.local||!p.alive||!m?.alive||e.finaleProc||e.blast||!(e.dmg>0)||h.result)return;
    const s=state(p);if(!ARSENAL[s.aspect])return;
    if(s.target!==m.id||s.targetForm!==m.gockelForm){if(s.target!==null)s.gauge=0;s.target=m.id;s.targetForm=m.gockelForm;}
    const mv=Math.max(0,e.motionValue??20);
    if(s.aspect==='p')s.gauge=Math.min(100,s.gauge+Math.min(32,Math.max(5,mv*.4)));
    if(s.aspect==='f')s.gauge=Math.min(100,s.gauge+Math.min(35,e.dmg/Math.max(1,p.stats.power)*22));
    if(s.aspect==='u')s.gauge=Math.min(100,s.gauge+(e.weak?40:20));
    if(s.cooldown>0)return;
    if(s.aspect==='i'){if(s.echoes>0&&s.echoUntil>h.time){s.echoes--;queue(p,m,e.part,s);}return;}
    if(s.gauge<100||s.aspect==='f'&&mv<45&&!e.weak)return;
    s.gauge=0;queue(p,m,e.part,s);
  });
  function counter(e){
    const p=e?.player??h.player;if(!p?.local||!p.alive)return;
    const s=state(p);if(s.aspect==='i'){s.echoes=3;s.echoUntil=h.time+8;}
    if(s.aspect==='u')s.gauge=100;
    if(p.perfectStamina)p.v.stamina=Math.min(p.v.maxStamina,p.v.stamina+p.perfectStamina);
  }
  const offs=[offHit,h.bus.on('glitchCounter',counter),h.bus.on('counter',counter),h.bus.on('playerDown',e=>reset(e.player??h.player)),h.bus.on('questComplete',()=>{for(const p of states.keys())reset(p);}),h.bus.on('questFailed',()=>{for(const p of states.keys())reset(p);})];
  return {
    update(dt){
      for(const p of h.players??[]){
        if(!p.local)continue;if(!p.alive||h.result){reset(p);continue;}
        const s=state(p),cfg=ARSENAL[s.aspect];s.cooldown=Math.max(0,s.cooldown-dt);
        const target=h.monsters?.find(m=>m.id===s.target);
        if(target&&target.gockelForm!==s.targetForm){clearQueued(p);s.gauge=0;s.echoes=0;s.targetForm=target.gockelForm;}
        if(s.echoUntil<=h.time)s.echoes=0;
        p.finaleStatus=cfg?{name:cfg.name,color:cfg.color,charge:s.aspect==='i'?s.echoes/3:s.gauge/100,cooldown:s.cooldown,ready:s.aspect==='i'?s.echoes>0:s.gauge>=100}:null;
      }
      for(let i=pending.length-1;i>=0;i--){
        const q=pending[i],p=q.player,m=q.monster;q.left-=dt;
        const cancelled=!p.alive||h.result||signature(p)!==q.signature||!m.alive||m.gockelForm!==q.form;
        if(!cancelled&&q.left>0){h.fx.marker?.(q.key,q.at,q.cfg.radius,q.cfg.color,false);continue;}
        h.fx.clearMarker?.(q.key);pending.splice(i,1);if(cancelled)continue;
        // A moving enemy can leave a delayed area; new boss forms cannot inherit an old explosion.
        const hp=m.hurtParts?.().find(x=>x.part.id===q.part&&Math.hypot(x.pos.x-q.at.x,x.pos.z-q.at.z)<=q.cfg.radius+(x.sphere?.r??0));
        if(!hp||m.def.invulnerable?.(m)||m.def.partActive?.(m,hp.part)===false)continue;
        const res=resolvePlayerHit({power:q.power,critChance:0,elems:q.aspect==='p'?{fire:35}:{},dmgMul:q.mul},{mv:q.cfg.mult*100,blunt:0,hitstop:'none'},hp.part,()=>1);
        Object.assign(res,{partId:hp.part.id,attackerId:p.id,partDmgMul:q.aspect==='f'?2.2:1,finaleProc:true,blastBuild:0,wucht:0,hitstop:0,shake:0});
        applyMonsterHit(m,res,h);h.stats.damage+=res.dmg;
        h.fx.spark?.(hp.pos,18,q.cfg.color,5);h.fx.ring?.(q.at,.3,q.cfg.radius,{color:q.cfg.color,life:.3});
        h.fx.number?.({...hp.pos,y:hp.pos.y+.7},`${q.cfg.name} ${res.dmg}`,'weak');
        h.bus.emit('sfx',{name:'heavy',pos:hp.pos});h.bus.emit('hit',{player:p,monster:m,part:hp.part.id,...res});
      }
    },
    dispose(){for(const off of offs)off();for(const p of states.keys())reset(p);},
  };
}
