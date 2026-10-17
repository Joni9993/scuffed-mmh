// Voltiris, the duelist: charge on the hunters, afterimage echoes, current lanes and the storm cage.
// Everything here is a pure function of replicated attack events (`all`) and the monster clock, so host and
// guests build identical echoes, lanes and cages. Damage is resolved against LOCAL hunters only, like melee.
// Design: docs/VOLTIRIS_ELDER_REWORK.md
import * as THREE from 'three';
import { fireballDef } from './mprojectiles.js';

export const VOLT = {
  CHARGE_MAX: 3, ROLL_CD: .8, COUNTDOWN: 1.2, RANGED_PER: 3,
  ECHO_MUL: .45, ECHO_LIFE: 11, ECHO_R: 1.75, ECHO_Y: 1.7, ECHO_TELE: .8, ECHO_BOLT: 135, ECHO_VOLLEYS: [1.5, 4.5], ECHO_SHOCK: 26,
  LANE_R: .85, LANE_SECS: 4, LANE_TICK: .5, LANE_DMG: 22, LANE_MAX: 9, LANE_CHARGE: 1.5, LANE_IGNITE: .35,
  CAGE_R0: 22, CAGE_R1: 12, CAGE_HOLD: 11, CAGE_ARM: 1.4, CAGE_OMEGA: .55, BEAM_LEN: 30, BEAM_R: .9, BEAM_DMG: 150, WALL_DMG: 45, WALL_TICK: .8,
  CRASH_TIME: 3,
};
const NO_PARTS = Object.freeze([]);
const TEAL = '#8de4df', GOLD = '#fff3b0';

export const state = (m) => (m.extra.volt ??= { echoes: [], lanes: [], cage: null, aim: null, seq: 0, ver: 0, gap: false });
const note = (m, p, text, kind = 'weak') => m.ctx.fx?.number?.({ x: p.pos.x, y: p.pos.y + 2.4, z: p.pos.z }, text, kind);
const PIPS = ['', '⚡◇◇', '⚡⚡◇', '⚡⚡⚡'];

// ------------------------------------------------------------------ charge (0-3 per hunter, local per client)
export const charge = (p) => (p.voltCharge ??= { n: 0, cd: 0, countdown: 0, ranged: 0, laneT: 0, wasRoll: false });
const cdKey = (p) => `volt:cd:${p.id}`;
function cancelCountdown(m, p) { const c = charge(p); c.countdown = 0; m.ctx.fx?.clearMarker?.(cdKey(p)); }

/** +n charge (hit by lightning, lane time, shattered echo, cage wall). At 3 the visible countdown starts. */
export function addCharge(m, p, n = 1, why = '') {
  if (!p.local || !p.alive || p.state === 'ko' || !m.alive) return;
  const c = charge(p), before = c.n;
  c.n = Math.min(VOLT.CHARGE_MAX, c.n + n);
  if (c.n !== before) { note(m, p, PIPS[c.n], 'weak'); m.ctx.bus.emit('sfx', { name: 'windup', pos: p.pos, timbre: 'zisch', f: 520 + c.n * 140, dur: .12 }); }
  if (c.n >= VOLT.CHARGE_MAX && c.countdown <= 0) {
    c.countdown = VOLT.COUNTDOWN;
    note(m, p, 'ENTLADUNG!', 'crit');
    m.ctx.bus.emit('sfx', { name: 'telegraph', pos: p.pos, big: true });
    m.ctx.bus.emit('voltCountdown', { player: p, monster: m, why });
  }
}
/** -n charge (roll, grounding). Dropping below 3 during the countdown aborts the discharge. */
export function shedCharge(m, p, n = 1) {
  const c = charge(p);
  if (c.n <= 0) return false;
  c.n = Math.max(0, c.n - n);
  if (c.n < VOLT.CHARGE_MAX && c.countdown > 0) { cancelCountdown(m, p); note(m, p, 'Geerdet!', 'heal'); m.ctx.bus.emit('sfx', { name: 'block', pos: p.pos }); }
  else if (c.n > 0) note(m, p, PIPS[c.n], 'weak');
  return true;
}
export function resetCharge(m, p) { const c = charge(p); c.n = 0; c.countdown = 0; c.laneT = 0; m.ctx.fx?.clearMarker?.(cdKey(p)); }

