import * as THREE from 'three';
import { lambert } from '../render/ps1.js';
import { tex, radialTexture } from '../render/textures.js';
import { GearParts, GearEmitter, gearMaterial } from '../render/gearfx.js'; // [G]
import { buildBody, buildArmor } from './gear/armor.js'; // [G]
import { makeGear, gearFxLevel } from '../data/gearlook.js'; // [G]

const D = Math.PI / 180;

// [G] two-hand grip solver scratch objects
const _qA = new THREE.Quaternion(), _qW = new THREE.Quaternion(), _qS = new THREE.Quaternion(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _e1 = new THREE.Euler(), _hr = new THREE.Vector3(), _ax = new THREE.Vector3(), _sl = new THREE.Vector3(), _d = new THREE.Vector3(), _dn = new THREE.Vector3(0, -1, 0);
const SHOULDER_R = [-0.52, 0.82, 0], SHOULDER_L = [0.52, 0.82, 0];
const ARM = 0.78, TW_IN = 24; // arm length; degrees the sword arm is tucked toward the body while two-handed

/**
 * Low-poly hunter rig. Faces +z; right arm (sword hand) at local -x. Pose keys: see game/anim.js
 * [G] merged:true (or `gear`) builds the gear rig: ONE vertex-coloured, glow-capable mesh per joint (6 draw calls) with the
 *     armor of `gear` ({ weapon, armor:{head,body,legs}, color }); `color` tints the cloth. rig.setGear()/setColor() rebuild live.
 *     Weapon meshes may carry userData.twoHand = {lo,hi} (left hand follows the hilt, `// [G]` reusable for the katana),
 *     userData.hand = 'L' (held in the left hand: bow) and userData.fx (particle sources). rig.tick(dt) animates glow + particles.
 */
export function buildHunterRig({ tunic = 'cloth', weaponMesh = null, merged = false, color = '#3f8a4a', gear = null } = {}) {
  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.85;
  root.add(pelvis);
  const useGear = merged || !!gear;
  const mk = (map) => lambert({ map: tex(map, { size: 16 }) });

  const box = (w, h, d, mat, x, y, z, parent) => {
    if (useGear) return null;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const mCloth = useGear ? null : mk(tunic), mLeather = useGear ? null : mk('leather'), mSkin = useGear ? null : mk('skin');
  const mDark = useGear ? null : lambert({ color: '#101010' }), mBoot = useGear ? null : lambert({ color: '#2a1a10' });
  const torso = new THREE.Group();
  pelvis.add(torso);
  box(0.75, 0.3, 0.42, mLeather, 0, 0.05, 0, torso);
  box(0.78, 0.7, 0.46, mCloth, 0, 0.5, 0, torso);
  const head = new THREE.Group();
  head.position.y = 0.95;
  torso.add(head);
  box(0.46, 0.46, 0.46, mSkin, 0, 0.23, 0, head);
  if (!useGear) {
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
  // [W] off-hand slot: a weapon mesh may carry `userData.offhand` (second blade of the dual blades)
  const slotL = new THREE.Group();
  L.hand.add(slotL);

  const mkLeg = (x) => {
    const l = new THREE.Group();
    l.position.set(x, 0, 0);
    pelvis.add(l);
    box(0.3, 0.85, 0.32, mLeather, 0, -0.42, 0, l);
    box(0.32, 0.14, 0.46, mBoot, 0, -0.8, 0.07, l);
    return l;
  };
  const legL = mkLeg(0.2), legR = mkLeg(-0.2);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({
    map: radialTexture(), transparent: true, depthWrite: false, fog: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  shadow.renderOrder = 1;

  // ---------------------------------------------------------------- [G] gear rig
  const joints = { torso, head, armR: R.a, armL: L.a, legL, legR };
  let g = makeGear({ ...(gear ?? {}), color: gear?.color ?? color });
  let col = g.color;
  let mat = null, emitter = null, fxl = null, twoHand = null, t = 0;
  if (useGear) { mat = gearMaterial(1); emitter = new GearEmitter(root, 36); }

  const rebuild = () => {
    const P = {};
    for (const k in joints) P[k] = new GearParts();
    buildBody(P, col);
    buildArmor(P, g.armor, col);
    for (const k in joints) {
      const j = joints[k];
      if (j.userData.gm) { j.remove(j.userData.gm); j.userData.gm.geometry.dispose(); }
      const m = new THREE.Mesh(P[k].merge(), mat);
      j.add(m);
      j.userData.gm = m;
    }
    fxl = gearFxLevel(g);
    refreshFx();
  };
  const refreshFx = () => {
    if (!emitter) return;
    const src = [];
    if (fxl?.embers) src.push({ kind: 'ember', rate: 4.5, at: [0.5, 1.75, -0.45] }, { kind: 'ember', rate: 4.5, at: [-0.5, 1.75, -0.45] }, { kind: 'ember', rate: 2, at: [0, 2.2, -0.2] });
    if (fxl?.aura) src.push({ kind: 'aura', rate: 9, at: [0, 0, 0] });
    const w = rig.weaponMesh;
    if (w) {
      for (const m of [w, w.userData.offhand]) for (const s of m?.userData.fx ?? []) src.push({ kind: s.kind, rate: s.rate, obj: m, off: s.at, cols: s.cols });
    }
    emitter.setSources(src);
  };

  const rig = {
    root, pelvis, torso, head, slot, slotL, shadow, weaponMesh: null, joints, handR: R.hand, handL: L.hand,
    get gear() { return g; },
    get fxLevel() { return fxl; },
    /** [G] Rebuild the outfit (and tint) live: rig.setGear({ weapon, armor:{head,body,legs}, color }) */
    setGear(next) {
      if (!useGear) return;
      g = makeGear({ ...next, color: next?.color ?? col });
      col = g.color;
      rebuild();
    },
    setColor(c) { if (useGear && c !== col) { col = c; g = { ...g, color: c }; rebuild(); } },
    swapWeapon(mesh) {
      slot.clear(); slotL.clear();
      if (mesh) {
        (mesh.userData.hand === 'L' ? slotL : slot).add(mesh);
        if (mesh.userData.offhand) slotL.add(mesh.userData.offhand);
      }
      rig.weaponMesh = mesh;
      twoHand = mesh?.userData.twoHand ?? null; // [G]
      refreshFx();
    },
    /** [G] glow pulse + particles; dt in seconds */
    tick(dt) {
      if (!useGear) return;
      t += dt;
      const top = fxl?.top ?? 0;
      mat.userData.glow.value = 0.8 + 0.2 * Math.sin(t * 4) + (top ? 0.15 : 0);
      for (const m of [rig.weaponMesh, rig.weaponMesh?.userData.offhand]) {
        const u = m?.userData.gearGlow;
        if (u) u.value = (m.userData.glowBase ?? 0.5) * (0.78 + 0.22 * Math.sin(t * 5.3 + 1));
      }
      emitter.update(dt);
    },
    dispose() {
      for (const k in joints) { const m = joints[k].userData.gm; if (m) m.geometry.dispose(); }
      emitter?.dispose();
      mat?.dispose();
    },
    apply(p) {
      pelvis.position.y = 0.85 + p.py;
      pelvis.rotation.set(p.prx * D, p.pry * D, 0);
      torso.rotation.set(p.tx * D, p.ty * D, p.tz * D);
      head.rotation.set(p.hx * D, p.hy * D, 0);
      const th = twoHand ? p.th ?? 1 : 0;
      const arz = p.arz - TW_IN * th;
      R.a.rotation.set(-p.arx * D, 0, -arz * D);
      L.a.rotation.set(-p.alx * D, 0, p.alz * D);
      L.a.scale.set(1, 1, 1);
      slot.rotation.set(-p.sw * D, 0, 0);
      slotL.rotation.set(-(p.sl ?? 155) * D, 0, 0);
      legL.rotation.x = -p.lrx * D;
      legR.rotation.x = -p.rrx * D;
      if (th > 0.001) solveTwoHand(p, th, arz);
    },
  };

  /** [G] Two-handed grip: the sword keeps its authored direction (hit capsules still match); the left arm reaches the hilt. */
  function solveTwoHand(p, th, arz) {
    _qA.setFromEuler(_e1.set(-p.arx * D, 0, -arz * D));
    _qW.setFromEuler(_e1.set(-p.arx * D, 0, -p.arz * D)).multiply(_q1.setFromEuler(_e1.set(-p.sw * D, 0, 0)));
    _qS.copy(_qA).invert().multiply(_qW);
    _q2.setFromEuler(_e1.set(-p.sw * D, 0, 0));
    slot.quaternion.copy(_q2).slerp(_qS, th);
    _hr.set(0, -ARM, 0).applyQuaternion(_qA).add(_ax.set(...SHOULDER_R));
    _ax.set(0, 1, 0).applyQuaternion(_qW);
    _sl.set(...SHOULDER_L);
    const s = Math.min(twoHand.hi, Math.max(twoHand.lo, _d.copy(_sl).sub(_hr).dot(_ax)));
    _d.copy(_hr).addScaledVector(_ax, s).sub(_sl);
    const dist = _d.length() || 1;
    _q1.setFromUnitVectors(_dn, _d.multiplyScalar(1 / dist));
    _q2.setFromEuler(_e1.set(-p.alx * D, 0, p.alz * D));
    L.a.quaternion.copy(_q2).slerp(_q1, th);
    L.a.scale.y = 1 + (Math.min(1.3, Math.max(0.75, dist / ARM)) - 1) * th;
  }

  if (useGear) rebuild();
  if (weaponMesh) rig.swapWeapon(weaponMesh);
  return rig;
}
