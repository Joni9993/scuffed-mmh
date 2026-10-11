// Krachkiste-Buffs (GDD 17.1): Samples -> Zonen -> Buff-Stufen. Reine Logik (kein THREE/DOM), unit-getestet in tests/unit/krachkiste.test.js.
//
// Farben/Zonen:  r (Rot ▲) = Kopf  -> Angriff +10 %
//                b (Blau ■) = Körper -> Puste-Verbrauch -25 % + kein Zurückstolpern bei leichten Treffern
//                g (Grün ●) = Glieder -> Tempo +10 % + 15 HP Heilung (einmalig pro Anwendung)
// Spieler-Zustand: p.buffs = { r?: {lvl, t}, b?: {...}, g?: {...} }  (lvl 1..3, t = Restsekunden)

import { healVitals } from './vitals.js';

export const BUFF = { DUR: 45, RADIUS: 8, ATK: 0.1, STAMINA: 0.25, SPEED: 0.1, HEAL: 15, BAR: 3 };
/** Stufe -> Stärke-Faktor: Stufe 1 = x1, Stufe 2 = x1,5, Stufe 3 = doppelt */
export const STRENGTH = [0, 1, 1.5, 2];
export const COLORS = ['r', 'b', 'g'];
export const SYMBOL = { r: '▲', b: '■', g: '●' };
export const SAMPLE_HEX = { r: '#ff4a3a', b: '#3a8cff', g: '#44e05a' };
export const BUFF_NAME = { r: 'Angriff', b: 'Puste', g: 'Tempo' };
export const ZONE_NAME = { head: 'Kopf', body: 'Körper', limb: 'Glieder' };
const ZONE_COLOR = { head: 'r', body: 'b', limb: 'g' };

const HEAD_PARTS = new Set(['head', 'kopf', 'augen', 'antennenkamm']); // Kopf-Anbauten (Kroll-Augenstiele, Voltaro-Kamm) zaehlen zum Kopf, damit jeder Grossbrocken Rot liefert
const BODY_PARTS = new Set(['body', 'koerper', 'kesselpanzer', 'spulen']);

/** Brocken-Teil-ID -> 'head' | 'body' | 'limb'. Gorgos 'segmentN' (Wurm) zählen als Körper, Augenstiele/Antennenkamm als Kopf; alles Unbekannte = Glieder. */
export function zoneOfPart(partId) {
  const id = String(partId ?? '');
  if (HEAD_PARTS.has(id)) return 'head';
  if (BODY_PARTS.has(id) || /^segment\d*$/.test(id)) return 'body';
  return 'limb';
}
/** Brocken-Teil-ID -> Sample-Farbe 'r' | 'b' | 'g' */
export const sampleOfPart = (partId) => ZONE_COLOR[zoneOfPart(partId)];

/** Sample in die Leiste legen (FIFO, max. 3). Gibt die neue Leiste zurück (mutiert `bar`). */
export function pushSample(bar, color) {
  if (!COLORS.includes(color)) return bar;
  bar.push(color);
  while (bar.length > BUFF.BAR) bar.shift();
  return bar;
}

/**
 * Leiste -> Buffs. 3 gleiche = Stufe 3 dieser Farbe, 2 gleiche = Stufe 2, sonst je Sample Stufe 1.
 * 3 verschiedene = REMIX (alle drei Stufe 1 + Druckwelle). force = Stufe erzwingen (Finisher "Zugabe!" = 3).
 * -> { buffs: [{c, lvl}], remix, empty }
 */
export function barBuffs(bar, force = 0) {
  const n = { r: 0, b: 0, g: 0 };
  for (const c of bar) if (c in n) n[c]++;
  const buffs = [];
  for (const c of COLORS) if (n[c] > 0) buffs.push({ c, lvl: force || Math.min(3, n[c]) });
  const remix = !force && n.r === 1 && n.b === 1 && n.g === 1;
  return { buffs, remix, empty: buffs.length === 0 };
}

// ---------------------------------------------------------------- Buff-Zustand am Pirscher
export const strength = (p, c) => { const b = p?.buffs?.[c]; return b && b.t > 0 ? STRENGTH[b.lvl] ?? 0 : 0; };
/** Angriff-Faktor (hunt.playerHit) */
export const atkMul = (p) => 1 + BUFF.ATK * strength(p, 'r');
/** Puste-Verbrauch-Faktor (vitals: v.buffMul) */
export const staminaMul = (p) => 1 - BUFF.STAMINA * strength(p, 'b');
/** Tempo-Faktor (player.#updateFree) */
export const speedMul = (p) => 1 + BUFF.SPEED * strength(p, 'g');
/** Blau: leichte Treffer (knock 'flinch') stolpern nicht zurück */
export const noFlinch = (p) => strength(p, 'b') > 0;

