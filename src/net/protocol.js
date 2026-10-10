// Netzwerk-Protokoll: Nachrichtentypen, kompakte Kodierung, Raumcodes, Duplikat-Filter.
// Reine Funktionen (kein DOM/THREE) -> unit-getestet in tests/unit/net.test.js.

export const MSG = {
  HELLO: 'hello', PROFILE: 'prof', LOBBY: 'lobby', READY: 'ready', START: 'start',
  P: 'p', M: 'm', ATK: 'atk', HIT: 'hit', GATHER: 'gather', FX: 'fx', EV: 'ev', END: 'end', PING: 'ping',
  QB: 'qb', TP: 'tp', // Auftragsbrett (Raum-Ebene), Stadt-Präsenz
};
/** Nachrichten, die der Host von Gästen an die anderen Gäste weiterreicht (alles andere geht nur an den Host). */
export const RELAY = new Set([MSG.P, MSG.FX, MSG.GATHER, MSG.TP]);
/** Nachrichten, bei denen Duplikate keinen Schaden anrichten dürfen (haben eine Nachrichten-ID `i`). */
export const IDEMPOTENT = new Set([MSG.HIT, MSG.GATHER, MSG.EV, MSG.FX, MSG.END]);

export const MAX_PLAYERS = 4;
export const PEER_PREFIX = 'scuffedhunter-';

// ---------- Raumcodes
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // ohne I und O
export const CODE_LEN = 4;
export function generateRoomCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_CHARS[Math.min(CODE_CHARS.length - 1, Math.floor(rand() * CODE_CHARS.length))];
  return s;
}
/** Tastatur-Eingabe säubern: Großbuchstaben, nur erlaubte Zeichen, max. 4. */
export function normalizeCode(str) {
  return String(str ?? '').toUpperCase().split('').filter((c) => CODE_CHARS.includes(c)).join('').slice(0, CODE_LEN);
}
export const isValidCode = (c) => typeof c === 'string' && c.length === CODE_LEN && [...c].every((ch) => CODE_CHARS.includes(ch));
export const peerIdFor = (code) => PEER_PREFIX + code;

// ---------- Zahlen runden
export const r1 = (n) => Math.round(n * 10) / 10;
export const r2 = (n) => Math.round(n * 100) / 100;
export const r3 = (n) => Math.round(n * 1000) / 1000;
export const r4 = (n) => Math.round(n * 10000) / 10000;

// ---------- Pirscher-Snapshot  (15 Hz)
export const PLAYER_STATES = ['free', 'roll', 'flinch', 'down', 'pinned', 'ko'];
/**
 * in:  { x,y,z, rot, state, anim|null, animT, level, charging, speed, sprint, air, hp, maxHp }   (Zustand des lokalen Pirschers)
 * out: kompakte Kurzschlüssel-Form fürs Netz. T = Sender-Zeit in Sekunden (Wanduhr).
 */
export function encodeP(s, T) {
  const o = { T: Math.round(T * 1000), x: r2(s.x), y: r2(s.y), z: r2(s.z), r: r2(s.rot), s: Math.max(0, PLAYER_STATES.indexOf(s.state)) };
  if (s.anim) { o.a = s.anim; o.t = r2(s.animT); if (s.level) o.l = s.level; if (s.charging) o.c = 1; }
  else if (s.state === 'roll') o.t = r2(s.animT);
  if (s.speed > 0.05) o.v = r1(s.speed);
  if (s.sprint) o.g = 1;
  if (s.air) o.w = r2(s.air);
  o.h = Math.round(s.hp); o.m = Math.round(s.maxHp);
  return o;
}
export function decodeP(o) {
  return {
    T: o.T / 1000, x: o.x, y: o.y, z: o.z, rot: o.r, state: PLAYER_STATES[o.s] ?? 'free',
    anim: o.a ?? null, animT: o.t ?? 0, level: o.l ?? 0, charging: !!o.c, speed: o.v ?? 0, sprint: !!o.g, air: o.w ?? 0, hp: o.h, maxHp: o.m,
  };
}

