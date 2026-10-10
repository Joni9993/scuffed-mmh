// Drop tables (GDD 8.3). Weighted carve tables, guaranteed/chance part-break bonuses, quest reward extras.
// All rolls take a seeded rng (core/rng.js) -> deterministic in tests.
// `n` is a fixed count or [min, max]. `matMul` (Rotglut variants: 2) multiplies every count.

export const DROPS = {
  jaggo: {
    carve: [{ id: 'jaggo_schuppe', w: 48 }, { id: 'jaggo_fell', w: 40 }, { id: 'jaggo_kamm', w: 4 }, { id: 'altknochen', w: 8 }],
    tail: [{ id: 'jaggo_fell', w: 70 }, { id: 'jaggo_schuppe', w: 30 }],
    breaks: { head: [{ id: 'jaggo_kamm', n: 1, chance: 1 }], tail: [{ id: 'jaggo_fell', n: 1, chance: 1 }] },
    reward: [{ id: 'jaggo_schuppe', n: [1, 2], chance: 1 }, { id: 'jaggo_fell', n: 1, chance: 0.5 }],
  },
  jaggling: {
    carve: [{ id: 'jaggling_schuppe', w: 1 }],
    tail: [], breaks: {}, reward: [],
  },
  // [L] neutral fauna: ONE carve per corpse gives the whole `once` list (guaranteed entries chance 1, rare ones < 1)
  mampfer: {
    carve: [{ id: 'rohfleisch', w: 1 }], tail: [], breaks: {}, reward: [],
    once: [{ id: 'rohfleisch', n: 2, chance: 1 }, { id: 'altknochen', n: 1, chance: 1 }, { id: 'mampfer_fell', n: 1, chance: 0.22 }],
  },
  mampferkalb: {
    carve: [{ id: 'rohfleisch', w: 1 }], tail: [], breaks: {}, reward: [],
    once: [{ id: 'rohfleisch', n: 1, chance: 1 }, { id: 'mampfer_fell', n: 1, chance: 0.08 }],
  },
  hoppler: {
    carve: [{ id: 'rohfleisch', w: 1 }], tail: [], breaks: {}, reward: [],
    once: [{ id: 'rohfleisch', n: 1, chance: 1 }],
  },
  barrotz: {
    carve: [{ id: 'barrotz_kruste', w: 55 }, { id: 'barrotz_schwanzleder', w: 30 }, { id: 'barrotz_platte', w: 6 }, { id: 'altknochen', w: 9 }],
    tail: [{ id: 'barrotz_schwanzleder', w: 100 }],
    breaks: { head: [{ id: 'barrotz_platte', n: 1, chance: 1 }], tail: [{ id: 'barrotz_schwanzleder', n: [1, 2], chance: 1 }] },
    reward: [{ id: 'barrotz_kruste', n: [1, 2], chance: 1 }, { id: 'barrotz_schwanzleder', n: 1, chance: 0.4 }],
  },
  brathalos: {
    carve: [{ id: 'brathalos_schuppe', w: 52 }, { id: 'brathalos_membran', w: 20 }, { id: 'glutsack', w: 17 }, { id: 'glutbrocken', w: 8 }, { id: 'brathalos_rubin', w: 3 }],
    tail: [{ id: 'brathalos_schuppe', w: 40 }, { id: 'glutsack', w: 40 }, { id: 'brathalos_membran', w: 20 }],
    breaks: {
      head: [{ id: 'brathalos_schuppe', n: [1, 2], chance: 1 }],
      wing: [{ id: 'brathalos_membran', n: 1, chance: 1 }],
      tail: [{ id: 'glutsack', n: 1, chance: 0.5 }],
    },
    reward: [{ id: 'brathalos_schuppe', n: [1, 2], chance: 1 }, { id: 'glutsack', n: 1, chance: 0.3 }, { id: 'glimmstein', n: 1, chance: 0.25 }],
  },
  // Rostwerke (GDD 15.4-15.7). Break-Tags siehe partTag(): panzer, schere, auge, segment, kamm, pranke, spule, head, tail.
  kroll: {
    carve: [{ id: 'kroll_panzer', w: 46 }, { id: 'kroll_schere', w: 26 }, { id: 'kroll_auge', w: 12 }, { id: 'kupferdraht', w: 12 }, { id: 'altknochen', w: 4 }],
    tail: [],
    breaks: {
      panzer: [{ id: 'kroll_panzer', n: [2, 3], chance: 1 }],
      schere: [{ id: 'kroll_schere', n: 1, chance: 1 }],
      auge: [{ id: 'kroll_auge', n: 1, chance: 0.5 }],
    },
    reward: [{ id: 'kroll_panzer', n: [1, 2], chance: 1 }, { id: 'kroll_schere', n: 1, chance: 0.5 }, { id: 'kroll_auge', n: 1, chance: 0.25 }],
  },
  gorgo: {
    carve: [{ id: 'gorgo_segment', w: 50 }, { id: 'gorgo_zahn', w: 28 }, { id: 'schlacke', w: 14 }, { id: 'gorgo_kern', w: 4 }, { id: 'altknochen', w: 4 }],
    tail: [],
    breaks: {
      segment: [{ id: 'gorgo_segment', n: 1, chance: 1 }],
      head: [{ id: 'gorgo_zahn', n: [1, 2], chance: 1 }],
    },
    reward: [{ id: 'gorgo_segment', n: [1, 2], chance: 1 }, { id: 'gorgo_zahn', n: 1, chance: 0.5 }, { id: 'gorgo_kern', n: 1, chance: 0.2 }],
  },
  voltaro: {
    carve: [{ id: 'voltaro_spule', w: 36 }, { id: 'voltaro_fell', w: 36 }, { id: 'voltaro_kamm', w: 12 }, { id: 'funkenstein', w: 12 }, { id: 'voltaro_herz', w: 4 }],
    tail: [{ id: 'voltaro_fell', w: 60 }, { id: 'voltaro_spule', w: 30 }, { id: 'voltaro_herz', w: 10 }], // Schwanz abgetrennt: bessere Chance aufs Herz
    breaks: {
      kamm: [{ id: 'voltaro_kamm', n: 1, chance: 1 }],
      pranke: [{ id: 'voltaro_fell', n: 1, chance: 1 }],
      spule: [{ id: 'voltaro_spule', n: 1, chance: 0.5 }],
      tail: [{ id: 'voltaro_fell', n: [1, 2], chance: 1 }, { id: 'voltaro_herz', n: 1, chance: 0.1 }],
    },
    reward: [{ id: 'voltaro_spule', n: [1, 2], chance: 1 }, { id: 'voltaro_fell', n: 1, chance: 0.5 }, { id: 'funkenstein', n: 1, chance: 0.4 }, { id: 'voltaro_herz', n: 1, chance: 0.12 }],
  },
};

