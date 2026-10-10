// Mutatoren (GDD 16.5): reine Daten auf generischen Hooks. Nie Code pro Brocken.
//   monster: speedMul recoverMul telegraphMul(nie < MIN_TELEGRAPH) dmgMul hpMul regenPct(%maxHp/s ohne Treffer)
//            chainBonus(Kettengewichte +x) rageAlways hideColorCues lagSpike{period,skip}
//   player:  dmgMul healItems:false staminaMul glitchGainMul
//   hunt:    timeMul fog(>1 = dichter) matMul
//   reward:  Beute-Multiplikator (zeigt das Auftragsbrett als „+30 % Beute")
export const MAX_MUTATORS = 2;

export const MUTATORS = {
  speicherleck: { id: 'speicherleck', name: 'Speicherleck', desc: 'Brocken heilt sich, wenn du ihn ~2 s nicht triffst. Gib ihm keine Ruhe.', reward: 1.3, monster: { regenPct: 0.4 } },
  fehlende_texturen: { id: 'fehlende_texturen', name: 'Fehlende Texturen', desc: 'Angriffe leuchten nicht mehr auf, nur noch Warnton. Ohren auf.', reward: 1.25, monster: { hideColorCues: true } },
  lag_spitze: { id: 'lag_spitze', name: 'Lag-Spitze', desc: 'Brocken springt beim Laufen ruckartig ein Stück vor. Vorwarnung bleibt.', reward: 1.2, monster: { lagSpike: { period: 6, skip: 0.18 } } },
  kein_undo: { id: 'kein_undo', name: 'Kein Undo', desc: 'Heil-Items gesperrt. Treffer bleiben Treffer.', reward: 1.35, player: { healItems: false } },
  uebertaktet: { id: 'uebertaktet', name: 'Übertaktet', desc: 'Brocken 15 % schneller, kürzere Pausen. Zu viel Kaffee.', reward: 1.3, monster: { speedMul: 1.15, recoverMul: 0.8 } },
  overflow: { id: 'overflow', name: 'Overflow', desc: 'Brocken-Treffer machen 30 % mehr Schaden.', reward: 1.3, monster: { dmgMul: 1.3 } },
  rotglut: { id: 'rotglut', name: 'Rotglut', desc: 'Brocken ist dauerwütend und hat 40 % mehr Leben.', reward: 2, monster: { hpMul: 1.4, rageAlways: true } },
};
export const MUTATOR_ORDER = ['speicherleck', 'fehlende_texturen', 'lag_spitze', 'kein_undo', 'uebertaktet', 'overflow'];

const MULS = { monster: ['speedMul', 'recoverMul', 'telegraphMul', 'dmgMul', 'hpMul', 'chainBonus'], player: ['dmgMul', 'staminaMul', 'glitchGainMul'], hunt: ['timeMul', 'fog', 'matMul'] };
const SUMS = { monster: ['regenPct'], player: [], hunt: [] };
const FLAGS = { monster: ['rageAlways', 'hideColorCues'], player: [], hunt: [] };

/** Nur bekannte IDs, höchstens `max`, ohne Duplikate (Netz-/Eingabe-sicher). */
export function cleanMutatorIds(ids, max = MAX_MUTATORS) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((i) => typeof i === 'string' && MUTATORS[i]))].slice(0, max);
}

/** IDs -> { monster, player, hunt, reward }. Multiplikatoren multiplizieren, Summen addieren, Flags OR, healItems:false gewinnt. */
export function resolveMods(ids) {
  const out = { monster: {}, player: {}, hunt: {}, reward: 1, ids: [] };
  for (const id of cleanMutatorIds(ids, 99)) {
    const m = MUTATORS[id];
    out.ids.push(id);
    out.reward *= m.reward ?? 1;
    for (const g of ['monster', 'player', 'hunt']) {
      const src = m[g]; if (!src) continue;
      const dst = out[g];
      for (const k of MULS[g]) if (src[k] !== undefined) dst[k] = (dst[k] ?? 1) * src[k];
      for (const k of SUMS[g]) if (src[k] !== undefined) dst[k] = (dst[k] ?? 0) + src[k];
      for (const k of FLAGS[g]) if (src[k]) dst[k] = true;
      if (g === 'player' && src.healItems === false) dst.healItems = false;
      if (g === 'monster' && src.lagSpike) dst.lagSpike = dst.lagSpike ? { period: Math.min(dst.lagSpike.period, src.lagSpike.period), skip: Math.max(dst.lagSpike.skip, src.lagSpike.skip) } : { ...src.lagSpike };
    }
  }
  out.reward = Math.round(out.reward * 1000) / 1000;
  return out;
}

/** „+30 % Beute" für Anzeige. */
export const rewardLabel = (m) => { const pct = Math.round(((m.reward ?? 1) - 1) * 100); return pct > 0 ? `+${pct} % Beute` : ''; };
