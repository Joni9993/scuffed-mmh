// Generic projectile system (arrows now, monster spit/rocks later).
//
//   const pr = new Projectiles(ctx);            // ctx = hunt (world, monsters, players, scene, fx ...)
//   pr.spawn({ pos, vel, gravity, drag, radius, life, team:'player'|'monster', pierce, color, onHit, onEnd, ... });
//   pr.update(dt)                               // called by Hunt.update ([W] block)
//
// Collision: the segment prev->pos (swept sphere/capsule) is tested against the part hurtspheres of all living
// monsters (team 'player') or the hurt capsules of players (team 'monster'), and against the world
// (heightAt for the ground, collide() for obstacles). Every distinct monster part is hit at most once per projectile;
// `pierce` = number of parts one projectile may hit (1 = stops at the first). Hit resolution is left to `onHit`,
// which for player projectiles should call `ctx.playerHit(...)` so damage numbers, Wucht, hitstop, part breaks and
// networking behave exactly like melee.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { capsule, overlap } from './hitbox.js';
import { lambert } from '../render/ps1.js';

const STICK_TIME = 1.6;
const MAX_ALIVE = 120;

/**
 * spawn() options:
 *  pos {x,y,z}, vel {x,y,z}      required
 *  gravity (m/s^2, default 0), drag (1/s, default 0), radius (default 0.12), life (s, default 3)
 *  team 'player' | 'monster'      who it can hit (default 'player' -> hits monsters)
 *  owner                          free reference (the shooter)
 *  pierce                         parts it may hit before stopping (default 1)
 *  onHit(info, proj)              info = { kind:'part', monster, hp:{part,sphere,pos}, pos, hitIndex }
 *                                      | { kind:'player', player, pos, hitIndex }
 *  onEnd(proj, reason, info)      reason 'pierce' | 'ground' | 'world' | 'timeout' | 'monster' | 'player'
 *  color (hex)                    arrow/trail colour; glow(proj) -> 'sweet'|'weak'|null swaps the arrow material
 *  stick (default true)           visual only: keep the arrow in the target/ground for a moment
 *  data                           free scratch object for the spawner
 */
export class Projectiles {
  constructor(ctx, { visual = true } = {}) {
    this.ctx = ctx;
    this.visual = visual;
    this.list = [];
    this.stuck = [];
    this.group = new THREE.Group();
    this.group.name = 'projectiles';
    this.time = 0;
    this._tmp = { x: 0, z: 0 };
    this.stats = { spawned: 0, hits: 0 };
    if (visual) buildShared();
  }

  spawn(o) {
    if (this.list.length >= MAX_ALIVE) this.#end(this.list[0], 'timeout');
    const p = {
      pos: { ...o.pos }, prev: { ...o.pos }, vel: { ...o.vel },
      gravity: o.gravity ?? 0, drag: o.drag ?? 0, radius: o.radius ?? 0.12, life: o.life ?? 3,
      team: o.team ?? 'player', owner: o.owner ?? null, pierce: o.pierce ?? 1, pierced: 0,
      onHit: o.onHit, onEnd: o.onEnd, color: o.color ?? 0xf0e6c8, glow: o.glow, stick: o.stick !== false,
      kind: o.kind ?? 'arrow', data: o.data ?? {}, age: 0, parts: new Set(), dead: false,
      origin: { ...o.pos }, hist: null, mesh: null, trail: null,
    };
    if (this.visual) this.#makeVisual(p);
    this.list.push(p);
    this.stats.spawned++;
    return p;
  }

