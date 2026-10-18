import * as THREE from 'three';

// A separate, elevated pocket in the same hunt. It sits EYE_OFFSET m east of the nest, outside the
// 260 m Glitchgrat map, so the world overrides below only ever capture the arena: a knocked-out hunter
// who respawns at the portal in the overworld walks on the normal terrain. Restore every overridden
// world method on disposal; no checkpoint is persisted in the save game.
export const EYE_OFFSET = 420, EYE_Y = 100;
export const arenaCenter = (m) => ({ x: m.home.x + EYE_OFFSET, z: m.home.z });
export const portalPos = (m) => m.revealPos ?? { x: m.home.x, z: m.home.z };
export function enterEye(m) {
  if(m.eyeArena) return;
  const ctx=m.ctx,w=ctx.world,c=arenaCenter(m),y=EYE_Y;
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
  const near=(x,z)=>Math.hypot(x-c.x,z-c.z)<60;
  w.heightAt=(x,z)=>near(x,z)?y:originals.heightAt.call(w,x,z);
  w.collide=(p,r=0)=>{if(near(p.x,p.z)){const dx=p.x-c.x,dz=p.z-c.z,d=Math.hypot(dx,dz),limit=28-r;if(d>limit){p.x=c.x+dx/d*limit;p.z=c.z+dz/d*limit;}return;}return originals.collide.call(w,p,r);};
  w.reachable=(x,z)=>near(x,z)||originals.reachable?.call(w,x,z);
  w.walkable=(x,z,r)=>near(x,z)||originals.walkable?.call(w,x,z,r);
  const strips=[];
  for(const x of [-7,0,7]){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(3.4,.15,36),new THREE.MeshBasicMaterial({color:0x8d75a4,transparent:true,opacity:.35}));
    mesh.visible=false;group.add(mesh);strips.push(mesh);
  }
  w.groundType=(x,z)=>near(x,z)?'rock':originals.groundType?.call(w,x,z);
  // The outside world's gather nodes and zone cues keep running only while a local hunter is outside.
  w.update=(...args)=>{if(!localInside(m))return originals.update?.apply(w,args);};
  const sky=ctx.scene?{bg:ctx.scene.background,fog:ctx.scene.fog?{color:ctx.scene.fog.color.clone(),near:ctx.scene.fog.near,far:ctx.scene.fog.far}:null}:null;
  m.eyeArena={group,originals,center:c,y,strips,sky,skyIn:false};
  m.pos.set(c.x,y,c.z);m.air=0;m.vel.set(0,0,0);m.nv=null;
  for(const p of ctx.players) if(p.local && p.alive) eyeReturn(m,p);
  applySky(m);
}
function localInside(m){const a=m.eyeArena;return !!a && m.ctx.players.some(p=>p.local&&p.pos.y>a.y-40&&Math.hypot(p.pos.x-a.center.x,p.pos.z-a.center.z)<60);}
function applySky(m){
  const a=m.eyeArena,sc=m.ctx.scene;if(!a||!sc||!a.sky)return;
  const inside=localInside(m);if(inside===a.skyIn)return;a.skyIn=inside;
  if(inside){sc.background=new THREE.Color('#101f32');if(sc.fog){sc.fog.color.set('#101f32');sc.fog.near=45;sc.fog.far=130;}}
  else{sc.background=a.sky.bg;if(sc.fog&&a.sky.fog){sc.fog.color.copy(a.sky.fog.color);sc.fog.near=a.sky.fog.near;sc.fog.far=a.sky.fog.far;}}
}
/** Teleport a hunter INTO the arena (entry, or re-entry through the portal). */
export function eyeReturn(m,p) {
  const a=m.eyeArena;if(!a)return false;
  p.pos.set(a.center.x,a.y,a.center.z+12);p.vel?.set?.(0,0,0);p.invuln=Math.max(p.invuln??0,2);
  if(p.local)m.ctx.rig?.snap(p.pos,p.rot);applySky(m);return true;
}
/** K.O. during the eye: wake up next to the still open portal in the overworld (not inside the arena). */
export function eyeRespawn(m,p) {
  if(!m.eyeArena)return false;
  const pp=portalPos(m),w=m.ctx.world,x=pp.x,z=pp.z+7;
  p.pos.set(x,w.heightAt(x,z),z);p.invuln=Math.max(p.invuln??0,2);
  if(p.local)m.ctx.rig?.snap(p.pos,p.rot);applySky(m);
  m.ctx.hud?.center('Zurück am Auge — betritt das Portal, um weiterzukämpfen',3);
  return true;
}
export function disposeEye(m) {
  const a=m.eyeArena;if(!a)return;
  Object.assign(m.ctx.world,a.originals);a.group.removeFromParent();
  if(a.skyIn){const sc=m.ctx.scene;if(sc){sc.background=a.sky.bg;if(sc.fog&&a.sky.fog){sc.fog.color.copy(a.sky.fog.color);sc.fog.near=a.sky.fog.near;sc.fog.far=a.sky.fog.far;}}}
  const geometries=new Set(),materials=new Set();a.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
  geometries.forEach(g=>g.dispose());materials.forEach(mt=>mt.dispose());m.eyeArena=null;
}

