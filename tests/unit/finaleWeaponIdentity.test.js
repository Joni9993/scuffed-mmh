import { describe,it,expect } from 'vitest';
import * as THREE from 'three';
import { finaleBody } from '../../src/game/gear/finaleWeaponModels.js';
import { getWeapon } from '../../src/game/weapons/index.js';
import { updateGlitchaxtLook } from '../../src/game/gear/glitchaxtLook.js';

// Orthographic triangle coverage measures the actual silhouette, ignoring colour,
// vertex order and hidden interior detail. Both views share a fixed world scale.
function profile(meshes,axes) {
  const size=150,pixels=new Set(),v=new THREE.Vector3(),scale=48,origin=[75,98];
  const edge=(a,b,x,y)=>(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);
  for(const mesh of meshes) {
    mesh.updateWorldMatrix(true,false);
    const g=mesh.geometry,p=g.attributes.position,index=g.index;
    for(let j=0;j<(index?.count??p.count);j+=3) {
      const tri=[];
      for(let k=0;k<3;k++) {
        v.fromBufferAttribute(p,index?index.getX(j+k):j+k).applyMatrix4(mesh.matrixWorld);
        tri.push([origin[0]+v.getComponent(axes[0])*scale,origin[1]+v.getComponent(axes[1])*scale]);
      }
      if(Math.abs(edge(tri[0],tri[1],...tri[2]))<1e-5)continue;
      const xmin=Math.max(0,Math.floor(Math.min(...tri.map(v=>v[0])))),xmax=Math.min(size-1,Math.ceil(Math.max(...tri.map(v=>v[0]))));
      const ymin=Math.max(0,Math.floor(Math.min(...tri.map(v=>v[1])))),ymax=Math.min(size-1,Math.ceil(Math.max(...tri.map(v=>v[1]))));
      for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++) {
        const signs=tri.map((a,i)=>edge(a,tri[(i+1)%3],x+.5,y+.5));
        if(signs.every(s=>s>=0)||signs.every(s=>s<=0))pixels.add(y*size+x);
      }
    }
  }
  return pixels;
}
function overlap(a,b) {
  let common=0;for(const pixel of a)if(b.has(pixel))common++;
  return common/(a.size+b.size-common);
}
const meshFor=(type,aspect,mirror=1)=>new THREE.Mesh(finaleBody(type,aspect,mirror));
const aspects=['p','f','i','u'];

describe('Finale weapon construction identity',()=>{
  for(const type of ['db','lb'])it(`${type}: every family has a distinct colour-independent projected contour`,()=>{
    const meshes=aspects.map(a=>meshFor(type,a));
    const profiles=meshes.map(m=>[[0,1],[2,1]].map(axes=>profile([m],axes)));
    for(let a=0;a<4;a++)for(let b=a+1;b<4;b++) {
      const similarity=profiles[a].map((p,i)=>overlap(p,profiles[b][i]));
      expect(Math.min(...similarity),`${type} ${aspects[a]}/${aspects[b]} profile overlap`).toBeLessThan(.73);
    }
    for(const m of meshes)m.geometry.dispose();
  });
  it('Voltiris dual blades are an asymmetric needle and swept prism',()=>{
    const lead=meshFor('db','i',1),off=meshFor('db','i',-1);
    expect(overlap(profile([lead],[0,1]),profile([off],[0,1]))).toBeLessThan(.65);
    lead.geometry.dispose();off.geometry.dispose();
  });
  it('axe families retain distinct head mass in both real morph poses',()=>{
    const rigs=aspects.map(a=>getWeapon('ga').buildMesh({tier:7,branch:a==='u'?null:a}));
    for(const mode of ['axt','schwert']) {
      for(const rig of rigs)updateGlitchaxtLook(rig,{mode,druck:0,glitch:false},2);
      const profiles=rigs.map(rig=>{
        rig.updateMatrixWorld(true);
        return [[0,1],[2,1]].map(axes=>profile(rig.userData.ga.blocks.map(b=>b.mesh),axes));
      });
      for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)
        expect(Math.min(...profiles[a].map((p,i)=>overlap(p,profiles[b][i]))),`${mode} ${aspects[a]}/${aspects[b]}`).toBeLessThan(.8);
      for(const rig of rigs) {
        const box=new THREE.Box3();
        for(const b of rig.userData.ga.blocks)box.union(new THREE.Box3().setFromObject(b.mesh));
        expect(box.getSize(new THREE.Vector3()).length()).toBeLessThan(2.7);
        for(const b of rig.userData.ga.blocks)expect(b.ghost.geometry).toBe(b.mesh.geometry);
      }
    }
    for(const rig of rigs) {
      const geos=new Set(),mats=new Set();rig.traverse(o=>{if(o.isMesh){geos.add(o.geometry);mats.add(o.material);}});
      for(const g of geos)g.dispose();for(const m of mats)m.dispose();
    }
  });
  it('keeps practical grip, muzzle and mesh budgets',()=>{
    for(const type of ['db','lb'])for(const aspect of aspects) {
      const g=finaleBody(type,aspect);g.computeBoundingBox();
      expect(g.attributes.position.count).toBeLessThan(6000);
      expect(g.boundingBox.max.y).toBeGreaterThan(.28);
      expect(g.boundingBox.max.y).toBeLessThan(.65);
      expect(g.boundingBox.min.y).toBeGreaterThan(-1.4);
      expect(g.boundingBox.min.y).toBeLessThan(-.85);
      expect(g.boundingBox.max.x-g.boundingBox.min.x).toBeLessThan(type==='db'?.85:1.5);
      expect([...g.attributes.position.array].every(Number.isFinite)).toBe(true);
      g.dispose();
    }
  });
});
