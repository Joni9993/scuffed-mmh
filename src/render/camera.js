import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapAngle, yawOf } from '../core/math.js';

/**
 * Third-person camera rig. yaw = direction the camera LOOKS (forward = (sin yaw, 0, cos yaw)).
 * Free mode: swipe/mouse rotates, slowly auto-follows behind the player while running.
 * Lock mode: frames player + target.
 */
export function createCameraRig(camera, getGroundY = () => 0) {
  const rig = {
    camera,
    yaw: 0, pitch: 0.42, dist: 8.5,
    focus: new THREE.Vector3(),
    lockActive: false,
    idleT: 0,
    sens: 0.0042,
    shake: new THREE.Vector3(),
    /** @param p {playerPos, playerYaw, moving, camInput:{dx,dy}, lockPos|null, shake:Vector3} */
    update(dt, p) {
      const { camInput } = p;
      const hasInput = Math.abs(camInput.dx) + Math.abs(camInput.dy) > 0.0001;
      if (p.lockPos) {
        const dx = p.lockPos.x - p.playerPos.x, dz = p.lockPos.z - p.playerPos.z;
        const d = Math.hypot(dx, dz);
        const want = yawOf(dx, dz);
        this.yaw = dampAngle(this.yaw, want, 6, dt);
        this.pitch = damp(this.pitch, clamp(0.4 + d * 0.012, 0.4, 0.6), 3, dt);
        this.dist = damp(this.dist, clamp(7 + d * 0.5, 8.5, 17), 2.5, dt);
        const mix = 0.5;
        this.focus.set(
          p.playerPos.x + dx * mix, damp(this.focus.y, p.playerPos.y + 1.6 + (p.lockPos.y - p.playerPos.y) * 0.25, 5, dt), p.playerPos.z + dz * mix);
        this.lockActive = true;
      } else {
        this.lockActive = false;
        if (hasInput) {
          this.yaw = wrapAngle(this.yaw - camInput.dx * this.sens);
          this.pitch = clamp(this.pitch + camInput.dy * this.sens, 0.05, 1.25);
          this.idleT = 0;
        } else this.idleT += dt;
        if (p.moving && this.idleT > 1.0) this.yaw = dampAngle(this.yaw, p.playerYaw, 0.9, dt);
        this.dist = damp(this.dist, 8.5, 2, dt);
        this.focus.x = damp(this.focus.x, p.playerPos.x, 14, dt);
        this.focus.z = damp(this.focus.z, p.playerPos.z, 14, dt);
        this.focus.y = damp(this.focus.y, p.playerPos.y + 1.6, 8, dt);
      }
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const x = this.focus.x - Math.sin(this.yaw) * cp * this.dist;
      const z = this.focus.z - Math.cos(this.yaw) * cp * this.dist;
      let y = this.focus.y + sp * this.dist;
      y = Math.max(y, getGroundY(x, z) + 0.8);
      camera.position.set(x, y, z);
      if (p.shake) camera.position.add(p.shake);
      camera.lookAt(this.focus.x, this.focus.y, this.focus.z);
    },
    /** Snap to a player position (respawn/start). */
    snap(pos, yaw) {
      this.yaw = yaw; this.focus.set(pos.x, pos.y + 1.6, pos.z); this.idleT = 0;
    },
  };
  return rig;
}
