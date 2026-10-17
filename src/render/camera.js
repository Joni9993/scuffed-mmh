import * as THREE from 'three';
import { settings } from '../core/settings.js';
import { angleDiff, clamp, damp, dampAngle, wrapAngle, yawOf } from '../core/math.js';

/**
 * Third-person camera rig. yaw = direction the camera LOOKS (forward = (sin yaw, 0, cos yaw)).
 * Free mode: swipe/mouse rotates, slowly auto-follows behind the player while running.
 * Lock mode: frames player + target body (smoothed, with dead zone and turn-rate cap).
 */
const _cp = { x: 0, z: 0 };
// Kamera-Grundwerte (Best Practice Action-Third-Person: ruhig, weit genug fuer Ueberblick, nie selbst drehen wenn man auf die Kamera zulaeuft)
export const CAM = {
  dist: 10.5, pitch: 0.46,      // frei: Abstand / Blickneigung
  followDelay: 1.6,             // s ohne Wischen, bis die Kamera sanft hinter den Pirscher dreht
  followRate: 0.8,              // so traege dreht sie nach (1/s)
  lockDead: 0.3,                // Lock: Totzone (rad) – innerhalb davon dreht die Kamera gar nicht
  lockRate: 2.6,                // Lock: Nachdrehen ausserhalb der Totzone (1/s)
  lockMaxTurn: 1.6,             // Lock: max. Drehgeschwindigkeit (rad/s) – kein Peitschen beim Umkreisen
  lockTgtRate: 3.5,             // Lock: Glaettung der Zielposition (Brocken-Drehungen/Spruenge ziehen nicht mit)
};
const DIST_MUL = { N: 0.85, M: 1, W: 1.2 };

