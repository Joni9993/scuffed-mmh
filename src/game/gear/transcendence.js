import * as THREE from 'three';
import { finaleBody, finaleAxeBlock, finaleCrest, finaleMaterial, FINALE_PALETTES } from './finaleWeaponModels.js';

const ASPECTS=new Set(['p','f','i']);
export const finaleAspect = branch => ASPECTS.has(branch)?branch:'u';

/** Replace the physical body while retaining the weapon's real animation rig and sockets.
 * The same geometry is used in hand, on the back, in previews and on remote hunters. */
export function addTranscendence(root,type,mirror=1,aspect='u') {
  if(!root||root.userData.transcendence)return root;
  const material=finaleMaterial(aspect),oldGeometries=new Set();
  const replace=(mesh,geometry)=>{if(!mesh){geometry.dispose();return;}oldGeometries.add(mesh.geometry);mesh.geometry=geometry;};
  let body;
  if(type==='ga') {
    const g=root.userData.ga;
    replace(g.shaft,finaleBody(type,aspect));
    for(const [i,b] of g.blocks.entries()) {
      const geometry=finaleAxeBlock(aspect,i);replace(b.mesh,geometry);replace(b.ghost,geometry);
    }
    body=g.shaft;
  } else if(type==='kt') {
    // A sheathed blade must hide all its boss details too, hence the existing bladeG pivot.
    body=new THREE.Mesh(finaleBody(type,aspect),material);body.name='finale-katana-edge';root.userData.kt.bladeG.add(body);
  } else {
    body=type==='kk'?root.userData.kk.main:root.children.find(o=>o.isMesh&&!o.material?.transparent);
    replace(body,finaleBody(type,aspect,mirror));
  }
  for(const geometry of oldGeometries)geometry.dispose();
  const ornament=new THREE.Mesh(finaleCrest(type,aspect),material);ornament.name='finale-'+aspect+'-crest';
  ornament.position.set(type==='bow'?.08:0,type==='kk'?-.86:type==='kt'?-.1:-.23,type==='kt'?.08:.06);
  if(mirror<0)ornament.scale.x=-1;root.add(ornament);
  const c=FINALE_PALETTES[aspect];
  root.userData.transcendence={type,aspect,ornament,material,body};root.userData.finaleAspect=aspect;
  root.userData.fx=[{kind:aspect==='p'?'fire':aspect==='f'?'ember':'shock',cols:[c.glow,c.light],rate:2,at:[0,type==='bow'?0:-.65,.08]},
    {kind:'ember',cols:[c.edge],rate:1,at:[0,-.2,.05]}];
  root.userData.glowBase=.8;
  return root;
}

/** Preserve the seven existing control schemes, including axe morphs, sheathing, samplers and strings. */
export function withTranscendence(def,type) {
  if(def.transcendenceReady)return def;
  const baseBuild=def.buildMesh;
  def.buildMesh=(opts={})=>{
    if(opts.tier!==7)return baseBuild(opts);
    const aspect=finaleAspect(opts.branch),mesh=baseBuild({...opts,tier:6,branch:'v'});
    addTranscendence(mesh,type,1,aspect);
    if(mesh.userData.offhand)addTranscendence(mesh.userData.offhand,type,-1,aspect);
    return mesh;
  };
  def.transcendenceReady=true;return def;
}
