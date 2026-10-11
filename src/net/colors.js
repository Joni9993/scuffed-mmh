// Mitgliedsfarben im Raum: wer die Standardfarbe (Index 0) behält, bekommt eine freie, eindeutige Farbe nach Slot.
const N = 8; // = PLAYER_COLORS.length (meta/save.js)
/** Farbindex aus dem Gear-Code (letztes Zeichen), 0 wenn unbekannt. */
export const gearColorIdx = (g) => (typeof g === 'string' && g.length >= 7 ? Number(g[6]) || 0 : 0);
/**
 * chosen: gewählte Farbindizes in Slot-Reihenfolge -> aufgelöste Indizes.
 * Ausdrücklich gewählte (!=0) bleiben; Slot 0 mit Standard behält 0; weitere Standard-Slots bekommen den nächsten freien Index.
 */
export function resolveColorIdx(chosen) {
  const used = new Set(), out = chosen.slice(), redo = [];
  let first = true;
  chosen.forEach((c, i) => {
    if (c !== 0) { if (used.has(c)) redo.push(i); else used.add(c); return; } // explicit duplicate -> later slot gets a free colour
    if (first) { first = false; used.add(0); return; }
    redo.push(i);
  });
  for (const i of redo) {
    let k = 0;
    while (used.has(k) && k < N) k++;
    out[i] = k < N ? k : 0;
    used.add(out[i]);
  }
  return out;
}
