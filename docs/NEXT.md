# NEXT – Brainstorming: Brocken-Design & USP (Stand Okt 2026, noch NICHTS davon gebaut)

> Kontext: zuerst `docs/HANDOFF.md` lesen. Dieses Dokument ist das Ergebnis einer Brainstorming-Runde (Monster-Designer, USP-Recherche, Kritiker) auf Wunsch des Owners. **Owner will das mit einem neuen Agent durchsprechen, bevor gebaut wird.** Abschnitt 7 = offene Entscheidungen. Verknüpft mit GitHub-Issue #4 (Rostwerke).

## 0. Ausgangslage (Owner-Feedback)
1. Brocken zu eintönig: „machen immer dieselben 3 Angriffsmuster, leicht vorherzusagen". Genre steht und fällt mit der Monster-Qualität → Jagen soll **immer wieder** Spaß machen und fordern. Idee des Owners: spätere Aufträge mit **mehreren Brocken in einer Jagd**.
2. Kein USP: „im Moment nur ein schlechter Monster-Hunter-Klon für Mobile" → eigener Twist aufs Genre gesucht.

---

## 1. Diagnose: Warum die Brocken vorhersehbar sind (aus dem Code)
Dateien: `src/game/monsters/monster.js` (`_combat`, `_chooseAttack`, `_pickTarget`), `jaggo.js`, `barrotz.js`, `brathalos.js`.
1. **Ein Angriff pro Entscheidung, keine Ketten.** `_combat()` wählt einen Angriff → spielt ihn → `recover` (0,35 + rng·0,5 s) → würfelt neu. `queued` (Verkettung) nur bei Barrotz-Rotglut-Doppelramm und Rotglut-Brüllen. Spieler lernt „Angriff → sicheres Fenster", immer.
2. **Reiner Gewichts-Würfel nach Distanz**, ohne Gedächtnis (kein „zuletzt gewählt") und ohne Reaktion aufs Spielerverhalten.
3. **Kleine Repertoires mit scharfen Distanzbändern**: Jaggo 4, Barrotz 5, Brathalos 3 frei wählbar am Boden. Wer die Distanz kennt, kennt das Move (z. B. Barrotz-Ramm 7–26 m, Hammer 0–6,8 m). Hinten stehen → Schwanz mit `weight: 8` = deterministischer Reflex.
4. **Fixe Telegraphen & Hit-Timings** (0,55–0,9 s, konstant) → nach ~3 Jagden auswendig gerollt.
5. **Kaum Zustände**: nur Rotglut (60 % HP / Burst) und Flucht (30 %). Rotglut = schneller, aber gleiches Moveset. Teilbrüche ändern Mesh/Faktor, nicht das Verhalten (Ausnahme Brathalos-Flügel).
6. **Banale Positionierung**: hinlaufen / zurück / Seitwärts-Strafen mit fester `sin(time·0.7)`-Frequenz. Kein Gelände, keine Flanken, Nav-Grid ungenutzt.
7. **Statische Zielwahl**: Bedrohung + 1/Distanz, 15 % Zufall, Retarget alle 5 s.
8. **Keine Gegenreaktion** auf Rollen-Spam oder Camping.

Gutes Fundament (behalten): deterministische `AttackInstance` aus `{attackId, t0, origin, yaw, targetPos, seed}` (Netzcode!), `weight` darf Funktion sein, `cond`, `calls/events`, `queued`, `def.combat()`-Hook, `onAttackEnd`, Fairness-Test (`tests/unit/p3fairness.test.js`).

**Netzcode-Regel für alle Upgrades:** Host entscheidet, Clients replayen nur aus Startparametern. Jede neue Zufallsentscheidung (Variante, Ketten-Index, Verzögerung, Finte) wird bei `beginAttack` in `params` mitgeschickt – nie später per Zufall im Replay.

## 2. Systemische KI-Upgrades (Monster-Designer)
Aufwand: S = Tage, M = 1–2 Wochen, L = mehrere Wochen (Agent-Zeit deutlich kürzer).

| # | Upgrade | Kern | Fairness-Grenze | Aufwand |
|---|---|---|---|---|
| 1 | **Angriffs-Ketten** | `chains: {lastId → [{atk, w, cond}]}`; 2–3 Glieder, kurze Zwischenpause 0,1–0,25 s, jedes Glied eigener Telegraph | letztes Glied lange Erholung ≥ 1,0 s; max 3 Glieder | M |
| 2 | **Varianten pro Move** | 2–3 Zeitpläne (z. B. Biss ×2 / ×3 / ×2+Sprung), erkennbar an Pose-Delta | ab Telegraph-Mitte erkennbar (≥ 15° Pose-Unterschied) | M |
| 3 | **Verzögerter Schlag (Delay-Hit)** | Halten in Aufladepose (Zittern/Dampf/Knurren) +0,25–0,4 s, Schlag beim Pose-Wechsel | Warn-Cue; Gesamt-Telegraph ≤ 1,1 s; nicht in frühem Rang | S–M |
| 4 | **Finte** | Telegraph bricht nach 0,4 s ab → anderes Move | nur nach 2× gleichem Spieler-Reflex, max 1/20 s, nie in ersten 60 s | M |
| 5 | **Adaptive Gewichte** | Zähler pro Spieler (Rollen-Spam, Camping hinten, nur Fernkampf, Heilen) beeinflussen `weight` | max ×3, nie Zwang; Jagdbericht „Er hat dein Rollen gelernt" | M |
| 6 | **Stimmung (Mood)** | aggressiv / lauernd / gereizt / müde, 15–30 s, Körpersprache | ≥ 2 s sichtbar vor Wirkung, max 1 Wechsel/15 s | M |
| 7 | **Monster-Ausdauer** | Ketten/Sprints kosten; leer → 4–6 s Keuchen | klar sichtbar | S |
| 8 | **Gelände nutzen** | Flanken, Deckung, Barrotz rammt Fels → betäubt, Brathalos wirft Felsen | Hitboxen konsistent, Kamera nie > 1 s verdeckt | M–L |
| 9 | **Teilbruch ändert Moveset** | z. B. Kamm weg → keine Rudelrufe, mehr Biss-Ketten; Schwanz ab → mehr Sprünge | 2 s Taumeln + Banner | S–M |
| 10 | **Hunger/Revier** | Brocken flieht zur Herde, frisst (Fenster); 2 Brocken in Reichweite → Revierkampf | max 1×/Jagd | S–M |
| 11 | **Koop-Zielwechsel** | Bedrohung + Rollen (Fernkämpfer in Pausen), „Rettungs-Aggro", Rotglut fokussiert niedrigste HP | Wechsel nur zwischen Moves, Marker 0,5 s vorher | S |
| 12 | **Rotglut+ (Stufe 2)** | eigenes Zusatz-Moveset, Farbvariante, +HP | Rang im Auftrag sichtbar | M |
| 13 | **Auftrags-Modifier** | 0–2 pro Auftrag: Nebel, Gewitter, Hitze, Knappe Beute, Blutmond (Seed aus Auftrag) | vor Abflug sichtbar, Belohnungsbonus | S–M |
| + | **Persönlichkeits-Seed** | pro Spawn Aggressivität/Fluchtbereitschaft/Lieblingsmove ±20 % | nur Gewichte | S |

Designer-Reihenfolge: A) 1, 9, 11, 7, Persönlichkeit → B) 2, 3, 5, 6, 13 → C) 8, 4, 12, Multi-Jagden → D) Rostwerke-Brocken direkt mit diesen Bausteinen bauen.
Messgröße: Anzahl verschiedener 3er-Move-Sequenzen pro Jagd; „vorhersehbar?"-Umfrage nach 5 Jagden; Treffer durch Delay/Finte ohne Spielerfehler < 1/min.

