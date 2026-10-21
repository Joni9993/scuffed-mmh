import * as THREE from 'three';
import { GearParts, gearMaterial, bar, spike } from '../../render/gearfx.js';

export const FINALE_PALETTES = {
  p: { dark:'#261c1e', shell:'#862f24', edge:'#e6ad66', glow:'#ff5e24', light:'#ffda81' },
  f: { dark:'#23242a', shell:'#62616c', edge:'#b7ad99', glow:'#e58e32', light:'#ffcb6d' },
  i: { dark:'#1e2344', shell:'#6478b0', edge:'#c5f3ff', glow:'#69e7ff', light:'#fa8df5' },
  u: { dark:'#252139', shell:'#55506f', edge:'#dfbc6c', glow:'#91ffe1', light:'#e678d6' },
};
const G = (P) => {P.geos=P.geos.map(g=>{if(!g.index)return g;const plain=g.toNonIndexed();g.dispose();return plain;});const g=P.merge();for(const p of P.geos)p.dispose();return g;};
const ring = (P,x,y,z,r,col,glow=.65) => P.add(new THREE.TorusGeometry(r,.027,4,12),col,{x,y,z,glow});

/** Boss anatomy, built into each weapon's load-bearing silhouette. */
function anatomy(P,aspect,x,y,z,s=1) {
  const c=FINALE_PALETTES[aspect];
  if(aspect==='p') {
    P.cyl(.13*s,.16*s,.38*s,6,c.dark,{x,y,z,rx:Math.PI/2});
    ring(P,x,y,z+.2*s,.13*s,c.edge);
    P.sphere(.105*s,6,4,c.glow,{x,y,z:z+.21*s,glow:1});
    for(const side of [-1,1]) {
      bar(P,[x+side*.11*s,y+.03*s,z],[x+side*.26*s,y+.25*s,z],.055*s,.065*s,c.shell);
      P.cyl(.075*s,.075*s,.05*s,6,c.edge,{x:x+side*.26*s,y:y+.26*s,z});
      P.cyl(.05*s,.05*s,.055*s,6,c.dark,{x:x+side*.26*s,y:y+.29*s,z});
      for(let j=0;j<3;j++)P.box(.08*s,.035*s,.02*s,c.light,{x:x+side*.16*s,y:y-.1*s+j*.07*s,z:z+.16*s,glow:.75});
    }
  } else if(aspect==='f') {
    for(const side of [-1,1])for(let j=0;j<3;j++)P.box((.15+j*.03)*s,.17*s,.15*s,c.shell,{x:x+side*(.13+j*.06)*s,y:y+(.16-j*.15)*s,z:z+.02*s,rz:side*(.12+j*.07)});
    P.add(new THREE.OctahedronGeometry(.17*s,0),c.glow,{x,y,z:z+.14*s,glow:.85,rz:.3});
    for(const side of [-1,1])bar(P,[x,y-.04*s,z+.15*s],[x+side*.27*s,y-.23*s,z+.13*s],.02*s,.012*s,c.light,{glow:.9});
  } else if(aspect==='i') {
    P.add(new THREE.OctahedronGeometry(.14*s,0),c.light,{x,y,z:z+.13*s,sy:1.5,glow:.9});
    for(const side of [-1,1])for(let j=0;j<3;j++)spike(P,[x+side*.09*s,y+(.08-j*.12)*s,z],[x+side*(.3+j*.055)*s,y+(.35-j*.19)*s,z-.03*s],.07*s,j%2?c.shell:c.edge,{glow:j===1?.5:.15});
    bar(P,[x-.13*s,y-.27*s,z+.03*s],[x+.13*s,y+.27*s,z+.03*s],.015*s,.015*s,c.glow,{glow:1});
  } else {
    ring(P,x,y,z+.13*s,.16*s,c.edge,.7);
    P.sphere(.12*s,6,4,c.glow,{x,y,z:z+.14*s,sz:.4,glow:.7});
    P.sphere(.065*s,6,4,c.dark,{x,y,z:z+.21*s,sz:.25});
    for(const side of [-1,1])for(let j=0;j<3;j++) {
      spike(P,[x+side*.11*s,y+(.12-j*.12)*s,z],[x+side*(.33+j*.04)*s,y+(.26-j*.15)*s,z-.05*s],.055*s,j%2?c.edge:c.shell);
      P.box(.045*s,.045*s,.045*s,c.light,{x:x+side*(.35+j*.05)*s,y:y+(.28-j*.15)*s,z,glow:.8});
    }
  }
}

