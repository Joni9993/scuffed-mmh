import { angleDiff, yawOf } from '../../core/math.js';

const id=s=>'gockelok_'+s;
const reach={maschinenpicken:6.2,scharrhieb:6,spornstich:7,fluegelfeger:6.5,
  flankenwechsel:11,versetzter_schnabel:7.5,hahnenwirbel:7,
  schnabelanker:8,sprungsporne:22,sprungsporne_bruch:20,nahtsignatur:12,
  kikeriki:13,kikeriki_heiser:9,jagdlauf:34,krallensprung:34,
  federhagel:36,kraehenschnitt:34,kraehenfaecher:34,risssprung:28};
const pressure=['maschinenpicken','scharrhieb','spornstich','flankenwechsel','versetzter_schnabel',
  'jagdlauf','krallensprung','federhagel','kraehenschnitt','fluegelfeger','hahnenwirbel'];
const finishers=['schnabelanker','sprungsporne','sprungsporne_bruch','nahtsignatur',
  'kikeriki','kikeriki_heiser','krallensprung','jagdlauf','federhagel','risssprung','kraehenfaecher'];
const all=[...new Set([...pressure,...finishers])];
const short=id=>id.slice('gockelok_'.length);
const finalNext=m=>(m._roosterStep??0)>=(m._roosterGoal??3)-2;

function reaches(m,name,d) {
  const a=m.def.attacks[id(name)];
  if(!a || !m._atkAllowed(a) || (a.cond&&!a.cond(m,m.ctx)))return false;
  if(d<a.range[0] || d>Math.min(a.range[1],reach[name]??a.range[1]))return false;
  // Sweeping wings punish somebody beside/behind the bird, not an empty patch beside a frontal target.
  if(['fluegelfeger','hahnenwirbel'].includes(name)) {
    const p=m.target?.pos;if(!p)return false;
    const angle=Math.abs(angleDiff(m.rot,yawOf(p.x-m.pos.x,p.z-m.pos.z)));
    if(angle<.6)return false;
  }
  return true;
}

function weight(name,d,finishing=false) {
  if(finishing) {
    if(name==='schnabelanker')return 9;
    if(name==='nahtsignatur')return 4;
    if(name==='krallensprung')return d>9?6:2;
    if(name==='jagdlauf')return d>22?5:1;
    if(name==='federhagel')return d>14?4:1;
    return 2;
  }
  if(name==='krallensprung')return d>9?10:3;
  if(name==='jagdlauf')return d>16?9:3;
  if(name==='federhagel')return d>10?5:1;
  if(name==='kraehenschnitt')return d>16?3:1;
  if(name==='scharrhieb')return d<4?7:4;
  if(name==='maschinenpicken')return 5;
  if(name==='flankenwechsel')return 4;
  return 3;
}

// Generic chain handling still owns interruption, stamina, part/phase gates and chainIdx replication.
// Each family commits to 3/4/5 actions, then one recognizable heavy finisher releases the pressure.
export const roosterChains=Object.fromEntries(all.map(previous=>[id(previous),all.filter(n=>n!==previous).map(name=>({
  atk:id(name),w:weight(name,15,finishers.includes(name)),
  cond:(m,d)=>!m._roosterSolo && (m._roosterStep??0)<(m._roosterGoal??3)-1 && reaches(m,name,d) &&
    (finalNext(m)?finishers.includes(name):pressure.includes(name)),
}))]));

