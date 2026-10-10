import * as THREE from 'three';
import { compileTrack, REST } from '../anim.js';
import { lambert } from '../../render/ps1.js';
import { tex, registerTexture } from '../../render/textures.js';
import { angleDiff, stepAngle, yawOf } from '../../core/math.js';

// Spannbogen (GDD 4.3): Spannen (A halten) in 3 Stufen, Rhythmus-Schnellschuss (A tippen), Ausweichspannen,
// Sweet Spot 8-16 m, Spitzen (Brenn/Gift/Bumm), Bogenhieb (B), Finisher Pfeilregen (B bei Wucht 100).

export const BOW = {
  levelTimes: [0.45, 0.9],   // Stufe 2 / 3 (Sekunden seit Druck)
  staminaPerSec: 12,
  rhythmWindow: 1.0,          // Grundstufe +1 fuer 1 s nach jedem Schuss
  speed: 42, gravity: 7, radius: 0.1,
  sweetMin: 8, sweetMax: 16, farMul: 0.7,
  autoAimCone: 10,            // Grad
  dodgeWindow: 0.5,           // Ausweichspannen: Sekunden nach der Rolle
  quickMul: 1.08,              // Schnellschuss (Tipp): volle BW der Stufe, dafuer langsamer Takt (0.45 s)
  chargedMul: [1.7, 2.6, 3.6], // gespannter Schuss je Stufe (Spannen kostet Zeit und Puste)
  rain: { mark: 1.2, arrows: 20, radius: 3.5, mv: 9, height: 16, speed: 34 },
};
export const SHOTS = {
  1: { name: 'Streuschuss', arrows: 3, fan: 25, mv: 6, pierce: 1, wucht: 3 },
  2: { name: 'Doppelschuss', arrows: 2, fan: 0, mv: 10, pierce: 1, wucht: 3 },
  3: { name: 'Durchschuss', arrows: 1, fan: 0, mv: 16, pierce: 3, wucht: 2 },
};
export const TIPS = {
  brennspitze: { name: 'Brennspitze', color: 0xff7a1a, elems: { fire: 12 } },
  giftspitze: { name: 'Giftspitze', color: 0x6adf3a, poison: 20 },
  bummspitze: { name: 'Bummspitze', color: 0xff3a6a, stun: 8, boom: true },
};
const LEVEL_COLOR = { 1: 0xf0e6c8, 2: 0x9fd8ff, 3: 0xffe14d };

/** Distance modifier: 8-16 m = x1.0, otherwise x0.7. */
export const sweetMul = (d) => (d >= BOW.sweetMin && d <= BOW.sweetMax ? 1 : BOW.farMul);
export const sweetCue = (d) => (d >= BOW.sweetMin && d <= BOW.sweetMax ? 'sweet' : d < BOW.sweetMin ? 'near' : 'far');

const D2R = Math.PI / 180;
const rolledRecently = (w) => !!w.hooks.player && w.hooks.player.sinceRoll < BOW.dodgeWindow;

// ---------- rhythm / base level (pure state in w.data)
const initData = (w) => { if (w.data.base === undefined) { w.data.base = 1; w.data.baseT = 0; w.data.shots = 0; w.data.log = []; } };
/** Current quick-shot level (1..3). */
export function baseLevel(w) { initData(w); return w.data.base; }
function bumpBase(w) {
  initData(w);
  w.data.base = Math.min(3, w.data.base + 1);
  w.data.baseT = BOW.rhythmWindow;
}

// ---------- aiming
const fwd = (yaw) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

/**
 * Aim for player p. Lock-on: the locked part. Otherwise camera forward with slight auto-aim to the nearest monster
 * part within 10 degrees. Returns { yaw, target:{x,y,z}|null, origin:{x,y,z}, dist }.
 */