/** Break tag of a monster part id ('head', 'wingL', 'kopfplatte', 'tail' ...). */
export function partTag(partId = '') {
  const s = String(partId).toLowerCase();
  if (/panzer/.test(s)) return 'panzer';
  if (/schere/.test(s)) return 'schere';
  if (/auge/.test(s)) return 'auge';
  if (/segment/.test(s)) return 'segment';
  if (/kamm|antenne/.test(s)) return 'kamm';
  if (/pranke/.test(s)) return 'pranke';
  if (/spule/.test(s)) return 'spule';
  if (/head|kopf/.test(s)) return 'head';
  if (/wing|fl[uü]gel/.test(s)) return 'wing';
  if (/tail|schwanz/.test(s)) return 'tail';
  return s;
}

const countOf = (n, rng) => (Array.isArray(n) ? rng.int(n[0], n[1]) : n);

/** One weighted pick -> item id (null if table empty). */
export function pickWeighted(table, rng) {
  const total = table.reduce((s, e) => s + e.w, 0);
  if (!total) return null;
  let r = rng() * total;
  for (const e of table) { r -= e.w; if (r < 0) return e.id; }
  return table[table.length - 1].id;
}

/** One carve (Zerlegen). tail=true uses the severed-tail table. -> {id, n} */
export function rollCarve(monsterId, rng, { tail = false, matMul = 1 } = {}) {
  const d = DROPS[monsterId];
  if (!d) return null;
  const table = tail && d.tail.length ? d.tail : d.carve;
  const id = pickWeighted(table, rng);
  return id ? { id, n: matMul } : null;
}

/** [L] Whole-corpse carve of neutral animals (one carve, several items) -> [{id, n}] ; null for monsters without a `once` table. */
export function rollCarveAll(monsterId, rng) {
  const d = DROPS[monsterId];
  if (!d?.once) return null;
  const out = [];
  for (const e of d.once) if (e.chance >= 1 || rng() < e.chance) out.push({ id: e.id, n: countOf(e.n, rng) });
  return out;
}

/** Bonus for a broken part -> [{id, n}] */
export function rollBreak(monsterId, partId, rng, { matMul = 1 } = {}) {
  const list = DROPS[monsterId]?.breaks?.[partTag(partId)] ?? [];
  const out = [];
  for (const e of list) if (e.chance >= 1 || rng() < e.chance) out.push({ id: e.id, n: countOf(e.n, rng) * matMul });
  return out;
}

/** Quest reward extras -> [{id, n}] */
export function rollReward(monsterId, rng, { matMul = 1 } = {}) {
  const out = [];
  for (const e of DROPS[monsterId]?.reward ?? []) if (e.chance >= 1 || rng() < e.chance) out.push({ id: e.id, n: countOf(e.n, rng) * matMul });
  return out;
}

export const CARVES_PER_PLAYER = 3;
export const TAIL_CARVES = 1;