export function createCameraRig(camera, getGroundY = () => 0, collide = null) {
  const rig = {
    camera,
    yaw: 0, pitch: CAM.pitch, dist: CAM.dist,
    distMul: null, // null = Einstellung settings.camDist (N/M/W) folgen; setDistance() ueberschreibt
    focus: new THREE.Vector3(),
    lockActive: false,
    lockTgt: new THREE.Vector3(), lockRef: null, lockT: 0, // geglaettete Lock-Zielposition + welcher Brocken
    idleT: 0,
    sens: 0.0042,
    shake: new THREE.Vector3(),
    frameK: 0, frameAmt: 0, frameT: 0, // Auto-Framing: extra Distanz (Anteil), Ziel, Restzeit
    clearDist: 99, // how far the camera may sit from the focus without poking into terrain / walls (smoothed)
    setDistance(k) { this.distMul = k == null ? null : DIST_MUL[k] ?? 1; },
    get distK() { return this.distMul ?? DIST_MUL[settings.camDist] ?? 1; },
    /**
     * @param p {playerPos, playerYaw, moving, camInput:{dx,dy}, lockPos|null, lockCenter?, lockRef?, lockSize, shake:Vector3}
     * lockPos = anvisiertes Teil, lockCenter = Koerpermitte des Brockens (x/z). Die Kamera rahmt die Koerpermitte, nicht das
     * zappelnde Teil: Drehen, Schwanzschlaege und Kopfbewegungen bewegen die Kamera dadurch nicht mehr mit.
     */
    update(dt, p) {
      const { camInput } = p;
      const hasInput = Math.abs(camInput.dx) + Math.abs(camInput.dy) > 0.0001;
      if (p.lockPos) {
        const c = p.lockCenter ?? p.lockPos;
        const ref = p.lockRef ?? null;
        if (!this.lockActive || ref !== this.lockRef) { this.lockTgt.set(c.x, p.lockPos.y, c.z); this.lockT = 0; } // neues Ziel: direkt dort starten
        else {
          const k = 1 - Math.exp(-CAM.lockTgtRate * dt);
          this.lockTgt.x += (c.x - this.lockTgt.x) * k;
          this.lockTgt.z += (c.z - this.lockTgt.z) * k;
          this.lockTgt.y += (p.lockPos.y - this.lockTgt.y) * k * 0.6;
        }
        this.lockRef = ref; this.lockT += dt;
        const t = this.lockTgt;
        const dx = t.x - p.playerPos.x, dz = t.z - p.playerPos.z;
        const d = Math.hypot(dx, dz);
        const size = p.lockSize ?? 1;
        // Yaw: Totzone + begrenzte Drehgeschwindigkeit. Steht man direkt unter dem Brocken (Nahkampf), dreht die Kamera kaum noch –
        // dort aendert sich der Winkel zum Ziel bei jedem Schritt riesig, genau das war das Chaos.
        const err = angleDiff(this.yaw, yawOf(dx, dz));
        const under = clamp((d - size * 0.9) / (size * 1.2 + 2), 0.15, 1);
        const excess = Math.sign(err) * Math.max(0, Math.abs(err) - CAM.lockDead);
        const maxTurn = CAM.lockMaxTurn * (this.lockT < 1 ? 2.5 : 1) * dt; // beim Aufschalten zuegig hindrehen, danach ruhig
        const turn = clamp(excess * (1 - Math.exp(-CAM.lockRate * (this.lockT < 1 ? 2 : under) * dt)), -maxTurn, maxTurn);
        this.yaw = wrapAngle(this.yaw + turn);
        // big monsters: pull back and look down more, the closer the more (so they never fill / hide behind the player)
        const close = clamp(1 - d / (size * 4 + 3), 0, 1);
        this.pitch = damp(this.pitch, clamp(0.42 + d * 0.012 + (size - 1) * 0.08 + close * 0.3, 0.42, 0.85), 2, dt);
        this.dist = damp(this.dist, clamp(7 + size * 1.8 + d * 0.45, 10.5, 22) * this.distK, 1.8, dt);
        // Fokus bleibt nah am Pirscher (max. 4 m Richtung Ziel) – man verliert sich selbst nie aus dem Bild
        const off = d > 0.01 ? Math.min(d * 0.35, 4) / d : 0;
        this.focus.x = damp(this.focus.x, p.playerPos.x + dx * off, 10, dt);
        this.focus.z = damp(this.focus.z, p.playerPos.z + dz * off, 10, dt);
        this.focus.y = damp(this.focus.y, p.playerPos.y + 1.6 + clamp((t.y - p.playerPos.y) * 0.2, -1, 2), 5, dt);
        this.lockActive = true;
        this.idleT = 0;
      } else {
        this.lockActive = false; this.lockRef = null;
        if (hasInput) {
          this.yaw = wrapAngle(this.yaw - camInput.dx * this.sens);
          this.pitch = clamp(this.pitch + camInput.dy * this.sens, 0.08, 1.2);
          this.idleT = 0;
        } else this.idleT += dt;
        // Auto-Follow nur beim Laufen nach vorn / zur Seite. Laeuft man auf die Kamera zu, dreht sie NICHT um 180°.
        if (p.moving && this.idleT > CAM.followDelay) {
          const rel = Math.abs(angleDiff(this.yaw, p.playerYaw));
          const w = clamp((2.3 - rel) / 0.8, 0, 1);
          if (w > 0) this.yaw = dampAngle(this.yaw, p.playerYaw, CAM.followRate * w, dt);
          if (this.idleT > 3) this.pitch = damp(this.pitch, CAM.pitch, 0.6, dt); // Neigung findet langsam zur Grundhaltung zurueck
        }
        this.dist = damp(this.dist, CAM.dist * this.distK, 2, dt);
        this.focus.x = damp(this.focus.x, p.playerPos.x, 14, dt);
        this.focus.z = damp(this.focus.z, p.playerPos.z, 14, dt);
        this.focus.y = damp(this.focus.y, p.playerPos.y + 1.6, 8, dt);
      }
      // Auto-Framing (weich rein/raus, nie ruckartig): dist temporaer skaliert, unten wieder zurueck
      this.frameT -= dt;
      this.frameK = damp(this.frameK, this.frameT > 0 ? this.frameAmt : 0, this.frameT > 0 ? 2.2 : 1.6, dt);
      const baseDist = this.dist;
      this.dist = baseDist * (1 + this.frameK);
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      // camera collision: march from the focus toward the wanted position, stop before terrain / cliffs / props; shorten at once, extend slowly
      const clear = this.maxClearDist(cp, sp);
      this.clearDist = clear < this.clearDist ? clear : damp(this.clearDist, clear, 3, dt); // in: instant (never inside a wall), out: smooth
      const dd = Math.min(this.dist, Math.max(0.6, this.clearDist));
      let x = this.focus.x - Math.sin(this.yaw) * cp * dd;
      let z = this.focus.z - Math.cos(this.yaw) * cp * dd;
      if (collide) { _cp.x = x; _cp.z = z; collide(_cp, 0.35); x = _cp.x; z = _cp.z; } // last resort: hunter hugging a wall
      this.dist = baseDist;
      let y = this.focus.y + sp * dd;
      y = Math.max(y, getGroundY(x, z) + 0.8);
      camera.position.set(x, y, z);
      if (p.shake) camera.position.add(p.shake);
      camera.lookAt(this.focus.x, this.focus.y, this.focus.z);
    },
    /** Sanft rauszoomen: amount = Anteil (0.2 = +20 % Distanz) fuer `seconds`, danach weich zurueck. */
    frame(amount = 0.2, seconds = 1.5) {
      this.frameAmt = Math.max(0, Math.min(0.3, amount));
      this.frameT = Math.max(this.frameT, seconds);
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
      this.yaw = yaw; this.focus.set(pos.x, pos.y + 1.6, pos.z); this.idleT = 0; this.clearDist = 99; this.lockActive = false; this.lockRef = null;
    },
  };
  return rig;
}