## 3. Redesign pro Brocken (Monster-Designer)
**Jaggo – „Rudelführer" (Raum & Zielwahl).** Neu: Zickzack-Biss (Seitenschritte, Seite an Körperneigung erkennbar), Rückhüpfer mit Schwanzpeitsche (bestraft Dauer-Nahkampf), Hetzjagd (kurviger Anlauf → Biss oder Hüpfer), Kommando-Pfiff (Jagglinge flankieren koordiniert, 1,0 s Markierung). Ketten: Bissreihe → Hüpfer|Rückhüpfer|Schwanzwirbel; Rudelruf → Hetzjagd. Rotglut: Elite-Jagglinge. Kammbruch: keine Rudelrufe mehr, mehr Biss-Ketten. **Signatur „Rudel lesen":** Wer Jagglinge ignoriert, wird eingekesselt; Flächenschaden als Gegenmittel.

**Barrotz – „Gelände als Waffe".** Neu: Rammsturm auf Spieler ODER auf Fels (Kopfwinkel verrät es; Fels-Treffer → 3 s betäubt), Doppel-Stampfer (2 Schockwellen versetzt = fairer Delay-Hit), Schlammspur nach Ramm (Rolle 25 % kürzer), Hörnerschwung (Wurf). Ketten: Hammer → Feger|Stampfer; Wälzer → Spritzer → Ramm. Panzer ab = schneller, verwundbarer. Kopfplattenbruch: rammt sich selbst doppelt betäubt. **Signatur:** Pfeiler/Felsen zwischen sich und den Ramm bringen (Kiting).

