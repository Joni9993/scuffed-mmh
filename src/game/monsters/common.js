// Small helpers shared by the Brocken definitions.
import * as THREE from 'three';
import { lambert } from '../../render/ps1.js';

export const smooth = (t) => t * t * (3 - 2 * t);
export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Smallest absolute angle between two yaws. */
export const angAbs = (a, b) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));

/** Target is behind the monster (needed for tail attacks; those start without turning around first). */
export function targetBehind(m, minAngle = 1.7) {
  const t = m.target;
  if (!t) return false;
  return angAbs(m.rot, Math.atan2(t.pos.x - m.pos.x, t.pos.z - m.pos.z)) > minAngle;
}

/**
 * Tail sweep: the body winds up (turns sweep/2 away) and then spins `sweep` rad while the tail capsule (fixed behind the monster)
 * whips through the half circle behind the original facing.
 * Deterministic: direction from the attack seed (a.r(0)).
 */
export function tailSweep({ id, range = [0, 7.5], weight = 4, cooldown = 4, telegraph = 0.6, dmg, len = 7, radius = 1, sweep = 2.6, pose, flashParts = ['tail'], cond, y = 1.1, duration = 1.9, t0 = 0.62, t1 = 1.1 }) {
  return {
    id, range, weight, cooldown, telegraph, flashParts, duration, noFace: true, cond,
    marker: { at: 'self', radius: len }, markerUntil: telegraph + 0.2,
    hits: [{ t0, t1, shape: 'capsule', from: [0, y, -1.6], to: [0, y, -len], radius, dmg, knock: 'flinch' }],
    motion(tau, a) {
      // wind-up: turn away by half the sweep during the telegraph, then whip through the whole arc (tail ends up on the other side)
      const sign = a.r(0) < 0.5 ? 1 : -1;
      return { yaw: a.yaw0 + sign * (-sweep / 2 * smooth(clamp01(tau / telegraph)) + sweep * smooth(clamp01((tau - t0) / (t1 - t0)))) };
    },
    pose,
  };
}

/** Schwanz abtrennen (Brathalos, Jaggo): Mesh m.extra.tail2 verschwindet, ein zerlegbares Schwanzstück bleibt liegen (Event 'tailSevered'). Braucht extra { tail2, scale }. */
export function severTail(m) {
  const part = m.partById.tail;
  part.gone = true;
  const { tail2, scale } = m.extra;
  const pos = tail2.getWorldPosition(new THREE.Vector3());
  tail2.visible = false;
  // dropped tail: a carvable object lying in the world (P agent carves it via the tailSevered event)
  const drop = new THREE.Group();
  const clone = tail2.clone(true);
  clone.visible = true;
  clone.position.set(0, 0, 0);
  clone.rotation.set(0, 0, 0);
  clone.scale.setScalar(1);
  clone.traverse((o) => { if (o.material) o.material = lambert({ map: o.material.map }); }); // own materials: no part flash / jitter
  const wrap = new THREE.Group();
  wrap.scale.setScalar(scale);
  wrap.add(clone);
  drop.add(wrap);
  const gy = m.ctx.world.heightAt(pos.x, pos.z);
  drop.position.set(pos.x, gy + 0.35 * scale, pos.z);
  drop.rotation.y = m.rot + Math.PI * 0.12;
  m.ctx.scene?.add(drop);
  m.severedTail = { pos: { x: pos.x, y: gy, z: pos.z }, mesh: drop, carved: false };
  m.ctx.fx.spark(pos, 30, '#c03020', 7);
  m.ctx.bus.emit('tailSevered', { monster: m, pos: { x: pos.x, y: gy, z: pos.z }, mesh: drop });
}
