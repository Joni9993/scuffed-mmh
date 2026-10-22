import { mTrack } from './monster.js';
import { smooth, clamp01 } from './common.js';

// Every route is fixed from the replicated attack snapshot. A new chain link can
// acquire a fresh aim, but none of these attacks steer after showing its lanes.
const distance=a=>Math.hypot(a.target.x-a.origin.x,a.target.z-a.origin.z);
const forward=(a,len,k,side=0)=>({x:a.origin.x+a.dir.x*len*k+Math.cos(a.yaw0)*side,z:a.origin.z+a.dir.z*len*k-Math.sin(a.yaw0)*side});
const step=(t,start,end)=>smooth(clamp01((t-start)/(end-start)));
const lower={bodyY:-.25,bodyPitch:19,neck:.6,head:35,wing:18};
function peckTrack(times,end) {
  const frames=[[0,{}]];
  for(const [i,t] of times.entries())frames.push([t-.19,{bodyPitch:-12,neck:-.25,head:-30,wing:25,headYaw:i%2?-15:15}],[t+.07,{...lower,bodyRoll:i%2?-10:10}],[t+.24,lower]);
  frames.push([end-.4,lower],[end,{}]);return mTrack(frames);
}
export function roosterAttacks(move,ball,line,corrupt) {
  const peck=move('maschinenpicken',.62,[
    line(.62,-1.6,2,1.5,4.2,1.25,110),
    line(1.10,1.9,1.7,-1.8,4.6,1.3,120),
    line(1.62,-.5,1.4,.7,5.6,1.5,150),
  ],.78,{range:[0,9],weight:7,cooldown:2.4,
    prepare(a){a.length=Math.min(4.5,Math.max(0,distance(a)-3));},
    motion(t,a){return forward(a,a.length,step(t,.50,1.67));},
    pose:peckTrack([.62,1.10,1.62],2.58),
  });
  const anchor=move('schnabelanker',1.05,[line(1.05,0,1,0,5.8,1.85,195)],1.35,{range:[0,12],weight:3,seam:[.15,1.05],cooldown:7,
    prepare(a){a.length=Math.min(6,Math.max(0,distance(a)-4));},
    motion(t,a){return forward(a,a.length,step(t,.78,1.13));},pose:peckTrack([1.05],2.58),
  });
  const scratch=move('scharrhieb',.62,[line(.62,-3.4,0,2.8,4.8,1.25,125),line(1.19,3.4,.2,-2.8,4.8,1.25,135)],.82,{
    range:[0,8],kind:'jump',flashParts:['legs'],cooldown:3.5,weight:6,
    prepare(a){a.length=Math.min(3,Math.max(0,distance(a)-2.8));},motion(t,a){return forward(a,a.length,step(t,.5,1.23));},
    pose:mTrack([[0,{}],[.42,{bodyY:-.5,legL:60,wing:45}],[.7,{legL:75,bodyPitch:-12,wing:55}],[.98,{legL:-20,legR:65,bodyRoll:18}],[1.27,{legR:80,bodyPitch:-10}],[1.65,lower],[2.19,{}]]),
  });
  const spur=move('spornstich',.68,[line(.68,-1.3,.5,1.2,6,1.15,155),line(1.20,1.7,.8,-1.6,5.8,1.1,130)],.85,{
    range:[0,10],kind:'jump',flashParts:['spur'],cooldown:4,weight:5,lockedByBreak:'spur',
    prepare(a){a.length=Math.min(4.5,Math.max(0,distance(a)-3.7));},motion(t,a){return forward(a,a.length,step(t,.60,1.24));},
    pose:mTrack([[0,{}],[.48,{bodyY:-.4,legL:45,wing:40}],[.74,{legL:85,legR:50,bodyPitch:-20,wing:65}],[1.02,{legL:10,legR:60,bodyRoll:-15}],[1.28,{legR:90,bodyPitch:-16}],[1.65,lower],[2.23,{}]]),
  });
  const wing=move('fluegelfeger',.72,[line(.72,-4.8,-1,1,4.4,1.45,130),line(1.34,4.8,-1,-1,4.4,1.45,145)],.82,{
    noFace:true,kind:'wing',flashParts:['wing'],range:[0,9],cooldown:4,weight:6,
    pose:mTrack([[0,{}],[.52,{wing:78,bodyRoll:-25,head:-20}],[.80,{wing:-45,bodyRoll:30,bodyPitch:10}],[1.12,{wing:75,bodyRoll:28}],[1.42,{wing:-45,bodyRoll:-30}],[1.8,lower],[2.34,{}]]),
  });
  const flank=move('flankenwechsel',.85,[line(.85,-2.5,1,2.7,5.1,1.35,140)],.8,{range:[2,16],weight:5,cooldown:4,
    prepare(a){a.side=a.r(0)<.5?-1:1;a.length=Math.min(8,Math.max(0,distance(a)-3));a.turn=-Math.atan2(a.side*3.1,Math.max(3,distance(a)-a.length));},
    motion(t,a){const k=step(t,.15,.80);return {...forward(a,a.length,k,a.side*3.1*k),yaw:a.yaw0+a.turn*k};},
  });
  const chase=move('jagdlauf',.66,[line(.66,-1.4,.5,1.4,4.2,1.4,155,{t1:1.18,fpSamples:14}),line(1.32,-1.5,1,1.5,5,1.6,170)],.88,{
    range:[6,40],weight:(m,d)=>d>11?12:6,cooldown:3.2,
    prepare(a){a.length=Math.min(26,Math.max(0,distance(a)-2.8));},motion(t,a){return forward(a,a.length,step(t,.66,1.18));},
    pose:mTrack([[0,{}],[.46,{bodyY:-.4,bodyPitch:22,head:20,wing:35}],[.66,{legL:65,legR:-50,bodyPitch:20,head:15}],[.80,{legL:-55,legR:70,bodyPitch:20}],[.94,{legL:70,legR:-55,bodyPitch:20}],[1.08,{legL:-55,legR:70,bodyPitch:20}],[1.25,{neck:-.3,head:-28,wing:40}],[1.4,lower],[1.88,lower],[2.38,{}]]),
  });
  const claw=move('krallensprung',.72,[line(.98,-2.3,.7,2.3,4.8,1.4,175),line(1.47,3.6,-.2,-3,4.3,1.25,145)],.85,{
    range:[3,34],weight:(m,d)=>d>9?11:6,cooldown:4.5,kind:'jump',flashParts:['legs','spur','wing'],tell:{kind:'leap',label:'KRALLENSPRUNG',color:'#ffb04f'},
    prepare(a){a.length=Math.min(30,Math.max(0,distance(a)-1.8));a.landing=forward(a,a.length,1);},
    motion(t,a){const k=step(t,.42,.98);return {...forward(a,a.length,k),air:t<.98?Math.sin(k*Math.PI)*3.4:0};},
    pose:mTrack([[0,{}],[.34,{bodyY:-.65,bodyPitch:16,legL:30,legR:30,wing:60}],[.48,{bodyY:.1,bodyPitch:-18,legL:45,legR:45,wing:85}],[.76,{bodyPitch:-28,legL:75,legR:70,wing:65,spread:.25}],[1.05,{bodyY:-.6,bodyPitch:10,legL:70,legR:65,wing:40}],[1.28,{bodyY:-.3,bodyRoll:23,legL:-20,legR:55,wing:55}],[1.53,{bodyPitch:12,bodyRoll:-22,legR:80,wing:25}],[1.86,lower],[2.50,{}]]),
  });
  const featherHits=[];
  // Complementary salvos: centre/outer lanes, then their gaps, then a wide X.
  // Capsule lanes are both the damage and warning source; no invisible missiles.
  for(const x of [-9,0,9])featherHits.push(line(.85,x*.16,3,x,32-Math.abs(x)*.25,.85,100));
  for(const x of [-14,-4.5,4.5,14])featherHits.push(line(1.42,x*.12,3,x,31-Math.abs(x)*.2,.85,110));
  for(const x of [-11,11])featherHits.push(line(1.98,-x*.10,3,x,29,1,130));
  const feathers=move('federhagel',.85,featherHits,.92,{range:[5,36],weight:7,cooldown:7,flashParts:['wing'],kind:'wing',
    tell:{kind:'feathers',label:'FEDERHAGEL',color:'#ffc169'},
    pose:mTrack([[0,{}],[.60,{wing:85,bodyY:-.3,bodyPitch:-10,head:-15}],[.94,{wing:-35,bodyPitch:18,bodyRoll:-12}],[1.20,{wing:82,bodyPitch:-10}],[1.51,{wing:-40,bodyPitch:18,bodyRoll:12}],[1.77,{wing:90,bodyPitch:-15}],[2.08,{wing:-45,bodyPitch:25,bodyY:-.45}],[2.50,lower],[3.08,{}]]),
  });
  function jump(broken=false) {
    const hits=[ball(1.12,0,1.6,broken?3.2:4.1,broken?155:180)];
    if(!broken)hits.push(line(1.73,-3.5,-.4,3.5,4.6,1.25,145));
    return move(broken?'sprungsporne_bruch':'sprungsporne',1.12,hits,broken?1.55:.95,{phase:1,range:[3,30],kind:'jump',flashParts:['spur','wing'],cooldown:6,...(broken?{needsBroken:'spur'}:{lockedByBreak:'spur'}),
      prepare(a){a.length=Math.min(distance(a),23);a.landing=forward(a,a.length,1);},
      motion(t,a){const k=step(t,.45,1.12);return {...forward(a,a.length,k),air:t<1.12?Math.sin(k*Math.PI)*4.4:0};},
    });
  }
  function shout(broken=false) {
    const tg=broken?1.65:1.22;
    return move(broken?'kikeriki_heiser':'kikeriki',tg,[ball(tg,0,0,broken?7:10,broken?100:155,{...corrupt,staminaDrain:broken?25:50})],1.15,{phase:1,range:[0,16],seam:[.15,tg],cooldown:12,flashParts:['comb'],kind:'wing',...(broken?{needsBroken:'comb'}:{lockedByBreak:'comb'})});
  }
  const echo=move('versetzter_schnabel',.72,[line(.72,-1.6,1.8,1.6,4.5,1.35,130),line(1.45,2.5,1,-2.5,6,1.6,155,corrupt)],.85,{phase:1,range:[0,12],seam:[.85,1.45],cooldown:4.5,
    prepare(a){a.length=Math.min(5,Math.max(0,distance(a)-3));},motion(t,a){return forward(a,a.length,step(t,.65,1.5));},pose:peckTrack([.72,1.45],2.48),
  });
  const rift=move('risssprung',1.15,[ball(1.15,0,0,4.2,195,corrupt)],1.15,{phase:2,range:[5,40],seam:[.15,.96],kind:'jump',cooldown:7,
    prepare(a){a.length=Math.min(30,distance(a));a.landing=forward(a,a.length,1);},
    motion(t,a){const k=step(t,.70,1.15);return {...forward(a,a.length,k),air:Math.sin(k*Math.PI)*3};},
  });
  const signature=move('nahtsignatur',1.8,[line(1.8,-8,2,8,2,1.8,230,{...corrupt,dmgPct:.8,group:'split'}),line(1.8,0,-4,0,15,1.8,230,{...corrupt,dmgPct:.8,group:'split'})],1.5,{phase:2,seam:[.1,1.8],cooldown:14,kind:'wing'});
  const whirl=move('hahnenwirbel',.72,[line(.72,-4.8,-2,1.4,4.6,1.45,145),line(1.30,4.8,-2,-1.4,4.6,1.45,160,corrupt),line(1.94,-3.3,3.8,3.3,3.8,1.4,170)],1.0,{
    phase:1,range:[0,10],weight:6,cooldown:7,noFace:true,kind:'wing',flashParts:['wing'],seam:[1.43,1.94],
    pose:mTrack([[0,{}],[.5,{wing:80,bodyRoll:-30}],[.8,{wing:-45,bodyRoll:32}],[1.09,{wing:80,bodyRoll:30}],[1.38,{wing:-45,bodyRoll:-32}],[1.7,{wing:80,bodyPitch:-15}],[2.03,{wing:-45,bodyPitch:28,bodyY:-.5}],[2.6,lower],[3.12,{}]]),
  });
  const crow=move('kraehenschnitt',1.05,[line(1.05,0,2,0,34,1.45,175,corrupt)],1.05,{phase:1,range:[8,40],weight:(m,d)=>d>12?8:4,cooldown:6,flashParts:['comb'],kind:'wing',seam:[.2,1.05],tell:{kind:'laser',label:'KRÄHENSCHNITT',color:'#ffad52'}});
  const fan=move('kraehenfaecher',1.15,[line(1.15,0,2,0,32,1.2,170,corrupt),line(1.86,0,2,-12,30,1.2,165,corrupt),line(1.86,0,2,12,30,1.2,165,corrupt)],1.1,{phase:2,range:[8,40],weight:5,cooldown:9,flashParts:['comb'],kind:'wing',seam:[1.29,1.86],tell:{kind:'laser',label:'KRÄHENFÄCHER',color:'#ffad52'}});
  return [peck,anchor,scratch,spur,wing,flank,chase,claw,feathers,jump(),jump(true),shout(),shout(true),echo,whirl,crow,fan,rift,signature]
    .map(a => ({ ...a, followGround: true }));
}