/** Predict once at an attack boundary. Its result is serialized by Monster.beginAttack. */
export function roosterAim(m,def,target) {
  const d=Math.hypot(target.pos.x-m.pos.x,target.pos.z-m.pos.z);
  const horizon=Math.min(.56,.32+d*.008);
  const measured=m._roosterMotion?.get(target.id);
  let vx=target.local===false?(measured?.vx??0):(target.vel?.x??0);
  let vz=target.local===false?(measured?.vz??0):(target.vel?.z??0);
  if(!Number.isFinite(vx))vx=0;if(!Number.isFinite(vz))vz=0;
  let dx=vx*horizon,dz=vz*horizon;
  const lead=Math.hypot(dx,dz);if(lead>3.5){dx*=3.5/lead;dz*=3.5/lead;}
  const pos={x:target.pos.x+dx,y:target.pos.y,z:target.pos.z+dz};
  return {pos,...(def?.noFace?{}:{yaw:yawOf(pos.x-m.pos.x,pos.z-m.pos.z)})};
}

// Network avatars interpolate position without filling Player.vel. Observe them
// on the authority as well, so the ranged guest receives the same predictive pressure.
export function trackRoosterTargets(m,dt) {
  if(!m.authority||!(dt>0))return;
  const motion=(m._roosterMotion??=new Map()),alive=new Set();
  for(const p of m.ctx.players) {
    if(!p.alive)continue;alive.add(p.id);
    const old=motion.get(p.id);
    let vx=old?(p.pos.x-old.x)/dt:0,vz=old?(p.pos.z-old.z)/dt:0;
    const speed=Math.hypot(vx,vz);if(speed>12){vx*=12/speed;vz*=12/speed;}
    const k=1-Math.exp(-14*dt);
    motion.set(p.id,{x:p.pos.x,z:p.pos.z,vx:(old?.vx??0)+(vx-(old?.vx??0))*k,vz:(old?.vz??0)+(vz-(old?.vz??0))*k});
  }
  for(const key of motion.keys())if(!alive.has(key))motion.delete(key);
}

function targetAtBoundary(m) {
  const rival=m.ctx.revier?.rivalOf(m);if(rival){m.target=rival;return;}
  const alive=m.ctx.players.filter(p=>p.alive&&m.def.canTarget?.(m,p)!==false);
  if(!alive.length){m.target=null;return;}
  const hunted=(m._roosterHunted??=new Map());
  let maxThreat=1;for(const p of alive)maxThreat=Math.max(maxThreat,m.threatOf(p.id));
  let best=null,score=-Infinity;
  for(const p of alive) {
    const d=Math.hypot(p.pos.x-m.pos.x,p.pos.z-m.pos.z),last=hunted.get(p.id);
    const age=last===undefined?18:Math.max(0,m.time-last);
    const ranged=(p.weaponId==='bow'||p.weaponId==='lb')&&d>8;
    const value=.8*m.threatOf(p.id)/maxThreat+.35/(1+d/8)+(ranged?1.1:0)+
      Math.min(1,age/12)-(age<4?1.15:0);
    // The same living hunter cannot monopolize the whole combo while the ranged partner fires freely.
    const fair=value-(p.id===m._roosterLastTargetId?Math.min(1.2,(m._roosterSame??0)*.65):0);
    if(fair>score){score=fair;best=p;}
  }
  const old=m.target;m.target=best;m.retargetT=5;
  if(best&&old&&old!==best) {
    m._rtT=.42;m.ctx.fx.marker?.(m.id+':rt',{x:best.pos.x,y:m.ctx.world.heightAt(best.pos.x,best.pos.z),z:best.pos.z},1.2,'#ffd040',false);
    m.ctx.bus.emit('retarget',{monster:m,playerId:best.id});
  }
}

function begin(m,attackId,idx=0,solo=false) {
  m._roosterStep=idx;m._roosterSolo=solo;
  if(idx===0)m._roosterGoal=3+Math.min(2,m.phase);
  const p=m.target;
  if(p) {
    (m._roosterHunted??=new Map()).set(p.id,m.time);
    m._roosterSame=p.id===m._roosterLastTargetId?(m._roosterSame??0)+1:1;
    m._roosterLastTargetId=p.id;
  }
  m._roosterBoundaryReady=false;
  return m.beginAttack(attackId,{chainIdx:idx});
}

