import * as THREE from 'three';
import { capsule, sphere, overlap } from '../hitbox.js';
import { basic } from '../../render/ps1.js';

/**
 * Brocken projectiles (fireballs, mud blobs). Deterministic: the flight is a pure function of the spawn definition and
 * the projectile age (see `projPos`), so host and clients that replay the same attack see the same projectile.
 * Hits are tested client-side against the LOCAL player only (like melee attacks).
 *
 * def: { kind:'fire'|'mud', from:{x,y,z}, to:{x,y,z}, dur, arc, radius, dmg, knock, status:{type,...}, key,
 *        mode:'sweep'|'impact', splash (impact radius), hold (impact hit window s) }
 *  - sweep : the moving sphere hits the player on the way (fireball)
 *  - impact: harmless in the air, ground marker shows the landing; sphere `splash` hits during [dur, dur+hold] (mud)
 */
export function projPos(def, age) {
  const k = Math.min(1, Math.max(0, age / def.dur));
  return {
    x: def.from.x + (def.to.x - def.from.x) * k,
    y: def.from.y + (def.to.y - def.from.y) * k + (def.arc ?? 0) * 4 * k * (1 - k),
    z: def.from.z + (def.to.z - def.from.z) * k,
  };
}
export function projShapeAt(def, age) {
  const p = projPos(def, age);
  if (def.mode === 'impact') return age >= def.dur && age <= def.dur + (def.hold ?? 0.2) ? sphere(def.to.x, def.to.y + 0.2, def.to.z, def.splash) : null;
  return sphere(p.x, p.y, p.z, def.radius);
}

/** Straight fireball def aimed from `from` at `aim`, flying `extra` m beyond. */
export function fireballDef({ from, aim, speed = 17, extra = 10, radius = 0.75, dmg = 28, key, status = { type: 'burn' } }) {
  const dx = aim.x - from.x, dy = aim.y - from.y, dz = aim.z - from.z, d = Math.hypot(dx, dy, dz) || 1;
  const L = d + extra;
  return {
    kind: 'fire', mode: 'sweep', from: { ...from },
    to: { x: from.x + (dx / d) * L, y: from.y + (dy / d) * L, z: from.z + (dz / d) * L },
    dur: L / speed, arc: 0, radius, dmg, knock: 'flinch', status, key,
  };
}
export function mudDef({ from, to, dur = 0.9, arc = 4, splash = 1.25, dmg = 10, key }) {
  return { kind: 'mud', mode: 'impact', from: { ...from }, to: { ...to }, dur, arc, radius: 0.35, splash, hold: 0.22, dmg, knock: 'flinch', status: { type: 'mud' }, key };
}

const geoBox = new THREE.BoxGeometry(1, 1, 1);
const mats = {};
const matFor = (kind) => (mats[kind] ??= basic({ color: kind === 'fire' ? '#ff7a1a' : '#5a3e22' }));

export class ProjectileSet {
  constructor(ctx, owner) {
    this.ctx = ctx;
    this.owner = owner;
    this.list = [];
  }
  spawn(def, age = 0) {
    const pr = { def, age, hit: new Set(), mesh: null, prev: projPos(def, age) };
    if (this.ctx.scene) {
      const s = def.kind === 'fire' ? 0.7 : 0.45;
      pr.mesh = new THREE.Mesh(geoBox, matFor(def.kind));
      pr.mesh.scale.setScalar(s);
      this.ctx.scene.add(pr.mesh);
    }
    this.list.push(pr);
    return pr;
  }
  update(dt) {
    const ctx = this.ctx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const pr = this.list[i], def = pr.def;
      pr.age += dt;
      const pos = projPos(def, pr.age);
      const done = pr.age > def.dur + (def.mode === 'impact' ? (def.hold ?? 0.2) : 0);
      if (pr.mesh) {
        pr.mesh.visible = pr.age <= def.dur;
        pr.mesh.position.set(pos.x, pos.y, pos.z);
        pr.mesh.rotation.set(pr.age * 7, pr.age * 5, 0);
        if (def.kind === 'fire') pr.mesh.scale.setScalar(0.65 + Math.sin(pr.age * 40) * 0.08);
      }
      if (def.kind === 'fire' && pr.age <= def.dur) ctx.fx?.spark?.(pos, 1, Math.random() < 0.5 ? '#ff8a20' : '#ffd060', 1.2);
      if (def.mode === 'impact') {
        const mk = `${this.owner.id}|${def.key}`;
        if (pr.age <= def.dur) ctx.fx?.marker?.(mk, { x: def.to.x, y: def.to.y, z: def.to.z }, def.splash, '#b06a20', false);
        else if (!pr.landed) { pr.landed = true; ctx.fx?.marker?.(mk, { x: def.to.x, y: def.to.y, z: def.to.z }, def.splash, '#b06a20', true); ctx.fx?.spark?.({ x: def.to.x, y: def.to.y + 0.3, z: def.to.z }, 10, '#7a5230', 4); }
        if (done) ctx.fx?.clearMarker?.(mk);
      }
      const shape = def.mode === 'impact' ? projShapeAt(def, pr.age) : (pr.age <= def.dur ? capsule(pr.prev, pos, def.radius) : null);
      if (shape) this._hitPlayers(pr, shape, pos);
      pr.prev = pos;
      if (done) this._remove(i);
    }
  }
  _hitPlayers(pr, shape, pos) {
    const ctx = this.ctx, def = pr.def;
    ctx.debugShape?.(shape, '#ff3030');
    for (const p of ctx.players) {
      if (!p.local || !p.alive || pr.hit.has(p.id)) continue;
      if (!p.hitCapsules().some((c) => overlap(shape, c))) continue;
      const res = p.takeHit({
        dmg: def.dmg * (this.owner.dmgMul ?? 1), knock: def.knock ?? 'flinch', key: `${def.key}|${p.id}`,
        sourcePos: pos, status: def.status, attackId: def.attackId ?? String(def.key).split('@')[0], monster: this.owner,
      });
      if (res === 'hit' || res === 'block') {
        pr.hit.add(p.id);
        if (def.kind === 'fire') { ctx.fx?.spark?.(pos, 14, '#ff8a20', 5); pr.age = Math.max(pr.age, def.dur); }
        ctx.bus.emit('sfx', { name: 'monsterHit', pos: p.pos });
      }
    }
  }
  _remove(i) {
    const pr = this.list[i];
    if (pr.mesh) { pr.mesh.parent?.remove(pr.mesh); }
    if (pr.def.mode === 'impact') this.ctx.fx?.clearMarker?.(`${this.owner.id}|${pr.def.key}`);
    this.list.splice(i, 1);
  }
  clear() { for (let i = this.list.length - 1; i >= 0; i--) this._remove(i); }
}
