import * as THREE from 'three';
import { bar, spike } from '../../render/gearfx.js';

// Solid, bevel-free profiles keep these weapons readable with the game's low-poly shading.
function plate(P, points, depth, color, at={}) {
  const shape=new THREE.Shape();
  points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));
  shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:1});
  g.translate(0,0,-depth/2);P.add(g,color,at);
}
const jewel=(P,c,x,y,z,s=.08)=>P.add(new THREE.OctahedronGeometry(s,0),c.light,{x,y,z,glow:.8});

export function dualBody(P,c,aspect,mirror) {
  bar(P,[0,.29,0],[0,-.18,0],.043,.05,c.dark);
  for(let j=0;j<3;j++)P.box(.09,.027,.085,c.edge,{y:.05+j*.07});
  if(aspect==='p') {
    // A hollow knuckle cage carries the hooked furnace talon.
    for(const side of [-1,1])bar(P,[side*.07,.14,0],[side*.17,-.22,0],.036,.045,c.shell);
    bar(P,[-.17,-.22,0],[.17,-.22,0],.04,.04,c.edge);
    plate(P,[[-.12,-.2],[.12,-.22],[.23,-.58],[.18,-.96],[-.03,-1.13],[.055,-.83],[-.08,-.59]],.11,c.shell);
    plate(P,[[.12,-.47],[.23,-.58],[.18,-.96],[-.03,-1.13],[.07,-.86]],.12,c.edge);
    for(let j=0;j<3;j++)P.box(.12,.025,.12,c.dark,{x:.055+j*.012,y:-.34-j*.12,rz:.3});
    P.cyl(.055,.07,.26,5,c.dark,{x:-.15,y:-.4,rz:-.22});
    P.cyl(.036,.036,.05,5,c.glow,{x:-.18,y:-.25,glow:.7});
  } else if(aspect==='f') {
    // Short, weighty stone chisel: broad flat edge, open metal wrist brace.
    plate(P,[[-.24,-.15],[.19,-.16],[.27,-.62],[.18,-.94],[-.25,-.88],[-.3,-.39]],.22,c.shell);
    plate(P,[[-.25,-.73],[.23,-.73],[.18,-.94],[-.25,-.88]],.23,c.edge);
    P.box(.38,.07,.25,c.dark,{y:-.26,rz:-.09});
    P.box(.35,.06,.25,c.dark,{y:-.59,rz:.12});
    for(const side of [-1,1])bar(P,[side*.15,.17,0],[side*.2,-.18,0],.035,.05,c.edge);
    jewel(P,c,0,-.45,.13,.065);
  } else if(aspect==='i') {
    // Deliberately asymmetric pair: stiletto in the lead hand, swept prism in the other.
    if(mirror>0) {
      plate(P,[[-.07,-.17],[.075,-.17],[.11,-.63],[0,-1.26],[-.075,-.63]],.07,c.edge);
      bar(P,[0,-.24,.045],[0,-1.05,.045],.017,.008,c.glow,{glow:1});
      bar(P,[-.2,-.15,0],[.2,-.15,0],.03,.03,c.shell);
    } else {
      plate(P,[[-.07,-.17],[.14,-.2],[.31,-.57],[.27,-.9],[.06,-1.12],[.13,-.73],[.015,-.46]],.065,c.edge);
      plate(P,[[.035,-.4],[.14,-.2],[.31,-.57],[.27,-.9],[.14,-.72]],.072,c.shell);
      spike(P,[-.04,-.19,0],[-.28,-.37,0],.045,c.edge);
    }
    jewel(P,c,0,-.21,.06,.09);
  } else {
    // A compact harvesting sickle with a backwards spur rather than a straight sword.
    bar(P,[0,-.16,0],[.05,-.72,0],.055,.04,c.shell);
    plate(P,[[.02,-.62],[.27,-.68],[.39,-.84],[.34,-1.05],[.13,-1.15],[.23,-.96],[.16,-.87],[-.02,-.85]],.09,c.edge,{sx:mirror});
    spike(P,[0,-.36,0],[-mirror*.26,-.2,0],.07,c.shell);
    P.add(new THREE.TorusGeometry(.115,.027,4,10),c.edge,{y:-.18});
    jewel(P,c,0,-.18,.03,.065);
  }
}

