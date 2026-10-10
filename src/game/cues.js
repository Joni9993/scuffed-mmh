// Lesbarkeit: Windup-Ton + Farbcue pro Angriff, Phasen-/Erschoepft-/Retarget-Hinweise, Kamera-Framing, Tod-Log.
import { deathlog } from '../meta/deathlog.js';

export const TIMBRES = ['brumm', 'schrill', 'knurr', 'zisch', 'droehn', 'klick'];
const TIMBRE_COLOR = { brumm: '#ff9a3c', schrill: '#ffe94a', knurr: '#ff4a3c', zisch: '#5fe0ff', droehn: '#b05cff', klick: '#7dff6a' };

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** deterministisch: { timbre, f (Hz), color } */
export function pickTone(attackId, cue, chainIdx = 0) {
  const h = hashStr(String(attackId));
  const timbre = TIMBRES.includes(cue?.tone) ? cue.tone : TIMBRES[h % TIMBRES.length];
  const f = (110 + ((h >>> 8) % 7) * 22) * (1 + 0.12 * Math.min(chainIdx, 4));
  const base = /^#[0-9a-f]{6}$/i.test(cue?.color ?? '') ? cue.color : TIMBRE_COLOR[timbre];
  return { timbre, f, color: chainIdx > 0 ? shiftHue(base, 40 * chainIdx) : base };
}

export function shiftHue(hex, deg) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  h = (((h + deg) % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}

const hexRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

/** Rauszoom-Plan oder null: Kette (>=1) oder grosse Reichweite */
export function framingFor(inst, chainIdx = 0) {
  const r = inst?.def?.range;
  const far = Array.isArray(r) && r[1] >= 8;
  if (chainIdx < 1 && !far) return null;
  const amount = far ? 0.18 + 0.04 * Math.min(chainIdx, 2) : 0.15 + 0.05 * Math.min(chainIdx, 2);
  return { amount: Math.min(0.25, amount), seconds: Math.min(4, (inst?.duration ?? 1.5) + 0.6) };
}

export function attach(hunt) {
  const b = hunt.bus, offs = [];
  const glows = new Map(); // monster -> {rgb, t, teach}
  const track = new Map(); // monster -> {attackId, chainIdx, tg}
  const local = () => hunt.player;
  const near = (m) => { const p = local(); return !!p && (p.lock?.monster === m || Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < 16); };
  let now = 0;

  offs.push(b.on('attackStart', (e) => {
    const { monster, attackId, inst, chainIdx = 0, teach, cue } = e;
    if (!monster) return;
    const tg = Math.max(0.1, inst?.tgWall ?? 0.5);
    const tone = pickTone(attackId, cue, chainIdx);
    b.emit('sfx', { name: 'windup', pos: monster.pos, timbre: tone.timbre, f: tone.f * (teach ? 1.15 : 1), dur: tg, teach: !!teach });
    glows.set(monster, { rgb: hexRGB(tone.color), t: tg, teach: !!teach });
    track.set(monster, { attackId, chainIdx, tg });
    const fr = near(monster) ? framingFor(inst, chainIdx) : null;
    if (fr) hunt.rig?.frame?.(fr.amount, fr.seconds);
  }));
  offs.push(b.on('monsterPhase', (e) => {
    if (!e?.monster) return;
    glows.set(e.monster, { rgb: [1, 0.2, 0.1], t: 1.2, teach: true });
    b.emit('sfx', { name: 'phase', pos: e.monster.pos });
    hunt.hud?.banner?.(e.name ? String(e.name) : 'Neue Phase!', 2.5);
  }));
  offs.push(b.on('monsterTired', (e) => {
    if (!e?.on) return;
    b.emit('sfx', { name: 'tired', pos: e.monster?.pos });
    hunt.hud?.center?.('erschöpft!', 1.5);
  }));
  offs.push(b.on('retarget', (e) => {
    if (!e || e.playerId !== local()?.id) return;
    b.emit('sfx', { name: 'eye', vol: 0.8 });
    hunt.hud?.center?.('Er hat dich im Blick', 1.2);
  }));
  offs.push(b.on('playerDown', (e) => {
    if (e?.player && !e.player.local) return;
    const lh = e?.lastHit;
    if (!lh?.monsterId) return;
    let quick = false;
    for (const tr of track.values()) if (tr.attackId === lh.attackId) { quick = tr.chainIdx > 0 || tr.tg < 0.5; break; }
    deathlog.record(lh.monsterId, lh.attackId, quick);
  }));

  // Nach den Monster-Visuals (rig.update laeuft spaeter im Frame): Glow per max() auf emissive
  const rig = hunt.rig, origUpdate = rig?.update;
  if (rig) {
    rig.update = function (dt, p) {
      origUpdate.call(this, dt, p);
      now += dt;
      for (const [m, g] of glows) {
        g.t -= dt;
        if (g.t <= 0) { glows.delete(m); continue; }
        const pulse = g.teach ? 0.55 + 0.45 * Math.sin(now * 18) : 0.5 + 0.2 * Math.sin(now * 12);
        const k = pulse * Math.min(1, g.t / 0.15 + 0.3);
        for (const part of m.parts ?? []) {
          if (part.gone) continue;
          for (const mat of part.mats) if (mat.emissive) mat.emissive.setRGB(Math.max(mat.emissive.r, g.rgb[0] * k), Math.max(mat.emissive.g, g.rgb[1] * k), Math.max(mat.emissive.b, g.rgb[2] * k));
        }
      }
    };
  }
  return () => { offs.forEach((o) => o?.()); if (rig && origUpdate) rig.update = origUpdate; glows.clear(); };
}