// ---------- Brocken-Snapshot  (10 Hz)
export const MONSTER_STATES = ['wander', 'notice', 'combat', 'enrage', 'flee', 'sleep', 'dead'];
export const MF = { RAGE: 1, DISCOVERED: 2, STUN: 4, STAG: 8, TIRED: 16, RUST: 32, SCALD: 64 };
/** in: { id, def, x,y,z, rot, state, hpPct, rage, discovered, stun, stag, atk (Schlüssel|0), parts:[{hp, broken}] } */
export function encodeMonster(s) {
  let f = 0;
  if (s.rage) f |= MF.RAGE;
  if (s.discovered) f |= MF.DISCOVERED;
  if (s.stun) f |= MF.STUN;
  if (s.stag) f |= MF.STAG;
  if (s.tired) f |= MF.TIRED;
  if (s.rust) f |= MF.RUST;
  if (s.scald) f |= MF.SCALD;
  const si = MONSTER_STATES.indexOf(s.state);
  const out = {
    i: s.id, d: s.def, x: r2(s.x), y: r2(s.y), z: r2(s.z), r: r3(s.rot), s: si < 0 ? s.state : si, h: r3(s.hpPct), f,
    a: s.atk || 0, p: s.parts.map((p) => (p.broken ? -1 : p.hp === Infinity ? 0 : Math.round(p.hp))),
  };
  if (s.phase) out.ph = s.phase;
  if (s.extra && Object.keys(s.extra).length) out.xt = s.extra; // def.snapExtra (klein, flach)
  return out;
}
export function decodeMonster(o) {
  return {
    id: o.i, def: o.d, x: o.x, y: o.y, z: o.z, rot: o.r, state: typeof o.s === 'number' ? MONSTER_STATES[o.s] : o.s, hpPct: o.h,
    rage: !!(o.f & MF.RAGE), discovered: !!(o.f & MF.DISCOVERED), stun: !!(o.f & MF.STUN), stag: !!(o.f & MF.STAG), tired: !!(o.f & MF.TIRED), rust: !!(o.f & MF.RUST), scald: !!(o.f & MF.SCALD), phase: o.ph ?? 0, atk: o.a || 0, extra: o.xt,
    parts: o.p.map((hp) => ({ hp: hp < 0 ? 0 : hp, broken: hp < 0 })),
  };
}
/** Brocken-Nachricht: { T, q:[timeLeft, teamKo], l:[monsters] } */
export function encodeM(T, timeLeft, teamKo, monsters) {
  return { T: Math.round(T * 1000), q: [Math.round(timeLeft * 10) / 10, teamKo], l: monsters.map(encodeMonster) };
}
export function decodeM(o) {
  return { T: o.T / 1000, timeLeft: o.q[0], teamKo: o.q[1], monsters: o.l.map(decodeMonster) };
}

// ---------- Brocken-Angriff (Host -> alle): genau die Start-Parameter der AttackInstance
const v3 = (p) => [r3(p.x), r3(p.y ?? 0), r3(p.z)];
const unv3 = (a) => ({ x: a[0], y: a[1], z: a[2] });
export function encodeAtk(monsterId, params, T) {
  const o = {
    T: Math.round(T * 1000), m: monsterId, a: params.attackId, t: r3(params.t0), o: v3(params.origin),
    y: r4(params.yaw ?? Math.atan2(params.dir?.x ?? 0, params.dir?.z ?? 1)), g: v3(params.targetPos ?? params.origin), s: params.seed >>> 0, r: params.rage ? 1 : 0,
  };
  if (params.tgMul !== undefined && params.tgMul !== 1) o.k = r3(params.tgMul);
  if (params.chainIdx) o.c = params.chainIdx;
  if (params.teach) o.e = 1;
  return o;
}
export function decodeAtk(o) {
  const params = { attackId: o.a, t0: o.t, origin: unv3(o.o), yaw: o.y, targetPos: unv3(o.g), seed: o.s, rage: !!o.r };
  if (o.k !== undefined) params.tgMul = o.k;
  if (o.c) params.chainIdx = o.c;
  if (o.e) params.teach = true;
  return { T: o.T / 1000, monsterId: o.m, params };
}