export function rangedBody(P,c,aspect) {
  // Grip and muzzle stay at the original rig's coordinates.
  P.box(.11,.25,.12,c.dark,{y:.02,z:-.13,rx:-.2});
  if(aspect==='p') {
    // Boiler-fed harpoon, with a pressure vessel behind the long cylindrical barrel.
    P.cyl(.15,.18,.43,7,c.shell,{y:.2,z:.045});
    P.cyl(.105,.13,.85,7,c.dark,{y:-.48,z:.08});
    for(const y of [-.15,-.48,-.79])P.cyl(.14,.14,.055,7,c.edge,{y,z:.08});
    P.cyl(.075,.075,.16,7,c.glow,{y:-.88,z:.08,glow:.6});
    for(const side of [-1,1]) {
      bar(P,[side*.12,.3,.08],[side*.23,-.16,.08],.035,.035,c.edge);
      bar(P,[side*.23,-.16,.08],[side*.14,-.47,.08],.035,.035,c.edge);
      spike(P,[side*.09,-.66,.08],[side*.27,-.92,.08],.07,c.shell);
    }
    P.cyl(.1,.1,.055,6,c.edge,{x:.19,y:.1,z:.11,rz:Math.PI/2});
    P.cyl(.065,.065,.06,6,c.light,{x:.22,y:.1,z:.11,rz:Math.PI/2,glow:.4});
    P.box(.17,.2,.19,c.dark,{y:.47,z:.035});
  } else if(aspect==='f') {
    // Low, massive siege crossbow: slab limbs and a flat stone stock.
    plate(P,[[-.16,.5],[.16,.5],[.17,-.73],[.1,-.96],[-.1,-.96],[-.17,-.73]],.2,c.dark);
    P.box(.3,.36,.24,c.shell,{y:.26});
    for(const side of [-1,1]) {
      plate(P,[[side*.1,-.48],[side*.43,-.43],[side*.67,-.66],[side*.62,-.83],[side*.3,-.65],[side*.1,-.67]],.19,c.shell);
      bar(P,[side*.62,-.78,.11],[0,-.24,.11],.009,.009,c.edge);
      P.box(.16,.08,.22,c.edge,{x:side*.48,y:-.65,rz:side*-.7});
    }
    for(const x of [-.065,.065])bar(P,[x,-.06,.14],[x,-.95,.14],.025,.025,c.edge);
    jewel(P,c,0,-.27,.17,.1);
  } else if(aspect==='i') {
    // Open fork rails frame the bolt; no conventional barrel or bow limbs.
    P.box(.16,.3,.14,c.shell,{y:.29});
    for(const side of [-1,1]) {
      plate(P,[[side*.06,.12],[side*.19,-.16],[side*.23,-.88],[side*.12,-.97],[side*.09,-.26]],.07,c.shell);
      bar(P,[side*.155,-.18,.045],[side*.17,-.91,.045],.018,.012,c.glow,{glow:.9});
      spike(P,[side*.16,-.32,.015],[side*.39,-.08,.015],.065,c.edge,{glow:.2});
    }
    bar(P,[0,.12,0],[0,-.95,.08],.027,.018,c.dark);
    for(let j=0;j<3;j++)jewel(P,c,0,-.13-j*.2,.15,.09-j*.01);
    P.box(.15,.06,.1,c.edge,{y:.48});
  } else {
    // Ribbed bird skeleton, feather feed, and an ocular drum magazine.
    bar(P,[0,.47,0],[0,-.95,.08],.05,.045,c.edge);
    plate(P,[[-.14,.48],[.07,.48],[.12,.26],[-.08,.08],[-.23,.14]],.12,c.shell);
    for(const side of [-1,1])for(let j=0;j<3;j++) {
      const y=-.26-j*.19;
      bar(P,[0,y+.1,.04],[side*(.25-j*.025),y,.06],.025,.035,c.edge);
      bar(P,[side*(.25-j*.025),y,.06],[side*.12,y-.12,.08],.035,.02,c.shell);
    }
    P.cyl(.17,.17,.18,8,c.shell,{x:.2,y:-.02,z:.13,rx:Math.PI/2});
    P.add(new THREE.TorusGeometry(.14,.025,4,12),c.edge,{x:.2,y:-.02,z:.23});
    P.sphere(.11,6,4,c.glow,{x:.2,y:-.02,z:.24,sz:.4,glow:.6});
    P.sphere(.045,5,3,c.dark,{x:.2,y:-.02,z:.285,sz:.3});
    for(let j=0;j<4;j++)spike(P,[-.08,.08-j*.075,.12],[-.4-j*.025,.28-j*.08,.16],.045,j%2?c.edge:c.shell);
    spike(P,[0,-.72,.08],[.13,-.94,.08],.09,c.edge);
  }
}