/** The lethal bolt: heavy, knocks down, roll i-frames dodge it. */
function discharge(m, p) {
  const c = charge(p);
  c.n = 0; c.countdown = 0; m.ctx.fx?.clearMarker?.(cdKey(p));
  const at = { x: p.pos.x, y: p.pos.y + 1, z: p.pos.z };
  const res = p.takeHit({ dmgPct: 1, dmg: 260, knock: 'down', key: `volt-discharge|${p.id}|${m.time.toFixed(2)}`, sourcePos: { x: p.pos.x + .01, y: p.pos.y + 6, z: p.pos.z }, attackId: 'voltiris_entladung', monster: m });
  m.ctx.fx?.spark?.(at, 28, TEAL, 8); m.ctx.fx?.shake?.(.5, .4);
  m.ctx.bus.emit('sfx', { name: 'heavy', pos: p.pos });
  m.ctx.bus.emit('voltDischarge', { player: p, monster: m, result: res });
  return res;
}

/** Per frame, local hunters only: roll shedding, cooldowns, the countdown ring and the discharge. */
export function tickCharge(m, dt) {
  for (const p of m.ctx.players) {
    if (!p.local) continue;
    const c = p.voltCharge;
    if (!c) continue;
    if (!m.alive || !p.alive || p.state === 'ko') { if (c.n || c.countdown) resetCharge(m, p); continue; }
    c.cd = Math.max(0, c.cd - dt);
    const rolling = p.state === 'roll';
    if (rolling && !c.wasRoll) { if (c.cd <= 0) { if (shedCharge(m, p, 1)) c.cd = VOLT.ROLL_CD; } }
    c.wasRoll = rolling;
    if (c.countdown > 0) {
      c.countdown -= dt;
      const k = Math.max(0, c.countdown / VOLT.COUNTDOWN), blink = Math.floor(m.time * 12) % 2 === 0;
      m.ctx.fx?.marker?.(cdKey(p), { x: p.pos.x, y: m.ctx.world?.heightAt?.(p.pos.x, p.pos.z) ?? p.pos.y, z: p.pos.z }, .9 + 2.6 * k, blink ? GOLD : TEAL, false);
      if (c.countdown <= 0) discharge(m, p);
    }
  }
}

/** Real-body hit by a local hunter: melee grounds (-1), ranged grounds once per three hits. */
export function ground(m, p, ranged) {
  if (!p?.local) return;
  const c = charge(p);
  if (!ranged) { shedCharge(m, p, 1); return; }
  c.ranged++;
  if (c.ranged >= VOLT.RANGED_PER) { c.ranged = 0; shedCharge(m, p, 1); }
}
export const isRanged = (p) => p?.weaponId === 'bow' || p?.weaponId === 'lb';

// ------------------------------------------------------------------ echoes
const echoLive = (e, time) => !e.dead && time >= e.t0 && time <= e.t1;
export const liveEchoes = (m) => state(m).echoes.filter((e) => echoLive(e, m.time));

/** A wireframe afterimage at a world point. `age` = seconds the event fired late; `key` keeps replays idempotent. */
export function addEcho(m, x, z, { age = 0, key, yaw = 0, offset = 0, volleys = VOLT.ECHO_VOLLEYS } = {}) {
  const v = state(m), k = key ?? `echo-${v.seq++}`;
  if (v.echoes.some((e) => e.key === k)) return null;
  const now = m.time - age, cap = m.phase >= 1 ? 3 : 2;
  const live = v.echoes.filter((e) => !e.dead);
  while (live.length >= cap) { const old = live.shift(); old.dead = true; old.deadAt = m.time; }
  const used = new Set(v.echoes.filter((e) => !e.dead).map((e) => e.slot));
  let slot = 0; while (used.has(slot)) slot++;
  const e = { key: k, slot, x, z, yaw, t0: now, t1: now + VOLT.ECHO_LIFE, dead: false, deadAt: 0, side: (v.seq % 2 ? 1 : -1), shots: volleys.map((t) => ({ at: now + t + offset, fired: false, aim: null })) };
  v.echoes.push(e); v.ver++;
  m.ctx.fx?.spark?.({ x, y: (m.ctx.world?.heightAt?.(x, z) ?? 0) + 1.6, z }, 10, TEAL, 5);
  return e;
}
export function shatterEcho(m, e, by = null) {
  if (e.dead) return false;
  e.dead = true; e.deadAt = m.time; state(m).ver++;
  const at = { x: e.x, y: (m.ctx.world?.heightAt?.(e.x, e.z) ?? 0) + VOLT.ECHO_Y, z: e.z };
  m.ctx.fx?.spark?.(at, 24, TEAL, 7); m.ctx.fx?.shake?.(.1, .15);
  m.ctx.bus.emit('sfx', { name: 'break', pos: at });
  m.ctx.bus.emit('voltEcho', { monster: m, echo: e, player: by });
  for (const pf of [`${e.key}:aim0`, `${e.key}:aim1`]) m.ctx.fx?.clearMarker?.(pf);
  if (by?.local && by.alive) {
    addCharge(m, by, 1, 'echo');
    by.takeHit({ dmg: VOLT.ECHO_SHOCK, knock: 'none', key: `${e.key}|shock|${by.id}`, sourcePos: { x: e.x, y: by.pos.y, z: e.z }, attackId: 'voltiris_nachbild', monster: m, noPerfect: true });
  }
  return true;
}
const echoById = (m, id) => state(m).echoes.find((e) => !e.dead && `echo${e.slot}` === id);

