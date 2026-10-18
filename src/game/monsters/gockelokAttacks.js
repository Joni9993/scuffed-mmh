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
// Balance (Endboss-Rework 2): Drachen-Referenz = Pyrostur/Felsengroll/Voltiris, Treffer im Mittel 120-152,
// Spitze 175-190, Telegraph-Median ~0,8 s, Nachlauf ~1 s. Der Hahn liegt darueber (Mittel ~150, Spitze 230),
// die wahre Form deutlich darueber (180-260, Absturz 90 % Max-LP).
function move(id, tg, hits, recovery = 1.0, extra = {}) {
  const end = Math.max(...hits.map(h => h.t1)) + recovery;
  return { id: `gockelok_${id}`, range: [0, 14], weight: 4, cooldown: 5, stam: 8, audit: [3, 8], tgVar: false,
    telegraph: tg, duration: end, hits, markerFromHits: true, markerLead: 1.1, flashParts: ['head'], cue: { color: '#ffb65b', tone: 'knurr' },
    pose: pose(tg, end, extra.kind), cond: m => m.gockelForm === 'rooster', ...extra };
}
const peck = move('maschinenpicken', .8, [ball(.8, 0, 3.5, 1.3, 95), ball(1.55, 0, 3.8, 1.4, 105), ball(2.35, 0, 4, 1.5, 130)], 1.0, { range: [0, 7], weight: 7, cooldown: 3,
  pose: mTrack([[0, {}], [.6, { head: -25, neck: -.3 }], [.85, { head: 35, neck: .65, bodyPitch: 16 }], [1.25, { head: -25, neck: -.3 }], [1.6, { head: 35, neck: .65, bodyPitch: 16 }], [2, { head: -25, neck: -.3 }], [2.4, { head: 35, neck: .65, bodyPitch: 16 }], [3, { head: 32, neck: .6, bodyPitch: 15 }], [3.51, {}]]) });
