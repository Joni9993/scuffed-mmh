// Treffer-Farbeffekte fuer aktive Brocken-Zustaende (Gift / Rost / Betaeubung): jeder Treffer auf einen
// betroffenen Brocken spruht zusaetzlich Funken in der Zustandsfarbe (Solo, Host und Gaeste).
export const STATUS_FX = {
  poison: { color: '#b060ff', n: 7, speed: 2.6 },
  rost: { color: '#d8742a', n: 7, speed: 3.2 },
  stun: { color: '#ffe14d', n: 8, speed: 4.5 },
};

/** Aktive Zustaende eines Brocken (Reihenfolge = Anzeige-Reihenfolge). */
export function activeStatuses(m) {
  const st = m?.st;
  if (!st) return [];
  const out = [];
  if (st.poisonT > 0) out.push('poison');
  if (st.rustT > 0) out.push('rost');
  if (m.stunT > 0) out.push('stun');
  return out;
}

/** Zustands-Funken am Trefferpunkt. */
export function statusHitFx(fx, m, at) {
  if (!fx?.spark || !at) return;
  for (const k of activeStatuses(m)) {
    const s = STATUS_FX[k];
    fx.spark({ x: at.x, y: at.y + 0.15, z: at.z }, s.n, s.color, s.speed);
  }
}
