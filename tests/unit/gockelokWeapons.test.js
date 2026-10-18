import { describe,it,expect } from 'vitest';
import { gockelok } from '../../src/game/monsters/gockelok.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { Player } from '../../src/game/player.js';
import { Projectiles } from '../../src/game/projectiles.js';
import { resolvePlayerHit } from '../../src/game/combat.js';
import { makeCtx,DT } from './p3helpers.js';

describe('Gockelok real weapon paths',()=>{
  for(const weapon of ['gs','db','bow','kt','ga','kk','lb'])it(`${weapon} reaches the distinct seam through real weapon/projectile collision`,()=>{
    const ctx=makeCtx(),m=new Monster(gockelok,ctx,{state:'combat'}),p=new Player({ctx,weapon,tier:6});
    ctx.monsters.push(m);ctx.players.push(p);ctx.projectiles=new Projectiles(ctx,{visual:false});m.target=p;m.phase=2;p.god=true;
    m.beginAttack('gockelok_nahtsignatur',{tgMul:1});m.attack.t=.7;m._visuals(1);
    const idx=m.lockPoints().findIndex(q=>q.partId==='seam'),part=m.lockPoints()[idx].pos;
    const gap=['bow','lb'].includes(weapon)?8:1.2;
    p.spawnAt(part.x+gap,part.z);p.rot=-Math.PI/2;p.lock={monster:m,idx};
    let seamDamage=0;
    ctx.playerHit=(pl,monster,hp,ah)=>{
      const res=resolvePlayerHit({power:pl.stats.power,critChance:0,dmgMul:pl.dmgMul},ah.hit,hp.part,ctx.rng);
      res.attackerId=pl.id;if(res.partId==='seam')seamDamage+=res.dmg;monster.applyDamage(res);
    };
    // Hold the announced pose to isolate reachability from player timing.
    for(let i=0;i<240 && seamDamage===0;i++){
      const period=weapon==='bow'?21:weapon==='lb'?15:6;
      ctx.input.set('attack',i%period<3,'bot');ctx.input.poll(DT);p.update(DT);ctx.projectiles.update(DT);m._visuals(DT);
    }
    expect(seamDamage).toBeGreaterThan(0);
  });
});