const anchor = move('schnabelanker', 1.1, [ball(1.1, 0, 4.4, 1.8, 185)], 1.6, { range: [0, 8], seam: [0.15, 1.1], cooldown: 8 });
const scratch = move('scharrhieb', .7, [line(.7, -2, 1, 2.5, 3.3, .8, 115)], 1.0, { range: [0, 6], kind: 'jump', flashParts: ['legs'], cooldown: 3 });
const spur = move('spornstich', .8, [line(.8, -.8, 1, -.8, 5.5, .7, 150)], 1.1, { range: [0, 7], kind: 'jump', flashParts: ['spur'], cooldown: 4 });
const wing = move('fluegelfeger', .85, [line(.85, -4, -2, -3, 4, 1.2, 125)], 1.0, { noFace: true, kind: 'wing', flashParts: ['wing'], range: [0, 8], cooldown: 4 });
const flank = move('flankenwechsel', 1.2, [ball(1.2, 0, 3.5, 1.5, 135)], 1.0, {
  prepare(a) { a.side = a.r(0) < .5 ? -1 : 1; },
  motion(t,a) { const x = a.side * 4 * smooth(clamp01((t-.1)/.45)); return { x:a.origin.x+x*Math.cos(a.yaw0), z:a.origin.z-x*Math.sin(a.yaw0) }; },
});
const chase = move('jagdlauf', 1.1, [ball(1.1, 0, 2.5, 1.7, 160, {t1:1.55})], 1.3, { range:[6,40], weight:9, cooldown: 4,
  prepare(a) { a.length = Math.min(22, Math.max(0, Math.hypot(a.target.x-a.origin.x,a.target.z-a.origin.z)-2.5)); },
  motion(t,a) { const k=smooth(clamp01((t-1.1)/.45)); return {x:a.origin.x+a.dir.x*a.length*k,z:a.origin.z+a.dir.z*a.length*k}; },
  pose:mTrack([[0,{}],[.8,{bodyPitch:15,head:20,wing:30}],[1.1,{legL:50,legR:-50,bodyPitch:18}],[1.25,{legL:-50,legR:50,bodyPitch:18}],[1.4,{legL:50,legR:-50,bodyPitch:18}],[1.6,{bodyY:-.5,head:35,neck:.6,bodyPitch:20,wing:45}],[2.4,{bodyY:-.3,head:30,neck:.6,bodyPitch:15}],[2.85,{}]]),
});
function jump(broken = false) {
  const h=[ball(1.8,0,0,broken?3:4,175)]; if (!broken) h.push(line(2.65,-2,0,2,4,.9,140));
  return move(broken?'sprungsporne_bruch':'sprungsporne',1.8,h,broken?2:1.2,{phase:1,range:[3,30],kind:'jump',flashParts:['spur','wing'],cooldown:7, ...(broken?{needsBroken:'spur'}:{lockedByBreak:'spur'}),
    prepare(a) { const d=Math.hypot(a.target.x-a.origin.x,a.target.z-a.origin.z); a.length=Math.min(d,18); },
    motion(t,a) { const k=smooth(clamp01((t-.5)/1.3)); return {x:a.origin.x+a.dir.x*a.length*k,z:a.origin.z+a.dir.z*a.length*k,air:t<1.8?Math.sin(clamp01((t-.5)/1.3)*Math.PI)*5:0}; },
  });
}
function shout(broken=false) {
  const tg=broken?2.2:1.8;
  return move(broken?'kikeriki_heiser':'kikeriki',tg,[ball(tg,0,0,broken?8:12,broken?110:165,{...corrupt,staminaDrain:broken?30:60})],1.5,{phase:1,range:[0,18],seam:[.15,tg],cooldown:12,flashParts:['comb'],kind:'wing',...(broken?{needsBroken:'comb'}:{lockedByBreak:'comb'})});
}
const echo=move('versetzter_schnabel',.9,[ball(.9,0,3.5,1.5,130),ball(2,0,6,2,150,corrupt)],1.2,{phase:1,seam:[1,2],cooldown:5});
const rift=move('risssprung',2,[ball(2,0,0,4,190,corrupt)],1.6,{phase:2,range:[5,40],seam:[.15,1.7],kind:'jump',cooldown:7,
  prepare(a) { const d=Math.min(24,Math.hypot(a.target.x-a.origin.x,a.target.z-a.origin.z)); a.landing={x:a.origin.x+a.dir.x*d,z:a.origin.z+a.dir.z*d}; },
  motion(t,a) { const k=smooth(clamp01((t-1.55)/.45)); return {x:a.origin.x+(a.landing.x-a.origin.x)*k,z:a.origin.z+(a.landing.z-a.origin.z)*k,air:Math.sin(k*Math.PI)*3}; },
});
const signature=move('nahtsignatur',2.3,[line(2.3,-7,2,7,2,2,230,{...corrupt,dmgPct:.8,group:'split'}),line(2.3,0,-3,0,13,2,230,{...corrupt,dmgPct:.8,group:'split'})],2,{phase:2,seam:[.1,2.3],cooldown:14,kind:'wing'});