export function computeAim(p) {
  const ctx = p.ctx;
  const lp = p.lockPoint?.() ?? null;
  let yaw, target = null;
  if (lp) {
    yaw = yawOf(lp.x - p.pos.x, lp.z - p.pos.z);
    target = { x: lp.x, y: lp.y, z: lp.z };
  } else {
    yaw = ctx.cameraYaw ?? p.rot;
    let bestD = 1e9;
    for (const m of ctx.monsters ?? []) {
      if (!m.alive) continue;
      for (const hp of m.hurtParts()) {
        const dx = hp.pos.x - p.pos.x, dz = hp.pos.z - p.pos.z, d = Math.hypot(dx, dz);
        if (d < 1) continue;
        const ang = Math.abs(angleDiff(yaw, yawOf(dx, dz))) - Math.atan2(hp.sphere.r, d);
        if (ang <= BOW.autoAimCone * D2R && d < bestD) { bestD = d; target = { x: hp.pos.x, y: hp.pos.y, z: hp.pos.z }; }
      }
    }
    if (target) yaw = yawOf(target.x - p.pos.x, target.z - p.pos.z);
  }
  const f = fwd(yaw), r = { x: -Math.cos(yaw), z: Math.sin(yaw) };
  const origin = { x: p.pos.x + f.x * 0.8 + r.x * 0.3, y: p.pos.y + 1.4, z: p.pos.z + f.z * 0.8 + r.z * 0.3 };
  const dist = target ? Math.hypot(target.x - p.pos.x, target.z - p.pos.z) : null;
  return { yaw, target, origin, dist };
}

/** Launch velocity that hits `to` from `from` at the arrow speed, compensating gravity. */
export function solveVelocity(from, to, speed = BOW.speed, g = BOW.gravity) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  const t = d / speed;
  return { x: dx / t, y: dy / t + 0.5 * g * t, z: dz / t };
}

function rotateY(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}

// ---------- tips
function takeTip(p) {
  const tip = p.ammoTip;
  if (!tip || !TIPS[tip]) return null;
  const inv = p.ctx.inventory;
  if (inv && !inv.consume(tip, 1)) { p.ammoTip = null; return null; }
  if (inv && inv.count && inv.count(tip) <= 0) p.ammoTip = null; // last one used
  return tip;
}

/** Resolve one arrow hit through the regular player hit path. */
export function arrowHit(p, info, spec, dist) {
  const ctx = p.ctx;
  const tip = spec.tip ? TIPS[spec.tip] : null;
  const m = info.monster;
  const mv = spec.mv * (spec.dmgMul ?? 1) * (spec.fixedMv ? 1 : sweetMul(dist));
  const hit = { mv, wucht: spec.wucht, hitstop: 'none', shake: 0, blunt: 0 };
  if (tip?.stun && typeof m.applyStatus !== 'function') hit.blunt = tip.stun; // fallback: stun via blunt buildup
  const ah = { hit, group: 'arrow', instance: 0, sauber: false, glitch: false, elems: tip?.elems };
  ctx.playerHit(p, m, info.hp, ah);
  if (tip?.poison) m.applyStatus?.('poison', { buildup: tip.poison });
  if (tip?.stun && typeof m.applyStatus === 'function') m.applyStatus('stun', { buildup: tip.stun });
  if (tip?.boom) explode(ctx, info.pos);
}
function explode(ctx, pos) {
  ctx.fx?.spark(pos, 18, '#ff8a3a', 7);
  ctx.fx?.spark(pos, 8, '#ffe14d', 4);
  ctx.fx?.shake(0.12, 0.15);
  ctx.bus?.emit('sfx', { name: 'heavy', pos });
}

