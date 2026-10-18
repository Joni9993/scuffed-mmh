import { mTrack } from './monster.js';
import { smooth, clamp01 } from './common.js';

const ball = (t, x, z, r, dmg, extra = {}) => ({ t0: t, t1: t + .16, shape: 'sphere', at: [x, 1, z], radius: r, dmg, knock: 'down', ...extra });
const line = (t, x, z, xx, zz, r, dmg, extra = {}) => ({ t0: t, t1: t + .18, shape: 'capsule', from: [x, 1, z], to: [xx, 1, zz], radius: r, dmg, knock: 'flinch', ...extra });
const corrupt = { copy: true };
const pose = (tg, end, kind = 'peck') => {
  const wind = kind === 'wing' ? { wing: 65, bodyRoll: -20, head: -15 } : kind === 'jump' ? { bodyY: -.55, legL: 55, legR: 55, wing: 40 } : { bodyPitch: -12, neck: -.3, head: -28, wing: 15 };
  const hit = kind === 'wing' ? { wing: -45, bodyRoll: 22, head: 20 } : kind === 'jump' ? { bodyY: -.6, legL: -40, legR: -35, wing: 65, bodyPitch: 20 } : { bodyPitch: 16, neck: .65, head: 35 };
  return mTrack([[0, {}], [tg * .65, wind], [tg - .08, wind], [tg + .08, hit], [end - .55, { bodyY: -.35, bodyPitch: 18, neck: .6, head: 32, wing: 18 }], [end, {}]]);
};
function move(id, tg, hits, recovery = 1.8, extra = {}) {
  const end = Math.max(...hits.map(h => h.t1)) + recovery;
  return { id: `gockelok_${id}`, range: [0, 14], weight: 4, cooldown: 7, stam: 10, audit: [3, 8], tgVar: false,
    telegraph: tg, duration: end, hits, markerFromHits: true, markerLead: 1.35, flashParts: ['head'], cue: { color: '#ffb65b', tone: 'knurr' },
    pose: pose(tg, end, extra.kind), cond: m => m.gockelForm === 'rooster', ...extra };
}
const peck = move('maschinenpicken', .8, [ball(.8, 0, 3.5, 1.3, 34), ball(1.55, 0, 3.8, 1.4, 38), ball(2.35, 0, 4, 1.5, 46)], 1.5, { range: [0, 7], weight: 7, cooldown: 4,
  pose: mTrack([[0, {}], [.6, { head: -25, neck: -.3 }], [.85, { head: 35, neck: .65, bodyPitch: 16 }], [1.25, { head: -25, neck: -.3 }], [1.6, { head: 35, neck: .65, bodyPitch: 16 }], [2, { head: -25, neck: -.3 }], [2.4, { head: 35, neck: .65, bodyPitch: 16 }], [3.5, { head: 32, neck: .6, bodyPitch: 15 }], [4.01, {}]]) });