/**
 * Buff anwenden. Stärkere Stufe gewinnt, gleiche erneuert die Dauer, schwächere wird ignoriert.
 * -> true, wenn der Buff gesetzt/erneuert wurde.
 */
export function applyBuff(p, c, lvl, dur = BUFF.DUR) {
  if (!COLORS.includes(c) || !(lvl >= 1 && lvl <= 3)) return false;
  p.buffs ??= {};
  const cur = p.buffs[c];
  if (cur && cur.t > 0 && cur.lvl > lvl) return false;
  p.buffs[c] = { lvl: Math.round(lvl), t: dur };
  syncStamina(p);
  return true;
}

function syncStamina(p) { if (p.v) p.v.buffMul = staminaMul(p); }

/** pro Sim-Schritt: Dauer herunterzählen, abgelaufene Buffs entfernen. */
export function tickBuffs(p, dt) {
  const b = p.buffs;
  if (!b) return;
  let changed = false;
  for (const c of COLORS) {
    if (!b[c]) continue;
    b[c].t -= dt;
    if (b[c].t <= 0) { delete b[c]; changed = true; }
  }
  if (changed) syncStamina(p);
}
export function clearBuffs(p) { p.buffs = {}; syncStamina(p); }

/** Kurztext für HUD/Tests: "r2g1" (nur aktive, feste Reihenfolge r,b,g) */
export function buffKey(p) {
  let s = '';
  for (const c of COLORS) { const b = p?.buffs?.[c]; if (b && b.t > 0) s += c + b.lvl; }
  return s;
}

// ---------------------------------------------------------------- Netz-Event (EV k:'kk')
const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2 = (n) => Math.round(n * 100) / 100;
/** in: { x, z, bar:['r','b'..], buffs:[{c,lvl}], remix } -> kompakte Nutzlast */
export function encodeKk({ x, z, bar, buffs, remix, auto }) {
  const o = { k: 'kk', x: r2(x), z: r2(z), s: bar.join(''), b: buffs.map((e) => e.c + e.lvl).join('') };
  if (remix) o.rm = 1;
  if (auto) o.a = 1;
  return o;
}
/** -> { x, z, bar, buffs, remix, auto } oder null bei Müll (Netz-Eingabe wird nie vertraut) */
export function decodeKk(d) {
  if (!d || d.k !== 'kk' || !Number.isFinite(d.x) || !Number.isFinite(d.z)) return null;
  const s = String(d.s ?? '').slice(0, BUFF.BAR);
  if (![...s].every((c) => COLORS.includes(c))) return null;
  const buffs = [];
  const raw = String(d.b ?? '');
  if (raw.length > 6 || raw.length % 2) return null;
  for (let i = 0; i < raw.length; i += 2) {
    const c = raw[i], lvl = Number(raw[i + 1]);
    if (!COLORS.includes(c) || !(lvl >= 1 && lvl <= 3) || buffs.some((e) => e.c === c)) return null;
    buffs.push({ c, lvl });
  }
  if (!buffs.length) return null;
  return { x: clampN(d.x, -1e4, 1e4), z: clampN(d.z, -1e4, 1e4), bar: [...s], buffs, remix: !!d.rm, auto: !!d.a };
}
/** Leisten-Update eines Mitspielers (EV k:'kkb') – nur Optik des Sample-Kragens */
export const encodeKkBar = (bar) => ({ k: 'kkb', s: bar.join('') });
export function decodeKkBar(d) {
  if (!d || d.k !== 'kkb') return null;
  const s = String(d.s ?? '').slice(0, BUFF.BAR);
  return [...s].every((c) => COLORS.includes(c)) ? [...s] : null;
}

/**
 * Empfänger-Seite: wendet ein dekodiertes Abspiel-Event auf alle Pirscher im Radius an.
 * Lokale Pirscher: Buff + Heilung (client-autoritativ). Fremde Avatare: nur der Buff (HUD-Anzeige in der Party-Liste).
 * -> Liste der betroffenen Pirscher
 */
const healDefault = (p, hp) => {
  if (p.state === 'ko' || !p.v) return;
  healVitals(p.v, hp);
  p.ctx?.fx?.number?.({ x: p.pos.x, y: p.pos.y + 2.1, z: p.pos.z }, `+${Math.round(hp)}`, 'heal');
};
export function receiveKk(hunt, ev, { heal = healDefault } = {}) {
  const hit = [];
  for (const p of hunt.players ?? []) {
    if (!p.pos || Math.hypot(p.pos.x - ev.x, p.pos.z - ev.z) > BUFF.RADIUS) continue;
    let any = false;
    for (const { c, lvl } of ev.buffs) {
      if (!applyBuff(p, c, lvl)) continue;
      any = true;
      if (c === 'g' && p.local) heal(p, BUFF.HEAL * STRENGTH[lvl]);
    }
    if (any) hit.push(p);
  }
  return hit;
}