export function tickEye(m) {
  const a=m.eyeArena;if(!a)return;
  applySky(m);
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

export function tickPortal(m) {
  const on=m.alive && ['reveal','entry','eye'].includes(m.gockelForm);
  if(!on){if(m.eyePortal)m.eyePortal.visible=false;m.ctx.fx.clearMarker?.(m.id+':eye');return;}
  const pp=m.gockelForm==='eye'?portalPos(m):m.pos,gy=m.ctx.world.heightAt(pp.x,pp.z);
  if(!m.eyePortal && m.ctx.scene){
    const g=new THREE.Group();g.name='Offenes Auge';
    const iris=new THREE.Mesh(new THREE.TorusGeometry(3,.18,5,36),new THREE.MeshBasicMaterial({color:0x75eee4}));
    iris.rotation.x=-Math.PI/2;iris.scale.y=.6;g.add(iris);
    const pupil=new THREE.Mesh(new THREE.CircleGeometry(2.8,36),new THREE.MeshBasicMaterial({color:0x050916,side:THREE.DoubleSide}));
    pupil.rotation.x=-Math.PI/2;pupil.scale.y=.6;g.add(pupil);
    m.ctx.scene.add(g);m.eyePortal=g;
  }
  const g=m.eyePortal;
  if(g){g.visible=true;g.position.set(pp.x,gy+.08,pp.z);const k=m.gockelForm==='eye'?1:Math.min(1,Math.max(.01,(m.formTime-1.5)/2));g.scale.set(1,k,k);}
  if(m.gockelForm!=='eye'){m.ctx.fx.marker?.(m.id+':eye',{x:pp.x,y:gy,z:pp.z},4,'#67e9e2',false);return;}
  // Eye phase: the portal stays open. Hunters outside (respawned after a K.O.) walk in or interact to re-enter.
  const p=m.ctx.players.find(q=>q.local&&q.alive&&!(m.eyeArena&&q.pos.y>m.eyeArena.y-40&&Math.hypot(q.pos.x-m.eyeArena.center.x,q.pos.z-m.eyeArena.center.z)<60));
  if(!p){m.ctx.fx.clearMarker?.(m.id+':eye');return;}
  m.ctx.fx.marker?.(m.id+':eye',{x:pp.x,y:gy,z:pp.z},4,'#67e9e2',false);
  const d=Math.hypot(p.pos.x-pp.x,p.pos.z-pp.z);
  if(d<2.6 || (d<6 && m.ctx.input?.b?.context?.pressed && (p.invuln??0)<1.5)){
    eyeReturn(m,p);m.ctx.hud?.center('AUGE DES GLITCH — zurück in den Kampf!',2);m.ctx.bus.emit('sfx',{name:'heavy',pos:p.pos});
  }
}
export function disposePortal(m){
  if(!m.eyePortal)return;m.eyePortal.removeFromParent();m.eyePortal.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});m.eyePortal=null;
}
