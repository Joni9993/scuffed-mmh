import * as THREE from 'three';
import { compileTrack, REST } from '../anim.js';
import { stepAngle } from '../../core/math.js';
import { lambert } from '../../render/ps1.js';
import { computeAim, solveVelocity, TIPS, tipEffect, takeTip } from './bow.js';

// Ratterbüchse (`lb`, leichte Armbrust, GDD 18): A tippen = Einzelschuss, A halten = Rattern (3/s, langsamer),
// B tippen = Nachladen mit Timing-Fenster (Sauber geladen!), B halten = Schrottmine, Finisher Rückstoß-Kracher.
// Munition: Normal / Streuschrot / Durchschlag (unendlich, je Magazin), Spitzen wie beim Bogen (gleiche Items).
// Munitionswechsel: Lock-Nächster/Vorheriger (lockNext/lockPrev) solange NICHT eingerastet (sonst wechseln die den Körperteil).

export const LB = {
  speed: 46, gravity: 4, radius: 0.1, farMul: 0.7,
  shotDur: 0.25, rattern: { rate: 3, mul: 1.15, move: 0.6 },
  reload: { dur: 1.0, win: [0.45, 0.6], klemmer: 1.4, sauberMul: 1.15, minPress: 0.15 },
  mine: { max: 2, regen: 20, mv: 40, blunt: 40, partMul: 1.5, radius: 0.9 },
  fin: { delay: 1.5, mv: 200, blunt: 60, knock: 3 },
  glitch: { rate: 1.5, mul: 1.9 / 1.3 }, // Glitch-Grundfaktor 1,3 steckt schon in player.glitchDmgMul -> Ziel x1,9 gesamt
};
export const AMMO = {
  normal: { name: 'Normal', mag: 10, mv: 9, n: 1, fan: 0, pierce: 1, sweet: [6, 14], tipMul: 2, wucht: 2 },
  streu: { name: 'Streuschrot', mag: 4, mv: 4, n: 5, fan: 30, pierce: 1, sweet: [2, 6], tipMul: 0.5, wucht: 1, speed: 34 },
  durch: { name: 'Durchschlag', mag: 3, mv: 12, n: 1, fan: 0, pierce: 3, sweet: [10, 20], tipMul: 1, wucht: 2 },
};
export const AMMO_ORDER = ['normal', 'streu', 'durch'];
export const sweetMul = (ammo, d) => { const s = AMMO[ammo].sweet; return d >= s[0] && d <= s[1] ? 1 : LB.farMul; };

const D2R = Math.PI / 180;
const glitching = (w) => !!w.hooks.player?.glitching;
const rolledRecently = (w) => !!w.hooks.player && w.hooks.player.sinceRoll < 0.5;
export function st(w) {
  const d = w.data;
  if (d.ammo === undefined) {
    d.ammo = 'normal'; d.mag = { normal: AMMO.normal.mag, streu: AMMO.streu.mag, durch: AMMO.durch.mag };
    d.rel = null; d.sauberMag = false; d.wantReload = false; d.fireT = 0;
    d.charges = LB.mine.max; d.mineT = 0; d.mines = []; d.stickies = []; d.log = []; d.shots = 0;
  }
  return d;
}
const say = (w, text, kind = 'weak', dy = 2.3) => { const p = w.hooks.player; p?.ctx?.fx?.number?.({ x: p.pos.x, y: p.pos.y + dy, z: p.pos.z }, text, kind); };
const emit = (w, name) => { const p = w.hooks.player; p?.ctx?.bus?.emit?.('sfx', { name, pos: p.pos }); };
function rotateY(v, a) { const c = Math.cos(a), s = Math.sin(a); return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c }; }

