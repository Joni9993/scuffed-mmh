import * as THREE from 'three';

// A separate, elevated pocket in the same hunt. Restore every overridden world
// method on disposal; no checkpoint is persisted in the save game.
export function enterEye(m) {
  if(m.eyeArena) return;
  const ctx=m.ctx,w=ctx.world,c={x:m.home.x,z:m.home.z},y=100;
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
  const near=(x,z)=>Math.hypot(x-c.x,z-c.z)<45;
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
  w.update=()=>{}; // The outside world's gather nodes and zone cues stay outside.
  if(ctx.scene){ctx.scene.background=new THREE.Color('#101f32');if(ctx.scene.fog){ctx.scene.fog.color.set('#101f32');ctx.scene.fog.near=45;ctx.scene.fog.far=130;}}
  m.eyeArena={group,originals,center:c,y,strips};
  m.pos.set(c.x,y,c.z);m.air=0;m.vel.set(0,0,0);m.nv=null;
  for(const p of ctx.players) if(p.local && p.alive) eyeReturn(m,p);
}
export function eyeReturn(m,p) {
  const a=m.eyeArena;if(!a)return false;
  p.pos.set(a.center.x,a.y,a.center.z+12);p.invuln=Math.max(p.invuln??0,2);
  m.ctx.rig?.snap(p.pos,p.rot);return true;
}
export function disposeEye(m) {
  const a=m.eyeArena;if(!a)return;
  Object.assign(m.ctx.world,a.originals);a.group.removeFromParent();
  const geometries=new Set(),materials=new Set();a.group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
  geometries.forEach(g=>g.dispose());materials.forEach(mt=>mt.dispose());m.eyeArena=null;
}

export function tickEye(m) {
  const a=m.eyeArena;if(!a)return;
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
  const on=['reveal','entry'].includes(m.gockelForm);
  if(!on){if(m.eyePortal)m.eyePortal.visible=false;return;}
  if(!m.eyePortal && m.ctx.scene){
    const g=new THREE.Group();g.name='Offenes Auge';
    const iris=new THREE.Mesh(new THREE.TorusGeometry(3,.18,5,36),new THREE.MeshBasicMaterial({color:0x75eee4}));
    iris.rotation.x=-Math.PI/2;iris.scale.y=.6;g.add(iris);
    const pupil=new THREE.Mesh(new THREE.CircleGeometry(2.8,36),new THREE.MeshBasicMaterial({color:0x050916,side:THREE.DoubleSide}));
    pupil.rotation.x=-Math.PI/2;pupil.scale.y=.6;g.add(pupil);
    m.ctx.scene.add(g);m.eyePortal=g;
  }
  const g=m.eyePortal;if(!g)return;
  g.visible=true;g.position.set(m.pos.x,m.ctx.world.heightAt(m.pos.x,m.pos.z)+.08,m.pos.z);
  const k=Math.min(1,Math.max(.01,(m.formTime-1.5)/2));g.scale.set(1,k, k);
}
export function disposePortal(m){
  if(!m.eyePortal)return;m.eyePortal.removeFromParent();m.eyePortal.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});m.eyePortal=null;
}
