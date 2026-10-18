import { buildGockelok } from './gockelokRig.js';
import { gockelAttacks } from './gockelokAttacks.js';
import { spendStamina } from '../vitals.js';
import { applyCopy, clearCopy, tickCopies, receiveCopies, clearRemoteCopies } from './gockelokCopy.js';
import { enterEye, eyeReturn, eyeRespawn, disposeEye, tickEye, tickPortal, disposePortal } from './gockelokEye.js';
import { tickHazards, clearHazards, enraged, inArena } from './gockelokHazards.js';

// Rooster falls at EYE_HP of max HP; the eye then gets its own, larger pool (EYE_POOL of max HP).
export const EYE_HP = .3, EYE_POOL = .42, REVEAL_T = 7;
// Firewall: crossing these fractions of the eye pool raises a shield that only a torn reality seam drops.
export const SHIELD_AT = [.75, .5, .25];
const elem={fire:15,shock:15,ice:15,water:15,blast:20};
export function seamOpen(m) {
  const a=m.attack,w=a?.inst.def.seam;
  if(!w || m.seamCooldown>0 || !['rooster','eye'].includes(m.gockelForm))return false;
  const t=a.inst.tau(a.t);return t>=w[0] && t<w[1];
}
function clearAll(m) { clearRemoteCopies(m);for(const p of m.ctx.players)clearCopy(m,p); }
function reveal(m) {
  if(m.gockelForm!=='rooster')return;
  m.revealPos={x:m.pos.x,z:m.pos.z};
  m.hp=Math.max(1,m.maxHp*EYE_POOL);m.gockelForm='reveal';m.formTime=0;m.phase=2;m.phaseT=0;
  m._interrupt();m.queued=null;m.phaseSpecial=null;m.stunT=m.stagT=0;m.st.poisonT=0;m.st.trap=0;m.rage=false;
  m.vel.set(0,0,0);m.air=0;clearAll(m);m.eyeShield=false;m.shieldIdx=0;m._cineLine=-1;m._cineShot=-1;m._cineSkip=false;
  m.ctx.bus.emit('sfx',{name:'heavy',pos:m.pos});
}
// Reveal cutscene (local, every client): three camera shots on the fallen rooster, one line each.
// Interact skips it (and requests the eye, as before). The camera rig follows the hunter again afterwards.
const CINE=[
  {t:0,line:'Der Hahn fällt …'},
  {t:2.6,line:'Unter dem Brustpanzer reißt die Realität auf …'},
  {t:5,line:'… und ein Auge öffnet sich.'},
];
function cine(m,dt) {
  const rig=m.ctx.rig,on=m.gockelForm==='reveal' && !m._cineSkip && m.formTime<REVEAL_T;
  if(!on){if(rig?.cine?.owner===m.id)rig.cine=null;return;}
  const t=m.formTime,shot=t<2.6?0:t<5?1:2;
  if(shot!==m._cineLine){m._cineLine=shot;m.ctx.hud?.center(CINE[shot].line+'   [Interagieren: überspringen]',shot===2?2.6:2.5);}
  if(!rig)return;
  const c=m.revealPos??m.pos,gy=m.ctx.world.heightAt(c.x,c.z),u=t-CINE[shot].t;
  let ang,r,h,ly;
  if(shot===0){ang=m.rot+2.4+u*.22;r=14-u*1.4;h=5.5-u*.6;ly=1.4;}
  else if(shot===1){ang=m.rot+.5+u*.28;r=6.2-u*.4;h=1.4+u*.2;ly=1.2;}
  else {ang=m.rot+1.4+u*.15;r=Math.max(1.2,4.5-u*1.5);h=9-u*2.2;ly=0;}
  const snap=shot!==m._cineShot;m._cineShot=shot;
  rig.cine={owner:m.id,snap,pos:{x:c.x+Math.sin(ang)*r,y:gy+h,z:c.z+Math.cos(ang)*r},look:{x:c.x,y:gy+ly,z:c.z}};
}
export function beginEye(m) {
  if(!['reveal','entry'].includes(m.gockelForm))return;
  m.gockelForm='eye';m.formTime=0;m.phase=2;m._interrupt();m.queued=null;m.phaseSpecial=null;
  m.stunT=m.stagT=0;m.recover=1.5;m.cds={};m.stamina=100;m.tired=false;m.tiredT=0;m.eyeShield=false;m.shieldIdx=0;m.finalCascade=false;
  if(m.ctx.rig?.cine?.owner===m.id)m.ctx.rig.cine=null;
  clearHazards(m);enterEye(m);m.setState('combat');m.ctx.hud?.center('AUGE DES GLITCH — Zerreiße die Realitätsnähte!',4);
}
function collapse(m) {
  const eye=m.gockelForm==='eye',shield=!!m.eyeShield;
  m._interrupt();m.queued=null;m.phaseSpecial=null;m.chainNext=null;m.seamCooldown=eye?9:13;m.seamDamage=0;m.recover=eye?(shield?3.5:2.5):4;m.stagT=0;m.eyeShield=false;
  m.ctx.hud?.center(shield?'FIREWALL GEBROCHEN — das Auge ist verwundbar!':'REALITÄTSNAHT ZERRISSEN — Ursprung offen!',2);
  m.ctx.bus.emit('sfx',{name:'heavy',pos:m.pos});
}
export const gockelok={
  // Balance vs. Apex-Drachen (Pyrostur 22000 LP / Felsengroll 24000 / Voltiris 23000; chainMax 3/3/4;
  // recoverAfter Pyrostur .5/.32/.2, Voltiris .36/.28/.22; Tempo Voltiris bis 1.16):
  // Hahn 52000 LP, davon 36400 bis zur Enthuellung (+52 % ggü. Felsengroll), chainMax 4, recoverAfter .3/.2/.12,
  // Tempo 1.12/1.2/1.3. Auge: eigener Pool 42 % = 21840 LP, recoverAfter .1 (Wut .05), Tempo 1.3 (Wut 1.45), Schaden x1.35 in Wut.
  id:'gockelok',name:'Gockelok, der Ur-Hahn',hp:52000,scale:2.2,bodyRadius:1.8,eyePool:EYE_POOL,
  walk:5.2,run:14,turn:3.2,detect:45,prefer:3.5,noFlee:true,noRage:true,stamina:true,flinchDmg:2600,speedFactor:m=>m?.gockelForm==='eye'?1.5:1.35,
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
  phases:[{at:.78,name:'DIE BLUTKRONE',special:'gockelok_sprungsporne',enter:m=>{m.cds={};}},{at:.55,name:'UNTER DEN FEDERN',special:'gockelok_nahtsignatur',enter:m=>{m.cds={};}}],
  chainMax:4,
  recoverAfter:m=>!m?.gockelForm ? .3 : m.gockelForm==='eye' ? (enraged(m)?.05:.1) : ([.3,.2,.12][m.phase]??.12),
  attackTempo:m=>m.gockelForm==='eye' ? (enraged(m)?1.45:1.3) : ([1.12,1.2,1.3][m.phase]??1.3),
  dmgFactor:m=>enraged(m)?1.35:1,
  chains:{
    gockelok_maschinenpicken:[{atk:'gockelok_flankenwechsel',w:4,cond:m=>m.phase>0},{atk:'gockelok_scharrhieb',w:3},{atk:null,w:2}],
    gockelok_flankenwechsel:[{atk:'gockelok_spornstich',w:4},{atk:'gockelok_versetzter_schnabel',w:4,cond:m=>m.phase>0},{atk:'gockelok_maschinenpicken',w:2},{atk:null,w:2}],
    gockelok_scharrhieb:[{atk:'gockelok_fluegelfeger',w:4},{atk:'gockelok_spornstich',w:3},{atk:null,w:2}],
    gockelok_spornstich:[{atk:'gockelok_scharrhieb',w:3},{atk:'gockelok_jagdlauf',w:2},{atk:'gockelok_sprungsporne',w:3,cond:m=>m.phase>0},{atk:null,w:2}],
    gockelok_fluegelfeger:[{atk:'gockelok_jagdlauf',w:3},{atk:'gockelok_maschinenpicken',w:3},{atk:null,w:2}],
    gockelok_jagdlauf:[{atk:'gockelok_maschinenpicken',w:4},{atk:'gockelok_schnabelanker',w:2},{atk:null,w:2}],
    gockelok_versetzter_schnabel:[{atk:'gockelok_risssprung',w:3,cond:m=>m.phase>1},{atk:'gockelok_fluegelfeger',w:3},{atk:null,w:2}],
    gockelok_sprungsporne:[{atk:'gockelok_fluegelfeger',w:3},{atk:'gockelok_maschinenpicken',w:3},{atk:null,w:2}],
    gockelok_risssprung:[{atk:'gockelok_maschinenpicken',w:3},{atk:'gockelok_kikeriki',w:2},{atk:null,w:3}],
    gockelok_nahtsignatur:[{atk:'gockelok_risssprung',w:4},{atk:null,w:1}],
    // Auge: Ketten stapeln Arena-Muster auf direkte Treffer.
    gockelok_frames:[{atk:'gockelok_speicherleck',w:4},{atk:'gockelok_nullsektor',w:3},{atk:null,w:2}],
    gockelok_speicherleck:[{atk:'gockelok_raumbruch',w:3},{atk:'gockelok_nullsektor',w:3},{atk:null,w:2}],
    gockelok_nullsektor:[{atk:'gockelok_fehlerkaskade',w:3},{atk:'gockelok_speicherleck',w:3},{atk:'gockelok_ueberlauf',w:2},{atk:null,w:2}],
    gockelok_raumbruch:[{atk:'gockelok_rollback',w:3},{atk:'gockelok_frames',w:3},{atk:null,w:2}],
    gockelok_rollback:[{atk:'gockelok_nullsektor',w:3},{atk:'gockelok_ueberlauf',w:2},{atk:null,w:2}],
    gockelok_fehlerkaskade:[{atk:'gockelok_speicherleck',w:3},{atk:null,w:2}],
    gockelok_ueberlauf:[{atk:'gockelok_speicherleck',w:4},{atk:null,w:2}],
  },
  init(m) {
    m.gockelForm='rooster';m.formTime=0;m.seamCooldown=0;m.seamDamage=0;m.eyeShield=false;m.shieldIdx=0;
    m._offs.push(m.ctx.bus.on('glitchCounter',e=>clearCopy(m,e?.player)),m.ctx.bus.on('glitchStart',e=>clearCopy(m,e?.player)));
  },
  invulnerable:m=>['reveal','entry'].includes(m.gockelForm),
  // Firewall: while up, only the seam (in its open window) takes hits.
  partActive:(m,p)=>p.id==='seam' ? seamOpen(m) : !(m.gockelForm==='eye' && m.eyeShield),
  canTarget:(m,p)=>m.gockelForm!=='eye' || inArena(m,p),
  beforeDeath(m) { if(m.gockelForm==='rooster'){reveal(m);return false;} if(m.gockelForm!=='eye' && m.authority)return false; if(m.gockelForm==='eye' && m.eyeShield && m.authority){m.hp=1;return false;} },
  onDeath(m) {clearAll(m);clearHazards(m);m.ctx.fx.clearMarker?.(m.id+':eye');},
  onDamage(m,res) {
    if(!m.authority)return;
    if(m.gockelForm==='rooster' && m.hp<=m.maxHp*EYE_HP){reveal(m);return;}
    if(m.gockelForm==='eye') {
      const pool=m.maxHp*EYE_POOL,next=SHIELD_AT[m.shieldIdx??0];
      if(m.eyeShield)m.hp=Math.max(m.hp,pool*SHIELD_AT[m.shieldIdx-1]-1); // shield holds the line (seam hits chip only to it)
      else if(next!==undefined && m.hp<=pool*next){
        m.hp=pool*next;m.shieldIdx=(m.shieldIdx??0)+1;m.eyeShield=true;m.seamCooldown=0;m.cds={};
        m.ctx.hud?.center('FIREWALL — nur eine zerrissene Realitätsnaht bricht den Schild!',3);m.ctx.bus.emit('sfx',{name:'heavy',pos:m.pos});
      }
    }
    if(res.partId==='seam' && seamOpen(m)) {
      m.seamDamage+=res.dmg;
      if(m.seamDamage>=(m.gockelForm==='eye'?260:180)*(m.coopMul??1)){collapse(m);clearAll(m);}
    }
  },
  combat(m,dt) {
    if(['reveal','entry'].includes(m.gockelForm)){m._brake(dt);return true;}
    if(m.gockelForm==='eye') {
      if(m.target && !inArena(m,m.target)){m._pickTarget();}
      if(!m.target){m._brake(dt);return true;}
      m.recover-=dt;
      const dx=m.target.pos.x-m.pos.x,dz=m.target.pos.z-m.pos.z,d=Math.hypot(dx,dz);
      m._faceTarget(dt,3.5);
      if(d>8 && m.recover<1.5) {const v=enraged(m)?12:9;m.pos.x+=dx/d*v*dt;m.pos.z+=dz/d*v*dt;}
      if(m.recover>0)return true;
      if(m.chainNext){const cn=m.chainNext;m.chainNext=null;m.beginAttack(cn.id,{chainIdx:cn.idx});return true;}
      if(m.hp<m.maxHp*EYE_POOL*.09 && !m.finalCascade && !m.eyeShield){m.finalCascade=true;m.beginAttack('gockelok_absturz');return true;}
      const a=m._chooseAttack(d);if(a)m.beginAttack(a.id);
      return true;
    }
    return false;
  },
  onHitPlayer(m,p,h) {if(h.hit.staminaDrain)spendStamina(p.v,h.hit.staminaDrain);if(h.hit.copy)applyCopy(m,p);},
  onGlitchCounter(m,id,p) {clearCopy(m,p);if(m.attack?.inst.def.seam && m.seamCooldown<=0 && (m.gockelForm!=='eye' || seamOpen(m)))collapse(m);},
  onAttackEnd(m,id) {m.seamDamage=0;if(m.partById.wing.broken && id.includes('sprung'))m.recover=Math.max(m.recover,2);if(id==='gockelok_absturz'){m.recover=3;m.crashOpening=3;m.seamCooldown=Math.max(m.seamCooldown,3);}},
  onBreak(m,p) {
    if(p.id==='comb')m.extra.comb.scale.y=.25;
    if(p.id==='spur'){m.extra.spurL.scale.z=.2;m.extra.spurR.scale.z=.2;}
    if(p.id==='wing'){m.extra.wingBroken=true;m.nodes.wingL.scale.z=.6;}
  },
  hitDmgMul:(m,h)=>m.partById.wing.broken && h.copy ? .85:1,
  tick(m,dt) {
    m.formTime+=dt;m.crashOpening=Math.max(0,(m.crashOpening??0)-dt);m.seamCooldown=Math.max(0,m.seamCooldown-dt);
    if(m.authority && m.gockelForm==='rooster' && m.hp<=m.maxHp*EYE_HP)reveal(m);
    cine(m,dt);
    if(['reveal','entry'].includes(m.gockelForm)) {
      for(const p of m.ctx.players)if(p.local)p.invuln=Math.max(p.invuln??0,.25);
      if(m.gockelForm==='reveal' && m.formTime>=REVEAL_T){m.gockelForm='entry';m.ctx.hud?.center('Betritt das Auge am Körper • Interagieren: eintreten',5);}
      const p=m.ctx.players.find(p=>p.local&&p.alive);
      const pressed=m.ctx.input?.b?.context?.pressed && m.formTime>.4;
      if(pressed && m.gockelForm==='reveal')m._cineSkip=true;
      const request=p && (pressed || (m.gockelForm==='entry' && p.pos.distanceTo(m.pos)<5));
      if(request && !m.authority)m.ctx.bus.emit('gockelEnter',{monster:m});
      if(m.authority && (request || m.formTime>=16))beginEye(m);
    }
    if(m.gockelForm==='eye' && m.eyeArena && m.authority) {
      // The eye never leaves its pocket: no wandering back to the nest when nobody is inside.
      if(m.state!=='combat' && m.state!=='dead' && m.alive)m.setState('combat');
      const c=m.eyeArena.center,dx=m.pos.x-c.x,dz=m.pos.z-c.z,dd=Math.hypot(dx,dz);
      if(dd>26){m.pos.x=c.x+dx/dd*26;m.pos.z=c.z+dz/dd*26;}
      m.pos.y=m.eyeArena.y+m.air;
    }
    tickCopies(m,dt);tickEye(m);tickPortal(m);tickHazards(m,dt);
    m.extra.attackId=m.attack?.id;m.extra.attackTau=m.attack?m.attack.inst.tau(m.attack.t):0;
    m.extra.form=m.gockelForm;m.extra.phase=m.phase;m.extra.time=m.time;m.extra.seamOpen=seamOpen(m);
    m.extra.targetPos=m.target?.pos;m.extra.shield=!!m.eyeShield;m.extra.enraged=enraged(m);
    if(m._seamAttack!==m.attack?.inst.key){m._seamAttack=m.attack?.inst.key;m.seamDamage=0;}
  },
  poseHook(m,p) {
    if(['reveal','entry'].includes(m.gockelForm)){Object.assign(p,{bodyY:-1,bodyRoll:65,neck:.6,head:35,wing:30});return;}
    if((m.seamCooldown>9 || m.crashOpening>0) && !m.attack)Object.assign(p,{bodyY:-.5,bodyPitch:18,head:35,neck:.6,wing:25});
    if(m.partById.wing.broken)p.wingL=28;
    if(!m.attack && m.target){const a=Math.atan2(m.target.pos.x-m.pos.x,m.target.pos.z-m.pos.z)-m.rot;p.headYaw=Math.max(-35,Math.min(35,Math.atan2(Math.sin(a),Math.cos(a))*180/Math.PI));}
    p.spread+=m.phase*.18;
  },
  snapExtra:m=>({gockelForm:m.gockelForm,formTime:m.formTime,seamCooldown:m.seamCooldown,eyeShield:!!m.eyeShield,shieldIdx:m.shieldIdx??0,revealPos:m.revealPos??null}),
  applySnapExtra(m,s) {
    const old=m.gockelForm;
    m.gockelForm=s.gockelForm??old;m.formTime=s.formTime??0;m.seamCooldown=s.seamCooldown??0;
    m.eyeShield=!!s.eyeShield;m.shieldIdx=s.shieldIdx??0;
    if(s.revealPos && Number.isFinite(s.revealPos.x) && Number.isFinite(s.revealPos.z))m.revealPos={x:s.revealPos.x,z:s.revealPos.z};
    if(m.gockelForm==='eye' && old!=='eye') {m._interrupt();if(m.ctx.rig?.cine?.owner===m.id)m.ctx.rig.cine=null;enterEye(m);}
    if(['entry','reveal'].includes(m.gockelForm)) {
      if(old==='rooster'){m.revealPos??={x:m.pos.x,z:m.pos.z};m._cineLine=-1;m._cineShot=-1;m._cineSkip=false;}
      m._interrupt();clearAll(m);
    }
  },
  enterEye:beginEye,
  // K.O. in the eye phase: wake up at the open portal on the rooster's spot, not inside the arena.
  returnPlayer:eyeRespawn,
  enterArena:eyeReturn,
  receiveCopies,
  dispose(m) {clearAll(m);clearHazards(m);if(m.ctx.rig?.cine?.owner===m.id)m.ctx.rig.cine=null;disposePortal(m);disposeEye(m);for(const off of m._offs)off?.();m._offs.length=0;},
};