// ---------- Schuss
function lbHit(p, info, spec, dist) {
  const ctx = p.ctx, tip = spec.tip ? TIPS[spec.tip] : null;
  const mv = spec.mv * spec.dmgMul * sweetMul(spec.ammo, dist);
  const hit = { mv, wucht: spec.wucht, hitstop: 'none', shake: 0, blunt: 0 };
  const fx = tipEffect(tip, spec.tipMul, p.stats?.poisonMul ?? 1);
  if (fx.status?.stun && typeof info.monster.applyStatus !== 'function') hit.blunt = fx.status.stun;
  ctx.playerHit(p, info.monster, info.hp, { hit, group: 'bolt', instance: 0, sauber: false, glitch: false, elems: fx.elems, status: fx.status });
  if (tip) ctx.fx?.spark(info.pos, 4, tip.fx, 3.5);
}
/** Ein Schuss (ein "Bolzen"): verbraucht 1 Magazin-Patrone + 1 Spitze (nicht im Glitch / beim freien Hüpfschuss). */
export function fireBolt(w, { free = false, rattern = false } = {}) {
  const d = st(w), p = w.hooks.player, A = AMMO[d.ammo], gl = glitching(w);
  if (!free && !gl) {
    if (d.mag[d.ammo] <= 0) { d.wantReload = true; return null; }
    d.mag[d.ammo]--;
  }
  const dmgMul = (rattern ? LB.rattern.mul : 1) * (d.sauberMag ? LB.reload.sauberMul : 1) * (gl ? LB.glitch.mul : 1);
  const rec = { ammo: d.ammo, mag: d.mag[d.ammo], tip: null, free, rattern, dmgMul };
  if (p?.ctx?.projectiles) {
    const aim = computeAim(p);
    p.rot = aim.yaw;
    const tipId = free || gl ? null : takeTip(p);
    rec.tip = tipId;
    const spec = { ammo: d.ammo, mv: A.mv, wucht: A.wucht, tip: tipId, tipMul: A.tipMul, dmgMul };
    const tgt = aim.target ?? { x: aim.origin.x + Math.sin(aim.yaw) * 12, y: aim.origin.y, z: aim.origin.z + Math.cos(aim.yaw) * 12 };
    const base = solveVelocity(aim.origin, tgt, A.speed ?? LB.speed, LB.gravity);
    const o = { x: p.pos.x, z: p.pos.z };
    for (let i = 0; i < A.n; i++) {
      const vel = A.n > 1 ? rotateY(base, (i / (A.n - 1) - 0.5) * A.fan * D2R) : base;
      p.ctx.projectiles.spawn({
        pos: { ...aim.origin }, vel, gravity: LB.gravity, radius: LB.radius, life: 2, team: 'player', owner: p, pierce: A.pierce,
        color: tipId ? TIPS[tipId].color : 0xd8c090,
        glow: (pr) => { const dd = Math.hypot(pr.pos.x - o.x, pr.pos.z - o.z); return sweetMul(spec.ammo, dd) === 1 ? 'sweet' : 'weak'; },
        onHit: (info) => lbHit(p, info, spec, Math.hypot(info.pos.x - o.x, info.pos.z - o.z)),
        data: { level: 1 },
      });
    }
    emit(w, 'swing');
  }
  d.shots++; d.log.push(rec); if (d.log.length > 40) d.log.shift();
  if (!gl && !free && d.mag[d.ammo] <= 0) d.wantReload = true; // leer -> naechster A-Druck laedt (siehe onUpdate)
  return rec;
}

