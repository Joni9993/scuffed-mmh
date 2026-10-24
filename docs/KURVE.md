# Schwierigkeitskurve über 13 Brocken (Okt 2026)

Messung: `METRIC=1 npx vitest run tests/unit/curve.metric.test.js` (`ONLY=krachfaust,brathalos` für einzelne Zeilen). Wie `bosspressure.test.js`: Schaden/min auf einen NICHT ausweichenden Pirscher (stand / circle / range, Seeds 3+7, 120 s), aber **nach erwarteter Rüstung** (Set des Vorgängers, `data/armor.js`, prot/(prot+80)). `idx` = Mittel der drei Modi. Dazu Fenster-Kennzahlen (Angriffe/min, Fenster% = Leerlauf ≥ 0,8 s, Keuch%, Aktiv%) und Kampfdauer (HP / Plattmacher-DPS 50 × Waffenkraft × 45 % Uptime). Gates im selben Test (Krachfaust, Brathalos, keine Sprünge > 2× in meinem Bereich).
Grenzen: im Modus `range` landet kein Gap-Closer (Pirscher wird bei < 9 m zurückgesetzt), `stand`/`circle` kleben bei 4,5 m am Brocken: Sprünge/Durchbrüche/Säulen/Beben werden unterschätzt.

| Brocken (JR) | idx vorher | idx nachher | Sprung zum Vorgänger (vorher → nachher) |
|---|---|---|---|
| Jaggo (1) | 113 | 113 | – |
| Barrotz (2) | 302 | 302 | 2,67× → 2,67× (nicht meine Datei) |
| Brathalos (3) | 139 | **353** | 0,46× → **1,17×** |
| Kroll / Gorgo / Voltaro (5/5/6) | 321 / 233 / 257 | 347 / 330 / 336 | 2,31× / 0,73× / 1,10× → 0,98× / 0,95× / 1,02× |
| Blendax / Mampfaffe (7/8) | 239 / 336 | 239 / 336 | 0,93× / 1,41× (nicht meine Dateien) |
| Krachfaust (9) | 421 | **762** | 1,25× → 2,27× (Mampfaffe soll durch den anderen Agent steigen) |
| Pyrostur (10) | 1173 | 1191 | **2,78× → 1,56×** |
| Felsengroll (11) | 514 | 606 | 0,44× → 0,51× |
| Voltiris (12) | 1031 | 1154 | 2,00× → 1,91× |
| Gockelok (13) | 908 | 960 | 0,88× → 0,83× |

**Brüche vorher:** Brathalos schwächer als Barrotz und umkreisbar (circle 62 von stand 167) · Smaragd → Glitchgrat 2,78× (Rüstung federt kaum: Pyrostur gegen Krachfaust-Set 65,2 % statt Krachfaust gegen Mampfaffe-Set 63,3 %) · Felsengroll halb so hart wie Pyrostur · Gockelok unter Voltiris.

**Krachfaust war leicht, weil** (Messung stand 238): Fäuste landen 6-11 m vor dem Rumpf, wer am Körper klebt, wurde nur vom Schwanz getroffen (tote Zone) · 34 % der Zeit keuchend (Ausdauerkosten 8-14 je Angriff, Keuchen 4-6 s; Fenster% 35) · 19 Angriffe/min. Jetzt: stand 840 / circle 789 / range 658, 26 Angriffe/min, Keuch% 11, Fenster% 16.
- **Nahzone:** Bauchklatscher (Rundum-Druckzone r 4,3 + Schleim im Ring, `punishRoll` = Anti-Rollen-Druck), Schulterwalze (Rempler 0-11 m), Fausthiebe werden aus < 3,8 m seltener gewählt (Gewicht ×0,35, Ketten nur ab 3,8 m).
- **Ausdauer ×0,5, Keuchen max. 3 s** (Runenwut 2,2 s, nach dem Urknall weiter 6 s). **Runenwut-Special:** nach dem Brüllen folgt der Zornmarsch (4 Stampfer, nur Wut).
**Brathalos:** Schnabelhieb (Lunge, folgt der Laufrichtung), Flammenkranz (Rundumfeuer r 5,2, `punishRoll`), Glutregen (4 Aufschlag-Klumpen mit Vorhalten, ab 7 m), Flammenstoß ab Glutsturm, Feuerbälle halten vor (`lead`), Pausen kürzer, Ketten bis 4 (enden, sobald der Aufflug fällig ist), Keuchen max. 3,2 s. circle 342 von stand 380.
**Kroll:** Seitrammer dreht die Flanke zum Pirscher und rammt auf ihn zu (ging bei frontalem Ziel ins Leere), Hiebe/Griff/Ramme halten vor. **Gorgo:** Schlackenhagel gegen Fernkämpfer, Durchbrüche halten vor, weniger Graben, Wellen/Walze nur nah. **Voltaro:** Funkenschauer (5 Blitze, auch ohne Überladen), Hiebe/Blitzmuster halten vor, 2. Hieb setzt näher an. Alle drei: Ausdauer ×0,6 bzw. Keuchen max. 3,2 s. Grund: das Gate in `bosspressure.test.js` (≥ 1,25× Ø Eröffnungs-Brocken) verlangt sie über Brathalos, und es steigt weiter, sobald Jaggo/Barrotz Fernkampf-Moves bekommen.
**Glitchgrat:** nur Verhalten: Pyrostur/Voltiris/Gockelok Keuchen max. 3,2 s; Felsengroll Pause 2,3 → 1,6 s und Ketten brechen seltener ab (~15 statt ~12 Angriffe/min, Test-Obergrenze 15,5 → 17). Pyrostur NICHT entschärft (nach dem Krachfaust-Anheben nur 1,56×).
Gemeinsame Bausteine: `src/game/monsters/kurve.js` (`capTired`, `trackTarget`/`leadAim`, `hagel`). Tests: `kurve.test.js`, Fairness voll für alle neuen/geänderten Angriffe.

**Offen:** Barrotz/Blendax/Mampfaffe (anderer Agent) bestimmen, ob Brathalos > Barrotz und Krachfaust ≤ 2× Mampfaffe hält und wie hoch die `bosspressure`-Latte wird (Kroll/Gorgo/Voltaro nur ~3-6 % darüber) · Felsengroll (606) und Gockelok (960) liegen unter Pyrostur/Voltiris (Metrik unterschätzt Säulen/Beben und Gap-Closer; Felsengroll-Identität „Festung“ bewusst nicht aufgeweicht, Gockelok-Strafefenster per Test ≥ 1,3 s) · Handytest nötig: fühlt sich der Klatscher am Körper fair an?
