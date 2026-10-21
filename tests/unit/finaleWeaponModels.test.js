import { describe,it,expect } from 'vitest';
import * as THREE from 'three';
import { WEAPON_ORDER } from '../../src/data/weapons.js';
import { getWeapon } from '../../src/game/weapons/index.js';

const signature=g=>{
  const p=g.attributes.position.array;
  let h=2166136261;
  for(let i=0;i<p.length;i++)h=Math.imul(h^Math.round(p[i]*1e4),16777619);
  return `${p.length}:${h>>>0}`;
};
const release=root=>{
  const geos=new Set(),mats=new Set();
  const visit=r=>r.traverse(o=>{if(o.isMesh){geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);}});
  visit(root);if(root.userData.offhand)visit(root.userData.offhand);
  for(const g of geos)g.dispose();for(const m of mats)m.dispose();
};
describe('Finale weapon silhouettes and real rigs',()=>{
  for(const type of WEAPON_ORDER)it(`${type}: four boss bodies have different geometry, not just different colours`,()=>{
    const signatures=[];
    for(const branch of ['p','f','i',null]){
      const root=getWeapon(type).buildMesh({tier:7,branch}),u=root.userData.transcendence;
      expect(u.aspect).toBe(branch??'u');expect(u.type).toBe(type);
      signatures.push(signature(u.body.geometry));
      const objects=[];root.traverse(o=>{if(o.isMesh)objects.push(o);});
      for(const o of objects){expect([...o.geometry.attributes.position.array].every(Number.isFinite)).toBe(true);}
      expect(u.body.geometry.attributes.position.count).toBeLessThan(8000);
      expect(root.userData.fx.reduce((n,s)=>n+s.rate,0)).toBeLessThanOrEqual(3);
      if(type==='db')expect(root.userData.offhand.userData.transcendence.aspect).toBe(branch??'u');
      release(root);
    }
    expect(new Set(signatures).size).toBe(4);
  });
  it('retains sockets and movable controls, while katana ornaments sheath with the blade',()=>{
    for(const type of WEAPON_ORDER){
      const def=getWeapon(type),base=def.buildMesh({tier:6,branch:'v'}),final=def.buildMesh({tier:7,branch:'i'});
      expect(final.userData.twoHand).toEqual(base.userData.twoHand);
      for(const k of ['muzzle','bow','kt','ga','kk','lb','db'])if(base.userData[k])expect(final.userData[k]).toBeTruthy();
      if(type==='kt')expect(final.userData.transcendence.body.parent).toBe(final.userData.kt.bladeG);
      if(type==='ga')for(const b of final.userData.ga.blocks)expect(b.ghost.geometry).toBe(b.mesh.geometry);
      if(type==='bow')expect(final.userData.bow.string.geometry.attributes.position.count).toBe(base.userData.bow.string.geometry.attributes.position.count);
      release(base);release(final);
    }
  });
  it('does not mutate or share a previous build when another boss family is created',()=>{
    for(const type of WEAPON_ORDER){
      const def=getWeapon(type),a=def.buildMesh({tier:7,branch:'p'}),before=signature(a.userData.transcendence.body.geometry);
      const b=def.buildMesh({tier:7,branch:'f'});
      expect(signature(a.userData.transcendence.body.geometry)).toBe(before);
      expect(a.userData.transcendence.body.geometry).not.toBe(b.userData.transcendence.body.geometry);
      expect(a.userData.transcendence.material).not.toBe(b.userData.transcendence.material);
      release(a);release(b);
    }
  });
});
