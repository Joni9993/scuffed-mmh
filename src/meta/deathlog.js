// Lokales Tod-Log: KOs pro {Brocken, Angriff}; localStorage (try/catch), Cap 200 Eintraege.
export const DEATHLOG_KEY = 'mmh.deathlog.v1';
export const DEATHLOG_CAP = 200;

export const prettyAttack = (id) => String(id ?? '?').replace(/^[a-z0-9]+_/i, '').replace(/_/g, ' ');

export function createDeathlog(getStorage = () => (typeof localStorage !== 'undefined' ? localStorage : null)) {
  let map = null; // "m|a" -> {m, a, n, q}
  const load = () => {
    if (map) return map;
    map = {};
    try {
      const arr = JSON.parse(getStorage()?.getItem(DEATHLOG_KEY) ?? '[]');
      if (Array.isArray(arr)) for (const e of arr) if (e && e.m && e.a && e.n > 0) map[e.m + '|' + e.a] = { m: String(e.m), a: String(e.a), n: e.n | 0, q: e.q | 0 };
    } catch { /* leer */ }
    return map;
  };
  const save = () => { try { getStorage()?.setItem(DEATHLOG_KEY, JSON.stringify(Object.values(map))); } catch { /* ignore */ } };
  return {
    /** quick = KO in Kette oder bei Telegraph < 0,5 s */
    record(monsterId, attackId, quick = false) {
      if (!monsterId || !attackId) return;
      const m = load(), k = monsterId + '|' + attackId;
      const e = (m[k] ??= { m: monsterId, a: attackId, n: 0, q: 0 });
      e.n++; if (quick) e.q++;
      const keys = Object.keys(m);
      if (keys.length > DEATHLOG_CAP) { // schwaechste Eintraege raus
        keys.sort((x, y) => m[x].n - m[y].n);
        for (const d of keys.slice(0, keys.length - DEATHLOG_CAP)) if (d !== k) delete m[d];
      }
      save();
    },
    top(n = 5) { return Object.values(load()).sort((a, b) => b.n - a.n).slice(0, n); },
    all() { return Object.values(load()); },
    exportText() {
      const rows = Object.values(load()).sort((a, b) => b.n - a.n).map((e) => `${e.m}\t${e.a}\t${e.n}\t${e.q}`);
      return ['Brocken\tAngriff\tKOs\tSchnell/Kette', ...rows].join('\n');
    },
    clear() { map = {}; save(); },
  };
}

export const deathlog = createDeathlog();
