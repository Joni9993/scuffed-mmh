import * as THREE from 'three';
import { overlap, sphere } from '../hitbox.js';

export const COPY = { duration: 8, times: [1, 4], warning: 1.6, radius: 2, damage: 42 };
export function applyCopy(m,p) {
  if (!p.local || p.status.fehlkopie || p.glitch?.active) return;
  p.status.fehlkopie={t:COPY.duration,age:0,next:0,copies:[],owner:m.id};
  (m.copyOwners??=new Map()).set(p,p.status.fehlkopie);
  m.ctx.bus.emit('playerStatus',{player:p,type:'fehlkopie',on:true});
}
function discard(m,c) {
  m.ctx.fx.clearMarker?.(c.key);
  if(c.mesh) { c.mesh.removeFromParent(); c.mesh.geometry.dispose(); c.mesh.material.dispose(); }
}
export function clearCopy(m,p) {
  const s=p?.status?.fehlkopie??m.copyOwners?.get(p);
  if(!s || s.owner!==m.id) return;
  for(const c of s.copies) discard(m,c);
  delete p.status.fehlkopie;m.copyOwners?.delete(p);
  m.ctx.bus.emit('playerStatus',{player:p,type:'fehlkopie',on:false});
  if(p.local)m.ctx.bus.emit('gockelCopies',{monster:m,copies:[]});
}
export function tickCopies(m,dt) {
  for(const [owner,copies] of m.remoteCopies??[]) {
    for(const c of [...copies]) {
      c.t-=dt;
      if(c.t<=0 || !m.alive || m.ctx.result){discard(m,c);copies.splice(copies.indexOf(c),1);continue;}
      m.ctx.fx.marker?.(c.key,c,COPY.radius+.4,'#6594ad',false);
    }
    if(!copies.length)m.remoteCopies.delete(owner);
  }
  for(const [p,s] of m.copyOwners??[]) if(p.status?.fehlkopie!==s)clearCopy(m,p);
  for(const p of m.ctx.players) {
    const s=p.status?.fehlkopie;
    if(!s || s.owner!==m.id) continue;
    if(!p.alive || p.glitch?.active || !m.alive || m.ctx.result || ['reveal','entry'].includes(m.gockelForm)) {clearCopy(m,p);continue;}
    s.age+=dt; s.t-=dt;
    if(s.t<=0) {clearCopy(m,p);continue;}
    if(s.next<2 && s.age>=COPY.times[s.next]) {
      const c={x:p.pos.x,y:p.pos.y,z:p.pos.z,t:COPY.warning,key:`${m.id}:copy:${p.id}:${s.next++}`};
      if(m.ctx.scene) {
        c.mesh=new THREE.Mesh(new THREE.CapsuleGeometry(.35,1,2,5),new THREE.MeshBasicMaterial({color:0x71e9e6,wireframe:true,transparent:true,opacity:.65}));
        c.mesh.position.set(c.x,c.y+.85,c.z);m.ctx.scene.add(c.mesh);
      }
      s.copies.push(c);m.ctx.bus.emit('gockelCopies',{monster:m,copies:s.copies.map(({x,y,z,t,key})=>({x,y,z,t,key}))});m.ctx.bus.emit('sfx',{name:'knurr',pos:c});
    }
    for(const c of [...s.copies]) {
      c.t-=dt;
      m.ctx.fx.marker?.(c.key,c,COPY.radius+.4,'#cd5bff',c.t<.3);
      if(c.mesh) c.mesh.scale.setScalar(.7+.3*Math.max(0,c.t/COPY.warning));
      if(c.t>0) continue;
      if(p.local && p.hitCapsules().some(h=>overlap(h,sphere(c.x,c.y+1,c.z,COPY.radius)))) p.takeHit({dmg:COPY.damage,knock:'flinch',key:c.key,sourcePos:c,attackId:'gockelok_fehlkopie',monster:m});
      discard(m,c);s.copies.splice(s.copies.indexOf(c),1);
      m.ctx.bus.emit('sfx',{name:'heavy',pos:c});
    }
  }
}

// Remote copies are informational only. The owning client resolves its own hit,
// exactly like ordinary boss attacks. Validate and cap all visual network input.
export function receiveCopies(m,owner,data) {
  if(!Array.isArray(data) || data.length>2)return;
  m.remoteCopies??=new Map();
  for(const c of m.remoteCopies.get(owner)??[])discard(m,c);
  const out=[];
  if(m.alive && ['rooster','eye'].includes(m.gockelForm))for(const q of data){
    if(![q.x,q.y,q.z,q.t].every(Number.isFinite) || q.t<=0 || q.t>COPY.warning)continue;
    const c={x:q.x,y:q.y,z:q.z,t:q.t,key:`${m.id}:remote-copy:${owner}:${out.length}`};
    if(m.ctx.scene){c.mesh=new THREE.Mesh(new THREE.CapsuleGeometry(.35,1,2,5),new THREE.MeshBasicMaterial({color:0x6594ad,wireframe:true,transparent:true,opacity:.45}));c.mesh.position.set(c.x,c.y+.85,c.z);m.ctx.scene.add(c.mesh);}
    out.push(c);
  }
  m.remoteCopies.set(owner,out);
}
export function clearRemoteCopies(m){for(const cs of m.remoteCopies?.values()??[])for(const c of cs)discard(m,c);m.remoteCopies?.clear();}