function spawnArrow(p, { pos, vel, spec, pierce, level, fixedDist }) {
  const ctx = p.ctx;
  const tip = spec.tip ? TIPS[spec.tip] : null;
  const o = { x: p.pos.x, z: p.pos.z };
  return ctx.projectiles.spawn({
    pos, vel, gravity: spec.gravity ?? BOW.gravity, radius: BOW.radius, life: 2.6, team: 'player', owner: p, pierce,
    color: tip?.color ?? LEVEL_COLOR[level] ?? 0xf0e6c8,
    glow: spec.noGlow ? undefined : (pr) => { const d = Math.hypot(pr.pos.x - o.x, pr.pos.z - o.z); return sweetCue(d) === 'sweet' ? 'sweet' : 'weak'; },
    onHit: (info, pr) => arrowHit(p, info, spec, fixedDist ?? Math.hypot(info.pos.x - o.x, info.pos.z - o.z)),
    onEnd: (pr, reason) => { if (tip?.boom && reason !== 'monster') explode(ctx, pr.pos); },
    data: { level },
  });
}

/** Fire a shot of `level` (1..3). Updates rhythm; spawns arrows when a player/projectile system is attached. */
export function fireShot(w, level, { quick = false } = {}) {
  initData(w);
  const spec0 = SHOTS[level];
  const p = w.hooks.player;
  const rec = { level, type: spec0.name, quick, arrows: spec0.arrows, tip: null, dmgMul: quick ? BOW.quickMul : BOW.chargedMul[level - 1] };
  if (p?.ctx?.projectiles) {
    const aim = computeAim(p);
    p.rot = aim.yaw;
    const tipId = takeTip(p);
    rec.tip = tipId;
    const spec = { ...spec0, tip: tipId, dmgMul: quick ? BOW.quickMul : BOW.chargedMul[level - 1] };
    const tgt = aim.target ?? { x: aim.origin.x + Math.sin(aim.yaw) * 14, y: aim.origin.y, z: aim.origin.z + Math.cos(aim.yaw) * 14 };
    const base = solveVelocity(aim.origin, tgt);
    const f = fwd(aim.yaw), side = { x: -f.z, z: f.x }; // left of the shooter
    for (let i = 0; i < spec0.arrows; i++) {
      let vel = base, pos = { ...aim.origin };
      if (spec0.arrows === 3) vel = rotateY(base, (i - 1) * (spec0.fan / 2) * D2R);
      if (spec0.arrows === 2) { const o = (i - 0.5) * 0.3; pos.x += side.x * o; pos.z += side.z * o; }
      spawnArrow(p, { pos, vel, spec, pierce: spec0.pierce, level });
    }
    p.ctx.bus?.emit('sfx', { name: 'swing', pos: p.pos });
  }
  bumpBase(w);
  w.data.shots++;
  w.data.log.push(rec);
  if (w.data.log.length > 40) w.data.log.shift();
  w.data.lastShot = rec;
  return rec;
}

// ---------- Pfeilregen
function rainTarget(p) {
  const aim = computeAim(p);
  if (aim.target) return { x: aim.target.x, z: aim.target.z };
  const f = fwd(aim.yaw);
  return { x: p.pos.x + f.x * 12, z: p.pos.z + f.z * 12 };
}
function rainMark(w) {
  const p = w.hooks.player;
  if (!p?.ctx?.projectiles) { w.data.rain = { x: 0, z: 0 }; return; }
  const tgt = rainTarget(p);
  w.data.rain = tgt;
  p.ctx.fx?.marker('rain_' + p.id, { x: tgt.x, y: p.ctx.world.heightAt(tgt.x, tgt.z), z: tgt.z }, BOW.rain.radius, '#ffe14d', false);
}
function rainDrop(w) {
  const p = w.hooks.player, R = BOW.rain;
  w.data.rainDropped = (w.data.rainDropped ?? 0) + 1;
  if (!p?.ctx?.projectiles) return;
  const ctx = p.ctx, t = w.data.rain;
  const a = ctx.rng() * Math.PI * 2, r = Math.sqrt(ctx.rng()) * R.radius;
  const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
  const y = ctx.world.heightAt(x, z) + R.height;
  const spec = { mv: R.mv, wucht: 0, pierce: 1, fixedMv: true, noGlow: true, gravity: 0, tip: null };
  spawnArrow(p, { pos: { x, y, z }, vel: { x: 0, y: -R.speed, z: 0 }, spec, pierce: 1, level: 3, fixedDist: 12 });
}

