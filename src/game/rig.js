import * as THREE from 'three';
import { lambert } from '../render/ps1.js';
import { tex, radialTexture } from '../render/textures.js';
import { Parts, vcLit } from '../render/vcolor.js'; // [T]

const D = Math.PI / 180;

/**
 * Low-poly hunter rig. Faces +z; right arm (sword hand) at local -x. Pose keys: see game/anim.js
 * [T] merged:true builds ONE vertex-coloured mesh per joint (6 draw calls instead of ~14, used by the town); `color` tints the tunic.
 */
export function buildHunterRig({ tunic = 'cloth', weaponMesh = null, merged = false, color = '#3f8a4a' } = {}) {
  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.85;
  root.add(pelvis);
  const mk = (map, col) => (merged ? { col } : lambert({ map: tex(map, { size: 16 }) }));
  const mCloth = mk(tunic, color), mLeather = mk('leather', '#7a4a2a'), mSkin = mk('skin', '#e8b088');
  const mDark = merged ? { col: '#101010' } : lambert({ color: '#101010' });
  const mBoot = merged ? { col: '#2a1a10' } : lambert({ color: '#2a1a10' });
  const buckets = new Map();
  const bucket = (parent) => { if (!buckets.has(parent)) buckets.set(parent, new Parts()); return buckets.get(parent); };

  const box = (w, h, d, mat, x, y, z, parent) => {
    if (merged) { bucket(parent).box(w, h, d, mat.col, { x, y, z }); return null; }
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const torso = new THREE.Group();
  pelvis.add(torso);
  box(0.75, 0.3, 0.42, mLeather, 0, 0.05, 0, torso);
  box(0.78, 0.7, 0.46, mCloth, 0, 0.5, 0, torso);
  const head = new THREE.Group();
  head.position.y = 0.95;
  torso.add(head);
  box(0.46, 0.46, 0.46, mSkin, 0, 0.23, 0, head);
  if (merged) bucket(head).cone(0.34, 0.5, 4, mCloth.col, { x: 0, y: 0.55, z: -0.04, ry: Math.PI / 4 });
  else {
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 4), mCloth);
    hood.position.set(0, 0.55, -0.04);
    hood.rotation.y = Math.PI / 4;
    head.add(hood);
  }
  box(0.12, 0.08, 0.04, mDark, 0, 0.28, 0.24, head);

  const mkArm = (x) => {
    const a = new THREE.Group();
    a.position.set(x, 0.82, 0);
    torso.add(a);
    box(0.24, 0.7, 0.26, mCloth, 0, -0.35, 0, a);
    box(0.2, 0.2, 0.2, mSkin, 0, -0.78, 0, a);
    const hand = new THREE.Group();
    hand.position.y = -0.78;
    a.add(hand);
    return { a, hand };
  };
  const R = mkArm(-0.52), L = mkArm(0.52);
  const slot = new THREE.Group();
  R.hand.add(slot);
  if (weaponMesh) slot.add(weaponMesh);
  // [W] off-hand slot: a weapon mesh may carry `userData.offhand` (second blade of the dual blades)
  const slotL = new THREE.Group();
  L.hand.add(slotL);
  const setOff = (m) => { slotL.clear(); if (m?.userData.offhand) slotL.add(m.userData.offhand); };
  setOff(weaponMesh);

  const mkLeg = (x) => {
    const l = new THREE.Group();
    l.position.set(x, 0, 0);
    pelvis.add(l);
    box(0.3, 0.85, 0.32, mLeather, 0, -0.42, 0, l);
    box(0.32, 0.14, 0.46, mBoot, 0, -0.8, 0.07, l);
    return l;
  };
  const legL = mkLeg(0.2), legR = mkLeg(-0.2);
  if (merged) for (const [parent, parts] of buckets) parent.add(parts.mesh(vcLit()));

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({
    map: radialTexture(), transparent: true, depthWrite: false, fog: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  shadow.renderOrder = 1;

  const rig = {
    root, pelvis, torso, head, slot, shadow, weaponMesh,
    swapWeapon(mesh) { slot.clear(); if (mesh) slot.add(mesh); setOff(mesh); rig.weaponMesh = mesh; },
    apply(p) {
      pelvis.position.y = 0.85 + p.py;
      pelvis.rotation.set(p.prx * D, p.pry * D, 0);
      torso.rotation.set(p.tx * D, p.ty * D, p.tz * D);
      head.rotation.set(p.hx * D, p.hy * D, 0);
      R.a.rotation.set(-p.arx * D, 0, -p.arz * D);
      L.a.rotation.set(-p.alx * D, 0, p.alz * D);
      slot.rotation.set(-p.sw * D, 0, 0);
      slotL.rotation.set(-(p.sl ?? 155) * D, 0, 0);
      legL.rotation.x = -p.lrx * D;
      legR.rotation.x = -p.rrx * D;
    },
  };
  return rig;
}
