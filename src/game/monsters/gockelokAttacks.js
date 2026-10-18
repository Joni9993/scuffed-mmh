import { mTrack } from './monster.js';
import { smooth, clamp01 } from './common.js';

const ball = (t, x, z, r, dmg, extra = {}) => ({ t0: t, t1: t + .16, shape: 'sphere', at: [x, 1, z], radius: r, dmg, knock: 'down', ...extra });
const line = (t, x, z, xx, zz, r, dmg, extra = {}) => ({ t0: t, t1: t + .18, shape: 'capsule', from: [x, 1, z], to: [xx, 1, zz], radius: r, dmg, knock: 'flinch', ...extra });
const corrupt = { copy: true }, flinch = { knock: 'flinch' };
// Final-boss mark: hits that take three quarters of max HP, ignoring armor and block. Only a roll answers them.
const fatal = { dmgPct: .75, ...corrupt };
const pose = (tg, end, kind = 'peck') => {
  const wind = kind === 'wing' ? { wing: 65, bodyRoll: -20, head: -15 } : kind === 'jump' ? { bodyY: -.55, legL: 55, legR: 55, wing: 40 } : { bodyPitch: -12, neck: -.3, head: -28, wing: 15 };
  const hit = kind === 'wing' ? { wing: -45, bodyRoll: 22, head: 20 } : kind === 'jump' ? { bodyY: -.6, legL: -40, legR: -35, wing: 65, bodyPitch: 20 } : { bodyPitch: 16, neck: .65, head: 35 };
  const back = Math.max(tg + .2, end - .45);
  return mTrack([[0, {}], [tg * .65, wind], [tg - .08, wind], [tg + .08, hit], [back, { bodyY: -.35, bodyPitch: 18, neck: .6, head: 32, wing: 18 }], [end, {}]]);
};
// Short in-attack recoveries (the dragons leave 0.6-1 s): the Ur-Hahn barely stops between strikes.
function move(id, tg, hits, recovery = .8, extra = {}) {
  const end = Math.max(...hits.map(h => h.t1)) + recovery;
  return { id: `gockelok_${id}`, range: [0, 14], weight: 4, cooldown: 3.5, stam: 6, audit: [3, 8], tgVar: false,
    telegraph: tg, duration: end, hits, markerFromHits: true, markerLead: 1.1, flashParts: ['head'], cue: { color: '#ffb65b', tone: 'knurr' },
    pose: pose(tg, end, extra.kind), cond: m => m.gockelForm === 'rooster', ...extra };
}
// Melee lunge: closes up to `max` metres toward where the hunter stood, ending just before the strike.
const lunge = (max, t0, t1) => ({
  prepare(a) { a.len = Math.min(max, Math.max(0, Math.hypot(a.target.x - a.origin.x, a.target.z - a.origin.z) - 3.2)); },
  motion(t, a) { const k = smooth(clamp01((t - t0) / (t1 - t0))) * a.len; return { x: a.origin.x + a.dir.x * k, z: a.origin.z + a.dir.z * k }; },
});
const far = (m, d) => 1 + (m.gockelFarT ?? 0) / 2 + (d > 12 ? 1 : 0);
const peckPose = mTrack([[0, {}], [.45, { head: -25, neck: -.3 }], [.66, { head: 35, neck: .65, bodyPitch: 16 }], [.95, { head: -25, neck: -.3 }], [1.15, { head: 35, neck: .65, bodyPitch: 16 }], [1.45, { head: -25, neck: -.3 }], [1.68, { head: 35, neck: .65, bodyPitch: 16 }], [2.25, { head: 32, neck: .6, bodyPitch: 15 }], [2.6, {}]]);
const peck = move('maschinenpicken', .62, [ball(.62, 0, 3.5, 1.3, 150, flinch), ball(1.12, 0, 3.8, 1.4, 165, flinch), ball(1.64, 0, 4, 1.5, 195)], .8, { range: [0, 9], weight: 7, cooldown: 2.5, pose: peckPose, ...lunge(4.5, .2, .58) });
const anchor = move('schnabelanker', 1, [ball(1, 0, 4.4, 1.8, 260)], 1.2, { range: [0, 10], seam: [0.15, 1], cooldown: 7, ...lunge(4.5, .45, .95) });
const scratch = move('scharrhieb', .56, [line(.56, -2, 1, 2.5, 3.3, .8, 175), line(.98, 2, 1, -2.5, 3.3, .8, 185)], .75, { range: [0, 8], weight: 5, cooldown: 2.5, kind: 'jump', flashParts: ['legs'], ...lunge(3.5, .15, .52) });
const spur = move('spornstich', .62, [line(.62, -.8, 1, -.8, 5.5, .7, 205), line(1, .8, 1, .8, 5.5, .7, 190)], .8, { range: [0, 10], weight: 5, kind: 'jump', flashParts: ['spur'], ...lunge(4.5, .2, .58) });
const wing = move('fluegelfeger', .66, [line(.66, -4, -2, -3, 4, 1.2, 190)], .75, { noFace: true, kind: 'wing', flashParts: ['wing'], range: [0, 8], weight: (m, d) => d < 4 ? 6 : 3 });
const flank = move('flankenwechsel', .9, [ball(.9, 0, 3.5, 1.5, 195, flinch), ball(1.35, 0, 3.8, 1.5, 175)], .8, { weight: 4, range: [0, 10],
  // Sidestep to cut the angle, turn on the hunter and lunge from the flank.
  prepare(a) { a.side = a.r(0) < .5 ? -1 : 1; const c=Math.cos(a.yaw0),s=Math.sin(a.yaw0); a.p1={x:a.origin.x+a.side*4*c,z:a.origin.z-a.side*4*s};
    const dx=a.target.x-a.p1.x,dz=a.target.z-a.p1.z; a.yaw1=Math.atan2(dx,dz); a.len=Math.min(4.5,Math.max(0,Math.hypot(dx,dz)-3.2)); },
  motion(t,a) { const k=smooth(clamp01((t-.1)/.4)),l=smooth(clamp01((t-.5)/.35))*a.len,dy=Math.atan2(Math.sin(a.yaw1-a.yaw0),Math.cos(a.yaw1-a.yaw0)),yaw=a.yaw0+dy*k;
    return { x:a.origin.x+(a.p1.x-a.origin.x)*k+Math.sin(a.yaw1)*l, z:a.origin.z+(a.p1.z-a.origin.z)*k+Math.cos(a.yaw1)*l, yaw }; },
});
// Gap closer: long, fast and favoured the longer a hunter keeps their distance.
const chase = move('jagdlauf', .78, [ball(.78, 0, 2.5, 1.8, 220, {t1:1.2, ...flinch}), ball(1.45, 0, 3.2, 1.6, 200, flinch)], .95, { range:[5,40], weight:(m,d)=>(d>10?10:5)*far(m,d), cooldown:2.2,
  prepare(a) { a.length = Math.min(26, Math.max(0, Math.hypot(a.target.x-a.origin.x,a.target.z-a.origin.z)-2.5)); },
  motion(t,a) { const k=smooth(clamp01((t-.78)/.4)); return {x:a.origin.x+a.dir.x*a.length*k,z:a.origin.z+a.dir.z*a.length*k}; },
  pose:mTrack([[0,{}],[.55,{bodyPitch:15,head:20,wing:30}],[.78,{legL:50,legR:-50,bodyPitch:18}],[.92,{legL:-50,legR:50,bodyPitch:18}],[1.06,{legL:50,legR:-50,bodyPitch:18}],[1.25,{bodyY:-.5,head:35,neck:.6,bodyPitch:20,wing:45}],[1.85,{bodyY:-.3,head:30,neck:.6,bodyPitch:15}],[2.15,{}]]),
});
function jump(broken = false) {
  const h=[ball(1.2,0,0,broken?3:4,230)]; if (!broken) h.push(line(1.75,-2,0,2,4,.9,185));
  return move(broken?'sprungsporne_bruch':'sprungsporne',1.2,h,broken?1.6:.85,{phase:1,range:[3,32],weight:(m,d)=>(d>8?6:3)*far(m,d),cooldown:4,kind:'jump',flashParts:['spur','wing'], ...(broken?{needsBroken:'spur'}:{lockedByBreak:'spur'}),
    prepare(a) { const d=Math.hypot(a.target.x-a.origin.x,a.target.z-a.origin.z); a.length=Math.min(d,22); },
    motion(t,a) { const k=smooth(clamp01((t-.35)/.85)); return {x:a.origin.x+a.dir.x*a.length*k,z:a.origin.z+a.dir.z*a.length*k,air:t<1.2?Math.sin(clamp01((t-.35)/.85)*Math.PI)*5:0}; },
  });
}
function shout(broken=false) {
  const tg=broken?2:1.6;
  return move(broken?'kikeriki_heiser':'kikeriki',tg,[ball(tg,0,0,broken?7:11,broken?130:190,{...corrupt,staminaDrain:broken?25:50})],1.4,{phase:1,range:[0,18],seam:[.15,tg],cooldown:12,flashParts:['comb'],kind:'wing',...(broken?{needsBroken:'comb'}:{lockedByBreak:'comb'})});
}
const echo=move('versetzter_schnabel',.75,[ball(.75,0,3.5,1.5,180,flinch),ball(1.6,0,6,2,210,corrupt)],.9,{phase:1,range:[0,11],seam:[.85,1.6],cooldown:4,...lunge(4,.2,.7)});
// Anti-hug spin: two widening rings around the body.
const whirl=move('hahnenwirbel',.7,[ball(.7,0,0,4.5,175,flinch),ball(1.25,0,0,5.5,195,corrupt)],.8,{phase:1,range:[0,6],weight:(m,d)=>d<4?7:3,cooldown:5,noFace:true,kind:'wing',flashParts:['wing']});
// Anti-kite: a crow that cuts a corrupted lane through the arena toward a distant hunter.
const crow=move('kraehenschnitt',.72,[line(.72,0,2,0,30,1.3,185,corrupt),line(1.1,0,2,0,30,1.3,175)],.8,{range:[8,40],weight:(m,d)=>5*far(m,d),cooldown:3,kind:'wing',flashParts:['comb']});
const crowFan=move('kraehenfaecher',.8,[line(.8,0,2,0,30,1.3,195,corrupt),line(1.15,0,2,-11,27,1.3,195,corrupt),line(1.15,0,2,11,27,1.3,195,corrupt)],.8,{phase:1,range:[8,40],weight:(m,d)=>6*far(m,d),cooldown:4,kind:'wing',flashParts:['comb']});
const rift=move('risssprung',1.5,[ball(1.5,0,0,4,250,corrupt)],1.3,{phase:2,range:[5,40],weight:(m,d)=>5*far(m,d),cooldown:4,seam:[.15,1.3],kind:'jump',
  prepare(a) { const d=Math.min(26,Math.hypot(a.target.x-a.origin.x,a.target.z-a.origin.z)); a.landing={x:a.origin.x+a.dir.x*d,z:a.origin.z+a.dir.z*d}; },
  motion(t,a) { const k=smooth(clamp01((t-1.1)/.4)); return {x:a.origin.x+(a.landing.x-a.origin.x)*k,z:a.origin.z+(a.landing.z-a.origin.z)*k,air:Math.sin(k*Math.PI)*3}; },
});
const signature=move('nahtsignatur',2.1,[line(2.1,-7,2,7,2,2,85,{...fatal,group:'split'}),line(2.1,0,-3,0,13,2,85,{...fatal,group:'split'})],2.2,{phase:2,seam:[.1,2.1],cooldown:14,kind:'wing'});

