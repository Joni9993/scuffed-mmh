import * as THREE from 'three';

// One bounded batch, driven by the committed attack clock. These feathers show
// the same capsule lanes that deal damage; they never choose targets or hit.
export const ROOSTER_FX_CAP = 96;
const up = new THREE.Vector3(0, 1, 0);
export function createRoosterFx(root) {
  const geo = new THREE.ConeGeometry(1, 1, 3);
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const mesh = new THREE.InstancedMesh(geo, mat, ROOSTER_FX_CAP);
  mesh.name = 'Ur-Hahn · Federhagel'; mesh.frustumCulled = false; mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.visible = false; root.add(mesh);
  const dummy = new THREE.Object3D(), dir = new THREE.Vector3(), color = new THREE.Color();
  geo.addEventListener('dispose', () => mat.dispose());
  let count = 0;
  function feather(x, y, z, dx, dy, dz, width, length, hex) {
    if (count >= ROOSTER_FX_CAP) return;
    dir.set(dx, dy, dz).normalize(); dummy.position.set(x, y, z);
    dummy.quaternion.setFromUnitVectors(up, dir); dummy.scale.set(width, length, width * .35);
    dummy.updateMatrix(); mesh.setMatrixAt(count, dummy.matrix); mesh.setColorAt(count++, color.set(hex));
  }
  return { mesh, update(extra) {
    count = 0;
    const a = extra.attackInst, tau = extra.attackTau ?? 0;
    if (extra.form !== 'rooster' || !a) { mesh.visible = false; mesh.count = 0; return; }
    if (a.def.id === 'gockelok_federhagel') {
      const hits = a.def.hits;
      // Lift and splay the feather tips before release. The ground markers carry
      // the timing; this is the bodily source of each salvo.
      const next = hits.find(h => h.t0 > tau);
      if (next) {
        const charge = Math.max(0, 1 - (next.t0 - tau) / .65);
        for (const side of [-1, 1]) for (let j = 0; j < 6; j++) {
          feather(side * (1.5 + j * .16), 2.6 + j * .10, .3 + j * .08,
            side * .25, .35, 1, .04 + charge * .035, .35 + charge * .55, '#e6bd76');
        }
      }
      for (const [i, h] of hits.entries()) {
        if (h.shape !== 'capsule' || tau < h.t0 || tau > h.t1 + .09) continue;
        const [ax, ay, az] = h.from, [bx, by, bz] = h.to;
        const k = Math.min(1, (tau - h.t0) / Math.max(.03, h.t1 - h.t0));
        for (let j = 0; j < 5; j++) {
          const f = Math.min(.99, .08 + j * .19 + k * .08);
          feather(ax + (bx - ax) * f, ay + (by - ay) * f, az + (bz - az) * f,
            bx - ax, by - ay, bz - az, .13, 1.4, (i + j) % 2 ? '#efcf91' : '#fff0c6');
        }
      }
    }
    // Short, ground-hugging debris makes the landing force visible without
    // drawing an extra damaging shockwave outside the authored hit shape.
    if (/krallensprung|sprungsporne|risssprung/.test(a.def.id)) {
      const at = a.def.hits[0].t0, age = tau - at;
      if (age >= 0 && age < .3) for (let j = 0; j < 12; j++) {
        const ang = j * Math.PI / 6, r = .8 + age * 5;
        feather(Math.sin(ang) * r, .12 + Math.sin(age / .3 * Math.PI) * .35, Math.cos(ang) * r,
          Math.sin(ang), .4, Math.cos(ang), .10 * (1 - age / .3), .42, '#a7957c');
      }
    }
    mesh.count = count; mesh.visible = count > 0;
    if (count) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
  } };
}
