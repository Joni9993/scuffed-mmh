import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapAngle, yawOf } from '../core/math.js';

/**
 * Third-person camera rig. yaw = direction the camera LOOKS (forward = (sin yaw, 0, cos yaw)).
 * Free mode: swipe/mouse rotates, slowly auto-follows behind the player while running.
 * Lock mode: frames player + target.
 */
const _cp = { x: 0, z: 0 };
const SIDE = 0.2; // lock mode: rotate the view a little past the player's shoulder so the monster is never hidden behind him

export function createCameraRig(camera, getGroundY = () => 0, collide = null) {
  const rig = {
    camera,
    yaw: 0, pitch: 0.42, dist: 8.5,
    focus: new THREE.Vector3(),
    lockActive: false,
    idleT: 0,
    sens: 0.0042,
    shake: new THREE.Vector3(),
    clearDist: 99, // how far the camera may sit from the focus without poking into terrain / walls (smoothed)
    /** @param p {playerPos, playerYaw, moving, camInput:{dx,dy}, lockPos|null, shake:Vector3} */
    update(dt, p) {
      const { camInput } = p;
      const hasInput = Math.abs(camInput.dx) + Math.abs(camInput.dy) > 0.0001;
      if (p.lockPos) {
        const dx = p.lockPos.x - p.playerPos.x, dz = p.lockPos.z - p.playerPos.z;
        const d = Math.hypot(dx, dz);
        const want = yawOf(dx, dz);
        this.yaw = dampAngle(this.yaw, want, 6, dt);
        // big monsters: pull back and look down more, the closer the more (so they never fill / hide behind the player)
        const size = p.lockSize ?? 1;
        const close = clamp(1 - d / (size * 4 + 3), 0, 1);
        this.pitch = damp(this.pitch, clamp(0.4 + d * 0.012 + (size - 1) * 0.08 + close * 0.35, 0.4, 0.85), 3, dt);
        this.dist = damp(this.dist, clamp(6 + size * 1.6 + d * 0.5, 8.5, 21), 2.5, dt);
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
      // camera collision: march from the focus toward the wanted position, stop before terrain / cliffs / props; shorten at once, extend slowly
      const clear = this.maxClearDist(cp, sp);
      this.clearDist = clear < this.clearDist ? clear : damp(this.clearDist, clear, 3, dt); // in: instant (never inside a wall), out: smooth
      const dd = Math.min(this.dist, Math.max(0.6, this.clearDist));
      let x = this.focus.x - Math.sin(this.yaw) * cp * dd;
      let z = this.focus.z - Math.cos(this.yaw) * cp * dd;
      if (collide) { _cp.x = x; _cp.z = z; collide(_cp, 0.35); x = _cp.x; z = _cp.z; } // last resort: hunter hugging a wall
      let y = this.focus.y + sp * dd;
      y = Math.max(y, getGroundY(x, z) + 0.8);
      camera.position.set(x, y, z);
      if (p.shake) camera.position.add(p.shake);
      camera.lookAt(this.focus.x, this.focus.y, this.focus.z);
    },
    /** Largest camera distance (<= this.dist) whose sample points are above ground and outside walls. */
    maxClearDist(cp, sp) {
      const STEPS = 16, fx = this.focus.x, fy = this.focus.y, fz = this.focus.z;
      const sx = -Math.sin(this.yaw) * cp, sz = -Math.cos(this.yaw) * cp;
      let ok = 0;
      if (collide) { // fast path: 4 samples (every quarter) free -> skip the fine march
        let clear = true;
        for (let i = 1; i <= 4 && clear; i++) {
          const d = (this.dist * i) / 4, x = fx + sx * d, z = fz + sz * d, y = fy + sp * d;
          if (y < getGroundY(x, z) + 0.7) { clear = false; break; }
          _cp.x = x; _cp.z = z; collide(_cp, 0.5);
          if (Math.abs(_cp.x - x) + Math.abs(_cp.z - z) > 0.02) clear = false;
        }
        if (clear) return this.dist;
      }
      for (let i = 1; i <= STEPS; i++) {
        const d = (this.dist * i) / STEPS;
        const x = fx + sx * d, z = fz + sz * d, y = fy + sp * d;
        if (y < getGroundY(x, z) + 0.7) break;
        if (collide) {
          _cp.x = x; _cp.z = z;
          collide(_cp, 0.5);
          if (Math.abs(_cp.x - x) + Math.abs(_cp.z - z) > 0.02) break;
        }
        ok = d;
      }
      return ok;
    },
    /** Snap to a player position (respawn/start). */
    snap(pos, yaw) {
      this.yaw = yaw; this.focus.set(pos.x, pos.y + 1.6, pos.z); this.idleT = 0; this.clearDist = 99;
    },
  };
  return rig;
}
