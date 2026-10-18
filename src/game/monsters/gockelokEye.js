import * as THREE from 'three';
import { OPEN_AT } from './gockelokCutscene.js';

// A separate, elevated pocket in the same hunt, placed far away from the playable map
// (ARENA_DX in x) so the ground where the rooster fell keeps its real height: knocked-out
// hunters respawn there and walk through the portal back in. Restore every overridden
// world method on disposal; no checkpoint is persisted in the save game.
export const ARENA_DX=1600,ARENA_R=45,PORTAL_R=3;
export const inArena=(m,pos)=>{const a=m?.eyeArena;return !!a && !!pos && Math.hypot(pos.x-a.center.x,pos.z-a.center.z)<ARENA_R;};
export function enterEye(m) {
  if(m.eyeArena) return;
  const ctx=m.ctx,w=ctx.world,c={x:m.home.x+ARENA_DX,z:m.home.z},y=100;
  m.fallPos??={x:m.pos.x,z:m.pos.z};
  const originals={heightAt:w.heightAt,collide:w.collide,reachable:w.reachable,walkable:w.walkable,groundType:w.groundType,update:w.update};
  const group=new THREE.Group();group.name='Auge des Glitch';
  const floor=new THREE.Mesh(new THREE.CylinderGeometry(29,29,1,64),new THREE.MeshLambertMaterial({color:0x607b88,flatShading:true}));
  floor.position.set(c.x,y-.5,c.z);group.add(floor);
  const rings=new THREE.Mesh(new THREE.TorusGeometry(29,.18,4,64),new THREE.MeshBasicMaterial({color:0x6ee5df}));
  rings.rotation.x=Math.PI/2;rings.position.set(c.x,y+.08,c.z);group.add(rings);
  // Repeated fragment geometry/material are shared: bounded draw count, no post pass.
  const geo=new THREE.IcosahedronGeometry(1.8,0),mat=new THREE.MeshLambertMaterial({color:0x426577,flatShading:true});
  for(let i=0;i<14;i++) {const a=i*Math.PI*2/14,n=new THREE.Mesh(geo,mat);n.position.set(c.x+Math.sin(a)*34,y+3+i%4*2,c.z+Math.cos(a)*34);n.rotation.set(i,.4*i,0);group.add(n);}
  ctx.scene?.add(group);
  const near=(x,z)=>Math.hypot(x-c.x,z-c.z)<ARENA_R;
  w.heightAt=(x,z)=>near(x,z)?y:originals.heightAt(x,z);
  w.collide=(p,r=0)=>{if(near(p.x,p.z)){const dx=p.x-c.x,dz=p.z-c.z,d=Math.hypot(dx,dz),limit=28-r;if(d>limit){p.x=c.x+dx/d*limit;p.z=c.z+dz/d*limit;}return;}return originals.collide(p,r);};
  w.reachable=(x,z)=>near(x,z)||originals.reachable?.(x,z);
  w.walkable=(x,z,r)=>near(x,z)||originals.walkable?.(x,z,r);
  const strips=[];
  for(const x of [-7,0,7]){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(3.4,.15,36),new THREE.MeshBasicMaterial({color:0x8d75a4,transparent:true,opacity:.35}));
    mesh.visible=false;group.add(mesh);strips.push(mesh);
  }
  w.groundType=(x,z)=>near(x,z)?'rock':originals.groundType?.(x,z);
  // The outside world's gather nodes and zone cues only run for a hunter who is outside.
  w.update=function(...args){const lp=ctx.player??ctx.players.find(p=>p.local);if(lp && near(lp.pos.x,lp.pos.z))return;return originals.update?.apply(w,args);};
  const sc=ctx.scene,env=sc?{bg:sc.background?.clone?.()??sc.background,fog:sc.fog?{color:sc.fog.color.clone(),near:sc.fog.near,far:sc.fog.far}:null}:null;
  m.eyeArena={group,originals,center:c,y,strips,env,inside:null};
  applyEnv(m);
  m.pos.set(c.x,y,c.z);m.air=0;m.vel.set(0,0,0);m.nv=null;
  for(const p of ctx.players) if(p.local && p.alive) eyeReturn(m,p);
}
// Arena sky/fog only for a local hunter inside the arena; outside keeps the world's own look.
function applyEnv(m,force) {
  const a=m.eyeArena,sc=m.ctx.scene;if(!a||!sc||!a.env)return;
  const lp=m.ctx.player??m.ctx.players.find(p=>p.local),inside=force??(!lp||inArena(m,lp.pos));
  if(inside===a.inside)return;a.inside=inside;
  if(inside){sc.background=new THREE.Color('#101f32');if(sc.fog){sc.fog.color.set('#101f32');sc.fog.near=45;sc.fog.far=130;}}
  else{sc.background=a.env.bg;if(sc.fog&&a.env.fog){sc.fog.color.copy(a.env.fog.color);sc.fog.near=a.env.fog.near;sc.fog.far=a.env.fog.far;}}
}
export function eyeReturn(m,p) {
  const a=m.eyeArena;if(!a)return false;
  p.pos.set(a.center.x,a.y,a.center.z+12);p.vel?.set(0,0,0);p.rot=Math.PI;p.invuln=Math.max(p.invuln??0,2);
  if(p.local!==false && p===(m.ctx.player??p))m.ctx.rig?.snap(p.pos,p.rot);
  applyEnv(m);return true;
}
// Knocked out in eye form: back on the real ground next to where the rooster fell, a few
// metres from the portal (walking in teleports into the arena).
export function eyeRespawn(m,p) {
  const f=m.fallPos;if(!m.eyeArena||!f)return false;
  const w=m.ctx.world,camp=w.campPoint,base=camp?Math.atan2(camp.x-f.x,camp.z-f.z):0;
  let x=f.x+Math.sin(base)*7,z=f.z+Math.cos(base)*7;
  for(const k of [0,1,-1,2,-2,3,-3,4]){const a=base+k*Math.PI/4,tx=f.x+Math.sin(a)*7,tz=f.z+Math.cos(a)*7;if(!w.walkable||w.walkable(tx,tz,1)){x=tx;z=tz;break;}}
  p.respawn(x,z);p.rot=Math.atan2(f.x-x,f.z-z);
  if(p===(m.ctx.player??p))m.ctx.rig?.snap(p.pos,p.rot);
  applyEnv(m);return true;
}
export function disposeEye(m) {
  const a=m.eyeArena;if(!a)return;
  applyEnv(m,false);Object.assign(m.ctx.world,a.originals);a.group.removeFromParent();
  const geometries=new Set(),materials=new Set();a.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
  geometries.forEach(g=>g.dispose());materials.forEach(mt=>mt.dispose());m.eyeArena=null;
}

