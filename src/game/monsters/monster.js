import * as THREE from 'three';
import { clamp, stepAngle, yawOf, angleDiff, wrapAngle } from '../../core/math.js';
import { createRng } from '../../core/rng.js';
import { compileTrack, sampleTrack } from '../anim.js';
import { AttackInstance } from './attack.js';
import { overlap } from '../hitbox.js';
import { radialTexture } from '../../render/textures.js';

export const MREST = { bodyY: 0, bodyPitch: 0, bodyRoll: 0, neck: 0, head: 0, headYaw: 0, tailYaw: 0, tailPitch: 0, legL: 0, legR: 0 };
export const mTrack = (frames) => compileTrack(frames, MREST);

const RAGE_DURATION = 45, RAGE_HP = 0.6, RAGE_BURST = 300, RAGE_BURST_WINDOW = 20, RAGE_COOLDOWN = 20;
const FLEE_HP = 0.3, STAGGER = 2.0, STUN_TIME = 6.0, STUN_BASE = 150, THREAT_WINDOW = 10;
const _v = new THREE.Vector3();

/**
 * Brocken base class. AI states: wander -> notice(roar) -> combat -> (rage = Rotglut flag) -> flee (30 % HP)
 * -> sleep (nest) -> combat. Extra: stagger (Teilbruch), stunned, dead.
 *
 * def: see docs/ARCHITECTURE.md "Monster definition". Attacks run as AttackInstance (deterministic, networkable).
 */
