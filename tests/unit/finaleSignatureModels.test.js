import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { getWeapon } from '../../src/game/weapons/index.js';

// Rasterize projected triangles, ignoring their materials. This verifies that
// family identity survives distance and grayscale, rather than hashing details.
function silhouette(geometry,axes,bounds,size=80) {
  const p=geometry.attributes.position,index=geometry.index,mask=new Uint8Array(size*size);
  const point=i=>[(p.getComponent(i,axes[0])-bounds[0])/(bounds[1]-bounds[0])*size,
    (p.getComponent(i,axes[1])-bounds[2])/(bounds[3]-bounds[2])*size];
  for(let i=0;i<(index?.count??p.count);i+=3) {
    const [a,b,c]=[0,1,2].map(k=>point(index?index.getX(i+k):i+k));
    const cross=(u,v,w)=>(v[0]-u[0])*(w[1]-u[1])-(v[1]-u[1])*(w[0]-u[0]);
    const area=cross(a,b,c);if(Math.abs(area)<1e-8)continue;
    const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),x1=Math.min(size-1,Math.ceil(Math.max(a[0],b[0],c[0])));
    const y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),y1=Math.min(size-1,Math.ceil(Math.max(a[1],b[1],c[1])));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) {
      const q=[x+.5,y+.5],u=cross(a,b,q)/area,v=cross(b,c,q)/area,w=cross(c,a,q)/area;
      if(u>=0&&v>=0&&w>=0)mask[y*size+x]=1;
    }
  }
  return mask;
}
function overlap(a,b) {
  let intersection=0,union=0;
  for(let i=0;i<a.length;i++){intersection+=a[i]&&b[i]?1:0;union+=a[i]||b[i]?1:0;}
  return intersection/union;
}
const area=mask=>mask.reduce((sum,n)=>sum+n,0);
const extent=g=>{g.computeBoundingBox();return g.boundingBox.getSize(new THREE.Vector3());};

describe('complete finale katana and Krachkiste constructions',()=>{
  for(const type of ['kt','kk'])it(`${type}: boss silhouettes differ without colour or tiny ornaments`,()=>{
    const masks=['p','f','i','u'].map(branch=>{
      const body=getWeapon(type).buildMesh({tier:7,branch}).userData.transcendence.body;
      return silhouette(body.geometry,type==='kt'?[1,2]:[0,1],type==='kt'?[-2.1,-.16,-.6,.8]:[-.9,.9,-2.35,-.74]);
    });
    for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)expect(overlap(masks[a],masks[b])).toBeLessThan(.78);
    if(type==='kt')expect(area(masks[1])).toBeGreaterThan(area(masks[2])*1.8);
  });
  it('keeps a broad stone nodachi, thin prism saber and a reverse-curved crow blade',()=>{
    const body=branch=>getWeapon('kt').buildMesh({tier:7,branch}).userData.transcendence.body.geometry;
    const stone=body('f'),prism=body('i'),fire=body('p'),crow=body('u');
    expect(extent(stone).x).toBeGreaterThan(extent(prism).x*2);
    fire.computeBoundingBox();crow.computeBoundingBox();
    expect(fire.boundingBox.min.z).toBeLessThan(-.45);
    expect(crow.boundingBox.max.z).toBeGreaterThan(.5);
    expect(crow.boundingBox.min.z).toBeGreaterThan(-.14);
  });
  it('keeps the open tuning fork narrower than the suspended stone gong',()=>{
    const gong=getWeapon('kk').buildMesh({tier:7,branch:'f'}).userData.kk.main;
    const fork=getWeapon('kk').buildMesh({tier:7,branch:'i'}).userData.kk.main;
    expect(extent(gong.geometry).x).toBeGreaterThan(extent(fork.geometry).x*2);
    // In the lower fork, its centre really is empty (not a painted black panel).
    const mask=silhouette(fork.geometry,[0,1],[-.3,.3,-2.15,-1.65],40);
    for(let y=0;y<40;y++)expect(mask[y*40+20]).toBe(0);
  });
  it('sheaths the whole new blade and aura, with a matching saya on the original mount',()=>{
    const def=getWeapon('kt'),base=def.buildMesh({tier:6,branch:'v'});
    for(const branch of ['p','f','i','u']) {
      const root=def.buildMesh({tier:7,branch}),d=root.userData.kt;
      expect(d.bladeG.children).toEqual([root.userData.transcendence.body,d.shell]);
      expect(root.userData.halo).toBeUndefined();
      expect(d.hip.position.toArray()).toEqual(base.userData.hip.position.toArray());
      expect(d.hip.quaternion.toArray()).toEqual(base.userData.hip.quaternion.toArray());
      expect(d.hip.children).toHaveLength(1);
      expect(d.hip.children[0].name).toBe('finale-katana-saya');
      const w={data:{schliff:3},move:{anim:'kt_iaido'},t:0};
      def.updateMesh(w,root,.1,{});expect(d.bladeG.visible).toBe(false);
      w.move.anim='kt_zieh';w.t=.05;def.updateMesh(w,root,.1,{});
      expect(d.bladeG.visible).toBe(true);expect(d.shell.visible).toBe(true);
      expect(d.bladeMat.emissive.r+d.bladeMat.emissive.g+d.bladeMat.emissive.b).toBeGreaterThan(0);
    }
  });
  it('plays each instrument through its real moving pivots, membrane and three sampler slots',()=>{
    const def=getWeapon('kk'),base=def.buildMesh({tier:6,branch:'v'});
    for(const branch of ['p','f','i','u']) {
      const root=def.buildMesh({tier:7,branch}),d=root.userData.kk;
      expect(d.slots.map(s=>s.sp.position.toArray())).toEqual(base.userData.kk.slots.map(s=>s.sp.position.toArray()));
      expect(d.mem.mesh.parent).toBe(root);
      expect(d.mem.mesh.position.z).toBeLessThan(-.3);
      const w={data:{kk:{bar:['r','b','g'],pump:1,pumpC:'b'}},move:{anim:'kk_remix'},t:.3};
      def.updateMesh(w,root,.1,{});
      expect(d.slots.map(s=>s.cell)).toEqual([1,2,3]);
      expect(d.pivots.some(p=>Math.abs(p.g.rotation.z)>.03)).toBe(true);
      expect(d.mem.mesh.scale.z).toBeGreaterThan(1);
      for(const p of d.pivots) {
        expect(p.g.children).toHaveLength(1);
        expect(p.g.children[0].geometry.attributes.position.count).toBeLessThan(8000);
      }
    }
  });
});
