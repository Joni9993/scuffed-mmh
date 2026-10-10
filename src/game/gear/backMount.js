// Weapons stowed on the hunter's back (town, remote avatars). The REAL weapon meshes at scale 1, only re-posed:
// blade axis is local -Y, torso faces +z (back = -z), right shoulder is -x. Sockets are in rig.torso space.
import * as THREE from 'three';

const SOCKETS = {
  // greatsword: hilt over the right shoulder, blade slanting down across the back
  gs: { x: -0.16, y: 1.12, z: -0.34, rz: 0.4 },
  // katana: same carry, a bit flatter
  kt: { x: -0.16, y: 1.08, z: -0.34, rz: 0.48 },
  // dual blades: two blades crossed on the back (hilts up at the shoulders)
  db: { x: -0.2, y: 0.92, z: -0.33, rz: 0.62, off: { x: 0.2, y: 0.92, z: -0.37, rz: -0.62 } },
  // bow: limbs span the whole back, slight diagonal, grip near the middle
  bow: { x: 0.0, y: 0.38, z: -0.3, rz: 0.3, ry: -Math.PI / 2 },
};

/** Put `mesh` (and its off-hand twin) on the back of `rig`. Returns the group (remove it to unmount). */
export function mountOnBack(rig, mesh, weaponId) {
  const back = new THREE.Group();
  back.name = 'back-slot';
  if (!mesh) { rig.torso.add(back); return back; }
  const sock = SOCKETS[weaponId] ?? SOCKETS.gs;
  const place = (m, s) => {
    const g = new THREE.Group();
    g.position.set(s.x, s.y, s.z);
    g.rotation.set(0, s.ry ?? 0, s.rz, 'YXZ');
    g.add(m);
    back.add(g);
  };
  place(mesh, sock);
  const off = mesh.userData.offhand;
  if (off) place(off, sock.off ?? sock);
  const bow = mesh.userData.bow;
  if (bow?.arrow) bow.arrow.visible = false; // no nocked arrow while stowed
  rig.torso.add(back);
  return back;
}
