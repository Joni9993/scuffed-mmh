import * as THREE from 'three';
import { GearParts, bar, spike } from '../../render/gearfx.js';
import { FINALE_PALETTES } from './finaleWeaponModels.js';

// These are complete constructions, rather than a crest over the tier-six weapon.
// Katana coordinates: blade runs down -Y, its cutting plane is YZ. Instruments
// face -Z; the membrane, grip and three sampler sockets keep their original frame.
const HY = -1.2;
function merge(P) {
  P.geos = P.geos.map(g => { if (!g.index) return g; const n = g.toNonIndexed(); g.dispose(); return n; });
  const geometry = P.merge();
  P.geos.forEach(g => g.dispose());
  return geometry;
}
function plate(P, points, depth, color, plane = 'yz', at = {}) {
  const shape = new THREE.Shape(points.map(p => new THREE.Vector2(...p)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
  g.translate(0, 0, -depth / 2);
  // Extrusion normal becomes X; polygon coordinates are (Y,Z).
  if (plane === 'yz') g.applyMatrix4(new THREE.Matrix4().set(0,0,1,0, 1,0,0,0, 0,1,0,0, 0,0,0,1));
  P.add(g, color, at);
}
function ring(P, radius, tube, color, at = {}) {
  P.add(new THREE.TorusGeometry(radius, tube, 4, 12), color, at);
}

// Ordered spine/edge pairs give a real continuous, tapered Japanese blade. The
// stone blade has a chipped back; the crow blade reverses its curve at the tip.
const KATANA = {
  p: { len: 1.62, rows: [[0,.07,-.09],[.32,.045,-.12],[.68,-.015,-.20],[1.05,-.12,-.31],[1.4,-.29,-.46],[1.62,-.51,-.51]] },
  f: { len: 1.76, rows: [[0,.15,-.17],[.24,.19,-.18],[.32,.125,-.19],[.45,.21,-.20],[.78,.15,-.22],[.87,.09,-.23],[1.04,.17,-.24],[1.45,.09,-.30],[1.76,-.12,-.32],[1.83,-.32,-.32]] },
  i: { len: 1.88, rows: [[0,.055,-.055],[.45,.035,-.075],[.9,-.01,-.13],[1.3,-.09,-.20],[1.64,-.23,-.32],[1.88,-.43,-.43]] },
  u: { len: 1.59, rows: [[0,.08,-.12],[.32,.14,-.10],[.65,.24,-.04],[.92,.38,.05],[1.15,.50,.18],[1.39,.54,.30],[1.59,.30,.30]] },
};
function bladePolygon(rows, expand = 0) {
  return [...rows.map(([s,back]) => [-.16-s,back+expand]), ...[...rows].reverse().map(([s,,edge]) => [-.16-s,edge-expand])];
}
function katanaBlade(aspect, sheath = false) {
  const c = FINALE_PALETTES[aspect], rows = KATANA[aspect].rows, P = new GearParts();
  if (sheath) {
    plate(P, bladePolygon(rows,.025), aspect === 'f' ? .105 : .083, c.dark);
    for (const n of [0, Math.floor(rows.length/2), rows.length-2]) {
      const [s,b,e] = rows[n];
      P.box(.105,.045,b-e+.07,c.edge,{y:-.16-s,z:(b+e)/2});
    }
    const g=merge(P);g.translate(0,.16,0);return g;
  }
  // A narrow prismatic slot divides Voltiris' final third into two long tines.
  if (aspect === 'i') {
    plate(P,bladePolygon(rows.slice(0,4)),.042,c.edge);
    const [s,b,e]=rows[3];
    plate(P,[[-.16-s,b],[-1.8,-.23],[-2.04,-.43],[-1.81,-.27],[-.16-s,(b+e)/2+.012]],.04,c.light);
    plate(P,[[-.16-s,(b+e)/2-.012],[-1.81,-.30],[-2.01,-.50],[-1.8,-.34],[-.16-s,e]],.04,c.shell);
  } else if(aspect === 'u') {
    // Four overlapping feather vanes leave deliberate light slots between them.
    for(let n=0;n<rows.length-1;n++) {
      const a=rows[n],b=rows[n+1],gap=n===0?0:.025;
      plate(P,[[-.16-a[0]-gap,a[1]],[-.16-b[0]+.013,b[1]],[-.16-b[0]+.013,b[2]],[-.16-a[0]-gap,a[2]]],.055,n%2?c.edge:c.shell);
      if(n>0) spike(P,[0,-.16-a[0],a[1]],[0,-.08-a[0],a[1]+.13],.047,c.dark);
    }
    bar(P,[0,-.2,-.01],[0,-1.55,.40],.015,.012,c.glow,{glow:.7});
  } else {
    plate(P,bladePolygon(rows),aspect==='f'?.095:.052,c.shell);
    // Temper line is physically part of the blade face, never another full blade.
    const edgeRows=rows.map(([s,b,e])=>[s,e+(b-e)*.23,e]);
    plate(P,bladePolygon(edgeRows),aspect==='f'?.098:.055,c.edge);
    if(aspect==='f') for(const [s,b] of rows.slice(1,-2))
      P.box(.12,.08,.055,c.dark,{y:-.16-s,z:b-.035,rx:-.2});
  }
  if(aspect==='p') {
    // Habaki and vented heat jacket at the root of a pressure-tempered tachi.
    P.box(.085,.13,.20,c.edge,{y:-.23,z:-.015});
    for(let j=0;j<3;j++) P.box(.058,.025,.12,c.dark,{y:-.36-j*.11,z:-.005-j*.018});
  }
  return merge(P);
}
function katanaHilt(aspect) {
  const c=FINALE_PALETTES[aspect],P=new GearParts();
  P.box(.073,.49,.08,c.dark,{y:.12});
  for(let n=0;n<6;n++)P.box(.084,.033,.09,n%2?c.edge:c.shell,{y:-.065+n*.079,rz:n%2?.12:-.12});
  P.box(.10,.045,.11,c.edge,{y:.375});
  if(aspect==='p') {
    ring(P,.165,.029,c.edge,{y:-.14,rx:Math.PI/2});
    P.box(.105,.045,.15,c.dark,{y:-.14});
    for(const s of [-1,1])bar(P,[s*.07,-.14,0],[s*.15,-.14,.045],.022,.026,c.shell);
  } else if(aspect==='f') {
    P.box(.31,.065,.27,c.dark,{y:-.14,ry:.16});
    P.box(.21,.025,.18,c.edge,{y:-.18});
    spike(P,[.12,-.13,.08],[.22,-.13,.17],.05,c.shell);
  } else if(aspect==='i') {
    for(const s of [-1,1])bar(P,[0,-.14,0],[s*.20,-.12,s*.15],.024,.009,c.light);
    bar(P,[.20,-.12,.15],[.13,.21,.13],.013,.015,c.shell);
    P.box(.09,.075,.10,c.glow,{y:-.15,glow:.7,ry:Math.PI/4});
  } else {
    ring(P,.145,.025,c.edge,{y:-.14,rx:Math.PI/2,sx:1.5,sy:.7});
    for(const s of [-1,1])spike(P,[s*.1,-.14,.07],[s*.23,-.17,.19],.045,c.dark);
    P.sphere(.05,5,3,c.glow,{y:-.14,glow:.7});
  }
  return merge(P);
}

function instrumentBody(aspect) {
  const c=FINALE_PALETTES[aspect],P=new GearParts();
  bar(P,[0,.48,0],[0,HY-.18,0],.038,.045,c.dark);
  for(let j=0;j<5;j++)P.box(.09,.035,.09,c.shell,{y:.36-j*.15});
  P.sphere(.065,5,3,c.edge,{y:.52});
  if(aspect==='p') {
    // Five different organ pipes, a pressure chest and a forward trumpet bell.
    P.box(.57,.22,.24,c.shell,{y:HY+.1,z:.04});
    for(let n=-2;n<=2;n++) {
      const len=.48+.16*(2-Math.abs(n));
      P.cyl(.043,.055,len,8,c.edge,{x:n*.125,y:HY-.08-len/2,z:.09});
      P.cyl(.057,.046,.06,8,c.dark,{x:n*.125,y:HY-.08-len,z:.09});
      P.box(.035,.055,.013,c.dark,{x:n*.125,y:HY-.17,z:-.035});
    }
    P.add(new THREE.CylinderGeometry(.115,.29,.32,12,1,true),c.edge,{y:HY,z:-.15,rx:Math.PI/2});
    ring(P,.29,.022,c.shell,{y:HY,z:-.31});
    bar(P,[0,HY+.23,.09],[.23,HY+.33,.09],.045,.045,c.shell);
  } else if(aspect==='f') {
    // A suspended, chipped stone gong. The centre boss is the strike surface.
    P.cyl(.48,.44,.11,12,c.shell,{y:HY-.13,z:.07,rx:Math.PI/2});
    ring(P,.43,.055,c.edge,{y:HY-.13,z:-.01});
    P.cyl(.18,.24,.15,10,c.dark,{y:HY,z:-.13,rx:Math.PI/2});
    for(const s of [-1,1]) {
      bar(P,[s*.37,HY+.27,0],[s*.54,HY+.34,.01],.033,.04,c.dark);
      bar(P,[s*.54,HY+.34,.01],[s*.54,HY-.42,.01],.045,.06,c.edge);
    }
    P.box(1.13,.085,.15,c.dark,{y:HY+.36});
    for(let n=0;n<5;n++) {
      const a=n*1.17;
      P.box(.075,.15,.125,c.dark,{x:Math.cos(a)*.43,y:HY-.13+Math.sin(a)*.43,z:.03,rz:a});
    }
  } else if(aspect==='i') {
    // A real open tuning fork: slim prism tines surrounding empty air.
    P.box(.43,.12,.15,c.shell,{y:HY+.05});
    for(const s of [-1,1]) {
      plate(P,[[s*.14,HY+.07],[s*.23,HY-.12],[s*.24,HY-.82],[s*.17,HY-1.04],[s*.12,HY-.82]],.11,c.edge,'xy',{z:.02});
      bar(P,[s*.19,HY-.12,-.075],[s*.19,HY-.82,-.075],.012,.008,c.glow,{glow:.9});
    }
    // Strike crystal is suspended in the open fork, in front of its base.
    P.add(new THREE.OctahedronGeometry(.17),c.light,{y:HY,z:-.11,sy:1.1,glow:.25});
  } else {
    // Crow throat / acoustic iris, with a hooked beak and open feather crown.
    ring(P,.32,.065,c.edge,{y:HY-.13,z:.03,sx:1.3,sy:.72});
    ring(P,.22,.025,c.glow,{y:HY-.13,z:-.045,sx:1.3,sy:.72,glow:.7});
    plate(P,[[-.12,HY+.07],[.13,HY+.11],[.38,HY-.10],[.1,HY-.05]],.17,c.dark,'xy');
    for(const s of [-1,1])for(let n=0;n<4;n++) {
      const x=s*(.26+n*.075),y=HY-.2-n*.09;
      plate(P,[[s*.12,HY-.15],[x,y-.4],[x+s*.13,y-.32],[x,y]],.055,n%2?c.shell:c.dark,'xy',{z:.07});
    }
    spike(P,[0,HY-.34,0],[0,HY-.95,0],.085,c.edge);
  }
  return merge(P);
}

function instrumentWing(aspect,side) {
  const P=new GearParts(),c=FINALE_PALETTES[aspect];
  if(aspect==='p') {
    P.box(.08,.39,.18,c.shell,{x:side*.07,y:-.18});
    for(let n=0;n<4;n++)P.box(.12,.035,.21,c.edge,{x:side*.07,y:-n*.10});
    P.add(new THREE.CylinderGeometry(.15,.045,.18,8,1,true),c.edge,{x:side*.15,y:-.46,rz:side*Math.PI/3});
  } else if(aspect==='f') {
    // Suspended stone chimes swing out from the gong's crossbar.
    bar(P,[0,0,0],[0,-.15,0],.018,.018,c.edge);
    P.add(new THREE.CylinderGeometry(.065,.16,.30,8,1,true),c.shell,{y:-.31});
    ring(P,.16,.025,c.edge,{y:-.46,rx:Math.PI/2});
  } else if(aspect==='i') {
    plate(P,[[0,0],[side*.065,-.12],[side*.08,-.72],[0,-.89],[-side*.03,-.68]],.045,c.light,'xy');
    bar(P,[0,-.07,.03],[side*.025,-.72,.03],.012,.007,c.glow,{glow:1});
  } else {
    for(let n=0;n<4;n++)plate(P,[[0,0],[side*(.25+n*.06),-.14-n*.13],[side*(.35+n*.07),-.49-n*.09],[side*.08,-.33]],.055,n%2?c.edge:c.dark,'xy');
  }
  return merge(P);
}

function clearMeshes(group, keep = new Set()) {
  const geos=new Set(),mats=new Set();
  for(const child of [...group.children]) {
    group.remove(child);
    child.traverse(o=>{if(o.isMesh){geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(!keep.has(m))mats.add(m);}});
  }
  geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());
}

/** Keep gameplay pivots/sockets but replace every inherited physical blade/coil. */
export function installFinaleSignature(root,type,aspect,material) {
  if(type==='kt') {
    const d=root.userData.kt,hilt=root.children.find(o=>o.isGroup&&o!==d.bladeG);
    clearMeshes(d.bladeG,new Set([d.shellMat]));
    clearMeshes(hilt);
    delete root.userData.halo;
    const body=new THREE.Mesh(katanaBlade(aspect),material);body.name='finale-katana-edge';d.bladeG.add(body);
    const ornament=new THREE.Mesh(katanaHilt(aspect),material);ornament.name='finale-katana-hilt';hilt.add(ornament);
    // The Schliff aura now follows this family's actual edge and sheaths with it.
    d.shell=new THREE.Mesh(body.geometry,d.shellMat);d.shell.scale.setScalar(1.025);d.shell.visible=false;d.bladeG.add(d.shell);
    d.bladeMat=material;d.mSpine=material;d.ember=[];
    d.look={...d.look,len:KATANA[aspect].len,emb:aspect==='p'?[1,.24,.01]:aspect==='f'?[.25,.08,.01]:aspect==='i'?[.05,.5,1]:[.25,.7,.45]};
    clearMeshes(d.hip);
    const saya=new THREE.Mesh(katanaBlade(aspect,true),material);saya.name='finale-katana-saya';d.hip.add(saya);
    return {body,ornament};
  }
  if(type==='kk') {
    const d=root.userData.kk;
    d.main.geometry.dispose();d.main.geometry=instrumentBody(aspect);d.main.material=material;
    root.userData.glow=material;root.userData.gearGlow=material.userData.glow;
    // Retain the same sampler/membrane objects so local and network animation
    // still drive them. The strike plane stays at the old instrument head.
    root.add(d.mem.mesh);d.mem.mesh.position.set(0,HY,-.34);
    for(let n=0;n<d.pivots.length;n++) {
      const pv=d.pivots[n],side=n===0?-1:1;
      clearMeshes(pv.g);
      if(n<2) {
        pv.g.add(new THREE.Mesh(instrumentWing(aspect,side),material));
        const width=aspect==='p'?.34:aspect==='f'?.54:aspect==='i'?.23:.29;
        pv.g.position.set(side*width,HY+(aspect==='f'?.30:.02),aspect==='i'?.04:0);
        Object.assign(pv,{kind:'rot',axis:'z',rest:side*.025,max:side*(aspect==='u'?.8:aspect==='f'?.32:.36),wob:.025,ph:side});
      } else {
        const P=new GearParts();
        ring(P,aspect==='f'?.165:.12,.012,FINALE_PALETTES[aspect].glow,{glow:1});
        pv.g.add(new THREE.Mesh(merge(P),material));pv.g.position.set(0,HY,-.36);
        Object.assign(pv,{kind:'arc',showAt:.12});
      }
      pv.g.rotation.set(0,0,0);pv.g.scale.setScalar(1);
    }
    return {body:d.main,ornament:d.main};
  }
  return null;
}
