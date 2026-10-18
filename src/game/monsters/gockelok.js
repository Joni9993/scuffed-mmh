import { buildGockelok } from './gockelokRig.js';
import { gockelAttacks } from './gockelokAttacks.js';
import { spendStamina } from '../vitals.js';
import { applyCopy, clearCopy, tickCopies, receiveCopies, clearRemoteCopies } from './gockelokCopy.js';
import { enterEye, eyeReturn, disposeEye, tickEye, tickPortal, disposePortal } from './gockelokEye.js';

export const EYE_HP = .26;
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
  m.vel.set(0,0,0);m.air=0;clearAll(m);
  m.ctx.hud?.center('Der Hahn fällt. Unter ihm öffnet sich ein Auge …',4);
  m.ctx.bus.emit('sfx',{name:'heavy',pos:m.pos});
}
export function beginEye(m) {
  if(!['reveal','entry'].includes(m.gockelForm))return;
  m.gockelForm='eye';m.formTime=0;m.phase=2;m._interrupt();m.queued=null;m.phaseSpecial=null;
  m.stunT=m.stagT=0;m.recover=3;m.cds={};m.stamina=100;m.tired=false;m.tiredT=0;
  enterEye(m);m.setState('combat');m.ctx.hud?.center('AUGE DES GLITCH — Zerreiße die Realitätsnähte!',4);
}
function collapse(m) {
  m._interrupt();m.queued=null;m.phaseSpecial=null;m.seamCooldown=13;m.seamDamage=0;m.recover=4;m.stagT=0;
  m.ctx.hud?.center('REALITÄTSNAHT ZERRISSEN — Ursprung offen!',2);
  m.ctx.bus.emit('sfx',{name:'heavy',pos:m.pos});
}
export const gockelok={
  id:'gockelok',name:'Gockelok, der Ur-Hahn',hp:38000,scale:2.2,bodyRadius:1.8,
  walk:4.5,run:12,turn:2.5,detect:45,prefer:3.5,noFlee:true,noRage:true,stamina:true,flinchDmg:1600,speedFactor:()=>1.2,
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
  phases:[{at:.78,name:'DIE BLUTKRONE',special:'gockelok_sprungsporne'},{at:.5,name:'UNTER DEN FEDERN',special:'gockelok_nahtsignatur'}],
  chainMax:2,recoverAfter:()=>1.1,
  chains:{
    gockelok_maschinenpicken:[{atk:'gockelok_flankenwechsel',w:3,cond:m=>m.phase>0},{atk:null,w:4}],
    gockelok_flankenwechsel:[{atk:'gockelok_spornstich',w:3},{atk:'gockelok_versetzter_schnabel',w:4,cond:m=>m.phase>0},{atk:null,w:3}],
    gockelok_scharrhieb:[{atk:'gockelok_fluegelfeger',w:3},{atk:null,w:4}],
  },
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
      if(!m.target){m._brake(dt);return true;}
      m.recover-=dt;
      const dx=m.target.pos.x-m.pos.x,dz=m.target.pos.z-m.pos.z,d=Math.hypot(dx,dz);
      m._faceTarget(dt,2.5);
      if(d>10 && m.recover<1) {m.pos.x+=dx/d*6*dt;m.pos.z+=dz/d*6*dt;}
      if(m.recover<=0 && m.hp<m.maxHp*.09 && !m.finalCascade){m.finalCascade=true;m.beginAttack('gockelok_absturz');return true;}
      if(m.recover<=0){const d=m.pos.distanceTo(m.target.pos),a=m._chooseAttack(d);if(a)m.beginAttack(a.id);}
      return true;
    }
    return false;
  },
  onHitPlayer(m,p,h) {if(h.hit.staminaDrain)spendStamina(p.v,h.hit.staminaDrain);if(h.hit.copy)applyCopy(m,p);},
  onGlitchCounter(m,id,p) {clearCopy(m,p);if(m.attack?.inst.def.seam && m.seamCooldown<=0)collapse(m);},
  onAttackEnd(m,id) {m.seamDamage=0;if(m.partById.wing.broken && id.includes('sprung'))m.recover=Math.max(m.recover,2.5);if(id==='gockelok_absturz'){m.recover=4;m.crashOpening=4;m.seamCooldown=Math.max(m.seamCooldown,4);}},
  onBreak(m,p) {
    if(p.id==='comb')m.extra.comb.scale.y=.25;
    if(p.id==='spur'){m.extra.spurL.scale.z=.2;m.extra.spurR.scale.z=.2;}
    if(p.id==='wing'){m.extra.wingBroken=true;m.nodes.wingL.scale.z=.6;}
  },
  hitDmgMul:(m,h)=>m.partById.wing.broken && h.copy ? .85:1,
  tick(m,dt) {
    m.formTime+=dt;m.crashOpening=Math.max(0,(m.crashOpening??0)-dt);m.seamCooldown=Math.max(0,m.seamCooldown-dt);
    if(m.authority && m.gockelForm==='rooster' && m.hp<=m.maxHp*EYE_HP)reveal(m);
    if(['reveal','entry'].includes(m.gockelForm)) {
      for(const p of m.ctx.players)if(p.local)p.invuln=Math.max(p.invuln??0,.25);
      if(m.gockelForm==='reveal' && m.formTime>=4){m.gockelForm='entry';m.ctx.hud?.center('Betritt das Auge am Körper • Interagieren: Sequenz überspringen',5);}
      const p=m.ctx.players.find(p=>p.local&&p.alive);
      const request=p && (m.ctx.input?.b.context.pressed || (m.gockelForm==='entry' && p.pos.distanceTo(m.pos)<5));
      if(request && !m.authority)m.ctx.bus.emit('gockelEnter',{monster:m});
      if(m.authority && (request || m.formTime>=16))beginEye(m);
      m.ctx.fx.marker?.(m.id+':eye',m.pos,4,'#67e9e2',false);
    }else m.ctx.fx.clearMarker?.(m.id+':eye');
    tickCopies(m,dt);tickEye(m);tickPortal(m);
    m.extra.attackId=m.attack?.id;m.extra.attackTau=m.attack?m.attack.inst.tau(m.attack.t):0;
    m.extra.form=m.gockelForm;m.extra.phase=m.phase;m.extra.time=m.time;m.extra.seamOpen=seamOpen(m);
    if(m._seamAttack!==m.attack?.inst.key){m._seamAttack=m.attack?.inst.key;m.seamDamage=0;}
  },
  poseHook(m,p) {
    if(['reveal','entry'].includes(m.gockelForm)){Object.assign(p,{bodyY:-1,bodyRoll:65,neck:.6,head:35,wing:30});return;}
    if((m.seamCooldown>9 || m.crashOpening>0) && !m.attack)Object.assign(p,{bodyY:-.5,bodyPitch:18,head:35,neck:.6,wing:25});
    if(m.partById.wing.broken)p.wingL=28;
    if(!m.attack && m.target){const a=Math.atan2(m.target.pos.x-m.pos.x,m.target.pos.z-m.pos.z)-m.rot;p.headYaw=Math.max(-35,Math.min(35,Math.atan2(Math.sin(a),Math.cos(a))*180/Math.PI));}
    p.spread+=m.phase*.18;
  },
  snapExtra:m=>({gockelForm:m.gockelForm,formTime:m.formTime,seamCooldown:m.seamCooldown}),
  applySnapExtra(m,s) {
    const old=m.gockelForm;
    m.gockelForm=s.gockelForm??old;m.formTime=s.formTime??0;m.seamCooldown=s.seamCooldown??0;
    if(m.gockelForm==='eye' && old!=='eye') {m._interrupt();enterEye(m);}
    if(['entry','reveal'].includes(m.gockelForm)) {m._interrupt();clearAll(m);}
  },
  enterEye:beginEye,
  returnPlayer:eyeReturn,
  receiveCopies,
  dispose(m) {clearAll(m);disposePortal(m);disposeEye(m);for(const off of m._offs)off?.();m._offs.length=0;},
};
