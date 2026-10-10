// Übungsplatz (Trainingspuppe im Dorf): reine Logik, DOM-/THREE-frei (getestet in tests/unit/training.test.js).
import { addGlitchEnergy } from './glitch.js';

export const TRAIN_GLITCH_RATE = 20; // Glitch-Energie/s außerhalb des Glitch-Modus (100 in 5 s)
export const TRAIN_WUCHT_RATE = 20; // Wucht/s
export const COMBO_GAP = 1.3; // s: Treffer mit kleinerem Abstand zählen zur Combo
export const DPS_WINDOW = 10; // s

export const newTrain = () => ({ dps: 0, combo: 0, best: 0, log: [], lastHit: -99 });

/** Leisten dauernd voll: HP, Puste, Wucht (langsam), Glitch-Energie (schnell). */
export function trainRefill(p, dt) {
  const v = p.v;
  v.hp = v.maxHp; v.bruise = 0; v.stamina = v.maxStamina; v.exhaust = 0;
  if (p.weapon && p.weapon.wucht < 100) p.weapon.wucht = Math.min(100, p.weapon.wucht + TRAIN_WUCHT_RATE * dt);
  if (!p.glitch?.active) addGlitchEnergy(p, TRAIN_GLITCH_RATE * dt, 'training');
}

export function trainHit(t, time, dmg) {
  t.combo = time - t.lastHit < COMBO_GAP ? t.combo + 1 : 1;
  t.best = Math.max(t.best, t.combo);
  t.lastHit = time;
  t.log.push({ t: time, dmg });
}

export function trainTick(t, time) {
  while (t.log.length && time - t.log[0].t > DPS_WINDOW) t.log.shift();
  t.dps = t.log.reduce((a, e) => a + e.dmg, 0) / DPS_WINDOW;
  if (time - t.lastHit > COMBO_GAP) t.combo = 0;
}
