// Generic, data-driven weapon state machine (combo chain, input buffer, hold detection,
// charge levels, hold-moves (block), roll-cancel windows, super armor, movement, timeline events).
// No THREE import: pure logic so it can be unit-tested. The player owns one WeaponState.

export const BUFFER = 0.25;       // input buffer (s) before a combo window opens
export const HOLD_THRESHOLD = 0.2; // default hold detection (s)
const MAX_CARRY = 0.3;             // max charge time banked from a hold started during the previous move

/**
 * hooks (all optional): onMoveStart(move, w), onMoveEnd(move, w), onChargeLevel(level, w),
 *   takeGlitch() -> bool (consumes the Glitch-Konter bonus), drain(amount), exhausted() -> bool
 *
 * Weapon def:
 *  { id, name, holdThreshold:{A:0.2,B:0.2}, idle:{A,holdA,B,holdB}, moves:{...}, anims:{...},
 *    overrideEvent?(w, type) -> moveId|undefined,   // e.g. Wucht-100 finisher on B
 *    on?: { [call]: (w, move, fireDef) => void },   // targets of move.fire timeline events
 *    onUpdate?(w, dt), buildMesh?(THREE...) }
 *
 * Move: see docs/ARCHITECTURE.md ("Moves"). kind: 'move' (default) | 'charge' | 'hold'.
 */
export class WeaponState {
  constructor(def, hooks = {}) {
    this.def = def;
    this.hooks = hooks;
    this.move = null;
    this.t = 0;
    this.lastMoveId = null;
    this.events = [];
    this.pend = { A: null, B: null };
    this.wucht = 0;
    this.sinceWuchtHit = 99;
    this.instance = 0;
    this.flags = { sauber: false, glitch: false };
    this.hitLog = new Map();
    this.fired = new Set();
    this.chargeT = 0;
    this.chargeLevel = 0;
    this.sauberOpen = false;
    this.data = {}; // weapon-specific scratch state (e.g. Rausch on/off, bow stage)
  }

  get busy() { return this.move !== null; }
  get moveId() { return this.move?.id ?? null; }
  get charging() { return this.move?.kind === 'charge'; }
  get blocking() { return this.move?.kind === 'hold' && !!this.move.block; }

  update(dt, inp) {
    this.feed(dt, inp);
    this.def.onUpdate?.(this, dt);
    if (this.move) this.#updateMove(dt, inp);
    if (!this.move) {
      const n = this.#next(this.def.idle);
      if (n) this.#start(n.id, n.ev);
    }
    this.sinceWuchtHit += dt;
    if (this.sinceWuchtHit > 4 && this.wucht > 0) this.wucht = Math.max(0, this.wucht - 5 * dt);
  }

