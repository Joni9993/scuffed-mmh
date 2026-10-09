import * as THREE from 'three';
import { lambert } from '../render/ps1.js';
import { tex, radialTexture } from '../render/textures.js';

const D = Math.PI / 180;

/** Low-poly hunter rig. Faces +z; right arm (sword hand) at local -x. Pose keys: see game/anim.js */
export function buildHunterRig({ tunic = 'cloth', weaponMesh = null } = {}) {
  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.85;
  root.add(pelvis);
  const mCloth = lambert({ map: tex(tunic, { size: 16 }) });
  const mLeather = lambert({ map: tex('leather', { size: 16 }) });
  const mSkin = lambert({ map: tex('skin', { size: 16 }) });

  const box = (w, h, d, mat, x, y, z, parent) => {
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
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 4), mCloth);
  hood.position.set(0, 0.55, -0.04);
  hood.rotation.y = Math.PI / 4;
  head.add(hood);
  box(0.12, 0.08, 0.04, lambert({ color: '#101010' }), 0, 0.28, 0.24, head);

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

  const mkLeg = (x) => {
    const l = new THREE.Group();
    l.position.set(x, 0, 0);
    pelvis.add(l);
    box(0.3, 0.85, 0.32, mLeather, 0, -0.42, 0, l);
    box(0.32, 0.14, 0.46, lambert({ color: '#2a1a10' }), 0, -0.8, 0.07, l);
    return l;
  };
  const legL = mkLeg(0.2), legR = mkLeg(-0.2);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({
    map: radialTexture(), transparent: true, depthWrite: false, fog: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  shadow.renderOrder = 1;

  const rig = {
    root, pelvis, torso, head, slot, shadow, weaponMesh,
    swapWeapon(mesh) { slot.clear(); if (mesh) slot.add(mesh); rig.weaponMesh = mesh; },
    apply(p) {
      pelvis.position.y = 0.85 + p.py;
      pelvis.rotation.set(p.prx * D, p.pry * D, 0);
      torso.rotation.set(p.tx * D, p.ty * D, p.tz * D);
      head.rotation.set(p.hx * D, p.hy * D, 0);
      R.a.rotation.set(-p.arx * D, 0, -p.arz * D);
      L.a.rotation.set(-p.alx * D, 0, p.alz * D);
      slot.rotation.set(-p.sw * D, 0, 0);
      legL.rotation.x = -p.lrx * D;
      legR.rotation.x = -p.rrx * D;
    },
  };
  return rig;
}