// ---------- Nachladen
export function startReload(w) {
  const d = st(w);
  if (glitching(w) || d.mag[d.ammo] >= AMMO[d.ammo].mag) return false;
  d.rel = { kind: 'reload', t: 0 };
  w.startMove('lb_reload');
  return true;
}
function finishReload(w, sauber) {
  const d = st(w);
  d.mag[d.ammo] = AMMO[d.ammo].mag;
  d.sauberMag = !!sauber;
}
export const reloadWindowOpen = (w) => { const r = st(w).rel; return !!r && r.kind === 'reload' && r.t >= LB.reload.win[0] && r.t <= LB.reload.win[1]; };
function reloadTick(w, dt) {
  const d = st(w), r = d.rel;
  if (!r) return;
  const dur = r.kind === 'reload' ? LB.reload.dur : LB.reload.klemmer;
  if (w.moveId !== 'lb_' + r.kind) { // Move vorbei: fertig geladen (oder durch Rolle/Treffer abgebrochen)
    if (r.t >= dur - 0.05) finishReload(w, false);
    d.rel = null;
    return;
  }
  r.t += dt;
  if (r.kind !== 'reload') return;
  const i = w.events.findIndex((e) => e.type === 'B');
  if (i < 0) return;
  w.events.splice(i, 1);
  if (r.t < LB.reload.minPress) return; // Doppeltipp direkt nach dem Start: ignorieren
  if (r.t >= LB.reload.win[0] && r.t <= LB.reload.win[1] + dt) { // Sauber geladen!
    finishReload(w, true);
    d.rel = null;
    w.startMove('lb_done');
    say(w, 'Sauber geladen!', 'weak');
    w.hooks.player?.ctx?.fx?.flash?.('rgba(255,225,70,.3)', 0.2);
    emit(w, 'swing');
  } else { // Klemmer
    d.rel = { kind: 'klemmer', t: 0 };
    w.startMove('lb_klemmer');
    say(w, 'Klemmer!', 'hit');
  }
}

// ---------- Minen / Finisher
function placeMine(w) {
  const d = st(w), p = w.hooks.player;
  if (d.charges <= 0) { say(w, 'Keine Mine', 'hit', 1.8); return; }
  d.charges--;
  const x = (p?.pos.x ?? 0) + Math.sin(p?.rot ?? 0) * 1.2, z = (p?.pos.z ?? 0) + Math.cos(p?.rot ?? 0) * 1.2;
  const y = p?.ctx?.world?.heightAt?.(x, z) ?? 0;
  d.mines.push({ x, y, z, id: 'mine_' + (d.mineId = (d.mineId | 0) + 1) });
  emit(w, 'swing');
}
function mineTick(w, dt) {
  const d = st(w), p = w.hooks.player, ctx = p?.ctx;
  if (d.charges < LB.mine.max) { d.mineT += dt; if (d.mineT >= LB.mine.regen) { d.mineT = 0; d.charges++; } } else d.mineT = 0;
  if (!d.mines.length) return;
  for (let i = d.mines.length - 1; i >= 0; i--) {
    const m = d.mines[i];
    let best = null, mon = null;
    for (const mo of ctx?.monsters ?? []) {
      if (!mo.alive || mo.def?.neutral) continue;
      for (const hp of mo.hurtParts()) {
        const r = (hp.sphere.r ?? 0.5) + LB.mine.radius;
        if (Math.hypot(hp.pos.x - m.x, hp.pos.z - m.z) < r && hp.pos.y - hp.sphere.r < m.y + 1.6 && (!best || hp.part.factor > best.part.factor)) { best = hp; mon = mo; }
      }
    }
    if (best && ctx.playerHit) {
      d.mines.splice(i, 1);
      ctx.fx?.clearMarker?.(m.id);
      ctx.fx?.spark?.({ x: m.x, y: m.y + 0.3, z: m.z }, 20, '#ff8a3a', 7);
      ctx.fx?.shake?.(0.12, 0.15);
      emit(w, 'heavy');
      ctx.playerHit(p, mon, best, { hit: { mv: LB.mine.mv, blunt: LB.mine.blunt, wucht: 2, partDmgMul: LB.mine.partMul, hitstop: 'light', shake: 0.1 }, group: 'mine', instance: 0, sauber: false, glitch: false });
    } else ctx?.fx?.marker?.(m.id, { x: m.x, y: m.y, z: m.z }, 0.5, '#ff5a3a', false);
  }
}
function fireFinisher(w) {
  const p = w.hooks.player;
  if (!p?.ctx?.projectiles) return;
  const d = st(w), aim = computeAim(p);
  p.rot = aim.yaw;
  const tgt = aim.target ?? { x: aim.origin.x + Math.sin(aim.yaw) * 12, y: aim.origin.y, z: aim.origin.z + Math.cos(aim.yaw) * 12 };
  p.ctx.projectiles.spawn({
    pos: { ...aim.origin }, vel: solveVelocity(aim.origin, tgt, 50, LB.gravity), gravity: LB.gravity, radius: 0.14, life: 1.5, team: 'player', owner: p, pierce: 1, color: 0xff5a3a,
    onHit: (info) => d.stickies.push({ t: LB.fin.delay, monster: info.monster, hp: info.hp }),
  });
  p.push?.({ x: -Math.sin(aim.yaw), z: -Math.cos(aim.yaw) }, LB.fin.knock, 0.3); // Rueckstoss
  p.ctx.fx?.shake?.(0.2, 0.2);
  emit(w, 'heavy');
}
function stickyTick(w, dt) {
  const d = st(w), p = w.hooks.player;
  for (let i = d.stickies.length - 1; i >= 0; i--) {
    const s = d.stickies[i];
    if ((s.t -= dt) > 0) continue;
    d.stickies.splice(i, 1);
    if (!s.monster.alive || !p?.ctx?.playerHit) continue;
    const hp = s.monster.hurtParts().find((h) => h.part.id === s.hp.part.id) ?? s.hp;
    p.ctx.fx?.spark?.(hp.pos, 24, '#ff8a3a', 8);
    p.ctx.fx?.shake?.(0.25, 0.25);
    emit(w, 'heavy');
    p.ctx.playerHit(p, s.monster, hp, { hit: { mv: LB.fin.mv, blunt: LB.fin.blunt, wucht: 0, hitstop: 'heavy', shake: 0.25 }, group: 'kracher', instance: 0, sauber: false, glitch: false });
  }
}