// ---------- moves
const drawMove = (extra = {}) => ({
  kind: 'charge', anim: 'b_draw', button: 'A', duration: 99,
  levels: BOW.levelTimes, maxHold: 99, over: 2,
  releases: ['b_s1', 'b_s2', 'b_s3'], moveSpeed: 0.72, turnSpeed: 0, staminaPerSec: BOW.staminaPerSec, rollable: true, aimed: true,
  ...extra,
});
const afterShot = {
  window: [0.2, 0.4],
  next: { A: 'b_quick', holdA: (w) => (rolledRecently(w) ? 'b_draw_r' : 'b_draw'), B: 'b_hieb' },
};
const shotMove = (lvl, dur) => ({
  id: 'b_s' + lvl, anim: 'b_shot', duration: dur, fire: [{ t: 0.03, call: 'shoot', level: lvl }],
  combo: afterShot, rollCancelAt: 0.18, moveSpeed: 0.35, turnSpeed: 0, aimed: true,
});
export const moves = {
  b_draw: { id: 'b_draw', ...drawMove() },
  b_draw_r: { id: 'b_draw_r', ...drawMove({ startT: BOW.levelTimes[0] }) }, // Ausweichspannen: direkt Stufe 2
  b_s1: shotMove(1, 0.42),
  b_s2: shotMove(2, 0.46),
  b_s3: shotMove(3, 0.52),
  b_quick: {
    id: 'b_quick', anim: 'b_quick', duration: 0.5, fire: [{ t: 0.09, call: 'quick' }],
    combo: { window: [0.4, 0.48], next: afterShot.next }, rollCancelAt: 0.22, moveSpeed: 0.4, turnSpeed: 0, aimed: true,
  },
  b_hieb: {
    id: 'b_hieb', anim: 'b_hieb', duration: 0.55,
    hits: [
      { t0: 0.13, t1: 0.2, shape: 'sphere', at: [0.5, 1.2, 1.0], radius: 0.85, mv: 14, blunt: 12, wucht: 3, hitstop: 'light', group: 'h', launch: true },
      { t0: 0.2, t1: 0.27, shape: 'sphere', at: [-0.4, 1.2, 1.1], radius: 0.85, mv: 14, blunt: 12, wucht: 3, hitstop: 'light', group: 'h' },
    ],
    combo: { window: [0.3, 0.5], next: { A: 'b_quick', holdA: (w) => (rolledRecently(w) ? 'b_draw_r' : 'b_draw') } },
    rollCancelAt: 0.3, moveSpeed: 0.3, turnSpeed: 0.5,
  },
  b_finisher: {
    id: 'b_finisher', anim: 'b_finisher', duration: 2.35, consumeWucht: true,
    fire: [
      { t: 0.02, call: 'rainMark' },
      ...Array.from({ length: BOW.rain.arrows }, (_, i) => ({ t: BOW.rain.mark + 0.1 + i * 0.035, call: 'rainDrop' })),
    ],
    superArmor: 'flinch', rollCancelAt: 1.9, moveSpeed: 0.15, turnSpeed: 0, rain: true,
  },
};