/** Echoes volley at the point the last attack committed to, offset sideways: a weak, readable bolt. */
function tickEchoes(m) {
  const v = state(m), time = m.time, ctx = m.ctx;
  for (let i = v.echoes.length - 1; i >= 0; i--) {
    const e = v.echoes[i];
    if (!m.alive || time > e.t1 + .6 || (e.dead && time - e.deadAt > 1)) { for (const k of [0, 1]) ctx.fx?.clearMarker?.(`${e.key}:aim${k}`); v.echoes.splice(i, 1); v.ver++; continue; }
    if (e.dead || time < e.t0) continue;
    e.shots.forEach((s, n) => {
      if (s.fired || !v.aim) return;
      if (!s.aim && time >= s.at - VOLT.ECHO_TELE) s.aim = { x: v.aim.x + e.side * 2.1 * (n ? -1 : 1), z: v.aim.z };
      if (!s.aim) return;
      const mk = `${e.key}:aim${n}`;
      if (time < s.at) { ctx.fx?.marker?.(mk, { x: s.aim.x, y: ctx.world?.heightAt?.(s.aim.x, s.aim.z) ?? 0, z: s.aim.z }, 1.25, Math.floor(time * 10) % 2 ? TEAL : '#ffffff', false); return; }
      s.fired = true; ctx.fx?.clearMarker?.(mk);
      const gy = ctx.world?.heightAt?.(e.x, e.z) ?? 0, from = { x: e.x, y: gy + 2.2, z: e.z };
      const def = { ...fireballDef({ from, aim: { x: s.aim.x, y: gy + 1, z: s.aim.z }, speed: 26, extra: 10, radius: .7, dmg: Math.round(VOLT.ECHO_BOLT * VOLT.ECHO_MUL), key: `${e.key}:b${n}`, status: null }), kind: 'volt', attackId: 'voltiris_nachbild' };
      m.projectiles.spawn(def, time - s.at);
      ctx.bus.emit('sfx', { name: 'windup', pos: from, timbre: 'zisch', f: 880, dur: .1 });
    });
  }
}