const anchor = move('schnabelanker', 1.25, [ball(1.25, 0, 4.4, 1.8, 66)], 3, { range: [0, 8], seam: [0.15, 1.25], cooldown: 11 });
const scratch = move('scharrhieb', .8, [line(.8, -2, 1, 2.5, 3.3, .8, 38)], 1.5, { range: [0, 6], kind: 'jump', flashParts: ['legs'] });
const spur = move('spornstich', .95, [line(.95, -.8, 1, -.8, 5.5, .7, 53)], 1.8, { range: [0, 7], kind: 'jump', flashParts: ['spur'] });
const wing = move('fluegelfeger', 1, [line(1, -4, -2, -3, 4, 1.2, 43)], 1.7, { noFace: true, kind: 'wing', flashParts: ['wing'], range: [0, 8] });
const flank = move('flankenwechsel', 1.5, [ball(1.5, 0, 3.5, 1.5, 45)], 1.6, {
  prepare(a) { a.side = a.r(0) < .5 ? -1 : 1; },
  motion(t,a) { const x = a.side * 4 * smooth(clamp01((t-.1)/.45)); return { x:a.origin.x+x*Math.cos(a.yaw0), z:a.origin.z-x*Math.sin(a.yaw0) }; },
});
const chase = move('jagdlauf', 1.1, [ball(1.1, 0, 2.5, 1.7, 56, {t1:1.55})], 2.5, { range:[6,40], weight:8,
  prepare(a) { a.length = Math.min(19, Math.max(0, Math.hypot(a.target.x-a.origin.x,a.target.z-a.origin.z)-2.5)); },
  motion(t,a) { const k=smooth(clamp01((t-1.1)/.45)); return {x:a.origin.x+a.dir.x*a.length*k,z:a.origin.z+a.dir.z*a.length*k}; },
  pose:mTrack([[0,{}],[.8,{bodyPitch:15,head:20,wing:30}],[1.1,{legL:50,legR:-50,bodyPitch:18}],[1.25,{legL:-50,legR:50,bodyPitch:18}],[1.4,{legL:50,legR:-50,bodyPitch:18}],[1.6,{bodyY:-.5,head:35,neck:.6,bodyPitch:20,wing:45}],[3.5,{bodyY:-.3,head:30,neck:.6,bodyPitch:15}],[4.05,{}]]),
});
function jump(broken = false) {
  const h=[ball(1.8,0,0,broken?3:4,61)]; if (!broken) h.push(line(2.65,-2,0,2,4,.9,47));
  return move(broken?'sprungsporne_bruch':'sprungsporne',1.8,h,broken?3:2,{phase:1,range:[3,30],kind:'jump',flashParts:['spur','wing'], ...(broken?{needsBroken:'spur'}:{lockedByBreak:'spur'}),
    prepare(a) { const d=Math.hypot(a.target.x-a.origin.x,a.target.z-a.origin.z); a.length=Math.min(d,18); },
    motion(t,a) { const k=smooth(clamp01((t-.5)/1.3)); return {x:a.origin.x+a.dir.x*a.length*k,z:a.origin.z+a.dir.z*a.length*k,air:t<1.8?Math.sin(clamp01((t-.5)/1.3)*Math.PI)*5:0}; },
  });
}
function shout(broken=false) {
  const tg=broken?2.5:2;
  return move(broken?'kikeriki_heiser':'kikeriki',tg,[ball(tg,0,0,broken?7:11,broken?40:64,{...corrupt,staminaDrain:broken?20:45})],2.7,{phase:1,range:[0,18],seam:[.15,tg],cooldown:17,flashParts:['comb'],kind:'wing',...(broken?{needsBroken:'comb'}:{lockedByBreak:'comb'})});
}
const echo=move('versetzter_schnabel',1,[ball(1,0,3.5,1.5,46),ball(2.1,0,6,2,54,corrupt)],2.3,{phase:1,seam:[1.1,2.1]});
const rift=move('risssprung',2,[ball(2,0,0,4,67,corrupt)],3,{phase:2,range:[5,40],seam:[.15,1.7],kind:'jump',
  prepare(a) { const d=Math.min(22,Math.hypot(a.target.x-a.origin.x,a.target.z-a.origin.z)); a.landing={x:a.origin.x+a.dir.x*d,z:a.origin.z+a.dir.z*d}; },
  motion(t,a) { const k=smooth(clamp01((t-1.55)/.45)); return {x:a.origin.x+(a.landing.x-a.origin.x)*k,z:a.origin.z+(a.landing.z-a.origin.z)*k,air:Math.sin(k*Math.PI)*3}; },
});
const signature=move('nahtsignatur',2.6,[line(2.6,-7,2,7,2,2,85,{...corrupt,dmgPct:.75,group:'split'}),line(2.6,0,-3,0,13,2,85,{...corrupt,dmgPct:.75,group:'split'})],3.6,{phase:2,seam:[.1,2.6],cooldown:19,kind:'wing'});
const trueMove=(id,tg,hits,recovery,extra={})=>move(id,tg,hits,recovery,{cond:m=>m.gockelForm==='eye',range:[0,45],cue:{color:'#73f3ed',tone:'droehn'},...extra});
const frames=trueMove('frames',1.4,[ball(1.4,-4,6,2.4,57,corrupt),ball(2.4,4,6,2.4,57,corrupt),ball(3.4,0,3,2.2,65)],2.6,{kind:'wing',seam:[2.4,3.4]});
const rollback=trueMove('rollback',1.5,[line(1.5,0,2,0,18,1.6,63),line(3,0,18,0,2,2,69,corrupt)],3,{seam:[1.7,3],
  motion(t,a) { const k=smooth(clamp01((t-1.5)/.5))-smooth(clamp01((t-3)/.5));return {x:a.origin.x+a.dir.x*8*k,z:a.origin.z+a.dir.z*8*k}; },
});
const fracture=trueMove('raumbruch',2,[line(2,-7,-16,-7,20,2,65),line(2,7,-16,7,20,2,65),line(3.4,0,-16,0,20,1.7,68,corrupt)],2.8,{kind:'wing',cooldown:14});
const cascade=trueMove('fehlerkaskade',1.3,[line(1.3,-5,2,2,5,1.2,53),ball(2.6,4,4,2.6,59),line(4,-5,8,5,8,1.3,64,corrupt)],3.7,{seam:[2.7,4],cooldown:13});
const crash=trueMove('absturz',2,[line(2,-9,4,9,4,1.4,63),line(3.4,-6,-8,-6,12,1.5,63),line(3.4,6,-8,6,12,1.5,63),ball(5,0,3,4.5,95,{dmgPct:.75,...corrupt})],5,{seam:[3.5,5],cooldown:20,weight:7,kind:'jump'});
export const gockelAttacks=Object.fromEntries([peck,anchor,scratch,spur,wing,flank,chase,jump(),jump(true),shout(),shout(true),echo,rift,signature,frames,rollback,fracture,cascade,crash].map(a=>[a.id,a]));
