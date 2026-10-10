import * as THREE from 'three';
import { buildHunterRig } from '../game/rig.js';
import { getWeapon } from '../game/weapons/index.js';
import { REST, sampleTrack } from '../game/anim.js';
import { mirrorPose } from '../game/anim.js';
import { makeGear } from '../data/gearlook.js';
import { setSnapGrid } from '../render/ps1.js';

// [G] Debug scene (?scene=gearlab): lineup of hunter rigs with arbitrary gear, for screenshots and visual checks.
//   __SH.app.scene.show([{ gear:{weapon:{type,tier,branch},armor:{head,body,legs}}, pose?:{...}, yaw?:rad }], { cam?:[x,y,z], look?:[x,y,z], spacing? })
export const gearlabScene = {
  enter(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2a2438');
    this.scene.add(new THREE.AmbientLight('#a89ac0', 1.15));
    const sun = new THREE.DirectionalLight('#ffc490', 1.15);
    sun.position.set(-4, 8, 6);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#6a8aff', 0.3);
    fill.position.set(5, 3, -4);
    this.scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), new THREE.MeshLambertMaterial({ color: '#4a4258' }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.camera = new THREE.PerspectiveCamera(40, app.renderer.aspect, 0.1, 100);
    this._onResize = (a) => { this.camera.aspect = a; this.camera.updateProjectionMatrix(); };
    app.renderer.onResize.add(this._onResize);
    this.rigs = [];
    this.t = 0;
    return this;
  },
  clear() { for (const r of this.rigs) { this.scene.remove(r.rig.root, r.rig.shadow); r.rig.dispose(); } this.rigs = []; },
  show(items, { cam = null, look = null, spacing = 1.9, fov = 40 } = {}) {
    this.camera.fov = fov; this.camera.updateProjectionMatrix();
    this.clear();
    const n = items.length, x0 = -((n - 1) * spacing) / 2;
    items.forEach((it, i) => {
      const gear = makeGear(it.gear);
      const def = getWeapon(gear.weapon.type);
      if (it.weaponOnly) { // weapon showcase: blade up, no body
        const mesh = def.buildMesh({ tier: gear.weapon.tier, branch: gear.weapon.branch });
        const g = new THREE.Group();
        const off = mesh.userData.offhand;
        mesh.rotation.z = mesh.userData.hand === 'L' ? 0 : Math.PI;
        mesh.position.set(off ? -0.25 : 0, mesh.userData.hand === 'L' ? 1.2 : 2.3, 0);
        g.add(mesh);
        if (off) { off.rotation.z = Math.PI; off.position.set(0.25, 2.3, 0); g.add(off); }
        g.position.set(it.x ?? x0 + i * spacing, 0, 0);
        g.rotation.y = it.yaw ?? 0.4;
        const rigStub = { root: g, shadow: new THREE.Object3D(), dispose() {}, apply() {}, tick() { for (const m of [mesh, off]) { const u = m?.userData.gearGlow; if (u) u.value = (m.userData.glowBase ?? 0.5) * 0.9; } }, weaponMesh: mesh };
        this.scene.add(g);
        this.rigs.push({ rig: rigStub, pose: {}, def, it });
        return;
      }
      const mesh = it.noWeapon ? null : def.buildMesh?.({ tier: gear.weapon.tier, branch: gear.weapon.branch }) ?? null;
      const rig = buildHunterRig({ merged: true, gear, weaponMesh: mesh });
      const pose = { ...REST, ...def.rest, ...(it.anim ? sampleTrack(def.anims[it.anim[0]], it.anim[1], {}) : {}), ...(it.pose ?? {}) };
      if (def.hand === 'L' && !it.raw) mirrorPose(pose);
      rig.apply(pose);
      rig.root.position.set(it.x ?? x0 + i * spacing, 0, it.z ?? 0);
      rig.root.rotation.y = it.yaw ?? 0.45;
      this.scene.add(rig.root, rig.shadow);
      rig.shadow.position.set(rig.root.position.x, 0.05, rig.root.position.z);
      this.rigs.push({ rig, pose, def, it });
    });
    const w = Math.max(3, n * spacing);
    this.camera.position.set(...(cam ?? [0, 1.7, Math.max(6, w * 0.95)]));
    this.camera.lookAt(...(look ?? [0, 1.25, 0]));
    return this.rigs.length;
  },
  setPose(i, pose) { const r = this.rigs[i]; if (r) { Object.assign(r.pose, pose); r.rig.apply(r.pose); } },
  update(dt) {
    this.t += dt;
    for (const r of this.rigs) {
      r.rig.apply(r.pose);
      r.rig.tick(dt);
      r.def.updateMesh?.({ data: {}, busy: false, charging: false, moveId: null, t: 0, chargeT: 0, move: null }, r.rig.weaponMesh, dt);
      if (r.it.spin) r.rig.root.rotation.y += dt * r.it.spin;
    }
  },
  render() {
    this.app.renderer.render(this.scene, this.camera);
  },
  exit() { this.clear(); this.app.renderer.onResize.delete(this._onResize); },
};
void setSnapGrid;