**Brathalos – „Luftherrscher".** Neu: Feuerteppich (3 Bälle, 5 s Brandflächen), Luft-Kette (2× Feuer seitlich → Sturz → Landungs-Stampf), Wirbelflug (Windzonen schieben), Aasgeier (frisst Mampfer = Fenster). Flügelbruch → am Boden, aber wütend (Böe wird Flammenstoß). **Signatur „Luftraum":** Bogen/Blendknolle halten ihn unten, Nahkämpfer nutzen Bodenzeit, Flächen lesen; Koop-Rollen.

**Rostwerke-Brocken (GDD §15, Issue #4):** gleich mit Ketten/Varianten/Mood bauen. Kroll = Zonen-Tanz zwischen Dampfventilen (Phase 2 nach Panzerbruch), Gorgo = Boden lesen (Doppel-Durchbruch, Warnung ≥ 0,8 s, Knallgurke/Kran kontern), Voltaro = Aufladungs-Rennen (Ableiter umwerfen), Kettenblitz bestraft Klumpen.

## 4. Multi-Brocken-Jagden (Monster-Designer)
Regeln: max 2 Brocken gleichzeitig aktiv, je 60–70 % HP; nie 2 Telegraphen verschiedener Brocken auf denselben Spieler innerhalb 0,6 s (Host-Sperre); Offscreen-Pfeil fürs zweite Monster; ≥ 5 s Ruhe zwischen Phasen; je Brocken eigener Seed-Stream.
- **„Revierstreit"** (JR 4): Barrotz vs. Jaggo bekämpfen sich (Ramm trifft Jaggo → Kopfschaden), Spieler nutzen den Konflikt; nach 60 s verbünden sie sich gegen die Jäger.
- **„Feuer und Schlamm"** (JR 5): Brathalos' Feuer entzündet Schlamm → Dampf-Sichtblockade; Koop teilt sich auf.
- **„Die wilde Jagd"** (Rostwerke, JR 6): Kroll, später stößt Voltaro dazu (30 s Gong-Warnung, erst bei Kroll < 50 % / Panzer ab); Voltaros Überladung entlädt sich in Krolls Dampf.

**Langzeit-Loop:** Meisterschaft pro Brocken (5 Stufen, Verhaltens-Journal „Zickzack-Biss: 12× gesehen", Trophäen am Rucksack), Rotglut+/Uralt-Varianten, geseedete Tages-/Wochen-Kopfgelder mit Bedingung („Brathalos ohne Heilitem"), rotierende Welt-Events (Gewitter-Woche, Dürre), Herausforderungs-Regeln (nur Bogen, 1 Leben), Raubtier-Ökologie beeinflusst Spawns, „Feldstudie" (2 zufällige Brocken + 2 Modifier).

---

## 5. USP – Recherche (USP-Rechercheur, mit Quellen)
**Markt (Kurzfassung):** MH Wilds: Performance-Backlash, dünnes Endgame, Koop-Reibung durch Solo-Cutscenes. MH Now: Grind, Tageslimits, Koop brauchte anfangs physische Nähe. Dauntless 2025 abgeschaltet (Live-Service + Monetarisierung). Wild Hearts: Support nach ~7 Monaten eingestellt (ein Twist trägt nicht, wenn der Rest „ok" ist). R.E.P.O./Lethal Company: komisches Scheitern mit Freunden trägt riesig. Indie-Boss-Rush-Roguelites ohne Hunter-Tiefe + Koop + Kürze.
Quellen: vice.com (MH Wilds Steam-Reviews), v13.net/2025/06 (Wilds in trouble), icy-veins (Wilds Koop-Frust), pocketgamer.biz (MH Now 15 Mio), thesixthaxis.com (MH Now Review), gamereactor.eu (MH Now Koop), rpgamer.com & gfinityesports.com (Dauntless Shutdown), kitguru.net (Wild Hearts), co-op.gg (Monster Crawl), gamespress.com (ONE BTN BOSSES), yourstory.com & Wikipedia (R.E.P.O.).

**Lücken:** kein < 10-min-Hunter, den man per Link ohne Installation teilt · alle Hunter grind-basiert · komisches Scheitern mit Freunden fehlt im Genre · niemand nutzt Glitches als Spielmechanik.

**Konzepte:**
| | Konzept | Kern | Aufwand | Risiko |
|---|---|---|---|---|
| A | **Bug-Jagd** | Brocken sind „korrupte Daten"; sichtbare Glitch-Stellen (Flackern, Z-Fighting) = Schwachstellen, mit Timing treffen → Absturz | M | Lesbarkeit auf kleinem Display |
| B | **Glitch-Konter als Kern** | Perfekt-Ausweichen erzeugt Glitch-Energie → „verbotene Moves" (Zeitstopp, Duplikat, durch Wände) | S–M | Casuals lösen es nie aus |
| C | **Hunt-Link** | Link → in 10 s auf der Jagd, 3–6 min, keine Accounts | S | WebRTC/NAT (TURN existiert) |
| D | **Schrott-Roguelite** | Mutatoren pro Jagd wählen („Gravitation.dll fehlt") | M | ungewollte Bugs |
| E | **Chaos-Koop** | Schubsen/Köder auf Freunde, Auszeichnungen („Größter Trottel") | M | P2P-Physik-Desync |
| F | **Lokale Legende** | Brocken merkt sich, wer ihn besiegt hat, Narben sammeln sich, Monster als teilbarer Code | M | Cheaten (egal ohne Server) |
| G | **Brocken aufziehen** | Baby-Brocken als KI-Begleiter (löst Solo-Problem) | M–L | Scope-Explosion |
| H | Deckbau-Moves | Moves als Karten | L | zerstört Kampfgefühl |
| I | **Extraction** | Beute geht beim Umkippen verloren, bis man extrahiert | S–M | Frust bei Verbindungsabbruch |
| J | Rhythmus-Layer | Angriffe im Beat | M | Audio-Latenz mobil |

Rechercheur-Top-Kombis: **1) C + B + I „Hunt-Link-Glitch-Run"** (empfohlen, baut auf Vorhandenem auf) · **2) A + D „Bug-Jagd mit Mutationen"** (stärkste Identität: Glitch ist Regelwerk, nicht nur Look) · **3) E + F Chaos-Koop + teilbare Monster**.
**Nicht tun:** mit MH in Tiefe konkurrieren, Gacha/Lootboxen/Tageslimits, Server/Accounts/Live-Service, AR/Geo, Scope-Bomben (H, G in voll), unlesbare Glitch-Effekte, alles mischen.

---

## 6. Kritiker-Urteil & Synthese

**Kritik an den Monster-Ideen:** Diagnose stimmt und ist der eigentliche Wert. Ketten (1), Teilbruch-Reaktion (9), Ausdauer (7), Koop-Zielwechsel (11) = billig und sofort wirksam. **Überengineered:** adaptive Gewichte + Stimmungen + Persönlichkeit + Finten sind vier überlappende, unsichtbare „Zufall-mit-Gedächtnis"-Systeme – schwer testbar, Spieler merken sie nicht. Mastery/Ökologie/Weltevents = Content-Tretmühle (daran sind Dauntless/Wild Hearts gestorben). Gelände (8) und Multi-Jagden sind eher L als S–M.
**Lesbarkeit auf 6 Zoll:** Pose-Deltas für Varianten sind bei PS1-Low-Res + Daumen im Bild kaum erkennbar → Varianten über **Windup-Dauer, Farbe, Ton** statt Feinposen. Delay/Finte nur mit klarem Halte-Cue (Touch hat ~100 ms Latenz). Koop: globales „Aggro-Token"-Budget statt nur 0,6 s pro Spieler.
**Netz:** KI bleibt strikt host-autoritativ; Gäste sehen Halte-Cues sonst verkürzt → Pose früh senden.

**Die 5 Dinge für 80 % von „unberechenbar, aber fair":** 1) Ketten 2–3 Glieder mit Telegraph je Glied + lange End-Erholung · 2) Teilbruch ändert Moveset · 3) Erschöpfungsfenster · 4) Phasenwechsel mit sichtbarem Cue + 1 Sondermove pro Phase (ersetzt Stimmungen) · 5) Variation über Timing/Windup-Länge (Seed pro Jagd) + Koop-Zielwechsel. Adaptiv nur EINE Regel: Anti-Rollen-Spam.
**Was fehlt laut Kritiker:** Wundsystem (gleiche Stelle mehrfach treffen → Wunde nimmt mehr Schaden), **„Lehrangriff"** in den ersten ~30 s jeder Jagd (langsam, klar) statt Tutorial-Text, eigener Windup-**Ton pro Angriff** + Farbredundanz + Haptik, **Kamera-Auto-Framing**/Zoom-out bei Ketten, lokales **Tod-Log** (welcher Angriff tötet wie oft → Unfairness finden, exportierbar).

**Kritik an der USP-Recherche:** Einzig wirklich einzigartig: **Glitch als Kernmechanik** (A+B) – verbindet den Scuff-Look mit Regeln. Aber „verbotene Moves" (Zeitstopp, Duplikat, Wand-Phasing) = Scope-Bomben im P2P → auf EINEN reduzieren. **Hunt-Link ist ein Feature, kein Burggraben** (kopierbar), aber der wichtigste Wachstumshebel (jede Session = Einladungslink). Chaos-Koop (E) nur als Mutator. Lokale Legende (F) billig & stark, wenn Monster-Code = Seed + Mutatoren + Namen der Besieger. Mutatoren (D) = billigstes Wiederspielwert-Werkzeug, wenn Zahlen/Flags. Extraktion nur als Run-Layer. Streichen: G, H, J.

**Vision (Vorschlag Kritiker):**
> *Scuffed Hunter ist der 5-Minuten-Monsterjäger für dich und deine Freunde, der per Link startet: Die Monster sind kaputte Daten – wer ihre Fehler im richtigen Moment ausnutzt, wird zur Legende.*

**Säulen:** 1) **Lesbar-gefährlich** (Telegraph + Ton + Erholung; jeder Tod erklärbar) · 2) **Fehler sind Waffen** (Glitch-Konter + sichtbare Glitch-Stellen als Schwachpunkte) · 3) **Jede Jagd ist anders** (Seed + Mutatoren + Persönlichkeit; Vielfalt aus Regeln statt Content) · 4) **Link und los** (10 s bis zur Jagd, 3–6 min, teilbare Monster-Codes, kein Account/Server/Tageslimit).
**Verzahnung:** Jede Kette endet in einem Konterfenster; Erschöpfung = „Absturz"; Glitch-Stellen = brechbare Teile (ein Mechanismus, zwei Funktionen); Persönlichkeits-Seed = teilbarer Monster-Code; Quest-Modifier und Mutatoren = EIN System („Gravitation.dll fehlt").

