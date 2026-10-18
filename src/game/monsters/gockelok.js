import { buildGockelok } from './gockelokRig.js';
import { gockelAttacks } from './gockelokAttacks.js';
import { spendStamina } from '../vitals.js';
import { applyCopy, clearCopy, tickCopies, receiveCopies, clearRemoteCopies } from './gockelokCopy.js';
import { enterEye, eyeReturn, eyeRespawn, inArena, disposeEye, tickEye, tickPortal, disposePortal } from './gockelokEye.js';
import { CINE_LEN, tickCine, endCine, cinePose } from './gockelokCutscene.js';

export const EYE_HP = .32;
const elem={fire:15,shock:15,ice:15,water:15,blast:20};
export function seamOpen(m) {
  const a=m.attack,w=a?.inst.def.seam;
  if(!w || m.seamCooldown>0 || !['rooster','eye'].includes(m.gockelForm))return false;
  const t=a.inst.tau(a.t);return t>=w[0] && t<w[1];
}
function clearAll(m) { clearRemoteCopies(m);for(const p of m.ctx.players)clearCopy(m,p); }
function reveal(m) {
  if(m.gockelForm!=='rooster')return;
  m.hp=Math.max(1,m.maxHp*EYE_HP);m.gockelForm='reveal';m.formTime=0;m.phase=2;m.phaseT=0;
  m._interrupt();m.queued=null;m.phaseSpecial=null;m.stunT=m.stagT=0;m.st.poisonT=0;m.st.trap=0;m.rage=false;
  m.vel.set(0,0,0);m.air=0;clearAll(m);m.fallPos={x:m.pos.x,z:m.pos.z};
}
export function beginEye(m) {
  if(!['reveal','entry'].includes(m.gockelForm))return;
  m.gockelForm='eye';m.formTime=0;m.phase=2;m._interrupt();m.queued=null;m.phaseSpecial=null;
  m.stunT=m.stagT=0;m.recover=3;m.cds={};m.stamina=100;m.tired=false;m.tiredT=0;
  enterEye(m);m.setState('combat');m.ctx.hud?.center('Zerreiße die Realitätsnähte!',3);
}
function collapse(m) {
  m._interrupt();m.queued=null;m.phaseSpecial=null;m.seamCooldown=13;m.seamDamage=0;m.recover=4;m.stagT=0;
  m.ctx.hud?.center('REALITÄTSNAHT ZERRISSEN — Ursprung offen!',2);
  m.ctx.bus.emit('sfx',{name:'heavy',pos:m.pos});
}
// Every attack chains; later phases weigh the follow-ups heavier, so strings grow from ~2 to 4-6 links.
const R=(atk,w,cond)=>[{atk:'gockelok_'+atk,w,cond},{atk:'gockelok_'+atk,w:w*.7,cond:(m,d)=>m.phase>=1&&(!cond||cond(m,d))},{atk:'gockelok_'+atk,w:w*.9,cond:(m,d)=>m.phase>=2&&(!cond||cond(m,d))}];
const rooster=(list,stop=5)=>[...list.flatMap(([a,w,c])=>R(a,w,c)),{atk:null,w:stop}];
const isFar=(m,d)=>d>8;
const EYE=['frames','rollback','raumbruch','fehlerkaskade','nullsprung','speicherflut','bluescreen'];
const eyeChain=self=>[...EYE.filter(a=>a!==self).map(a=>({atk:'gockelok_'+a,w:a==='bluescreen'?1.5:a==='nullsprung'?4:3})),{atk:null,w:1}];
const chains={
  gockelok_maschinenpicken:rooster([['scharrhieb',3],['spornstich',3],['flankenwechsel',3],['hahnenwirbel',2],['fluegelfeger',2],['schnabelanker',2]]),
  gockelok_schnabelanker:rooster([['maschinenpicken',3],['flankenwechsel',3],['fluegelfeger',2],['versetzter_schnabel',3]]),
  gockelok_scharrhieb:rooster([['fluegelfeger',3],['spornstich',3],['maschinenpicken',2],['hahnenwirbel',2]]),
  gockelok_spornstich:rooster([['scharrhieb',3],['maschinenpicken',3],['flankenwechsel',2],['sprungsporne',2],['jagdlauf',2,isFar]]),
  gockelok_fluegelfeger:rooster([['maschinenpicken',3],['scharrhieb',2],['flankenwechsel',3],['hahnenwirbel',2]]),
  gockelok_flankenwechsel:rooster([['spornstich',3],['versetzter_schnabel',4],['maschinenpicken',3],['schnabelanker',2]]),
  gockelok_jagdlauf:rooster([['maschinenpicken',4],['scharrhieb',3],['fluegelfeger',3],['jagdlauf',3,isFar],['sprungsporne',2],['kraehenschnitt',2]]),
  gockelok_sprungsporne:rooster([['maschinenpicken',3],['hahnenwirbel',3],['jagdlauf',2],['kraehenschnitt',2]]),
  gockelok_sprungsporne_bruch:rooster([['maschinenpicken',3],['hahnenwirbel',3],['jagdlauf',2]]),
  gockelok_kikeriki:rooster([['jagdlauf',3],['sprungsporne',3],['risssprung',3],['kraehenschnitt',2]]),
  gockelok_kikeriki_heiser:rooster([['jagdlauf',3],['sprungsporne',3],['risssprung',3]]),
  gockelok_versetzter_schnabel:rooster([['maschinenpicken',3],['flankenwechsel',3],['schnabelanker',2],['hahnenwirbel',2]]),
  gockelok_hahnenwirbel:rooster([['jagdlauf',2],['spornstich',3],['sprungsporne',2],['versetzter_schnabel',2]]),
  gockelok_kraehenschnitt:rooster([['jagdlauf',4],['kraehenschnitt',2],['kraehenfaecher',3],['sprungsporne',3],['risssprung',3]]),
  gockelok_kraehenfaecher:rooster([['jagdlauf',4],['risssprung',4],['sprungsporne',3]]),
  gockelok_risssprung:rooster([['maschinenpicken',3],['hahnenwirbel',3],['nahtsignatur',1],['kraehenfaecher',2]]),
  gockelok_nahtsignatur:rooster([['jagdlauf',3],['risssprung',3],['sprungsporne',2]]),
  ...Object.fromEntries(EYE.map(a=>['gockelok_'+a,eyeChain(a)])),
};
function eyeCombat(m,dt) {
  const t=m.target;m.recover-=dt;m.eyeBlinkCd=Math.max(0,(m.eyeBlinkCd??0)-dt);
  const dx=t.pos.x-m.pos.x,dz=t.pos.z-m.pos.z,d=Math.hypot(dx,dz)||1;
  m._faceTarget(dt,6);
  // Teleport-like repositioning: a distant hunter finds the eye in front of them again.
  if(d>9 && m.eyeBlinkCd<=0) {
    m.pos.x=t.pos.x-dx/d*4.5;m.pos.z=t.pos.z-dz/d*4.5;m.ctx.world.collide?.(m.pos,m.bodyRadius*.5);m.rot=Math.atan2(dx,dz);
    m.eyeBlinkCd=2.2;m.recover=Math.min(m.recover,.1);m.ctx.bus.emit('sfx',{name:'heavy',pos:m.pos});
  } else if(d>4.5) {const v=Math.min(16*dt,d-4.5);m.pos.x+=dx/d*v;m.pos.z+=dz/d*v;}
  if(m.recover>0)return true;
  if(m.hp<m.maxHp*.09 && !m.finalCascade){m.finalCascade=true;m.chainNext=null;m.beginAttack('gockelok_absturz');return true;}
  if(m.chainNext){const cn=m.chainNext;m.chainNext=null;m.beginAttack(cn.id,{chainIdx:cn.idx});return true;}
  const a=m._chooseAttack(m.pos.distanceTo(t.pos));if(a)m.beginAttack(a.id);
  return true;
}
export const gockelok={
  id:'gockelok',name:'Gockelok, der Ur-Hahn',hp:42000,scale:2.2,bodyRadius:1.8,
  walk:5.5,run:14,turn:3.2,detect:45,prefer:3,noFlee:true,noRage:true,stamina:true,flinchDmg:2000,
  // Escalates per phase: faster pursuit, quicker strikes, shorter breathers. The Eye never rests.
  speedFactor:m=>m.gockelForm==='eye'?1:[1.2,1.3,1.4][m.phase]??1.4,
  attackTempo:m=>m.gockelForm==='eye'?1.2:[1.05,1.12,1.2][m.phase]??1.2,
  build:()=>buildGockelok(),attacks:gockelAttacks,teachAttack:'gockelok_maschinenpicken',
  parts:[
    {id:'seam',label:'Realitätsnaht',factor:1.6,elem,spheres:[{node:'seam',r:.48}]},
    {id:'comb',label:'Blutkrone',factor:1.15,breakHp:2300,elem,spheres:[{node:'head',offset:[0,.25,.1],r:.5}]},
    {id:'head',label:'Raubvogelschädel',factor:1.2,blunt:true,stunPart:true,elem,spheres:[{node:'head',offset:[0,0,.4],r:.55}]},
    {id:'spur',label:'Ur-Sporne',factor:1,breakHp:2400,elem,spheres:[{node:'spurL',offset:[0,0,-.2],r:.45},{node:'spurR',offset:[0,0,-.2],r:.45}]},
    {id:'legs',label:'Greifläufe',factor:.95,elem,spheres:[{node:'legL',offset:[0,-.55,.1],r:.42},{node:'legR',offset:[0,-.55,.1],r:.42}]},
    {id:'body',label:'Brustpanzer',factor:.75,elem,spheres:[{node:'body',offset:[0,.1,.3],r:.8},{node:'neck',offset:[0,.3,0],r:.4}]},
    {id:'wing',label:'Schwingen',factor:.85,breakHp:2800,elem,spheres:[{node:'wingL',offset:[0,-.25,-.2],r:.6},{node:'wingR',offset:[0,-.25,-.2],r:.6}]},
    {id:'tail',label:'Sichelgefieder',factor:.85,elem,spheres:[{node:'tail',offset:[0,.4,-.5],r:.65}]},
  ],
  phases:[{at:.8,name:'DIE BLUTKRONE',special:'gockelok_sprungsporne'},{at:.58,name:'UNTER DEN FEDERN',special:'gockelok_nahtsignatur'}],
  chainMax:5,recoverAfter:m=>m?.gockelForm==='eye'?.12:[.3,.2,.12][m?.phase??0]??.12,
  chains,
  init(m) {
    m.gockelForm='rooster';m.formTime=0;m.seamCooldown=0;m.seamDamage=0;
    m._offs.push(m.ctx.bus.on('glitchCounter',e=>clearCopy(m,e?.player)),m.ctx.bus.on('glitchStart',e=>clearCopy(m,e?.player)));
  },
  invulnerable:m=>['reveal','entry'].includes(m.gockelForm),
  partActive:(m,p)=>p.id!=='seam'||seamOpen(m),
  beforeDeath(m) { if(m.gockelForm==='rooster'){reveal(m);return false;} if(m.gockelForm!=='eye' && m.authority)return false; },
  onDeath(m) {clearAll(m);},
  onDamage(m,res) {
    if(!m.authority)return;
    if(m.gockelForm==='rooster' && m.hp<=m.maxHp*EYE_HP){reveal(m);return;}
    if(res.partId==='seam' && seamOpen(m)) {
      m.seamDamage+=res.dmg;
      if(m.seamDamage>=180*(m.coopMul??1)){collapse(m);clearAll(m);}
    }
  },
  combat(m,dt) {
    if(['reveal','entry'].includes(m.gockelForm)){m._brake(dt);return true;}
    if(m.gockelForm==='eye') {
      // Only hunters inside the arena are prey; one waiting at the portal outside is not chased.
      if(m.eyeArena && (!m.target || !inArena(m,m.target.pos))) m.target=m.ctx.players.find(p=>p.alive && inArena(m,p.pos))??null;
      if(!m.target){m._brake(dt);return true;}
      return eyeCombat(m,dt);
    }
    return false;
  },
  onHitPlayer(m,p,h) {if(h.hit.staminaDrain)spendStamina(p.v,h.hit.staminaDrain);if(h.hit.copy)applyCopy(m,p);},
  onGlitchCounter(m,id,p) {clearCopy(m,p);if(m.attack?.inst.def.seam && m.seamCooldown<=0)collapse(m);},
  onAttackEnd(m,id) {m.seamDamage=0;if(m.partById.wing.broken && id.includes('sprung'))m.recover=Math.max(m.recover,2.5);if(id==='gockelok_absturz'){m.recover=3;m.crashOpening=3;m.seamCooldown=Math.max(m.seamCooldown,4);}else if(m.gockelForm==='eye')m.recover=m.chainNext?.05:Math.min(m.recover,.15);},
  onBreak(m,p) {
    if(p.id==='comb')m.extra.comb.scale.y=.25;
    if(p.id==='spur'){m.extra.spurL.scale.z=.2;m.extra.spurR.scale.z=.2;}
    if(p.id==='wing'){m.extra.wingBroken=true;m.nodes.wingL.scale.z=.6;}
  },
  // Damage escalates with the phase; the Eye hits hardest. dmgPct hits are unaffected.
  hitDmgMul:(m,h)=>(m.partById.wing.broken && h.copy ? .85:1)*(m.gockelForm==='eye'?1.2:[1.1,1.15,1.2][m.phase]??1.2),
  tick(m,dt) {
    m.formTime+=dt;m.crashOpening=Math.max(0,(m.crashOpening??0)-dt);m.seamCooldown=Math.max(0,m.seamCooldown-dt);
    if(m.authority && m.gockelForm==='rooster' && m.hp<=m.maxHp*EYE_HP)reveal(m);
    // Kiting is tracked: the longer a hunter stays far away, the more gap closers and crow lanes he picks.
    const td=m.target?Math.hypot(m.target.pos.x-m.pos.x,m.target.pos.z-m.pos.z):0;
    m.gockelFarT=td>9?Math.min(6,(m.gockelFarT??0)+dt):Math.max(0,(m.gockelFarT??0)-2*dt);
    // Cinematic: nobody can block or speed it up; the authority alone ends it after CINE_LEN.
    if(['reveal','entry'].includes(m.gockelForm)) {
      for(const p of m.ctx.players)if(p.local)p.invuln=Math.max(p.invuln??0,.5);
      if(m.authority && (m.gockelForm==='entry' || m.formTime>=CINE_LEN))beginEye(m);
    }
    tickCine(m,dt,beginEye);
    tickCopies(m,dt);tickEye(m);tickPortal(m,dt);
    m.extra.attackId=m.attack?.id;m.extra.attackTau=m.attack?m.attack.inst.tau(m.attack.t):0;
    m.extra.form=m.gockelForm;m.extra.phase=m.phase;m.extra.time=m.time;m.extra.seamOpen=seamOpen(m);
    if(m._seamAttack!==m.attack?.inst.key){m._seamAttack=m.attack?.inst.key;m.seamDamage=0;}
  },
  poseHook(m,p) {
    if(m.gockelForm==='reveal'){cinePose(m,p);return;}
    if(m.gockelForm==='entry'){Object.assign(p,{bodyY:-1,bodyRoll:65,neck:.6,head:35,wing:30});return;}
    if((m.seamCooldown>9 || m.crashOpening>0) && !m.attack)Object.assign(p,{bodyY:-.5,bodyPitch:18,head:35,neck:.6,wing:25});
    if(m.partById.wing.broken)p.wingL=28;
    if(!m.attack && m.target){const a=Math.atan2(m.target.pos.x-m.pos.x,m.target.pos.z-m.pos.z)-m.rot;p.headYaw=Math.max(-35,Math.min(35,Math.atan2(Math.sin(a),Math.cos(a))*180/Math.PI));}
    p.spread+=m.phase*.18;
  },
  snapExtra:m=>({gockelForm:m.gockelForm,formTime:m.formTime,seamCooldown:m.seamCooldown,fallX:m.fallPos?.x??null,fallZ:m.fallPos?.z??null}),
  applySnapExtra(m,s) {
    const old=m.gockelForm;
    m.gockelForm=s.gockelForm??old;m.formTime=s.formTime??0;m.seamCooldown=s.seamCooldown??0;
    if(s.fallX!=null && s.fallZ!=null)m.fallPos={x:s.fallX,z:s.fallZ};
    else if(m.gockelForm==='reveal' && old==='rooster')m.fallPos??={x:m.pos.x,z:m.pos.z};
    if(m.gockelForm==='eye' && old!=='eye') {m._interrupt();enterEye(m);}
    if(['entry','reveal'].includes(m.gockelForm)) {m._interrupt();clearAll(m);}
  },
  enterEye:beginEye,
  returnPlayer:eyeReturn,
  respawnPlayer:eyeRespawn,
  inArena,
  // Minimap / boss arrow: a hunter outside is pointed at the portal under the fallen rooster.
  mapPos:(m,pos)=>m.gockelForm==='eye' && m.fallPos && !inArena(m,pos)?{x:m.fallPos.x,y:m.ctx.world.heightAt(m.fallPos.x,m.fallPos.z),z:m.fallPos.z,portal:true}:null,
  receiveCopies,
  dispose(m) {clearAll(m);endCine(m);disposePortal(m);disposeEye(m);for(const off of m._offs)off?.();m._offs.length=0;},
};