export function tickEye(m) {
  const a=m.eyeArena;if(!a)return;applyEnv(m);
  const atk=m.attack,on=atk?.id==='gockelok_raumbruch',tau=on?atk.inst.tau(atk.t):0;
  a.strips.forEach((mesh,i)=>{
    mesh.visible=on && tau<4.1;if(!mesh.visible)return;
    const inst=atk.inst,x=[-7,0,7][i],z=2;
    mesh.position.set(inst.origin.x+x*Math.cos(inst.yaw0)+z*Math.sin(inst.yaw0),a.y+.04,inst.origin.z-x*Math.sin(inst.yaw0)+z*Math.cos(inst.yaw0));
    mesh.rotation.y=inst.yaw0;
    const impact=i===1?3.4:2;
    mesh.position.y+=tau>=impact?Math.sin(Math.min(1,(tau-impact)/.7)*Math.PI)*.6:0;
    mesh.material.opacity=tau<impact?.25:.6;
  });
}

// The opened eye under the fallen rooster: grows during the cinematic and stays as a glowing
// portal for the whole eye form. A local hunter walking into it enters the arena.
export function tickPortal(m,dt=0) {
  const on=['reveal','entry','eye'].includes(m.gockelForm) && m.alive!==false;
  if(!on){if(m.eyePortal)m.eyePortal.visible=false;return;}
  if(!m.eyePortal && m.ctx.scene){
    const g=new THREE.Group();g.name='Offenes Auge';
    const iris=new THREE.Mesh(new THREE.TorusGeometry(3,.18,5,36),new THREE.MeshBasicMaterial({color:0x75eee4}));
    iris.rotation.x=-Math.PI/2;g.add(iris);
    const pupil=new THREE.Mesh(new THREE.CircleGeometry(2.8,36),new THREE.MeshBasicMaterial({color:0x050916,side:THREE.DoubleSide}));
    pupil.rotation.x=-Math.PI/2;pupil.position.y=.02;g.add(pupil);
    const glow=new THREE.Mesh(new THREE.CircleGeometry(1.1,24),new THREE.MeshBasicMaterial({color:0x9ffff6,transparent:true,opacity:.8,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));
    glow.rotation.x=-Math.PI/2;glow.position.y=.05;g.add(glow);
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(2.6,3,14,24,1,true),new THREE.MeshBasicMaterial({color:0x5fe8de,transparent:true,opacity:.22,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));
    beam.position.y=7;g.add(beam);
    m.ctx.scene.add(g);m.eyePortal=g;g.userData={iris,pupil,glow,beam};
  }
  const f=m.fallPos??m.pos,w=m.ctx.world,t=m.formTime;
  const g=m.eyePortal;
  if(g){
    g.visible=true;g.position.set(f.x,w.heightAt(f.x,f.z)+.08,f.z);
    const k=m.gockelForm==='eye'?1:Math.min(1,Math.max(.01,(t-OPEN_AT)/2)),pulse=.5+.5*Math.sin((m.time??t)*3.2),u=g.userData;
    const ks=Math.max(.01,k);u.iris.scale.setScalar(ks);u.pupil.scale.set(ks,ks*(.92+.08*pulse),1);
    u.glow.scale.setScalar(Math.max(.01,k*(.7+.5*pulse)));u.glow.material.opacity=.45+.4*pulse;
    u.beam.visible=m.gockelForm==='eye';u.beam.material.opacity=(.12+.12*pulse)*k;u.beam.scale.set(1+.05*pulse,1,1+.05*pulse);
  }
  if(m.gockelForm!=='eye' || !m.eyeArena)return;
  for(const p of m.ctx.players) {
    if(!p.local || !p.alive || p.state==='ko' || inArena(m,p.pos))continue;
    if(Math.hypot(p.pos.x-f.x,p.pos.z-f.z)<PORTAL_R){
      eyeReturn(m,p);m.ctx.bus.emit('sfx',{name:'glitch',pos:p.pos});m.ctx.fx?.glitch?.(.3);
      if(p===(m.ctx.player??p))m.ctx.hud?.center('Zurück im Auge des Glitch',1.6);
    }
  }
}
export function disposePortal(m){
  if(!m.eyePortal)return;m.eyePortal.removeFromParent();m.eyePortal.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});m.eyePortal=null;
}
