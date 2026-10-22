import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lambert, basic } from '../../render/ps1.js';
import { createRoosterFx } from './gockelokRoosterFx.js';

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
    part('legs', leg, '#dfd5ac', a => {
      for (let j = -1; j <= 1; j++) {
        const claw = new THREE.ConeGeometry(.055, .42, 4);
        claw.rotateX(Math.PI / 2 + .3); claw.rotateY(j * .18);
        claw.translate(j * .2, -.89, .83); a.push(claw);
      }
    });
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
  const roosterMeshes=Object.entries(partMeshes).filter(([k])=>k!=='seam').flatMap(([,v])=>v);
  const rest=[body,neck,head,nodes.wingL,nodes.wingR,nodes.legL,nodes.legR,tail,seam].map(n=>[n,n.position.clone()]);
  const eye=buildEye();root.add(eye.group);
  partMeshes.body.push(eye.sclera); // hit flash / damage wobble also reads on the eye
  const crowCharge=new THREE.Mesh(new THREE.TorusGeometry(.48,.055,4,28),new THREE.MeshBasicMaterial({color:0xffbd64,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
  crowCharge.name='Kraehenschnitt-Ladung';crowCharge.position.set(0,-.03,.95);head.add(crowCharge);crowCharge.visible=false;
  const extra={scale,comb,spurL:nodes.spurL,spurR:nodes.spurR,form:'rooster',phase:0,time:0,seamOpen:false,wingBroken:false};
  const roosterFx = createRoosterFx(root);
  return { root, nodes, partMeshes, extra, apply(p) {
    const trueForm=extra.form==='eye';
    // Restore authored offsets before applying motion. Eye hurtbox remapping must never cancel a crouch or a wing bank.
    if(!trueForm){
      for(const [n,v] of rest)n.position.copy(v);
      body.scale.set(1,1,1);nodes.wingL.rotation.y=nodes.wingR.rotation.y=0;
      seam.rotation.set(0,0,0);seam.scale.setScalar(1);
    }
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
    core.visible=false;bug.visible=false;
    const t=extra.time;
    roosterFx.update(extra);
    // True form: the rooster is gone entirely; only the Eye of the Glitch remains.
    for(const mesh of roosterMeshes)mesh.visible=!trueForm;
    eye.group.visible=trueForm;
    if(trueForm){
      crowCharge.visible=false;
      eye.update(extra);
      // Hurt spheres (fixed in gockelok.js, attached to rig nodes) are moved onto the eye:
      // belly/lower shell stays within melee reach, the head (stun part) rides the pupil.
      const ey=eye.height,R=EYE_R,bw=_w.set(0,ey-R*.72,R*.3);
      body.position.copy(bw).divideScalar(scale);body.rotation.set(0,0,0);body.scale.set(1,1,1);
      neck.position.set(0,0,0);neck.rotation.set(0,0,0);neck.scale.set(1,1,1);
      head.position.copy(eye.pupilDir).multiplyScalar(R*.86).add(_w2.set(0,ey,0)).sub(bw).divideScalar(scale);head.rotation.set(0,0,0);
      for(const [n,sx] of [[nodes.wingL,1],[nodes.wingR,-1]]){n.position.set(sx*R*.78,ey-R*.62,-.2).sub(bw).divideScalar(scale);n.rotation.set(0,0,0);}
      for(const [n,sx] of [[nodes.legL,1],[nodes.legR,-1]]){n.position.set(sx*1.3,1.5,.4).sub(bw).divideScalar(scale);n.rotation.set(0,0,0);}
      tail.position.set(0,ey-R*.5,-R*.78).sub(bw).divideScalar(scale);tail.rotation.set(0,0,0);
      seam.position.set(R*.62,ey-R*.55,R*.6).divideScalar(scale);seam.rotation.set(0,.6,.35);seam.scale.setScalar(1.6);
    } else {
      const attackCue=eyeAttackCue(extra.attackInst,extra.attackTime??0),charge=attackCue.charge;
      const crow=/kraehen|kikeriki/.test(extra.attackId??'');
      crowCharge.visible=crow&&(charge>0||attackCue.release>0);
      crowCharge.scale.setScalar(Math.max(.12,1.6-charge*1.35));crowCharge.material.opacity=.3+charge*.65;
      crowCharge.material.color.set(attackCue.release?'#fff5d9':'#ffbd64');
      // Intent is bodily: plant the feet and inflate the throat before the crow; bank into a sidestep.
      if(crow&&charge>0){neck.scale.x*=1+charge*.3;neck.scale.z*=1+charge*.25;tail.rotation.x-=charge*.2;}
      if(extra.attackId==='gockelok_flankenwechsel'){body.rotation.z+=(extra.attackInst?.side??1)*Math.sin(Math.min(1,(extra.attackTau??0)/1.2)*Math.PI)*.2;}
      if(extra.attackId==='gockelok_hahnenwirbel')tail.rotation.y+=Math.sin((extra.attackTau??0)*Math.PI)*.45;
      const id = extra.attackId ?? '', tau = extra.attackTau ?? 0;
      if(id==='gockelok_krallensprung') {
        const k = Math.max(0, Math.min(1, (tau - .42) / .56));
        const flight = Math.sin(k * Math.PI);
        nodes.legL.rotation.z = .10 + flight * .18;
        nodes.legR.rotation.z = -.10 - flight * .18;
        tail.rotation.x -= flight * .35;
        nodes.wingL.rotation.y = -flight * .40; nodes.wingR.rotation.y = flight * .40;
      } else {
        nodes.legL.rotation.z = nodes.legR.rotation.z = 0;
      }
      if(id==='gockelok_federhagel') {
        // Broad shoulder recoil on each real release, not a static glowing bird.
        const beats = extra.attackInst?.def.hits ?? [];
        let recoil = 0;
        for(const h of beats) if(tau>=h.t0 && tau<h.t0+.18) recoil=Math.max(recoil,1-(tau-h.t0)/.18);
        body.rotation.x -= recoil * .16; tail.rotation.x += recoil * .25;
      }

    }
    comb.rotation.z+=Math.sin(t*7)*.035;wattle.rotation.z=Math.sin(t*5)*.06;
    if(extra.wingBroken)nodes.wingL.rotation.z+=.35;
  } };
}

// ---------------------------------------------------------------------------
// "Auge des Glitch": the true form. A single giant floating eyeball (world units,
// child of the monster root, unaffected by the rooster's 2.2 scale). Geometries
// and materials are module-shared and built once (one Gockelok at a time); every
// animated crowd (plates, shards, drips, pixels) is an InstancedMesh.
const EYE_R = 4.4, EYE_H = 5.6, IRIS = .5;
const _w = new THREE.Vector3(), _w2 = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _e = new THREE.Euler();
const _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color(), Z = new THREE.Vector3(0, 0, 1);
const camPos = new THREE.Vector3(); let camSeen = false;
let SH = null;

function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function colorize(g, fn) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i); fn(_v, _c); _c.toArray(c, i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
// Spherical cap around +Z (iris, pupil, glow layers sit on the eyeball surface).
function cap(r, theta, ws, hs, fn, t0 = 0) {
  const g = new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, t0, theta - t0); g.rotateX(Math.PI / 2); g.deleteAttribute('uv');
  return fn ? colorize(g, (v, c) => fn(Math.acos(Math.min(1, v.z / r)) / theta, c)) : g;
}
const ramp = (stops) => (a, c) => { for (let i = 1; i < stops.length; i++) if (a <= stops[i][0] || i === stops.length - 1) { const [a0, c0] = stops[i - 1], [a1, c1] = stops[i]; c.set(c0).lerp(_c2.set(c1), Math.min(1, Math.max(0, (a - a0) / (a1 - a0)))); return; } };
const _c2 = new THREE.Color();
// Random walks over the sphere, pulled toward +Z (veins converge on the iris).
function surfaceLines(seed, n, steps, len, pull, r, jag) {
  const rnd = rng(seed), pts = [], p = new THREE.Vector3(), d = new THREE.Vector3(), t = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    const th = .75 + rnd() * 1.6, ph = rnd() * Math.PI * 2;
    p.set(Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th));
    d.set(rnd() - .5, rnd() - .5, rnd() - .5);
    for (let i = 0; i < steps; i++) {
      t.copy(Z).addScaledVector(p, -p.z).multiplyScalar(pull).add(d.set(d.x + (rnd() - .5) * jag, d.y + (rnd() - .5) * jag, d.z + (rnd() - .5) * jag));
      t.addScaledVector(p, -t.dot(p)).normalize();
      pts.push(p.x * r, p.y * r, p.z * r); p.addScaledVector(t, len * (.6 + rnd() * .8)).normalize(); pts.push(p.x * r, p.y * r, p.z * r);
      if (p.z > Math.cos(IRIS + .05)) break;
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return g;
}
function shared() {
  if (SH) return SH;
  const R = EYE_R, add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  const iris = ramp([[0, '#f2fffd'], [.28, '#9ff6f0'], [.5, '#67e9e2'], [.78, '#8d75a4'], [.92, '#4a2a6e'], [1, '#12081c']]);
  // radial striations of the iris
  const st = [], rnd = rng(7);
  for (let i = 0; i < 46; i++) { const ph = i / 46 * Math.PI * 2 + rnd() * .05, a0 = .2 + rnd() * .05, a1 = .36 + rnd() * .12; for (const a of [a0, a1]) st.push(Math.sin(a) * Math.cos(ph) * R * 1.016, Math.sin(a) * Math.sin(ph) * R * 1.016, Math.cos(a) * R * 1.016); }
  const stripes = new THREE.BufferGeometry(); stripes.setAttribute('position', new THREE.Float32BufferAttribute(st, 3));
  const tick = new THREE.BoxGeometry(.12, .7, .12); tick.translate(0, R * .74, 0);
  SH = {
    geo: {
      sclera: colorize(new THREE.IcosahedronGeometry(R, 3), (v, c) => c.set('#dfe9ea').lerp(_c2.set('#3b2a52'), Math.min(1, Math.max(0, (.15 - v.z / R) / 1.05)))),
      iris: cap(R * 1.012, IRIS, 32, 6, iris),
      pupil: cap(R * 1.032, .21, 24, 2),
      glow: cap(R * 1.04, .78, 32, 3, ramp([[0, '#000000'], [.62, '#000000'], [.66, '#67e9e2'], [1, '#000000']]), .2),
      split: cap(R * 1.05, IRIS, 24, 3, null, .2),
      glint: cap(R * 1.045, .05, 8, 1),
      stripes, veins: surfaceLines(11, 26, 9, .09, .9, R * 1.004, .9), cracks: surfaceLines(23, 12, 7, .14, .3, R * 1.007, 2.2),
      plate: new THREE.BoxGeometry(1, 1, 1), shard: new THREE.TetrahedronGeometry(.42), drip: new THREE.OctahedronGeometry(1, 0), pixel: new THREE.BoxGeometry(.22, .22, .22),
      reticle: new THREE.TorusGeometry(R * .74, .06, 3, 48), tick,
      ringA: new THREE.TorusGeometry(R * 1.55, .08, 3, 80), ringB: new THREE.TorusGeometry(R * 1.32, .13, 3, 72), arc: new THREE.TorusGeometry(R * 2.05, .16, 3, 20, Math.PI * .55),
      floor: new THREE.CircleGeometry(R * 1.35, 32).rotateX(-Math.PI / 2), floorRing: new THREE.RingGeometry(R * 1.5, R * 1.62, 40).rotateX(-Math.PI / 2),
    },
    mat: {
      sclera: lambert({ vertexColors: true }),
      iris: basic({ vertexColors: true }), pupil: basic({ color: '#020206' }), glint: basic({ color: '#ffffff' }),
      glow: basic({ color: '#67e9e2', opacity: .3, vertexColors: true, ...add }),
      splitM: basic({ color: '#ff2fd6', opacity: 0, ...add }), splitC: basic({ color: '#2ff4ff', opacity: 0, ...add }),
      ghost: basic({ color: '#b84cff', opacity: 0, wireframe: true, ...add }),
      stripes: new THREE.LineBasicMaterial({ color: '#174a5c', transparent: true, opacity: .8 }),
      veins: new THREE.LineBasicMaterial({ color: '#c0307f', transparent: true, opacity: .5 }),
      cracks: new THREE.LineBasicMaterial({ color: '#6ee5df', transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false }),
      plate: lambert({ color: '#ffffff', flatShading: true }), glowInst: basic({ color: '#ffffff' }),
      cyan: basic({ color: '#6ee5df' }), magenta: basic({ color: '#b06cff', opacity: .85, ...add }), purple: basic({ color: '#8d75a4' }),
      floor: basic({ color: '#67e9e2', opacity: .14, ...add }), floorRing: basic({ color: '#c04ce8', opacity: .35, ...add, side: THREE.DoubleSide }),
    },
  };
  return SH;
}

// The same authoritative attack clock drives charge, aim lock and the released beam.
export function eyeAttackCue(inst, time = 0) {
  if (!inst) return { charge: 0, release: 0, kind: null, hit: null, sample: null };
  const tau = inst.tau(time), hits = inst.def.hits ?? [];
  const hit = hits.find(h => h.t1 >= tau);
  if (!hit) return { charge: 0, release: 0, kind: inst.def.tell?.kind, hit: null, sample: null };
  const previous = hits.filter(h => h.t1 < hit.t0).reduce((end,h) => Math.max(end,h.t1), 0);
  const start = Math.max(inst.wall(previous), inst.wall(hit.t0) - 1.8);
  const impact = inst.wall(hit.t0), end = inst.wall(hit.t1);
  const charging = time < impact;
  return { kind: inst.def.tell?.kind ?? 'burst', hit,
    charge: charging ? Math.max(0, Math.min(1, (time - start) / Math.max(.1, impact - start))) : 0,
    release: charging ? 0 : Math.max(0, 1 - Math.max(0,time-end) / .2),
    impactIn: Math.max(0, impact - time),
    sample: inst.sample(charging ? impact : time),
  };
}

function buildEye() {
  const { geo, mat } = shared(), R = EYE_R;
  const group = new THREE.Group(); group.name = 'Auge des Glitch'; group.visible = false;
  const eye = new THREE.Group(); eye.position.y = EYE_H; group.add(eye);           // hover anchor (glitch offsets)
  const ball = new THREE.Group(); eye.add(ball);                                     // rotates as a whole toward the target
  const mesh = (g, m, parent, ro = 0) => { const o = new THREE.Mesh(g, m); o.renderOrder = ro; parent.add(o); return o; };
  const sclera = mesh(geo.sclera, mat.sclera, ball);
  sclera.onBeforeRender = (r, s, cam) => { camPos.setFromMatrixPosition(cam.matrixWorld); camSeen = true; };
  mesh(geo.iris, mat.iris, ball); ball.add(new THREE.LineSegments(geo.stripes, mat.stripes));
  const pupil = mesh(geo.pupil, mat.pupil, ball);
  pupil.name = 'Augenpupille';
  const capacitor = new THREE.Group(); capacitor.name = 'Laserladung'; ball.add(capacitor);
  const chargeMat = new THREE.MeshBasicMaterial({color:0xffc26a,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
  const chargeRings = [0,1,2].map(i => {const o=mesh(new THREE.TorusGeometry(1,.055,4,40),chargeMat,capacitor,5);o.position.z=R+.4+i*.8;return o;});
  const chargeOrb = mesh(new THREE.IcosahedronGeometry(.42,1),chargeMat,capacitor,6);chargeOrb.position.z=R+.12;
  const aimLine = mesh(new THREE.CylinderGeometry(1,1,1,6),new THREE.MeshBasicMaterial({color:0xffc26a,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}),group,5);
  aimLine.name='Laserziel'; aimLine.visible=false;
  const beamLine = mesh(new THREE.CylinderGeometry(1,1,1,8),new THREE.MeshBasicMaterial({color:0xffe9b4,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}),group,6);
  beamLine.name='Laserentladung';beamLine.visible=false;
  const lineStart=new THREE.Vector3(),lineEnd=new THREE.Vector3(),lineDelta=new THREE.Vector3(),lineUp=new THREE.Vector3(0,1,0);
  function placeLine(o,a,b,width) {lineDelta.subVectors(b,a);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(lineUp,lineDelta.clone().normalize());o.scale.set(width,lineDelta.length(),width);}
  const glint = mesh(geo.glint, mat.glint, ball); glint.rotation.set(-.32, .3, 0);
  const glow = mesh(geo.glow, mat.glow, ball, 2);
  const splitM = mesh(geo.split, mat.splitM, ball, 3), splitC = mesh(geo.split, mat.splitC, ball, 3);
  ball.add(new THREE.LineSegments(geo.veins, mat.veins), new THREE.LineSegments(geo.cracks, mat.cracks));
  const ghost = mesh(geo.sclera, mat.ghost, eye, 4); ghost.visible = false;
  // targeting reticle floating just in front of the iris
  const reticle = new THREE.Group(); reticle.position.z = R * .78; ball.add(reticle);
  mesh(geo.reticle, mat.cyan, reticle); for (let i = 0; i < 4; i++) mesh(geo.tick, mat.cyan, reticle).rotation.z = i * Math.PI / 2;

  // Fractured shell plates: almond-shaped lids in front, armour in the back.
  const plates = [], rnd = rng(3);
  for (let th = .8; th < 3; th += .25) {
    const n = Math.max(5, Math.round(Math.PI * 2 * Math.sin(th) * R / 1.55));
    for (let i = 0; i < n; i++) {
      const ph = (i + rnd() * .3) / n * Math.PI * 2, c = Math.cos(ph);
      if (th < .75 + .95 * c * c) continue;                                          // horizontal eye opening
      plates.push({ th, ph, h: R * .25 * (.75 + rnd() * .25), w: Math.PI * 2 * Math.sin(th) * R / n * (.7 + rnd() * .25), d: .28 + rnd() * .2, lid: th < 1.9, push: 0, s: rnd() * 9 });
    }
  }
  const plateMesh = new THREE.InstancedMesh(geo.plate, mat.plate, plates.length); ball.add(plateMesh);
  plates.forEach((p, i) => plateMesh.setColorAt(i, _c.set(rnd() < .12 ? '#3f8792' : rnd() < .4 ? '#2d2742' : rnd() < .5 ? '#202a36' : '#151c27')));
  plateMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // Halo rings (slowly turning) + broken outer arcs.
  const ringA = mesh(geo.ringA, mat.cyan, eye), ringB = mesh(geo.ringB, mat.magenta, eye);
  ringB.position.set(0, 1, -1.2);
  const arcs = new THREE.Group(); eye.add(arcs); for (let i = 0; i < 3; i++) mesh(geo.arc, mat.purple, arcs).rotation.z = i * Math.PI * 2 / 3;

  // Orbiting shards on three gently tilted orbits (kept above the floor).
  const shards = [], srnd = rng(5), tilts = [new THREE.Quaternion().setFromEuler(_e.set(Math.PI / 2 + .25, 0, .1)), new THREE.Quaternion().setFromEuler(_e.set(Math.PI / 2 - .3, 0, -.2)), new THREE.Quaternion().setFromEuler(_e.set(Math.PI / 2 + .12, 0, .3))];
  for (let i = 0; i < 39; i++) shards.push({ k: i % 3, a: srnd() * Math.PI * 2, r: R * (1.75 + (i % 3) * .3 + srnd() * .15), sp: (.25 + srnd() * .2) * (i % 3 === 1 ? -1 : 1), s: .6 + srnd() * 1.1, rs: srnd() * 3 });
  const shardMesh = new THREE.InstancedMesh(geo.shard, mat.glowInst, shards.length); eye.add(shardMesh);
  shards.forEach((s, i) => shardMesh.setColorAt(i, _c.set(['#67e9e2', '#d04ce8', '#e8fbff', '#8d75a4'][i % 4])));
  // Hanging glitch stalactites under the eye (where the leg/spur hurt spheres sit) + falling pixels.
  const drips = [], drnd = rng(9);
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + drnd() * .4, rr = .6 + drnd() * 1.6; drips.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr + .3, len: 1.1 + drnd() * 1.6, w: .22 + drnd() * .25, s: drnd() * 9 }); }
  const dripMesh = new THREE.InstancedMesh(geo.drip, mat.glowInst, drips.length); eye.add(dripMesh);
  drips.forEach((d, i) => dripMesh.setColorAt(i, _c.set(i % 3 ? '#1a1f2e' : '#c04ce8')));
  const pix = Array.from({ length: 24 }, () => ({ x: (drnd() - .5) * 4.5, z: (drnd() - .5) * 4.5, o: drnd(), sp: .3 + drnd() * .4 }));
  const pixMesh = new THREE.InstancedMesh(geo.pixel, mat.glowInst, pix.length); group.add(pixMesh);
  pix.forEach((p, i) => pixMesh.setColorAt(i, _c.set(i % 2 ? '#67e9e2' : '#d04ce8')));
  for (const im of [plateMesh, shardMesh, dripMesh, pixMesh]) { im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
  const floor = mesh(geo.floor, mat.floor, group); floor.position.y = .05;
  const floorRing = mesh(geo.floorRing, mat.floorRing, group); floorRing.position.y = .06;

  const pupilDir = new THREE.Vector3(0, 0, 1);
  let opening=0, last = null, born = -1, menace = 0, glitchT = 0, nextGlitch = 1, blinkT = 0, nextBlink = 3, sacc = new THREE.Vector3(), nextSacc = 0, gx = 0, gy = 0, gz = 0;
  function update(x) {
    const t = x.time ?? 0, dt = last == null ? 0 : Math.min(.1, Math.max(0, t - last)); last = t;
    if (born < 0 || t < born) born = t;
    const age = t - born, appear = Math.min(1, age / 1.4);
    // Menace: rises during any attack, peaks during the wind-up.
    const cue=eyeAttackCue(x.attackInst,x.attackTime ?? 0), charge=cue.charge, firing=cue.release;
    const atk = !!x.attackId, wind = charge > 0 ? 1 : 0;
    group.userData.attackCue={charge,release:firing,kind:cue.kind,impactIn:cue.impactIn};
    menace += ((atk ? .7 + wind * .3 : 0) - menace) * (1 - Math.exp(-dt * 5));
    // Glitch events: brief positional/scale pops + chromatic split, more often when angry.
    glitchT -= dt; nextGlitch -= dt * (1 + menace * 2.5);
    if (nextGlitch <= 0) { nextGlitch = .5 + Math.random() * 2; glitchT = .05 + Math.random() * .14; gx = (Math.random() - .5) * .9; gy = (Math.random() - .5) * .5; gz = (Math.random() - .5) * .6; for (const p of plates) p.push = Math.random() < .18 ? .4 + Math.random() * .9 : 0; }
    const gl = !atk && (glitchT > 0 || age < 1.4 && Math.random() < .25);
    // Blinks (lids slam shut) only while idle.
    nextBlink -= dt; if (nextBlink <= 0 && !atk) { blinkT = .22; nextBlink = 3 + Math.random() * 5; } blinkT -= dt;
    const blink = blinkT > 0 ? Math.sin((1 - blinkT / .22) * Math.PI) : 0;
    const k = appear * appear * (3 - 2 * appear);
    opening+=((x.opening?1:0)-opening)*(1-Math.exp(-dt*5));
    eye.position.set(gl ? gx : 0, EYE_H - opening*.9 + Math.sin(t * .9) * .25 + (gl ? gy : 0) + (1 - k) * 3 + charge*.28-firing*.25, (gl ? gz : 0)-charge*.35+firing*.55);
    eye.scale.set(k * (gl ? 1.06 : 1), k * (gl ? .95 : 1) * (1 + Math.sin(t * 2.4) * .012), k);
    // Gaze: target position if provided, otherwise the viewer's camera; clamped, smoothed, with idle saccades.
    const tgt = x.targetPos ?? (camSeen ? camPos : null);
    if (cue.sample) {
      // Face the locked attack lane, including a sweep's real start angle. Never gaze-track a hunter after locking.
      const yaw=cue.sample.yaw-(x.worldYaw??0);
      _q.setFromEuler(_e.set(.16,yaw,0));ball.quaternion.slerp(_q,1-Math.exp(-dt*14));
    } else if (tgt) {
      eye.updateWorldMatrix(true, false); _d.set(tgt.x, (tgt.y ?? 0) + (x.targetPos ? 1.2 : 0), tgt.z); eye.worldToLocal(_d).normalize();
      nextSacc -= dt; if (nextSacc <= 0) { nextSacc = .6 + Math.random() * 1.6; sacc.set(Math.random() - .5, Math.random() - .5, 0).multiplyScalar(atk ? 0 : .22); }
      _d.add(sacc).normalize(); _q.setFromUnitVectors(Z, _d);
      const ang = 2 * Math.acos(Math.min(1, Math.abs(_q.w))), max = 1.05;
      if (ang > max) { _q2.copy(_q); _q.slerpQuaternions(_qi, _q2, max / ang); }
      ball.quaternion.slerp(_q, 1 - Math.exp(-dt * (atk ? 9 : 4)));
    }
    if(opening>.01){_q.setFromEuler(_e.set(.55,0,0));ball.quaternion.slerp(_q,opening*.15);}
    pupilDir.copy(Z).applyQuaternion(ball.quaternion);
    // Iris: pupil contracts to a slit, glow flares and shifts toward magenta when attacking.
    const beat = Math.pow(Math.max(0, Math.sin(t * 2.6)), 6);
    pupil.scale.set(.9 - charge * .72 + firing*.35 + beat * .05, .9 + charge * .28, 1);
    capacitor.visible=charge>0 || firing>0;
    chargeMat.opacity=Math.min(.95,.15+charge*.8+firing*.5);
    chargeMat.color.set(firing?'#fff9e0':charge>.82?'#ff705b':'#ffc26a');
    chargeRings.forEach((ring,i)=>{ring.scale.setScalar(Math.max(.08,(1-charge)*(2+i*.4)+.15));ring.position.z=R+.35+i*.65*(1-charge);ring.rotation.z=(i%2?1:-1)*t*2;});
    chargeOrb.scale.setScalar(.12+charge*.95+firing*.7);
    // Three converging rings close on the pupil exactly at impact; a narrow amber sight line becomes a bright shot.
    const laser=['beam','laser','sweep'].includes(cue.kind)&&cue.hit?.shape==='capsule';
    aimLine.visible=laser&&charge>0;beamLine.visible=laser&&firing>0;
    if(laser){
      const sample=cue.sample,h=cue.hit,sy=Math.sin(sample.yaw),cy=Math.cos(sample.yaw);
      const world=(a)=>new THREE.Vector3(sample.x+a[0]*cy+a[2]*sy,(x.attackInst.origin.y??0)+a[1],sample.z-a[0]*sy+a[2]*cy);
      group.updateWorldMatrix(true,false);ball.getWorldPosition(lineStart);lineStart.addScaledVector(pupilDir.clone().transformDirection(group.matrixWorld),R);
      lineEnd.copy(world(h.to));group.worldToLocal(lineStart);group.worldToLocal(lineEnd);
      placeLine(aimLine,lineStart,lineEnd,.045);aimLine.material.opacity=.2+charge*.5;
      placeLine(beamLine,lineStart,lineEnd,.18+firing*.22);beamLine.material.opacity=.9;
    }
    glow.scale.setScalar(1 + beat * .03 + menace * .06);
    mat.glow.opacity = .25 + beat * .2 + menace * .6 + (gl ? .2 : 0);
    mat.glow.color.set('#67e9e2').lerp(_c.set('#e04cff'), menace * .55 + (gl ? .3 : 0));
    mat.veins.opacity = .35 + beat * .4 + menace * .25;
    mat.cracks.opacity = (Math.random() < .08 ? .15 : .55) + menace * .4;
    const so = gl ? .35 : menace * .12 + Math.sin(t * 13) * .03;
    splitM.position.set(-so, so * .4, 0); splitC.position.set(so, -so * .3, 0);
    mat.splitM.opacity = mat.splitC.opacity = gl ? .4 : .03 + menace * .15;
    glint.visible = !gl;
    ghost.visible = gl; mat.ghost.opacity = gl ? .5 : 0; ghost.position.set(-gx * .6, gy, 0);
    reticle.rotation.z = t * (charge > 0 ? .2 : .6); reticle.scale.setScalar(1 - charge*.35 + firing*.2);
    // Shell plates: breathe, lids open wider when attacking, close on blink, scatter on glitch.
    const lidK = 1 + menace * .12 - blink * .55;
    plates.forEach((p, i) => {
      const th = p.lid ? Math.max(.3, (p.th - .8) * (1 + menace * .2) + .8 * lidK) : p.th, ph = p.ph;
      const st = Math.sin(th), ct = Math.cos(th), sp = Math.sin(ph), cp = Math.cos(ph);
      const r = R * 1.03 + p.d / 2 + Math.sin(t * 1.7 + p.s) * .05 + menace * .25 * (p.lid ? 1 : .5) + (gl ? p.push : 0);
      _m.makeBasis(_w.set(ct * cp, ct * sp, -st), _w2.set(-sp, cp, 0), _v.set(st * cp, st * sp, ct));
      _m.scale(_s.set(p.h, p.w, p.d)); _m.setPosition(_v.multiplyScalar(r)); plateMesh.setMatrixAt(i, _m);
    });
    plateMesh.instanceMatrix.needsUpdate = true;
    // Halo rings + orbiting shards.
    const spin = 1 + menace * 2.5;
    ringA.rotation.set(Math.PI / 2 + Math.sin(t * .3) * .12, 0, t * .25 * spin); ringA.scale.setScalar(1 + beat * .02);
    ringB.rotation.set(-.95, Math.sin(t * .2) * .2, -t * .4 * spin);
    arcs.rotation.set(Math.PI / 2 - .15, 0, -t * .15 * spin);
    mat.cyan.color.set('#6ee5df').lerp(_c.set('#ffc26a'),charge);
    shards.forEach((s, i) => {
      const a = s.a + t * s.sp * spin; _v.set(Math.cos(a) * s.r, Math.sin(a) * s.r, Math.sin(t * 1.3 + s.rs) * .4).applyQuaternion(tilts[s.k]);
      _q.setFromEuler(_e.set(t * s.rs, t * 1.3, s.rs)); _m.compose(_v, _q, _s.setScalar(s.s * (gl && i % 4 === 0 ? 1.8 : 1))); shardMesh.setMatrixAt(i, _m);
    });
    shardMesh.instanceMatrix.needsUpdate = true;
    drips.forEach((d, i) => {
      const len = d.len * (1 + Math.sin(t * 2 + d.s) * .12 + menace * .2);
      _q.setFromEuler(_e.set(0, t * .5 + d.s, 0)); _m.compose(_v.set(d.x, -R * .78 - len * .8, d.z), _q, _s.set(d.w, len, d.w)); dripMesh.setMatrixAt(i, _m);
    });
    dripMesh.instanceMatrix.needsUpdate = true;
    pix.forEach((p, i) => {
      const f = (t * p.sp + p.o) % 1, y = (eye.position.y - R * .9) * (1 - f);
      _m.compose(_v.set(p.x, y, p.z), _qi, _s.setScalar(k * (1 - f) * (Math.random() < .1 ? 0 : 1))); pixMesh.setMatrixAt(i, _m);
    });
    pixMesh.instanceMatrix.needsUpdate = true;
    mat.floor.opacity = (.1 + beat * .06 + menace * .18) * k; floor.scale.setScalar(1 + menace * .25);
    floorRing.rotation.y = t * .3; mat.floorRing.opacity = (.25 + menace * .4) * k;
  }
  return { group, sclera, pupilDir, get height(){return eye.position.y;}, update, reset() { born = -1; last = null; } };
}
