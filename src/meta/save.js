// Save game (GDD 8.5): localStorage `scuffedhunter.save.v1`, version field + migrations, Base64 export/import.
// Everything is try/catch-safe (private mode, quota, corrupt JSON). Pure functions + a tiny store wrapper.
import { ITEMS, BOX_MAX } from '../data/items.js';
import { ARMOR_PIECES, DEFAULT_ARMOR, SLOTS } from '../data/armor.js';
import { WEAPON_TYPES } from '../data/weapons.js';
import { FOODS } from '../data/foods.js';

export const SAVE_KEY = 'scuffedhunter.save.v1';
export const CURRENT_VERSION = 1;
export const MAX_SCHROTT = 999999;
export const BAR_SLOTS = 8;

export function defaultSave() {
  const armorOwned = {};
  for (const id of Object.values(DEFAULT_ARMOR)) armorOwned[id] = true;
  return {
    version: CURRENT_VERSION,
    name: 'Pirscher', nameSet: false,
    jr: 1, schrott: 0,
    box: {},
    weapons: { gs: { tier: 1, branch: null }, db: { tier: 1, branch: null }, bow: { tier: 1, branch: null } },
    armorOwned,
    loadout: { weapon: 'gs', armor: { ...DEFAULT_ARMOR }, items: [] },
    meal: null,
    clears: {},
    stats: { hunts: 0, wins: 0, fails: 0 },
    created: Date.now(), updated: Date.now(),
  };
}

// ---- migrations: version N -> N+1. Add a new entry when the format changes.
export const MIGRATIONS = {
  // v0 was an early prototype layout: { playerName, rank, money, inv:{id:n}, weapon:'gs' }
  0(d) {
    const out = { ...d, version: 1 };
    out.name = d.playerName ?? d.name;
    out.nameSet = !!(d.playerName ?? d.name);
    out.jr = d.rank ?? d.jr;
    out.schrott = d.money ?? d.schrott;
    out.box = d.inv ?? d.box;
    if (d.weapon && typeof d.weapon === 'string') out.loadout = { weapon: d.weapon };
    delete out.playerName; delete out.rank; delete out.money; delete out.inv; delete out.weapon;
    return out;
  },
};

const int = (v, lo, hi, def) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Make arbitrary data a valid current-version save (drops unknown ids, clamps numbers). */
export function sanitize(d) {
  const base = defaultSave();
  if (!isObj(d)) return base;
  const s = base;
  s.name = typeof d.name === 'string' && d.name.trim() ? cleanName(d.name) : base.name;
  s.nameSet = !!d.nameSet;
  s.jr = int(d.jr, 1, 4, 1);
  s.schrott = int(d.schrott, 0, MAX_SCHROTT, 0);
  s.created = Number(d.created) || base.created;
  s.updated = Number(d.updated) || base.updated;
  if (isObj(d.box)) for (const [id, n] of Object.entries(d.box)) if (ITEMS[id]) { const c = int(n, 0, BOX_MAX, 0); if (c > 0) s.box[id] = c; }
  for (const type of Object.keys(WEAPON_TYPES)) {
    const w = d.weapons?.[type];
    if (!isObj(w)) continue;
    const tier = int(w.tier, 1, WEAPON_TYPES[type].tiers.length, 1);
    s.weapons[type] = { tier, branch: tier === 3 ? (w.branch === 'b' ? 'b' : 'a') : (tier === 4 && (w.branch === 'a' || w.branch === 'b') ? w.branch : null) };
  }
  if (isObj(d.armorOwned)) for (const id of Object.keys(d.armorOwned)) if (ARMOR_PIECES[id] && d.armorOwned[id]) s.armorOwned[id] = true;
  const lo = d.loadout;
  if (isObj(lo)) {
    if (WEAPON_TYPES[lo.weapon]) s.loadout.weapon = lo.weapon;
    for (const slot of SLOTS) {
      const id = lo.armor?.[slot];
      if (ARMOR_PIECES[id]?.slot === slot && s.armorOwned[id]) s.loadout.armor[slot] = id;
    }
    if (Array.isArray(lo.items)) {
      const seen = new Set();
      for (const e of lo.items) {
        const def = ITEMS[e?.id];
        if (!def || (def.kind !== 'consumable' && def.kind !== 'ammo') || seen.has(e.id) || s.loadout.items.length >= BAR_SLOTS) continue;
        seen.add(e.id);
        const n = int(e.n, 0, def.max, 0);
        if (n > 0) s.loadout.items.push({ id: e.id, n });
      }
    }
  }
  s.meal = FOODS[d.meal] ? d.meal : null;
  if (isObj(d.clears)) for (const [id, n] of Object.entries(d.clears)) { const c = int(n, 0, 99999, 0); if (c > 0 && /^[a-z_]{1,32}$/.test(id)) s.clears[id] = c; }
  if (isObj(d.stats)) for (const k of Object.keys(s.stats)) s.stats[k] = int(d.stats[k], 0, 1e9, 0);
  s.version = CURRENT_VERSION;
  return s;
}

