import * as THREE from 'three';
import { clamp, damp, dampAngle, angleDiff, stepAngle, yawOf, localToWorld, wrapAngle } from '../core/math.js';
import { consumeHitstop, time } from '../core/time.js';
import { WeaponState } from './weapons/weapon.js';
import { getWeapon } from './weapons/index.js';
import { weaponStats } from '../data/weapons.js';
import { capsule, sphere, overlap, playerCapsule } from './hitbox.js';
import {
  createVitals, damageVitals, tickPrellung, tickStamina, spendStamina, canRoll, canSprint,
  rollPhase, rollSpeed, ROLL, VIT, HIT_REACTION,
} from './vitals.js';
import { protectReduction } from './combat.js';
import { slimeBlast, SLIME_R, SLIME_DMG } from './effects.js'; // Krachfaust: Glitch-Schleim am Pirscher
import { initGlitch, tickGlitch, activateGlitch, glitchVisual, glitchDmgMul } from './glitch.js';
import { blockedInput, rollBlockReason } from './inputFeedback.js';
import { REST, sampleTrack, mirrorPose } from './anim.js';
import { buildHunterRig } from './rig.js';
import { stepLock } from '../input/lock.js';
import { makeGear } from '../data/gearlook.js'; // [G]
import { tickBuffs, clearBuffs, speedMul as buffSpeed, noFlinch } from './buffs.js'; // [KK] Krachkiste-Buffs
import { itemDamageMul, inRuneAnchor } from './itemBuffs.js';

const D2R = Math.PI / 180;
const WALK = 4, RUN = 6, SPRINT = 8.5;
const AIM_ASSIST = 35 * D2R;
const GLITCH_WINDOW = 1.5;
const _a = { x: 0, y: 0, z: 0 }, _b = { x: 0, y: 0, z: 0 };

/**
 * Pirscher entity. `ctx` is the hunt context: { world, monsters, fx, bus, rng, input, cameraYaw, playerHit(), respawn() ... }.
 * States: free | roll | flinch | down | pinned | ko
 */
export class Player {
  constructor({ id = 'p1', name = 'Pirscher', weapon = 'gs', tier = 1, branch = null, gear = null, local = true, ctx }) {
    this.id = id;
    this.type = 'player';
    this.name = name;
    this.local = local;
    this.ctx = ctx;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.rot = 0;
    this.radius = 0.4;
    this.v = createVitals();
    this.protect = 5; // Lumpen
    this.state = 'free';
    this.stateT = 0;
    this.hitstop = 0;
    this.time = 0;
    this.god = false;
    this.koCount = 0;
    this.invuln = 0;
    this.glitchT = 0;
    this.glitchCd = 0;
    initGlitch(this); // Glitch-Modus: this.glitch = {energy, active, t}
    this.perfectKeys = new Set();
    this.rollT = 0;
    this.rollDir = { x: 0, z: 1 };
    this.rollStart = { x: 0, y: 0, z: 0 };
    this.rollFree = false;
    this.rollCfg = null;
    this.rollBuf = 0;
    this.sinceRoll = 99;
    this.fullPushT = 0;
    this.sprinting = false;
    this.gait = 0;
    this.speed = 0;
    this.lock = null; // { monster, idx }
    this.flinkfuss = 0; // Macke level (0..2)
    this.flash = 0;
    this.status = {}; // [M] mud / burn / poison: { t, rollsLeft }
    this.buffs = {}; // [KK] Krachkiste-Buffs { r|b|g: {lvl, t} } (buffs.js)
    this.pushT = 0; this.pushV = { x: 0, z: 0 }; // [M] wind push
    this._dotAcc = 0;

    this.gear = makeGear({ ...(gear ?? {}), weapon: gear?.weapon ?? { type: weapon, tier, branch } }); // [G] what the rig shows
    this.setWeapon(weapon, tier, branch);
    this.pose = { ...REST };
    this.mesh = this.rig.root;
    this.lastState = 'free';
  }

  // ---- derived
  get hp() { return this.v.hp; }
  get maxHp() { return this.v.maxHp; }
  get stamina() { return this.v.stamina; }
  get alive() { return this.state !== 'ko'; }
  /** Glitch-Modus aktiv? (Waffen-Glitches / HUD) */
  get glitching() { return !!this.glitch?.active; }
  /** Grundbonus im Glitch-Modus (x1,3), von hunt.playerHit in dmgMul eingerechnet */
  get glitchDmgMul() { return glitchDmgMul(this); }
  get iframeExtend() { return Math.min(2, this.flinkfuss) * ROLL.flinkfussPerLevel; }

