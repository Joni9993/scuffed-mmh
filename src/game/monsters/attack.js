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

    const tg = def.telegraph, mul = params.tgMul ?? 1, tempo = (def.tempo ?? 1) * (params.tempoMul ?? 1); // params.tempoMul: Tempo pro Brocken-Zustand (Krachfaust-Wut); tempo: Grundtempo des Angriffs (z. B. Barrotz 1,2)
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
    const base = { x: s.x, y: (s.groundY ?? this.origin.y) + s.air, z: s.z };
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

  /**
   * Bodenmarker-Grundflächen ALLER schädlichen Treffer (dmg > 0 oder Festhalten), direkt aus den echten Trefferformen abgeleitet.
   * x/z/r = Bereich, in dem der Pirscher (Kapsel r 0,4, Höhe 1,7) die Form berührt -> Marker und Hitbox können nicht auseinanderlaufen.
   * Bewegte Formen (Rolle) werden entlang des Wegs in mehrere Scheiben zerlegt. Ergebnis ist pro Instanz fest (prepare/motion sind deterministisch).
   */
  footprints() {
    if (this._fp) return this._fp;
    const out = [], hits = this.def.hits ?? [];
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      if (!(h.dmg > 0 || h.knock === 'pin')) continue;
      const pts = [];
      const samples = h.fpSamples ?? (h.shape === 'capsule' ? 10 : 3); // fpSamples: Schwenks (Flammenpeitsche) brauchen dichtere Scheiben
      for (let k = 0; k < samples; k++) {
        const s = this.sample(this.wall(h.t0 + (h.t1 - h.t0) * (k / (samples - 1))));
        const base = { x: s.x, y: (s.groundY ?? this.origin.y) + s.air, z: s.z };
        if (h.shape === 'capsule') {
          const a = h.from, b = h.to, len = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.ceil(len / Math.max(0.5, h.radius * 0.8)));
          for (let j = 0; j <= n; j++) { const f = j / n; pts.push(localToWorld({}, base, s.yaw, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f)); }
        } else pts.push(localToWorld({}, base, s.yaw, h.at[0], h.at[1], h.at[2]));
      }
      const kept = [];
      for (const c of pts) {
        const groundY = this.sample(this.wall((h.t0 + h.t1) / 2)).groundY ?? this.origin.y;
        const r = groundReach(h.radius, c.y - groundY);
        if (r <= 0) continue;
        if (kept.every((q) => Math.hypot(q.x - c.x, q.z - c.z) > (h.shape === 'capsule' ? Math.max(0.8, r * 1.1) : 0.35))) kept.push({ x: c.x, z: c.z, r });
      }
      if (kept.length > 12 && !h.noCollapse) { // noCollapse: Bogen-Schwenk bleibt als echte Bahn sichtbar // Schwenk um den Brocken (Schwanzfeger): eine Außenkante um ihn statt Dutzender Scheiben
        const mid = this.sample(this.wall((h.t0 + h.t1) / 2)), R = Math.max(...pts.map((c) => Math.hypot(c.x - mid.x, c.z - mid.z)));
        kept.length = 0; kept.push({ x: mid.x, z: mid.z, r: R + h.radius + HURT_R });
      }
      kept.forEach((q, n) => out.push({ idx: i, n, x: q.x, z: q.z, r: q.r, t0: h.t0, t1: h.t1 }));
    }
    return (this._fp = out);
  }

  /** Exact ground lanes for opt-in boss tells. Keep a capsule a lane, never a giant disc.
   * Motion is sampled over the hit's active interval, exactly as hitsAt() samples it.
   * This is cached per replicated attack, so a host and guest see the same warning.
   */
  telegraphs() {
    if (this._telegraphs) return this._telegraphs;
    const out = [];
    for (const [idx, h] of (this.def.hits ?? []).entries()) {
      if (!(h.dmg > 0 || h.knock === 'pin')) continue;
      const count = Math.max(2, h.fpSamples ?? (h.shape === 'capsule' ? 10 : 3)), kept = [];
      for (let n = 0; n < count; n++) {
        const step = (h.t1-h.t0)/(count-1), at = h.t0+step*n;
        const s = this.sample(this.wall(at));
        const base = { x: s.x, y: (s.groundY ?? this.origin.y) + s.air, z: s.z };
        const a = h.shape === 'capsule' ? localToWorld({}, base, s.yaw, ...h.from) : localToWorld({}, base, s.yaw, ...h.at);
        const b = h.shape === 'capsule' ? localToWorld({}, base, s.yaw, ...h.to) : a;
        const r = groundReach(h.radius, (a.y + b.y) / 2 - (s.groundY ?? this.origin.y));
        if (r <= 0) continue;
        const t0=Math.max(h.t0,at-step/2), t1=Math.min(h.t1,at+step/2);
        const same = kept.find(q => Math.hypot(q.ax-a.x,q.az-a.z,q.bx-b.x,q.bz-b.z) < .25 && Math.abs(q.r-r) < .1);
        if(same){same.t0=Math.min(same.t0,t0);same.t1=Math.max(same.t1,t1);continue;}
        kept.push({ idx, n: kept.length, ax:a.x, az:a.z, bx:b.x, bz:b.z, x:(a.x+b.x)/2, z:(a.z+b.z)/2, r, t0, t1 });
      }
      out.push(...kept);
    }
    return (this._telegraphs = out);
  }

  /** Wall time of the first possible hit (telegraph length as the player experiences it). */
  firstHitTime() {
    let m = Infinity;
    for (const h of this.def.hits ?? []) m = Math.min(m, h.t0);
    return this.tgWall + (m - this.def.telegraph) / this.speed;
  }
}

// Pirscher-Hurtbox (hitbox.js playerCapsule): Radius 0,4, senkrechte Strecke y 0,4..1,3 über dem Boden
export const HURT_R = 0.4, HURT_Y0 = 0.4, HURT_Y1 = 1.3;
/** Horizontale Reichweite (Mittelpunkt des Pirschers) einer Kugel r in Höhe y über dem Boden gegen die Pirscher-Kapsel. */
export function groundReach(r, y) {
  const dy = y < HURT_Y0 ? HURT_Y0 - y : y > HURT_Y1 ? y - HURT_Y1 : 0, R = r + HURT_R;
  return R * R > dy * dy ? Math.sqrt(R * R - dy * dy) : 0;
}

export const lerp3 = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k });