export class Monster {
  constructor(def, ctx, { id, x = 0, z = 0, yaw = 0, state = 'wander', seed = 1, authority = true } = {}) {
    this.def = def;
    this.ctx = ctx;
    this.id = id ?? `${def.id}-${Math.floor(Math.random() * 1e6)}`;
    this.type = 'monster';
    this.minor = !!def.minor;
    this.authority = authority;
    this.rng = createRng(seed);
    this.pos = new THREE.Vector3(x, ctx.world.heightAt(x, z), z);
    this.rot = yaw;
    this.vel = new THREE.Vector3();
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.bodyRadius = def.bodyRadius;
    this.state = state;
    this.stateT = 0;
    this.home = { x, z };
    this.time = 0;
    this.attack = null;       // { inst, t }
    this.cds = {};
    this.recover = 0.5;
    this.target = null;
    this.threat = new Map();  // playerId -> [{t, dmg}]
    this.retargetT = 0;
    this.rage = false; this.rageT = 0; this.rageCd = 0; this.rageUsed = false;
    this.burst = [];          // [{t, dmg}]
    this.stagT = 0; this.stunT = 0; this.stun = 0; this.stunThreshold = STUN_BASE;
    this.hitFlash = 0;
    this.discovered = false;
    this.gait = 0;
    this.wanderT = 0; this.wanderTo = null;
    this.fleeing = false;
    this.pose = { ...MREST };
    this.marker = null;

    const built = def.build();
    this.mesh = built.root;
    this.rigApply = built.apply;
    this.nodes = built.nodes;
    this.partMeshes = built.partMeshes;
    this.extra = built.extra || {};
    this.parts = def.parts.map((p) => ({
      ...p, hp: p.breakHp ?? Infinity, broken: false, baseFactor: p.factor,
      sph: p.spheres.map((sp) => ({ node: this.nodes[sp.node], offset: sp.offset ?? [0, 0, 0], r: sp.r })),
      mats: (this.partMeshes[p.id] ?? []).map((m) => m.material),
    }));
    this.partById = Object.fromEntries(this.parts.map((p) => [p.id, p]));
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,.6)'), transparent: true, depthWrite: false, fog: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.setScalar(def.bodyRadius * 3.2);
    this.shadow.renderOrder = 1;
    this.sync();
  }

  get alive() { return this.state !== 'dead'; }
  get sleeping() { return this.state === 'sleep'; }
  get invulnerable() { return false; }
  get speedMul() { return this.rage ? 1.2 : 1; }
  get dmgMul() { return this.rage ? 1.15 : 1; }

  setState(s) {
    if (this.state === s) return;
    const prev = this.state;
    this.state = s;
    this.stateT = 0;
    if (s === 'notice' || s === 'enrage') this.ctx.bus.emit('sfx', { name: 'roar', pos: this.pos });
    this.ctx.bus.emit('monsterState', { monster: this, state: s, prev });
  }

  // ---------- hurtboxes
  /** [{part, sphere:{type,x,y,z,r}, pos:Vector3}] in world space (uses current pose). */
  hurtParts() {
    const out = [];
    const sc = this.def.scale;
    for (const part of this.parts) {
      for (const sp of part.sph) {
        _v.set(sp.offset[0], sp.offset[1], sp.offset[2]);
        sp.node.localToWorld(_v);
        out.push({ part, pos: _v.clone(), sphere: { type: 'sphere', x: _v.x, y: _v.y, z: _v.z, r: sp.r * sc } });
      }
    }
    return out;
  }
  lockPoints() {
    const pts = [];
    for (const part of this.parts) {
      if (part.lock === false) continue;
      const sp = part.sph[0];
      pts.push({ partId: part.id, pos: sp.node.localToWorld(new THREE.Vector3(sp.offset[0], sp.offset[1], sp.offset[2])) });
    }
    return pts;
  }

  // ---------- damage intake
  applyDamage(res) {
    if (!this.alive) return null;
    const part = this.partById[res.partId];
    const total = res.dmg + (res.elemDmg || 0);
    const wasSleeping = this.sleeping;
    this.hp = Math.max(0, this.hp - total);
    this.hitFlash = 0.12;
    const pid = res.attackerId ?? 'p1';
    this.#addThreat(pid, total);
    const ev = { monster: this, part, dmg: total, res, broke: false, stunned: false, killed: false };
    if (part) {
      if (part.breakHp && !part.broken) {
        part.hp -= total;
        const jit = clamp(1 - part.hp / part.breakHp, 0, 1) * (part.jitter ?? 0.05);
        for (const m of part.mats) m.userData.ps1.uJit.value = jit;
        if (part.hp <= 0) { this.#breakPart(part); ev.broke = true; }
      }
      if (res.blunt > 0 && part.stunPart) {
        this.stun += res.blunt;
        if (this.stun >= this.stunThreshold && this.stunT <= 0) {
          this.stun = 0;
          this.stunThreshold *= 1.5;
          this.stunT = STUN_TIME;
          this.#interrupt();
          this.ctx.bus.emit('monsterStun', { monster: this });
          ev.stunned = true;
        }
      }
    }
    // rage triggers
    this.burst.push({ t: this.time, dmg: total });
    if (!this.minor && this.authority) {
      if (!this.rageUsed && this.hp <= this.maxHp * RAGE_HP) { this.rageUsed = true; this.#enrage(); }
      else if (this.rageCd <= 0 && !this.rage && this.#burstDamage() >= RAGE_BURST) this.#enrage();
    }
    if (this.hp <= 0) { this.#die(); ev.killed = true; return ev; }
    if (wasSleeping) { this.#interrupt(); this.setState('combat'); this.recover = 1.2; }
    else if (this.state === 'wander') { this.setState('notice'); this.discovered = true; }
    if (!this.minor && !this.fleeing && this.state !== 'sleep' && this.hp <= this.maxHp * FLEE_HP && this.state === 'combat') this.#startFlee();
    return ev;
  }
  #burstDamage() {
    this.burst = this.burst.filter((b) => this.time - b.t <= RAGE_BURST_WINDOW);
    return this.burst.reduce((s, b) => s + b.dmg, 0);
  }
  #addThreat(pid, dmg) {
    if (!this.threat.has(pid)) this.threat.set(pid, []);
    this.threat.get(pid).push({ t: this.time, dmg });
  }
  threatOf(pid) {
    const l = this.threat.get(pid);
    if (!l) return 0;
    let s = 0;
    for (const e of l) if (this.time - e.t <= THREAT_WINDOW) s += e.dmg;
    return s;
  }
  #breakPart(part) {
    part.broken = true;
    part.factor = Math.max(0, part.baseFactor - 0.1);
    for (const m of part.mats) m.userData.ps1.uJit.value = 0.01;
    this.stagT = STAGGER;
    this.#interrupt();
    this.def.onBreak?.(this, part);
    const p = part.sph[0].node.getWorldPosition(new THREE.Vector3());
    this.ctx.fx.spark(p, 24, '#ffffff', 6);
    this.ctx.fx.shake(0.35, 0.3);
    this.ctx.bus.emit('partBreak', { monster: this, part: part.id });
    this.ctx.bus.emit('sfx', { name: 'break', pos: p });
  }
  #enrage() {
    this.rage = true; this.rageT = RAGE_DURATION;
    this.#interrupt();
    this.setState('enrage');
    this.ctx.bus.emit('rage', { monster: this, on: true });
    this.def.onRage?.(this, true);
  }
  #die() {
    this.#interrupt();
    this.setState('dead');
    this.ctx.fx.clearMarker?.(this.id);
    this.ctx.bus.emit('monsterDead', { monster: this });
    this.ctx.bus.emit('sfx', { name: 'roar', pos: this.pos, low: true });
  }
  #interrupt() {
    if (this.attack) { this.attack = null; this.ctx.fx.clearMarker?.(this.id); this.recover = 0.4; }
  }
  #startFlee() {
    this.fleeing = true;
    this.#interrupt();
    this.setState('flee');
  }

  // ---------- attacks
  /** Start an attack from authoritative params (also used by clients to replay). elapsed = seconds already passed. */
  startAttack(params, elapsed = 0) {
    const def = this.def.attacks[params.attackId];
    if (!def) return null;
    const inst = new AttackInstance(def, { ...params, rage: params.rage ?? this.rage });
    this.attack = { inst, t: elapsed, id: params.attackId };
    this.cds[def.id] = def.cooldown ?? 3;
    if (this.authority) this.ctx.bus.emit('monsterAttack', { monsterId: this.id, ...params, rage: inst.rage });
    this.ctx.bus.emit('sfx', { name: 'telegraph', pos: this.pos, big: !this.minor });
    return inst;
  }

  #chooseAttack(dist) {
    const cands = [];
    let total = 0;
    for (const def of Object.values(this.def.attacks)) {
      if (def.rageOnly && !this.rage) continue;
      if ((this.cds[def.id] ?? 0) > 0) continue;
      if (dist < def.range[0] || dist > def.range[1]) continue;
      if (def.cond && !def.cond(this, this.ctx)) continue;
      cands.push(def);
      total += def.weight ?? 1;
    }
    if (!cands.length) return null;
    let r = this.rng() * total;
    for (const c of cands) { r -= c.weight ?? 1; if (r <= 0) return c; }
    return cands[cands.length - 1];
  }

  // ---------- targeting
  #pickTarget() {
    const alive = this.ctx.players.filter((p) => p.alive);
    if (!alive.length) { this.target = null; return; }
    let best = null, bt = -1;
    for (const p of alive) {
      const th = this.threatOf(p.id) + 1 / (1 + Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z));
      if (th > bt) { bt = th; best = p; }
    }
    if (alive.length > 1 && this.rng() < 0.15) best = alive[Math.floor(this.rng() * alive.length)];
    this.target = best;
  }
  #nearestPlayer() {
    let best = null, bd = Infinity;
    for (const p of this.ctx.players) {
      if (!p.alive) continue;
      const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return { p: best, d: bd };
  }

  // ---------- update
  update(dt) {
    this.time += dt;
    this.stateT += dt;
    for (const k in this.cds) this.cds[k] = Math.max(0, this.cds[k] - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.rageCd = Math.max(0, this.rageCd - dt);
    if (this.rage) {
      this.rageT -= dt;
      if (this.rageT <= 0) { this.rage = false; this.rageCd = RAGE_COOLDOWN; this.ctx.bus.emit('rage', { monster: this, on: false }); this.def.onRage?.(this, false); }
      else if (Math.random() < dt * 8) this.ctx.fx.spark({ x: this.pos.x + (Math.random() - 0.5) * 2, y: this.pos.y + 3.5, z: this.pos.z + (Math.random() - 0.5) * 2 }, 1, '#ff5030', 1.5);
    }
    if (this.authority && this.alive) this.#ai(dt);
    this.#visuals(dt);
  }

  #ai(dt) {
    if (this.stagT > 0) { this.stagT -= dt; this.#brake(dt); return; }
    if (this.stunT > 0) { this.stunT -= dt; this.#brake(dt); return; }
    switch (this.state) {
      case 'wander': this.#wander(dt); break;
      case 'notice':
      case 'enrage':
        this.#faceTarget(dt, 3);
        this.#brake(dt);
        if (this.stateT >= (this.state === 'notice' ? 1.6 : 1.4)) { this.recover = 0.3; this.setState('combat'); }
        break;
      case 'combat': this.#combat(dt); break;
      case 'flee': this.#flee(dt); break;
      case 'sleep': this.#sleep(dt); break;
    }
    this.#clampWorld();
  }

  #brake(dt) { this.vel.multiplyScalar(Math.exp(-6 * dt)); }

  #wander(dt) {
    const { p, d } = this.#nearestPlayer();
    const detect = this.def.detect ?? 28;
    if (p && d < detect) {
      const ang = Math.abs(angleDiff(this.rot, yawOf(p.pos.x - this.pos.x, p.pos.z - this.pos.z)));
      if (d < detect * 0.4 || ang < 1.3) {
        this.target = p; this.discovered = true;
        this.setState('notice');
        return;
      }
    }
    this.wanderT -= dt;
    if (this.wanderT <= 0 && !this.wanderTo) {
      const a = this.rng() * Math.PI * 2, r = 6 + this.rng() * 16;
      this.wanderTo = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
    }
    if (this.wanderTo) {
      const dx = this.wanderTo.x - this.pos.x, dz = this.wanderTo.z - this.pos.z, dd = Math.hypot(dx, dz);
      if (dd < 1.5) { this.wanderTo = null; this.wanderT = 2 + this.rng() * 4; this.#brake(dt); return; }
      this.#moveToward(dt, dx, dz, this.def.walk, 1.6);
    } else this.#brake(dt);
  }

  #combat(dt) {
    if (this.attack) { this.#runAttack(dt); return; }
    this.retargetT -= dt;
    if (!this.target || !this.target.alive || this.retargetT <= 0) { this.#pickTarget(); this.retargetT = 5; }
    const tgt = this.target;
    if (!tgt) { this.#brake(dt); this.setState('wander'); this.wanderT = 3; return; }
    const dx = tgt.pos.x - this.pos.x, dz = tgt.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    this.recover -= dt;
    const want = yawOf(dx, dz);
    const diff = Math.abs(angleDiff(this.rot, want));
    if (this.recover > 0) { this.#faceTarget(dt, 1.2); this.#brake(dt); return; }
    const def = this.#chooseAttack(dist);
    if (def) {
      if (diff > 0.4) { this.#faceTarget(dt, 3.4); this.#brake(dt); return; }
      this.startAttack({
        attackId: def.id, t0: this.time, origin: { x: this.pos.x, y: this.pos.y, z: this.pos.z },
        yaw: this.rot, targetPos: { x: tgt.pos.x, y: tgt.pos.y, z: tgt.pos.z }, seed: Math.floor(this.rng() * 1e9),
      });
      return;
    }
    const prefer = this.def.prefer ?? 4.5;
    if (dist > prefer) this.#moveToward(dt, dx, dz, this.def.run, 3.2);
    else if (dist < prefer * 0.6) { this.#faceTarget(dt, 2); this.#moveToward(dt, -dx, -dz, this.def.walk * 0.8, 0, true); }
    else { this.#faceTarget(dt, 2.4); const s = Math.sin(this.time * 0.7) > 0 ? 1 : -1; this.#moveToward(dt, -dz * s, dx * s, this.def.walk * 0.7, 0, true); }
  }

  #runAttack(dt) {
    const a = this.attack, inst = a.inst, ctx = this.ctx;
    a.t += dt;
    const s = inst.sample(a.t);
    this.pos.x = s.x; this.pos.z = s.z; this.rot = s.yaw;
    this.ctx.world.collide(this.pos, this.bodyRadius * 0.5);
    this.pos.y = ctx.world.heightAt(this.pos.x, this.pos.z) + s.air;
    this.vel.set(0, 0, 0);
    // timeline events (authority only: spawns etc.)
    for (const e of inst.def.events ?? []) {
      if (s.tau >= e.t && !inst.firedEvents.has(e)) { inst.firedEvents.add(e); inst.def.calls?.[e.call]?.(this, ctx, inst); }
    }
    this.#attackHits(inst, a.t);
    if (a.t >= inst.duration) {
      this.attack = null;
      this.ctx.fx.clearMarker?.(this.id);
      this.recover = this.def.recoverAfter?.(this) ?? (this.minor ? 0.5 : 0.35 + this.rng() * 0.5) / this.speedMul;
    }
  }

  /** Test attack hit shapes against local players. Used for authority AND replayed (remote) attacks. */
  #attackHits(inst, t) {
    const hits = inst.hitsAt(t);
    if (!hits.length) return;
    for (const p of this.ctx.players) {
      if (!p.local || !p.alive) continue;
      const caps = p.hitCapsules();
      for (const h of hits) {
        const k = p.id + '|' + h.idx;
        if (inst.hitSet.has(k)) continue;
        this.ctx.debugShape?.(h.shape, '#ff3030');
        if (!caps.some((c) => overlap(h.shape, c))) continue;
        const res = p.takeHit({
          dmg: h.dmg * this.dmgMul, knock: h.knock, key: h.key + '|' + p.id, sourcePos: this.pos, attackId: inst.params.attackId, monster: this,
        });
        if (res === 'hit' || res === 'block') inst.hitSet.add(k);
        if (res === 'hit') this.ctx.bus.emit('sfx', { name: 'monsterHit', pos: p.pos });
      }
    }
  }

  /** Remote clients: advance a replayed attack. */
  tickRemote(dt) { this.time += dt; if (this.attack) this.#runAttack(dt); this.#visuals(dt); }

  #flee(dt) {
    const w = this.ctx.world;
    const nest = w.nestPoint ?? { x: this.home.x, z: this.home.z };
    const dx = nest.x - this.pos.x, dz = nest.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 3) { this.fleeing = false; this.setState('sleep'); this.vel.set(0, 0, 0); return; }
    this.#moveToward(dt, dx, dz, this.def.run * 1.1, 4);
  }

  #sleep(dt) {
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.01 * dt);
    this.#brake(dt);
    if (this.hp >= this.maxHp * 0.6) { this.setState('combat'); this.recover = 1.5; this.fleeing = false; this.rageUsed = false; }
  }

  #faceTarget(dt, rate) {
    const t = this.target;
    if (!t) return;
    this.rot = stepAngle(this.rot, yawOf(t.pos.x - this.pos.x, t.pos.z - this.pos.z), rate * this.speedMul * dt);
  }

  #moveToward(dt, dx, dz, speed, turn, keepFacing = false) {
    const want = yawOf(dx, dz);
    if (!keepFacing) this.rot = stepAngle(this.rot, want, (turn || 2) * this.speedMul * dt);
    const align = keepFacing ? 1 : clamp(1 - Math.abs(angleDiff(this.rot, want)) / 1.2, 0, 1);
    const l = Math.hypot(dx, dz) || 1;
    const sp = speed * this.speedMul * align * (this.hp < this.maxHp * 0.35 ? 0.9 : 1);
    const k = 1 - Math.exp(-5 * dt);
    this.vel.x += ((dx / l) * sp - this.vel.x) * k;
    this.vel.z += ((dz / l) * sp - this.vel.z) * k;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.ctx.world.collide(this.pos, this.bodyRadius * 0.6);
    this.pos.y = this.ctx.world.heightAt(this.pos.x, this.pos.z);
  }

  #clampWorld() { this.pos.y = this.attack ? this.pos.y : this.ctx.world.heightAt(this.pos.x, this.pos.z); }

  // ---------- visuals
  #visuals(dt) {
    const p = this.pose;
    const target = { ...MREST };
    let tele = null;
    const spd = Math.hypot(this.vel.x, this.vel.z);
    if (this.state === 'dead') {
      Object.assign(target, { bodyY: -1.1, bodyRoll: 80, head: 20, neck: -0.3, legL: 40, legR: -30 });
    } else if (this.attack) {
      const a = this.attack, s = a.inst.sample(a.t);
      if (a.inst.def.pose) sampleTrack(a.inst.def.pose, s.tau, target);
      if (s.phase === 'telegraph') tele = a.inst.def.flashParts ?? [];
      const mk = a.inst.def.marker;
      if (mk && s.tau < (a.inst.def.markerUntil ?? a.inst.def.telegraph + 0.7)) {
        let at = this.pos;
        if (mk.at === 'landing' && a.inst.landing) at = a.inst.landing;
        else if (mk.at === 'target') at = a.inst.target;
        this.ctx.fx.marker(this.id, { x: at.x, y: this.ctx.world.heightAt(at.x, at.z), z: at.z }, mk.radius, '#ff3030', s.phase !== 'telegraph');
      } else this.ctx.fx.clearMarker?.(this.id);
    } else if (this.state === 'sleep') {
      Object.assign(target, { bodyY: -0.75, head: 35, neck: -0.2, legL: 70, legR: 70, bodyPitch: 4 });
      target.bodyY += Math.sin(this.time * 1.5) * 0.04;
    } else if (this.state === 'notice' || this.state === 'enrage') {
      const k = Math.sin(clamp(this.stateT / 1.4, 0, 1) * Math.PI);
      Object.assign(target, { bodyPitch: -10 * k, neck: -0.5 * k, head: -35 * k, bodyY: 0.1 * k, tailPitch: -10 * k });
      if (Math.random() < 0.3) this.ctx.fx.shake(0.05, 0.1);
    } else if (this.stunT > 0) {
      Object.assign(target, { head: 40, neck: 0.2, bodyPitch: 6, headYaw: Math.sin(this.time * 6) * 20 });
    } else if (this.stagT > 0) {
      Object.assign(target, { bodyPitch: -14, head: -20, bodyY: -0.2, tailYaw: Math.sin(this.time * 30) * 6 });
    } else {
      this.gait += spd * dt * (0.8 / Math.max(0.8, this.def.scale * 0.6));
      const s = clamp(spd / (this.def.run || 6), 0, 1.2);
      const sw = Math.sin(this.gait * 4) * 45 * s;
      target.legL = sw; target.legR = -sw;
      target.bodyY = -Math.abs(Math.cos(this.gait * 4)) * 0.08 * s + Math.sin(this.time * 2) * 0.02;
      target.tailYaw = Math.sin(this.gait * 4) * 8 * s + Math.sin(this.time * 1.3) * 3;
      target.head = Math.sin(this.time * 1.7) * 3;
      if (this.hp < this.maxHp * 0.35) { target.bodyPitch = 5; target.legL *= 0.6; }
    }
    const k = 1 - Math.exp(-(this.attack ? 40 : 10) * dt);
    for (const key in target) p[key] += (target[key] - p[key]) * k;
    this.rigApply(p);

    // flash: telegraph red/white blink, hit flash white, rage glow
    const blink = Math.floor(this.time * 10) % 2 === 0;
    for (const part of this.parts) {
      let r = 0, g = 0, b = 0;
      if (tele && tele.includes(part.id)) { if (blink) { r = 0.9; g = 0.9; b = 0.9; } else { r = 0.9; g = 0.05; b = 0.05; } }
      else if (this.hitFlash > 0) { r = g = b = 0.45; }
      else if (this.rage) { r = 0.22; }
      for (const m of part.mats) m.emissive?.setRGB(r, g, b);
    }
    this.sync();
  }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.rot;
    this.shadow.position.set(this.pos.x, this.ctx.world.heightAt(this.pos.x, this.pos.z) + 0.05, this.pos.z);
    this.mesh.updateMatrixWorld(true);
  }

  snapshot() {
    return {
      id: this.id, def: this.def.id, pos: [this.pos.x, this.pos.y, this.pos.z], rot: this.rot, state: this.state,
      hpPct: this.hp / this.maxHp, rage: this.rage, parts: this.parts.map((p) => ({ id: p.id, hp: p.hp, broken: p.broken })),
    };
  }
}
