import { describe, it, expect } from 'vitest';
import { AttackInstance, groundReach } from '../../src/game/monsters/attack.js';
import { createAttackMarker } from '../../src/render/attackMarker.js';

const beam = {id:'test-laser',telegraph:1.8,duration:3,hits:[{t0:1.8,t1:2,shape:'capsule',from:[0,1,2],to:[0,1,36],radius:1.2,dmg:100}]};
const params = {attackId:beam.id,t0:0,origin:{x:10,y:100,z:20},yaw:.6,seed:42,tempoMul:1.3};
describe('precise charge telegraphs', () => {
  it('keeps a long laser a narrow capsule instead of merging it into a giant disc', () => {
    const inst=new AttackInstance(beam,params), marks=inst.telegraphs();
    expect(marks).toHaveLength(1);
    const mark=marks[0], hit=inst.hitsAt(inst.wall(1.8))[0].shape;
    expect(mark.ax).toBeCloseTo(hit.a.x); expect(mark.az).toBeCloseTo(hit.a.z);
    expect(mark.bx).toBeCloseTo(hit.b.x); expect(mark.bz).toBeCloseTo(hit.b.z);
    expect(Math.hypot(mark.bx-mark.ax,mark.bz-mark.az)).toBeCloseTo(34);
    expect(mark.r).toBeCloseTo(groundReach(1.2,1));
    expect(mark.t0).toBe(1.8);expect(mark.t1).toBe(2);
    expect(new AttackInstance(beam,params).telegraphs()).toEqual(marks);
  });
  it('uses inverse attack time for countdowns under tempo and rage', () => {
    for(const rage of [false,true]) {
      const inst=new AttackInstance(beam,{...params,rage,tgMul:1.2});
      for(const tau of [0,.7,1.8,1.95,2.6])expect(inst.tau(inst.wall(tau))).toBeCloseTo(tau);
      expect(inst.wall(inst.telegraphs()[0].t0)).toBeCloseTo(inst.firstHitTime());
    }
  });
  it('retains swept paths rather than collapsing them across the safe side of the arena', () => {
    const def={...beam,motion:(tau,a)=>({yaw:a.yaw0+(tau-1.8)*4})};
    const inst=new AttackInstance(def,params), marks=inst.telegraphs();
    expect(marks.length).toBeGreaterThan(3);
    expect(marks.every(m=>m.r<2)).toBe(true);
    expect(marks[0].t0).toBe(1.8);
    expect(marks.at(-1).t0).toBeGreaterThan(1.95);
    expect(marks[0].t1).toBeLessThan(marks.at(-1).t0);
  });
  it('keeps the full danger boundary fixed while charge fills, then removes the clock on impact', () => {
    const marker=createAttackMarker(34,1.6), uniforms=marker.material.uniforms;
    marker.userData.update(.25,false); marker.geometry.computeBoundingBox();
    const width=marker.geometry.boundingBox.max.x-marker.geometry.boundingBox.min.x;
    expect(width).toBeCloseTo(37.2);expect(uniforms.uProgress.value).toBe(.25);expect(uniforms.uActive.value).toBe(0);
    expect(marker.isMesh).toBe(true);expect(marker.children).toHaveLength(0);
    marker.userData.update(1,true);expect(marker.scale.x).toBe(1);expect(uniforms.uProgress.value).toBe(1);expect(uniforms.uActive.value).toBe(1);
    marker.userData.dispose();
  });
});