function blade(P,type,aspect,mirror) {
  const c=FINALE_PALETTES[aspect],dual=type==='db',k=dual?.64:1,L=dual?.95:1.75;
  bar(P,[0,.33,0],[0,-.26,0],.055*k,.065*k,c.dark);
  P.box(.31*k,.075,.12*k,c.edge,{y:-.16});
  if(aspect==='p') {
    P.box(.28*k,L,.15*k,c.dark,{y:-.2-L/2});
    for(let j=0;j<5;j++) {
      const y=-.38-j*L/5;
      P.box((.28+j*.025)*k,L/5*.88,.18*k,c.shell,{x:(j%2?.015:-.015)*k,y});
      spike(P,[.14*k,y+.03,0],[.3*k,y-.19,0],.07*k,c.edge);
      P.box(.045*k,L/5*.75,.185*k,c.glow,{x:-.05*k,y,glow:.8});
    }
    anatomy(P,aspect,-.08*k,-.4,0,k*1.1);
  } else if(aspect==='f') {
    for(let j=0;j<5;j++) {
      const y=-.38-j*L/5;
      P.box((.47-(j===4?.17:0))*k,L/5*.91,.23*k,j%2?c.shell:c.dark,{x:j%2?.03*k:-.025*k,y,rz:(j%2?1:-1)*.035});
      P.box(.38*k,.025,.235*k,c.glow,{y:y+L/10,glow:.7});
    }
    anatomy(P,aspect,0,-.5,.04*k,k*.9);
  } else if(aspect==='i') {
    for(const side of [-1,1]) {
      bar(P,[side*.06*k,-.25,0],[side*.16*k,-L*.8,0],.07*k,.035*k,c.shell);
      spike(P,[side*.16*k,-L*.75,0],[side*.06*k,-L-.24,0],.085*k,c.edge,{glow:.35});
      bar(P,[side*.05*k,-.3,.045*k],[side*.13*k,-L*.82,.045*k],.018*k,.012*k,c.glow,{glow:1});
    }
    anatomy(P,aspect,0,-.35,0,k*.8);
  } else {
    bar(P,[0,-.18,0],[0,-L-.13,0],.09*k,.045*k,c.dark);
    for(let j=0;j<5;j++) {
      const y=-.38-j*L/5,side=mirror;
      spike(P,[0,y+.05,0],[side*(.35-j*.025)*k,y-.25,0],.11*k,j%2?c.edge:c.shell);
      P.box(.045*k,.09,.1*k,c.glow,{x:-side*.07*k,y,z:.055*k,glow:.9});
    }
    anatomy(P,aspect,0,-.48,.03*k,k*.9);
  }
}