// ---- Wahre Form: Auge des Glitch. Kurze Strafenster, grosse Treffer fast toedlich; die Firewall faellt nur ueber Naht-Fenster.
const seamW = base => m => (m.eyeShield ? base * 3 : base);
const trueMove=(id,tg,hits,recovery,extra={})=>move(id,tg,hits,recovery,{cond:m=>m.gockelForm==='eye',range:[0,45],cooldown:6,cue:{color:'#73f3ed',tone:'droehn'},...extra});
const frames=trueMove('frames',1.1,[ball(1.1,-4,6,2.4,190,corrupt),ball(2.1,4,6,2.4,190,corrupt),ball(3.1,0,3,2.2,230)],.9,{kind:'wing',seam:[2.1,3.1],weight:seamW(4)});
const rollback=trueMove('rollback',1.5,[line(1.5,0,2,0,18,1.6,210),line(3,0,18,0,2,2,240,corrupt)],1,{seam:[1.7,3],weight:seamW(4),
  motion(t,a) { const k=smooth(clamp01((t-1.5)/.5))-smooth(clamp01((t-3)/.5));return {x:a.origin.x+a.dir.x*8*k,z:a.origin.z+a.dir.z*8*k}; },
});
const fracture=trueMove('raumbruch',2,[line(2,-7,-16,-7,20,2,230),line(2,7,-16,7,20,2,230),line(3.4,0,-16,0,20,1.7,260,corrupt)],.9,{kind:'wing',cooldown:9});
const cascade=trueMove('fehlerkaskade',1.1,[line(1.1,-5,2,2,5,1.2,180),ball(2.2,4,4,2.6,200),line(3.3,-5,8,5,8,1.3,230,corrupt)],1,{seam:[2.3,3.3],cooldown:8,weight:seamW(4)});
const crash=trueMove('absturz',2,[line(2,-9,4,9,4,1.4,220),line(3.4,-6,-8,-6,12,1.5,220),line(3.4,6,-8,6,12,1.5,220),ball(5,0,3.5,4,320,{dmgPct:.9,...corrupt})],2.5,{seam:[3.5,5],cooldown:16,weight:7,kind:'jump'});
// Speicherleck: das Auge blinkt dreimal auf den Pirscher und dessen Ausweichlinien (alle drei Einschlaege sind ab Start markiert).
const leak=trueMove('speicherleck',.9,[ball(.9,0,0,2.6,175),ball(1.85,0,0,2.6,175),ball(2.75,0,0,2.8,210,corrupt)],.9,{seam:[1.95,2.75],weight:seamW(5),audit:[6,10],
  prepare(a) {
    const sd=a.r(1)<.5?-1:1,sx=Math.cos(a.yaw0)*sd,sz=-Math.sin(a.yaw0)*sd,t=a.target;
    a.blinks=[{x:t.x,z:t.z},{x:t.x+sx*4.5+a.dir.x*3,z:t.z+sz*4.5+a.dir.z*3},{x:t.x-sx*4.5+a.dir.x*1.5,z:t.z-sz*4.5+a.dir.z*1.5}];
  },
  motion(t,a) { const i=t<.7?-1:t<1.65?0:t<2.55?1:2; if(i<0)return {}; const b=a.blinks[i]; return {x:b.x,z:b.z,air:t>=3.2?0:Math.max(0,.6-Math.abs(t-[.9,1.85,2.75][i])*2)}; },
});
// Nullsektor: ein einzelner Loeschstrahl faehrt in 1,1 s ueber 200 Grad - durchrollen oder hinter das Auge.
const sweep=trueMove('nullsektor',1,[line(1,0,2,0,22,1.1,200,{t1:2.1})],.9,{weight:4,cooldown:7,audit:[8],
  motion(t,a) { const k=clamp01((t-1)/1.1); return {yaw:a.yaw0+(-1.75+3.5*k)*(a.r(2)<.5?1:-1)}; },
});
// Ueberlauf: Gitter ueber die ganze Arena - Laengsbahnen, dann Querbahnen. Nur in den sicheren Zellen ueberleben.
const overflow=trueMove('ueberlauf',1.6,[-10,-3.3,3.3,10].map(x=>line(1.6,x,-22,x,22,1.6,220)).concat([-8,2,12].map(z=>line(2.8,-22,z,22,z,1.6,220,corrupt))),.9,
  {cooldown:12,weight:5,audit:[6],cond:m=>m.gockelForm==='eye' && m.hp<m.maxHp*(m.def?.eyePool??.42)*.7});
export const gockelAttacks=Object.fromEntries([peck,anchor,scratch,spur,wing,flank,chase,jump(),jump(true),shout(),shout(true),echo,rift,signature,frames,rollback,fracture,cascade,crash,leak,sweep,overflow].map(a=>[a.id,a]));
