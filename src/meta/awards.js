// Lustige End-Auszeichnungen aus der Jagd-Statistik. Rein und deterministisch (Ranking nach Wert, dann Reihenfolge).
const C = [
  { id: 'trottel', title: 'Größter Trottel', val: (s) => s.kos, min: 1, text: (n) => `${n}× umgekippt. Der Boden dankt für die Aufmerksamkeit.` },
  { id: 'glitchgott', title: 'Glitch-Gott', val: (s) => s.glitchDmg, min: 1, text: () => 'Hat den Fehler im System zur Waffe gemacht.' },
  { id: 'teppichklopfer', title: 'Teppichklopfer', val: (s) => s.damage / 100, min: 0.5, text: (_, s) => `${Math.round(s.damage)} Schaden. Staub gab es reichlich.` },
  { id: 'rollmops', title: 'Rollmops', val: (s) => s.rolls / 2, min: 4, text: (_, s) => `${s.rolls}× gerollt. Stehen wird überschätzt.` },
  { id: 'perfektionist', title: 'Perfektionist', val: (s) => s.perfect * 3, min: 3, text: (_, s) => `${s.perfect} Glitch-Konter. Hat tatsächlich aufgepasst.` },
  { id: 'blitz', title: 'Blitzjäger', val: (s) => (s.time > 0 && s.time < 420 ? (420 - s.time) / 30 : 0), min: 1, text: (_, s) => `Fertig in ${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}. Das Monster hatte noch Pläne.` },
  { id: 'treffer', title: 'Treffsicher', val: (s) => s.hits / 20, min: 1, text: (_, s) => `${s.hits} Treffer. Nicht alle waren Absicht.` },
];
const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
const KEYS = ['damage', 'hits', 'perfect', 'kos', 'glitchDmg', 'rolls', 'time'];
const norm = (o) => Object.fromEntries(KEYS.map((k) => [k, num(o?.[k])]));

/** stats: { damage, hits, perfect, kos, glitchDmg?, rolls?, time? } → bis zu 3 [{id,title,text}].
 *  coopStats optional (Mitspieler): hat jemand mehr in einer Kategorie, entfällt sie lokal. */
export function pickAwards(stats, coopStats = []) {
  const s = norm(stats);
  const others = (coopStats ?? []).map(norm);
  const ranked = C.map((c, i) => ({ c, i, v: c.val(s) }))
    .filter((r) => r.v >= r.c.min && !others.some((o) => r.c.id !== 'blitz' && r.c.val(o) > r.v))
    .sort((a, b) => b.v / b.c.min - a.v / a.c.min || a.i - b.i);
  const out = ranked.slice(0, 3).map(({ c, v }) => ({ id: c.id, title: c.title, text: c.text(v, s) }));
  if (!out.length) out.push({ id: 'dabei', title: 'Dabei gewesen', text: 'Hat mitgemacht. Das zählt, offiziell, irgendwie.' });
  return out;
}
