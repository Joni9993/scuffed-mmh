import { describe,it,expect } from 'vitest';
import * as THREE from 'three';
import { ARMOR_SETS,ARMOR_PIECES,SKILLS,SLOTS } from '../../src/data/armor.js';
import { ITEMS } from '../../src/data/items.js';
import { armorSkills,skillEffects,armorProtection } from '../../src/meta/loadout.js';
import { craftArmor,equipArmor } from '../../src/meta/crafting.js';
import { defaultSave,sanitize } from '../../src/meta/save.js';
import { applyLoadout } from '../../src/game/loadout.js';
import { Player } from '../../src/game/player.js';
import { makeCtx } from './p3helpers.js';
import { GearParts } from '../../src/render/gearfx.js';
import { buildArmor,ARMOR_BUILDERS } from '../../src/game/gear/armor.js';
import { buildHunterRig } from '../../src/game/rig.js';
import { encodeGear,decodeGear } from '../../src/data/gearlook.js';

const sets=['pyrostur','felsengroll','voltiris','gockelok'];
const outfit=set=>Object.fromEntries(SLOTS.map(slot=>[slot,`${set}_${slot}`]));
const lo=set=>({weapon:{type:'gs',tier:1,branch:null},armor:outfit(set),items:[],food:null});
describe('Final-map armour trophies',()=>{
  it('crafts all twelve pieces atomically using real own-boss materials and keeps equipment through save/net',()=>{
    for(const set of sets){
      expect(ARMOR_SETS[set].prot).toBeGreaterThan(50);expect(ARMOR_SETS[set].prot).toBeLessThanOrEqual(68);
      const save=defaultSave();
      for(const slot of SLOTS){
        const id=`${set}_${slot}`,piece=ARMOR_PIECES[id],before=JSON.stringify(save);
        expect(craftArmor(save,id).ok).toBe(false);expect(JSON.stringify(save)).toBe(before);
        expect(Object.keys(piece.cost).some(k=>k.startsWith(set==='gockelok'?'gockel_':`${set}_`))).toBe(true);
        for(const [key,n] of Object.entries(piece.cost)){expect(n).toBeGreaterThan(0);if(key==='schrott')save.schrott+=n;else{expect(ITEMS[key]).toBeTruthy();save.box[key]=(save.box[key]??0)+n;}}
        expect(craftArmor(save,id).ok).toBe(true);expect(equipArmor(save,id).ok).toBe(true);
        const after=JSON.stringify(save);expect(craftArmor(save,id).reason).toBe('owned');expect(JSON.stringify(save)).toBe(after);
      }
      expect(sanitize(JSON.parse(JSON.stringify(save))).loadout.armor).toEqual(outfit(set));
      expect(decodeGear(encodeGear({armor:outfit(set)})).armor).toEqual(outfit(set));
    }
  });
  it('has distinct capped disciplines, with mixed equipment combining only its own pieces',()=>{
    for(const [set,skill] of [['pyrostur','kesselherz'],['felsengroll','weltenpanzer'],['voltiris','prismenpakt'],['gockelok','urcode']]){
      expect(armorSkills(outfit(set))).toEqual({[skill]:3});expect(SKILLS[skill].max).toBe(3);
      expect(armorProtection(outfit(set))).toBe(ARMOR_SETS[set].prot*3);
    }
    expect(armorSkills({head:'pyrostur_head',body:'voltiris_body',legs:'gockelok_legs'})).toEqual({kesselherz:1,prismenpakt:1,urcode:1});
    expect(skillEffects({weltenpanzer:99}).partDmgMul).toBeCloseTo(1.24);
    expect(skillEffects(armorSkills(outfit('pyrostur')))).toMatchObject({lowHealthAtk:.12,fireResist:.36});
    expect(skillEffects(armorSkills(outfit('felsengroll')))).toMatchObject({guardStamMul:.76,partDmgMul:1.24});
    expect(skillEffects(armorSkills(outfit('voltiris')))).toMatchObject({crit:.12,perfectStamina:12});
    expect(skillEffects(armorSkills(outfit('gockelok')))).toMatchObject({counterBuff:{atk:.18,dur:8},realityStatusMul:.85});
  });
  it('applies real damage/resistance effects and safely replaces them without stacking or free healing',()=>{
    const p=new Player({ctx:makeCtx()});applyLoadout(p,lo('pyrostur'));expect(p.resist.fire).toBeCloseTo(.36);expect(p.lowHealthAtk).toBe(.12);
    p.v.hp=20;applyLoadout(p,lo('felsengroll'),{reapply:true});expect(p.v.hp).toBe(20);expect(p.lowHealthAtk).toBe(0);expect(p.resist.fire).toBe(0);
    expect(p.guardStamMul).toBeCloseTo(.76);expect(p.stats.partDmgMul).toBeCloseTo(1.24);
    applyLoadout(p,lo('felsengroll'),{reapply:true});expect(p.stats.partDmgMul).toBeCloseTo(1.24);
    applyLoadout(p,lo('voltiris'),{reapply:true});expect(p.stats.crit).toBeCloseTo(.17);expect(p.perfectStamina).toBe(12);expect(p.guardStamMul).toBe(1);
    applyLoadout(p,lo('gockelok'),{reapply:true});expect(p.counterBuff).toEqual({atk:.18,dur:8});
    for(const [status,base] of [['poison',12],['burn',10],['mud',25],['rost',20]]){p.clearStatus();p.addStatus(status);expect(p.status[status].t).toBeCloseTo(base*.85);}
    p.clearStatus();p.addStatus('schleim');expect(p.status.schleim.t).toBe(2); // never shorten a harmful explosion's escape fuse
    p.clearStatus();p.addStatus('blend');expect(p.status.blend.white).toBeCloseTo(.85);expect(p.status.blend.stun).toBeCloseTo(.85);
    applyLoadout(p,{...lo('gockelok'),armor:outfit('lumpen')},{reapply:true});expect(p.counterBuff).toBeNull();expect(p.perfectStamina).toBe(0);expect(p.stats.partDmgMul).toBe(1);
  });
  it('builds four different silhouettes on the real animated joints at the same draw budget',()=>{
    const signatures=[];
    for(const set of sets){
      const parts=Object.fromEntries(['head','torso','armR','armL','legL','legR'].map(j=>[j,new GearParts()]));
      expect(ARMOR_BUILDERS[set]).toBeTruthy();buildArmor(parts,outfit(set),'#ffffff');
      const geos=Object.values(parts).map(P=>P.merge());
      for(const g of geos){expect(g.attributes.position.count).toBeGreaterThan(0);expect([...g.attributes.position.array].every(Number.isFinite)).toBe(true);}
      const sig=geos.map(g=>{g.computeBoundingBox();return g.boundingBox.getSize(new THREE.Vector3()).toArray().map(n=>n.toFixed(3)).join(',');}).join('|');
      signatures.push(sig);geos.forEach(g=>g.dispose());
      const rig=buildHunterRig({merged:true,gear:{armor:outfit(set)}});let draws=0;rig.root.traverse(o=>{if(o.isMesh&&o.visible)draws++;});expect(draws).toBeLessThanOrEqual(7);
      rig.dispose?.();
    }
    expect(new Set(signatures).size).toBe(4);
  });
});