  #makeVisual(p) {
    const m = new THREE.Mesh(SHARED.arrowGeo, SHARED.mat.base);
    m.scale.setScalar(p.kind === 'ball' ? 0.7 : 1);
    p.mesh = m;
    this.group.add(m);
    const N = 7;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { arr[i * 3] = p.pos.x; arr[i * 3 + 1] = p.pos.y; arr[i * 3 + 2] = p.pos.z; }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const line = new THREE.Line(geo, trailMat(p.color));
    line.frustumCulled = false;
    p.trail = line;
    this.group.add(line);
    this.#orient(p);
  }

  #orient(p) {
    const m = p.mesh;
    if (!m) return;
    m.position.set(p.pos.x, p.pos.y, p.pos.z);
    const sp = Math.hypot(p.vel.x, p.vel.y, p.vel.z) || 1;
    _d.set(p.vel.x / sp, p.vel.y / sp, p.vel.z / sp);
    m.quaternion.setFromUnitVectors(_z, _d);
    if (p.glow) {
      const g = p.glow(p);
      m.material = g === 'sweet' ? SHARED.mat.sweet : g === 'weak' ? SHARED.mat.weak : SHARED.mat.base;
    }
  }

  #pushTrail(p) {
    const a = p.trail.geometry.attributes.position;
    const arr = a.array;
    arr.copyWithin(3, 0, arr.length - 3);
    arr[0] = p.pos.x; arr[1] = p.pos.y; arr[2] = p.pos.z;
    a.needsUpdate = true;
  }

  update(dt) {
    this.time += dt;
    const cache = new Map(); // monster -> hurtParts for this step
    const hurt = (m) => { let h = cache.get(m); if (!h) { h = m.hurtParts(); cache.set(m, h); } return h; };
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.dead) { this.list.splice(i, 1); continue; }
      this.#step(p, dt, hurt);
      if (p.dead) this.list.splice(i, 1);
    }
    for (let i = this.stuck.length - 1; i >= 0; i--) {
      const s = this.stuck[i];
      s.t -= dt;
      if (s.t <= 0) { s.obj.removeFromParent(); if (s.dispose) s.obj.geometry.dispose(); this.stuck.splice(i, 1); }
    }
  }

  #step(p, dt, hurt) {
    p.age += dt;
    p.prev.x = p.pos.x; p.prev.y = p.pos.y; p.prev.z = p.pos.z;
    p.vel.y -= p.gravity * dt;
    if (p.drag > 0) { const k = Math.exp(-p.drag * dt); p.vel.x *= k; p.vel.y *= k; p.vel.z *= k; }
    p.pos.x += p.vel.x * dt; p.pos.y += p.vel.y * dt; p.pos.z += p.vel.z * dt;

    // ---- targets along the swept segment
    const seg = capsule(p.prev, p.pos, p.radius);
    const cands = [];
    const ax = p.prev.x, ay = p.prev.y, az = p.prev.z;
    const bx = p.pos.x - ax, by = p.pos.y - ay, bz = p.pos.z - az;
    const l2 = bx * bx + by * by + bz * bz || 1e-9;
    const along = (c) => Math.max(0, Math.min(1, ((c.x - ax) * bx + (c.y - ay) * by + (c.z - az) * bz) / l2));
    if (p.team === 'player') {
      for (const m of this.ctx.monsters) {
        if (!m.alive) continue;
        for (const hp of hurt(m)) {
          if (p.parts.has(m.id + '|' + hp.part.id)) continue;
          if (overlap(seg, hp.sphere)) cands.push({ t: along(hp.sphere), monster: m, hp });
        }
      }
    } else {
      for (const pl of this.ctx.players) {
        if (!pl.alive || pl.state === 'ko') continue;
        for (const c of pl.hitCapsules()) {
          if (p.parts.has(pl.id)) continue;
          if (overlap(seg, c)) { cands.push({ t: along({ x: (c.a.x + c.b.x) / 2, y: (c.a.y + c.b.y) / 2, z: (c.a.z + c.b.z) / 2 }), player: pl }); break; }
        }
      }
    }
    cands.sort((a, b) => a.t - b.t);
    for (const c of cands) {
      // one hit per distinct part (several spheres of one part count once)
      const key = c.monster ? c.monster.id + '|' + c.hp.part.id : c.player.id;
      if (p.parts.has(key)) continue;
      p.parts.add(key);
      p.pierced++;
      this.stats.hits++;
      const hx = ax + bx * c.t, hy = ay + by * c.t, hz = az + bz * c.t;
      const info = c.monster
        ? { kind: 'part', monster: c.monster, hp: c.hp, pos: { x: hx, y: hy, z: hz }, hitIndex: p.pierced }
        : { kind: 'player', player: c.player, pos: { x: hx, y: hy, z: hz }, hitIndex: p.pierced };
      p.onHit?.(info, p);
      if (p.pierced >= p.pierce) {
        p.pos.x = hx; p.pos.y = hy; p.pos.z = hz;
        this.#end(p, c.monster ? 'monster' : 'player', info);
        return;
      }
    }

    // ---- world
    const w = this.ctx.world;
    if (w) {
      const h = w.heightAt(p.pos.x, p.pos.z);
      if (p.pos.y <= h) { p.pos.y = h; this.#end(p, 'ground'); return; }
      const t = this._tmp;
      t.x = p.pos.x; t.z = p.pos.z;
      w.collide?.(t, 0.05);
      if (Math.abs(t.x - p.pos.x) + Math.abs(t.z - p.pos.z) > 0.08 && p.pos.y < h + 3.5) { this.#end(p, 'world'); return; }
    }
    if (p.age >= p.life) { this.#end(p, 'timeout'); return; }
    if (p.mesh) { this.#orient(p); this.#pushTrail(p); }
  }

  #end(p, reason, info) {
    if (p.dead) return;
    p.dead = true;
    p.onEnd?.(p, reason, info);
    if (!p.mesh) return;
    this.#orient(p);
    this.#pushTrail(p);
    if (p.stick && reason !== 'timeout') {
      if (reason === 'monster' && info?.monster?.mesh) info.monster.mesh.attach(p.mesh);
      this.stuck.push({ obj: p.mesh, t: STICK_TIME });
    } else p.mesh.removeFromParent();
    // the trail lingers a moment, then goes away with the arrow
    this.stuck.push({ obj: p.trail, t: 0.22, dispose: true });
  }

  /** Remove everything (scene change). */
  clear() {
    for (const p of this.list) { p.mesh?.removeFromParent(); p.trail?.removeFromParent(); p.trail?.geometry.dispose(); }
    for (const s of this.stuck) { s.obj.removeFromParent(); if (s.dispose) s.obj.geometry.dispose(); }
    this.list.length = 0; this.stuck.length = 0;
  }
  dispose() { this.clear(); this.group.removeFromParent(); }
}

// ---------- shared visuals (PS1 look: boxes + lines)
const _z = new THREE.Vector3(0, 0, 1), _d = new THREE.Vector3();
const SHARED = {};
const trailMats = new Map();
function trailMat(color) {
  let m = trailMats.get(color);
  if (!m) { m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7, fog: false }); trailMats.set(color, m); }
  return m;
}
function buildShared() {
  if (SHARED.arrowGeo) return;
  const col = (g, hex) => {
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  const shaft = col(new THREE.BoxGeometry(0.045, 0.045, 0.95), '#c9a46a');
  const head = col(new THREE.BoxGeometry(0.1, 0.1, 0.16).translate(0, 0, 0.52), '#d8dde6');
  const fl1 = col(new THREE.BoxGeometry(0.2, 0.012, 0.2).translate(0, 0, -0.38), '#e8483a');
  const fl2 = col(new THREE.BoxGeometry(0.012, 0.2, 0.2).translate(0, 0, -0.38), '#e8483a');
  SHARED.arrowGeo = mergeGeometries([shaft, head, fl1, fl2]);
  SHARED.mat = {
    base: lambert({ vertexColors: true }),
    sweet: lambert({ vertexColors: true, emissive: new THREE.Color(1, 0.85, 0.2) }),
    weak: lambert({ vertexColors: true, emissive: new THREE.Color(0.0, 0.0, 0.0), color: new THREE.Color(0.55, 0.55, 0.6) }),
  };
}