// ---------- Moves
const aimed = { aimed: true, turnSpeed: 0 };
export const moves = {
  lb_shot: {
    id: 'lb_shot', anim: 'lb_shot', duration: LB.shotDur, fire: [{ t: 0.03, call: 'shoot' }],
    combo: { window: [0.12, 0.25], next: { A: 'lb_shot', holdA: (w) => rattern(w), B: (w) => reloadMove(w) } },
    rollCancelAt: 0.12, moveSpeed: 1, ...aimed,
  },
  lb_hop: { id: 'lb_hop', anim: 'lb_shot', duration: LB.shotDur, fire: [{ t: 0.03, call: 'hop' }], rollCancelAt: 0.12, moveSpeed: 1, ...aimed },
  lb_rattern: { id: 'lb_rattern', kind: 'hold', anim: 'lb_rattern', button: 'A', minTime: 0.1, moveSpeed: LB.rattern.move, rollable: true, ...aimed },
  lb_rattern_g: { id: 'lb_rattern_g', kind: 'hold', anim: 'lb_rattern', button: 'A', minTime: 0.1, moveSpeed: 1, rollable: true, ...aimed }, // Glitch: kein Tempo-Malus
  lb_reload: { id: 'lb_reload', anim: 'lb_reload', duration: LB.reload.dur, rollCancelAt: 0.05, moveSpeed: 0.8, turnSpeed: 0.5 },
  lb_klemmer: { id: 'lb_klemmer', anim: 'lb_reload', duration: LB.reload.klemmer, rollCancelAt: 0.9, moveSpeed: 0.4, turnSpeed: 0.3 },
  lb_done: { id: 'lb_done', anim: 'lb_shot', duration: 0.12, rollCancelAt: 0.02, moveSpeed: 1, turnSpeed: 0.5 },
  lb_mine: { id: 'lb_mine', anim: 'lb_mine', duration: 0.45, fire: [{ t: 0.2, call: 'mine' }], rollCancelAt: 0.3, moveSpeed: 0.3, turnSpeed: 0.5 },
  lb_finisher: {
    id: 'lb_finisher', anim: 'lb_shot', duration: 0.8, consumeWucht: true, fire: [{ t: 0.25, call: 'kracher' }],
    superArmor: 'flinch', rollCancelAt: 0.6, moveSpeed: 0.2, ...aimed,
  },
};
const rattern = (w) => (glitching(w) ? 'lb_rattern_g' : 'lb_rattern');
const reloadMove = (w) => { const d = st(w); return glitching(w) || d.mag[d.ammo] >= AMMO[d.ammo].mag ? null : 'lb_reload'; };
const idleA = (w) => (rolledRecently(w) ? 'lb_hop' : 'lb_shot');