/** m.hurtParts() with live echo spheres appended (weapons, arrows and bolts find them like body parts). Nothing while blinking. */
export function installEchoes(m) {
  const base = m.hurtParts.bind(m), baseApply = m.applyDamage.bind(m), v = state(m);
  let cache = null, stamp = -1, ver = -1;
  m.hurtParts = () => {
    if (v.gap) return NO_PARTS;
    const body = base(), live = v.echoes.filter((e) => echoLive(e, m.time));
    if (!live.length) return body;
    if (cache && stamp === m._stamp && ver === v.ver) return cache;
    stamp = m._stamp; ver = v.ver;
    cache = body.concat(live.map((e) => {
      const y = (m.ctx.world?.heightAt?.(e.x, e.z) ?? 0) + VOLT.ECHO_Y;
      e.node ??= new THREE.Object3D();
      e.node.position.set(e.x, y, e.z); e.node.updateMatrixWorld(true);
      e.part ??= { id: `echo${e.slot}`, label: 'Nachbild', factor: .05, elem: {}, blunt: false, sph: [{ node: e.node, offset: [0, 0, 0], r: VOLT.ECHO_R }], echo: true };
      return { part: e.part, pos: new THREE.Vector3(e.x, y, e.z), sphere: { type: 'sphere', x: e.x, y, z: e.z, r: VOLT.ECHO_R }, key: `${m.id}|${e.part.id}` };
    }));
    return cache;
  };
  // An echo is not the body: hits shatter it and never touch the real HP.
  m.applyDamage = (res) => {
    if (typeof res?.partId === 'string' && res.partId.startsWith('echo')) {
      const e = echoById(m, res.partId);
      if (e) shatterEcho(m, e, m.ctx.players.find((p) => p.id === res.attackerId && p.local) ?? null);
      return { monster: m, part: null, dmg: 0, res, broke: false, stunned: false, killed: false };
    }
    return baseApply(res);
  };
  m._offs?.push(m.ctx.bus.on('hit', (e) => {
    if (e?.monster !== m || !e.player?.local) return;
    if (typeof e.part === 'string' && e.part.startsWith('echo')) { const ec = echoById(m, e.part); if (ec) shatterEcho(m, ec, e.player); return; }
    if ((e.dmg ?? 0) > 0) ground(m, e.player, isRanged(e.player));
  }));
}

// ------------------------------------------------------------------ current lanes (short-lived ground lines)
const segDist = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, k = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * k), pz - (az + dz * k));
};
export function addLane(m, ax, az, bx, bz, { age = 0, key, secs = VOLT.LANE_SECS, r = VOLT.LANE_R } = {}) {
  const v = state(m), k = key ?? `lane-${v.seq++}`;
  if (v.lanes.some((l) => l.key === k)) return null;
  const now = m.time - age, l = { key: k, ax, az, bx, bz, r, t0: now + VOLT.LANE_IGNITE, t1: now + VOLT.LANE_IGNITE + secs, next: new Map() };
  v.lanes.push(l);
  while (v.lanes.length > VOLT.LANE_MAX) v.lanes.shift();
  return l;
}
export const laneLive = (l, time) => time >= l.t0 && time <= l.t1;

function tickLanes(m, dt) {
  const v = state(m), time = m.time, ctx = m.ctx;
  for (let i = v.lanes.length - 1; i >= 0; i--) if (!m.alive || time > v.lanes[i].t1 + .4) v.lanes.splice(i, 1);
  for (const p of ctx.players) {
    if (!p.local || !p.alive || p.state === 'ko') continue;
    let inside = false;
    for (const l of v.lanes) {
      if (!laneLive(l, time) || segDist(p.pos.x, p.pos.z, l.ax, l.az, l.bx, l.bz) > l.r + .3) continue;
      inside = true;
      const next = l.next.get(p.id) ?? 0;
      if (time < next) continue;
      l.next.set(p.id, time + VOLT.LANE_TICK);
      const res = p.takeHit({ dmg: VOLT.LANE_DMG * (m.dmgMul ?? 1), knock: 'none', key: `${l.key}|${p.id}|${Math.floor(time / VOLT.LANE_TICK)}`, sourcePos: { x: (l.ax + l.bx) / 2, y: p.pos.y, z: (l.az + l.bz) / 2 }, attackId: 'voltiris_strombahn', monster: m, noPerfect: true });
      if (res === 'hit') ctx.fx?.flash?.('rgba(141,228,223,.22)', .2);
    }
    const c = charge(p);
    if (inside) { c.laneT += dt; if (c.laneT >= VOLT.LANE_CHARGE) { c.laneT = 0; addCharge(m, p, 1, 'lane'); } } else c.laneT = Math.max(0, c.laneT - dt * 2);
  }
}