const BASE = { ...REST, arx: 25, sw: 90, arz: 10, alx: -8, tx: 4 };
const DRAW = { arx: 92, sw: -92, arz: 4, alx: 74, alz: -36, ty: -28, tx: 6, lrx: 10, rrx: -14, hy: -18, py: -0.05 };
const A = (f) => compileTrack(f, BASE);
const anims = {
  b_draw: A([[0, {}], [0.14, DRAW], [0.9, { ...DRAW, alx: 62, tx: 9 }]]),
  b_shot: A([
    [0, { ...DRAW, alx: 62, tx: 9 }], [0.05, { ...DRAW, alx: 78, alz: -10, tx: 4, ty: -22 }], [0.18, DRAW], [0.42, {}],
  ]),
  b_quick: A([[0, {}], [0.08, { ...DRAW, alx: 64 }], [0.12, { ...DRAW, alx: 80, alz: -10 }], [0.28, DRAW], [0.5, {}]]),
  b_hieb: A([
    [0, {}], [0.1, { arx: 85, sw: -85, ty: -60, tx: 8, alx: 20, py: -0.06 }], [0.2, { arx: 85, sw: -85, ty: 70, tx: 14 }, 'lin'],
    [0.28, { ty: 76 }], [0.55, {}],
  ]),
  b_finisher: A([
    [0, {}], [0.25, { arx: 128, sw: -128, arz: 6, alx: 100, alz: -30, ty: -15, tx: -14, hx: -28, py: -0.04 }], [1.2, { arx: 132, sw: -132, alx: 110, tx: -16 }],
    [1.3, { arx: 125, sw: -125, alx: 80, tx: -8 }], [1.8, { arx: 120, sw: -120, alx: 70 }], [2.35, {}],
  ]),
};

// ---------- visuals
registerTexture('bowwood', (g, n, rnd) => {
  g.fillStyle = '#7a4d26';
  g.fillRect(0, 0, n, n);
  g.fillStyle = '#5a3418';
  for (let y = 0; y < n; y += 3) g.fillRect(0, y, n, 1);
  g.fillStyle = '#9a6a38';
  for (let i = 0; i < n; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 2, 1);
});
export function buildBowMesh() {
  const g = new THREE.Group();
  const wood = lambert({ map: tex('bowwood', { size: 16 }) });
  const wrap = lambert({ map: tex('leather', { size: 16 }) });
  const sinew = new THREE.LineBasicMaterial({ color: '#efe6c8', fog: false });
  // limb: stack of boxes along a parabola, grip forward (+z), tips toward the archer
  const H = 0.78, N = 7;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const y = -H + (2 * H * i) / N;
    pts.push({ y, z: 0.3 * (1 - (y / H) ** 2) });
  }
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.y - a.y, b.z - a.z) + 0.03;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.075, len, 0.075), wood);
    seg.position.set(0, (a.y + b.y) / 2, (a.z + b.z) / 2);
    seg.rotation.x = Math.atan2(b.z - a.z, b.y - a.y) * -1;
    g.add(seg);
  }
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.1), wrap);
  grip.position.set(0, 0, 0.3);
  const tipT = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.08), lambert({ map: tex('bone', { size: 16 }) }));
  tipT.position.set(0, H, 0.0);
  const tipB = tipT.clone();
  tipB.position.y = -H;
  g.add(grip, tipT, tipB);
  // string (Line: tipTop -> nock -> tipBottom) + nocked arrow, animated in updateMesh
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const string = new THREE.Line(sg, sinew);
  string.frustumCulled = false;
  const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.95), lambert({ color: '#d8c090' }));
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.14), lambert({ color: '#d8dde6' }));
  head.position.z = 0.5;
  arrow.add(head);
  arrow.visible = false;
  g.add(string, arrow);
  g.userData.bow = { string, arrow, H, k: 0 };
  setString(g.userData.bow, 0);
  return g;
}
function setString(b, pull) {
  const a = b.string.geometry.attributes.position;
  a.setXYZ(0, 0, b.H, 0);
  a.setXYZ(1, 0, 0, -pull);
  a.setXYZ(2, 0, -b.H, 0);
  a.needsUpdate = true;
  b.arrow.position.set(0, 0, -pull + 0.38);
}