const BASE = { ...REST, arx: 25, sw: 90, arz: 10, alx: -8, tx: 4 };
const AIM = { arx: 92, sw: -92, arz: 4, alx: 74, alz: -36, ty: -28, tx: 6, lrx: 10, rrx: -14, hy: -18, py: -0.05 };
const A = (f) => compileTrack(f, BASE);
const anims = {
  lb_shot: A([[0, AIM], [0.05, { ...AIM, alx: 80, tx: 2 }], [0.25, AIM]]),
  lb_rattern: A([[0, {}], [0.1, AIM], [0.2, { ...AIM, alx: 78 }], [0.3, AIM]]),
  lb_reload: A([[0, {}], [0.2, { ...AIM, alx: 30, arx: 60, ty: 0 }], [0.5, { ...AIM, alx: 20, arx: 70, ty: 0 }], [1.0, {}], [1.4, {}]]),
  lb_mine: A([[0, {}], [0.15, { tx: 30, hx: 20, arx: 50, alx: 50 }], [0.3, { tx: 30, hx: 20, arx: 50, alx: 50 }], [0.45, {}]]),
};

// ---------- Optik (Platzhalter: Schaft + Bogenarme)
const TIER_COL = [0x7a5a3a, 0x9a8a6a, 0xb08a3a, 0xc8602a, 0x6a7a8a, 0x8a9aa8];
function buildMesh({ tier = 1, branch = null } = {}) {
  const g = new THREE.Group();
  const col = TIER_COL[Math.min(5, Math.max(0, tier - 1))];
  const wood = lambert({ color: col }), dark = lambert({ color: 0x3a3a40 });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); g.add(me); return me; };
  add(new THREE.BoxGeometry(0.1, 0.12, 0.8), wood, 0, 0, 0.1);            // Schaft
  add(new THREE.BoxGeometry(0.06, 0.07, 0.5), dark, 0, 0.09, 0.28);       // Lauf / Schiene
  add(new THREE.BoxGeometry(0.5, 0.05, 0.05), dark, 0.25 * 0 + 0.22, 0.02, 0.52, 0, -0.35, 0);
  add(new THREE.BoxGeometry(0.5, 0.05, 0.05), dark, -0.22, 0.02, 0.52, 0, 0.35, 0);
  add(new THREE.BoxGeometry(0.1, 0.18, 0.1), dark, 0, -0.13, -0.05);      // Magazin
  g.userData.lb = { tier, branch };
  return g;
}

/** Waffen-Glitch "Buffer Overflow": kein Nachladen, Rattern ohne Tempo-Malus, Spitzen nicht verbraucht, Feuerrate x1,5. */
const glitch = {
  name: 'Buffer Overflow',
  onStart(p) { const d = st(p.weapon); d.rel = null; d.mag[d.ammo] = AMMO[d.ammo].mag; },
  onEnd(p) { const d = st(p.weapon); d.mag[d.ammo] = AMMO[d.ammo].mag; },
  tick() {},
};