// ------------------------------------------------------------------ Gewitterkäfig
export const beamAngles = (cage, time) => { const t = Math.max(0, time - cage.t0 - VOLT.CAGE_ARM); return [cage.th0 + VOLT.CAGE_OMEGA * cage.speed * t, cage.th0 + Math.PI * .75 - VOLT.CAGE_OMEGA * cage.speed * t]; };
export const cageRadius = (cage, time) => {
  const k = Math.max(0, Math.min(1, (time - cage.t0 - VOLT.CAGE_ARM) / ((cage.dur - VOLT.CAGE_ARM) * .72)));
  return VOLT.CAGE_R0 + (VOLT.CAGE_R1 - VOLT.CAGE_R0) * k;
};
export const cageLive = (cage, time) => !!cage && time >= cage.t0 && time <= cage.t0 + cage.dur;
export function startCage(m, cx, cz, { age = 0, speed = 1, th0 = 0, key } = {}) {
  const v = state(m);
  v.cage = { key: key ?? 'cage', cx, cz, t0: m.time - age, dur: VOLT.CAGE_HOLD / speed, speed, th0, next: new Map(), wall: new Map() };
  return v.cage;
}
export function endCage(m) {
  const v = state(m); if (!v.cage) return;
  m.ctx.fx?.clearMarker?.('volt:cage'); m.ctx.fx?.clearMarker?.('volt:cage:in'); v.cage = null;
}
function tickCage(m) {
  const v = state(m), cage = v.cage, ctx = m.ctx, time = m.time;
  if (!cage) return;
  if (!m.alive || time > cage.t0 + cage.dur) { endCage(m); return; }
  if (time < cage.t0) return;
  const R = cageRadius(cage, time), gy = ctx.world?.heightAt?.(cage.cx, cage.cz) ?? 0;
  ctx.fx?.marker?.('volt:cage', { x: cage.cx, y: gy, z: cage.cz }, R, Math.floor(time * 6) % 2 ? TEAL : '#ffffff', false);
  const armed = time >= cage.t0 + VOLT.CAGE_ARM, [a1, a2] = beamAngles(cage, time);
  for (const p of ctx.players) {
    if (!p.local || !p.alive || p.state === 'ko') continue;
    const dx = p.pos.x - cage.cx, dz = p.pos.z - cage.cz, d = Math.hypot(dx, dz);
    if (armed && d > R - .3) { // the wall: damage and charge
      const next = cage.wall.get(p.id) ?? 0;
      if (time >= next) {
        cage.wall.set(p.id, time + VOLT.WALL_TICK);
        const res = p.takeHit({ dmg: VOLT.WALL_DMG * (m.dmgMul ?? 1), knock: 'none', key: `${cage.key}|wall|${p.id}|${Math.floor(time / VOLT.WALL_TICK)}`, sourcePos: { x: cage.cx + dx / (d || 1) * R, y: p.pos.y, z: cage.cz + dz / (d || 1) * R }, attackId: 'voltiris_kaefig', monster: m, noPerfect: true });
        if (res === 'hit') { addCharge(m, p, 1, 'wall'); ctx.fx?.flash?.('rgba(141,228,223,.3)', .2); }
      }
    }
    if (!armed) continue;
    for (const [n, a] of [a1, a2].entries()) {
      const bx = cage.cx + Math.sin(a) * VOLT.BEAM_LEN, bz = cage.cz + Math.cos(a) * VOLT.BEAM_LEN;
      if (segDist(p.pos.x, p.pos.z, cage.cx, cage.cz, bx, bz) > VOLT.BEAM_R + .4) continue;
      const nk = `b${n}${p.id}`, next = cage.next.get(nk) ?? 0;
      if (time < next) continue;
      const res = p.takeHit({ dmg: VOLT.BEAM_DMG * (m.dmgMul ?? 1), knock: 'down', key: `${cage.key}|beam${n}|${p.id}|${Math.floor(time * 2)}`, sourcePos: { x: cage.cx, y: p.pos.y, z: cage.cz }, attackId: 'voltiris_kaefig', monster: m });
      if (res === 'hit' || res === 'block') { cage.next.set(nk, time + 1); if (res === 'hit') addCharge(m, p, 1, 'beam'); }
    }
  }
}

/** One call per frame on every client (host and guests). */
export function tickVolt(m, dt) {
  tickEchoes(m);
  tickLanes(m, dt);
  tickCage(m);
  tickCharge(m, dt);
}

/** Dying or reset: drop every entity and marker. */
export function clearVolt(m) {
  const v = m.extra.volt; if (!v) return;
  for (const e of v.echoes) for (const k of [0, 1]) m.ctx.fx?.clearMarker?.(`${e.key}:aim${k}`);
  v.echoes.length = 0; v.lanes.length = 0; v.ver++; endCage(m);
}