export const bow = {
  id: 'bow',
  name: 'Spannbogen',
  // A: Tipp = Schnellschuss, Halten = Spannen. B: Tipp = Bogenhieb (Finisher bei Wucht 100)
  holdThreshold: { A: 0.15, B: 0 },
  idle: {
    A: 'b_quick',
    holdA: (w) => (rolledRecently(w) ? 'b_draw_r' : 'b_draw'),
    B: 'b_hieb',
  },
  moves,
  anims,
  overrideEvent: (w, type) => (type === 'B' && w.wucht >= 100 ? 'b_finisher' : undefined),
  on: {
    shoot: (w, m, f) => fireShot(w, f.level),
    quick: (w) => fireShot(w, baseLevel(w), { quick: true }),
    rainMark: (w) => rainMark(w),
    rainDrop: (w) => rainDrop(w),
  },
  onUpdate(w, dt) {
    initData(w);
    if (w.data.baseT > 0) { w.data.baseT -= dt; if (w.data.baseT <= 0) w.data.base = 1; }
    const p = w.hooks.player;
    const m = w.move;
    if (!p?.ctx || !m) { w.data.aimDist = null; return; }
    if (m.aimed) {
      const aim = computeAim(p);
      p.rot = stepAngle(p.rot, aim.yaw, 18 * dt);
      w.data.aimDist = aim.dist;
    } else w.data.aimDist = null;
    if (m.rain) {
      const key = 'rain_' + p.id;
      if (w.t < BOW.rain.mark) {
        if (w.t > 0.05) {
          const tgt = rainTarget(p);
          const cur = w.data.rain ?? tgt;
          w.data.rain = { x: cur.x + (tgt.x - cur.x) * Math.min(1, 6 * dt), z: cur.z + (tgt.z - cur.z) * Math.min(1, 6 * dt) };
          p.ctx.fx?.marker(key, { x: w.data.rain.x, y: p.ctx.world.heightAt(w.data.rain.x, w.data.rain.z), z: w.data.rain.z }, BOW.rain.radius * (0.7 + 0.3 * Math.sin(w.t * 18)), '#ffe14d', false);
        }
      } else p.ctx.fx?.clearMarker(key);
    }
  },
  buildMesh: buildBowMesh,
  updateMesh(w, mesh, dt) {
    const b = mesh?.userData.bow;
    if (!b) return;
    let pull = 0, show = false;
    if (w.charging) { pull = 0.1 + 0.5 * Math.min(1, w.chargeT / BOW.levelTimes[1]); show = true; }
    else if (w.moveId === 'b_quick') { pull = 0.55 * Math.min(1, w.t / 0.09); show = w.t < 0.09; }
    else if (w.moveId === 'b_finisher') { pull = w.t < 1.2 ? 0.6 : 0; show = w.t < 1.2; }
    b.k += (pull - b.k) * (1 - Math.exp(-40 * dt));
    if (!pull && !show) b.k = 0;
    setString(b, b.k);
    b.arrow.visible = show;
  },
  status(w) {
    initData(w);
    const tip = w.hooks.player?.ammoTip;
    const tipTxt = tip && TIPS[tip] ? ` · ${TIPS[tip].name}` : '';
    if (w.charging) {
      const lvl = w.chargeLevel + 1;
      const d = w.data.aimDist;
      const cue = d == null ? '' : { sweet: ' · Sweet Spot', near: ' · zu nah', far: ' · zu weit' }[sweetCue(d)];
      return { text: `${SHOTS[lvl].name}${cue}${tipTxt}`, level: lvl, max: 3 };
    }
    if (w.wucht >= 100) return { text: 'Pfeilregen: B' + tipTxt, level: 0, max: 0 };
    if (w.data.base > 1) return { text: 'Rhythmus' + tipTxt, level: w.data.base, max: 3 };
    if (tipTxt) return { text: tipTxt.slice(3), level: 0, max: 0 };
    return null;
  },
};
