import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lambert, basic } from '../../render/ps1.js';
import { dragonSurface } from '../../render/dragonSurface.js';

export const PYRO_SCALE = 1.65;
const D = Math.PI / 180;
const SIDES = [[1, 'L'], [-1, 'R']];
const C = { hide: '#6e1926', muscle: '#a92b32', armor: '#281e2a', edge: '#af4b48', bone: '#d8ac80', membrane: '#571324', panel: '#842537', hot: '#ff6729', core: '#ffd178' };

/** Six-limbed furnace elder. Surface sculpture is batched by articulated bone/material. */
export function buildPyrostur() {
  const root = new THREE.Group(), scale = new THREE.Group(); root.add(scale); scale.scale.setScalar(PYRO_SCALE);
  const nodes = {}, batches = new Map(), materials = new Map();
  const partMeshes = Object.fromEntries(['body', 'chest', 'head', 'valve', 'wingL', 'wingR', 'tail'].map(k => [k, []]));
  function joint(id, parent, x, y, z) { const n = new THREE.Group(); n.position.set(x, y, z); parent.add(n); nodes[id] = n; return n; }
  function geo(part, parent, color, g, pos = [0, 0, 0], stretch = [1, 1, 1], rot = [0, 0, 0], glow = false) {
    glow ||= color === C.hot || color === C.core;
    // Solid colours live in vertices: several armour shades share one draw per
    // joint. Only independently animated heat materials retain separate colours.
    const surface = [C.hide,C.muscle].includes(color) ? 'scale' : [C.membrane,C.panel].includes(color) ? 'leather' : 'plain';
    const mk = glow ? `${part}/${color}/true` : `${part}/${surface}`;
    const key = `${parent.uuid}/${mk}`;
    if (!materials.has(mk)) {
      const mat = glow ? basic({ color, side: THREE.DoubleSide }) : lambert({ color: '#ffffff', vertexColors: true, flatShading: true, side: THREE.DoubleSide });
      if(!glow && surface!=='plain') dragonSurface(mat,surface==='leather');
      mat.userData.ps1.uSnapDetail.value = 2; materials.set(mk, mat);
    }
    const g2 = g.index ? g.toNonIndexed() : g;
    g2.deleteAttribute('uv');
    if (!glow) {
      const tint = new THREE.Color(color), colors = new Float32Array(g2.attributes.position.count * 3);
      for (let i=0;i<colors.length;i+=3) { colors[i]=tint.r; colors[i+1]=tint.g; colors[i+2]=tint.b; }
      g2.setAttribute('color',new THREE.BufferAttribute(colors,3));
    }
    g2.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...stretch)));
    if (g2 !== g) g.dispose();
    if (!batches.has(key)) batches.set(key, { parent, part, mat: materials.get(mk), list: [] });
    batches.get(key).list.push(g2);
  }
  // Authored cross sections make long anatomical planes rather than ball-and-stick joints.
  function loft(part, n, color, rings, sides = 8) {
    const v = [];
    const p = (r, i) => { const a = (i % sides) / sides * Math.PI * 2; return [r[0] + Math.sin(a) * r[3], r[1] + Math.cos(a) * r[4], r[2]]; };
    for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < sides; i++) v.push(...p(rings[k], i), ...p(rings[k+1], i), ...p(rings[k], i+1), ...p(rings[k], i+1), ...p(rings[k+1], i), ...p(rings[k+1], i+1));
    for (const [idx, reverse] of [[0, false], [rings.length-1, true]]) for (let i = 1; i < sides-1; i++) v.push(...p(rings[idx],0), ...p(rings[idx],reverse ? i+1 : i), ...p(rings[idx],reverse ? i : i+1));
    const g = new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(v,3)); g.computeVertexNormals(); geo(part,n,color,g);
  }
  function bone(part, n, color, a, b, r0, r1 = .01, sides = 7) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), delta = vb.clone().sub(va);
    const g = new THREE.CylinderGeometry(r1,r0,delta.length(),sides); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize()));
    geo(part,n,color,g,va.add(vb).multiplyScalar(.5).toArray());
  }
  function plate(part,n,color,pos,size,rot=[0,0,0]) { geo(part,n,color,new THREE.OctahedronGeometry(1),pos,size,rot); }
  function horn(part,n,color,points,radius) { for(let i=0;i<points.length-1;i++) bone(part,n,Array.isArray(color)?color[Math.min(i,color.length-1)]:color,points[i],points[i+1],radius*(1-i/(points.length-1)),i===points.length-2?.006:radius*(1-(i+1)/(points.length-1))); }
  function sail(part,n,a,b,c,color) {
    // Faceted camber reads as leathery tension; seam edges remain opaque and stable on mobile.
    const mid=a.map((v,i)=>(v+b[i]+c[i])/3+(i===1?.14:0));
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute([...a,...b,...mid,...b,...c,...mid,...c,...a,...mid],3)); g.computeVertexNormals(); geo(part,n,color,g);
  }
  const body=joint('body',scale,0,1.55,0);
  loft('body',body,C.hide,[[0,-.08,-1.65,.38,.45],[0,-.05,-1.1,.73,.67],[0,.06,-.25,1.04,.9],[0,.2,.6,1.17,1.01],[0,.08,1.2,.77,.75]]);
  // Broad scapulae, ribbed red flanks and a distinct tapering waist.
  for(const [s] of SIDES) {
    loft('body',body,C.muscle,[[s*.7,.04,-.85,.29,.5],[s*.97,.08,0,.37,.7],[s*.96,.2,.72,.43,.78],[s*.73,.08,1.12,.24,.46]]);
    // A broad continuous scapular blade locks the huge wing root into the chest.
    loft('body',body,C.armor,[[s*.8,.51,-.3,.22,.19],[s*.99,.61,.08,.32,.31],[s*1.02,.56,.53,.34,.39],[s*.9,.37,.91,.27,.27]]);
    bone('body',body,C.edge,[s*1.12,.71,-.04],[s*1.24,.64,.65],.075,.11);
    for(let i=0;i<7;i++) { const z=.86-i*.35,w=.9-i*.065;
      plate('body',body,C.armor,[s*w,.48-i*.035,z],[.4,.24,.5],[0,s*.25,-s*.62]);
      plate('body',body,C.edge,[s*(w+.05),.34-i*.025,z+.05],[.29,.07,.34],[0,s*.25,-s*.7]);
      if(i<5) bone('body',body,C.hot,[s*(w+.14),.23,z+.17],[s*(w+.1),.02,z-.02],.028,.013,4);
    }
  }
  for(let i=0;i<9;i++) { const z=1.05-i*.33;
    plate('body',body,C.armor,[0,.78-i*.035,z],[.58-i*.028,.22,.42]);
    horn('body',body,C.armor,[[0,.82-i*.03,z],[0,1.28-i*.04,z-.2],[0,1.37-i*.045,z-.45]],.18-i*.011);
  }
  const chest=joint('chest',body,0,-.3,1.05);
  loft('chest',chest,C.hide,[[0,-.05,-.12,.56,.56],[0,.02,.24,.62,.61],[0,.02,.49,.36,.47]]);
  for(const [s] of SIDES) for(let i=0;i<5;i++) {
    plate('chest',chest,C.armor,[s*.32,-.39+i*.20,.43],[.31,.15,.19],[0,-s*.25,s*.32]);
    bone('chest',chest,C.hot,[s*.08,-.40+i*.20,.55],[s*.46,-.33+i*.18,.45],.038,.016,5);
    bone('chest',chest,C.core,[s*.09,-.39+i*.2,.53],[s*.35,-.35+i*.18,.42],.018,.008,4);
  }
  const core=joint('core',chest,0,0,.57); plate('chest',core,C.core,[0,0,0],[.12,.43,.035]);
  const coreMat=materials.get(`chest/${C.core}/true`);
  // Organic chimney plates replace the boiler pipe while preserving its breakable anchor.
  const valve=joint('valve',body,1,-.25,.55),pipe=joint('pipe',valve,0,0,0),needle=joint('needle',valve,.15,.1,.16);
  horn('valve',pipe,C.armor,[[0,0,0],[.3,.55,-.12],[.18,.86,-.38]],.24);
  bone('valve',pipe,C.hot,[.2,.53,-.18],[.17,.77,-.32],.105,.07);
  plate('valve',needle,C.core,[0,.15,0],[.04,.22,.035]);
  const ventAnchors=[];
  for(const [s,suffix] of SIDES) for(let i=0;i<3;i++) {
    const x=s*(.52+i*.08),z=.35-i*.45,y=.82-i*.05;
    horn('body',body,C.armor,[[x,y,z],[x+s*.12,y+.48,z-.2],[x+s*.14,y+.56,z-.38]],.17);
    bone('body',body,C.hot,[x+s*.07,y+.3,z-.18],[x+s*.12,y+.5,z-.32],.075,.045);
    ventAnchors.push(joint(`vent${suffix}${i}`,body,x+s*.12,y+.55,z-.33));
  }
  const neck=joint('neck',body,0,.05,1.18);
  loft('body',neck,C.muscle,[[0,.02,-.12,.65,.64],[0,.53,.25,.52,.59],[0,.7,.7,.38,.47],[0,.45,1.12,.32,.35]]);
  for(let i=0;i<6;i++) {
    const t=i/5,z=t*1.15,y=Math.sin(t*Math.PI)*.67;
    plate('body',neck,C.armor,[0,y+.47,z],[.47-i*.025,.18,.32],[.15,0,0]);
    for(const [s] of SIDES) plate('body',neck,C.edge,[s*(.45-i*.026),y+.05,z],[.09,.26,.3],[0,s*.25,-s*.2]);
    bone('body',neck,C.hot,[-.12,y-.22,z],[.12,y-.22,z+.045],.022,.015,4);
  }
  const head=joint('head',neck,0,.22,1.12);
  loft('head',head,C.muscle,[[0,.02,-.42,.3,.32],[0,.07,-.05,.51,.43],[0,.02,.36,.4,.29],[0,-.08,.91,.2,.14],[0,-.09,1.35,.085,.09]]);
  loft('head',head,C.armor,[[0,.29,-.32,.29,.16],[0,.35,.12,.41,.15],[0,.19,.7,.21,.1],[0,.01,1.34,.08,.045]]);
  for(const [s] of SIDES) {
    // A backward crown frames the skull; the mouth and gaze own the forward silhouette.
    horn('head',head,[C.edge,C.armor,C.armor],[[s*.34,.29,-.15],[s*.65,.62,-.53],[s*.78,.84,-1.2],[s*.57,.9,-1.88]],.23);
    bone('head',head,C.edge,[s*.72,.87,-1.15],[s*.57,.92,-1.86],.044,.006,5);
    horn('head',head,C.armor,[[s*.45,.02,-.16],[s*.79,.15,-.6],[s*.92,.34,-1.12]],.19);
    horn('head',head,[C.edge,C.armor],[[s*.4,-.16,.2],[s*.64,-.15,-.24],[s*.78,-.08,-.74]],.13);
    plate('head',head,C.armor,[s*.43,.08,.22],[.14,.21,.45],[0,s*.2,-s*.2]);
    // Eyes sit outside the cheek armour, with a forward-facing slit as well as
    // the side socket. A buried eye makes a detailed skull read as a blind toy.
    plate('head',head,C.hot,[s*.59,.15,.30],[.026,.063,.22],[0,s*.15,-s*.15]);
    plate('head',head,C.core,[s*.61,.15,.38],[.014,.035,.07]);
    plate('head',head,C.hot,[s*.50,.15,.54],[.09,.043,.035],[0,-s*.35,-s*.18]);
    plate('head',head,C.edge,[s*.37,.25,.29],[.2,.105,.4],[0,s*.12,-s*.28]);
    plate('head',head,C.armor,[s*.3,.32,.04],[.27,.13,.53],[0,s*.22,-s*.16]);
    bone('head',head,C.armor,[s*.11,-.005,1.1],[s*.075,-.035,1.31],.045,.025);
    for(let i=0;i<6;i++) bone('head',head,C.bone,[s*(.36-i*.028),-.19,.16+i*.17],[s*(.33-i*.025),-.34,.19+i*.17],.045,.006,5);
  }
  const jaw=joint('jaw',head,0,-.25,-.02);
  loft('head',jaw,C.armor,[[0,0,-.12,.28,.11],[0,-.08,.35,.31,.11],[0,-.09,.97,.17,.075],[0,-.06,1.33,.075,.045]]);
  bone('head',jaw,C.hot,[0,-.04,.1],[0,-.04,1.2],.055,.025);
  for(const [s] of SIDES) for(let i=0;i<5;i++) bone('head',jaw,C.bone,[s*(.29-i*.028),.01,.3+i*.18],[s*(.27-i*.025),.15,.3+i*.18],.037,.005,5);

  const wings={},innerSails=[];
  for(const [s,suffix] of SIDES) {
    const id='wing'+suffix,w=joint(id,body,s*.73,.69,.3); wings[id]=w;
    bone(id,w,C.muscle,[0,0,0],[s*1.18,.72,-.24],.3,.19);
    plate(id,w,C.armor,[s*.3,.32,-.07],[.36,.3,.56],[0,0,-s*.45]);
    const elbow=joint('elbow'+suffix,w,s*1.18,.72,-.24);
    bone(id,elbow,C.muscle,[0,0,0],[s*1.75,.18,-.25],.2,.13);
    bone(id,elbow,C.edge,[0,.08,0],[s*1.72,.26,-.25],.07,.04);
    const wrist=joint('wrist'+suffix,elbow,s*1.75,.18,-.25);
    horn(id,wrist,C.bone,[[0,0,0],[s*.15,.33,.15],[s*.23,.36,.49]],.13);
    const tips=[[s*2.8,.18,-1.4],[s*2.12,-.15,-3.5],[s*.92,-.32,-4.65],[-s*.8,-.4,-4.2]];
    const base=[-s*1.8,-.48,-2.1];
    for(let i=0;i<tips.length;i++) {
      const tip=tips[i],knuckle=[tip[0]*.56,tip[1]+.17,tip[2]*.48];
      horn(id,wrist,C.muscle,[[0,0,0],knuckle,tip],.105-i*.012);
      bone(id,wrist,C.edge,[s*.04,.035,0],knuckle,.036,.02,5);
      if(i>0) {
        const prior=tips[i-1],notch=[(tip[0]+prior[0])*.49,(tip[1]+prior[1])*.5+.04,(tip[2]+prior[2])*.44];
        sail(id,wrist,[0,0,0],prior,notch,i%2?C.panel:C.membrane);
        sail(id,wrist,[0,0,0],notch,tip,i%2?C.membrane:C.panel);
        const seam=tip.map(v=>v*.63); bone(id,wrist,C.hot,[0,.035,0],seam,.017,.005,4);
        for(let j=1;j<=3;j++) { const a=tip.map(v=>v*j*.2),b=a.map((v,k)=>v+(prior[k]-tip[k])*.13); bone(id,wrist,C.edge,a,b,.013,.004,4); }
      }
    }
    sail(id,wrist,[0,0,0],tips.at(-1),base,C.membrane);
    // The propatagium and inner sail run all the way to the torso. Their torso edge
    // stays attached during every wing pose instead of following a rigid wrist.
    const innerGeometry=new THREE.BufferGeometry();
    innerGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(81),3).setUsage(THREE.DynamicDrawUsage));
    innerGeometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(81),3).setUsage(THREE.DynamicDrawUsage));
    const innerTint=new THREE.Color(C.membrane),innerColors=new Float32Array(27*3);
    for(let i=0;i<innerColors.length;i+=3){innerColors[i]=innerTint.r;innerColors[i+1]=innerTint.g;innerColors[i+2]=innerTint.b;}
    innerGeometry.setAttribute('color',new THREE.BufferAttribute(innerColors,3));
    const innerMesh=new THREE.Mesh(innerGeometry,materials.get(`${id}/leather`));
    innerMesh.frustumCulled=false; body.add(innerMesh); partMeshes[id].push(innerMesh);
    innerSails.push({s,w,elbow,wrist,geometry:innerGeometry,tip:tips.at(-1),points:Array.from({length:5},()=>new THREE.Vector3()),center:new THREE.Vector3(),matrix:new THREE.Matrix4()});
    // Distinct four weightbearing legs. Wings never touch the floor at rest.
    const fore=joint('foreleg'+suffix,body,s*.9,-.05,.76);
    bone('body',fore,C.muscle,[0,0,0],[s*.14,-.7,.14],.47,.28);
    plate('body',fore,C.armor,[s*.08,-.13,.06],[.47,.49,.46],[0,0,-s*.15]);
    bone('body',fore,C.edge,[s*.25,-.15,.26],[s*.27,-.58,.28],.075,.045);
    const ef=joint('elbowFore'+suffix,fore,s*.14,-.7,.14);
    bone('body',ef,C.hide,[0,0,0],[-s*.04,-.65,.08],.28,.19);
    plate('body',ef,C.armor,[s*.04,-.25,.05],[.29,.43,.29]);
    horn('body',ef,C.armor,[[0,-.04,-.1],[s*.08,.11,-.33],[s*.11,.2,-.57]],.13);
    const af=joint('ankleFore'+suffix,ef,-s*.04,-.65,.08);
    const hind=joint('leg'+suffix,body,s*.74,-.15,-1.02);
    bone('body',hind,C.muscle,[0,0,0],[s*.14,-.55,-.2],.48,.27);
    plate('body',hind,C.armor,[s*.08,-.14,-.05],[.44,.42,.51],[0,0,-s*.15]);
    const knee=joint('knee'+suffix,hind,s*.14,-.55,-.2);
    bone('body',knee,C.hide,[0,0,0],[-s*.02,-.7,.36],.25,.18);
    const ankle=joint('ankle'+suffix,knee,-s*.02,-.7,.36);
    for(const foot of [af,ankle]) {
      loft('body',foot,C.hide,[[0,-.045,-.16,.2,.1],[0,-.055,.12,.34,.105],[0,-.055,.35,.29,.075]]);
      for(let i=-1;i<=1;i++) horn('body',foot,C.bone,[[i*.23,-.045,.2],[i*.28,-.07,.46],[i*.28,-.14,.64]],.1);
    }
  }
  const tail=joint('tail',body,0,-.1,-1.4);
  loft('tail',tail,C.hide,[[0,0,.12,.4,.4],[0,-.1,-.65,.34,.3],[0,-.15,-1.5,.23,.23]]);
  const tailMid=joint('tailMid',tail,0,-.15,-1.5);
  loft('tail',tailMid,C.hide,[[0,0,.08,.24,.23],[0,-.04,-.75,.19,.17],[0,-.08,-1.5,.12,.12]]);
  const tailTip=joint('tailTip',tailMid,0,-.08,-1.5);
  bone('tail',tailTip,C.armor,[0,0,0],[0,.06,-1.7],.15,.005);
  for(const [n,len,width] of [[tail,1.5,.34],[tailMid,1.5,.2],[tailTip,1.5,.12]]) for(let i=0;i<5;i++) {
    plate('tail',n,C.armor,[0,width*.75,-i*len/5],[width,.19,.34]);
    for(const [s] of SIDES) plate('tail',n,C.edge,[s*width*.75,0,-i*len/5],[width*.5,.11,.3],[0,s*.3,0]);
    if(i%2===0) bone('tail',n,C.hot,[-width*.5,.15,-i*len/5],[width*.5,.15,-i*len/5-.06],.022,.012,4);
  }
  for(const [s] of SIDES) horn('tail',tailTip,C.armor,[[0,.02,-.75],[s*.5,.08,-1.2],[s*.75,.1,-1.65]],.16);
  for(const b of batches.values()) { const mesh=new THREE.Mesh(mergeGeometries(b.list),b.mat); b.parent.add(mesh); partMeshes[b.part].push(mesh); for(const g of b.list)g.dispose(); }
  const v=(p,k)=>Number.isFinite(p[k])?p[k]:0;
  const contactMatrix=new THREE.Matrix4(),contactPoint=new THREE.Vector3();
  const footBounds=new Map();
  for(const suffix of ['L','R']) for(const id of ['ankleFore','ankle']) {
    const foot=nodes[id+suffix],box=new THREE.Box3();
    for(const mesh of foot.children) if(mesh.isMesh) { mesh.geometry.computeBoundingBox(); box.union(mesh.geometry.boundingBox); }
    const corners=[];
    for(const x of [box.min.x,box.max.x]) for(const y of [box.min.y,box.max.y]) for(const z of [box.min.z,box.max.z]) corners.push([x,y,z]);
    footBounds.set(foot,corners);
  }
  function apply(p={}) {
    const k=n=>v(p,n);
    body.position.y=1.55+k('bodyY'); body.rotation.set(k('bodyPitch')*D,k('bodyYaw')*D,k('bodyRoll')*D);
    neck.rotation.set(k('neck')+k('neckLift')*D,k('neckYaw')*D,0);
    head.position.z=1.12+k('headReach'); head.rotation.set(k('head')*D,k('headYaw')*D,0); jaw.rotation.x=k('jaw')*D;
    tail.rotation.set(k('tailPitch')*D,k('tailYaw')*D,0); tailMid.rotation.y=k('tailCurl')*D; tailTip.rotation.y=k('tailCurl')*D*.7;
    for(const [s,suffix] of SIDES) {
      const fold=Math.max(0,Math.min(1,k('wingFold'))),w=wings['wing'+suffix];
      w.rotation.set(-.06,-s*(.15+k('spread')*.12+fold*.25),s*(10+k('wing')*.68+k('wing'+suffix)*.68)*D);
      nodes['elbow'+suffix].rotation.set(0,s*(.12+fold*.5),s*k('elbow'+suffix)*D*.65);
      nodes['wrist'+suffix].rotation.set(k('wrist'+suffix)*D,s*fold*.38,0);
      const f=nodes['foreleg'+suffix],ef=nodes['elbowFore'+suffix],af=nodes['ankleFore'+suffix],h=nodes['leg'+suffix],kn=nodes['knee'+suffix],an=nodes['ankle'+suffix];
      f.rotation.set(k('fore'+suffix)*D,0,s*k('foreSplay'+suffix)*D); ef.rotation.set(k('foreKnee'+suffix)*D,0,0); af.rotation.set(k('foreAnkle'+suffix)*D,0,0);
      h.rotation.set((k('leg'+suffix)+k('hind'+suffix))*D,0,0); kn.rotation.set(k('knee'+suffix)*D,0,0); an.rotation.set(k('ankle'+suffix)*D,0,0);
      // Deterministic, model-local hock folding on crouches; authored foot lift remains intact.
      if(Math.abs(k('bodyRoll'))<45&&k('bodyY')>-.85) for(const [upper,knee,ankle] of [[f,ef,af],[h,kn,an]]) {
        for(let i=0;i<34;i++) {
          body.updateMatrix(); upper.updateMatrix(); knee.updateMatrix(); ankle.updateMatrix();
          contactMatrix.copy(body.matrix).multiply(upper.matrix).multiply(knee.matrix).multiply(ankle.matrix);
          let floor=Infinity;
          for(const point of footBounds.get(ankle)) { contactPoint.fromArray(point).applyMatrix4(contactMatrix); floor=Math.min(floor,contactPoint.y); }
          if(floor>=-.015)break;
          knee.rotation.x-=5*D; ankle.rotation.set(-body.rotation.x-upper.rotation.x-knee.rotation.x,0,-body.rotation.z-upper.rotation.z);
        }
      }
    }
    for(const sail of innerSails) {
      const {s,w,elbow,wrist,points,center,matrix,geometry,tip}=sail;
      w.updateMatrix(); elbow.updateMatrix(); wrist.updateMatrix();
      points[0].set(s*.78,.56,.28);
      matrix.copy(w.matrix).multiply(elbow.matrix);
      points[1].set(0,0,0).applyMatrix4(matrix);
      matrix.multiply(wrist.matrix);
      points[2].set(0,0,0).applyMatrix4(matrix);
      points[3].fromArray(tip).applyMatrix4(matrix);
      points[4].set(s*.7,-.06,-1.6);
      const positions=geometry.attributes.position; let vertex=0;
      for(const tri of [[0,1,4],[1,2,4],[2,3,4]]) {
        center.copy(points[tri[0]]).add(points[tri[1]]).add(points[tri[2]]).multiplyScalar(1/3); center.y+=.09;
        for(let j=0;j<3;j++) for(const point of [points[tri[j]],points[tri[(j+1)%3]],center]) positions.setXYZ(vertex++,point.x,point.y,point.z);
      }
      positions.needsUpdate=true; geometry.computeVertexNormals();
    }
    chest.scale.setScalar(1+k('boiler')*.1);
  }
  apply();
  return { root,nodes,partMeshes,apply,extra:{pipe,needle,coreMat,wings,ventAnchors} };
}
