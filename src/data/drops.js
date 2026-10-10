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
};

/** Break tag of a monster part id ('head', 'wingL', 'kopfplatte', 'tail' ...). */
export function partTag(partId = '') {
  const s = String(partId).toLowerCase();
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