export const armbrust = {
  id: 'lb',
  name: 'Ratterbüchse',
  glitch,
  hand: 'L',
  holdThreshold: { A: 0.15, B: 0.3 },
  idle: { A: idleA, holdA: rattern, B: (w) => reloadMove(w), holdB: 'lb_mine' },
  moves,
  anims,
  rollOverride: () => ({ duration: 0.3, dist: 2.4 }), // kurzer Seitwärtshüpfer, gleiche i-Frames wie die Rolle
  overrideEvent: (w, type) => {
    if (type === 'holdB' && w.wucht >= 100) return 'lb_finisher';
    return undefined;
  },
  on: {
    shoot: (w) => fireBolt(w),
    hop: (w) => fireBolt(w, { free: true }),
    mine: (w) => placeMine(w),
    kracher: (w) => fireFinisher(w),
  },
  onReset(w) {
    const d = st(w);
    for (const m of d.mines) w.hooks.player?.ctx?.fx?.clearMarker?.(m.id);
    d.rel = null; d.mines = []; d.stickies = []; d.wantReload = false; d.sauberMag = false; d.fireT = 0;
    d.charges = LB.mine.max; d.mineT = 0;
    for (const k of AMMO_ORDER) d.mag[k] = AMMO[k].mag;
  },
  onUpdate(w, dt) {
    const d = st(w), p = w.hooks.player;
    if (w.moveId === 'lb_reload' && !d.rel) d.rel = { kind: 'reload', t: 0 };
    reloadTick(w, dt);
    mineTick(w, dt);
    stickyTick(w, dt);
    const inp = p?.ctx?.input?.b;
    if (inp && (inp.lockNext?.pressed || inp.lockPrev?.pressed) && !p.lockPoint?.() && !w.moveId?.startsWith('lb_rattern')) {
      const dir = inp.lockPrev?.pressed ? -1 : 1;
      d.ammo = AMMO_ORDER[(AMMO_ORDER.indexOf(d.ammo) + dir + AMMO_ORDER.length) % AMMO_ORDER.length];
      d.rel = null;
      say(w, AMMO[d.ammo].name, 'heal');
    }
    const id = w.moveId;
    if (d.wantReload && (id === null || id === 'lb_shot' || id === 'lb_rattern' || id === 'lb_rattern_g' || id === 'lb_hop')) {
      d.wantReload = false;
      if (!glitching(w) && d.mag[d.ammo] <= 0) startReload(w);
      return;
    }
    if (id === 'lb_rattern' || id === 'lb_rattern_g') {
      d.fireT -= dt;
      if (d.fireT <= 0) { if (fireBolt(w, { rattern: true })) d.fireT += 1 / (LB.rattern.rate * (glitching(w) ? LB.glitch.rate : 1)); else d.fireT = 0; }
    } else d.fireT = 0;
    if (p?.ctx && w.move?.aimed) {
      const aim = computeAim(p);
      p.rot = stepAngle(p.rot, aim.yaw, 18 * dt);
    }
  },
  buildMesh,
  updateMesh() {},
  /** HUD: Magazin-Pips + Munitionsname + Nachlade-Balken (Fenster = "Sauber!" im Chip) */
  status(w) {
    const d = st(w), A = AMMO[d.ammo];
    const tip = w.hooks.player?.ammoTip;
    const tipTxt = tip && TIPS[tip] ? ` · ${TIPS[tip].name}` : '';
    const mines = d.charges > 0 ? ` · Mine ${d.charges}` : '';
    if (glitching(w)) {
      const flick = Math.floor((typeof performance !== 'undefined' ? performance.now() : 0) / 90) % 2;
      return { text: `${A.name} ${flick ? 'NaN/∞' : '∞/∞'}${mines}`, level: A.mag, max: A.mag };
    }
    if (d.rel) {
      const dur = d.rel.kind === 'reload' ? LB.reload.dur : LB.reload.klemmer;
      const n = Math.min(10, Math.floor((d.rel.t / dur) * 10));
      const bar = '▰'.repeat(n) + '▱'.repeat(10 - n);
      return { text: d.rel.kind === 'klemmer' ? `Klemmer ${bar}` : `Laden ${bar}`, level: 0, max: A.mag, sauber: reloadWindowOpen(w) };
    }
    const fin = w.wucht >= 100 ? ' · Kracher: B halten' : '';
    return { text: `${A.name} ${d.mag[d.ammo]}/${A.mag}${tipTxt}${mines}${fin}`, level: d.mag[d.ammo], max: A.mag };
  },
};
