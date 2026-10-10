// [L] Herd / group AI for the neutral animals (Mampfer herds, Hoppler groups). Host/solo only; guests replay snapshots.
// Pure game logic on top of the Monster class (movement via m._moveToward). All decisions use seeded rngs -> deterministic.
//
// Herd modes: graze (stay around a pasture/anchor, each animal on its own spot) -> migrate (walk to the next pasture) -> graze ...
//             flee (stampede away from a threat point, all together) -> graze.
// Member states (also the network state names): idle (head up), graze (head down), walk, flee, charge (via attack), dead.
import { clamp } from '../../core/math.js';

const TAU = Math.PI * 2;
const SEP_R = 2.4;

export const KINDS = {
  mampfer: { alarmR: 15, fleeT: [6.5, 9], reactMax: 0.35, calm: [10, 20], grazeT: [34, 70], spotT: [4, 10], spotR: 1, graze: 0.8, playerR: 0 },
  hoppler: { alarmR: 9, fleeT: [2.0, 3.2], reactMax: 0.22, calm: [1.5, 3], grazeT: [1e9, 1e9], spotT: [0.8, 3.5], spotR: 0.6, graze: 1.0, playerR: 6 },
};

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Herd {
  /**
   * ctx: Hunt-like { world, monsters, players, fx, bus }.  pastures: world.pastures subset (can be []).
   * home: { x, z, r } fallback anchor (Hoppler groups, herds without pastures)
   */
  constructor({ id, kind = 'mampfer', ctx, rng, pastures = [], pasture = null, home }) {
    this.id = id; this.kind = kind; this.cfg = KINDS[kind]; this.ctx = ctx; this.rng = rng; this.pastures = pastures;
    this.pasture = pasture;
    this.home = home ?? (pasture ? { x: pasture.x, z: pasture.z, r: pasture.r } : { x: 0, z: 0, r: 6 });
    this.anchor = { x: this.home.x, z: this.home.z, r: this.home.r ?? 6 };
    this.members = [];
    this.mode = 'graze';
    this.modeT = rng.range(this.cfg.grazeT[0] * 0.3, Math.min(this.cfg.grazeT[1], 60) * 0.6);
    this.center = { x: this.home.x, z: this.home.z };
    this.target = { x: this.home.x, z: this.home.z };
    this.threat = { x: 0, z: 0 };
    this.scanT = rng() * 0.2;
    this.bullUsed = false;
    this.moveT = 0; this.moveRef = { x: this.home.x, z: this.home.z };
    this.alarms = 0; // statistics
  }

  add(m, role = 'cow') {
    m.herd = this;
    m.fa = { role, spot: { x: m.pos.x, z: m.pos.z }, spotT: this.rng.range(0.5, 4), arrived: false, react: 0, slotA: this.rng() * TAU, slotR: 1.5 + this.rng() * 2.5, dustT: 0, stuck: 0 };
    this.members.push(m);
    return m;
  }

  get lead() { return this.members[0] ?? null; }
  get fleeing() { return this.mode === 'flee'; }

  // ------------------------------------------------------------------ herd level (once per sim step, by the first member)
  tick(dt) {
    const ms = this.members;
    for (let i = ms.length - 1; i >= 0; i--) if (!ms[i].alive) ms.splice(i, 1);
    if (!ms.length) return;
    let cx = 0, cz = 0;
    for (const m of ms) { cx += m.pos.x; cz += m.pos.z; }
    this.center.x = cx / ms.length; this.center.z = cz / ms.length;
    this.modeT -= dt;
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.2; this.#scan(); }
    switch (this.mode) {
      case 'graze':
        if (this.modeT <= 0) this.#startMigrate();
        break;
      case 'migrate': {
        const lead = ms[0];
        this.moveT += dt;
        if (dist2(lead.pos, this.target) < 5) this.#startGraze(this.pasture);
        else if (this.moveT >= 4) { // stuck check: the leader must have made progress in the last 4 s
          if (dist2(lead.pos, this.moveRef) < 1.2) this.#startGraze(this.pasture, 12);
          this.moveT = 0; this.moveRef.x = lead.pos.x; this.moveRef.z = lead.pos.z;
        }
        if (this.modeT <= 0) this.#startGraze(this.pasture, 10);
        break;
      }
      case 'flee':
        if (this.modeT <= 0) {
          this.anchor.x = this.center.x; this.anchor.z = this.center.z; this.anchor.r = 5;
          this.pasture = this.pasture && dist2(this.center, this.pasture) < 20 ? this.pasture : null;
          this.mode = 'graze';
          this.modeT = this.rng.range(this.cfg.calm[0], this.cfg.calm[1]);
          for (const m of ms) m.fa.spotT = 0;
        }
        break;
      default: break;
    }
  }

  #scan() {
    const ctx = this.ctx, c = this.center, cfg = this.cfg;
    for (const o of ctx.monsters) {
      if (!o.alive || o.def.neutral || o.state === 'sleep') continue;
      for (const m of this.members) {
        if (Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < cfg.alarmR + (o.bodyRadius ?? 0)) { this.alarm(o.pos.x, o.pos.z); return; }
      }
    }
    if (cfg.playerR > 0) {
      for (const p of ctx.players) {
        if (!p.alive) continue;
        for (const m of this.members) {
          if (Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z) < cfg.playerR) { this.alarm(p.pos.x, p.pos.z); return; }
        }
      }
    }
    void c;
  }

  /** Scare the whole herd away from (x, z). */
  alarm(x, z) {
    const cfg = this.cfg;
    this.threat.x = x; this.threat.z = z;
    if (this.mode === 'flee') { this.modeT = Math.max(this.modeT, cfg.fleeT[0] * 0.5); return; }
    this.mode = 'flee';
    this.alarms++;
    this.modeT = this.rng.range(cfg.fleeT[0], cfg.fleeT[1]);
    for (const m of this.members) { m.fa.react = this.rng() * cfg.reactMax; m.fa.arrived = false; }
  }

  /** A member got hurt. `attacker`: Player (or null). A hit calf makes the bull charge the attacker once. */
  hurt(victim, from, attacker = null) {
    this.alarm(from.x, from.z);
    if (attacker && victim.fa?.role === 'calf') this.#bullCharge(attacker);
  }

  #bullCharge(target) {
    if (this.bullUsed) return;
    const bull = this.members.find((m) => m.fa.role === 'bull' && m.alive && !m.attack && m.authority);
    if (!bull) return;
    this.bullUsed = true;
    bull.target = target;
    bull.fa.react = 0;
    bull.fa.charged = true;
    bull.beginAttack('mampfer_stoss');
  }

  #startGraze(pasture, t) {
    this.mode = 'graze';
    this.pasture = pasture;
    const a = pasture ?? this.home;
    this.anchor.x = pasture ? pasture.x : this.center.x; this.anchor.z = pasture ? pasture.z : this.center.z; this.anchor.r = pasture?.r ?? 5;
    if (!pasture && this.kind === 'hoppler') { this.anchor.x = this.center.x; this.anchor.z = this.center.z; }
    void a;
    this.modeT = t ?? this.rng.range(this.cfg.grazeT[0], this.cfg.grazeT[1]);
    for (const m of this.members) { m.fa.spotT = this.rng() * 3; m.fa.arrived = false; }
  }

  #startMigrate() {
    const cur = this.pasture, c = this.center;
    let target = null;
    if (this.kind === 'hoppler' || !this.pastures.length) {
      // wander back towards home / a new nearby spot
      const far = dist2(c, this.home) > 14;
      const a = this.rng() * TAU, r = far ? 0 : 6 + this.rng() * 8;
      target = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
    } else {
      const cand = this.pastures.filter((p) => p !== cur && (!cur || cur.links.includes(p.id)) && dist2(c, p) > 14);
      const pool = cand.length ? cand : this.pastures.filter((p) => p !== cur && dist2(c, p) > 14 && dist2(c, p) < 80);
      if (pool.length) {
        // prefer spots away from the last threat while it is fresh
        const p = pool[Math.floor(this.rng() * pool.length)];
        this.pasture = p;
        target = { x: p.x, z: p.z };
      }
    }
    if (!target) { this.modeT = this.rng.range(15, 30); return; }
    this.target.x = target.x; this.target.z = target.z;
    this.mode = 'migrate';
    this.modeT = 120;
    this.moveT = 0; this.moveRef.x = this.lead.pos.x; this.moveRef.z = this.lead.pos.z;
  }

  // ------------------------------------------------------------------ member level
  stepMember(m, dt) {
    const fa = m.fa;
    switch (this.mode) {
      case 'flee': this.#flee(m, dt, fa); break;
      case 'migrate': this.#migrate(m, dt, fa); break;
      default: this.#graze(m, dt, fa); break;
    }
  }

  #setState(m, s) { if (m.state !== s) m.setState(s); }

  /** Push away from the herd mates that are too close (adds to the (dx, dz) steering vector). Returns the strength added. */
  #separate(m, out) {
    out.x = 0; out.z = 0;
    for (const o of this.members) {
      if (o === m) continue;
      const dx = m.pos.x - o.pos.x, dz = m.pos.z - o.pos.z, d2 = dx * dx + dz * dz, r = SEP_R + (o.bodyRadius + m.bodyRadius) * 0.5;
      if (d2 < r * r && d2 > 1e-6) { const d = Math.sqrt(d2), k = (r - d) / r; out.x += (dx / d) * k; out.z += (dz / d) * k; }
    }
    return out;
  }

  #graze(m, dt, fa) {
    const cfg = this.cfg, def = m.def;
    if (fa.spotT <= 0 && (fa.arrived || fa.spotT < -6)) { // pick a new grazing spot around the anchor
      const a = this.rng() * TAU, r = Math.sqrt(this.rng()) * this.anchor.r;
      fa.spot.x = this.anchor.x + Math.cos(a) * r; fa.spot.z = this.anchor.z + Math.sin(a) * r;
      fa.spotT = this.rng.range(cfg.spotT[0], cfg.spotT[1]);
      fa.arrived = false;
      fa.head = this.rng() < cfg.graze ? 'graze' : 'idle';
    } else if (fa.spotT <= 0) fa.spotT = 0.01;
    const dx = fa.spot.x - m.pos.x, dz = fa.spot.z - m.pos.z, d = Math.hypot(dx, dz);
    if (!fa.arrived && d > 0.9) {
      const sep = this.#separate(m, SEP);
      this.#setState(m, 'walk');
      m._moveToward(dt, dx / d + sep.x * 1.5, dz / d + sep.z * 1.5, def.walk * 0.85, 1.6 * (def.turn ?? 1));
      fa.spotT -= dt * 0.15 * 0; // travelling time does not count
      if (fa.spotT < -8) { fa.arrived = true; } // could not reach it (blocked)
      else if (fa.spotT > 0) fa.spotT -= 0;
      fa.walkT = (fa.walkT ?? 0) + dt;
      if (fa.walkT > 14) { fa.arrived = true; fa.walkT = 0; }
    } else {
      fa.arrived = true; fa.walkT = 0;
      m._brake(dt);
      this.#setState(m, fa.head === 'idle' ? 'idle' : 'graze');
      fa.spotT -= dt;
      if (fa.spotT <= 0) fa.spotT = -0.001; // re-pick next step
    }
  }

  #migrate(m, dt, fa) {
    const def = m.def, lead = this.lead, t = this.target;
    let gx = t.x, gz = t.z, sp = def.walk;
    if (m !== lead) {
      gx += Math.cos(fa.slotA) * fa.slotR; gz += Math.sin(fa.slotA) * fa.slotR;
      const dl = dist2(m.pos, lead.pos);
      const mine = Math.hypot(gx - m.pos.x, gz - m.pos.z), theirs = dist2(lead.pos, t);
      if (dl > 5) sp *= 1 + clamp((dl - 5) * 0.12, 0, 0.7);
      else if (mine < theirs - 3) sp *= 0.45;
    }
    const dx = gx - m.pos.x, dz = gz - m.pos.z, d = Math.hypot(dx, dz);
    if (d < 1) { m._brake(dt); this.#setState(m, 'idle'); return; }
    const sep = this.#separate(m, SEP);
    this.#setState(m, 'walk');
    m._moveToward(dt, dx / d + sep.x * 1.2, dz / d + sep.z * 1.2, sp * 0.95, 1.8 * (def.turn ?? 1));
  }

  #flee(m, dt, fa) {
    const def = m.def, th = this.threat, c = this.center;
    if (fa.react > 0) { // startled: freeze for a moment, head up
      fa.react -= dt;
      m._brake(dt);
      this.#setState(m, 'idle');
      m.rot += angleToward(m.rot, Math.atan2(th.x - m.pos.x, th.z - m.pos.z), 4 * dt);
      return;
    }
    let ax = m.pos.x - th.x, az = m.pos.z - th.z, al = Math.hypot(ax, az);
    if (al < 1e-3) { ax = Math.sin(m.rot); az = Math.cos(m.rot); al = 1; }
    ax /= al; az /= al;
    // stay together: pull towards the herd centre when straggling, push apart when crowded
    const cx = c.x - m.pos.x, cz = c.z - m.pos.z, cd = Math.hypot(cx, cz);
    const pull = cd > 5 ? clamp((cd - 5) * 0.18, 0, 0.9) : 0;
    const sep = this.#separate(m, SEP);
    let gx = ax * 1.0 + (cd > 1e-3 ? (cx / cd) * pull : 0) + sep.x * 0.9;
    let gz = az * 1.0 + (cd > 1e-3 ? (cz / cd) * pull : 0) + sep.z * 0.9;
    this.#setState(m, 'flee');
    const sp = def.run * (m.fa.role === 'calf' ? 0.93 : 1);
    m._moveToward(dt, gx, gz, sp, 5 * (def.turn ?? 1));
    fa.dustT -= dt;
    if (fa.dustT <= 0) {
      fa.dustT = 0.08 + Math.random() * 0.06;
      this.ctx.fx?.spark({ x: m.pos.x - Math.sin(m.rot) * 0.8, y: m.pos.y + 0.15, z: m.pos.z - Math.cos(m.rot) * 0.8 }, 1, '#b8a47c', 2.2);
    }
  }
}

const SEP = { x: 0, z: 0 };
const angleToward = (a, b, maxStep) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return clamp(d, -maxStep, maxStep);
};

/** def.ai hook (Monster._ai): one herd tick per step (by the first living member), then this member's behaviour. */
export function faunaAi(m, dt) {
  const h = m.herd;
  if (!h) return;
  if (m.attack) { m._runAttack(dt); return; }
  if (h.members[0] === m) h.tick(dt);
  else if (!h.members.length) return;
  h.stepMember(m, dt);
}
