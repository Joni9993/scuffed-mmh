import * as THREE from 'three';
import { clamp, stepAngle, yawOf, angleDiff } from '../../core/math.js';
import { createRng } from '../../core/rng.js';
import { compileTrack, sampleTrack } from '../anim.js';
import { AttackInstance } from './attack.js';
import { overlap } from '../hitbox.js';
import { radialTexture } from '../../render/textures.js';
import { ProjectileSet } from './mprojectiles.js';
import { getNav } from './nav.js';
import { predationTick, eatTick, endEating } from './predation.js'; // [L]
import { StatusFx } from './statusfx.js';

// wing/spread/jaw: only used by models that have them (Brathalos); harmless for the others
export const MREST = { bodyY: 0, bodyPitch: 0, bodyRoll: 0, neck: 0, head: 0, headYaw: 0, tailYaw: 0, tailPitch: 0, legL: 0, legR: 0, wing: 0, spread: 0, jaw: 0,
  // Optional elder-rig channels. Defaults keep old rigs and network pose interpolation unchanged.
  bodyYaw: 0, wingL: 0, wingR: 0, elbowL: 0, elbowR: 0, wristL: 0, wristR: 0,
  tailCurl: 0, neckYaw: 0, headReach: 0, foreL: 0, foreR: 0, hindL: 0, hindR: 0, boiler: 0 };
export const mTrack = (frames) => compileTrack(frames, MREST);

const RAGE_DURATION = 45, RAGE_HP = 0.6, RAGE_BURST_PCT = 0.075 /* of max HP within the window; was a flat 300 when Jaggo had 1800 HP */, RAGE_BURST_WINDOW = 20, RAGE_COOLDOWN = 20;
const FLEE_HP = 0.3, STAGGER = 2.0, STUN_TIME = 6.0, STUN_BASE = 150, THREAT_WINDOW = 10;
const POISON_THRESHOLD = 100, POISON_TIME = 15, POISON_PCT = 0.03, TRAP_TIME = 6, TRAP_COOLDOWN = 60, BLIND_TIME = 4, STINK_TIME = 4.5;
export const LIMP_HP = 0.3;
export const RUST_THRESHOLD = 100, RUST_TIME = 15, RUST_FACTOR = 0.15, RUST_PART_MUL = 1.5, SCALD_TIME = 10, SCALD_FACTOR = 0.1;
const GL_CYAN = [0.0, 0.7, 0.85], GL_MAGENTA = [0.9, 0.0, 0.7];
// Status-Farbsprache: Rotglut rot, betaeubt gelb flackernd, Falle blau, geblendet weisser Strobo, erschoepft fahl im Atemtakt,
// Gift lila, Rost orange-braun, verbrueht pink, Gestank gruen
const TINT_SLOT = 0.7;
const TINT = {
  rage: { rgb: [0.34, 0.02, 0], pulse: (t) => 0.75 + 0.25 * Math.sin(t * 9) },
  stun: { rgb: [0.34, 0.28, 0.02], pulse: (t) => (Math.floor(t * 6) % 2 ? 1 : 0.45) },
  trap: { rgb: [0.06, 0.12, 0.34], pulse: (t) => 0.7 + 0.3 * Math.sin(t * 14) },
  blind: { rgb: [0.4, 0.4, 0.4], pulse: (t) => (Math.floor(t * 12) % 3 ? 0.25 : 1) },
  tired: { rgb: [0.14, 0.15, 0.18], pulse: (t, m) => 0.5 + 0.5 * (m._breath ?? 0) },
  poison: { rgb: [0.2, 0, 0.28], pulse: (t) => 0.7 + 0.3 * Math.sin(t * 4) },
  rust: { rgb: [0.3, 0.11, 0], pulse: () => 1 },
  scald: { rgb: [0.34, 0.08, 0.18], pulse: (t) => 0.75 + 0.25 * Math.sin(t * 20) },
  stink: { rgb: [0.1, 0.24, 0], pulse: (t) => 0.7 + 0.3 * Math.sin(t * 6) },
};
const GL_CYCLE = 3.6, GL_PULSE = 0.45; // Glitch-Stellen: Puls-Takt / -Dauer (s)
const GHOST_MAT = new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.35, depthWrite: false, wireframe: true });
const MINOR_CULL_R2 = 65 * 65; // [B] perf: small monsters farther than this from every local hunter are neither posed nor drawn (nor hittable)
const NO_PARTS = Object.freeze([]);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/** Nest / route lookups with fallbacks (world agent provides nestFor / routeFor; the test arena only has nestPoint). */
export const nestOf = (m) => m.ctx.world.nestFor?.(m.def.id) ?? m.ctx.world.nestPoint ?? m.home;
export const routeOf = (m) => m.ctx.world.routeFor?.(m.def.id) ?? null;