function opener(m,d) {
  let list=pressure.filter(name=>reaches(m,name,d)&&(m.cds[id(name)]??0)<=0);
  if(!list.length)return null;
  // Keeping distance changes the response to a gap closer instead of baiting a stationary peck.
  if(d>12) {
    const close=list.filter(n=>['krallensprung','jagdlauf'].includes(n));
    if(close.length&&(m._roosterLastTargetId!==m.target?.id||m.lastGockelAttack===id('federhagel')||m.rng()<.72))list=close;
  }
  let total=0;for(const name of list)total+=weight(name,d)*(m.lastGockelAttack===id(name) ? .16 : 1);
  let roll=m.rng()*total;
  for(const name of list){roll-=weight(name,d)*(m.lastGockelAttack===id(name) ? .16 : 1);if(roll<=0)return id(name);}
  return id(list.at(-1));
}

export function roosterCombat(m,dt) {
  m.retargetT=5;
  m.recover=Math.max(0,m.recover-dt);
  if(m.recover>0||m.crashOpening>0){m._faceTarget(dt,5);m._brake(dt);return true;}
  if(m.phaseT>0) {
    m.phaseT-=dt;m._faceTarget(dt,6);m._brake(dt);
    if(m.phaseT<=0&&m.phaseSpecial){m.queued=m.phaseSpecial;m.phaseSpecial=null;}
    return true;
  }
  if(m.tired){m.chainNext=null;m._roosterBoundaryReady=false;m._faceTarget(dt,3);m._brake(dt);return true;}
  if(!m._roosterBoundaryReady||!m.target?.alive){targetAtBoundary(m);m._roosterBoundaryReady=true;}
  const target=m.target;if(!target){m._brake(dt);return true;}
  const dx=target.pos.x-m.pos.x,dz=target.pos.z-m.pos.z,d=Math.hypot(dx,dz);
  if(m.queued) {
    // A broken spur changes the phase entrance to its weakened leap.
    const queued=m.queued===id('sprungsporne')&&m.partById.spur?.broken?id('sprungsporne_bruch'):m.queued;
    const def=m.def.attacks[queued];
    if(def&&m._atkAllowed(def)) {
      const maximum=Math.min(def.range[1],reach[short(queued)]??def.range[1]);
      if(d>maximum){m._navTo(dt,target.pos.x,target.pos.z,m.def.run,10);return true;}
      m.queued=null;m.chainNext=null;begin(m,queued,0,true);return true;
    }
    m.queued=null;
  }
  let next=m.chainNext;
  if(next&&!reaches(m,short(next.id),d)) {
    // A hunter may have sprinted away during recovery: use the same chain slot for a real chase.
    const replacement=(finalNext(m)?finishers:pressure).filter(n=>reaches(m,n,d));
    const preferred=replacement.find(n=>n==='krallensprung')??replacement.find(n=>n==='jagdlauf')??replacement[0];
    if(preferred)next=m.chainNext={id:id(preferred),idx:next.idx};
  }
  const attackId=next&&reaches(m,short(next.id),d)?next.id:!next?opener(m,d):null;
  if(attackId) {
    if(m.ctx.revier&&m._aggroGate()){m._brake(dt);return true;}
    m.chainNext=null;begin(m,attackId,next?.idx??0);return true;
  }
  // Walkable navigation remains responsible for rocks/ledges; sprint speed beats hunter sprint speed.
  if(d>3.7)m._navTo(dt,target.pos.x,target.pos.z,m.def.run,10);
  else {m._faceTarget(dt,10);m._brake(dt);}
  return true;
}

export function roosterAttackEnd(m) {
  m._roosterBoundaryReady=false;
  if(m.chainNext) {m.recover=Math.min(m.recover,.12);return;}
  m._roosterGoal=0;m._roosterStep=0;
  m.crashOpening=Math.max(m.crashOpening??0,1.35);
  m.recover=Math.max(m.recover,1.35);
}
