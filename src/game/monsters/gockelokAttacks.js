import { mTrack } from './monster.js';
import { smooth, clamp01 } from './common.js';
import { roosterAttacks } from './gockelokRoosterAttacks.js';

const ball = (t, x, z, r, dmg, extra = {}) => ({ t0: t, t1: t + .16, shape: 'sphere', at: [x, 1, z], radius: r, dmg, knock: 'down', ...extra });
const line = (t, x, z, xx, zz, r, dmg, extra = {}) => ({ t0: t, t1: t + .18, shape: 'capsule', from: [x, 1, z], to: [xx, 1, zz], radius: r, dmg, knock: 'flinch', noCollapse: true, ...extra });
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
    telegraph: tg, duration: end, hits, markerFromHits: true, markerLead: 1.65, tell:{kind:'physical',label:id.toUpperCase(),color:'#ffad52'}, flashParts: ['head'], cue: { color: '#ffb65b', tone: 'knurr' },
    pose: pose(tg, end, extra.kind), cond: m => m.gockelForm === 'rooster', ...extra };
}
const rooster = roosterAttacks(move,ball,line,corrupt);

// ---- Wahre Form: Auge des Glitch. Kurze Strafenster, grosse Treffer fast toedlich; die Firewall faellt nur ueber Naht-Fenster.
const seamW = base => m => (m.eyeShield ? base * 3 : base);
const trueMove=(id,tg,hits,recovery,extra={})=>move(id,tg,hits,recovery,{cond:m=>m.gockelForm==='eye',range:[0,45],cooldown:6,markerLead:2.1,cue:{color:'#73f3ed',tone:'droehn'},tell:{kind:'burst',label:id.toUpperCase(),color:'#ff825f'},...extra});
const frames=trueMove('frames',1.35,[ball(1.35,-4,6,2.4,190,corrupt),ball(2.1,4,6,2.4,190,corrupt),ball(3.1,0,3,2.2,230)],.9,{kind:'wing',seam:[2.1,3.1],weight:seamW(4)});
const rollback=trueMove('rollback',1.5,[line(1.5,0,2,0,18,1.6,210),line(3,0,18,0,2,2,240,corrupt)],1,{seam:[1.7,3],weight:seamW(4),
  motion(t,a) { const k=smooth(clamp01((t-1.5)/.5))-smooth(clamp01((t-3)/.5));return {x:a.origin.x+a.dir.x*8*k,z:a.origin.z+a.dir.z*8*k}; },
});
const fracture=trueMove('raumbruch',2,[line(2,-7,-16,-7,20,2,230),line(2,7,-16,7,20,2,230),line(3.4,0,-16,0,20,1.7,260,corrupt)],.9,{kind:'wing',cooldown:9});
const cascade=trueMove('fehlerkaskade',1.1,[line(1.1,-5,2,2,5,1.2,180),ball(2.2,4,4,2.6,200),line(3.3,-5,8,5,8,1.3,230,corrupt)],1,{seam:[2.3,3.3],cooldown:8,weight:seamW(4)});
const crash=trueMove('absturz',2,[line(2,-9,4,9,4,1.4,220),line(3.4,-6,-8,-6,12,1.5,220),line(3.4,6,-8,6,12,1.5,220),ball(5,0,3.5,4,320,{dmgPct:.9,...corrupt})],2.5,{tell:{kind:'collapse',label:'ABSTURZ',color:'#ff436e'},seam:[3.5,5],cooldown:16,weight:7,kind:'jump'});
// Speicherleck: das Auge blinkt dreimal auf den Pirscher und dessen Ausweichlinien (alle drei Einschlaege sind ab Start markiert).
const leak=trueMove('speicherleck',.9,[ball(.9,0,0,2.6,175),ball(1.85,0,0,2.6,175),ball(2.75,0,0,2.8,210,corrupt)],.9,{tell:{kind:'blink',label:'SPEICHERLECK',color:'#ff965c'},seam:[1.95,2.75],weight:seamW(5),audit:[6,10],
  prepare(a) {
    const sd=a.r(1)<.5?-1:1,sx=Math.cos(a.yaw0)*sd,sz=-Math.sin(a.yaw0)*sd,t=a.target;
    a.blinks=[{x:t.x,z:t.z},{x:t.x+sx*4.5+a.dir.x*3,z:t.z+sz*4.5+a.dir.z*3},{x:t.x-sx*4.5+a.dir.x*1.5,z:t.z-sz*4.5+a.dir.z*1.5}];
  },
  motion(t,a) { const i=t<.7?-1:t<1.65?0:t<2.55?1:2; if(i<0)return {}; const b=a.blinks[i]; return {x:b.x,z:b.z,air:t>=3.2?0:Math.max(0,.6-Math.abs(t-[.9,1.85,2.75][i])*2)}; },
});
// Nullsektor charges at the start angle, then sweeps 155 degrees over 1.6 seconds.
const sweep=trueMove('nullsektor',1.8,[line(1.8,0,2,0,22,1.1,200,{t1:3.4,fpSamples:26})],1.65,{weight:4,cooldown:9,audit:[8],tell:{kind:'sweep',label:'NULLSEKTOR',color:'#ff6f55'},
  motion(t,a) { const k=clamp01((t-1.8)/1.6); return {yaw:a.yaw0+(-1.35+2.7*k)*(a.r(2)<.5?1:-1)}; },
});
// A single held laser: the iris locks a visible lane for 1.8 seconds, fires, then lowers for a punish.
const irisLance=trueMove('irislanze',1.8,[line(1.8,0,2,0,32,1.05,225,{t1:2.2})],1.85,{
  range:[4,40],weight:seamW(6),cooldown:7,seam:[.35,1.8],tell:{kind:'laser',label:'IRISLANZE',color:'#ff6f55'},
});
// Ueberlauf: Gitter ueber die ganze Arena - Laengsbahnen, dann Querbahnen. Nur in den sicheren Zellen ueberleben.
const overflow=trueMove('ueberlauf',2.0,[-10,-3.3,3.3,10].map(x=>line(2.0,x,-22,x,22,1.35,205)).concat([-8,2,12].map(z=>line(3.4,-22,z,22,z,1.35,205,corrupt))),.9,
  {cooldown:14,weight:5,audit:[6],tell:{kind:'grid',label:'ÜBERLAUF',color:'#ff965c'},cond:m=>m.gockelForm==='eye' && m.hp<m.maxHp*(m.def?.eyePool??.42)*.7});
const vary=(a)=>{const weight=a.weight;a.weight=(m,d)=>{const base=typeof weight==='function'?weight(m,d):weight;return base*(m.lastGockelAttack===a.id ? .18 : 1);};return a;};
export const gockelAttacks=Object.fromEntries([...rooster,frames,rollback,fracture,cascade,crash,leak,sweep,irisLance,overflow].map(vary).map(a=>[a.id,a]));
