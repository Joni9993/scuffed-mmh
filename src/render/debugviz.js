import * as THREE from 'three';

/** Wireframe overlay for hitboxes (player = yellow, monster = red). Enabled via __SH.debugHitboxes(true). */
export function createDebugViz(scene) {
  const sg = new THREE.SphereGeometry(1, 8, 6);
  const cg = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  const pool = [];
  let used = 0;
  const up = new THREE.Vector3(0, 1, 0);
  const get = (geo, color) => {
    let m = pool[used];
    if (!m || m.geometry !== geo) {
      m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ wireframe: true, fog: false, depthTest: false }));
      m.renderOrder = 10;
      if (pool[used]) scene.remove(pool[used]);
      pool[used] = m;
      scene.add(m);
    }
    m.material.color.set(color);
    m.visible = true;
    used++;
    return m;
  };
  return {
    enabled: false,
    begin() { used = 0; },
    shape(s, color = '#ffe14d') {
      if (!this.enabled) return;
      if (s.type === 'sphere') {
        const m = get(sg, color);
        m.position.set(s.x, s.y, s.z); m.scale.setScalar(s.r); m.quaternion.identity();
      } else {
        const a = new THREE.Vector3(s.a.x, s.a.y, s.a.z), b = new THREE.Vector3(s.b.x, s.b.y, s.b.z);
        const m = get(cg, color);
        const d = b.clone().sub(a), len = Math.max(0.001, d.length());
        m.position.copy(a).addScaledVector(d, 0.5);
        m.scale.set(s.r, len, s.r);
        m.quaternion.setFromUnitVectors(up, d.normalize());
      }
    },
    end() { for (let i = used; i < pool.length; i++) pool[i].visible = false; },
  };
}