export function axeShaft(P,c,aspect) {
  bar(P,[0,.58,0],[0,-1.4,0],aspect==='f'?.06:.04,aspect==='f'?.065:.045,c.dark);
  P.box(.11,.1,.11,c.edge,{y:.55});
  if(aspect==='p') {
    for(const x of [-.075,.075])bar(P,[x,-.2,0],[x,-.84,0],.028,.028,c.edge);
    for(let j=0;j<3;j++)P.box(.2,.065,.13,c.shell,{y:-.36-j*.15});
  } else if(aspect==='f') {
    P.box(.17,.43,.15,c.shell,{y:-.56,rz:.07});
    P.box(.2,.065,.18,c.edge,{y:-.37});P.box(.2,.065,.18,c.edge,{y:-.74});
  } else if(aspect==='i') {
    for(const side of [-1,1])bar(P,[0,-.15,0],[side*.13,-.65,0],.02,.014,c.edge);
    jewel(P,c,0,-.42,0,.1);
  } else {
    for(let j=0;j<3;j++)spike(P,[0,-.32-j*.15,0],[.16,-.22-j*.15,-.02],.05,c.edge);
    P.add(new THREE.TorusGeometry(.1,.023,4,10),c.edge,{y:-.34});
  }
}

export function axeChunk(P,c,aspect,index) {
  const tip=index===2||index===5||index===7;
  if(aspect==='p') {
    plate(P,[[-.13,-.075],[.12,-.075],[.18,-.025],[.15,.08],[-.1,.08]],.1,c.shell);
    if(tip)plate(P,[[.08,-.05],[.25,-.12],[.2,.065],[.12,.12]],.11,c.edge);
    else P.box(.055,.2,.12,c.edge,{x:.1,y:.01,rz:-.2});
    P.box(.1,.025,.115,c.glow,{x:-.02,glow:.65});
  } else if(aspect==='f') {
    plate(P,[[-.18,-.08],[.15,-.08],[.2,.04],[.08,.09],[-.17,.07]],.18,c.shell);
    P.box(.13,.14,.19,c.dark,{x:-.09});
    if(tip)plate(P,[[.12,-.08],[.27,-.065],[.24,.055],[.15,.08]],.1,c.edge);
    P.box(.27,.018,.185,c.glow,{y:-.04,glow:.4});
  } else if(aspect==='i') {
    plate(P,[[-.17,-.045],[-.03,-.075],[.25,tip?.12:.045],[.06,.03],[-.16,.065]],.045,c.edge);
    plate(P,[[-.14,-.035],[.04,-.02],[.21,-.12],[.01,-.065]],.055,c.shell);
    bar(P,[-.13,0,.03],[.13,.01,.03],.012,.009,c.glow,{glow:.9});
  } else {
    plate(P,[[.12,-.065],[-.08,-.075],[-.25,-.02],[-.29,.13],[-.16,.065],[.1,.06]],.075,c.edge);
    P.box(.13,.09,.1,c.shell,{x:.06});
    if(tip)spike(P,[.05,.04,0],[.17,.16,0],.045,c.shell);
    P.box(.025,.04,.09,c.glow,{x:-.11,y:.025,glow:.7});
  }
}