  setWeapon(id, tier = 1, branch = null) {
    this.weaponId = id;
    this.def = getWeapon(id);
    this.stats = weaponStats(id, tier, branch);
    this.dmgMul = 1;
    const self = this;
    this.weapon = new WeaponState(this.def, {
      onMoveStart(m, w) { self.#onMoveStart(m, w); },
      takeGlitch() {
        if (self.glitchT <= 0) return false;
        self.glitchT = 0;
        return true;
      },
      player: self, // [W] weapons that need aim / sinceRoll / ctx (bow, dual blades)
      drain: (amt) => spendStamina(this.v, amt),
      exhausted: () => this.v.exhaust > 0,
      onChargeLevel: (lvl) => { this.ctx.bus.emit('sfx', { name: 'charge', pos: this.pos, level: lvl }); this.flash = 0.12; },
    });
    this.weaponMesh = this.def.buildMesh?.({ tier, branch }) ?? null; // [KT]/[G] tier/branch looks
    if (this.gear) this.gear = makeGear({ ...this.gear, weapon: { type: id, tier, branch } });
    if (this.rig) this.rig.swapWeapon(this.weaponMesh);
    else this.rig = buildHunterRig({ weaponMesh: this.weaponMesh, merged: true, gear: this.gear });
    this.anims = this.def.anims;
  }

  /** [KT] rebuild the weapon mesh once the branch is known (applyLoadout) */
  rebuildWeaponMesh(tier, branch) {
    this.weaponMesh = this.def.buildMesh?.({ tier, branch }) ?? null;
    if (this.gear) this.gear = makeGear({ ...this.gear, weapon: { type: this.weaponId ?? this.gear.weapon?.type, tier, branch } });
    this.rig.swapWeapon(this.weaponMesh);
  }

  /** [G] change the shown outfit live (armor per slot + colour); the weapon follows setWeapon(). */
  setGear(gear) {
    this.gear = makeGear({ ...gear, weapon: this.gear.weapon, color: gear?.color ?? this.gear.color });
    this.rig.setGear(this.gear);
  }

  spawnAt(x, z, yaw = 0) {
    this.pos.set(x, this.ctx.world.heightAt(x, z), z);
    this.rot = yaw;
    this.vel.set(0, 0, 0);
  }

  capsule() { return playerCapsule(this.pos, this.radius, 1.7); }
  /**
   * Hurtboxes monsters test against. While a roll is young (<= i-frame start + perfect window + a bit) the
   * roll-start position counts too: "would have hit me if I had stood still" -> reliable perfect dodges.
   */
  hitCapsules() {
    const c = [this.capsule()];
    if (this.state === 'roll' && this.rollT <= ROLL.iStart + ROLL.perfectWindow + 0.03) c.push(playerCapsule(this.rollStart, this.radius, 1.7));
    return c;
  }
  center() { return { x: this.pos.x, y: this.pos.y + 0.9, z: this.pos.z }; }

  // ---- lock-on
  lockPoint() {
    const l = this.lock;
    if (!l) return null;
    if (!l.monster.alive) { this.lock = null; return null; }
    const pts = l.monster.lockPoints();
    return pts.length ? pts[l.idx % pts.length].pos : null;
  }
  #pickLockTarget() {
    let best = null, bd = 1e9;
    const fx = Math.sin(this.rot), fz = Math.cos(this.rot);
    for (const m of this.ctx.monsters) {
      if (!m.alive || m.minor) continue;
      const dx = m.pos.x - this.pos.x, dz = m.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 45) continue;
      const facing = (dx * fx + dz * fz) / (d || 1);
      const score = d * (2 - facing);
      if (score < bd) { bd = score; best = m; }
    }
    return best;
  }
  /** Lock is a toggle (tap on/off); next/prev cycle the part. Runs every step in every state so taps are never lost. */
  #stepLock(input) {
    const b = input.b;
    const wasLocked = !!this.lock;
    this.lock = stepLock(this.lock, {
      toggle: b.lock.pressed, next: !!b.lockNext?.pressed, prev: !!b.lockPrev?.pressed,
      acquire: () => this.#pickLockTarget(),
      valid: (m) => m.alive && Math.hypot(m.pos.x - this.pos.x, m.pos.z - this.pos.z) <= 70,
      parts: (m) => m.lockPoints().length,
    });
    if (b.lock.pressed && !wasLocked && !this.lock) blockedInput(this, 'lock', 'target');
  }

  // ---- hit reception
  /**
   * @param h {dmg, knock:'none'|'flinch'|'down'|'pin', sourcePos, key, extra}
   * @returns 'hit'|'block'|'iframe'|'perfect'|'ignored'
   */
  takeHit(h) {
    if (this.state === 'ko') return 'ignored';
    this.lastHit = h.attackId ? { attackId: h.attackId, monsterId: h.monster?.def?.id ?? null, time: (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000 } : null; // Tod-Log
    const rp = this.state === 'roll' ? rollPhase(this.rollT, this.iframeExtend) : null;
    if (rp?.invuln) {
      if (rp.phase === 'perfect' && !h.noPerfect && !this.perfectKeys.has(h.key) && this.glitchCd <= 0) { // noPerfect: Krachfaust-Urknall (nur Deckung hilft)
        this.perfectKeys.add(h.key);
        this.#glitchCounter();
        return 'perfect';
      }
      return 'iframe';
    }
    if (this.invuln > 0) return 'iframe';
    const w = this.weapon;
    // [M] wind push (Fluegelboee): no damage, interrupts charging, ignores block / armour
    if (h.knock === 'push') {
      if (this.windImmune || inRuneAnchor(this)) return 'ignored';
      const dx = this.pos.x - (h.sourcePos?.x ?? this.pos.x), dz = this.pos.z - (h.sourcePos?.z ?? this.pos.z), l = Math.hypot(dx, dz) || 1;
      this.push({ x: dx / l, z: dz / l }, h.push ?? 3);
      w.cancel();
      this.ctx.fx.shake(0.12, 0.2);
      this.ctx.bus.emit('sfx', { name: 'swing', pos: this.pos, heavy: true });
      return 'hit';
    }
    // [KT] Konterhaltung (katana): a monster hit inside the counter window is negated and answered with a Konterschnitt
    const ctr = w.def.counter;
    if (ctr && (h.monster || h.attackId) && ctr.active(w)) {
      const sp = h.sourcePos;
      if (!sp || Math.abs(angleDiff(this.rot, yawOf(sp.x - this.pos.x, sp.z - this.pos.z))) <= ctr.arc * D2R) return this.#counter(h, ctr);
    }
    const sa = w.superArmor();
    let dmg = h.dmgPct ? this.v.maxHp * h.dmgPct : h.dmg * (1 - protectReduction(this.protect * (this.status.rost ? 0.7 : 1))) * (h.dmgMul ?? 1); // Rost: Schutz -30 %; dmgPct: Anteil der Max-LP (Krachfaust-Urknall: ignoriert Schutz und Block)
    if (!h.dmgPct) dmg *= itemDamageMul(this, h);

    const blk = w.blockDef();
    if (blk && h.sourcePos && !h.dmgPct) {
      const dx = h.sourcePos.x - this.pos.x, dz = h.sourcePos.z - this.pos.z;
      const diff = Math.abs(angleDiff(this.rot, yawOf(dx, dz)));
      if (diff <= blk.arc * D2R && this.v.exhaust <= 0) {
        spendStamina(this.v, dmg * blk.staminaMul * (this.guardStamMul ?? 1));
        w.addWucht(blk.wucht);
        dmg *= blk.pass;
        if (!this.god) damageVitals(this.v, dmg);
        this.ctx.fx.number(this.#top(), Math.round(dmg), 'hurt');
        this.ctx.fx.spark(this.#front(), 6, '#9fd8ff', 3);
        this.ctx.bus.emit('sfx', { name: 'block', pos: this.pos });
        this.ctx.bus.emit('playerBlock', { player: this, key: h.key });
        this.ctx.fx.shake(0.1, 0.12);
        if (this.v.hp <= 0 && !this.god) this.#ko();
        return 'block';
      }
    }
    if (this.god) {
      this.ctx.fx.number(this.#top(), 'god', 'heal');
    } else {
      damageVitals(this.v, dmg);
      if (dmg > 0) this.ctx.fx.number(this.#top(), Math.round(dmg), 'hurt');
    }
    this.ctx.fx.shake(dmg > 0 ? 0.22 : 0.1, 0.2);
    this.ctx.fx.flash();
    this.ctx.bus.emit('sfx', { name: 'hurt', pos: this.pos });
    this.ctx.bus.emit('playerHit', { player: this, dmg, key: h.key });
    if (this.v.hp <= 0) { this.#ko(); return 'hit'; }
    if (h.status) this.addStatus(h.status.type, h.status); // [M]

    const knock = h.knock ?? 'flinch';
    if (sa === 'all') return 'hit';
    if (knock === 'pin') { this.#enter('pinned'); w.cancel(); return 'hit'; }
    if (knock === 'down') { this.#enter('down'); w.cancel(); this.#push(h, 3); return 'hit'; }
    if (knock === 'flinch' && sa !== 'flinch' && !noFlinch(this) && !inRuneAnchor(this)) { this.#enter('flinch'); w.cancel(); this.#push(h, 1); } // [KK] Blau: kein Zurückstolpern bei leichten Treffern
    return 'hit';
  }
  /** [KT] returns 'block' so monsters / projectiles mark the hit as consumed. */
  #counter(h, ctr) {
    const w = this.weapon, sp = h.sourcePos;
    if (sp) this.rot = yawOf(sp.x - this.pos.x, sp.z - this.pos.z);
    this.invuln = Math.max(this.invuln, ctr.invuln ?? 0.35);
    ctr.onCounter(w, h, this);
    this.hitstop = Math.max(this.hitstop, 0.09);
    this.ctx.fx.number(this.#top(), 'Konter!', 'weak');
    this.ctx.fx.spark(this.#front(), 12, '#ffe14d', 5);
    this.ctx.fx.shake(0.16, 0.18);
    this.ctx.bus.emit('sfx', { name: 'block', pos: this.pos });
    this.ctx.bus.emit('counter', { player: this, key: h.key });
    return 'block';
  }
  #push(h, d) {
    if (!h.sourcePos) return;
    const dx = this.pos.x - h.sourcePos.x, dz = this.pos.z - h.sourcePos.z, l = Math.hypot(dx, dz) || 1;
    this.vel.x += (dx / l) * d * 4; this.vel.z += (dz / l) * d * 4;
  }
  // ---- [M] status effects (docs/PHASE2_CONTRACTS.md): mud (slower, no sprint), burn (3 dmg/s), poison (dmg over time)
  /** Push the player `dist` metres along `dir` (unit {x,z}) over ~0.3 s. Does not cancel by itself. */
  push(dir, dist = 3, dur = 0.3) {
    this.pushV.x = dir.x * dist / dur; this.pushV.z = dir.z * dist / dur;
    this.pushT = dur;
  }
  /** type: 'mud' | 'burn' | 'poison'; opts {t, rolls}. */
  addStatus(type, opts = {}) {
    if (this.state === 'ko') return false;
    const base = { mud: { t: 25, rollsLeft: 3 }, burn: { t: 10, rollsLeft: 3 }, poison: { t: 12, rollsLeft: 0 }, rost: { t: 20, rollsLeft: 0 }, blend: { t: 2, rollsLeft: 0 }, verwirrt: { t: 3, rollsLeft: 0 }, itemlock: { t: 1, rollsLeft: 0 }, schleim: { t: 2, rollsLeft: 1 } }[type];
    if (!base) return false;
    const had = !!this.status[type];
    if (type === 'blend') return this.#blind(opts, had);
    if (type === 'verwirrt') { // Mampfaffe/Glitchpilz: Steuerung verkehrt (nur der lokale Pirscher sieht das Overlay); erneute Treffer frischen nur auf
      this.status.verwirrt = { t: Math.max(opts.t ?? base.t, this.status.verwirrt?.t ?? 0), rollsLeft: 0 };
      if (!had) { this.ctx.bus.emit('playerStatus', { player: this, type, on: true }); if (this.local) this.ctx.bus.emit('sfx', { name: 'confuse', pos: this.pos }); }
      if (this.local) this.ctx.fx?.confuse?.(this.status.verwirrt.t);
      return true;
    }
    if (type === 'itemlock') { // Mampfaffe/Giftkraut-Stinkwolke: Items gesperrt, solange man drinsteht (+ kurzer Nachhall)
      this.status.itemlock = { t: Math.max(opts.t ?? base.t, this.status.itemlock?.t ?? 0), rollsLeft: 0 };
      if (!had) this.ctx.bus.emit('playerStatus', { player: this, type, on: true });
      return true;
    }
    if (type === 'schleim' && had) return true; // Krachfaust: laufende Zündschnur wird nicht verlängert
    this.status[type] = { t: opts.t ?? base.t, rollsLeft: opts.rolls ?? base.rollsLeft, ...(opts.dps ? { dps: Math.max(opts.dps, this.status[type]?.dps ?? 0) } : {}) }; // dps: stärkerer Brand (Pyrostur-Glutbrand)
    if (type === 'schleim' && this.local) { this.ctx.fx?.number?.(this.#top(), 'SCHLEIM! ROLLEN!', 'kf-pulse'); this.ctx.bus.emit('sfx', { name: 'slimeSplat', pos: this.pos }); }
    if (!had) this.ctx.bus.emit('playerStatus', { player: this, type, on: true });
    return true;
  }
  /**
   * Geblendet (Blendax-Blitz): Phase 1 = `white` s Vollbild weiss (steuerbar), Phase 2 = `stun` s Betaeubt (Sterne, wie Festhalten).
   * Macke Blendschutz kuerzt beides (game/loadout.js reicht white/stun durch).
   */
  #blind(opts, had) {
    const white = Math.max(0, opts.white ?? 1), stun = Math.max(0, opts.stun ?? 1);
    this.status.blend = { t: white + stun, rollsLeft: 0, white, stun, stunned: false };
    if (!had) this.ctx.bus.emit('playerStatus', { player: this, type: 'blend', on: true });
    if (this.local && white > 0) {
      this.ctx.fx?.whiteout?.(white, { staticTail: Math.min(0.2, white) });
      this.ctx.bus.emit('sfx', { name: 'whiteStatic', pos: this.pos });
    }
    return true;
  }
  #endBlend() {
    this.ctx.fx?.clearWhiteout?.();
    if (this.stars) this.stars.visible = false;
    if (this._blendPin && this.state === 'pinned') this.#enter('free');
    this._blendPin = false;
  }
  /** Schleim abgelaufen: Explosion r 3,4 m, ueber spawnEffect an alle Clients gespiegelt (jeder trifft seine lokalen Pirscher), sonst lokal. */
  #slimeBoom(at) {
    const p = { pos: at, r: SLIME_R, dmg: SLIME_DMG };
    if (this.ctx.spawnEffect) this.ctx.spawnEffect('schleimblast', p); else slimeBlast(this.ctx, at, p);
  }
  /** Klötzchen-Cluster auf dem Pirscher, pulst im Takt der Zuendschnur (Farbstufen wie die Bodenpfuetzen). */
  #tickSlime(on, left = 2, dt = 0) {
    if (!on) { if (this.slimeGrp) this.slimeGrp.visible = false; return; }
    if (!this.slimeGrp) {
      this.slimeGrp = new THREE.Group();
      this.slimeMat = new THREE.MeshBasicMaterial({ color: '#1f9d0f', fog: false });
      const g = new THREE.BoxGeometry(0.28, 0.28, 0.28);
      [[0.3, 1.0, 0.1], [-0.28, 0.7, 0.2], [0.1, 1.5, -0.25], [-0.2, 1.25, -0.2], [0.0, 0.5, 0.3], [0.32, 0.55, -0.15]].forEach(([x, y, z], i) => {
        const m = new THREE.Mesh(g, this.slimeMat); m.position.set(x, y, z); m.rotation.set(i, i * 2, 0); m.scale.setScalar(0.8 + (i % 3) * 0.3); this.slimeGrp.add(m);
      });
      this.mesh.add(this.slimeGrp);
    }
    const stage = left > 1 ? 0 : left > 0.4 ? 1 : 2, hz = [2, 5, 12][stage], ph = Math.floor(left * hz * 2) % 2;
    this.slimeGrp.visible = true;
    this.slimeMat.color.set([['#1f9d0f', '#39ff14'], ['#39ff14', '#d8ffd0'], ['#d8ffd0', '#ffffff']][stage][ph]);
    this.slimeGrp.scale.setScalar(1 + (ph ? 0.35 : 0) * (stage + 1) / 2);
    const tick = Math.floor(left * hz);
    if (this.local && tick !== this._slimeTick) { this._slimeTick = tick; this.ctx.bus.emit('sfx', { name: 'slimePulse', pos: this.pos, pitch: [1, 1.3, 1.7][stage] }); }
  }
  /** Sterne-Kranz ueber dem Kopf (4 gelbe Oktaeder), nur sichtbar waehrend Phase 2 von Geblendet. */
  #tickStars(on) {
    if (!on) { if (this.stars) this.stars.visible = false; return; }
    if (!this.stars) {
      const g = new THREE.OctahedronGeometry(0.16, 0); g.scale(1, 1, 0.35);
      const mat = new THREE.MeshBasicMaterial({ color: '#ffe14d', fog: false });
      this.stars = new THREE.Group();
      for (let i = 0; i < 4; i++) this.stars.add(new THREE.Mesh(g, mat));
      this.stars.position.y = 2.15;
      this.mesh.add(this.stars);
    }
    this.stars.visible = true;
    const a = this.time * 5;
    this.stars.children.forEach((c, i) => { const r = a + i * Math.PI / 2; c.position.set(Math.cos(r) * 0.42, Math.sin(a * 2 + i) * 0.05, Math.sin(r) * 0.42); c.rotation.y = r; });
  }
  /** Phase-3-Vertrag: player.applyStatus('rost') (Schutz -30 % fuer 20 s). */
  applyStatus(type, opts = {}) { return this.addStatus(type, opts); }
  get rusted() { return !!this.status.rost; }
  /** Remove one status (or all when no type given), e.g. Sprudelwasser. */
  clearStatus(type) {
    for (const k of Object.keys(this.status)) {
      if (type && k !== type) continue;
      delete this.status[k];
      if (k === 'blend') this.#endBlend();
      if (k === 'verwirrt') this.ctx.fx?.clearConfuse?.();
      if (k === 'schleim') this.#tickSlime(false);
      this.ctx.bus.emit('playerStatus', { player: this, type: k, on: false });
    }
  }
  #statusOnRoll() {
    for (const k of ['mud', 'burn', 'schleim']) {
      const s = this.status[k];
      if (!s) continue;
      if (--s.rollsLeft <= 0) {
        this.clearStatus(k);
        this.ctx.fx.number(this.#top(), k === 'burn' ? 'Gelöscht' : 'Abgeschüttelt', 'heal');
        if (k === 'schleim') { this.ctx.fx.spark?.({ x: this.pos.x, y: this.pos.y + 0.4, z: this.pos.z }, 22, '#39ff14', 5); this.ctx.fx.spark?.({ x: this.pos.x, y: this.pos.y + 0.4, z: this.pos.z }, 8, '#d8ffd0', 4); this.ctx.bus.emit('sfx', { name: 'slimeSplat', pos: this.pos }); } // Klatsch daneben, harmlos
      }
    }
  }
  #tickStatus(dt) {
    const st = this.status;
    this.v.rust = st.rost ? st.rost.t : 0;
    if (!st.mud && !st.burn && !st.poison && !st.rost && !st.blend && !st.verwirrt && !st.itemlock && !st.schleim) return;
    const fx = this.ctx.fx;
    if (st.verwirrt) { if ((st.verwirrt.t -= dt) <= 0) this.clearStatus('verwirrt'); else if (Math.random() < dt * 9) fx.spark({ x: this.pos.x + (Math.random() - 0.5) * 0.8, y: this.pos.y + 1.0 + Math.random() * 1.2, z: this.pos.z + (Math.random() - 0.5) * 0.8 }, 1, Math.random() < 0.5 ? '#39ff14' : '#d8ffd0', 1.2); }
    if (st.itemlock && (st.itemlock.t -= dt) <= 0) this.clearStatus('itemlock');
    if (st.schleim) { // Krachfaust: Zuendschnur mit Puls dunkelgruen -> hellgruen -> weissgruen, am Ende Explosion am Pirscher (trifft auch Mit-Pirscher)
      const s = st.schleim;
      s.t -= dt;
      if (s.t <= 0) { const at = { x: this.pos.x, y: this.pos.y, z: this.pos.z }; this.clearStatus('schleim'); this.#slimeBoom(at); }
      else this.#tickSlime(true, s.t, dt);
    }
    if (st.blend) {
      const b = st.blend;
      b.t -= dt;
      if (b.t <= 0) this.clearStatus('blend');
      else if (!b.stunned && b.t <= b.stun) { // Phase 2: Betaeubt (Sterne). Nur aus ruhigen Zustaenden; wer schon am Boden liegt, bekommt keine Extra-Pause
        b.stunned = true;
        if (b.stun > 0 && (this.state === 'free' || this.state === 'roll' || this.state === 'flinch')) { this.weapon.cancel(); this.#enter('pinned'); this._blendPin = true; }
      }
      this.#tickStars(!!st.blend && st.blend.stunned && st.blend.stun > 0);
    }
    if (st.rost && (st.rost.t -= dt) <= 0) this.clearStatus('rost');
    else if (st.rost && Math.random() < dt * 3) fx.spark({ x: this.pos.x, y: this.pos.y + 1.2, z: this.pos.z }, 1, '#c8661e', 1);
    if (st.mud && (st.mud.t -= dt) <= 0) this.clearStatus('mud');
    if (st.burn) {
      if ((st.burn.t -= dt) <= 0) this.clearStatus('burn');
      else { this.#dot((st.burn.dps ?? 3) * dt * (this.itemBuffs?.frost?.t > 0 ? 1 - this.itemBuffs.frost.reduction : 1)); if (Math.random() < dt * 10) fx.spark({ x: this.pos.x, y: this.pos.y + 1.6, z: this.pos.z }, 1, Math.random() < 0.5 ? '#ff7a1a' : '#ffd060', 1.5); }
    }
    if (st.poison) {
      if ((st.poison.t -= dt) <= 0) this.clearStatus('poison');
      else { this.#dot(1.5 * dt); if (Math.random() < dt * 4) fx.spark({ x: this.pos.x, y: this.pos.y + 1.6, z: this.pos.z }, 1, '#9be15a', 1); }
    }
    if (st.mud && Math.random() < dt * 3) fx.spark({ x: this.pos.x, y: this.pos.y + 0.5, z: this.pos.z }, 1, '#6a4a28', 1);
  }
  /** Burn / poison damage: never lethal (leaves 1 HP), shows a number about once a second. */
  #dot(n) {
    if (this.god || this.state === 'ko') return;
    const d = Math.min(n, this.v.hp - 1);
    if (d <= 0) return;
    damageVitals(this.v, d);
    this._dotAcc += d;
    if (this._dotAcc >= 3) { this.ctx.fx.number(this.#top(), Math.round(this._dotAcc), 'hurt'); this._dotAcc = 0; }
  }

  #top() { return { x: this.pos.x, y: this.pos.y + 2.0, z: this.pos.z }; }
  #front() { return { x: this.pos.x + Math.sin(this.rot) * 0.6, y: this.pos.y + 1.2, z: this.pos.z + Math.cos(this.rot) * 0.6 }; }

  #glitchCounter() {
    this.glitchT = GLITCH_WINDOW;
    this.glitchCd = 0.5;
    if (!this.ctx.net) time.slowmo(0.35, 0.25); // [N] no slow-mo in coop (would slow the host's whole sim)
    this.ctx.fx.glitch(0.35);
    this.ctx.fx.number(this.#top(), 'GLITCH!', 'glitch');
    this.ctx.bus.emit('sfx', { name: 'glitch', pos: this.pos });
    this.ctx.bus.emit('glitchCounter', { player: this });
  }

  #ko() {
    this.state = 'ko';
    this.stateT = 0;
    this.weapon.cancel();
    this.v.hp = 0;
    this.koCount++;
    this.ctx.bus.emit('playerDown', { player: this, lastHit: this.lastHit ?? null, time: (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000 });
    this.ctx.bus.emit('sfx', { name: 'ko', pos: this.pos });
  }

  respawn(x, z) {
    this.v.hp = this.v.maxHp; this.v.bruise = 0; this.v.stamina = this.v.maxStamina; this.v.exhaust = 0;
    this.clearStatus(); // [M]
    clearBuffs(this); // [KK]
    this.state = 'free'; this.stateT = 0; this.invuln = 2.0; this.lock = null;
    this.weapon.reset(); this.weapon.wucht = 0;
    this.spawnAt(x, z, this.rot);
  }

  #enter(s) { this.state = s; this.stateT = 0; }

  // ---- moves
  #onMoveStart(m, w) {
    this.ctx.bus.emit('weaponMove', { player: this, moveId: m.id });
    // aim assist (max 35 degrees toward lock target) or snap to stick direction
    const lp = this.lockPoint();
    if (lp) {
      const diff = angleDiff(this.rot, yawOf(lp.x - this.pos.x, lp.z - this.pos.z));
      this.rot = wrapAngle(this.rot + clamp(diff, -AIM_ASSIST, AIM_ASSIST));
    } else if (this.#moveDir()) {
      const d = this.#moveDir();
      this.rot = yawOf(d.x, d.z);
    }
    if (m.kind !== 'charge' && m.kind !== 'hold') this.ctx.bus.emit('sfx', { name: 'swing', pos: this.pos, heavy: (m.hits?.[0]?.mv ?? 0) > 60 });
  }

  #moveDir() {
    const mv = this.ctx.input.move;
    const m = Math.hypot(mv.x, mv.y);
    if (m < 0.15) return null;
    const yaw = this.ctx.cameraYaw ?? 0;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    const inv = this.status.verwirrt ? -1 : 1; // Glitch-Verwirrung: Steuerung verkehrt (auch die Ausweichrolle)
    const x = (fx * mv.y + rx * mv.x) * inv, z = (fz * mv.y + rz * mv.x) * inv;
    const l = Math.hypot(x, z) || 1;
    return { x: x / l, z: z / l, mag: Math.min(1, m) };
  }

  #startRoll(free = false) {
    if (this.local && this.ctx.stats) this.ctx.stats.rolls = (this.ctx.stats.rolls ?? 0) + 1; // Auszeichnung „Rollmops"
    const d = this.#moveDir();
    const lp = this.lockPoint();
    let dir;
    if (d) dir = { x: d.x, z: d.z };
    else if (lp) { const dx = this.pos.x - lp.x, dz = this.pos.z - lp.z, l = Math.hypot(dx, dz) || 1; dir = { x: dx / l, z: dz / l }; }
    else dir = { x: -Math.sin(this.rot), z: -Math.cos(this.rot) };
    this.rollCfg = this.def.rollOverride?.(this.weapon) ?? null; // [W] Rausch dash {duration, dist}
    this.rollGroundMul = this.ctx.world.groundType?.(this.pos.x, this.pos.z) === 'frost' ? 1.08 : 1;
    this.rollDir = dir;
    this.rollStart = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    this.rot = yawOf(dir.x, dir.z);
    this.rollT = 0;
    this.rollFree = free;
    this.perfectKeys.clear();
    this.weapon.cancel();
    this.#statusOnRoll(); // [M]
    if (!free) spendStamina(this.v, VIT.rollCost);
    this.#enter('roll');
    this.rollBuf = 0;
    this.ctx.bus.emit('sfx', { name: 'roll', pos: this.pos });
  }

  // ---- main update
  update(dt) {
    const ctx = this.ctx, input = ctx.input;
    this.lastState = this.state;
    if (this.local) this.#stepLock(input);
    // [B] a roll press landing in a hitstop frame must not be eaten (button edges last exactly one sim step)
    if (this.local && input.b.roll.pressed) this.rollBuf = 0.18;
    if (this.local && input.b.glitch?.pressed) this.glitchBuf = 0.25; // Glitch-Druck im Hitstop-Frame nicht verlieren
    if (consumeHitstop(this, dt)) {
      // [W] keep buffering button edges during hitstop (a press landing in a freeze frame must not be lost: B-hold finishers)
      if (this.state === 'free') this.weapon.feed(dt, { A: input.b.attack, B: input.b.special });
      this.#animate(dt, 0);
      return;
    }
    this.time += dt;
    this.stateT += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.glitchT = Math.max(0, this.glitchT - dt);
    this.glitchCd = Math.max(0, this.glitchCd - dt);
    if (this.local) {
      const hadGlitch = this.glitchBuf > 0;
      if (this.glitchBuf > 0 && this.alive && activateGlitch(this)) this.glitchBuf = 0;
      this.glitchBuf = Math.max(0, (this.glitchBuf ?? 0) - dt);
      if (hadGlitch && !this.glitchBuf && !this.glitch.active) blockedInput(this, 'glitch', 'energy');
      tickGlitch(this, dt);
    }
    this.sinceRoll += dt;
    const hadRoll = this.rollBuf > 0;
    this.rollBuf = Math.max(0, this.rollBuf - dt);
    this.flash = Math.max(0, this.flash - dt);
    if (this.local && input.b.roll.pressed) this.rollBuf = 0.18;
    tickPrellung(this.v, dt);
    tickStamina(this.v, dt);
    tickBuffs(this, dt); // [KK]
    this.#tickStatus(dt); // [M]

    const inp = { A: input.b.attack, B: input.b.special };
    const w = this.weapon;
    let speed = 0;

    switch (this.state) {
      case 'free': speed = this.#updateFree(dt, inp); break;
      case 'roll': this.#updateRoll(dt, inp); break;
      case 'flinch':
        w.feed(dt, inp);
        if (this.stateT >= HIT_REACTION.flinch) this.#enter('free');
        this.#friction(dt);
        break;
      case 'pinned':
        w.feed(dt, inp);
        if (this.stateT >= HIT_REACTION.pin) { this.#enter('free'); this.invuln = Math.max(this.invuln, 0.1); }
        this.#friction(dt);
        break;
      case 'down':
        w.feed(dt, inp);
        if (this.stateT >= HIT_REACTION.downRollAt && this.rollBuf > 0) { this.#startRoll(true); this.invuln = 0; break; }
        if (this.stateT >= HIT_REACTION.down) { this.#enter('free'); this.invuln = HIT_REACTION.getupInvuln; }
        this.#friction(dt);
        break;
      case 'ko':
        if (this.stateT >= 3.0) ctx.respawn(this);
        this.#friction(dt);
        break;
    }
    if (hadRoll && !this.rollBuf && this.state !== 'roll') blockedInput(this, 'roll', rollBlockReason(this));
    this.#integrate(dt);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.#animate(dt, speed);
  }

  #friction(dt) {
    const k = Math.exp(-8 * dt);
    this.vel.x *= k; this.vel.z *= k;
  }

  #updateFree(dt, inp) {
    const ctx = this.ctx, input = ctx.input, w = this.weapon, v = this.v;
    // [P] item use commits the hunter: rooted, no attacks; a roll cancels only once the effect landed (Items sets itemUse)
    if (this.itemUse) {
      if (this.rollBuf > 0 && canRoll(v) && this.itemUse.t >= this.itemUse.cancelAt) { this.itemUse = null; this.#startRoll(); return 0; }
      const kb = Math.exp(-14 * dt);
      this.vel.x *= kb; this.vel.z *= kb;
      this.#processHits();
      return 0;
    }
    // roll (also cancels recoveries after the move's cancel window)
    if (this.rollBuf > 0 && canRoll(v) && w.canRollCancel()) { this.#startRoll(); return 0; }
    w.update(dt, inp);

    const d = this.gatherRoot ? null : this.#moveDir(); // [K] rooted while gathering
    const busy = w.busy;
    let speedTarget = 0, wantYaw = null;
    this.sprinting = false;
    const ground = this.ctx.world.groundType?.(this.pos.x, this.pos.z);
    const mud = ground === 'mud'; // [K] Schlammsenke: -30 % speed, no sprint
    if (d) {
      const full = Math.hypot(input.move.x, input.move.y) >= 0.97;
      this.fullPushT = full ? this.fullPushT + dt : 0;
      const sprintWanted = !busy && !this.status.mud && (input.sprint || this.fullPushT >= 0.4); // [M] mud status: no sprint
      if (sprintWanted && !mud && canSprint(v)) { // [K] mud ground: no sprint
        this.sprinting = true;
        speedTarget = SPRINT;
        spendStamina(v, VIT.sprintCost * dt);
      } else if (d.mag > 0.7 && v.exhaust <= 0) speedTarget = RUN;
      else speedTarget = WALK * clamp(d.mag / 0.7, 0.5, 1);
      if (v.exhaust > 0) speedTarget = Math.min(speedTarget, WALK);
      if (busy) speedTarget = WALK * w.moveSpeedMul() * (d.mag > 0.7 ? 1.4 : 1);
      speedTarget *= (this.def.speedMul?.(w) ?? 1) * buffSpeed(this); // [W] Rausch +15 % // [KK] Tempo-Buff Grün
      if (this.status.mud || mud) speedTarget *= 0.7; // [M] mud status / [K] mud ground (not stacked)
      if (ground === 'frost' && !busy) speedTarget *= 1.06; // crisp footing; no attack-lunge or timing change
      wantYaw = yawOf(d.x, d.z);
    } else this.fullPushT = 0;

    const lp = this.lockPoint();
    let faceYaw = null, turnRate = 14 * w.turnMul();
    if (lp && !this.sprinting) faceYaw = yawOf(lp.x - this.pos.x, lp.z - this.pos.z);
    else if (wantYaw !== null && (!busy || w.turnMul() > 0)) faceYaw = wantYaw;
    if (busy && !lp && wantYaw !== null) faceYaw = wantYaw;
    if (faceYaw !== null) this.rot = stepAngle(this.rot, faceYaw, turnRate * dt);
    if (this.rot > Math.PI * 2 || this.rot < -Math.PI * 2) this.rot = wrapAngle(this.rot);

    let vx = 0, vz = 0;
    if (d && speedTarget > 0) { vx = d.x * speedTarget; vz = d.z * speedTarget; }
    const ls = w.lungeSpeed();
    if (ls > 0) { vx = Math.sin(this.rot) * ls; vz = Math.cos(this.rot) * ls; this.vel.x = vx; this.vel.z = vz; }
    else {
      const acc = 1 - Math.exp(-18 * dt);
      this.vel.x += (vx - this.vel.x) * acc;
      this.vel.z += (vz - this.vel.z) * acc;
    }

    this.#processHits();
    if (this.local) this.#itemInput();
    return speedTarget;
  }

  #itemInput() {
    const b = this.ctx.input.b, c = this.ctx;
    if (b.item.pressed) c.onItem?.(this, 'use');
    if (b.itemNext.pressed) c.onItem?.(this, 'next');
    if (b.itemPrev.pressed) c.onItem?.(this, 'prev');
    const s = c.input.takeSlot();
    if (s >= 0) c.onItem?.(this, 'slot', s);
    if (b.context.pressed) c.onContext?.(this, 'press');
    if (b.context.down) c.onContext?.(this, 'hold');
  }

  #updateRoll(dt, inp) {
    this.rollT += dt;
    this.weapon.feed(dt, inp);
    const rc = this.rollCfg; // [W]
    const s = (rc ? ((2 * rc.dist) / rc.duration) * Math.max(0, 1 - this.rollT / rc.duration) : rollSpeed(this.rollT)) * (this.rollGroundMul ?? 1);
    this.vel.x = this.rollDir.x * s; this.vel.z = this.rollDir.z * s;
    if (this.rollT >= (rc?.duration ?? ROLL.duration)) { this.#enter('free'); this.sinceRoll = 0; this.rollDir = { x: 0, z: 0 }; }
  }

  #integrate(dt) {
    const w = this.ctx.world;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    if (this.pushT > 0) { const s = Math.min(dt, this.pushT); this.pos.x += this.pushV.x * s; this.pos.z += this.pushV.z * s; this.pushT -= dt; } // [M]
    w.collide(this.pos, this.radius);
    for (const m of this.ctx.monsters) {
      if (!m.alive || !m.bodyRadius) continue;
      const dx = this.pos.x - m.pos.x, dz = this.pos.z - m.pos.z, d = Math.hypot(dx, dz), min = m.bodyRadius + this.radius;
      if (d < min && d > 1e-4) { this.pos.x = m.pos.x + (dx / d) * min; this.pos.z = m.pos.z + (dz / d) * min; }
    }
    this.pos.y = w.heightAt(this.pos.x, this.pos.z);
  }

  // ---- outgoing hits
  hitShape(h) {
    if (h.shape === 'sphere') {
      const c = localToWorld(_a, this.pos, this.rot, h.at[0], h.at[1], h.at[2]);
      return sphere(c.x, c.y, c.z, h.radius);
    }
    const a = localToWorld({ x: 0, y: 0, z: 0 }, this.pos, this.rot, h.from[0], h.from[1], h.from[2]);
    const b = localToWorld({ x: 0, y: 0, z: 0 }, this.pos, this.rot, h.to[0], h.to[1], h.to[2]);
    return capsule(a, b, h.radius);
  }

  #processHits() {
    const w = this.weapon, ctx = this.ctx;
    const active = w.activeHits();
    if (!active.length) return;
    for (const ah of active) {
      const shape = this.hitShape(ah.hit);
      ctx.debugShape?.(shape, '#ffe14d');
      for (const m of ctx.monsters) {
        if (!m.alive || !w.canHit(ah.group, m.id, ah.hit)) continue;
        let best = null;
        for (const hp of m.hurtParts()) {
          if (overlap(shape, hp.sphere) && (!best || hp.part.factor > best.part.factor)) best = hp;
        }
        if (!best) continue;
        w.markHit(ah.group, m.id);
        ctx.playerHit(this, m, best, ah);
      }
    }
  }

  /** Called by hunt after a hit resolved: hitstop, Wucht, feedback. */
  afterHit(res, ah, info = null) {
    this.hitstop = Math.max(this.hitstop, res.hitstop);
    let wucht = res.wucht;
    if (ah.glitch && !this.weapon.flags.glitchUsed) { wucht += 25; this.weapon.flags.glitchUsed = true; }
    this.weapon.addWucht(wucht);
    if (info) this.def.onHit?.(this, res, ah, info); // [KK] Waffen-Hook: Krachkiste legt hier das Sample der getroffenen Zone in die Leiste
  }

  // [N] network avatar (local:false): state/pose come from snapshots, no input or physics.
  // remote = { state, rollT, sprint, speed, wp: {name, t, charging, level}|null, air }
  updateRemote(dt) {
    const r = this.remote;
    if (!r) return;
    this.time += dt;
    tickBuffs(this, dt); // [KK] nur Anzeige (Party-HUD)
    this.lastState = this.state;
    if (this.state !== r.state) { this.state = r.state; this.stateT = 0; } else this.stateT += dt;
    if (this.glitch.active && (this.glitch.t -= dt) <= 0) { this.glitch.active = false; this.glitch.t = 0; } // [N] Sicherheitsnetz, falls das Ende-Event fehlt
    this.rollT = r.rollT;
    this.sprinting = r.sprint;
    this.speed = r.speed;
    this.#animate(dt, r.speed);
  }

  // ---- animation
  #animate(dt, speed) {
    const p = this.pose, w = this.weapon;
    const t = {};
    Object.assign(t, REST, this.def.rest); // [W] weapon-specific ready pose
    const wp = this.remote ? this.remote.wp : w.pose(); // [N] remote avatars take the pose from snapshots
    let airY = 0;
    switch (this.state) {
      case 'roll': {
        if (this.rollCfg?.step) { // [LB] Ausfallschritt: aufrecht, kein Purzeln, kurzer Schritt in Eingaberichtung
          const k = this.rollT / this.rollCfg.duration, s = Math.sin(Math.min(1, k) * Math.PI);
          Object.assign(t, { py: -0.1 * s, tx: 14 * s, lrx: 55 * s, rrx: -35 * s, arx: 70, alx: 55, arz: 8, alz: 8, sw: this.def.hand === 'L' ? 100 : 0 });
          break;
        }
        const k = this.rollT / (this.rollCfg?.duration ?? ROLL.duration);
        Object.assign(t, { prx: 360 * Math.min(1, k * 1.05), py: -0.45, tx: 35, lrx: 85, rrx: 85, arx: 70, alx: 70, sw: 120, hx: 20 });
        break;
      }
      case 'flinch': Object.assign(t, { tx: 28, hx: 22, arx: 70, alx: 40, py: -0.05, tz: Math.sin(this.time * 60) * 4 }); break;
      case 'pinned': Object.assign(t, { tx: 14, hx: 12, arx: 165, arz: 25, alx: 165, alz: 25, sw: 20, py: -0.1 }); break;
      case 'down': Object.assign(t, { prx: -86, py: -0.55, arx: 30, alx: 30, arz: 40, alz: 40, lrx: 8, rrx: 8, tx: 0 }); break;
      case 'ko': Object.assign(t, { prx: this.stateT > 0.2 ? -86 : -40, py: -0.55, arx: 30, alx: 30, arz: 40, alz: 40, lrx: 8, rrx: 8 }); break;
      default:
        if (this.itemUse) {
          // [P] drinking / throwing pose
          Object.assign(t, { arx: 105, arz: 20, hx: -12, tx: 10, alx: 30, lrx: 6, rrx: -6, sw: 60, th: 0 });
        } else if (wp && this.anims?.[wp.name]) {
          const tt = wp.charging ? Math.min(wp.t, 0.25) : wp.t;
          sampleTrack(this.anims[wp.name], tt, t);
          if (wp.charging && wp.level) {
            const j = wp.level * 0.4;
            t.tx += (Math.random() - 0.5) * j; t.hy = (Math.random() - 0.5) * j; t.py += (Math.random() - 0.5) * 0.01 * wp.level;
          }
          airY = this.remote ? this.remote.air : w.airOffset();
          if (this.def.walkLegs && speed > 0.4) { // [LB] Beine laufen, Oberkoerper haelt die Zielpose
            this.gait += this.speed * dt * 1.35;
            const sw = Math.sin(this.gait) * 42 * clamp(speed / RUN, 0, 1.2);
            t.lrx = sw; t.rrx = -sw;
            t.py = (t.py ?? 0) - Math.abs(Math.cos(this.gait)) * 0.03;
          }
        } else {
          // locomotion
          const s = clamp(speed / RUN, 0, 1.4);
          this.gait += this.speed * dt * 1.35;
          const sw = Math.sin(this.gait) * 48 * s;
          t.lrx = sw; t.rrx = -sw;
          t.alx = -12 - sw * 0.9;
          t.py = -Math.abs(Math.cos(this.gait)) * 0.06 * s;
          t.tx = 3 + 10 * clamp(speed / SPRINT, 0, 1);
          if (this.sprinting) { t.tx += 8; t.arx = this.def.sprintArx ?? 10; }
          t.tx += Math.sin(this.time * 2.2) * 1.0;
        }
    }
    if (this.def.hand === 'L') mirrorPose(t); // [G] bow: held left, string drawn with the right hand
    const k = 1 - Math.exp(-(this.state === 'roll' ? 60 : wp ? 75 : 38) * dt);
    for (const key in t) p[key] += (t[key] - p[key]) * k;
    if (this.state === 'roll' || this.lastState === 'roll') p.prx = t.prx ?? 0;
    this.rig.apply(p);
    this.rig.tick?.(dt); // [G] glow pulse + particles
    const m = this.mesh;
    m.position.set(this.pos.x, this.pos.y + airY, this.pos.z);
    m.rotation.y = this.rot;
    const sh = this.rig.shadow;
    sh.position.set(this.pos.x, this.pos.y + 0.05, this.pos.z);
    sh.scale.setScalar(1 - Math.min(0.5, airY * 0.2));
    this.def.updateMesh?.(w, this.weaponMesh, dt, this); // [W] weapon-specific visuals (Rausch glow, bow string)
    // blade glow while charging
    const glow = this.weaponMesh?.userData.glow;
    if (glow) {
      const lvl = w.charging ? w.chargeLevel : 0;
      const e = w.sauberOpen ? [1, 0.9, 0.2] : [[0, 0, 0], [0.15, 0.15, 0.3], [0.2, 0.45, 0.8], [0.9, 0.35, 0.1]][lvl];
      glow.emissive.setRGB(e[0] + this.flash * 2, e[1] + this.flash * 2, e[2] + this.flash * 2);
    }
    this.mesh.visible = true;
    glitchVisual(this, this.time); // RGB-Versatz / Flackern (auch fremde Pirscher, p.glitch.active per Netz-Event)
  }

  /** Network/Hud-facing snapshot */
  snapshot() {
    return { id: this.id, pos: [this.pos.x, this.pos.y, this.pos.z], rot: this.rot, hp: this.v.hp, state: this.state, pose: this.weapon.pose()?.name ?? null, status: Object.keys(this.status) };
  }
}