// ---------------------------------------------------------------- AUGE DES GLITCH: the true form does not pause, it overlaps.
const trueMove=(id,tg,hits,recovery,extra={})=>move(id,tg,hits,recovery,{cond:m=>m.gockelForm==='eye',range:[0,45],cooldown:1.6,stam:0,cue:{color:'#73f3ed',tone:'droehn'},...extra});
const frames=trueMove('frames',.9,[ball(.9,-4,6,2.6,290,{...corrupt,...flinch}),ball(1.2,4,6,2.6,290,{...corrupt,...flinch}),ball(1.55,0,3,2.4,320),ball(1.95,0,8.5,2.6,90,fatal)],.75,{kind:'wing',seam:[1.2,1.95]});
const rollback=trueMove('rollback',1,[line(1,0,2,0,18,1.6,300,flinch),line(1.8,0,18,0,2,2,90,fatal)],.8,{seam:[1.15,1.8],
  motion(t,a) { const k=smooth(clamp01((t-1)/.35))-smooth(clamp01((t-1.8)/.35));return {x:a.origin.x+a.dir.x*8*k,z:a.origin.z+a.dir.z*8*k}; },
});
// Strip timings (2 / 3.4) are mirrored by the arena strips in gockelokEye.js.
const fracture=trueMove('raumbruch',2,[ball(.9,0,10,3,290),line(2,-7,-16,-7,20,2,300),line(2,7,-16,7,20,2,300),line(2.7,-16,12,16,12,1.4,290,corrupt),line(3.4,0,-16,0,20,1.7,90,fatal)],.8,{kind:'wing',cooldown:6});
const cascade=trueMove('fehlerkaskade',.9,[line(.9,-5,2,2,5,1.2,290,flinch),ball(1.35,4,4,2.6,305,flinch),line(1.8,-5,8,5,8,1.3,310,corrupt),ball(2.35,0,3,3,90,fatal)],.8,{seam:[1.4,2.35],cooldown:4});
// Teleport strike: the eye skips the frames in between and lands on the hunter, then stamps the spot three times (a flinch does not end it).
const nullJump=trueMove('nullsprung',.72,[ball(.72,0,2,3,300,flinch),ball(1,0,2,3,300,flinch),ball(1.3,0,2,3.4,290,corrupt)],.75,{weight:(m,d)=>d>7?9:4,cooldown:2.2,kind:'jump',
  prepare(a) { const d=Math.min(30,Math.max(0,Math.hypot(a.target.x-a.origin.x,a.target.z-a.origin.z)-2)); a.landing={x:a.origin.x+a.dir.x*d,z:a.origin.z+a.dir.z*d}; },
  motion(t,a) { const k=smooth(clamp01((t-.5)/.1)); return {x:a.origin.x+(a.landing.x-a.origin.x)*k,z:a.origin.z+(a.landing.z-a.origin.z)*k}; },
});
// Memory flood: a wall of broken pixels sweeps across the arena; roll through it.
const flood=trueMove('speicherflut',.9,[2,5,8,11,14,17,20,23].map((z,i)=>line(.9+i*.18,-11,z,11,z,1.3,i%2?285:300,i===3?corrupt:{})),.75,{weight:(m,d)=>d>6?7:4,cooldown:4,kind:'wing'});
// Blue screen: everything around the eye is overwritten. Only a timed roll survives.
const bluescreen=trueMove('bluescreen',1.1,[ball(1.1,0,0,11,90,fatal)],.9,{range:[0,12],weight:4,cooldown:9,noFace:true,kind:'wing'});
const crash=trueMove('absturz',1.6,[line(1.6,-9,4,9,4,1.4,300),line(2.6,-6,-8,-6,12,1.5,300),line(2.6,6,-8,6,12,1.5,300),ball(3.8,0,3,4.5,95,fatal)],1.4,{seam:[2.7,3.8],cooldown:14,weight:7,kind:'jump'});
export const gockelAttacks=Object.fromEntries([peck,anchor,scratch,spur,wing,flank,chase,jump(),jump(true),shout(),shout(true),echo,whirl,crow,crowFan,rift,signature,frames,rollback,fracture,cascade,nullJump,flood,bluescreen,crash].map(a=>[a.id,a]));