export function cleanName(n) {
  return String(n).replace(/[^\p{L}\p{N} _\-.!]/gu, '').trim().slice(0, 12) || 'Pirscher';
}

/** Run migrations. Returns a valid save, or null if the data is from a newer game version / not an object. */
export function migrate(data) {
  if (!isObj(data)) return null;
  let d = { ...data };
  let v = Number.isInteger(d.version) ? d.version : 0;
  if (v > CURRENT_VERSION) return null;
  while (v < CURRENT_VERSION) {
    const fn = MIGRATIONS[v];
    if (!fn) return null;
    d = fn(d);
    v = d.version;
  }
  return sanitize(d);
}

// ---- export / import (Base64 of UTF-8 JSON, with a checksum so typos are caught)
export function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function b64decode(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function checksum(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}
export const CODE_PREFIX = 'SH1';

export function exportCode(save) {
  const body = b64encode(JSON.stringify(save));
  return `${CODE_PREFIX}.${checksum(body)}.${body}`;
}

/** -> {ok:true, save} | {ok:false, error} */
export function importCode(code) {
  try {
    const clean = String(code ?? '').replace(/\s+/g, '');
    const [prefix, sum, body] = clean.split('.');
    if (prefix !== CODE_PREFIX || !sum || !body) return { ok: false, error: 'Das ist kein Speicher-Code.' };
    if (checksum(body) !== sum) return { ok: false, error: 'Code beschädigt (Prüfsumme falsch).' };
    const data = JSON.parse(b64decode(body));
    const save = migrate(data);
    if (!save) return { ok: false, error: 'Code stammt aus einer neueren Version.' };
    return { ok: true, save };
  } catch {
    return { ok: false, error: 'Code unlesbar.' };
  }
}

// ---- storage
function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}
function browserStorage() {
  try { return globalThis.localStorage ?? memoryStorage(); } catch { return memoryStorage(); }
}

/** Parse + migrate a raw string from storage. Corrupt -> null. */
export function parseSave(raw) {
  try { return raw ? migrate(JSON.parse(raw)) : null; } catch { return null; }
}

export function createSaveStore({ storage, key = SAVE_KEY } = {}) {
  const st = storage ?? browserStorage();
  let cache = null;
  let warned = false;

  const read = () => {
    let raw = null;
    try { raw = st.getItem(key); } catch { /* storage blocked */ }
    const parsed = parseSave(raw);
    if (parsed) return parsed;
    if (raw) { try { st.setItem(`${key}.corrupt`, raw); } catch { /* ignore */ } }
    return defaultSave();
  };
  const write = () => {
    cache.updated = Date.now();
    try { st.setItem(key, JSON.stringify(cache)); return true; } catch { warned = true; return false; }
  };

  const store = {
    /** current save (live object – mutate it, then call flush()) */
    get() { if (!cache) cache = read(); return cache; },
    set(save) { cache = sanitize(save); write(); return cache; },
    /** run fn(save) then autosave */
    update(fn) { const s = store.get(); const r = fn(s); write(); return r; },
    flush() { store.get(); return write(); },
    reset() { cache = defaultSave(); write(); return cache; },
    exportCode() { return exportCode(store.get()); },
    importCode(code) { const r = importCode(code); if (r.ok) store.set(r.save); return r; },
    /** test/debug helper: put items into the box (capped), e.g. save.give('glutbrocken', 5) */
    give(id, n = 1) {
      if (id === 'schrott') return store.update((s) => { s.schrott = int(s.schrott + n, 0, MAX_SCHROTT, 0); return s.schrott; });
      if (!ITEMS[id]) throw new Error(`unknown item "${id}"`);
      return store.update((s) => { s.box[id] = int((s.box[id] ?? 0) + n, 0, BOX_MAX, 0); if (!s.box[id]) delete s.box[id]; return s.box[id] ?? 0; });
    },
    get failed() { return warned; },
  };
  return store;
}

/** App-wide store (browser localStorage). */
export const saveStore = createSaveStore();