  /** Feed input into the buffer without advancing moves (used while rolling / reacting). */
  feed(dt, inp) {
    for (const x of ['A', 'B']) {
      const btn = inp[x];
      if (!btn) continue;
      const th = this.def.holdThreshold?.[x] ?? 0;
      // [KT] def.earlyTap[x]: the tap event fires on PRESS (reaction-timed moves like the Konterhaltung); 'hold'+x still follows after the threshold
      const early = !!this.def.earlyTap?.[x];
      if (btn.pressed) {
        if (th > 0) this.pend[x] = { t: 0, fired: false, early };
        if (th <= 0 || early) this.events.push({ type: x, age: 0, btn: x });
      }
      const p = this.pend[x];
      if (p) {
        p.t += dt;
        if (!p.fired && p.t >= th) { p.fired = true; this.events.push({ type: 'hold' + x, age: 0, btn: x, heldT: p.t }); }
        else if (!p.fired && btn.released) { if (!p.early) this.events.push({ type: x, age: 0, btn: x }); this.pend[x] = null; }
        if (p.fired && !btn.down) this.pend[x] = null;
      }
    }
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      e.age += dt;
      const held = e.type.startsWith('hold') && inp[e.btn]?.down;
      if (e.age > BUFFER && !held) this.events.splice(i, 1);
    }
  }

  #next(table) {
    for (let i = 0; i < this.events.length; i++) {
      const ev = this.events[i];
      let id = this.def.overrideEvent?.(this, ev.type);
      if (!id && table) {
        id = table[ev.type];
        if (typeof id === 'function') id = id(this);
      }
      if (id) { this.events.splice(i, 1); return { id, ev }; }
    }
    return null;
  }

  #start(id, ev, opts = {}) {
    const m = this.def.moves[id];
    if (!m) throw new Error(`unknown move ${id}`);
    if (this.move) this.hooks.onMoveEnd?.(this.move, this);
    this.move = m;
    this.t = 0;
    this.instance++;
    this.hitLog = new Map();
    this.fired = new Set();
    this.flags = { sauber: !!opts.sauber, glitch: m.hits?.length ? !!this.hooks.takeGlitch?.() : false };
    if (m.consumeWucht) this.wucht = 0;
    if (m.kind === 'charge') {
      this.chargeT = Math.max(m.startT ?? 0, Math.min(ev?.heldT ?? 0, m.startT !== undefined ? 0 : MAX_CARRY));
      this.chargeLevel = this.#levelFor(m, this.chargeT);
      this.sauberOpen = false;
    }
    this.hooks.onMoveStart?.(m, this);
  }

  #end() {
    const m = this.move;
    this.move = null;
    this.lastMoveId = m.id;
    this.chargeLevel = 0;
    this.sauberOpen = false;
    this.hooks.onMoveEnd?.(m, this);
  }

  /** [KT] Force a move (counter -> Konterschnitt). */
  startMove(id) { this.#start(id, null); }

  /** Abort the current move (roll, hit reaction). */
  cancel() { if (this.move) this.#end(); this.events.length = 0; }

  #levelFor(m, t) {
    if (t > m.maxHold) return m.over ?? 2;
    let l = 0;
    for (const th of m.levels) if (t >= th) l++;
    return l;
  }

  #updateMove(dt, inp) {
    const m = this.move;
    if (m.kind === 'charge') return this.#updateCharge(dt, inp, m);
    if (m.kind === 'hold') return this.#updateHold(dt, inp, m);
    this.t += dt;
    if (m.fire) {
      for (const f of m.fire) {
        if (this.t >= f.t && !this.fired.has(f)) { this.fired.add(f); this.def.on?.[f.call]?.(this, m, f); }
      }
    }
    if (m.combo && this.t >= m.combo.window[0] && this.t <= m.combo.window[1]) {
      const n = this.#next(m.combo.next);
      if (n) return this.#start(n.id, n.ev);
    }
    if (this.t >= m.duration) this.#end();
  }

  #updateCharge(dt, inp, m) {
    this.t += dt;
    this.chargeT += dt * (m.rate ?? 1);
    const prev = this.chargeLevel;
    this.chargeLevel = this.#levelFor(m, this.chargeT);
    this.sauberOpen = !!m.sauber && this.chargeLevel === m.levels.length && this.chargeT >= m.sauber[0] && this.chargeT <= m.sauber[1];
    if (this.chargeLevel > prev && this.chargeT <= m.maxHold) this.hooks.onChargeLevel?.(this.chargeLevel, this);
    if (m.staminaPerSec) this.hooks.drain?.(m.staminaPerSec * dt);
    const forced = m.staminaPerSec && this.hooks.exhausted?.();
    if (!inp[m.button || 'A']?.down || forced) {
      const id = m.releases[this.chargeLevel];
      const sauber = this.sauberOpen;
      if (!id) return this.#end();
      this.#start(id, null, { sauber });
    }
  }

  #updateHold(dt, inp, m) {
    this.t += dt;
    if (m.next) {
      const n = this.#next(m.next);
      if (n) return this.#start(n.id, n.ev);
    }
    if (this.t >= (m.minTime ?? 0.1) && !inp[m.button || 'B']?.down) this.#end();
  }

  // ---- queries for the owner (player)
  /** Hit defs active this step: [{hit, idx, group, instance, sauber, glitch}] */
  activeHits() {
    const m = this.move;
    if (!m || !m.hits || m.kind === 'charge' || m.kind === 'hold') return [];
    const out = [];
    for (let i = 0; i < m.hits.length; i++) {
      const h = m.hits[i];
      if (this.t >= h.t0 && this.t <= h.t1) out.push({ hit: h, idx: i, group: h.group ?? i, instance: this.instance, sauber: this.flags.sauber, glitch: this.flags.glitch });
    }
    return out;
  }
  /** Multi-hit prevention: one hit per target per group per move instance (or per `interval` if hit.multi). */
  canHit(group, targetKey, hit) {
    const last = this.hitLog.get(group + '|' + targetKey);
    if (last === undefined) return true;
    return !!hit.multi && this.t - last >= (hit.interval ?? 0.1);
  }
  markHit(group, targetKey) { this.hitLog.set(group + '|' + targetKey, this.t); }

  addWucht(n) {
    this.wucht = Math.max(0, Math.min(100, this.wucht + n));
    this.sinceWuchtHit = 0;
  }

  moveSpeedMul() { return this.move ? (this.move.moveSpeed ?? 0) : 1; }
  turnMul() { return this.move ? (this.move.turnSpeed ?? 0.5) : 1; }
  canRollCancel() {
    const m = this.move;
    if (!m) return true;
    if (m.kind === 'charge') return !!m.rollable; // [W] bow: roll out of a draw
    if (m.kind === 'hold') return true;
    return m.rollCancelAt !== undefined && this.t >= m.rollCancelAt;
  }
  /** 'all' | 'flinch' | null */
  superArmor() {
    const sa = this.move?.superArmor;
    if (!sa) return null;
    if (Array.isArray(sa)) return this.t >= sa[0] && this.t <= sa[1] ? (sa[2] ?? 'flinch') : null;
    return sa === true ? 'flinch' : sa;
  }
  /** Forward lunge speed (m/s) right now. */
  lungeSpeed() {
    const l = this.move?.lunge;
    return l && this.t >= l.t0 && this.t <= l.t1 ? l.dist / (l.t1 - l.t0) : 0;
  }
  /** Visual height offset for jump moves. */
  airOffset() {
    const a = this.move?.arc;
    if (!a || this.t < a.t0 || this.t > a.t1) return 0;
    const k = (this.t - a.t0) / (a.t1 - a.t0);
    return a.h * 4 * k * (1 - k);
  }
  blockDef() { return this.blocking ? this.move.block : null; }
  /** Pose request for the renderer: {name, t, dur, level, sauber, move} */
  pose() {
    const m = this.move;
    if (!m) return null;
    return { name: m.anim, t: this.t, dur: m.duration ?? 1, level: this.def.poseLevel ? this.def.poseLevel(this) : this.chargeLevel, sauber: this.sauberOpen, charging: m.kind === 'charge', move: m };
  }
  reset() {
    this.move = null; this.t = 0; this.events.length = 0; this.pend.A = this.pend.B = null;
    this.chargeLevel = 0; this.sauberOpen = false;
  }
}
