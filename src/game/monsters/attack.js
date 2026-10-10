import { createRng } from '../../core/rng.js';
import { localToWorld, yawOf } from '../../core/math.js';
import { sphere, capsule } from '../hitbox.js';

export const MIN_TELEGRAPH = 0.5;
export const RAGE_SPEED = 1.2;
export const RAGE_TELEGRAPH = 0.8;

/**
 * A running brocken attack, a pure function of its start params:
 *   { attackId, t0, origin:{x,y,z}, yaw | dir:{x,z}, targetPos:{x,y,z}, seed, rage? }
 * Same params -> same motion and hit shapes at the same attack time t (deterministic across clients).
 *
 * Attack def (times in "def time" tau; telegraph = tau of first possible hit):
 *  { id, range:[min,max], weight, cooldown, rageOnly, telegraph, flashParts:['legs'], duration,
 *    hits:[{ t0, t1, shape:'sphere'|'capsule', at|from,to (monster-local METERS, +z fwd), radius, dmg, knock }],
 *    motion?(tau, a) -> { x, z, yaw?, air? },          // a: { origin, yaw0, dir, target, r(i), def }
 *    pose?: compiled track (monster pose keys) sampled by tau, marker?: { at:'target'|'landing'|'self', radius },
 *    events?: [{ t, call }], cond?(monster, ctx) }
 * Rage: telegraph shortened by 20 % (never below 0.5 s), rest plays 1.2x faster. def.tempo (default 1) speeds up the whole attack (telegraph never below 0.5 s).
 */
export class AttackInstance {
  constructor(def, params) {
    this.def = def;
    this.params = params;
    this.origin = { x: params.origin.x, y: params.origin.y ?? 0, z: params.origin.z };
    this.yaw0 = params.yaw ?? (params.dir ? yawOf(params.dir.x, params.dir.z) : 0);
    this.dir = { x: Math.sin(this.yaw0), z: Math.cos(this.yaw0) };
    this.target = params.targetPos ?? { x: this.origin.x + this.dir.x * 5, y: this.origin.y, z: this.origin.z + this.dir.z * 5 };
    this.rage = !!params.rage;
    const seedRng = createRng(params.seed ?? 1);
    this.rolls = Array.from({ length: 16 }, () => seedRng());
    this.r = (i) => this.rolls[i % 16];
    this.key = `${params.attackId}@${params.t0}`;
    this.hitSet = new Set();
    this.firedEvents = new Set();

    const tg = def.telegraph, mul = params.tgMul ?? 1, tempo = def.tempo ?? 1; // tempo: Grundtempo des Angriffs (z. B. Barrotz 1,2)
    const tgBase = mul === 1 && tempo === 1 ? tg : Math.max(MIN_TELEGRAPH, tg * mul / tempo); // Timing-Variation (Brocken 2.0); Rage-Kürzung kommt danach
    this.tgWall = this.rage ? Math.max(MIN_TELEGRAPH, tgBase * RAGE_TELEGRAPH) : tgBase;
    this.speed = (this.rage ? RAGE_SPEED : 1) * tempo;
    this.duration = this.tgWall + (def.duration - tg) / this.speed;
    this.landing = null;
    def.prepare?.(this);
  }

  /** wall time -> def time */
  tau(t) {
    const tg = this.def.telegraph;
    return t < this.tgWall ? t * (tg / this.tgWall) : tg + (t - this.tgWall) * this.speed;
  }

  /** def time -> wall time (inverse of tau) */
  wall(tau) {
    const tg = this.def.telegraph;
    return tau < tg ? tau * (this.tgWall / tg) : this.tgWall + (tau - tg) / this.speed;
  }

  sample(t) {
    const tau = this.tau(t);
    let s;
    if (this.def.motion) s = this.def.motion(tau, this);
    s = { x: this.origin.x, z: this.origin.z, yaw: this.yaw0, air: 0, ...s };
    s.tau = tau;
    s.phase = tau < this.def.telegraph ? 'telegraph' : t >= this.duration ? 'done' : 'active';
    return s;
  }

  /** Active hit shapes at wall time t, in world space. */
  hitsAt(t) {
    const s = this.sample(t);
    const out = [];
    const base = { x: s.x, y: this.origin.y + s.air, z: s.z };
    const hits = this.def.hits ?? [];
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      if (s.tau < h.t0 || s.tau > h.t1) continue;
      let shape;
      if (h.shape === 'capsule') {
        const a = localToWorld({}, base, s.yaw, h.from[0], h.from[1], h.from[2]);
        const b = localToWorld({}, base, s.yaw, h.to[0], h.to[1], h.to[2]);
        shape = capsule(a, b, h.radius);
      } else {
        const c = localToWorld({}, base, s.yaw, h.at[0], h.at[1], h.at[2]);
        shape = sphere(c.x, c.y, c.z, h.radius);
      }
      out.push({ idx: i, key: `${this.key}:${i}`, shape, hit: h, dmg: h.dmg, knock: h.knock ?? 'flinch' });
    }
    return out;
  }

  /** Wall time of the first possible hit (telegraph length as the player experiences it). */
  firstHitTime() {
    let m = Infinity;
    for (const h of this.def.hits ?? []) m = Math.min(m, h.t0);
    return this.tgWall + (m - this.def.telegraph) / this.speed;
  }
}

export const lerp3 = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k });
