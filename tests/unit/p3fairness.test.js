// Fairness audit (phase 3): every Brocken attack can be dodged with a well-timed roll, is telegraphed, leaves a recovery window.
// Run with P3_VERBOSE=1 to print the audit table.
import { describe, it, expect, beforeEach } from 'vitest';
import { Monster } from '../../src/game/monsters/monster.js';
import { jaggo } from '../../src/game/monsters/jaggo.js';
import { jaggling } from '../../src/game/monsters/jaggling.js';
import { barrotz } from '../../src/game/monsters/barrotz.js';
import { brathalos } from '../../src/game/monsters/brathalos.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { Player } from '../../src/game/player.js';
import { ROLL, rollPhase } from '../../src/game/vitals.js';
import { time } from '../../src/core/time.js';
import { makeCtx, DT } from './p3helpers.js';

beforeEach(() => time.reset());

const DEFS = { jaggo, barrotz, brathalos, jaggling };
const FULL = !!process.env.P3_FULL; // full audit (all distances, all 4 directions, 1-frame steps, Rotglut): ~2 min; default: hardest distance, back/left, 2-frame steps
const DIRS = FULL ? { back: [0, -1], left: [-1, 0], right: [1, 0], through: [0, 1] } : { back: [0, -1], left: [-1, 0] };
const STEP = FULL ? 1 : 2;

/** One attack, one stationary hunter at distance d (+z of the monster), optional rolls [{t, dir}]. Returns damage events. */
function simulate(def, attackId, d, rolls, { rage = false, seed = 11 } = {}) {
  const ctx = makeCtx(3);
  ctx.cameraYaw = Math.PI; // camera looks toward the monster: stick y>0 = toward, y<0 = away
  const m = new Monster(def, ctx, { id: def.id, x: 0, z: 0, yaw: 0, state: 'combat', seed });
  m.recover = 99; // no AI attacks of its own
  ctx.monsters.push(m);
  const p = new Player({ ctx });
  p.spawnAt(0, d, Math.PI);
  ctx.players.push(p);
  m.target = p;
  m.rage = rage; if (rage) m.rageT = 1e9;
  const taken = [];
  const orig = p.takeHit.bind(p);
  p.takeHit = (h) => { const r = orig(h); taken.push({ t: ctx_t, r, dmg: h.dmg, key: h.key, knock: h.knock }); return r; };
  let ctx_t = 0;
  if (attackId === 'brathalos_sturz') { m.setState('fly'); m.air = 7; }
  const inst = m.beginAttack(attackId, attackId === 'brathalos_sturz' ? { origin: { x: 0, y: 0, z: 0 } } : {});
  const firedRolls = new Set();
  const tEnd = inst.duration + 2.5;
  let attackEnd = null;
  for (let i = 0; ctx_t < tEnd; i++) {
    for (const r of rolls) {
      if (!firedRolls.has(r) && ctx_t >= r.t - 1e-9) {
        firedRolls.add(r);
        const s = DIRS[r.dir];
        ctx.input.setStick(s[0], s[1], 'bot');
        ctx.input.press('roll', 50);
      }
    }
    ctx.input.poll(DT);
    p.update(DT);
    ctx.input.setStick(0, 0, 'bot');
    m.update(DT);
    m.recover = 99;
    if (!m.attack && attackEnd === null) attackEnd = ctx_t;
    ctx_t += DT;
    if (p.state === 'ko') break;
  }
  const hurt = taken.filter((e) => e.r === 'hit' || e.r === 'block');
  return { hurt, taken, inst, perfect: taken.filter((e) => e.r === 'perfect').length };
}

function audit(def, id, d, opts = {}) {
  const probe = simulate(def, id, d, [], opts);
  const inst = probe.inst;
  const res = { id, d, dodgeable: false, window: 0, dirs: [], needsTwo: false, perfectFrames: 0, wideFrames: 0 };
  const T = inst.duration;
  let best = { w: 0 };
  for (const [dn] of Object.entries(DIRS)) {
    let ok = 0, perfect = 0, run = 0, maxRun = 0;
    for (let t = 0; t <= T; t += DT * STEP) {
      const r = simulate(def, id, d, [{ t, dir: dn }], opts);
      if (r.hurt.length === 0) { ok++; run++; maxRun = Math.max(maxRun, run); if (r.perfect) perfect++; } else run = 0;
    }
    if (ok > 0) res.dirs.push(dn);
    if (maxRun > best.w) best = { w: maxRun, dir: dn, perfect, ok };
  }
  res.dodgeable = best.w > 0;
  res.window = best.w * DT * STEP;
  res.perfectFrames = best.perfect ?? 0;
  res.bestDir = best.dir;
  res.hits = probe.hurt.length;
  return res;
}