/**
 * Brocken base class. AI states: wander -> notice(roar) -> combat -> (rage = Rotglut flag) -> flee (30 % HP)
 * -> sleep (nest) -> combat. Extra: stagger (Teilbruch), stunned, dead; fly / fall (defs with `fly`, i.e. Brathalos).
 *
 * def: see docs/ARCHITECTURE.md "Monster definition". Attacks run as AttackInstance (deterministic, networkable).
 * Optional def hooks (all take the monster first): init, tick(m, dt), combat(m, dt) -> true if handled, poseHook(m, target),
 *   onDamage(m, res, ev), onAttackEnd(m, attackId), onStatus(m, type), onElement(m, type, opts) -> bool, snapExtra(m).
 *   Smaragdkueste-Hooks: wander(m, dt) -> bool (Mampfaffe frisst im Wandern; Angriffe mit `wanderAttack` laufen dort), onHitPlayer(m, player, h, res)
 *   (nach einem Treffer, nur lokaler Pirscher), hitDmgMul(m, hit), dmgFactor(m), partHpMul(m, part), glow(m) -> [r,g,b] | null (Dauerleuchten).
 *   Hit-Felder (Krachfaust): occlude (Saeule dazwischen = kein Treffer), dmgPct (Anteil der Max-LP statt dmg), noPerfect (kein Glitch-Konter).
 * Status API (docs/PHASE2_CONTRACTS.md): applyStatus(type, opts) -> bool.
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
    this.air = 0;             // height above ground (flying / jumping)
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
    this.queued = null;       // attack id to start next (chains, Rotglut roar)
    this.target = null;
    this.threat = new Map();  // playerId -> [{t, dmg}]
    this.retargetT = 0;
    this.rage = false; this.rageT = 0; this.rageCd = 0; this.rageUsed = false;
    this.burst = [];          // [{t, dmg}]
    this.stagT = 0; this.stunT = 0; this.stun = 0; this.stunThreshold = STUN_BASE;
    this.hitFlash = 0;
    this.discovered = false;
    this.gait = 0;
    this.wanderT = 0; this.wanderTo = null; this.routeIdx = 0;
    this.fleeing = false;
    this.kb = null;           // knockback { x, z, t }
    this.st = { blind: 0, trap: 0, trapCd: 0, poisonBuild: 0, poisonT: 0, poisonAcc: 0, stink: 0, stinkFrom: null, rustBuild: 0, rustT: 0, scaldT: 0 }; // Phase 3: rost (Aufbau 100 -> 15 s), scald (Verbruht 10 s)
    this._fb = 0; // aktueller Teile-Faktor-Bonus (Rost +0,15 / Verbruht +0,1)
    this.flyT = 0; this.fallV = 0; this.flyAng = 0; this.flyDir = 1; this.flyDamage = 0; this.helpless = 4;
    this.pose = { ...MREST };
    this._tgt = { ...MREST };
    this._stamp = 0; this._hpStamp = -1; this._lpStamp = -1;
    this.marker = null;
    // ---- Brocken 2.0 (alle Felder optional per def; ohne def-Daten inaktiv)
    this._b2 = !this.minor && (def.brocken2 ?? !!(def.chains || def.phases || def.teachAttack || def.stamina || def.flinchDmg !== undefined));
    this._stamOn = !this.minor && !!(def.stamina || Object.values(def.attacks ?? {}).some((a) => a.stam !== undefined));
    this._flOn = !this.minor && def.flinchDmg !== undefined;
    this.stamina = 100; this.tiredT = 0; this.tired = false;
    this.phase = 0; this.phaseT = 0; this.phaseSpecial = null;
    this.chain = null; this.chainNext = null;
    this._flLog = []; this._flLast = -99;
    this._combatT = 0; this._atkCount = 0; this._rtT = 0;
    this._rollLog = new Map(); this._rollPrev = new Map();
    this._offs = [];
    if (def.chains && !this.minor) this._offs.push(ctx.bus.on('glitchCounter', (e) => { if (e?.monster && e.monster !== this) return; this._chainBreak(); }));

    // def.onGlitchCounter(m, attackId, player): ein Pirscher hat genau diesen Angriff perfekt gekontert (nur Autoritaet; Gaeste melden per Netz-Event 'gcm')
    if (def.onGlitchCounter && !this.minor) this._offs.push(ctx.bus.on('glitchCounter', (e) => { const aid = e?.player?.lastHit?.attackId; if (this.authority && aid && this.attack?.id === aid) def.onGlitchCounter(this, aid, e.player); }));

    const built = def.build();
    this.mesh = built.root;
    this.rigApply = built.apply;
    this.nodes = built.nodes;
    this.partMeshes = built.partMeshes;
    this.extra = built.extra || {};
    this.parts = def.parts.map((p) => ({
      ...p, elem: { ...(p.elem ?? {}) }, baseElem: { ...(p.elem ?? {}) }, hp: p.breakHp ?? Infinity, broken: false, gone: false, baseFactor: p.factor,
      sph: p.spheres.map((sp) => ({ node: this.nodes[sp.node], offset: sp.offset ?? [0, 0, 0], r: sp.r })),
      mats: (this.partMeshes[p.id] ?? []).map((m) => m.material),
    }));
    this.partById = Object.fromEntries(this.parts.map((p) => [p.id, p]));
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,.6)'), transparent: true, depthWrite: false, fog: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.setScalar(def.bodyRadius * 3.2);
    this.shadow.renderOrder = 1;
    this.projectiles = new ProjectileSet(ctx, this);
    def.init?.(this);
    this.sync();
  }

  get alive() { return this.state !== 'dead'; }
  get sleeping() { return this.state === 'sleep'; }
  get invulnerable() { return !!this.burrowed || !!this.def.invulnerable?.(this); } // def-gesetzt (Gorgo eingegraben): keine Hurtboxen/Lock-Punkte, nur Umgebungsschaden greift
  /** Mutator-Hooks (GDD 16.5, data/mutators.js): generisch fuer alle Brocken, nie fuer Kleinvieh. */
  get mm() { return this.minor ? null : this.ctx.mods?.monster ?? null; }
  get speedMul() { return (this.rage ? 1.2 : 1) * (this.limping ? 0.8 : 1) * (this.tired ? 0.5 : 1) * (this.mm?.speedMul ?? 1) * (this.def.speedFactor?.(this) ?? 1); }
  get dmgMul() { return (this.rage ? 1.15 : 1) * (this.mm?.dmgMul ?? 1) * (this.def.dmgFactor?.(this) ?? 1); } // def.dmgFactor: z. B. Mampfaffe hungrig +10 %
  get limping() { return this.hp <= this.maxHp * LIMP_HP && this.alive && !this.minor; }
  get eating() { return this.state === 'fressen'; } // [L] predator busy with its prey: sneak-hit window
  get flying() { return this.state === 'fly' || this.state === 'fall'; }
  get blind() { return this.st.blind > 0; }
  get trapped() { return this.st.trap > 0; }
  get poisoned() { return this.st.poisonT > 0; }
  get helplessNow() { return this.stunT > 0 || this.trapped || this.sleeping; }

  setState(s) {
    if (this.state === s) return;
    const prev = this.state;
    this.state = s;
    this.stateT = 0;
    if (this.attack?.inst.def.wanderAttack && s !== 'wander') this._interrupt(); // Angriff, der nur im Wandern laeuft (Mampfaffe frisst): Zustandswechsel bricht ab
    if (s === 'notice' || s === 'enrage') this.ctx.bus.emit('sfx', { name: this.def.id === 'pyrostur' ? 'pyroRoar' : 'roar', pos: this.pos });
    this.ctx.bus.emit('monsterState', { monster: this, state: s, prev });
  }

  // ---------- hurtboxes
  /** [{part, sphere:{type,x,y,z,r}, pos:Vector3}] in world space (uses current pose). */
  // [B] perf: the lists (and their entries) are pooled and cached until the monster's next pose update (`_stamp`).
  // Callers must not keep entries across sim steps (all current callers use them immediately).
  hurtParts() {
    if (this.culled || this.invulnerable) return NO_PARTS;
    if (this._hpList && this._hpStamp === this._stamp) return this._hpList;
    const out = (this._hpList ??= []);
    const sc = this.def.scale;
    let n = 0;
    for (const part of this.parts) {
      if (part.gone || this.def.partActive?.(this, part) === false) continue;
      for (const sp of part.sph) {
        let e = out[n];
        if (!e) e = out[n] = { part, pos: new THREE.Vector3(), sphere: { type: 'sphere', x: 0, y: 0, z: 0, r: 0 }, key: '' };
        if (e.part !== part) { e.part = part; e.key = this.id + '|' + part.id; }
        _v.set(sp.offset[0], sp.offset[1], sp.offset[2]);
        sp.node.localToWorld(_v);
        e.pos.copy(_v);
        e.sphere.x = _v.x; e.sphere.y = _v.y; e.sphere.z = _v.z; e.sphere.r = sp.r * sc;
        n++;
      }
    }
    out.length = n;
    this._hpStamp = this._stamp;
    return out;
  }
  lockPoints() {
    if (this.culled || this.invulnerable) return NO_PARTS;
    if (this._lpList && this._lpStamp === this._stamp) return this._lpList;
    const pts = (this._lpList ??= []);
    let n = 0;
    for (const part of this.parts) {
      if (part.lock === false || part.gone || this.def.partActive?.(this, part) === false) continue;
      const sp = part.sph[0];
      let e = pts[n];
      if (!e) e = pts[n] = { partId: part.id, pos: new THREE.Vector3() };
      e.partId = part.id;
      e.pos.set(sp.offset[0], sp.offset[1], sp.offset[2]);
      sp.node.localToWorld(e.pos);
      n++;
    }
    pts.length = n;
    this._lpStamp = this._stamp;
    return pts;
  }

  // ---------- status API (docs/PHASE2_CONTRACTS.md)
  /**
   * type: 'blind' (4 s, brings flyers down) | 'trap' (6 s, 1x / 60 s) | 'poison' ({buildup}) | 'stun' ({buildup}) |
   *       'stink' ({pos}: target switch / flee) | 'fire' | 'shock' ({dmg}: element hits, e.g. break armour). Returns true if it took effect.
   */
  applyStatus(type, opts = {}) {
    if (!this.alive) return false;
    const st = this.st;
    switch (type) {
      case 'blind': {
        st.blind = opts.t ?? BLIND_TIME;
        this._interrupt();
        this.queued = null;
        if (this.state === 'fly') this._startFall(4);
        this.ctx.fx.number({ x: this.pos.x, y: this.pos.y + this.def.scale * 2.4 + this.air, z: this.pos.z }, 'Blind!', 'weak');
        this.def.onStatus?.(this, 'blind');
        return true;
      }
      case 'trap': {
        if (st.trapCd > 0 || this.flying || this.air > 0.5) return false;
        st.trap = opts.t ?? TRAP_TIME;
        st.trapCd = TRAP_COOLDOWN;
        this._interrupt();
        this.queued = null;
        this.vel.set(0, 0, 0);
        this.ctx.fx.number({ x: this.pos.x, y: this.pos.y + this.def.scale * 2.4, z: this.pos.z }, 'Klebt!', 'weak');
        this.def.onStatus?.(this, 'trap');
        return true;
      }
      case 'poison': {
        const add = opts.buildup ?? 20;
        if (st.poisonT > 0) { st.poisonT = POISON_TIME; return true; }
        st.poisonBuild += add;
        if (st.poisonBuild >= POISON_THRESHOLD) {
          st.poisonBuild = 0;
          st.poisonT = POISON_TIME;
          this.ctx.fx.number({ x: this.pos.x, y: this.pos.y + this.def.scale * 2.4 + this.air, z: this.pos.z }, 'Gift!', 'weak');
          this.def.onStatus?.(this, 'poison');
        }
        return true;
      }
      case 'rost': { // GDD 15.3: Aufbau 100 -> 15 s Verrostet (Teile-Faktoren +0,15, Teil-HP-Schaden x1,5)
        if (st.rustT > 0) { st.rustT = RUST_TIME; return true; }
        st.rustBuild += opts.amount ?? opts.buildup ?? 20;
        if (st.rustBuild >= RUST_THRESHOLD) {
          st.rustBuild = 0; st.rustT = RUST_TIME;
          this.ctx.fx.number({ x: this.pos.x, y: this.pos.y + this.def.scale * 2.4 + this.air, z: this.pos.z }, 'Verrostet!', 'weak');
          this.def.onStatus?.(this, 'rost');
        }
        return true;
      }
      case 'scald': { // Dampfventil: Verbruht, Teile-Faktor +0,1 fuer 10 s
        const fresh = st.scaldT <= 0;
        st.scaldT = opts.t ?? SCALD_TIME;
        if (fresh) this.ctx.fx.number({ x: this.pos.x, y: this.pos.y + this.def.scale * 2.4 + this.air, z: this.pos.z }, 'Verbrüht!', 'weak');
        return true;
      }
      case 'stun': { const b = opts.buildup ?? 0; if (b <= 0) return false; this._addStun(b); return true; }
      case 'stink': {
        st.stink = opts.t ?? STINK_TIME;
        st.stinkFrom = opts.pos ? { x: opts.pos.x, z: opts.pos.z } : null;
        this._interrupt();
        this.queued = null;
        // another player available -> switch target, otherwise run from the smell
        const others = this.ctx.players.filter((p) => p.alive && p !== this.target);
        if (others.length) { this.target = others[Math.floor(this.rng() * others.length)]; this.retargetT = 8; st.stink = Math.min(st.stink, 1.2); }
        if (this.state === 'sleep') this.setState('combat');
        this.def.onStatus?.(this, 'stink');
        return true;
      }
      case 'fire':
      case 'shock':
        return !!this.def.onElement?.(this, type, opts);
      default: return false;
    }
  }

  _addStun(n) {
    if (n <= 0 || this.stunT > 0) return false;
    this.stun += n;
    if (this.stun >= this.stunThreshold) {
      this.stun = 0;
      this.stunThreshold *= 1.5;
      this.stunT = STUN_TIME;
      this._interrupt();
      this.queued = null;
      if (this.state === 'fly') this._startFall(STUN_TIME);
      this.ctx.bus.emit('monsterStun', { monster: this });
      return true;
    }
    return false;
  }

  // ---------- damage intake
  applyDamage(res) {
    if (!this.alive || this.def.invulnerable?.(this)) return null;
    const part = this.partById[res.partId];
    if (part && this.def.partActive?.(this, part) === false) return null;
    const total = res.dmg; // res.dmg already INCLUDES elemDmg (combat.resolvePlayerHit); elemDmg is informational only
    const wasSleeping = this.sleeping;
    this.hp = Math.max(0, this.hp - total);
    this.hitFlash = 0.12;
    this._sinceHit = 0;
    const pid = res.attackerId ?? 'p1';
    if (!res.revier && !res.env && !this.minor) this.ctx.revier?.noteDamage(this, total); // Revierstreit: Pirscher-Druck
    if (!res.env) this._addThreat(pid, total); // Umgebungsschaden zaehlt nicht als Bedrohung
    const ev = { monster: this, part, dmg: total, res, broke: false, stunned: false, killed: false };
    if (part) {
      if (part.breakHp && !part.broken) {
        part.hp -= total * (this.st.rustT > 0 ? RUST_PART_MUL : 1) * (res.partDmgMul ?? 1) * (this.def.partHpMul?.(this, part) ?? 1); // partDmgMul: Kroll-Ast-Waffen; def.partHpMul: Mampfaffe harter Schaedel
        const jit = clamp(1 - part.hp / part.breakHp, 0, 1) * (part.jitter ?? 0.05);
        for (const m of part.mats) m.userData.ps1.uJit.value = jit;
        if (part.hp <= 0) { this._breakPart(part); ev.broke = true; }
      }
      if (res.blunt > 0 && part.stunPart && this._addStun(res.blunt)) ev.stunned = true;
    }
    if (this.state === 'fly') this.flyDamage += total; // only reachable by arrows (bow) while high up
    this.def.onDamage?.(this, res, ev);
    // rage triggers
    this.burst.push({ t: this.time, dmg: total });
    if (!this.minor && this.authority && !this.def.noRage) { // noRage: Trainingspuppe
      if (!this.rageUsed && this.hp <= this.maxHp * RAGE_HP) { this.rageUsed = true; this._enrage(); }
      else if (this.rageCd <= 0 && !this.rage && this._burstDamage() >= this.maxHp * RAGE_BURST_PCT) this._enrage();
    }
    if (this.hp <= 0) { this._die(); ev.killed = !this.alive; return ev; }
    if (this._flOn && this.authority) this._flinchCheck(total);
    if (this.minor) this._flinch(pid, total);
    if (this.state === 'fly' && !this.attack && this.flyDamage >= (this.def.fly?.dropDamage ?? 250)) this._startFall(4);
    if (wasSleeping) { this._interrupt(); this.setState('combat'); this.recover = 1.2; }
    else if (this.state === 'fressen') endEating(this, true); // [L]
    else if (this.state === 'wander') { this.setState('notice'); this.discovered = true; }
    return ev;
  }
  _burstDamage() {
    this.burst = this.burst.filter((b) => this.time - b.t <= RAGE_BURST_WINDOW);
    return this.burst.reduce((s, b) => s + b.dmg, 0);
  }
  _addThreat(pid, dmg) {
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
  /** Small monsters get knocked back and flinch when hit. */
  _flinch(attackerId, dmg) {
    const p = this.ctx.players.find((q) => q.id === attackerId) ?? this.ctx.players[0];
    if (!p) return;
    const dx = this.pos.x - p.pos.x, dz = this.pos.z - p.pos.z, l = Math.hypot(dx, dz) || 1;
    const dist = clamp(1.2 + dmg / 25, 1.4, 3.5);
    this.kb = { x: (dx / l) * dist / 0.25, z: (dz / l) * dist / 0.25, t: 0.25 };
    this.stagT = Math.max(this.stagT, 0.4);
    this.recover = Math.max(this.recover, 0.4);
    this._interrupt();
  }
  _breakPart(part) {
    part.broken = true;
    part.factor = Math.max(0, part.baseFactor - 0.1) + this._fb;
    for (const m of part.mats) m.userData.ps1.uJit.value = 0.01;
    if (this.state !== 'fly') this.stagT = STAGGER;
    this.hitFlash = 0.3;
    if (this.authority && this.state !== 'fly' && !this.attack) { // [B] part break: visible recoil away from the hunter
      const { p } = this._nearestPlayer();
      if (p) { const dx = this.pos.x - p.pos.x, dz = this.pos.z - p.pos.z, l = Math.hypot(dx, dz) || 1; this.kb = { x: (dx / l) * 1.1 / 0.3, z: (dz / l) * 1.1 / 0.3, t: 0.3 }; }
    }
    this._interrupt();
    this.def.onBreak?.(this, part);
    this._hpStamp = this._lpStamp = -1; // parts may be gone now (severed tail)
    const p = part.sph[0].node.getWorldPosition(new THREE.Vector3());
    this.ctx.fx.spark(p, 24, '#ffffff', 6);
    this.ctx.fx.shake(0.35, 0.3);
    this.ctx.bus.emit('partBreak', { monster: this, part: part.id });
    this.ctx.bus.emit('sfx', { name: 'break', pos: p });
  }
  _enrage() {
    this.rage = true; this.rageT = RAGE_DURATION;
    this._rageAtkDone = false;
    this.queued = null;
    if (this.flying) {
      // airborne: keep flying, roar as soon as he is back on the ground
      if (this.def.rageAttack) this.queued = this.def.rageAttack;
    } else {
      this._interrupt();
      this.setState('enrage');
    }
    this.ctx.bus.emit('rage', { monster: this, on: true });
    this.def.onRage?.(this, true);
  }
  _die() {
    if (!this.alive || this.def.beforeDeath?.(this) === false) return;
    this.def.onDeath?.(this);
    for (const off of this._offs) off?.();
    this._offs.length = 0;
    this.chain = this.chainNext = null; this.tired = false;
    this._interrupt();
    this.queued = null;
    this.setState('dead');
    this.projectiles.clear();
    this.ctx.fx.clearMarker?.(this.id);
    this.ctx.bus.emit('monsterDead', { monster: this });
    this.ctx.bus.emit('sfx', { name: 'roar', pos: this.pos, low: true });
  }
  _interrupt() {
    this.chain = null; this.chainNext = null;
    if (this.attack) { this.attack = null; this.ctx.fx.clearMarker?.(this.id); this.recover = 0.4; }
  }
  _startFlee() {
    this.fleeing = true;
    this.fleeUsed = true;
    this.fleeT = 0; this.nv = null;
    this._interrupt();
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
    this.ctx.bus.emit('attackStart', { monster: this, attackId: params.attackId, inst, chainIdx: params.chainIdx ?? 0, teach: !!params.teach, cue: def.cue });
    if (params.teach) this.ctx.bus.emit('teach', { monster: this, attackId: params.attackId });
    return inst;
  }

  /** Authority: start attack `attackId` aimed at the current target from the current position. */
  beginAttack(attackId, extra = {}) {
    const tgt = this.target;
    const ad = this.def.attacks[attackId];
    if (this.authority && ad) {
      // Lehrangriff greift auch für Angriffe, die def.combat()-Hooks selbst starten (Barrotz-Ramm, Brathalos-Feuer)
      if (this._b2 && this._inHook && !this._taught && !extra.chainIdx && !ad.internal && !ad.noTeach && extra.teach === undefined) extra = { ...extra, teach: true };
      if (this._b2 && extra.tgMul === undefined) {
        let mul = 1;
        if (extra.teach) mul = 1.4;
        else if (ad.tgVar !== false) {
          mul = 0.85 + this.rng() * 0.4;
          if (ad.punishRoll && this._rollCount() >= 4) mul = Math.min(1.25 + this.rng() * 0.15, Math.max(1, 1.1 / ad.telegraph));
        }
        if (mul !== 1) extra = { ...extra, tgMul: Math.round(mul * 1000) / 1000 };
      }
      const atm = ad.internal ? 1 : this.def.attackTempo?.(this); // def.attackTempo(m) > 1: Angriffe schneller (Telegraph kürzer, Ablauf flotter), z. B. Krachfaust-Wut
      if (atm && atm !== 1) extra = { ...extra, tempoMul: Math.round(atm * 1000) / 1000 };
      const tgm = this.mm?.telegraphMul; // attack.js klemmt auf MIN_TELEGRAPH
      if (tgm && tgm !== 1) extra = { ...extra, tgMul: Math.round((extra.tgMul ?? 1) * tgm * 1000) / 1000 };
      if (extra.chainIdx === 0) { extra = { ...extra }; delete extra.chainIdx; }
      if (extra.teach) this._taught = true;
      if (this.def.chains && !extra.teach) this.chain = { idx: extra.chainIdx ?? 0, broken: false };
      this._atkCount++;
      if (this._stamOn && attackId !== this.def.tiredAttack) this.stamina = Math.max(0, this.stamina - (ad.stam ?? 8) * ((extra.chainIdx ?? 0) > 0 ? 1.5 : 1) * (this.rage ? 0.7 : 1));
      if (tgt && (this._b2 || this.ctx.revier)) { const ag = (this.ctx._aggro ??= new Map()); ag.set(tgt.id, { t: this._clock(), id: this.id }); }
    }
    // def.aimTarget(m, def, target) -> { pos, yaw? } (Autoritaet): Vorhalten auf die Laufrichtung (Pyrostur). Ergebnis reist als Startparameter mit, Gaeste bleiben deterministisch.
    const aim = tgt && this.authority ? this.def.aimTarget?.(this, ad, tgt) : null;
    return this.startAttack({
      attackId, t0: this.time, origin: { x: this.pos.x, y: this.pos.y - this.air, z: this.pos.z },
      yaw: aim?.yaw ?? this.rot, targetPos: aim?.pos ?? (tgt ? { x: tgt.pos.x, y: tgt.pos.y, z: tgt.pos.z } : undefined), seed: Math.floor(this.rng() * 1e9), ...extra,
    });
  }

  _chooseAttack(dist) {
    const cands = [];
    let total = 0;
    for (const def of Object.values(this.def.attacks)) {
      if (def.internal) continue;
      if (def.rageOnly && !this.rage) continue;
      if ((this.cds[def.id] ?? 0) > 0) continue;
      if (dist < def.range[0] || dist > def.range[1]) continue;
      if (def.cond && !def.cond(this, this.ctx)) continue;
      if (!this._atkAllowed(def)) continue;
      cands.push(def);
      total += this._weightOf(def, dist);
    }
    if (!cands.length) return null;
    let r = this.rng() * total;
    for (const c of cands) { r -= this._weightOf(c, dist); if (r <= 0) return c; }
    return cands[cands.length - 1];
  }

  /** Attack weight; defs may use a function (m, dist) -> number. */
  _weightOf(def, dist) {
    const w = def.weight;
    let v = typeof w === 'function' ? w(this, dist) : (w ?? 1);
    if (def.punishRoll && this._b2) { const n = this._rollCount(); if (n >= 4) v *= n >= 7 ? 3 : 2; }
    return v;
  }
  /** Teilbruch-/Phasen-Filter (needsBroken, lockedByBreak, phase). */
  _atkAllowed(def) {
    if (def.needsBroken && !this.partById[def.needsBroken]?.broken) return false;
    if (def.lockedByBreak && this.partById[def.lockedByBreak]?.broken) return false;
    if ((def.phase ?? 0) > this.phase) return false;
    return true;
  }
  _clock() { return this.ctx.simTime ?? this.ctx.time ?? this.time; } // hunt.time = gemeinsame Uhr aller Brocken (Aggro-Budget)
  /** Anti-Rollen-Spam: Rollen des Ziels in den letzten 10 s ohne laufenden Angriff. */
  _rollCount() {
    const l = this._rollLog.get(this.target?.id);
    if (!l) return 0;
    while (l.length && this.time - l[0] > 10) l.shift();
    return l.length;
  }
  _chainBreak() { if (this.chain) this.chain.broken = true; this.chainNext = null; }

  _b2Tick(dt) {
    for (const p of this.ctx.players) {
      const r = p.state === 'roll';
      if (r && !this._rollPrev.get(p.id) && !this.attack) { if (!this._rollLog.has(p.id)) this._rollLog.set(p.id, []); this._rollLog.get(p.id).push(this.time); }
      this._rollPrev.set(p.id, r);
    }
    if (this._rtT > 0) { this._rtT -= dt; if (this._rtT <= 0) this.ctx.fx.clearMarker?.(this.id + ':rt'); }
    if (this._stamOn && this.state === 'combat') {
      if (this.tired) {
        this.tiredT -= dt;
        if (this.tiredT <= 0) { this.tired = false; this.stamina = 60; this.ctx.bus.emit('monsterTired', { monster: this, on: false }); }
      } else if (!this.attack) {
        const fast = Math.hypot(this.vel.x, this.vel.z) > (this.def.walk ?? 2) * 1.5;
        if (fast) this.stamina = Math.max(0, this.stamina - 2 * dt * (this.rage ? 0.7 : 1));
        else if (!this.chainNext && this.stamina > 0) this.stamina = Math.min(100, this.stamina + 6 * dt);
        if (this.stamina <= 0) {
          this.tired = true; this.tiredT = 4 + this.rng() * 2; this.stamina = 0;
          this.queued = null; this._interrupt();
          this.ctx.bus.emit('monsterTired', { monster: this, on: true });
        }
      }
    }
    const ph = this.def.phases?.[this.phase];
    if (ph && this.state === 'combat' && this.hp / this.maxHp <= ph.at) {
      this.phase++;
      this._interrupt();
      this.queued = null; this.phaseT = 1.2; this.phaseSpecial = ph.special ?? null;
      this.ctx.bus.emit('monsterPhase', { monster: this, idx: this.phase, name: ph.name, cue: ph.cue });
      ph.enter?.(this);
    }
  }

  _flinchCheck(dmg) {
    this._flLog.push({ t: this.time, dmg });
    this._flLog = this._flLog.filter((e) => this.time - e.t <= 3);
    const fd = this.def.flinchDmg;
    const thr = fd === true ? this.maxHp * 0.06 : fd;
    if (this.state !== 'combat' || this.stunT > 0 || this.time - this._flLast < 8) return;
    if (this._flLog.reduce((s, e) => s + e.dmg, 0) < thr) return;
    if (this.attack && this.attack.inst.sample(this.attack.t).phase !== 'telegraph') return;
    this._interrupt();
    this.stagT = Math.max(this.stagT, 0.5);
    this.recover = Math.max(this.recover, 0.5);
    this._flLast = this.time; this._flLog = [];
    this.ctx.bus.emit('monsterFlinch', { monster: this });
  }

  /** Ende eines Angriffs (Host): Folgeglied würfeln oder Kette beenden. */
  _chainStep(id) {
    const ch = this.chain; this.chain = null;
    if (!ch) return;
    const list = this.def.chains?.[id], tgt = this.target;
    if (!ch.broken && list && ch.idx < (this.def.chainMax ?? 2) && this.state === 'combat' && !this.tired && this.stamina > 0 && this.stunT <= 0 && this.stagT <= 0 && tgt?.alive) {
      const dist = Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z);
      const opts = list.filter((o) => {
        if (o.atk === null) return true;
        const a = this.def.attacks[o.atk];
        return a && this._atkAllowed(a) && (!a.cond || a.cond(this, this.ctx)) && (!a.rageOnly || this.rage) && dist >= a.range[0] && dist <= a.range[1] && (!o.cond || o.cond(this, dist));
      });
      let total = 0;
      const cb = 1 + (this.mm?.chainBonus ?? 0), wOf = (o) => (o.w ?? 1) * (o.atk !== null ? cb : 1);
      for (const o of opts) total += wOf(o);
      if (total > 0) {
        let r = this.rng() * total, pick = opts[opts.length - 1];
        for (const o of opts) { r -= wOf(o); if (r <= 0) { pick = o; break; } }
        if (pick.atk !== null) {
          this.chainNext = { id: pick.atk, idx: ch.idx + 1 };
          this.recover = 0.1 + this.rng() * 0.15;
          return;
        }
      }
    }
    if (ch.idx > 0 && !ch.broken) this.recover = Math.max(this.recover, 1.0);
  }

  _aggroOk() {
    const tgt = this.target, e = this.ctx._aggro?.get(tgt?.id);
    return !e || e.id === this.id || this._clock() - e.t >= 0.6;
  }
  _aggroGate() { return (this._b2 || this.ctx.revier) && !this._aggroOk(); }


  // ---------- targeting
  _pickTarget() {
    const rv = this.ctx.revier?.rivalOf(this); // Revierstreit: erst gegen den anderen Brocken
    if (rv) { this.target = rv; return; }
    const alive = this.ctx.players.filter((p) => p.alive && this.def.canTarget?.(this, p) !== false); // def.canTarget: Gockelok-Auge greift nur Pirscher in seiner Arena an
    if (!alive.length) { this.target = null; return; }
    if (this._b2) return this._pickTargetB2(alive);
    let best = null, bt = -1;
    for (const p of alive) {
      const th = this.threatOf(p.id) + 1 / (1 + Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z));
      if (th > bt) { bt = th; best = p; }
    }
    if (alive.length > 1 && this.rng() < 0.15) best = alive[Math.floor(this.rng() * alive.length)];
    this.target = best;
  }
  _pickTargetB2(alive) {
    let maxT = 1;
    for (const p of alive) maxT = Math.max(maxT, this.threatOf(p.id));
    const recovering = !this.attack && this.recover > 0;
    let best = null, bs = -1;
    for (const p of alive) {
      const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      let sc = this.threatOf(p.id) / maxT + 0.6 / (1 + d / 8);
      if (recovering && p.weaponId === 'bow') sc += 0.4;
      if (this.rage) sc += 1 - (p.v?.hp ?? p.hp ?? 1) / (p.v?.maxHp ?? p.maxHp ?? 1);
      if (p === this.target) sc += 0.15;
      if (sc > bs) { bs = sc; best = p; }
    }
    if (alive.length > 1 && this.rng() < 0.15) best = alive[Math.floor(this.rng() * alive.length)];
    const old = this.target;
    this.target = best;
    if (old && old.alive && best && best !== old) {
      this.recover = Math.max(this.recover, 0.5);
      this._rtT = 0.5;
      this.ctx.fx.marker?.(this.id + ':rt', { x: best.pos.x, y: this.ctx.world.heightAt(best.pos.x, best.pos.z), z: best.pos.z }, 1.2, '#ffd040', false);
      this.ctx.bus.emit('retarget', { monster: this, playerId: best.id });
    }
  }
  _nearestPlayer() {
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
    if (this.authority && this.mm) this.mutatorTick(dt);
    this.stateT += dt;
    for (const k in this.cds) this.cds[k] = Math.max(0, this.cds[k] - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.rageCd = Math.max(0, this.rageCd - dt);
    const st = this.st;
    st.blind = Math.max(0, st.blind - dt); st.trap = Math.max(0, st.trap - dt); st.trapCd = Math.max(0, st.trapCd - dt); st.stink = Math.max(0, st.stink - dt);
    if (this.rage) {
      this.rageT -= dt;
      if (this.rageT <= 0) { this.rage = false; this.rageCd = RAGE_COOLDOWN; this.ctx.bus.emit('rage', { monster: this, on: false }); this.def.onRage?.(this, false); }
      else this._rageSteam(dt);
    }
    this._statusTick(dt);
    if (st.poisonT > 0 && this.alive && this.authority) this._poisonTick(dt);
    if (this._b2 && this.alive && this.authority) this._b2Tick(dt);
    if (this.kb && this.kb.t > 0 && this.authority && this.alive) {
      const s = Math.min(dt, this.kb.t);
      this.pos.x += this.kb.x * s; this.pos.z += this.kb.z * s;
      this.kb.t -= dt;
      this.ctx.world.collide(this.pos, this.bodyRadius * 0.6);
      this.pos.y = this.ctx.world.heightAt(this.pos.x, this.pos.z) + this.air;
    }
    if (this.authority && this.alive) this._ai(dt);
    if (!this.alive && this.air > 0) { this.air = Math.max(0, this.air - 14 * dt); this.pos.y = this.ctx.world.heightAt(this.pos.x, this.pos.z) + this.air; }
    this.projectiles.update(dt);
    this.def.tick?.(this, dt);
    this._visuals(dt);
  }

  _rageSteam(dt) {
    if (Math.random() < dt * 14) {
      this.nodes.head?.getWorldPosition(_v2);
      const o = (Math.random() - 0.5) * 0.8;
      this.ctx.fx.spark({ x: _v2.x + o, y: _v2.y + 0.5, z: _v2.z + o }, 1, Math.random() < 0.6 ? '#ff5030' : '#d0a0a0', 1.4);
    }
  }
  /** Rost/Verbruht: Timer + Teile-Faktor-Bonus (wirkt auf part.factor, das Treffer-Aufloesung liest). Gaeste: Timer kommen per Snapshot-Flags. */
  _statusTick(dt, remote = false) {
    const st = this.st;
    if (!remote) { st.rustT = Math.max(0, st.rustT - dt); st.scaldT = Math.max(0, st.scaldT - dt); }
    const fb = (st.rustT > 0 ? RUST_FACTOR : 0) + (st.scaldT > 0 ? SCALD_FACTOR : 0);
    if (fb === this._fb) return;
    const d = fb - this._fb;
    this._fb = fb;
    for (const p of this.parts) if (!p.gone) p.factor = Math.max(0, p.factor + d);
  }
  /** true, solange Teil `partId` eine unzerstoerte Glitch-Stelle ist (def.glitchSpots). */
  isGlitchSpot(partId) {
    const p = this.partById[partId];
    return !!p && !p.broken && !p.gone && !!this.def.glitchSpots?.includes(partId);
  }

  _poisonTick(dt) {
    const st = this.st;
    const d = Math.min(dt, st.poisonT);
    st.poisonT -= dt;
    const dmg = this.maxHp * POISON_PCT * (d / POISON_TIME);
    this.hp = Math.max(0, this.hp - dmg);
    st.poisonAcc += dmg;
    if (st.poisonAcc >= 12) {
      this.ctx.fx.number({ x: this.pos.x, y: this.pos.y + this.def.scale * 2 + this.air, z: this.pos.z }, Math.round(st.poisonAcc), 'heal');
      st.poisonAcc = 0;
    }
    if (this.hp <= 0) this._die();
  }

  _ai(dt) {
    if (this.state === 'fall') { this._fall(dt); return; }
    if (this.stagT > 0) { this.stagT -= dt; this._brake(dt); return; }
    if (this.stunT > 0) { this.stunT -= dt; this._brake(dt); return; }
    if (this.trapped) { this._brake(dt); return; }
    if (this.def.ai) { this.def.ai(this, dt); this._clampWorld(); return; } // [L] neutral fauna AI
    if (this.blind && this.state !== 'dead') { this._blinded(dt); return; }
    switch (this.state) {
      case 'wander': this._wander(dt); break;
      case 'notice':
        this._faceTarget(dt, 3);
        this._brake(dt);
        if (this.stateT >= (this.def.noticeTime ?? 1.6)) { this.recover = 0.3; this.setState('combat'); }
        break;
      case 'enrage':
        if (this.attack) { this._runAttack(dt); break; }
        if (this.def.rageAttack && !this._rageAtkDone) {
          this._rageAtkDone = true;
          this._pickTarget();
          this.beginAttack(this.def.rageAttack);
          break;
        }
        this._faceTarget(dt, 3);
        this._brake(dt);
        if (this.stateT >= (this.def.rageAttack ? 0.2 : 1.4)) { this.recover = 0.3; this.setState('combat'); }
        break;
      case 'combat': this._combat(dt); break;
      case 'fressen': eatTick(this, dt); break; // [L]
      case 'flee': this._flee(dt); break;
      case 'sleep': this._sleep(dt); break;
      case 'fly': this._fly(dt); break;
      case 'fall': this._fall(dt); break;
    }
    this._clampWorld();
  }

  _brake(dt) { this.vel.multiplyScalar(Math.exp(-6 * dt)); }

  /** Blinded: stumbles around, can't aim. */
  _blinded(dt) {
    if (this.attack) this._interrupt();
    if (this.state === 'fly') { this._startFall(4); return; }
    this.rot += Math.sin(this.time * 2.3) * 1.4 * dt;
    const f = this.def.walk * 0.4;
    this.vel.x += (Math.sin(this.rot) * f - this.vel.x) * (1 - Math.exp(-4 * dt));
    this.vel.z += (Math.cos(this.rot) * f - this.vel.z) * (1 - Math.exp(-4 * dt));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.ctx.world.collide(this.pos, this.bodyRadius * 0.6);
    this.pos.y = this.ctx.world.heightAt(this.pos.x, this.pos.z) + this.air;
  }

  /** Stink bomb: leave the area (single target) for a few seconds. */
  _stinkFlee(dt) {
    const from = this.st.stinkFrom ?? (this.target ? { x: this.target.pos.x, z: this.target.pos.z } : { x: this.pos.x, z: this.pos.z + 1 });
    { const ax = this.pos.x - from.x, az = this.pos.z - from.z, al = Math.hypot(ax, az) || 1; this._navTo(dt, this.pos.x + (ax / al) * 14, this.pos.z + (az / al) * 14, this.def.run * 0.9, 3.4); }
  }

  _nextWanderPoint() {
    const route = this.def.homeWander ? null : routeOf(this);
    if (route?.length) {
      const p = route[this.routeIdx % route.length];
      this.routeIdx = (this.routeIdx + 1 + (this.rng() < 0.25 ? 1 : 0)) % route.length;
      return { x: p.x + (this.rng() - 0.5) * 6, z: p.z + (this.rng() - 0.5) * 6 };
    }
    const a = this.rng() * Math.PI * 2, r = 6 + this.rng() * 16;
    return { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
  }

  _wander(dt) {
    const { p, d } = this._nearestPlayer();
    const detect = this.def.detectFor?.(this) ?? this.def.detect ?? 28; // detectFor: z. B. Blendax im Nebel
    if (p && d < detect) {
      const ang = Math.abs(angleDiff(this.rot, yawOf(p.pos.x - this.pos.x, p.pos.z - this.pos.z)));
      if (d < detect * 0.4 || ang < 1.3) {
        this.target = p; this.discovered = true;
        this.setState('notice');
        return;
      }
    }
    if (this.st.stink > 0) { this._stinkFlee(dt); return; }
    if (this.def.wander?.(this, dt)) return; // def.wander(m, dt) -> true wenn behandelt (Mampfaffe: Futter suchen/fressen)
    if (predationTick(this, dt)) return; // [L]
    this.wanderT -= dt;
    if (this.wanderT <= 0 && !this.wanderTo) this.wanderTo = this._nextWanderPoint();
    if (this.wanderTo) {
      const dx = this.wanderTo.x - this.pos.x, dz = this.wanderTo.z - this.pos.z, dd = Math.hypot(dx, dz);
      if (dd < 2) { this.wanderTo = null; this.wanderT = 2 + this.rng() * 4; this._brake(dt); return; }
      this._navTo(dt, this.wanderTo.x, this.wanderTo.z, this.def.walk, 1.6 * (this.def.turn ?? 1));
    } else this._brake(dt);
  }

  _combat(dt) {
    if (this.attack) { this._runAttack(dt); return; }
    if (!this.minor && !this.def.noFlee && !this.fleeUsed && this.hp <= this.maxHp * FLEE_HP) { this._startFlee(); return; }
    this._combatT += dt;
    if (this.chainNext && !this.target?.alive) this.chainNext = null;
    this.retargetT -= dt;
    if (!this.chainNext && (!this.target || !this.target.alive || this.retargetT <= 0)) { this._pickTarget(); this.retargetT = 5; }
    const tgt = this.target;
    if (!tgt) { this._brake(dt); this.setState('wander'); this.wanderT = 3; return; }
    if (this.st.stink > 0) { this._stinkFlee(dt); return; }
    this._inHook = true; const hooked = this.def.combat?.(this, dt); this._inHook = false;
    if (hooked) return;
    const dx = tgt.pos.x - this.pos.x, dz = tgt.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    this.recover -= dt;
    const want = yawOf(dx, dz);
    const diff = Math.abs(angleDiff(this.rot, want));
    const turn = this.def.turn ?? 1;
    if (this.recover > 0) { this._faceTarget(dt, 1.2 * turn); this._brake(dt); return; }
    if (this.phaseT > 0) {
      this.phaseT -= dt; this._faceTarget(dt, 1.2 * turn); this._brake(dt);
      if (this.phaseT <= 0 && this.phaseSpecial) { this.queued = this.phaseSpecial; this.phaseSpecial = null; }
      return;
    }
    if (this.tired) {
      this._faceTarget(dt, 1.2 * turn); this._brake(dt);
      const ta = this.def.tiredAttack;
      if (ta && (this.cds[ta] ?? 0) <= 0 && dist >= this.def.attacks[ta].range[0] && dist <= this.def.attacks[ta].range[1] && diff < 0.4) this.beginAttack(ta);
      return;
    }
    if (this.chainNext) {
      if (this.ctx.revier && this._aggroGate()) { this.recover = 0.2; return; }
      if (diff > 1.0) { this._faceTarget(dt, 6 * turn); this._brake(dt); return; }
      const cn = this.chainNext;
      this.chainNext = null;
      this.beginAttack(cn.id, { chainIdx: cn.idx });
      return;
    }
    if (this.queued) {
      if (this.ctx.revier && this._aggroGate()) { this.recover = 0.2; return; }
      if (diff > 0.4) { this._faceTarget(dt, 3.6 * turn); this._brake(dt); return; }
      const id = this.queued;
      this.queued = null;
      this.beginAttack(id);
      return;
    }
    let def = null, teach = false;
    if (this._b2 && !this._taught) { // erster (lehrbarer) Angriff der Jagd = Lehrangriff
      const td = this.def.teachAttack && this.def.attacks[this.def.teachAttack];
      def = td && this._atkAllowed(td) && dist >= td.range[0] && dist <= td.range[1] ? td : this._chooseAttack(dist);
      teach = !!def && !def.noTeach && !def.internal;
    } else def = this._chooseAttack(dist);
    if (def) {
      if (diff > 0.4 && !def.noFace) { this._faceTarget(dt, 3.4 * turn); this._brake(dt); return; }
      if (this._aggroGate()) { this.recover = 0.2; return; }
      this.beginAttack(def.id, teach ? { teach: true } : {});
      return;
    }
    const prefer = this.def.prefer ?? 4.5;
    if (dist > prefer) this._navTo(dt, tgt.pos.x, tgt.pos.z, this.def.run, 3.2 * turn);
    else if (dist < prefer * 0.6) { this._faceTarget(dt, 2 * turn); this._moveToward(dt, -dx, -dz, this.def.walk * 0.8, 0, true); }
    else { this._faceTarget(dt, 2.4 * turn); const s = Math.sin(this.time * 0.7) > 0 ? 1 : -1; this._moveToward(dt, -dz * s, dx * s, this.def.walk * 0.7, 0, true); }
  }

  _runAttack(dt) {
    const a = this.attack, inst = a.inst, ctx = this.ctx;
    a.t += dt;
    const s = inst.sample(a.t);
    this.pos.x = s.x; this.pos.z = s.z; this.rot = s.yaw;
    if (!inst.def.ignoreTerrain) this.ctx.world.collide(this.pos, this.bodyRadius * 0.5);
    this.air = s.air;
    this.pos.y = (s.groundY ?? ctx.world.heightAt(this.pos.x, this.pos.z)) + s.air;
    this.vel.set(0, 0, 0);
    // timeline events: `all` events run on every client (projectiles), the others on the authority only (spawns etc.)
    for (const e of inst.def.events ?? []) {
      if (s.tau >= e.t && !inst.firedEvents.has(e)) {
        inst.firedEvents.add(e);
        // [N] replayed attacks (guests) must not spawn; [M] events marked all:true (projectiles) run everywhere
        if (e.all || this.authority) inst.def.calls?.[e.call]?.(this, ctx, inst, Math.max(0, a.t - inst.wall(e.t)));
      }
    }
    this._attackHits(inst, a.t);
    if (a.t >= inst.duration) {
      const id = a.id;
      this.attack = null;
      this.ctx.fx.clearMarker?.(this.id);
      this.recover = (this.def.recoverAfter?.(this) ?? (this.minor ? 0.5 : 0.35 + this.rng() * 0.5) / this.speedMul) * (this.mm?.recoverMul ?? 1);
      if (this.authority) this._chainStep(id);
      this.def.onAttackEnd?.(this, id, inst);
      if (this.state === 'enrage') { this.recover = 0.5; this.setState('combat'); }
    }
  }

  /** Test attack hit shapes against local players. Used for authority AND replayed (remote) attacks. */
  _attackHits(inst, t) {
    const hits = inst.hitsAt(t);
    if (!hits.length) return;
    for (const p of this.ctx.players) {
      if (!p.local || !p.alive) continue;
      const caps = p.hitCapsules();
      for (const h of hits) {
        // Composite jaws/horns/body may describe one impact with several shapes.
        // Shared groups prevent overlapping shapes from multiplying damage through super armor.
        const k = p.id + '|' + (h.hit.group ?? h.idx);
        if (inst.hitSet.has(k)) continue;
        this.ctx.debugShape?.(h.shape, '#ff3030');
        // faceCheck (Blendax-Blitz): zaehlt nur, wenn die Kamera des lokalen Pirschers zum Brocken zeigt (Bildschirm = was er sieht); weggedreht = kein Treffer
        const fc = h.hit.faceCheck;
        if (fc !== undefined && Math.abs(angleDiff(this.ctx.cameraYaw ?? p.rot, yawOf(this.pos.x - p.pos.x, this.pos.z - p.pos.z))) > fc * Math.PI / 180) continue;
        if (!caps.some((c) => overlap(h.shape, c))) continue;
        // occlude (Krachfaust-Urknall): steht eine unzerstoerte hohe Saeule zwischen Brocken und Pirscher, verfaellt der Treffer (Deckung); tritt der Pirscher spaeter hervor, zaehlt er wieder
        if (h.hit.occlude && this.ctx.world?.coverBetween?.(this.pos, p.pos)) continue;
        const res = p.takeHit({
          dmg: h.dmg * this.dmgMul * (this.def.hitDmgMul?.(this, h.hit) ?? 1), knock: h.knock, key: h.key + '|' + p.id, sourcePos: this.pos, attackId: inst.params.attackId, monster: this,
          status: h.hit.status, push: h.hit.push, dmgPct: h.hit.dmgPct, noPerfect: h.hit.noPerfect,
        });
        if (res === 'hit' || res === 'block' || res === 'perfect') inst.hitSet.add(k); // perfect = Glitch-Konter: der Treffer ist verbraucht
        if (res === 'hit' && h.dmg > 0) this.ctx.bus.emit('sfx', { name: 'monsterHit', pos: p.pos });
        if (res === 'hit') this.def.onHitPlayer?.(this, p, h, res); // Treffer-Folgen je Brocken (Mampfaffe: Futterklau, Verwirrung)
      }
    }
    if (this.authority && this.ctx.revier) this.ctx.revier.resolve(this, inst, hits); // Revierkampf: Brocken trifft Brocken (nur Host)
  }

  /** Mutator-Tick (nur Autoritaet, deterministisch ueber this.time): regenPct + lagSpike. */
  mutatorTick(dt) {
    const mm = this.mm;
    if (!mm || !this.alive) return;
    this._sinceHit = (this._sinceHit ?? 99) + dt;
    if (mm.regenPct && this._sinceHit >= 2 && this.hp < this.maxHp && this.state !== 'sleep') { // auch im Flug/Sprung
      const add = Math.min(this.maxHp - this.hp, this.maxHp * mm.regenPct / 100 * dt);
      this.hp += add;
      this._regenFx(add, dt);
    }
    const ls = mm.lagSpike;
    if (ls) this._lagTick(dt, ls);
    this._ghostTick(dt);
  }


  /**
   * Lag-Spitze (Rubberband): im Leerlauf (kein Angriff/keine Kette) friert der Brocken 0,55 s ruckelnd ein, ein Marker zeigt das Sprungziel,
   * dann snappt er dorthin: weit weg -> bis zu `ls.skip` m ran, nah dran -> in die Flanke des Ziels. Danach sofort handlungsfaehig (keine Erholung).
   * Telegraphs/Hitboxen werden nie verschoben; der naechste Angriff hat seinen normalen Telegraph. Nur Host (Position kommt per Snapshot zu den Gaesten).
   */
  _lagTick(dt, ls) {
    const ok = this.state === 'combat' && !this.minor && !this.burrowed && this.target?.alive;
    const w = this._lagWarn;
    if (w) {
      if (!ok || this.attack || this.stunT > 0 || this.stagT > 0) { this._lagCancel(); return; }
      this.recover = Math.max(this.recover, 0.05); w.t -= dt; // Stillstand = der „Ruckler"
      if (Math.floor(this.time * 30) % 3 === 0) this.hitFlash = Math.max(this.hitFlash, 0.03);
      if (w.t <= 0) this._lagSnap(w);
      return;
    }
    if (!ok) { this._lagT = Math.min(this._lagT ?? 0, ls.period * 0.5); return; }
    this._lagT = (this._lagT ?? 0) + dt;
    if (this._lagT < ls.period || this.attack || this.chainNext) return;
    const dest = this._lagDest(ls.skip ?? 8);
    if (!dest) { this._lagT = ls.period - 1; return; } // gerade nichts sinnvoll: bald nochmal
    this._lagWarn = { t: 0.55, ...dest };
    this.ctx.bus.emit('sfx', { name: 'glitch', pos: this.pos, vol: 0.5 });
    this.ctx.fx.marker?.(this.id + '_lag', { x: dest.x, y: this.ctx.world.heightAt(dest.x, dest.z), z: dest.z }, this.bodyRadius + 0.6, '#7fe8ff', false);
  }

  /** Sprungziel: fern -> geradeaus ran; nah -> seitlich um das Ziel herum (Seite per Monster-Rng, deterministisch). */
  _lagDest(maxJump) {
    const t = this.target, dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    const stay = this.bodyRadius + 2.5;
    let x, z;
    if (d - stay >= 3) { const L = Math.min(maxJump, d - stay); x = this.pos.x + dx / d * L; z = this.pos.z + dz / d * L; }
    else { // Flanke: ~100 Grad um das Ziel versetzt
      const side = this.rng() < 0.5 ? -1 : 1, a = Math.atan2(this.pos.x - t.pos.x, this.pos.z - t.pos.z) + side * 1.75, r = Math.max(d, stay);
      x = t.pos.x + Math.sin(a) * r; z = t.pos.z + Math.cos(a) * r;
    }
    const q = { x, y: 0, z }; this.ctx.world.collide?.(q, this.bodyRadius * 0.5);
    if (Math.hypot(q.x - this.pos.x, q.z - this.pos.z) < 2.5) return null;
    return { x: q.x, z: q.z };
  }

  _lagCancel() { this._lagWarn = null; this._lagT = 0; this.ctx.fx.clearMarker?.(this.id + '_lag'); }

  _lagSnap(w) {
    this.ctx.fx.clearMarker?.(this.id + '_lag');
    this._lagWarn = null; this._lagT = 0;
    this._lagGhost(); // Geisterbild an der alten Position
    this.pos.x = w.x; this.pos.z = w.z;
    this.pos.y = this.ctx.world.heightAt(w.x, w.z) + (this.air ?? 0);
    this.vel.set(0, 0, 0);
    this.recover = Math.min(this.recover, 0.1); // nach dem Sprung sofort wieder dran
    this.lagCount = (this.lagCount ?? 0) + 1;
    this.ctx.bus.emit('sfx', { name: 'glitch', pos: this.pos, vol: 0.7 });
    this.ctx.fx.spark?.({ x: this.pos.x, y: this.pos.y + this.def.scale, z: this.pos.z }, 12, '#7fe8ff', 3.5);
  }

  /** Speicherleck-Feedback (Host real, Gast aus beobachteter hp-Aenderung): jede Sekunde gruene „+Σ"-Zahl, Funken, Ton, HUD-Flackern. */
  _regenFx(amt, dt) {
    this._rgA = (this._rgA ?? 0) + amt; this._rgT = (this._rgT ?? 0) + dt;
    if (this._rgT < 1 || this.minor) return;
    const got = this._rgA; this._rgT = 0; this._rgA = 0;
    if (got <= 0) return;
    const at = { x: this.pos.x, y: this.pos.y + this.def.scale * 1.6 + (this.air ?? 0), z: this.pos.z };
    this.ctx.fx.number(at, `+Σ ${Math.round(got)}`, 'mheal');
    this.ctx.fx.spark?.(at, 8, '#5dff9a', 2.5);
    this.ctx.bus.emit('sfx', { name: 'mutheal', pos: this.pos });
    this.ctx.bus.emit('mutfx', { kind: 'heal', monster: this });
  }

  /** Lag-Spitze-Feedback: Geisterbild an der alten Position (ausblendend), Glitch-Ton, kurzes Flimmern. */
  _lagGhost() {
    this.ctx.bus.emit('sfx', { name: 'glitch', pos: this.pos, vol: 0.55 });
    this.ctx.bus.emit('mutfx', { kind: 'lag', monster: this });
    this.ctx.fx.spark?.({ x: this.pos.x, y: this.pos.y + this.def.scale, z: this.pos.z }, 10, '#7fe8ff', 3);
    const parent = this.mesh.parent;
    if (!parent || this.minor) return;
    const g = this.mesh.clone(true);
    g.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) { o.material = GHOST_MAT; o.castShadow = false; } });
    g.matrixAutoUpdate = true; parent.add(g);
    (this._ghosts ??= []).push({ g, t: 0.5 });
    this.hitFlash = Math.max(this.hitFlash, 0.08); // Original flackert kurz
  }

  _ghostTick(dt) {
    const L = this._ghosts; if (!L?.length) return;
    for (let i = L.length - 1; i >= 0; i--) {
      L[i].t -= dt;
      if (L[i].t <= 0) { L[i].g.removeFromParent(); L.splice(i, 1); }
      else L[i].g.visible = Math.floor(L[i].t * 24) % 2 === 0; // Flimmern
    }
  }

  /** Gast: Host-Effekte aus beobachteter Aenderung ableiten (hp steigt ohne Treffer; Lag-Takt lokal, Sprung selbst kommt per Snapshot). */
  _mutatorObserve(dt) {
    const mm = this.mm;
    if (!mm || !this.alive) { this._ghostTick(dt); return; }
    const prev = this._obsHp ?? this.hp; this._obsHp = this.hp;
    if (mm.regenPct) this._regenFx(Math.max(0, this.hp - prev), dt);
    if (mm.lagSpike) { // Gast: Rubberband-Sprung (Host) an grossem Positionssprung erkennen -> Geisterbild an der alten Stelle
      const o = this._obsPos; this._obsPos = { x: this.pos.x, z: this.pos.z };
      if (o && Math.hypot(this.pos.x - o.x, this.pos.z - o.z) > 2.4 && this.state === 'combat') { const nx = this.pos.x, nz = this.pos.z; this.pos.x = o.x; this.pos.z = o.z; this._lagGhost(); this.pos.x = nx; this.pos.z = nz; }
    }
    this._ghostTick(dt);
  }

  /** Remote clients: advance a replayed attack. */
  tickRemote(dt) {
    this.time += dt;
    if (this.mm) this._mutatorObserve(dt);
    this._statusTick(dt, true);
    if (this.attack) this._runAttack(dt);
    this.projectiles.update(dt);
    this.def.tick?.(this, dt);
    this._visuals(dt);
  }

  _flee(dt) {
    if (this.def.flee?.(this, dt)) return;
    const nest = nestOf(this);
    const dx = nest.x - this.pos.x, dz = nest.z - this.pos.z, d = Math.hypot(dx, dz);
    this.fleeT = (this.fleeT ?? 0) + dt;
    if (d < 3) { this.fleeing = false; this.setState('sleep'); this.vel.set(0, 0, 0); return; }
    // give up: too long (or repeatedly stuck) -> fight back if a hunter is close, else just rest where we are
    if (this.fleeT > 75 || (this.nv?.stuckTotal ?? 0) >= 4) {
      const { p, d: pd } = this._nearestPlayer();
      this.fleeing = false;
      if (p && pd < 40) { this.target = p; this.setState('combat'); this.recover = 0.8; }
      else { this.setState('sleep'); this.vel.set(0, 0, 0); }
      return;
    }
    this._navTo(dt, nest.x, nest.z, this.def.run * 1.1, 4 * (this.def.turn ?? 1));
  }

  _sleep(dt) {
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.01 * dt);
    this._brake(dt);
    if (this.revierHold > 0) { this.revierHold -= dt; return; } // Revier-Rückzug: bleibt eine Weile im Nest
    if (this.hp >= this.maxHp * 0.6) { this.setState('combat'); this.recover = 1.5; this.fleeing = false; this.fleeUsed = false; this.rageUsed = false; }
  }

  // ---------- flight (defs with `fly: { height, minT, maxT, attack, radius, speed, angSpeed, dropDamage }`)
  /** Called when the takeoff attack ends (authority and clients via snapshot state). */
  beginFly() {
    const f = this.def.fly;
    if (!f) return;
    this.setState('fly');
    this.air = f.height;
    this.flyT = f.minT + this.rng() * (f.maxT - f.minT);
    this.flyDamage = 0;
    const t = this.target;
    this.flyAng = t ? Math.atan2(this.pos.z - t.pos.z, this.pos.x - t.pos.x) : 0;
    this.flyDir = this.rng() < 0.5 ? 1 : -1;
  }
  _fly(dt) {
    if (this.attack) { this._runAttack(dt); return; }
    if (this.def.apexZones) { // an interrupted migration lands safely instead of entering orbit AI
      this.air = 0; this._landOnGround(); this.setState('combat'); this.recover = 1.5; return;
    }
    const f = this.def.fly;
    let tgt = this.target;
    if (!tgt || !tgt.alive) { this._pickTarget(); tgt = this.target; }
    this.air += (f.height - this.air) * (1 - Math.exp(-2.5 * dt));
    const cx = tgt ? tgt.pos.x : this.home.x, cz = tgt ? tgt.pos.z : this.home.z;
    this.flyAng += this.flyDir * (f.angSpeed ?? 0.5) * dt;
    const R = f.radius ?? 11;
    const wx = cx + Math.cos(this.flyAng) * R, wz = cz + Math.sin(this.flyAng) * R;
    const dx = wx - this.pos.x, dz = wz - this.pos.z, l = Math.hypot(dx, dz) || 1;
    const sp = Math.min(f.speed ?? 9, l * 2.2 + 2) * this.speedMul;
    this.vel.x += ((dx / l) * sp - this.vel.x) * (1 - Math.exp(-3 * dt));
    this.vel.z += ((dz / l) * sp - this.vel.z) * (1 - Math.exp(-3 * dt));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.ctx.world.collide(this.pos, 0.1);
    // look at the target while circling (hunter keeps eye contact, body banks)
    if (tgt) this.rot = stepAngle(this.rot, yawOf(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z), 1.6 * dt);
    this.pos.y = this.ctx.world.heightAt(this.pos.x, this.pos.z) + this.air;
    this.flyT -= dt;
    if (this.flyT <= 0 && tgt && this.air > f.height - 0.4) {
      this.beginAttack(f.attack, { origin: { x: this.pos.x, y: this.ctx.world.heightAt(this.pos.x, this.pos.z), z: this.pos.z }, yaw: yawOf(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) });
    }
  }
  /** Never touch down inside rock / a cliff: nudge to the nearest walkable nav cell. */
  _landOnGround() {
    const nav = getNav(this.ctx.world);
    if (!nav || nav.free(this.pos.x, this.pos.z)) return;
    const s = nav.snap(this.pos.x, this.pos.z);
    this.pos.x = s.x; this.pos.z = s.z;
    this.pos.y = this.ctx.world.heightAt(s.x, s.z);
  }
  /** Down from the sky: falls, then lies helpless for `t` seconds. */
  _startFall(t = 4) {
    if (this.state === 'fall' || !this.alive) return;
    this._interrupt();
    this.helpless = t;
    this.fallV = 0;
    this.setState('fall');
    this.ctx.fx.number({ x: this.pos.x, y: this.pos.y + 2, z: this.pos.z }, 'Abgestürzt!', 'weak');
  }
  _fall(dt) {
    this.fallV += 28 * dt;
    this.air -= this.fallV * dt;
    this.vel.multiplyScalar(Math.exp(-3 * dt));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (this.air <= 0) {
      this.air = 0;
      this._landOnGround();
      this.ctx.fx.shake(0.6, 0.4);
      this.ctx.fx.spark({ x: this.pos.x, y: this.pos.y + 0.3, z: this.pos.z }, 30, '#a08a60', 7);
      this.ctx.bus.emit('sfx', { name: 'heavy', pos: this.pos });
      this.stunT = this.helpless;
      this.recover = 1.0;
      this.setState('combat');
      this.ctx.bus.emit('monsterStun', { monster: this, reason: 'fall' });
    }
    this.pos.y = this.ctx.world.heightAt(this.pos.x, this.pos.z) + this.air;
  }

  _faceTarget(dt, rate) {
    const t = this.target;
    if (!t) return;
    this.rot = stepAngle(this.rot, yawOf(t.pos.x - this.pos.x, t.pos.z - this.pos.z), rate * this.speedMul * dt);
  }

  /**
   * Navigation aim: returns [dx, dz] towards the next waypoint of an A* path to (gx, gz) (cached per world nav grid),
   * with stuck detection (no progress 1.5 s -> repath around the blocking cells + slide along the wall).
   * Falls back to the straight line (no nav grid, or clear line of sight). Deterministic (no rng).
   */
  _navAim(dt, gx, gz, speed = 4) {
    const dx = gx - this.pos.x, dz = gz - this.pos.z, nav = getNav(this.ctx.world);
    if (!nav) return [dx, dz];
    const n = this.nv ??= { path: null, i: 0, gx: NaN, gz: NaN, age: 0, sx: 0, sz: 0, st: 0, last: -9, slide: 0, sd: 1, stuck: 0, stuckTotal: 0, avoid: null, avoidT: 0 };
    if (this.time - n.last > 0.4) { n.st = 0; n.sx = this.pos.x; n.sz = this.pos.z; n.path = null; n.slide = 0; n.avoid = null; }
    n.last = this.time;
    n.age += dt; n.st += dt; n.avoidT -= dt;
    if (n.avoidT <= 0) n.avoid = null;
    if (n.st >= 1.5) { // progress check
      const moved = Math.hypot(this.pos.x - n.sx, this.pos.z - n.sz);
      n.sx = this.pos.x; n.sz = this.pos.z; n.st = 0;
      if (moved < speed * this.speedMul * 0.3 && Math.hypot(dx, dz) > 2.5) {
        n.stuck++; n.stuckTotal++;
        const avoid = new Set();
        const wp = n.path?.[n.i];
        const k = nav.cell(wp ? wp.x : this.pos.x + Math.sin(this.rot) * 2, wp ? wp.z : this.pos.z + Math.cos(this.rot) * 2);
        if (k >= 0) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) avoid.add(k + a + b * nav.N);
        n.avoid = avoid; n.avoidT = 4; n.path = null; n.slide = 0.7; n.sd = -n.sd;
      }
    }
    // perf: LOS re-checked at most every 0.25 s, A* at most every 0.5 s, failed searches back off 1.5 s
    n.losT = (n.losT ?? 0) - dt;
    if (Math.hypot(dx, dz) < 3) { n.path = null; return [dx, dz]; }
    if (n.losT <= 0) { n.losT = 0.25; n.losOk = nav.los(this.pos.x, this.pos.z, gx, gz); }
    if (n.losOk) { n.path = null; return [dx, dz]; }
    n.failT = (n.failT ?? 0) - dt;
    if ((!n.path || (n.age > 0.5 && Math.hypot(gx - n.gx, gz - n.gz) > 3) || n.age > 2.5) && n.failT <= 0) {
      n.path = nav.find(this.pos.x, this.pos.z, gx, gz, n.avoid) ?? (n.avoid ? nav.find(this.pos.x, this.pos.z, gx, gz) : null);
      n.i = 0; n.age = 0; n.gx = gx; n.gz = gz;
      if (!n.path) n.failT = 1.5;
    }
    if (!n.path) return [dx, dz];
    while (n.i < n.path.length - 1 && Math.hypot(n.path[n.i].x - this.pos.x, n.path[n.i].z - this.pos.z) < 2.2) n.i++;
    if (n.i < n.path.length - 1 && n.losT === 0.25 && nav.los(this.pos.x, this.pos.z, n.path[n.i + 1].x, n.path[n.i + 1].z)) n.i++;
    const w = n.path[n.i];
    let ax = w.x - this.pos.x, az = w.z - this.pos.z;
    if (n.slide > 0) { // slide along the wall: sdf gradient tangent
      n.slide -= dt;
      const L = this.ctx.world.layout, e = 0.6;
      const gxx = L.sdfAt(this.pos.x + e, this.pos.z) - L.sdfAt(this.pos.x - e, this.pos.z), gzz = L.sdfAt(this.pos.x, this.pos.z + e) - L.sdfAt(this.pos.x, this.pos.z - e);
      const gl = Math.hypot(gxx, gzz) || 1, al = Math.hypot(ax, az) || 1;
      ax = ax / al - (gzz / gl) * n.sd * 1.2 + (gxx / gl) * 0.6; az = az / al + (gxx / gl) * n.sd * 1.2 + (gzz / gl) * 0.6;
    }
    return [ax, az];
  }

  /** _moveToward a point via the nav grid. */
  _navTo(dt, gx, gz, speed, turn) {
    const [ax, az] = this._navAim(dt, gx, gz, speed);
    this._moveToward(dt, ax, az, speed, turn);
  }

  _moveToward(dt, dx, dz, speed, turn, keepFacing = false) {
    const want = yawOf(dx, dz);
    if (!keepFacing) this.rot = stepAngle(this.rot, want, (turn || 2) * this.speedMul * dt);
    const align = keepFacing ? 1 : clamp(1 - Math.abs(angleDiff(this.rot, want)) / 1.2, 0, 1);
    const l = Math.hypot(dx, dz) || 1;
    const sp = speed * this.speedMul * align;
    const k = 1 - Math.exp(-5 * dt);
    this.vel.x += ((dx / l) * sp - this.vel.x) * k;
    this.vel.z += ((dz / l) * sp - this.vel.z) * k;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.ctx.world.collide(this.pos, this.bodyRadius * 0.6);
    this.pos.y = this.ctx.world.heightAt(this.pos.x, this.pos.z) + this.air;
  }

  _clampWorld() { if (!this.attack && !this.flying) this.pos.y = this.ctx.world.heightAt(this.pos.x, this.pos.z) + this.air; }

  // ---------- visuals
  /** Small monsters far from all local hunters: skip posing + drawing (ambient packs would add ~15 draw calls each). */
  _cullMinor() {
    let near = false;
    for (const pl of this.ctx.players) {
      if (!pl.local) continue;
      const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
      if (dx * dx + dz * dz <= MINOR_CULL_R2) { near = true; break; }
    }
    if (!near && this.state !== 'dead') {
      if (!this.culled) { this.culled = true; this.mesh.visible = false; this.shadow.visible = false; this.ctx.fx.clearMarker?.(this.id); }
      return true;
    }
    if (this.culled) { this.culled = false; this.mesh.visible = true; this.shadow.visible = true; this._hpStamp = this._lpStamp = -1; }
    return false;
  }

  _visuals(dt) {
    if (this.minor && this._cullMinor()) return;
    const p = this.pose;
    const target = this._tgt;
    const defaults = this.def.poseDefaults ?? MREST;
    for (const k in defaults) target[k] = defaults[k];
    let tele = null;
    if (!this.attack && this._fpKeys?.size) { for (const k of this._fpKeys) this.ctx.fx.clearMarker?.(k); this._fpKeys.clear(); }
    const spd = Math.hypot(this.vel.x, this.vel.z);
    if (!this.authority && !this.attack) this.air = Math.max(0, this.pos.y - this.ctx.world.heightAt(this.pos.x, this.pos.z));
    if (this.state === 'dead') {
      Object.assign(target, this.def.deadPose ?? { bodyY: -1.1, bodyRoll: 80, head: 20, neck: -0.3, legL: 40, legR: -30 });
    } else if (this.attack) {
      const a = this.attack, s = a.inst.sample(a.t);
      if (a.inst.def.pose) sampleTrack(a.inst.def.pose, s.tau, target);
      if (s.phase === 'telegraph') tele = a.inst.def.flashParts ?? [];
      const mk = a.inst.def.marker;
      if (a.inst.def.markerFromHits) { // rote Gefahrenzonen direkt aus den Trefferformen (Position + Radius = echte Hitbox), je Treffer bis kurz nach seinem Ende
        const fps = a.inst.footprints(), keys = (this._fpKeys ??= new Set()), now = new Set();
        const flash = s.phase === 'telegraph' && Math.floor(this.time * 10) % 2 === 0;
        for (const f of fps) {
          const key = `${this.id}:f${f.idx}.${f.n}`;
          if (s.tau > f.t1 + 0.12 || s.tau < f.t0 - (a.inst.def.markerLead ?? Infinity)) continue;
          now.add(key);
          this.ctx.fx.marker(key, { x: f.x, y: this.ctx.world.heightAt(f.x, f.z), z: f.z }, f.r, flash ? '#ff6a4a' : '#ff1a1a', s.tau >= f.t0);
        }
        for (const k of keys) if (!now.has(k)) this.ctx.fx.clearMarker?.(k);
        this._fpKeys = now;
      } else if (mk && s.tau < (a.inst.def.markerUntil ?? a.inst.def.telegraph + 0.7)) {
        let at = this.pos;
        if (mk.at === 'landing' && a.inst.landing) at = a.inst.landing;
        else if (mk.at === 'target') at = a.inst.target;
        this.ctx.fx.marker(this.id, { x: at.x, y: this.ctx.world.heightAt(at.x, at.z), z: at.z }, mk.radius, mk.color ? (s.phase === 'telegraph' && Math.floor(this.time * 10) % 2 === 0 ? mk.peak ?? mk.color : mk.color) : '#ff3030', s.phase !== 'telegraph');
      } else this.ctx.fx.clearMarker?.(this.id);
    } else if (this.sleeping) {
      Object.assign(target, { bodyY: -0.75, head: 35, neck: -0.2, legL: 70, legR: 70, bodyPitch: 4 }, this.def.sleepPose);
      target.bodyY += Math.sin(this.time * 1.5) * 0.04;
      if (Math.random() < dt * 0.8) this.ctx.fx.spark({ x: this.pos.x, y: this.pos.y + this.def.scale * 1.8, z: this.pos.z }, 1, '#9fb8ff', 0.8);
    } else if (this.state === 'notice' || this.state === 'enrage') {
      const k = Math.sin(clamp(this.stateT / 1.4, 0, 1) * Math.PI);
      Object.assign(target, { bodyPitch: -10 * k, neck: -0.5 * k, head: -35 * k, bodyY: 0.1 * k, tailPitch: -10 * k });
      if (Math.random() < 0.3) this.ctx.fx.shake(0.05, 0.1);
    } else if (this.state === 'fressen') { // [L] head down, tearing at the carcass
      Object.assign(target, { neck: 0.55, head: 30 + Math.sin(this.time * 6) * 9, bodyPitch: 10, bodyY: -0.15, tailYaw: Math.sin(this.time * 2) * 10 });
      if (Math.random() < dt * 2.5) { this.nodes.head?.getWorldPosition(_v2); this.ctx.fx.spark(_v2, 1, '#b04040', 1); }
    } else if (this.stunT > 0) { // BETAEUBT: Knie geben nach, Koerper eiert im Kreis, Kopf rollt, Maul haengt offen (+ Sterne-Kranz)
      const w = this.time * 2.4;
      Object.assign(target, {
        bodyY: -0.4, bodyRoll: Math.sin(w) * 14, bodyPitch: 8 + Math.cos(w) * 6, neck: 0.4, head: 40 + Math.sin(w + 1) * 14, headYaw: Math.cos(w) * 35,
        jaw: 25, tailPitch: -16, tailYaw: Math.sin(w * 0.5) * 12, legL: 28 + Math.sin(w) * 8, legR: -22 - Math.sin(w) * 8,
      });
    } else if (this.stagT > 0) {
      Object.assign(target, { bodyPitch: -14, head: -20, bodyY: -0.2, tailYaw: Math.sin(this.time * 30) * 6 });
    } else if (this.trapped) { // FALLE: klebt fest, zerrt mit dem ganzen Koerper, reisst den Kopf hin und her, Beine strampeln
      const w = this.time;
      Object.assign(target, {
        bodyPitch: 6 + Math.sin(w * 7) * 4, bodyY: -0.2, bodyRoll: Math.sin(w * 11) * 8, head: 10 + Math.sin(w * 7) * 18, headYaw: Math.sin(w * 5.3) * 38, neck: -0.1,
        jaw: 12 + Math.max(0, Math.sin(w * 7)) * 20, legL: Math.sin(w * 16) * 32, legR: -Math.sin(w * 16) * 32, tailYaw: Math.sin(w * 9) * 26, tailPitch: -8,
      });
    } else if (this.blind) { // GEBLENDET: weicht zurueck, Kopf peitscht suchend, schnappt ins Leere
      const w = this.time;
      Object.assign(target, {
        bodyPitch: -8, bodyRoll: Math.sin(w * 2.6) * 9, bodyY: Math.sin(w * 5.2) * 0.04, neck: -0.2, head: -12 + Math.sin(w * 5) * 22, headYaw: Math.sin(w * 3.3) * 50,
        jaw: Math.max(0, Math.sin(w * 4)) * 30, legL: Math.sin(w * 3) * 22, legR: -Math.sin(w * 3) * 22, tailYaw: Math.sin(w * 2) * 16,
      });
      if (Math.random() < dt * 8) { this.nodes.head?.getWorldPosition(_v2); this.ctx.fx.spark(_v2, 1, '#ffffff', 1.4); }
    } else if (this.tired) { // ERSCHOEPFT: haengt durch, Kopf fast am Boden, Flanken pumpen, Maul offen, Schwanz schleift (+ Atemwolken)
      const br = Math.sin(this.time * 6.5);
      this._breath = br;
      Object.assign(target, {
        bodyY: -0.5 + br * 0.08, bodyPitch: 12 + br * 3, neck: 0.55, head: 40 + br * 7, headYaw: Math.sin(this.time * 0.9) * 8,
        jaw: 20 + br * 10, tailPitch: -22, tailYaw: Math.sin(this.time * 0.7) * 4, legL: 18, legR: -14,
      });
    } else {
      this.gait += spd * dt * (0.8 / Math.max(0.8, this.def.scale * 0.6));
      const s = clamp(spd / (this.def.run || 6), 0, 1.2);
      const rusty = this.st.rustT > 0;
      const g4 = rusty ? Math.round(this.gait * 4 * 1.6) / 1.6 : this.gait * 4; // ROST: Gelenke klemmen -> abgehackter Gang
      const sw = Math.sin(g4) * 45 * s;
      target.legL = sw; target.legR = -sw;
      target.bodyY = -Math.abs(Math.cos(g4)) * 0.08 * s + Math.sin(this.time * 2) * 0.02;
      target.tailYaw = Math.sin(g4) * 8 * s + Math.sin(this.time * 1.3) * 3;
      target.head = Math.sin(this.time * 1.7) * 3;
      // A species may supply its base gait; shared injuries/status reactions
      // still layer on top, and feeding/death/CC keep their dedicated branches.
      this.def.locomotionPose?.(this, target);
      if (this.limping) {
        // hobbling: one side weak, body sags, head hangs low, drool
        target.bodyPitch = 6; target.head += 14; target.neck += 0.1;
        target.legL = sw * 0.35 - 10; target.bodyRoll = Math.sin(g4) * 5 * s; target.bodyY -= 0.12;
        if (Math.random() < dt * 2) { this.nodes.head?.getWorldPosition(_v2); this.ctx.fx.spark({ x: _v2.x, y: _v2.y - 0.3, z: _v2.z }, 1, '#9a4040', 0.6); }
      }
      if (rusty) { // ROST: steifer Nacken, ab und zu ein ruckartiges Klemmen
        target.neck -= 0.1; target.tailYaw *= 0.4;
        if ((this.time % 1.7) < 0.12) { target.headYaw += 18; target.bodyRoll += 6; }
      }
      if (this.st.scaldT > 0) { // VERBRUEHT: Haut zuckt, Koerper schuettelt sich (+ Dampf)
        target.bodyRoll += Math.sin(this.time * 37) * 3; target.bodyY += Math.sin(this.time * 29) * 0.03; target.tailYaw += Math.sin(this.time * 23) * 10;
      }
      if (this.poisoned) { // GIFT: wuergt alle ~2 s, Kopf sackt, Maul auf (+ Blasen)
        const ph = this.time % 2.2;
        if (ph < 0.6) { const k = Math.sin((ph / 0.6) * Math.PI); target.neck += 0.35 * k; target.head += 28 * k; target.jaw += 30 * k; target.bodyPitch += 6 * k; }
      }
      if (this.st.stink > 0) { // GESTANK: schuettelt angeekelt den Kopf, Nase weg vom Geruch
        target.headYaw += Math.sin(this.time * 22) * 28; target.head -= 12; target.neck -= 0.15;
      }
    }
    this.def.poseHook?.(this, target);
    const k = 1 - Math.exp(-(this.attack ? 40 : 10) * dt);
    for (const key in target) p[key] += (target[key] - p[key]) * k;
    this.rigApply(p);
    this._stamp++; // hurtbox caches are stale now

    // flash: telegraph red/white blink, hit flash white, dann Status-Farbe (mehrere aktiv -> reihum, je ~0,7 s)
    const blink = Math.floor(this.time * 10) % 2 === 0;
    const gs = this.def.glitchSpots;
    const tint = this._statusTint();
    const glow = this.def.glow?.(this) ?? null;
    for (const part of this.parts) {
      if (part.gone) continue;
      const spot = !!gs && gs.includes(part.id);
      let r = 0, g = 0, b = 0;
      if (tele && tele.includes(part.id)) { if (this.mm?.hideColorCues) { /* nur Ton */ } else if (blink) { r = 0.9; g = 0.9; b = 0.9; } else { r = 0.9; g = 0.05; b = 0.05; } }
      else if (this.hitFlash > 0) { r = g = b = 0.45; }
      else if (glow) { r = glow[0]; g = glow[1]; b = glow[2]; } // def.glow(m) -> [r,g,b] | null: Dauerleuchten (Mampfaffe-Futterbuff), schlaegt Status-Farbe
      else if (spot && !part.broken && (this.time + (this.id?.length ?? 0) * 0.37) % GL_CYCLE < GL_PULSE) { const c = Math.floor(this.time * 20) % 2 ? GL_CYAN : GL_MAGENTA, k = 0.55 + 0.45 * Math.sin(this.time * 18); r = c[0] * k; g = c[1] * k; b = c[2] * k; } // Owner-Feedback Okt 2026: nur kurzer Puls alle ~3,6 s statt Dauerflackern
      else if (tint) { r = tint[0]; g = tint[1]; b = tint[2]; }
      if (spot && !part.broken && part.breakHp) { // gelegentlicher Positions-Jitter der Teil-Materialien
        const js = Math.floor(this.time * 12), jit = js % 7 === 0 ? 0.07 : clamp(1 - part.hp / part.breakHp, 0, 1) * (part.jitter ?? 0.05);
        for (const m of part.mats) if (m.userData?.ps1?.uJit) m.userData.ps1.uJit.value = jit;
      }
      for (const m of part.mats) m.emissive?.setRGB(r, g, b);
    }
    this.sync();
    this._statusFx(dt);
  }

  /** Status-Farbsprache (emissive): jeder Zustand eigener Farbton + eigener Rhythmus. Mehrere aktiv -> reihum. */
  _statusTint() {
    const t = this.time, L = this._tints ?? (this._tints = []);
    L.length = 0;
    if (this.rage) L.push(TINT.rage);
    if (this.stunT > 0) L.push(TINT.stun);
    if (this.trapped) L.push(TINT.trap);
    if (this.blind) L.push(TINT.blind);
    if (this.tired) L.push(TINT.tired);
    if (this.poisoned) L.push(TINT.poison);
    if (this.st.rustT > 0) L.push(TINT.rust);
    if (this.st.scaldT > 0) L.push(TINT.scald);
    if (this.st.stink > 0) L.push(TINT.stink);
    if (!L.length) return null;
    const c = L[Math.floor(t / TINT_SLOT) % L.length];
    const k = c.pulse(t, this);
    const out = this._tintOut ?? (this._tintOut = [0, 0, 0]);
    out[0] = c.rgb[0] * k; out[1] = c.rgb[1] * k; out[2] = c.rgb[2] * k;
    return out;
  }

  /** Koerper-Requisiten (Sterne, Atem, Dampf, Blasen ...), nur grosse Brocken. */
  _statusFx(dt) {
    if (this.minor) return;
    if (!this.alive) { this._sfx?.hideAll(); return; }
    const on = { stun: this.stunT > 0, tired: this.tired && !this.attack, breath: this._breath ?? 0, scald: this.st.scaldT > 0, poison: this.poisoned, stink: this.st.stink > 0, rust: this.st.rustT > 0 };
    if (!this._sfx) {
      if (!(on.stun || on.tired || on.scald || on.poison || on.stink || on.rust)) return;
      this._sfx = new StatusFx(this);
    }
    this._sfx.update(dt, on);
  }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.rot;
    const gy = this.ctx.world.heightAt(this.pos.x, this.pos.z);
    this.shadow.position.set(this.pos.x, gy + 0.05, this.pos.z);
    this.shadow.scale.setScalar(this.def.bodyRadius * 3.2 * (1 - Math.min(0.45, this.air * 0.05)));
    this.mesh.updateMatrixWorld(true);
  }

  snapshot() {
    return {
      id: this.id, def: this.def.id, pos: [this.pos.x, this.pos.y, this.pos.z], rot: this.rot, state: this.state,
      hpPct: this.hp / this.maxHp, rage: this.rage, air: this.air, phase: this.phase,
      parts: this.parts.map((p) => ({ id: p.id, hp: p.hp, broken: p.broken })),
      flags: { blind: this.blind, trap: this.trapped, poison: this.poisoned, stun: this.stunT > 0, tired: this.tired, rust: this.st.rustT > 0, scald: this.st.scaldT > 0, ...(this.def.snapExtra?.(this) ?? {}) },
    };
  }
}