// ---------- Treffer (Gast -> Host)
let _hid = 0;
/** i = Nachrichten-ID (pro Sender hochzählend) -> Host wendet jeden Treffer genau einmal an. */
export function encodeHit(monsterId, res, attackerId, id = ++_hid) {
  const o = { i: id, m: monsterId, p: res.partId, d: Math.round(res.dmg), a: attackerId };
  if (res.elemDmg) o.e = Math.round(res.elemDmg);
  if (res.blunt) o.b = r1(res.blunt);
  if (res.crit) o.c = 1;
  if (res.weak) o.w = 1;
  if (res.rostBuild) o.r = Math.min(100, Math.round(res.rostBuild));
  if (res.partDmgMul && res.partDmgMul !== 1) o.q = r1(res.partDmgMul); // Kroll-Ast: Teil-HP-Schaden
  return o;
}
export function decodeHit(o) {
  return { id: o.i, monsterId: o.m, res: { partId: o.p, dmg: o.d, elemDmg: o.e ?? 0, blunt: o.b ?? 0, crit: !!o.c, weak: !!o.w, ...(o.r ? { rostBuild: o.r } : {}), ...(o.q ? { partDmgMul: o.q } : {}), attackerId: o.a } };
}
export const MAX_HIT_DMG = 5000;
export const validHit = (h) => Number.isFinite(h.res.dmg) && h.res.dmg > 0 && h.res.dmg <= MAX_HIT_DMG && typeof h.monsterId === 'string';

// ---------- Duplikat-Filter / Ledger
/** Merkt sich (Absender, ID)-Paare; seen() liefert true, wenn schon bekannt. Begrenzt, damit nichts wächst. */
export class Dedupe {
  constructor(max = 1024) { this.max = max; this.set = new Set(); this.order = []; }
  seen(from, id) {
    if (id === undefined || id === null) return false;
    const k = from + '#' + id;
    if (this.set.has(k)) return true;
    this.set.add(k); this.order.push(k);
    if (this.order.length > this.max) this.set.delete(this.order.shift());
    return false;
  }
}
/** Host: wendet einen Gast-Treffer höchstens einmal an. apply(hit) -> Ergebnis; Duplikate/ungültige -> null. */
export function applyHitOnce(ledger, from, hit, apply) {
  if (!validHit(hit)) return null;
  if (ledger.seen(from, hit.id)) return null;
  return apply(hit);
}

// ---------- Nachrichten-Hülle (Draht-Format): t = Typ, f = Absender, i = Nachrichten-ID, d = Nutzlast
export const wrap = (t, f, i, d) => ({ t, f, i, d });

// ---------- deutsche Fehlertexte
export const ERR = {
  notFound: 'Raum nicht gefunden',
  full: 'Raum voll',
  started: 'Jagd läuft schon',
  lost: 'Verbindung verloren',
  server: 'Server nicht erreichbar',
  timeout: 'Verbindung blockiert – anderes Netz/WLAN probieren',
  hostLeft: 'Host hat die Jagd verlassen',
  badCode: 'Code: 4 Buchstaben',
};

// ---------- Stadt-Präsenz (Raum-Ebene, ~10 Hz): Position/Blickrichtung/Animation
/** in: { x,y,z, rot, anim, speed } */
export function encodeTown(s, T) {
  const o = { T: Math.round(T * 1000), x: r2(s.x), y: r2(s.y), z: r2(s.z), r: r2(s.rot) };
  if (s.anim) o.a = s.anim;
  if (s.speed > 0.05) o.v = r1(s.speed);
  if (s.emote) { o.e = s.emote; o.en = s.emoteN ?? 0; } // [T] emote id (1..6) + counter, repeated while the bubble is up
  if (s.color !== undefined) o.c = s.color; // [T] colour index (save palette)
  if (s.weapon) o.w = s.weapon; // [T] weapon type shown on the back
  if (s.gear) o.g = s.gear; // [G] compact gear code (armor per slot, weapon type/tier/branch, colour): data/gearlook.js
  return o;
}
export const decodeTown = (o) => ({ T: o.T / 1000, x: o.x, y: o.y, z: o.z, rot: o.r, anim: o.a ?? null, speed: o.v ?? 0, emote: o.e ?? 0, emoteN: o.en ?? 0, color: o.c ?? 0, weapon: o.w ?? 'gs', gear: typeof o.g === 'string' ? o.g.slice(0, 8) : null });

/** Glitch-Modus-Event (MSG.EV): Mitspieler sehen den Pirscher flackern. */
export const encodeGlitch = (on) => ({ k: 'glitch', on: on ? 1 : 0 });
export const decodeGlitch = (d) => (d && d.k === 'glitch' ? { on: !!d.on } : null);