// attack -> start distances to test (inside the valid range)
const CASES = [
  [jaggo, 'jaggo_bissreihe', [2.5, 4.5]],
  [jaggo, 'jaggo_huepfer', [5, 9]],
  [jaggo, 'jaggo_schwanz', [1.5, 4]],
  [jaggo, 'jaggo_rudelruf', [3, 7]],
  [jaggling, 'jaggling_biss', [1.5]],
  [jaggling, 'jaggling_sprung', [4, 7]],
  [barrotz, 'barrotz_ramm', [9, 16]],
  [barrotz, 'barrotz_hammer', [3, 6]],
  [barrotz, 'barrotz_feger', [2.5, 5]],
  [barrotz, 'barrotz_spritzer', [5, 10]],
  [brathalos, 'brathalos_feuer', [6, 14]],
  [brathalos, 'brathalos_sturz', [6, 12]],
  [brathalos, 'brathalos_boee', [3, 6]],
  [brathalos, 'brathalos_schwanz', [2.5, 5]],
  [brathalos, 'brathalos_bruellen', [4, 8]],
];

const rows = [];
describe('fairness audit: every attack can be dodged by a well-timed roll (god off)', () => {
  for (const [def, id, dists] of CASES) {
    it(`${id}: dodgeable at every valid start distance, window >= 100 ms`, () => {
      const atk = def.attacks[id];
      for (const d of FULL ? dists : [dists[0]]) {
        const r = audit(def, id, d);
        const rr = FULL ? audit(def, id, d, { rage: true }) : r;
        rows.push({ id, d, r, rr, atk });
        if (process.env.P3_VERBOSE) console.log(`${id.padEnd(20)} d=${String(d).padEnd(4)} dodge ${r.dodgeable ? 'yes' : 'NO '} window ${(r.window * 1000).toFixed(0).padStart(4)} ms dirs ${r.dirs.join('/')} | rage window ${(rr.window * 1000).toFixed(0)} ms ${rr.dodgeable ? '' : 'NO'}`);
        expect(r.dodgeable, `${id} @${d} m cannot be dodged`).toBe(true);
        expect(r.window, `${id} @${d} dodge window`).toBeGreaterThanOrEqual(0.1);
        expect(rr.dodgeable, `${id} @${d} m (Rotglut) cannot be dodged`).toBe(true);
      }
    });
  }
});

describe('fairness audit: telegraph and recovery', () => {
  const big = (atk) => (atk.hits ?? []).some((h) => h.dmg >= 20) || atk.id === 'barrotz_ramm';
  for (const [def, id] of CASES) {
    const atk = def.attacks[id];
    const hits = atk.hits ?? [];
    const last = hits.length ? Math.max(...hits.map((h) => h.t1)) : null;
    const rec = last == null ? null : atk.duration - last;
    if (process.env.P3_VERBOSE) console.log(`${id.padEnd(20)} telegraph ${atk.telegraph.toFixed(2)} (rage ${Math.max(0.5, atk.telegraph * 0.8).toFixed(2)})  last hit ends ${last ?? '-'}  recovery in-attack ${rec == null ? '-' : rec.toFixed(2)} + AI recover 0.35-0.85`);
    it(`${id}: telegraph >= 0.5 s, big hits leave >= 0.6 s recovery`, () => {
      const ins = new AttackInstance(atk, { attackId: id, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 6 }, seed: 1 });
      expect(ins.firstHitTime()).toBeGreaterThanOrEqual(0.5 - 1e-9);
      const insR = new AttackInstance(atk, { attackId: id, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 6 }, seed: 1, rage: true });
      expect(insR.firstHitTime()).toBeGreaterThanOrEqual(0.5 - 1e-9);
      if (big(atk) && rec != null) {
        // recovery after the last hit, in wall time at normal speed (the monster additionally waits 0.35-0.85 s before its next move)
        expect(rec + 0.35).toBeGreaterThanOrEqual(0.6);
      }
    });
  }
});

describe('fairness audit: perfect-dodge window needs timing (~100 ms)', () => {
  it('i-frames 0.06-0.30 s, perfect = first 100 ms of them', () => {
    expect(ROLL.iStart).toBeCloseTo(0.06);
    expect(ROLL.perfectWindow).toBeCloseTo(0.1);
    expect(rollPhase(0.05).invuln).toBe(false);
    expect(rollPhase(0.07).phase).toBe('perfect');
    expect(rollPhase(0.159).phase).toBe('perfect');
    expect(rollPhase(0.17).phase).toBe('safe');
    expect(rollPhase(0.299).phase).toBe('safe');
    expect(rollPhase(0.31).invuln).toBe(false);
  });
  it('a stationary-target hit only counts as Glitch-Konter inside a ~100 ms band of roll timings (not for the whole i-frame span)', () => {
    // Jaggo Huepfer: sweep the roll press time, count timings that yield a perfect dodge vs plain i-frame dodges
    let perfect = 0, safe = 0;
    for (let t = 0; t <= 1.6; t += DT) {
      const r = simulate(jaggo, 'jaggo_huepfer', 6, [{ t, dir: 'left' }]);
      if (r.hurt.length) continue;
      if (r.perfect) perfect++; else if (r.taken.some((e) => e.r === 'iframe')) safe++;
    }
    if (process.env.P3_VERBOSE) console.log('huepfer: perfect timings', perfect, 'frames =', (perfect * DT * 1000).toFixed(0), 'ms; plain i-frame dodges', safe, 'frames =', (safe * DT * 1000).toFixed(0), 'ms');
    expect(perfect * DT).toBeLessThanOrEqual(0.2); // incl. the 30 ms "roll start position" grace
    expect(perfect * DT).toBeGreaterThan(0.05);
    expect(safe).toBeGreaterThan(0);
  });
});