**Roadmap (Kritiker):**
- **Phase 1 – Fundament:** Ketten für alle 3 Brocken · Flinch/Abbruch der Kette bei Konter · Erschöpfung · Teilbruch ändert 1 Move/Brocken · Windup-Töne + Farbcues · Kamera-Framing · Hunt-Link · Lehrangriff · lokales Tod-Log. *Metrik:* Tester erklären nach 3 Jagden ihre Tode; „unfaire" Tode im Log < 10 %; Jagd 3–6 min.
- **Phase 2 – USP:** Glitch-Energie aus Perfekt-Ausweichen/Konter + **eine** Sonderfähigkeit (Vorschlag: lokales Zeitfenster) · sichtbare Glitch-Stellen · 6–8 Mutatoren · Persönlichkeits-Seed + teilbarer Monster-Code · Koop-Zielwechsel · lustige End-Auszeichnungen · Anti-Rollen-Spam. *Metrik:* ≥ 40 % lösen in Jagd 2 eine Glitch-Fähigkeit aus; jede 3. Session wird geteilt.
- **Phase 3 – Breite:** Kroll/Gorgo/Voltaro direkt mit Phase-1/2-Mechaniken · wöchentlicher Seed („Feldstudie", Datum = Seed) · erste Multi-Jagd nur „Revierstreit" · Rotglut+ als Mutator-Preset.
**Kill-Liste:** Stimmungssystem & Finten als eigene Systeme · Ökologie/Weltevents/Hunger-Revier · 5-stufige Mastery & Journal (höchstens Statistik) · Gelände für alle (max. 1 Objekt für Barrotz) · Chaos-Koop als Standard · Begleiter, Deckbau, Rhythmus · mehrere verbotene Fähigkeiten · Extraktion als Kern · Uralt-Varianten mit eigenem Moveset · Multi-Jagd mit Element-Interaktion vor „Revierstreit".

### Anmerkungen des Lead-Agents (Fakten-Check gegen den Code)
- **Schon vorhanden** (Kritiker nahm teils an, es fehlt): Hitstop (40/70/120 ms) + Screenshake, Teilbruch-Taumeln 2 s + Rückstoß, Betäubung durch stumpfe Kopftreffer, Glitch-Konter mit Zeitlupe/+50 %, Katana-Konter, Statistik im Spiegel (Kills, Bestzeiten). Was wirklich fehlt: **Flinch bei normalen Treffern / Kette bricht durch Spieler ab**, Wunden, Windup-Töne pro Angriff, Kamera-Zoom bei Ketten, Tod-Log.
- **Hunt-Link ist fast da:** Räume haben 4-Buchstaben-Codes, die URL `?scene=hub&mode=join&code=ABCD` existiert bereits (Debug). Fehlt nur: „Link teilen"-Button (Web Share API / Kopieren) + saubere Einstiegs-URL. Aufwand S.
- **Persönlichkeits-Seed/Monster-Code passt technisch perfekt:** Angriffe sind bereits seed-deterministisch; ein Code = `{monster, seed, mutatoren, narben}` als Base64, wie der Speicher-Export.
- Mutatoren lassen sich an `quests.js`-Varianten (`hpMul`, `rage:'always'`) anschließen.
- Meine Empfehlung: **Kritiker-Roadmap übernehmen**, Phase 1 an den 3 bestehenden Brocken, Rostwerke (Issue #4) erst in Phase 3 – dann direkt mit Ketten/Glitch-Stellen bauen.

---

## 7. Offene Entscheidungen für den Owner (mit Empfehlung)
1. **Bessere Brocken vor neuen Brocken?** → Ja: Phase 1 an Jaggo/Barrotz/Brathalos, Rostwerke danach.
2. **Vision/USP „Kaputte Daten / Fehler sind Waffen" annehmen?** → Empfehlung ja (einziger echter Alleinstellungsfaktor, passt zum Look & zum Namen). Alternativen: reine Link-Koop-Kurzjagd (Feature, kein USP) oder Chaos-Koop (kollidiert mit Skill-Kampf).
3. **Wie stark dominiert Glitch-Konter den Schaden?** → ca. 40–50 %, nicht 100 % (Einsteiger nicht ausschließen).
4. **Welche EINE „verbotene" Fähigkeit?** → lokales Zeitfenster (Zeitlupe existiert, netz-freundlich). Duplizieren/Wand-Phasing streichen.
5. **KI strikt host-autoritativ?** → Ja, ohne Ausnahme.
6. **Progression:** bestehende Ausrüstungsspirale behalten + Mutatoren/Monster-Narben/Codes als neue Motivation? → Ja, lokal + Export-Code, keine Accounts.
7. **Solo-Pfad:** HP-Skalierung statt KI-Begleiter → ja.
8. **Multi-Brocken-Jagden:** frühestens nach Phase 2, zuerst nur „Revierstreit".
9. **Kurze Jagden (3–6 min) als Ziel?** Aktuell ~5–6 min solo; mit Mutatoren/Seeds evtl. kürzere „Feldstudien" zusätzlich anbieten.

## 7b. Entscheidungen des Owners (10.10.2026)
1. **Bestehende Brocken zuerst** – Phase 1 an Jaggo/Barrotz/Brathalos. **Wichtig: Änderungen dürfen die Brocken nicht leichter machen, sondern schwerer** (abwechslungsreicher UND fordernder).
2. **Vision „Fehler sind Waffen" angenommen.** Neuer Spielname: **Glitch Hunter** (Umbenennung noch offen).
3. Glitch-Anteil am Schaden: **40–50 %**.
4. **Verbotene Fähigkeit: offen** – Brainstorming läuft, Idee des Owners: **eigener Glitch pro Waffentyp**.
5. KI strikt host-autoritativ: **ok**.
6. **Narben + Monster-Codes gestrichen.** Mutatoren: interessant, später genauer ausarbeiten. Ausrüstungsspirale bleibt.
   - Befund: HP skalieren aktuell **nicht** mit der Spielerzahl (nur `hpMul` bei Rotglut-Aufträgen, `hunt.js:147`) → 4 Spieler töten Brocken ~3–4× schneller. Muss gelöst werden.
7. **Solo: keine HP-Erhöhung, kein Begleiter.** Spannung muss aus Phase 1 (KI) + Mutatoren kommen, nicht aus längerem Draufhauen.
8. Multi-Brocken-Jagden: ok, frühestens nach Phase 2, als Hebel für besonders schwere Aufträge.
9. Jagddauer bleibt wie jetzt (~5–6 min solo).

### 7c. Runde 2 (10.10.2026)
- **Koop-HP-Skalierung gebaut:** ×1 / 1,7 / 2,3 / 2,8 bei 1–4 Pirschern (`src/game/monsters/coopScale.js`), Teil-HP mit, HP-Anteil bleibt bei Beitritt/Verlassen.
- **Glitch pro Waffe:** Plattmacher **Frame-Skip** und Zwillingsklingen **Echo-Input** angenommen. Spannbogen (No-Clip) + Katana (Save-State) abgelehnt → neue Vorschläge: Bogen **Debug-Modus** / **Paketverlust-Salve**, Katana **Lag-Teleport** / **Desync-Schnitte**.
- **Pflicht für jeden Glitch:** sieht cool aus, Glitch-Modus sofort erkennbar (RGB-Versatz + Scanlines am Pirscher, Pixelrauschen am Bildrand, Bitcrush-Ton, HUD-Balken „GLITCH"), und man ist in der Zeit **deutlich stärker**.
- **Mutatoren:** ja, aber **standardisiert** – reine Daten (Multiplikatoren/Flags) auf generischen Hooks in `Monster`/`Player`/`Hunt`, nie Code pro Brocken.

## 8. So geht's weiter (für den nächsten Agent)
1. `docs/HANDOFF.md` lesen, dann dieses Dokument mit dem Owner durchgehen (Abschnitt 7 abfragen, Kennzahlen/Vergleiche anbieten – Owner entscheidet intuitiv, will Daten dazu).
2. Entscheidungen in `docs/GDD.md` übernehmen (neuer Abschnitt „Brocken 2.0" + „Vision/Säulen"), GitHub-Issue(s) pro Phase anlegen.
3. Bauen wie bisher: Lead plant + verifiziert, Sonnet-Sub-Agents im Caveman-Modus in Worktrees mit Datei-Zuständigkeit; jede neue Brocken-Mechanik mit Fairness-Test (`tests/unit/p3fairness.test.js` erweitern) und Determinismus-Test (Netz).
