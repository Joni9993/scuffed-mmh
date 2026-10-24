# Anti-Kite (Okt 2026) – Jaggo, Barrotz, Blendax, Mampfaffe

Problem: Fernkämpfer (Bogen/Armbrust ~12 m) und Umkreiser wurden von diesen Brocken kaum getroffen. Lösung nur über Verhalten (Wurf, Flächen, Gap-Closer, Ketten), **keine** HP-/Schaden-Multiplikatoren. Alle neuen Moves: Telegraph ≥ 0,5 s, Windup-Ton + Farbcue, `audit:[…]` (Fairness-Test), Ziel mit Vorhalt (`lead` → `aimTarget`, reist als `targetPos` in den Netz-Parametern), Würfe deterministisch aus `inst.target`/`inst.r()` (Helfer `src/game/monsters/antikite.js`, Projektile `geroellDef`/`glitchDef` in `mprojectiles.js`).

## Neue Moves
- **Jaggo** (Einsteiger: ≥ 1,0 s Ansage, `tgVar:false`, Tempo 1, 12–18 Schaden): `jaggo_geroellwurf` (scharrt, 2 Brocken im Bogen, 7–22 m) · `jaggo_drehbiss` (Kopf + Schwanz rundum, gegen Umkreisen) · `jaggo_fernsprung` (Weitsprung bis 17 m). Ketten: Bissreihe/Zickzack → Drehbiss; Wurf → Weitsprung → Biss.
- **Barrotz:** `barrotz_brockenwurf` (3 Felsbrocken um den Jäger, 8–24 m). Kette: Wurf → Rammsturm.
- **Blendax:** `blendax_rauschregen` (4 Neon-Pakete um den Jäger, braucht den Schirm) · `blendax_blink` (verschwindet, steht 2,8 m vor dem Jäger; Marker = Landeplatz). Ketten: Regen → Blink → Sprungkette. Hüpfer ab 9 m seltener.
- **Mampfaffe** (ohne Futter-Buff): `mampfaffe_obstsalve` (4 Fruchtbomben) · `mampfaffe_dschungelbeben` (Druckwelle bis 12,8 m). Ketten: Salve → Sprungschlag, Sprungschlag → Sprungschlag (Kettensprung), Beben → Rolle/Sprung. Sprung weiter weg häufiger.

## Messung (`pressure()`, Schaden/min, ohne Rüstung, Seeds 3+7; Test `tests/unit/antikite.test.js`)
| Brocken | stand vorher → nachher | circle | range |
|---|---|---|---|
| Jaggo | 399 → 420 | 93 → 235 (56 %) | 0 → 174 (41 %) |
| Barrotz | 756 → 756 | 647 → 647 | 115 → 328 (43 %) |
| Blendax | 1256 → 1256 | 537 → 537 (43 %) | 0 → 469 (37 %) |
| Mampfaffe | 1612 → 1612 | 1059 → 1059 | 0 → 606 (38 %) |

Ziel: range ≥ 30 % und circle ≥ 40 % von stand, stand sinkt nicht. Die Messung dreht den Pirscher nach jedem Brockenschritt zurück auf 9–13 m (Kiter ohne Verzögerung): nur Würfe, Flächen und Teleport (Treffer im selben Frame) zählen dort, Gap-Closer-Sprünge wirken im echten Spiel, nicht in der Messlatte.

Folge für `bosspressure.test.js`: Der Mittelwert der Eröffnungs-Brocken steigt (Jaggo/Barrotz), die Latte „Rostwerke ≥ 1,25 × Ø" liegt jetzt bei ~278 statt ~231. Kroll (329) hält, Gorgo (239) und Voltaro (263) nicht.
