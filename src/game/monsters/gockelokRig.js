import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lambert, basic } from '../../render/ps1.js';

export function buildGockelok({ scale = 2.2 } = {}) {
  const root = new THREE.Group(), g = new THREE.Group(); root.add(g); g.scale.setScalar(scale);
  const nodes = { root: g }, partMeshes = {};
  const joint = (name, parent, x, y, z) => { const n = new THREE.Group(); n.position.set(x, y, z); parent.add(n); return (nodes[name] = n); };
  const box = (a, size, pos, rz = 0, rx = 0) => { const v = new THREE.BoxGeometry(...size); v.rotateZ(rz); v.rotateX(rx); v.translate(...pos); a.push(v); };
  const part = (name, parent, color, fn, unlit = false) => { const a = []; fn(a); const mesh = new THREE.Mesh(mergeGeometries(a.map(v => { const g=v.index?v.toNonIndexed():v; g.deleteAttribute('uv'); return g; })), (unlit ? basic : lambert)({ color })); a.forEach((v) => v.dispose()); parent.add(mesh); (partMeshes[name] ??= []).push(mesh); return mesh; };
  const oval = (a,size,pos) => { const v=new THREE.IcosahedronGeometry(1,1); v.scale(...size); v.translate(...pos); a.push(v.toNonIndexed ? (v.index ? v.toNonIndexed() : v) : v); };
  const feather=(a,x,y,z,len,angle=0)=>{const v=new THREE.ConeGeometry(.12,len,3,1);v.rotateX(-.25);v.rotateZ(angle);v.translate(x,y,z);a.push(v);};
  const body = joint('body', g, 0, 1.35, 0);
  part('body', body, '#343d41', (a) => { oval(a, [.68,.7,.85], [0,.1,.1]); oval(a,[.55,.55,.5],[0,.3,.6]); oval(a,[.46,.4,.55],[0,-.12,-.6]); for(let row=0;row<4;row++)for(let j=-2;j<=2;j++)feather(a,j*.19,.5-row*.22,.75-Math.abs(j)*.09,.35,j*.1); });
  const neck = joint('neck', body, 0, .5, .55);
  part('body', neck, '#9d7440', (a) => { oval(a,[.32,.65,.33],[0,.4,0]); for(let row=0;row<3;row++)for(let j=0;j<7;j++){const a0=j*Math.PI*2/7;feather(a,Math.sin(a0)*.3,row*.24,Math.cos(a0)*.3,.42,Math.sin(a0)*.3);} });
  const head = joint('head', neck, 0, .92, .15);
  part('head', head, '#86704d', (a) => { oval(a,[.34,.3,.42],[0,0,.18]); });
  part('head', head, '#e2b32e', (a) => { box(a,[.29,.18,.5],[0,-.08,.65],0,-.12); box(a,[.16,.23,.2],[0,-.16,.88],0,-.35); });
  part('head', head, '#d17f29', (a) => { for (const s of [-1, 1]) box(a, [.09, .10, .22], [s * .32, .1, .27]); }, true);
  part('head', head, '#131722', (a) => { for (const s of [-1, 1]) box(a, [.1, .09, .08], [s * .35, .1, .36]); }, true);
  const comb = joint('comb', head, 0, .24, 0);
  part('comb', comb, '#872e36', (a) => { box(a, [.17, .24, .7], [0, .05, 0]); for (let i = 0; i < 4; i++) box(a, [.19, .3 + i * .045, .17], [0, .24 + i * .025, -.28 + i * .19], -.13 * (i - 1)); });
  const wattle = joint('wattle', head, 0, -.3, .35);
  part('head', wattle, '#702636', (a) => { box(a, [.18, .55, .18], [-.12, -.2, .05], -.15); box(a, [.18, .47, .18], [.12, -.18, .05], .15); });
  for (const [name, s] of [['wingL', 1], ['wingR', -1]]) {
    const wing = joint(name, body, s * .55, .35, -.1);
    part('wing', wing, '#344a50', (a) => { box(a, [.25, .6, .85], [s * .1, -.25, -.1], s * -.1); for (let i = 0; i < 5; i++) box(a, [.15, .24, .8 + i * .07], [s * .15, -.35 - i * .07, -.3 - i * .12], s * .12, .2); });
  }
  for (const [name, s] of [['legL', 1], ['legR', -1]]) {
    const leg = joint(name, body, s * .38, -.45, .05);
    part('legs', leg, '#93815a', (a) => { oval(a,[.26,.4,.29],[0,-.15,-.04]); box(a, [.17, .65, .17], [0, -.36, 0], 0, -.15); box(a, [.18, .45, .18], [0, -.7, .05], 0, .2); for (let i = -1; i <= 1; i++) { box(a, [.1,.11,.55],[i*.16,-.85,.24],i*.12,0); box(a,[.07,.10,.23],[i*.18,-.87,.59],0,.25); } box(a,[.10,.1,.35],[0,-.84,-.21]); });
    const spur = joint(name === 'legL' ? 'spurL' : 'spurR', leg, 0, -.45, -.1);
    part('spur', spur, '#f1efcf', (a) => box(a, [.17, .15, .7], [0, 0, -.27], 0, -.25));
  }
  const tail = joint('tail', body, 0, .25, -.65);
  part('tail', tail, '#365d67', (a) => { for (let i = -2; i <= 2; i++) { box(a, [.2, 1.1 - Math.abs(i) * .15, .25], [i * .19, .35, -.45 - Math.abs(i) * .08], i * -.2, -.55); box(a, [.21, .25, .7], [i * .18, .78, -.9], i * -.2, -.3); } });
  const bug = joint('bug',body,0,0,0);
  part('body',bug,'#596b75',a=>{
    for(const side of [-1,1])for(let row=0;row<2;row++){
      box(a,[1.4,.18,.22],[side*.95,.15,-.45+row*.8],side*.5);
      box(a,[.18,1.2,.18],[side*1.55,-.5,-.45+row*.8],side*-.25);
      feather(a,side*1.65,-1.08,-.25+row*.8,.45,side*.4);
    }
    for(let i=0;i<4;i++)box(a,[1.25,.09,.1],[0,.6-i*.23,.84],i%2?.12:-.12);
  });
  const seam = joint('seam',g,1.35,.7,.4);
  const seamMesh=part('seam',seam,'#75f4e8',a=>{box(a,[.16,.7,.16],[0,0,0],.35);box(a,[.45,.08,.12],[-.25,.1,0]);},true);
  const origin=joint('origin',body,0,.2,.35);
  const core=part('body',origin,'#75e6db',a=>oval(a,[.43,.5,.4],[0,0,0]),true);
  core.visible=false;
  const extra={scale,comb,spurL:nodes.spurL,spurR:nodes.spurR,form:'rooster',phase:0,time:0,seamOpen:false,wingBroken:false};
  return { root, nodes, partMeshes, extra, apply(p) {
    const r = Math.PI / 180; body.position.y = 1.35 + p.bodyY / scale; body.rotation.set(p.bodyPitch * r, 0, p.bodyRoll * r);
    // A tall rooster must actually bring its beak to the ground when pecking.
    // Compress the neck and lean forward: comb/head hurtboxes follow these joints,
    // giving every melee weapon a real opening after the sprint stumble as well.
    const peck = Math.min(1, Math.max(0, p.neck / .6)) * Math.min(1, Math.max(0, p.head / 30));
    const stumble = Math.min(1, Math.max(0, (p.bodyPitch - 25) / 15)) * Math.min(1, Math.max(0, p.head / 25));
    const lower = Math.max(peck, stumble * .68);
    neck.position.set(0, .5 - lower * .9, .55 + lower * .5);
    head.position.set(0, .92 - lower * .55, .15 + lower * .35);
    neck.rotation.x = p.neck; neck.scale.set(1 + p.spread * .4, 1 + p.spread * .12, 1 + p.spread * .4); head.rotation.set(p.head * r, p.headYaw * r, 0);
    comb.rotation.z = p.headYaw * r * .8 + p.bodyRoll * r * .6; wattle.rotation.x = -p.head * r * .5;
    nodes.wingL.rotation.z = -.2 + (p.wing + (p.wingL || 0)) * r; nodes.wingR.rotation.z = .2 - p.wing * r;
    nodes.legL.rotation.x = -p.legL * r; nodes.legR.rotation.x = -p.legR * r; tail.rotation.set(p.tailPitch * r, p.tailYaw * r, 0);
    seamMesh.visible=extra.seamOpen;
    const trueForm=extra.form==='eye';core.visible=trueForm;bug.visible=trueForm;
    const t=extra.time;
    // Detached anatomy remains solid and readable; the original rooster is still recognizable.
    body.scale.set(trueForm?1.22:1,trueForm ? .86 : 1,trueForm?1.25:1);
    nodes.wingL.position.x=.55+(trueForm ? .55 : 0);nodes.wingR.position.x=-.55-(trueForm ? .55 : 0);
    if(trueForm){bug.rotation.y=Math.sin(t*.8)*.12;neck.position.x=Math.sin(t*1.5)*.18;head.position.y+=.3;nodes.wingL.rotation.y=.35;nodes.wingR.rotation.y=-.35;tail.rotation.z=Math.sin(t)*.2;}
    else {neck.position.x=0;nodes.wingL.rotation.y=0;nodes.wingR.rotation.y=0;tail.rotation.z=0;}
    comb.rotation.z+=Math.sin(t*7)*.035;wattle.rotation.z=Math.sin(t*5)*.06;
    if(extra.wingBroken)nodes.wingL.rotation.z+=.35;
  } };
}