/** Complete physical body: animated strings, muzzle sockets, samplers and morph roots stay in their existing rigs. */
export function finaleBody(type,aspect,mirror=1) {
  const P=new GearParts(),c=FINALE_PALETTES[aspect];
  if(type==='gs'||type==='db'){blade(P,type,aspect,mirror);return G(P);}
  if(type==='bow') {
    for(const side of [-1,1])for(let j=0;j<5;j++) {
      const a=j/5,b=(j+1)/5;
      bar(P,[0,side*.78*a,.3*(1-a*a)],[0,side*.78*b,.3*(1-b*b)],aspect==='f'?.075:.045,aspect==='f'?.065:.035,j%2?c.edge:c.shell);
      if(j>0) {
        const y=side*.78*a,z=.3*(1-a*a);
        if(aspect==='f')P.box(.23,.13,.13,c.shell,{y,z,rz:side*.2});
        else spike(P,[0,y,z],[mirror*(aspect==='i'?.25:.16),y+side*.16,z+.07],.055,c.edge,{glow:aspect==='i'?.4:.1});
      }
    }
    anatomy(P,aspect,.04,0,.3,.7);return G(P);
  }
  if(type==='lb') {
    bar(P,[0,.48,0],[0,-.95,0],.075,.06,c.dark);
    P.box(.14,.26,.16,c.shell,{y:.35});P.box(.11,.22,.1,c.dark,{y:.02,z:-.12,rx:-.2});
    for(const side of [-1,1])bar(P,[0,-.6,0],[side*.55,-.78,0],.05,.025,c.edge);
    for(const side of [-1,1])bar(P,[side*.55,-.78,0],[0,-.35,0],.009,.009,c.light);
    for(let j=0;j<4;j++)P.box(.2+(aspect==='f'?.08:0),.1,.15,c.shell,{y:-.3-j*.15,z:.1,rz:aspect==='i'?(j%2?-.15:.15):0});
    anatomy(P,aspect,0,-.4,.18,.7);
    for(const side of [-1,1])bar(P,[side*.09,-.5,0],[side*.13,-.94,0],.035,.045,c.glow,{glow:.65});
    return G(P);
  }
  if(type==='kk') {
    bar(P,[0,.54,0],[0,-1.1,0],.05,.055,c.edge);
    P.box(.6,.55,.3,c.dark,{y:-1.17});
    for(const side of [-1,1])P.box(.14,.65,.38,c.shell,{x:side*.34,y:-1.17,rz:side*.12});
    anatomy(P,aspect,0,-1.16,.22,1.05);
    return G(P);
  }
  if(type==='kt') {
    // Blade-only overlay lives under the sheathing pivot; the existing grip and scabbard still animate.
    for(let j=0;j<6;j++) {
      const y=-.3-j*.22,z=-j*j*.004;
      P.box(aspect==='f'?.17:.09,.205,.075,c.shell,{y,z});
      P.box(.023,.18,.08,c.glow,{x:.047,y,z,glow:.75});
      if(j%2===0)spike(P,[-.04,y, z],[-(aspect==='i'?.17:.12),y-.18,z],.045,c.edge,{glow:aspect==='i'?.4:0});
      if(aspect==='p')P.cyl(.026,.033,.12,5,c.edge,{x:-.08,y:y+.025,z,rz:.55});
      if(aspect==='u')P.box(.035,.065,.045,c.light,{x:-.11-(j%2)*.04,y:y+.045,z:z+.025,rz:.3,glow:.85});
    }
    return G(P);
  }
  // Axe shaft, its eight physical chunks receive a separate anatomy-matched form.
  bar(P,[0,.58,0],[0,-1.4,0],.045,.05,c.dark);P.box(.11,.1,.11,c.edge,{y:.55});
  anatomy(P,aspect,0,-.56,.03,.55);return G(P);
}

export function finaleAxeBlock(aspect,index) {
  const P=new GearParts(),c=FINALE_PALETTES[aspect];
  P.box(aspect==='f'?.26:.21,.15,aspect==='f'?.14:.1,c.shell);
  P.box(.21,.025,.11,c.glow,{y:.06,glow:.7});
  if(aspect==='p') {P.cyl(.035,.035,.08,5,c.edge,{x:index%2?.07:-.07,y:.11});P.cyl(.022,.022,.085,5,c.dark,{x:index%2?.07:-.07,y:.115});}
  else if(aspect==='f') {P.box(.17,.04,.16,c.dark,{y:-.06,rz:index%2?.1:-.1});}
  else if(aspect==='i') {spike(P,[.04,0,-.03],[.13,.13,-.06],.055,c.edge,{glow:.4});}
  else {spike(P,[.04,0,-.03],[.14,.11,-.03],.055,c.edge);P.box(.035,.035,.035,c.light,{x:-.08,y:.11,glow:.9});}
  return G(P);
}
export function finaleCrest(type,aspect) {
  const P=new GearParts();anatomy(P,aspect,0,0,0,type==='kt'?.5:.7);return G(P);
}
export function finaleMaterial(aspect) {const m=gearMaterial(.8);m.userData.ps1.uJit.value=aspect==='u'?.032:.012;return m;}
