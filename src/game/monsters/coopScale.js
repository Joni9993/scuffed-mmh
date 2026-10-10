// Koop-Skalierung: Brocken-HP (und Teil-HP) nach Anzahl Pirscher in der Jagd.
// Ziel: ~5,5 / 4,7 / 4,2 / 3,9 min bei 1/2/3/4 Spielern (GDD, Owner-Entscheidung Okt 2026).
export const COOP_HP_MUL = [1, 1, 1.7, 2.3, 2.8];

export function coopHpMul(n) {
  return COOP_HP_MUL[Math.max(1, Math.min(4, n | 0))];
}

/** Skaliert einen Brocken auf n Pirscher; HP-Anteile bleiben erhalten (Beitritt/Verlassen mitten in der Jagd). Kleinvieh bleibt unverändert. */
export function applyCoopScale(m, n) {
  if (!m || m.minor) return;
  const mul = coopHpMul(n), f = mul / (m.coopMul ?? 1);
  if (f === 1) return;
  m.maxHp = Math.round(m.maxHp * f);
  m.hp = m.alive === false ? m.hp : Math.min(m.maxHp, m.hp * f);
  for (const p of m.parts ?? []) {
    if (!p.breakHp || !Number.isFinite(p.hp)) continue;
    p.breakHp = Math.round(p.breakHp * f);
    if (!p.broken) p.hp *= f;
  }
  m.coopMul = mul;
}
