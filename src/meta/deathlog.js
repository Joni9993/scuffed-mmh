// Lokales Tod-Log: KOs pro {Brocken, Angriff}; localStorage (try/catch), Cap 200 Eintraege.
export const DEATHLOG_KEY = 'mmh.deathlog.v1';
export const DEATHLOG_CAP = 200;

const ATTACK_NAMES = {
  jaggo_bissreihe: 'Bissreihe', jaggo_huepfer: 'Hüpfer', jaggo_schwanz: 'Schwanzschlag', jaggo_rudelruf: 'Rudelruf', jaggo_zickzack: 'Zickzack-Sprint', jaggo_rueckhuepfer: 'Rückhüpfer', jaggo_hetzjagd: 'Hetzjagd',
  barrotz_ramm: 'Rammstoß', barrotz_hammer: 'Hammerschlag', barrotz_waelzer: 'Wälzer', barrotz_spritzer: 'Schlammspritzer', barrotz_feger: 'Schwanzfeger', barrotz_doppelstampfer: 'Doppelstampfer', barrotz_hoerner: 'Hörnerstoß', barrotz_kopfstoss: 'Kopfstoß',
  brathalos_feuer: 'Feuerball', brathalos_feuerteppich: 'Feuerteppich', brathalos_flammenstoss: 'Flammenstoß', brathalos_aufflug: 'Aufflug', brathalos_sturz: 'Sturzflug', brathalos_boee: 'Feuerböe', brathalos_schwanz: 'Schwanzschlag', brathalos_bruellen: 'Gebrüll',
  jaggling_biss: 'Biss', jaggling_sprung: 'Sprungangriff',
};
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
/** attackId -> lesbarer Name (Fallback: Präfix weg, Unterstriche zu Leerzeichen, Anfangsbuchstabe groß). */
export const prettyAttack = (id) => ATTACK_NAMES[id] ?? cap(String(id ?? '?').replace(/^[a-z0-9]+_/i, '').replace(/_/g, ' '));

/** Alte Projektil-Keys („feuer@223.5:f0") -> echte attackId; fehlendes Brocken-Präfix wird ergänzt. */
export function normalizeAttackId(monsterId, a) {
  let id = String(a).split('@')[0].split('|')[0].split(':')[0];
  if (!id) return '';
  if (monsterId && !id.startsWith(monsterId + '_') && ATTACK_NAMES[monsterId + '_' + id]) id = monsterId + '_' + id;
  return id;
}

export function createDeathlog(getStorage = () => (typeof localStorage !== 'undefined' ? localStorage : null)) {
  let map = null; // "m|a" -> {m, a, n, q}
  const load = () => {
    if (map) return map;
    map = {};
    try {
      const arr = JSON.parse(getStorage()?.getItem(DEATHLOG_KEY) ?? '[]');
      if (Array.isArray(arr)) for (const e of arr) {
        if (!(e && e.m && e.a && e.n > 0)) continue;
        const a = normalizeAttackId(String(e.m), e.a); if (!a) continue;
        const x = (map[e.m + '|' + a] ??= { m: String(e.m), a, n: 0, q: 0 });
        x.n += e.n | 0; x.q += e.q | 0;
      }
    } catch { /* leer */ }
    return map;
  };
  const save = () => { try { getStorage()?.setItem(DEATHLOG_KEY, JSON.stringify(Object.values(map))); } catch { /* ignore */ } };
  return {
    /** quick = KO in Kette oder bei Telegraph < 0,5 s */
    record(monsterId, attackId, quick = false) {
      attackId = monsterId && attackId ? normalizeAttackId(monsterId, attackId) : attackId;
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
    exportText(monName = (id) => id) {
      const rows = Object.values(load()).sort((a, b) => b.n - a.n).map((e) => `${monName(e.m)}\t${prettyAttack(e.a)}\t${e.n}\t${e.q}`);
      return ['Brocken\tAngriff\tKOs\tdavon schnell (Kette/kurze Vorwarnung)', ...rows].join('\n');
    },
    clear() { map = {}; save(); },
  };
}

export const deathlog = createDeathlog();
