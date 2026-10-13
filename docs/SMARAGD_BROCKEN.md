# Smaragdküste: drei neue Brocken (Design-Spec)

Status: **Alle drei Brocken sind implementiert (Blendax 0.9, Mampfaffe 0.9b, Krachfaust 0.9c)**; die Rang-/Freischalt-Infrastruktur (Abschnitt 0) ist schon im Code. Zielgruppe: Builder-Agents, die die Brocken **nacheinander** bauen (Reihenfolge: Blendax -> Mampfaffe -> Krachfaust).
Alle Zahlen sind an den vorhandenen Code gebunden (Stand origin/main `860dc0c`). Format-Referenzen: `src/game/monsters/{jaggo,voltaro,gorgo}.js`, `src/data/{drops,armor,weapons,quests,compendium,gather,items}.js`.

| | Blendax | Mampfaffe | Krachfaust |
|---|---|---|---|
| Vorbild | Tzitzi-Ya-Ku | Conga | Brachydios |
| Rolle | schneller Blender, Zone 2+3 | Fresser, Zone 1+2 (Revier), Buff-Wechsel | Apex im Tempel (Zone 4), Finale-Explosion |
| HP (Jaggo 7000 / Barrotz 9000 / Gorgo 14500 / Voltaro 18500; Smaragd bewusst darunter bzw. knapp darüber: Blendax ~0,76x, Mampfaffe ~0,86x, Krachfaust ~1,08x Voltaro; Teil-HP, Flinch und Zahlen mit ~0,67/0,67/0,59 skaliert, Schaden unverändert) | 14 000 | 16 000 | 20 000 |
| Lauf walk/run (Jaggo 3,25/7,75; Voltaro 3,6/9,5) | 4,2 / 11,0 | 3,4 / 8,0 | 3,3 / 8,2 |
| Treffer (Jaggo 11-22; Voltaro 28-44) | 15-34 | 14-44 | 28-60 (+ Finale 70 % Max-LP ohne Deckung) |
| Rig | `buildRaptor` + Schirm-Mod | neu (hockender Affe) | neu (Mampfaffe-Rig, größer) |
| Auftrag | `blendax` | `mampfaffe` | `krachfaust` |

---------------------------------------------------------------------------------------------------

## 0. FINALE ENTSCHEIDUNGEN (Owner, Okt 2026) - überschreiben alles Abweichende weiter unten

**0.1 Freischaltung wie Karte 2.** Muster im Code (`quests.js`, `progression.questLock`): ein Auftrag hat `jr` (nötiger Rang) und optional `jrUp` (Rang nach dem ersten Sieg). Rostwerke öffnet bei JR 5, den **Revierstreit** (Schotterklamm, jr 4 -> jrUp 5) gibt (nicht Brathalos: der gibt JR 4 und die Rotglut-Varianten von Karte 1). Dort ist `rostiger_ausflug` (jr 5, Sammelauftrag) jetzt **Erster im Brett** (`QUEST_ORDER`), vor Kroll/Gorgo. Genauso: **Voltaro** (`Der Funkenfürst`, jr 6 -> jrUp 7) erstmalig besiegt => JR 7 => Smaragdküste öffnet, erster Auftrag **`inselausflug`** (jr 7, Belohnung 700, rp 40, Sammelauftrag, schon umgesetzt). Es gibt keinen Sonderschalter und kein `needClears`: alles läuft über `jr` + `jrUp`. (`needClears` aus 1.1/1.6 entfällt.)

**0.2 Reihenfolge und neue Jägerränge (umgesetzt: `MAX_JR = 10`, `RANK_RP`, Save-Clamp, Tests).** Kette nach Muster Karte 1 (jr1->2->3->4, dann Rotglut) und Karte 2 (jr5->6->7, dann Rotglut):

| JR (Ziel) | Schlüssel-Auftrag | `jr` nötig | `jrUp` | RP-Schwelle `RANK_RP` |
|---|---|---|---|---|
| 7 | `voltaro` (existiert) | 6 | 7 | 1200 |
| 8 | `blendax` | 7 | 8 | 1700 |
| 9 | `mampfaffe` | 8 | 9 | 2300 |
| 10 | `krachfaust` | 9 | 10 | 3000 |

Reihenfolge im Spiel: `inselausflug` (jr 7) -> `blendax` (jr 7, jrUp 8) -> `mampfaffe` (jr 8, jrUp 9) -> `krachfaust` (jr 9, jrUp 10) -> dann alle auf **jr 10**: `blendax_rotglut`, `mampfaffe_rotglut`, `krachfaust_rotglut` und `revierstreit_smaragd` (Revierstreit-Variante nach Vorbild `revierstreit`, `multi: 'revier'`, die drei Smaragd-Brocken gegeneinander, hpMul je ~0,65, kein jrUp). Krachfaust braucht Blendax und Mampfaffe also **automatisch** (Rang 9 gibt es nur durch Mampfaffe-Sieg + 2300 RP). RP-Hinweis: Voltaro-Sieg gibt 180 RP bei Schwelle 1200 -> man muss auf der Karte etwas mitsammeln (Inselausflug, Rotglut-Wiederholungen), wie schon vor JR 6/7.

**Bereits im Code (Stand Mampfaffe):** `RANKS` bis JR 9; `MAX_JR 10`, `RANK_RP[8..10]`, `save.js` `int(d.jr,1,10,1)`, `inselausflug` jr 7/700/rp 40, `rostiger_ausflug` zuerst im Brett, Tests angepasst. **Noch nicht:** `progression.RANKS` Einträge 8-10 (jeder Eintrag braucht seine existierende Quest als `keys`, sonst `rankpoints.test` rot und `rankLine` zeigt einen toten Schlüssel): wird mit jedem Brocken-Build ergänzt (siehe Quest-Tabelle unten). `rankLine` (hubPanelsB) zeigt "Höchstrang" bis dahin schon bei JR 7.

**Vorgeplante Quests (Builder fügt sie mit dem jeweiligen Brocken in `quests.js` ein, `world: 'smaragdkueste'`, `QUEST_ORDER` in dieser Reihenfolge nach `inselausflug`, `MONSTER_RP`: blendax 200, mampfaffe 220, krachfaust 300):**

| id | name | monster | jr | jrUp | Limit | reward | rp |
|---|---|---|---|---|---|---|---|
| `blendax` | Flimmern im Dschungel | blendax | 7 | 8 | 25 min | 3000 | 200 |
| `mampfaffe` | Der Fressfeind | mampfaffe | 8 | 9 | 25 min | 3200 | 220 |
| `krachfaust` | Krach im Tempel | krachfaust | 9 | 10 | 30 min | 5200 | 300 |
| `blendax_rotglut` | Rotglut: Blendax | blendax | 10 | - | 25 min | 5100 | 290 |
| `mampfaffe_rotglut` | Rotglut: Mampfaffe | mampfaffe | 10 | - | 25 min | 5400 | 320 |
| `krachfaust_rotglut` | Rotglut: Krachfaust | krachfaust | 10 | - | 30 min | 8800 | 440 |
| `revierstreit_smaragd` | Revierstreit: Smaragd | blendax + mampfaffe + krachfaust (`monsters`, `multi: 'revier'`) | 10 | - | 30 min | 7500 | 400 |

Dazu je Eintrag in `progression.RANKS`: `{ jr: 8, keys: ['blendax'], rp: RANK_RP[8] }`, `{ jr: 9, keys: ['mampfaffe'], ... }`, `{ jr: 10, keys: ['krachfaust'], ... }`. Rotglut-Einträge wie bei Karte 2 (`variant: 'rotglut', mutators: ['rotglut']`).

**0.3 Waffen: Stufe 6 aus Krachfaust.** Ersetzt den "Waffen-Haken" in 1.7. Jede Waffenart bekommt auf **Stufe 6 einen neuen Ast `x` ("Sprenger")**, erreichbar aus **jedem** Stufe-5-Ast (`k`, `g` oder `v`, wie die anderen Stufe-6-Pfade aus Stufe 5 abzweigen; `cleanBranch` in `save.js` und der Skill-/Tree-UI `hubPanelsA` entsprechend anpassen: Stufe 6 hat dann `v` und `x`). Material: Krachfaust (Apex): `krachfaust_kruste`, `krachfaust_faustplatte`, `krachfaust_runenherz` (je 1 pro Waffe) + Schrott, Kosten in `WEAPON_UPGRADES[6][type].x`. Werte relativ zum Stufe-6-`v` der Art: Kraft +8, Krit unverändert, **`elems.blast: 30`**, `partDmgMul 1.2`. **Neuer Zustand auf der Waffe "Sprengung" (Explosion)**, passend zum Brocken (Brachydios-Muster): jeder Treffer baut auf dem getroffenen Teil Sprengwert auf (`blast` x Trefferstärke, ähnlich Gift-Aufbau `poisonMul`); bei 100 detoniert es am Teil (Kugel r 2,2 m, fester Schaden ~ 8 % der Waffenkraft x 6, Teil-HP-Schaden x1,5, Funken orange/weiß `#ffb020`/`#fff2c0`, KEIN Grün: Grün gehört den Brocken, Cyan/Magenta den Pirschern). Name im Kompendium (`CONDITIONS`/`ELEM_NOTES`): "Sprengung: Treffer laden das Teil auf, ab 100 knallt es. Eigene Explosionen werfen dich nicht um." Namensvorschlag: `<Art>-Sprenger`, Beschreibung im Stil "Krachfaust-Faust, in Waffenform. Macht Peng." Die Waffen-Optik (`game/gear/weaponLook.js`): Standardmodell + orange Glut-Risse und Funken-Partikel.

**0.4 Krachfaust-Finale ohne Deckung = 70 % der maximalen LP** (nicht tödlich): Treffer-Feld `dmgPct: 0.7` (berechnet aus `player.maxHp`; wer vorher volle LP hat, überlebt mit 30 %); mit Säule dazwischen 0. Ersetzt "dmg 400"/"tödlich" überall unten. Der Brocken ist danach erschöpft (Finish-Fenster), das Finale ist also überlebbar auch ohne Deckung, aber ein zweiter Treffer (Rotglut: zweiter Urknall) sitzt.

**0.5 Mampfaffe-Revier.** Nest und Spawn in **Zone 2**, Patrouille **nur Zone 1 + 2** (`ROUTE_ZONES.mampfaffe = [1, 2]`, `monsterSpawns.mampfaffe` bleibt Zone 2 südlich). Frisst Kokosnuss (Zone 1+2) und Feuerpilz/Giftkraut (Zone 2); der Glitchpilz (Zone 3+4) ist für ihn **nur Quest-Item der Pirscher** (er rennt nicht dorthin), sein Glitchpilz-Buff kommt aus einem Item, das er trägt/ausspuckt (siehe 3.3, Builder hält es einfach: Buff-Wechsel wählt aus den vorhandenen drei, Glitchpilz-Zustand nur in der Wut oder als Pirscher-Köder, den Pirscher in Zone 1/2 auslegen können). Jedenfalls keine Zone-3/4-Wanderung.

**0.6 Stil: laut, eindeutig, übertrieben.** Glitch Hunter: einfaches Design, aber laute, lesbare Sprache. Jeder Angriff hat eine **riesige Telegraph-Form in Neongrün** (`#39ff14` Kern, `#d8ffd0` Peak), Brocken-Glitch-Effekte immer **Hacker-Neongrün** (nie Cyan/Magenta). Verhalten absichtlich überzeichnet (Blendax: Schirm wie kaputter Fernseher mit Testbild, Mampfaffe: Backen wie Ballons, Rülpser sichtbar als Wolke, Krachfaust: Fäuste blasen auf wie Ballons und blinken im Takt). Gedacht für Skill-Checks und Lacher: Banner-Texte groß ("HINTER DIE SÄULEN!"), kurze Zeitlupen bei Treffern, Funken statt Zahlen. Neue Einzelheiten werden eher **lauter** als subtil gewählt; Kontrast zur Karte (Türkis) bleibt Gelbgrün.

**0.7 Krachfaust-Finale episch, aber mit kleinem Budget.** Nur vorhandene Systeme: `fx.shake`, `fx.flash`, `fx.whiteout`, `time.slowmo`, `world.setRuneGlow`/`world.pulse`, Marker (`hud` / vorhandener Zonen-Marker), Banner, `sfx charge/boom`, `spark()`; Säulen als einfache `visible=false`-Meshes. Keine neuen Shader, Partikelsysteme oder Kameraanimationen. Ablauf: Marker über die ganze Plattform, Aufladen mit steigender Taktrate (Licht, Sound, Shake), 1 s Stille, Detonation (Weiß + Zeitlupe 0,3 s).

**0.8 HP-Skala.** Bestehende Brocken: Jaggo 7000, Barrotz 9000, Gorgo 14500, Voltaro 18500. Neu: **Blendax 14 000, Mampfaffe 16 000, Krachfaust 20 000**. Blendax liegt damit unter Voltaro (Schnelligkeit + Blendung ersetzen HP), Krachfaust leicht darüber (Apex). Teil-HP/Flinch wurden entsprechend mit 0,67/0,67/0,59 skaliert (Tabellen unten schon umgerechnet); Schaden, Tempo, Telegraphs unverändert. Wut/Phasen-Schwellen sind relativ (`at`), bleiben.


**0.9 Blendax umgesetzt (Okt 2026): Abweichungen und Infrastruktur für Mampfaffe/Krachfaust.**
Dateien: `monsters/blendax.js` (+ Eintrag `index.js`), `tests/unit/blendax.test.js`. Spielbar: `?scene=hunt&quest=blendax` (Debug-Tipp: `__SH.monsters[0].beginAttack('blendax_blitz', {tgMul: 1})`).
- **Teile-IDs englisch** wie beim Raptor-Rig (`head, frill, body, legs, tail`, nicht `kopf/koerper/beine`), weil `partMeshes` des Rigs so heißen. Drop-Tags unverändert (`partTag('frill') = 'frill'`).
- **Neue Engine-Hooks (alle optional, rückwärtskompatibel):** `hit.faceCheck: deg` (nur lokaler Pirscher, Kamera-Check `ctx.cameraYaw`, Fallback `p.rot`; weggedreht = Treffer übersprungen und später erneut geprüft), `def.onGlitchCounter(m, attackId, player)` (nur Autorität; Gast-Konter laufen über das neue Netz-Event `{k:'gcm', a, m}` Gast -> Host in `sync.js`), `def.chainMax` (Standard 2 = 3 Kettenglieder; Blendax 3, damit Blitz -> Sprung -> Sprung2 -> Sprung3 passt), `def.detectFor(m)`, `marker.color/peak` (Telegraph-Ringe in Neongrün, Peak blinkt), `cue.noShift` (sonst dreht `cues.pickTone` den Farbton pro Kettenglied um 40 Grad weg vom Grün, Richtung Cyan: **bei neuen Brocken immer `noShift: true` setzen**), `Perfect` verbraucht den Treffer jetzt auch in `_attackHits` (`hitSet`), sonst würde ein Blitz nach der Rolle doch noch blenden.
- **Nicht gebaut (für die nächsten Builder):** `def.hitStatus`, `def.onHitPlayer`, `hit.occlude`, Status `verwirrt/schleim/itemlock` (nur `blend` ist in `Player.addStatus`; `base`-Tabelle und `#tickStatus`-Early-Return sind bereits auf `Object.keys`-artige Prüfung für `blend` erweitert, die anderen Keys dort ergänzen), `fx.slimeBurst`, `world.pulse`.
- **Status Geblendet:** `Player.addStatus('blend', { white, stun })` (Standard 1/1 s). `game/loadout.js` übersetzt die Macke Blendschutz in `white/stun` (`skillEffects.blendCut = 0,3 * Stufe`; Stufe 3: Weiß 0,1 s, keine Betäubung). Phase 2 = `pinned` + Sterne-Kranz (`player.stars`, nur beim lokalen Pirscher sichtbar; fremde Avatare zeigen den Status nicht). Vollbild-Overlays sind `position: fixed` mit `z-index` über dem HUD (`ui.css` `.mon-white`, `.mon-broken`, `.dmg.mon`).
- **FX:** `fx.whiteout(dur, {staticTail})`, `fx.clearWhiteout()`, `fx.brokenScreen(dur, text)` (Text groß in Neongrün, Standard "NICHT HINSEHEN!"), `fx.monGlitch(dur)` (nur Alias ohne Text; die Verwirrt-Optik für Mampfaffe/Krachfaust ist noch zu bauen), `fx.number(p, text, 'mon')` für grüne Brocken-Zahlen. Sfx: `blendFlash`, `whiteStatic`.
- **Moveset-Abweichungen:** Sprünge dauern 1,4 / 1,35 / 1,5 s (Spec 1,3 / 1,2 / 1,5), sonst scheitert der Fairness-Test (Erholung nach Treffern >= 20). Blitz-Abklingzeit läuft über `m.extra.blitzT` (14 s / Zone 3: 9 s / Flimmerfieber x0,7) statt `cooldown`, weil Zone und Phase dynamisch sind. Der Blitz-Konter braucht eine Rolle, die ca. 0,84-0,94 s nach Telegraph-Beginn startet (perfect-Fenster 0,1 s). Alle Telegraphs haben Boden-Ringe in Neongrün (Blitz r 12 m, Bisse/Schwanz = Reichweite). Schock auf dem Schirm bricht einen laufenden Blitz sofort ab.
- **Welt:** `ROUTE_ZONES = { blendax: [3, 2] }` in `smaragdkueste.js`; `routeFor` verallgemeinert (Zonen-Reihenfolge ab Nest-Zone, Pass-Punkt `PASS_OF` dazwischen und am Ende zurück). Mampfaffe: einfach `mampfaffe: [2, 1]` eintragen. Spawn `monsterSpawns.blendax = (30, 70)`.
- **Daten:** Materialien `blendax_schuppe/klaue/schirm/flimmerlinse`, Set `blendax` (Prot 44, Macken `blendschutz` + `flinkfuss`, `SET_TIER 7`, `GEAR_SETS` Buchstabe `j` angehängt, Optik `gear/armor.js` `blendax`). Aufträge `blendax` (jr 7 -> 8) und `blendax_rotglut` (jr 10) in `QUEST_ORDER` direkt hinter `inselausflug`: **Reihenfolge nach Spec 0.2 ist blendax, mampfaffe, krachfaust, dann alle Rotglut/Revierstreit: beim Einfügen der nächsten Quests `blendax_rotglut` ans Ende der Rotglut-Gruppe schieben.** `progression.RANKS` hat JR 8; Eintrag 9 und 10 folgen mit Mampfaffe/Krachfaust, `rankpoints.test.js` (Liste der RANKS) dann jeweils nachziehen. Keine Waffen-Haken (durch 0.3 ersetzt), Feldstudie nicht erweitert, `revierstreit_smaragd` und Texturen: `blendax_scale/blendax_frill` sind in `blendax.js` registriert (nicht in `textures.js`).

**0.9b Mampfaffe umgesetzt (Okt 2026): Abweichungen und Hooks für Krachfaust.**
Dateien: `monsters/mampfaffe.js` (+ `index.js`), `tests/unit/mampfaffe.test.js`. Spielbar: `?scene=hunt&quest=mampfaffe` (`&world=arena` für freie Sicht ohne Palmen). Debug-Tipps: Buff erzwingen `__SH.monsters[0].def.applySnapExtra(M, { f: 'feuerpilz', t: 40, h: 0 })` (`f` = kokosnuss | feuerpilz | giftkraut | glitchpilz), Angriff `M.beginAttack('mampfaffe_stinkwolke', { tgMul: 1 })`.
- **Teile-IDs** `head, prankeL, prankeR, belly, body, legs` (Tag `pranke` -> Drop-Tabelle `breaks.pranke`). Rig `buildMampfaffe` (Boxen, Pose-Schlüssel wie MREST, aber `legL/legR` = ARM-Schwung, die Beine laufen gegengleich mit; `wing` = Brusttrommeln, `spread` = Backen). Krachfaust kann das Rig kopieren (`scale` größer, Fäuste aufblasen über `spread`).
- **Neue Engine-Hooks (alle optional):** `def.wander(m, dt)` (im Wandern; Angriffe mit `wanderAttack: true` laufen dort und brechen bei Zustandswechsel ab), `def.onHitPlayer(m, player, h, res)` (nach einem Treffer, nur beim getroffenen lokalen Pirscher; `h.hit` = Treffer-Def, z. B. `steal`), `def.hitDmgMul(m, hit)` (pro Treffer, z. B. Faustbruch), `def.dmgFactor(m)` (global, z. B. hungrig), `def.partHpMul(m, part)` (Teil-HP-Schaden), `def.glow(m) -> [r,g,b]|null` (Dauerleuchten über `emissive`, schlägt Status-Farbe; Treffer-/Telegraph-Blinken schlägt glow), `def.applySnapExtra(m, ex)` (Gast; Pflicht, sobald `snapExtra` Dinge enthält, die Werte auf Teilen ändern: Gäste werten ihren Schaden selbst aus).
- **Neue Pirscher-Zustände (fertig, Krachfaust kann sie benutzen):** `verwirrt` (3 s, `Player#moveDir` negiert x/z, auch die Ausweichrolle; Overlay `fx.confuse(dur)`/`clearConfuse()` mit gespiegeltem "VERKEHRT!", `fx.monGlitch` ist jetzt ein Alias darauf; Sfx `confuse`), `itemlock` (`ItemSystem.canStart/request` blockt, Toast "Gestank! Keine Items", Zustand ~1 s Nachhall, wird von den Wolken alle Frames aufgefrischt). Beide stehen in `base` von `addStatus`, im Early-Return von `#tickStatus`, im HUD (`hud.js` Namen, `ui.css` Chips) und im Kompendium (`CONDITIONS`). Macke **Eisenmagen** (`loadout.js` `EISEN_T`) kürzt Gift/Brennen/Verwirrt/Item-Sperre -15 % je Stufe: neue Dauer-Zustände bei Bedarf in `EISEN_T` eintragen.
- **Zahlen-Klassen** für farbige Brocken-Zahlen: `fx.number(p, text, 'mf-kokosnuss'|'mf-feuerpilz'|'mf-giftkraut'|'mf-glitchpilz'|'mon')` (CSS `.dmg.mf-*`). Neue Sfx: `chew, burp, stinkHiss, glitchTp, drum, confuse, coconut`. Neue Projektil-Art `kind:'kokos'` (`kokosDef` in `mprojectiles.js`, Aufschlag-Ring in Futterfarbe).
- **Futter-Infrastruktur:** Items `feuerpilz/giftkraut/glitchpilz` + Gather-Kinds (Feuerpilz Zone 2: 5; Giftkraut Zone 2: 3 + Zone 3: 4; **Glitchpilz Zone 1: 2, Zone 2: 2, Zone 3: 3, Zone 4: 4**: die Spec-Zonen 3+4 bleiben für die Pirscher, aber sein Revier (Zone 1+2) braucht jedes Futter, deshalb dort extra Spots; Test `mampfaffe.test.js` prüft das für mehrere Seeds). Bus-Event `foodEaten {pointId}` -> Host sendet `MSG.GATHER {id, u}` an alle (sync.js), Gast-Klau: `net.sendSteal(monsterId, kind)` -> EV `fst` -> `def.onFoodStolen` beim Host. Futter-KI frisst nur Stellen mit `zone <= 2`.
- **Welt:** `NEST_ZONE.mampfaffe = 2`, `ROUTE_ZONES.mampfaffe = [2, 1]`, Spawn `(-62, 20)` (Zone 2). Telegraph-Ringe: Grundangriffe Neongrün (`#39ff14`/`#d8ffd0`), Buff-Angriffe in der Futterfarbe (`noShift: true` überall).
- **Daten:** Set `mampfaffe` (Prot 46, `eisenmagen` + `dickschaedel`, `SET_TIER 7`, Optik `gear/armor.js`), Materialien `mampfaffe_fell/knoechel/backe/magenstein`, Aufträge `mampfaffe` (jr 8 -> 9) und `mampfaffe_rotglut` (jr 10), `RANKS` JR 9, `rankpoints.test.js` nachgezogen. `QUEST_ORDER` jetzt: `inselausflug, blendax, mampfaffe, blendax_rotglut, mampfaffe_rotglut`: **Krachfaust: `krachfaust` hinter `mampfaffe` einfügen, `krachfaust_rotglut` ans Ende der Rotglut-Gruppe, dann `revierstreit_smaragd`**; `RANKS` JR 10 + `rankpoints.test.js` (Liste der RANKS, `MAX_JR` ist schon 10) nachziehen; die Schlüssel-Hint-Texte nutzen `RANKS` automatisch.
- **Abweichungen von 3.x:** Kokosnuss-Stelle Zone 1+2 wie in der Spec; Feuer-Immunität über `part.elem.fire = 0` (wie Barrotz-Schlammpanzer), Faktor des Kopfes über einen additiven Delta (`baseFactor * 0.5`), damit Rost/Verbrüht (`_statusTick`) und Teilbruch nicht kollidieren. Stinkwolke wird auf das Ziel gespuckt (Landemarker r 5,5 während des Telegraphs), nicht an die Maulposition. Rolle zeigt die Bahn als vier Neon-Ringe, Wand-Prall = `RUMMS!` + 1,2 s Betäubung (nur Host entscheidet, erkennt Kollision an der Abweichung von der Soll-Position). Brust-Konter (Glitch) lässt ihn 1,6 s taumeln. Hunger: `dmgFactor` x1,1 + Grabbel-Gewicht 7. Keine Feldstudie, kein `revierstreit_smaragd`, keine Waffen-Haken (siehe 0.3).
- **Nicht gebaut:** `hit.occlude`, `fx.slimeBurst`, `world.pulse`, Status `schleim` (nur `verwirrt` und `itemlock` sind jetzt in `Player.addStatus`).

**0.9c Krachfaust umgesetzt (Okt 2026): Abweichungen und Hooks.**
Dateien: `monsters/krachfaust.js` (+ `index.js`), `tests/unit/krachfaust.test.js`. Spielbar: `?scene=hunt&quest=krachfaust&god=1` (Debug-Tipps: `M.beginAttack('krachfaust_urknall', {tgMul: 1})`, Phase erzwingen `M.hp = M.maxHp * 0.38; M.phase = 1`, Pirscher mit Schleim `__SH.player.addStatus('schleim', {t: 2})`). Auch: `krachfaust_rotglut`, `revierstreit_smaragd` (Blendax + Mampfaffe + Krachfaust, je 65 % HP).
- **Teile-IDs** `head, prankeL, prankeR, body, legs` (Mampfaffe-Rig `buildMampfaffe({ skin })` mit Steinhaut-Texturen `krachfaust_hide/face/fist`, `belly` bleibt ungenutzt). Schleimhülle = größere Neon-Boxen um Fäuste und Kopf (`extra.slimeMat`), Fäuste blasen im Takt auf (Node-Scale), Rücken-Runen dunkel -> grell in der Wut.
- **Schleim-System:** `m.extra.slimes` (max. 24), gefüllt von `all`-Events (`addSlime`), Puls-Stufen `stageOf(rest)` (dunkelgrün 2 Hz > 1,0 s, hellgrün 5 Hz, weißgrün 12 Hz < 0,4 s), Sprengradius-Ring ab Stufe 1, Einlaufen absorbiert die Pfütze (Pirscher bekommt `schleim` mit der Restzeit), Explosion `effects.slimeBlast` (jeder Client trifft nur seine lokalen Pirscher; Rolle = i-Frames, perfekte Rolle = Glitch-Konter). Pirscher-Status `schleim` in `player.js` (Zündschnur 2,0 s / Wut 1,4 s, `rollsLeft 1`, Klötzchen-Cluster `slimeGrp`, Ablauf -> `spawnEffect('schleimblast')`, wird zu allen Clients gespiegelt). Macke `schleimhaut` (`skillEffects.schleimFuse/schleimDmg`, Fuse über den `addStatus`-Wrapper in `game/loadout.js`, Schaden über `p._sk`). Schock auf eine Faust lässt Pfützen in 4 m harmlos platzen (`snapExtra.po` für Gäste).
- **Neue Engine-Hooks:** Hit-Felder `occlude` (Säule dazwischen = Treffer verfällt, solange sie steht), `dmgPct` (Anteil der Max-LP, ignoriert Schutz und Block), `noPerfect` (kein Glitch-Konter); `def.apex` (hunt.js: `Revier(..., { apex: true })`), Projektil-Art `kind: 'slime'` (`slimeDef`), `fx.slimeBurst`, `hud.center(text, secs, mon)`, Sfx `slimePulse, slimeSplat, krachCharge, boom`, Welt: `world.temple { pillars, c }`, `coverBetween(a, b)` (2D-Strecke gegen Kreis r 1,15 + 0,7), `breakPillar(p)` (Mesh weg, Schutt-Block bleibt), `setRuneGlow(tint, k)` (Tempelrunen haben jetzt ein eigenes Material), `pulse(k)` (Ambient/Sonne x k).
- **Finale (`krachfaust_urknall`, Phase 12 %, Rotglut zusätzlich bei 5 %):** `telegraph 6,5` (= ganzer Aufbau, Marker r 52 am Landepunkt), Sprung in die Dais-Mitte (nur wenn er im Tempel steht), Aufladen tau 1,5-5,5 (Takt 1 -> 4 Hz, Licht pulst, Wackeln 0,1 -> 0,5, Säulen-Ringe gelb, grün für gedeckte lokale Pirscher, Banner), tau 5,5-6,5 Stille (Licht 0,35), tau 6,5 Detonation (`dmgPct 0.7`, r 52, t 6,5-7,1, `occlude`, `noPerfect`, Weißblitz bzw. Kurzblitz für Gedeckte, Zeitlupe nur solo), Säulen, die jemanden abgeschirmt haben, brechen bei tau 7,15 (Liste bei 6,9 aus den Spielerpositionen, bei allen Clients gleich). Aufladen ist nicht zu betäuben/flinchen (`stunThreshold`, `_flLast`); wird es durch einen Teilbruch abgebrochen, lädt die Kampf-KI neu auf (`def.combat`). Danach `tired` 6 s (Finish-Fenster). Kein Fairness-Audit für den Urknall (nicht ausrollbar, nur Deckung), dafür Tests.
- **Revier-Apex:** `Revier.rivalOf` im Apex-Modus (nächster anderer Brocken im Tempel, auch Kleinvieh, Kleinvieh darf sterben; andere Brocken im Tempel zielen auf Krachfaust); kein Bündnis, keine Uhr. Der Mampfaffe-Eindringling ist entfernt: der Krachfaust-Auftrag hat NUR Krachfaust auf der Karte. **Owner-Feedback Okt 2026:** Modell neu nach Brachydios (blauschwarzer Obsidian-Panzer, Stachelkamm, Horn-Rüssel und Keulen-Fäuste massiv gelbgrün, Stachelschwanz); neues Apex-Moveset (Hammerkette, Hornschlag, Schwanzwirbel, Sprung-Faustschlag), höhere Schäden, `attackTempo` (Wut: Angriffe 1,35x schneller, kaum Erholung). **Revier allgemein** (`revier.js`): Streit nur kurz (`REVIER.ALLY_T` 25 s Pirscher-Nähe oder `MAX_HITS` 8 Treffer), danach Bündnis oder Rückzug des Schwächsten ins Nest (`RETREAT_T`), nie wieder Brocken-Schaden.
- **Abweichungen:** Wut = `m.phase >= 1` oder Dauerwut (kein eigener Netz-Zustand, Runen folgen der Phase); Angriffs-Tempo 1,15 in der Wut nur als Bewegungstempo (`speedFactor`), nicht als Attack-Tempo; Druckwelle (r 3, 14 Schaden) in der Wut an jedem Faustschlag; Sprungstampfer-Ring r 6 mit 5 Pfützen, Kopfstoß 3 kleine Pfützen (r 1,2, Sprengradius 2,6, 20 Schaden), Salve: Pfützen am Aufschlag (klein). Säulen: mindestens 6 hohe Säulen (im Layout sind es 8). `revierstreit_smaragd`: Hauptbrocken Blendax (Spawn Zone 3), alle drei starten im Kampf.
- **Waffen (0.3 umgesetzt):** Stufe 6 Ast `x` ("<Art>-Sprenger", Kraft v+8, `elems.blast 30`, `partDmgMul 1.2`) aus jedem Stufe-5-Ast, Kosten `WEAPON_UPGRADES[6][type].x` (3000 Schrott + je 1 `krachfaust_kruste/faustplatte/runenherz`); `upgradeOptions` gibt aus 5v zwei Optionen (v, x), aus 5k/5g nur x; `cleanBranch`/`gearBranch` kennen `x`; Schmiede-Baum (`hubPanelsA`) hat den Knoten 6x. Sprengung: `combat.resolvePlayerHit` liefert `blastBuild` (blast x Trefferstärke, 0,4-3), `effects.blastBuild` (aus `Hunt.playerHit`) zählt je Angreifer und Teil, bei 100 knallt es (r 2,2 m, `0.08 x Kraft x 6` fest, Teil-HP x1,5, orange/weiße Funken, `PENG n`). Optik: `gear/weaponLook.js markSprenger` (Stein-Dunkelton, jedes sechste Dreieck glüht orange, Glut-Funken) an allen Waffen-Buildern.

---------------------------------------------------------------------------------------------------

## 1. Gemeinsames

### 1.1 Freischaltung (ÜBERHOLT, siehe Abschnitt 0.1/0.2; unten nur Dateiliste)

**(Überholt: es gibt jetzt JR 8-10, siehe 0.2.) Frühere Empfehlung: kein JR 8, alle Smaragd-Aufträge `jr: 7`.** JR 7 erreicht man ausschließlich über den Schlüssel-Auftrag Voltaro (`quests.voltaro.jrUp = 7`, `RANK_RP[7] = 1200`, `progression.RANKS`). "JR 7" heißt also automatisch "Voltaro besiegt + 1200 RP". Null Eingriff in Save/Rang-UI.

Warum nicht JR 8: bräuchte `MAX_JR` (progression.js), `int(d.jr,1,7,1)` (save.js:84), `RANK_RP` (quests.js), `RANKS` (progression.js), Rangtexte in `hubPanelsB.js` ("Höchstrang"), Tests (`rankpoints`, `progression3`, `questboard`) und einen Schlüssel-Auftrag. Gewinn: nur ein weiteres Zahlenschloss.

Dateien:
- `src/data/quests.js`: neue Quests (Abschnitt 1.6); **`inselausflug.jr` 3 -> 7** (optional Belohnung 300 -> 700, es ist jetzt ein Rang-7-Auftrag); `QUEST_ORDER`, `MONSTER_RP` ergänzen.
- `src/meta/progression.js` `questLock()`: neues optionales Feld `quest.needClears: ['blendax','mampfaffe']` (alle `save.clears[id] > 0`), Rückgabe `{ reason: 'clears', need: [ids] }`. Nur Krachfaust und die drei Rotglut-Varianten nutzen es (ca. 4 Zeilen).
- `src/ui/hubPanelsB.js` Zeile ~90: Sperrtext für `reason === 'clears'` ("Erst Blendax und Mampfaffe erlegen."), eine Zeile. Quests, deren Brocken noch nicht registriert ist, zeigen schon "noch nicht im Rostnest angekommen" (`avail`), man kann also Quests vorab eintragen.
- `tests/unit/smaragdkueste.test.js`: erwartet `kinds.length === 5` (wird 8, siehe 1.5) und `inselausflug.world`.

### 1.2 Farbregel: Hacker-Neon-Grün

Alle Glitch-Effekte der drei Brocken: Terminal-/Matrix-Grün.
- Erlaubt: `#39ff14` (Hauptfarbe), `#7dff3a` (Highlight), `#1f9d0f` (dunkel/Puls schwach), `#0b2a0b` (Schwarzgrün, Scanlines), `#d8ffd0` (weißgrün, Peak). Dazu Schwarz und Weiß.
- **Verboten (Pirscher-Glitch, bleibt einzigartig):** Cyan/Blau/Magenta/Rosa. Im Code: `glitch.js` `CYAN [0,.55,.7]`, `MAGENTA [.75,0,.55]`; `monster.js:22` `GL_CYAN [0,.7,.85]`, `GL_MAGENTA [.9,0,.7]`; `ui.css` `#5ad8ff`, `#00e5ff`, `#2af0ff`, `#00ffe5`, `#ff2bd6`, `#ff2a5a`; Glitch-Konter `fx.glitch()` (RGB-Shift + `#game.glitch` Filter), Glitch-Modus-Overlay (`fx.glitchMode`, `fx.glitchTear`, Klasse `body.glitch-mode`). Faustregel: Hue 170-340 Grad ist tabu.
- Wichtig: **Die Smaragd-Karte selbst ist türkis** (`#40f0d0` Glühpilz, `#58ffd0` Tempelstein/Runen). Das ist zu nah am Pirscher-Cyan. Brocken-Glitch muss sich davon klar abheben: gelbgrün (Hue ~110) statt türkis (~165). Die Tempelrunen wechseln in der Wutphase von Türkis auf `#39ff14`.
- Die Pirscher-Glitch-Effekte werden **nicht wiederverwendet** (`fx.glitch`, `glitchTear`, `glitchMode`). Eigene Effekte (1.4) mit eigenen CSS-Klassen (`.mon-glitch*`).
- Mampfaffe-Buff-Farben dürfen Futterfarben sein (Braun, Rot, Gelbgrün-Giftig `#a8c030`), nur der Glitchpilz-Zustand ist Neongrün.

### 1.3 Neue Zustände (Pirscher)

Heute: `Player.addStatus()` (player.js:279) kennt `mud/burn/poison/rost`, Tick in `#tickStatus` (Achtung: früher Return `if (!st.mud && !st.burn ...)`, neue Keys dort eintragen), Rollen-Entfernung in `#statusOnRoll` (`['mud','burn']`), Netz-Snapshot trägt `Object.keys(this.status)`, Bus-Event `playerStatus`. Treffer geben Zustände über `hit.status = { type, t }` (monster.js `_attackHits`).

| Key | Name | Dauer | Wirkung | Entfernen |
|---|---|---|---|---|
| `blend` | Geblendet | Phase 1: 1,0 s Weiß, Phase 2: 1,0 s Betäubt | Phase 1: Vollbild weiß (`fx.whiteout`, letzte 0,2 s Rauschen), Pirscher bleibt steuerbar. Phase 2: `#enter('pinned')` (`HIT_REACTION.pin = 1.0`) + Sterne über dem Kopf | nein; Macke `blendschutz` verkürzt |
| `verwirrt` | Glitch-Verwirrung | 3,0 s | `#moveDir()` (player.js:383) negiert `input.move` (x und y), Ausweichrolle folgt der Richtung, grüner Scanline-Overlay `fx.monGlitch(3)` | Sprudelwasser (`cleanse`), Zeit |
| `schleim` | Glitch-Schleim | Zündschnur 2,0 s (Wut 1,4 s) | pulsiert grün (Farbstufen 1.4), am Ende Explosion am Pirscher: Kugel r 3,4 m, 28 Schaden, `flinch` (trifft auch Mit-Pirscher). Kein Schaden vorher | **eine Rolle** (`rollsLeft: 1`, wie `mud/burn` in `#statusOnRoll`, Text "Abgeschüttelt"), Sprudelwasser |
| `itemlock` | Item-Sperre | solange in Stinkwolke + 1,0 s | `ItemUse.canStart()` (items.js:40) liefert false, Toast "Gestank! Keine Items"; Essen/Grillsteak-Buffs unberührt | Wolke verlassen |

Umsetzung:
- `player.js`: `base`-Tabelle in `addStatus` um `blend {t:2.0}`, `verwirrt {t:3}`, `schleim {t:2.0, rollsLeft:1}`, `itemlock {t:1.0}` erweitern; `#tickStatus` Early-Return-Bedingung auf `Object.keys(st).length` umstellen; `blend`-Phasenwechsel bei `t <= 1.0` (`#enter('pinned')` + `this.stars = true`); `schleim` bei `t <= 0` -> `ctx.spawnEffect?.('schleimblast', {pos})` (wie `bomb` in `effects.js`, jeder Client prüft seinen lokalen Pirscher; Host/Gäste sehen die Explosion), danach `clearStatus('schleim')`.
- `loadout.js:51` wrappt `addStatus` (`resist`-Skalierung der Dauer): neue Typen werden automatisch skaliert; `blend`-Dauer und `schleim` per Macken (1.7) gesondert.
- `src/game/statusFx.js` (Treffer-Funken-Farben für **Brocken**-Zustände, nicht Pirscher): hier nichts nötig, außer Mampfaffe-Buff-Funken (Abschnitt 3: `STATUS_FX.fed_*`). Pirscher-Statusanzeige: `playerStatus`-Event + HUD (`ui/hud.js` Status-Chips) um Icons/Text für die vier Keys erweitern.
- Neue Hit-Felder in `monster.js` `_attackHits` (je 1-3 Zeilen, rückwärtskompatibel):
  - `hit.faceCheck: deg` (nur Blendax): Treffer zählt nur, wenn die **Kamera** des lokalen Pirschers zum Brocken zeigt: `|angleDiff(ctx.cameraYaw, yawTo(monster))| <= deg` (Bildschirm = was er sieht). Hat der Pirscher sich weggedreht, wird der Treffer übersprungen, kein Schaden, kein Zustand.
  - `def.hitStatus(m, inst, h)` -> `{type, t}` | null: zusätzlicher Zustand auf jeden Treffer (Mampfaffe Glitchpilz).
  - `def.onHitPlayer(m, player, h, res)`: Hook nach `takeHit` (Mampfaffe Futterklau).
  - `hit.occlude: true` (nur Krachfaust-Finale): vor `takeHit` `world.coverBetween(src, p.pos)`; gedeckt -> Treffer verfällt (Details Abschnitt 4).
- Brocken-seitig ändert sich nichts an `applyStatus` (Stun/Blind/Rost/Gift gelten wie gehabt; Blendknolle auf Blendax: siehe 2.6).

### 1.4 Neue FX-Hooks (render/fx.js, alles optisch, `nofx` respektieren)

| Hook | Zweck |
|---|---|
| `fx.whiteout(dur, {staticTail})` | Vollbild-DIV weiß, `staticTail` Sekunden Rauschen (Canvas 64x36 hochskaliert oder CSS-Gradient-Steps). Basis: `flashEl` (fx.js:188) |
| `fx.brokenScreen(dur)` | kaputter Bildschirm: Overlay mit 3-4 versetzten Streifen, grüne Scanlines `#39ff14`, 20 Hz Flackern (`steps()`-Animation), nur wenn Blendax im Bild |
| `fx.monGlitch(dur)` | Verwirrt-Overlay: grüne Zeilenverschiebung + Vignette `#0b2a0b`, KEIN RGB-Split |
| `fx.slimeBurst(pos, r)` | Funken `#39ff14` + `#d8ffd0`, Shake; nutzt `spark()` |
| `world.pulse(k)` | Smaragdküste: Licht-Multiplikator (siehe 4) |

Sterne über dem Pirscher: kleiner Kranz aus 4 gelben Oktaedern am Pirscher-Mesh (Geometrie aus `monsters/statusfx.js` `STAR_GEO` wiederverwenden), nur sichtbar bei `status.blend` Phase 2.

### 1.5 Karte / Welt / Futter (gehört zu Mampfaffe, Infrastruktur vorab bei Blendax nur Nest/Route)

**Nest/Route/Spawn** (`src/game/world/smaragdkueste.js`, `smaragdkuesteLayout.js`):
- Heute `NEST_ZONE = { jaggo: 2, barrotz: 3 }`, alles andere nistet in Zone 4; `routeFor(id)` = Route der Nest-Zone; `monsterSpawns = { jaggo, barrotz, default }` (Layout:265).
- Neu: `NEST_ZONE.blendax = 3`, `NEST_ZONE.mampfaffe = 2`; `ROUTE_ZONES = { blendax: [2, 3], mampfaffe: [1, 2] }` -> `routeFor` konkateniert `L.routes[z]` der Zonen (Brocken streifen so durch mehrere Zonen; die Routen berühren sich an den `PASSES`). `krachfaust` bleibt Default (Zone 4, `default` Spawn `(80,-80)`).
- `monsterSpawns.blendax = snap({x:30,z:70},4)` (Zone 3 nahe Pass), `monsterSpawns.mampfaffe = snap({x:-62,z:20},4)` (Zone 2 südlich, nahe Pass 1-2). Test: `smaragdkueste.test.js` Erreichbarkeit für neue Spawns/Routen.

**Futter** (Mampfaffe frisst, Pirscher können es vorher ernten):

| Futter | Item | Sammelstelle | Heute | Neu |
|---|---|---|---|---|
| Kokosnuss | `kokosnuss` | `GATHER_KINDS.kokosnuss` Zone 1: 4, Zone 2: 4 | vorhanden (Item, Gather, Props, Name) | nichts |
| Feuerpilz | `feuerpilz` | Zone 2 | **fehlt** | Item + Gather-Kind + Props-Builder + Name |
| Giftkraut | `giftkraut` | Zone 2 + 3 | **fehlt** (`dschungelkraut` ist harmlos, Zone 2/3, bleibt Bastel-Kraut) | wie oben |
| Glitchpilz | `glitchpilz` | Zone 3 + 4 | **fehlt** (`gluehpilz` Zone 3 ist türkis, bleibt) | wie oben |

Hinzuzufügen:
- `src/data/items.js`: `mat()`-Einträge (Beispiele)
  - `feuerpilz: mat('feuerpilz','Feuerpilz','Rote Kappe, scharfer Atem. Der Mampfaffe liebt ihn.','shroom','#ff5a2a',10)`
  - `giftkraut: mat('giftkraut','Giftkraut','Riecht nach faulen Eiern mit Zitrone. Nicht ins Essen.','leaf','#a8c030',8)`
  - `glitchpilz: mat('glitchpilz','Glitchpilz','Flackert, wenn man nicht hinsieht. Und wenn doch.','shroom','#39ff14',16)`
  - und die Einträge in der Nutzungs-Text-Tabelle (items.js:139ff, "Material von der Smaragdküste.").
- `src/data/gather.js` `GATHER_KINDS` (am Ende des Smaragd-Blocks, `world: 'smaragdkueste'`):
  - `feuerpilz`: `zones {2: 5}`, `uses [1,2]`, sparkle `#ff7a3a`, drops `feuerpilz 100 n[1,1]`
  - `giftkraut`: `zones {2: 3, 3: 4}`, `uses [1,3]`, sparkle `#c8e060`, drops `giftkraut 100 n[1,2]`
  - `glitchpilz`: `zones {3: 3, 4: 4}`, `uses [1,2]`, sparkle `#39ff14`, drops `glitchpilz 100 n[1,1]`
  - `GATHER_ITEM_NAMES` um die drei ergänzen.
- `src/game/world/smaragdkuesteProps.js` `SK_BUILDERS`: drei Builder (Vorlage `gluehpilz(rng)`, Z.191): Feuerpilz = rote Kappe mit gelben Punkten + orange Glut-Punkte; Giftkraut = gelbgrüne Büschel mit violetter Blüte; Glitchpilz = schwarzer Stiel, neongrüne Kappe, `fog:false` leuchtend (Unlit). **Karten-Spots entstehen automatisch**: `placeSmaragdPoints()` iteriert `GATHER_KINDS` (world smaragdkueste), Zone aus `zones`. Nebenwirkung: die RNG-Folge verschiebt die Position nachfolgender Punkte (Karte neu, egal). Futter-Stellen gesamt: Kokos 8, Feuer 5, Gift 7, Glitch 7 (je 1-3 Nutzungen, kein Nachwachsen in der Jagd) -> das Futter ist endlich, Aushungern funktioniert.
- `tests/unit/smaragdkueste.test.js` (`kinds.length` 5 -> 8 und Zonen-Check), `tests/unit/gather.test.js` (`ITEM_IDS` Set).
- Optionale Senken (kein Muss): Kochtopf-Rezept `feuerpilz_pfanne` in `foods.js`, `glitchpilz` in einem Rezept; ohne Senke werden die Items über `value` verkauft.

**Brocken findet/frisst Futter** (Mampfaffe, Abschnitt 3.3): Quelle `ctx.world.gatherPoints` (Felder `kind, zone, pos, usesLeft`), Verbrauch `world.setGatherState(id, usesLeft - 1)` (nur Host/Solo), Gäste bekommen den Stand über `MSG.GATHER {id, u}`: `sync.js:112` sendet das bei Bus-Event `gathered`. Neues Bus-Event `foodEaten {pointId}` + 6 Zeilen in `sync.js`, die genauso `MSG.GATHER {id, u: pt.usesLeft}` an alle senden (nicht `gathered` missbrauchen: `huntmeta.#onGathered` würde Items gutschreiben).

### 1.6 Quests / RP / Rotglut (Werte übernommen, jr/jrUp/needClears siehe 0.2)

Alle `world: 'smaragdkueste'`, `type: 'hunt'`; **`jr`/`jrUp` gemäß 0.2, `needClears` entfällt**. Werte relativ zu Voltaro (2600 Schrott, 180 RP, 25 min), Rotglut-Faktor wie dort (~1,7 Schrott, ~1,45 RP).

| id | name | monster | timeLimit | reward | rp | needClears |
|---|---|---|---|---|---|---|
| `blendax` | Flimmern im Dschungel | blendax | 25 min | 3000 | 200 | - |
| `mampfaffe` | Der Fressfeind | mampfaffe | 25 min | 3200 | 220 | - |
| `krachfaust` | Krach im Tempel | krachfaust | 30 min | 5200 | 300 | blendax, mampfaffe |
| `blendax_rotglut` | Rotglut: Blendax | blendax | 25 min | 5100 | 290 | blendax |
| `mampfaffe_rotglut` | Rotglut: Mampfaffe | mampfaffe | 25 min | 5400 | 320 | mampfaffe |
| `krachfaust_rotglut` | Rotglut: Krachfaust | krachfaust | 30 min | 8800 | 440 | krachfaust |

Rotglut-Einträge: `variant: 'rotglut', mutators: ['rotglut']` (gibt hpMul 1,4, Dauerwut, Beute x2 aus `data/mutators.js`; `matMul` wird am Dateiende automatisch gesetzt). Rotglut-Haken je Brocken in den Abschnitten.
`MONSTER_RP`: `blendax: 200, mampfaffe: 220, krachfaust: 300`. `QUEST_ORDER.push('blendax','mampfaffe','krachfaust','blendax_rotglut','mampfaffe_rotglut','krachfaust_rotglut')` (hinter `inselausflug`). Wochen-Feldstudie (`fieldstudy.js`, `EXTRA` mit hartem `world:'rostwerke'`) bewusst **nicht** erweitern.

### 1.7 Ausrüstung: so hat Rostwerke es gemacht (Muster)

- **Sets** `data/armor.js`: `set(id, name, prot, skills, pieces)` + `piece(name, cost, skills)`, Kosten `schrott` + 3-5 Materialien, in `ARMOR_SETS` und `SET_ORDER`; neue Macken in `SKILLS` (`desc`-Funktion), Zahlen in `meta/loadout.js` `skillEffects` (z. B. `shockResist: 1 - 0.8 ** lvl('erdung')`, `counterBuff`). Optik: `src/game/gear/armor.js` (`SETS = {...}` Builder je Set, Z.465) und `data/gearlook.js` (`GEAR_SETS`, `SET_TIER`). Rostwerke-Prot: Kroll 34, Gorgo 36, Voltaro 40; Schrott 1000-1800.
- **Waffen** `data/weapons.js`: `tiers[i]` mit `branches`; Stufe 5 = Äste `k/g/v` (nur aus Stufe 4), Stufe 6 = nur aus `v` (Voltaro-Herz). Kosten in `WEAPON_UPGRADES[5][type][branch]` und `[6][type]`. Extra-Felder: `bluntMul`, `poisonMul`, `partDmgMul`. Save-Bereinigung `cleanBranch` (save.js:69) kennt Äste pro Stufe, Skill-/Tree-UI `hubPanelsA.js:35ff` (`nodeState`, `BRANCHED`), Optik `game/gear/*Look.js` (Stufe 5/6 Paletten `kroll/gorgo/volt`).
- **Drops** `data/drops.js`: `carve` (gewichtet), `tail`, `breaks` nach `partTag()`, `reward`. Material-Items `mat(...)` in `items.js`.
- **Kompendium** `data/compendium.js`: `BESTIARY`-Eintrag (`id,name,where,title,intro,entries[{at,kind,name,text}]`), `CONDITIONS` (Zustände), `ELEM_NOTES` (Sonderregeln).
- **Brocken-Register** `monsters/index.js` (1 Import + 1 Zeile). Tests nach Muster `tests/unit/b3_voltaro.test.js`.

**Waffen-Haken für Smaragd (ÜBERHOLT durch 0.3: nur Ast `x` aus Krachfaust, mit Sprengung)**: Stufe 6 bekommt zusätzlich die Äste `b` (Blendax), `m` (Mampfaffe), `x` (Krachfaust), erreichbar aus **jedem** Stufe-5-Ast (kein Voltaro-Herz nötig; `v` bleibt der Voltaro-Weg). Deltas relativ zum Stufe-6-`v`-Wert desselben Typs: `b` Kraft +0, Krit +0,15; `m` Kraft +4, `bluntMul 1.4`; `x` Kraft +8, `elems.fire 34`, `partDmgMul 1.2`. Dateien: `weapons.js` (`tiers[5].branches` je Typ, `WEAPON_UPGRADES[6]` von flach auf pro Ast umstellen, `upgradeOptions` Stufe 6), `save.js` `cleanBranch` (`tier === 6` -> `b|m|x|v`), `hubPanelsA.js` `nodeState`/Baumknoten, `gearlook.js`/`*Look.js` (Fallback `volt`-Palette mit Tönung genügt), Tests `weapon.test.js`, `armory.test.js`. Kosten Stufe 6 (Smaragd): `schrott 3000` + Brocken-Mats (3.9/2.9/4.9) + `glimmstein 2`.

### 1.8 Sound / Musik (gemeinsam)

Keine neuen Tracks. `audio/sfx.js` (prozedural): neue Namen `blendFlash` (1 s steigender Sägezahn + Rauschbursts), `whiteStatic` (0,25 s Highpass-Rauschen), `chew`, `burp`, `stinkHiss`, `glitchTp` (Klick + Pitch-Sprung), `slimePulse` (Tick, Parameter `pitch`), `slimeSplat`, `charge` (Loop, Pitch/Tempo steigt), `boom` (Finale, tief + lang). Sie werden über `ctx.bus.emit('sfx', { name, pos, ... })` ausgelöst. Musik: `audio/music.js` `computeIntensity` liefert bereits Stufe 3 bei Glitch-Modus; für Krachfaust-Finale `hunt.musicChainT` ähnlich wie bei `glitchCounter` hochhalten (kein neuer Code nötig).

### 1.9 Tests (gemeinsam je Brocken)

Nach `b3_voltaro.test.js`: Register (`monsters.<id>`), HP/Scale, Teile-IDs, jeder Angriff hat `cue`, `telegraph >= 0.5` (`MIN_TELEGRAPH`), Angriffe mit `hits` haben `audit` (siehe `jaggo.js`), Ketten-IDs existieren, Pose-Tracks sampeln ohne Fehler, Determinismus über `AttackInstance`. Plus: `variety.metric.test.js` (Liste der Defs), `compendium.test.js`, `gear.test.js` (Sets), `questboard.test.js`.

---------------------------------------------------------------------------------------------------

## 2. BLENDAX (Tzitzi-Ya-Ku)

### 2.1 Rolle / Zonen
Schneller, aggressiver Raptor mit Warnschirm. Nest Zone 3 (`NESTS[3] = (70,70)`), Route Zone 2+3. Stärker als Jaggo in allem (HP x3, Tempo +30 %, Treffer x1,5), im dichten Nebel von Zone 3 (`ENV[2]`: near 9 / far 58) am gefährlichsten. Signatur: **Blitz** (Schirm-Blendung) und danach Sprungketten auf den Geblendeten.

### 2.2 Modell
`buildRaptor({ scale: 1.5, skin: <neu 'blendax_scale'>, crest: true, eye: '#ffe14d' })` (raptor.js; Knoten `body, neck, head, tail1, tail2, legL, legR`, Teile `head/body/legs/tail`). Neu `buildBlendax()` in `blendax.js` als Wrapper:
- `extra.crest` (CircleGeometry-Schirm, `partMeshes.head`) auf Skalierung ~1,9 und eigenes Material: `basic({ map: tex('blendax_frill'), side: DoubleSide, fog: false })` (Textur: Schwarz mit zerrissenen Bildschirmblöcken, Scanlines, grüne `#39ff14`-Streifen). Der Schirm bekommt `partMeshes.frill` (eigener Teil), `fog: false` => im Nebel von Zone 3 sichtbar (gewolltes Lesbarkeits-Telegraph).
- Haut: ziegelrot/orange mit blauem Rücken (Textur `blendax_scale`, neu in `render/textures.js`); keine Neon-/Türkistöne außer dem Schirm.
- Schirm-Flackern: in `def.tick(m, dt)` bzw. `poseHook`: bei aktivem `blendax_blitz` (Telegraph) `frillMat.opacity` / Farbe alle 1/24 s zwischen Textur und Schwarz toggeln. `onBreak(frill)`: Schirm-Mesh unsichtbar + `extra.stump` (wie Jaggo-Kamm `extra.stump`).
- Pose-Schlüssel: MREST wie Jaggo (`neck, head, bodyPitch, bodyY, bodyRoll, legL/R, tailPitch/Yaw`), `spread` = Schirm auf (0..1, `apply()` skaliert crest).

### 2.3 Werte

```
id 'blendax', name 'Blendax, der Flimmerfürst', hp 14000, scale 1.5, bodyRadius 1.7, predator true,
walk 4.2, run 11.0, turn 1.35, detect 34 (Zone 3: 40), prefer 5,
stamina true, flinchDmg 950, teachAttack 'blendax_bissreihe',
recoverAfter: (m) => (0.12 + m.rng() * 0.25) / (1.35 * m.speedMul)    // Jaggo: 0.2-0.6 / 1.25
```
Angriffe laufen mit `tempo: 1.3` (Jaggo 1,25), Hit-Radien wie Jaggo nach seinem +20 %-Block (Jaggo verändert seine Defs beim Import; Blendax **klont** nach diesem Import).

Klon-Helfer in `monsters/common.js`: `retune(def, { id, dmgMul, tempo, cooldown })` (tiefe Kopie von `hits`, `pose` bleibt geteilt, `id` ersetzen, `chains`-Verweise werden separat gebaut).

### 2.4 Moveset

| Angriff (Klon von) | Reichweite | Telegraph | Dauer | Treffer | Besonderes |
|---|---|---|---|---|---|
| `blendax_bissreihe` (jaggo_bissreihe) | 2-6,5 | 0,55 (nach tempo auf 0,5 geklemmt) | 2,4 | 3 Bisse je 17, flinch | Teach-Angriff |
| `blendax_huepfer` (jaggo_huepfer) | 3,5-12 | 0,6 | 2,2 | Landung r 2,9, 32, down | Landemarker wie Jaggo, max 12 m |
| `blendax_schwanz` (jaggo_schwanz, `lockedByBreak: 'tail'`) | 0-6 | 0,6 | 1,9 | Kapsel 24 flinch | |
| `blendax_rueckhuepfer` (jaggo_rueckhuepfer, tail) | 0-4,5 | 0,6 | 2,1 | 24 flinch | `punishRoll` |
| `blendax_zickzack` (jaggo_zickzack) | 2,5-8 | 0,65 | 2,3 | 4 Bisse 15/15/15/20 | Gewicht hoch bei Schirmbruch |
| `blendax_blitz` (NEU, Flash) | 4-30 (Zone 3: 4-45) | **1,0** | 2,2 | 1 Treffer t 1,0-1,12, Kugel r 60 am Brocken, **dmg 0**, `knock:'none'`, `faceCheck: 80`, `status {type:'blend'}` | `lockedByBreak: 'frill'`, Cooldown 14 s (Zone 3: 9 s), `stam 10`. Details 2.5 |
| `blendax_sprung` -> `_2` -> `_3` (NEU, Sprungkette) | 3-14 | 0,55 / 0,5 / 0,5 (`internal` Folgesprünge) | 1,3 / 1,2 / 1,5 | je Landung r 2,6 dmg 28/28/34, die dritte `down` | je Sprung neues Ziel = aktuelle Pirscher-Position (`prepare` liest `a.target`), `minL/maxL` 3-9 m wie `voltaro_pranken2/3` |
| `blendax_hetzjagd` (jaggo_hetzjagd, Phase 50 %) | 6-22 | 0,8 | 2,9 | Überrennen 30 down + Biss 24 | `phases: [{ at: 0.5, name: 'Flimmerfieber', special: 'blendax_hetzjagd' }]`: ab dann Blitz-Cooldown x0,7 |

Ketten (`chains`, Muster Voltaro): `bissreihe -> {huepfer 2, rueckhuepfer 2, schwanz 2, blitz 3 (nur Schirm ganz), null 3, zickzack 4 (Schirmbruch)}`, `zickzack -> {bissreihe 3, null 2}`, **`blitz -> {sprung 10, null 1}`** (Blendax setzt dem Blitz *immer* die Sprungkette hinterher; Ziel = der Pirscher, der dem Brocken am direkten zugewandt ist, Host rechnet das aus `p.rot` der Remote-Pirscher, weil Treffer client-seitig ausgewertet werden und der Host nicht weiß, wer geblendet wurde), `sprung -> {sprung2 8, null 2}`, `sprung2 -> {sprung3 6, null 2}`.
Schirmbruch-Wut: `m.hopFury = 25` s (`onBreak`), währenddessen `speedMul x1,15` und Kette `huepfer -> sprung2/3` mit Gewicht 4 (2-3 Sprünge in Folge), `blitz` ist gesperrt (`lockedByBreak`).

### 2.5 Blitz im Detail (Telegraph, Konter)

| t (s) | Ereignis |
|---|---|
| 0,0 | Schirm klappt auf (`spread` 0 -> 1 in 0,3 s), Flackern startet (24 Hz), `sfx blendFlash`; `all`-Event `warn`: lokaler Pirscher mit Blendax im Bild (Kameracheck) bekommt `fx.brokenScreen(1.0)` (kaputter Bildschirm, **kein** Schaden, nur Warnung) |
| 0,0-1,0 | Pirscher kann sich wegdrehen (Kamera/Blick weg) oder auf den perfekten Moment rollen |
| 1,0-1,12 | Treffer: nur wer `faceCheck`-sichtbar ist. Ergebnis `hit` -> `blend`; `iframe` -> nichts; `perfect` -> **Glitch-Konter** |
| nach Treffer | Geblendet: 1,0 s `fx.whiteout(1.0, {staticTail: 0.2})`, danach 1,0 s `pinned` + Sterne. Blendax startet **sofort** `blendax_sprung` (Kette) |

Glitch-Konter funktioniert wie beim Rudelruf-Schrei: `Player.takeHit` (player.js:187) liefert `'perfect'`, wenn die Rolle im `rollPhase === 'perfect'`-Fenster liegt und der Treffer-Key (`h.key|player.id`) neu ist, ruft `#glitchCounter()` (Zeitlupe `time.slowmo(0.35, 0.25)`, `fx.glitch`, Bus `glitchCounter`). Der Blitz-Treffer hat `dmg 0` wie der `pin`-Treffer des Rudelrufs und taugt daher genauso. Wirkung am Brocken: `monster.js:111` bricht bei `glitchCounter` jede Kette ab (`_chainBreak`); zusätzlich im Blendax-`init`: `ctx.bus.on('glitchCounter', e => { if (m.attack?.id === 'blendax_blitz') { m._interrupt(); m.recover = 2.0; m.extra.dizzy = 1.8 } })` -> **Blendax taumelt 1,8 s** (Schirm flackert aus, Sterne via `statusFx stun`-Look), die Sprungkette entfällt. Pirscher gewinnt Glitch-Energie (+35).
Hinweis: wer weggedreht ist, kann nicht kontern (der Treffer wird per `faceCheck` gar nicht erst gewertet). Wegdrehen = sicher, Hinschauen+Rollen = Belohnung.

### 2.6 Zonen-3-Nebel
`def.tick`: `m.fogged = world.zoneAt(m.pos.x, m.pos.z) === 3`. Gefogt: Lauf x1,1; Blitz-Reichweite 45, Cooldown 9 s; `detect` 40. Der Schirm ist unabhängig vom Nebel sichtbar (`fog:false`), also bleibt der Angriff lesbar. Blendknolle gegen Blendax: Standard-`blind` (4 s) unterbricht Angriff und Kette (`applyStatus('blind')`), das ist der Konter-Gegenstand für Gruppen.

### 2.7 Teile / Schwächen

| id | label | factor | breakHp | elem (fire/shock) | Hinweis |
|---|---|---|---|---|---|
| `kopf` | Kopf | 1,0 | 1000 | 15/10 | `blunt`, `stunPart`; Bruch: Biss-Gewicht x1,5 |
| `frill` | Warnschirm | 0,9 | 1450 | 10/**35** | Bruch: kein Blitz mehr, `hopFury` 25 s (wütende Sprungketten 2-3), Schirm-Stumpf |
| `koerper` | Körper | 0,7 | - | 15/15 | |
| `beine` | Beine | 0,8 | - | **22**/10 | |
| `tail` | Schwanz | 0,8 | 850 | 10/10 | Bruch: `severTail(m)` (common.js), Schwanzwirbel + Rückhüpfer entfallen |

`ELEM_NOTES.blendax`: "Schock auf dem Schirm kurzschließt ihn: er flackert wild und blitzt nicht mehr.". Umsetzung: `onElement`/`onDamage` auf `frill` mit Schock > 0 -> `m.extra.blitzLock = 6` s (Blitz gesperrt). Keine `glitchSpots` (Owner-Entscheidung Okt 2026 für Rostwerke-Brocken, gilt hier mit).

### 2.8 Rotglut-Haken
`onRage(m, on)`: Augen `#ff3020`; Blitz-Telegraph 0,8 s (Engine kürzt Wut-Telegraphs um 20 %, min 0,5), Sprungkette auch bei intaktem Schirm 2 Sprünge. `quest.mutators ['rotglut']` regelt HP/Beute.

### 2.9 Kompendium (`BESTIARY`, Format wie bisher)

```js
{
  id: 'blendax', name: 'Blendax', where: 'Smaragdküste · Dschungel & Tiefer Dschungel', title: 'Flimmerfürst',
  intro: 'Ein Raptor mit einem Schirm wie ein kaputter Bildschirm. Wenn er flackert, ist es zu spät zum Nachdenken: nicht hinsehen.',
  entries: [
    { at: 1, kind: 'angriff', name: 'Bissreihe & Hüpfer', text: 'Wie Jaggo, nur schneller und härter. Drei Bisse, dann ein Sprung bis 12 m. Rollen, nicht rückwärts laufen.' },
    { at: 1, kind: 'angriff', name: 'Blitz', text: 'Der Schirm klappt auf und flackert, dazu ein Pfeifen. Eine Sekunde später blendet er alle, die ihn ansehen: 1 s Weiß, 1 s Sterne, und er springt dir schon entgegen. Wegdrehen hilft.' },
    { at: 2, kind: 'angriff', name: 'Sprungkette', text: 'Nach dem Blitz: drei Sprünge hintereinander auf den Geblendeten, jeder landet dort, wo du eben standest.' },
    { at: 2, kind: 'verhalten', name: 'Glitch-Konter', text: 'Wer ihn im Moment des Blitzes ansieht und im richtigen Augenblick rollt, kontert mit einem Glitch: Blendax taumelt knapp 2 s.' },
    { at: 3, kind: 'schwaeche', name: 'Schirm', text: 'Schock auf den Schirm schließt ihn kurz: 6 s kein Blitz. Bricht er, blitzt Blendax nie wieder, springt dafür 25 s lang in wütenden Ketten.' },
    { at: 3, kind: 'verhalten', name: 'Nebel', text: 'Im Tiefen Dschungel blitzt er öfter und von weiter weg. Den Schirm erkennst du auch im Nebel.' },
    { at: 4, kind: 'angriff', name: 'Flimmerfieber', text: 'Unter der Hälfte rennt er in einem Bogen heran und beißt zum Schluss. Der Blitz kommt dann öfter.' },
  ],
}
```
`CONDITIONS` ergänzen: `{ id: 'blend', name: 'Geblendet', who: 'du', text: 'Blendax-Blitz: 1 s Vollbild weiß, danach 1 s betäubt. Nur wer hinsieht. Wegdrehen schützt, ein Glitch-Konter dreht den Spieß um.' }`.

### 2.10 Drops

Neue Materialien (`items.js` `mat()`, Werte wie Voltaro 70-90 für Seltenes): `blendax_schuppe` ("Schuppe, die Licht schluckt." `crest`/`fur` Icon, value 75), `blendax_klaue` (value 70), `blendax_schirm` (value 90, Icon `crest`), `blendax_flimmerlinse` (selten, value 300, Icon `gem`).

```js
blendax: {
  carve: [{ id:'blendax_schuppe', w:46 }, { id:'blendax_klaue', w:28 }, { id:'blendax_schirm', w:10 }, { id:'glimmstein', w:12 }, { id:'blendax_flimmerlinse', w:4 }],
  tail:  [{ id:'blendax_klaue', w:60 }, { id:'blendax_schuppe', w:30 }, { id:'blendax_flimmerlinse', w:10 }],
  breaks: { frill: [{ id:'blendax_schirm', n:1, chance:1 }], head: [{ id:'blendax_schuppe', n:[1,2], chance:1 }], tail: [{ id:'blendax_klaue', n:[1,2], chance:1 }] },
  reward: [{ id:'blendax_schuppe', n:[1,2], chance:1 }, { id:'blendax_klaue', n:1, chance:0.5 }, { id:'blendax_schirm', n:1, chance:0.3 }, { id:'blendax_flimmerlinse', n:1, chance:0.12 }],
}
```
(`partTag('frill')` liefert `'frill'` unverändert, Schlüssel passt ohne Codeänderung.)

### 2.11 Rüstung / Waffe
Set `blendax` (Prot **44**, Macke `blendschutz`, `max 3`: `desc: l => 'Blendung: Weiß −' + 0.3 * l + ' s, Betäubung −' + 0.3 * l + ' s'`; Stufe 3 = weiß 0,1 s, keine Betäubung; Zahlen in `loadout.skillEffects.blendCut`, gelesen von `Player` beim `blend`-Setzen).

| Teil | Kosten |
|---|---|
| Blendax-Blinzelhaube (head) | schrott 2000, blendax_schuppe 3, blendax_schirm 1, glimmstein 1 |
| Blendax-Schuppenpanzer (body) | schrott 2300, blendax_schuppe 5, blendax_klaue 2, blendax_schirm 1 |
| Blendax-Sprungstiefel (legs) | schrott 2000, blendax_schuppe 3, blendax_klaue 3 |

Zusatz-Macke je Teil `flinkfuss: 1` (Rollen-I-Frames, passt zum Sprungkampf). Optik `gear/armor.js` + `gearlook.js` (`SET_TIER.blendax = 7`). Waffe: Ast `b` (1.7), Name-Schema "Flimmer-<Typ>", z. B. Plattmacher "Flimmerklinge", crit-lastig.

### 2.12 Musik / Sound
`blendFlash`, `whiteStatic`; Telegraph-Cue-Farbe `#39ff14`, Ton `schrill` (`cue` in `AttackDef`; `cues.js` Farben prüfen: keine Cyan-Töne).

### 2.13 Budget
Ca. 650 Zeilen `blendax.js` (Klone sparen ~300), 250 Infrastruktur (faceCheck, Status, Overlay-FX, retune, Welt-Nest/Spawn), 120 Daten, 150 Tests. Aufwand M. Risiko: Kameracheck im Koop (nur lokaler Pirscher, deterministisch ok).

### 2.14 Build-Checkliste
1. `src/game/monsters/common.js` `retune()`
2. `src/game/monsters/monster.js` `faceCheck`, `hitStatus`, Telegraph-Hook, Dizzy (`extra.dizzy`)
3. `src/game/player.js` Status `blend`, `itemlock`, `verwirrt`, `schleim` Grundtabelle (Infra für alle drei; Rest je später)
4. `src/render/fx.js` `whiteout`, `brokenScreen`; `ui.css` `.mon-glitch*`
5. `src/render/textures.js` `blendax_scale`, `blendax_frill`
6. `src/game/monsters/blendax.js` (+ `index.js` 1 Import/1 Zeile)
7. `src/game/world/smaragdkueste.js` + `...Layout.js`: `NEST_ZONE`, `ROUTE_ZONES`, `monsterSpawns.blendax`
8. `src/data/{drops,items,compendium,quests,armor}.js` (+ `loadout.js` `blendCut`, `gearlook.js`, `gear/armor.js`)
9. `src/audio/sfx.js` `blendFlash`, `whiteStatic`
10. (erledigt: Rang-Infrastruktur, `inselausflug.jr = 7`; offen: `RANKS`-Eintrag je Brocken, siehe 0.2)
11. Tests: `blendax.test.js`, `smaragdkueste.test.js`

---------------------------------------------------------------------------------------------------

## 3. MAMPFAFFE (Conga)

### 3.1 Rolle / Zonen
Streunt durch **Zone 1 und 2** (`ROUTE_ZONES.mampfaffe = [1, 2]`, ersetzt "alle vier Zonen"), frisst Futterstellen und wechselt Buffs. Kein Apex, aber Taktik-Brocken: wer Futter vorher erntet, nimmt ihm Fähigkeiten. Nest Zone 2, Patrouille nur Zone 1+2 (0.5). Namens-Hinweis: nicht mit der friedlichen Fauna `mampfer` (monsters/mampfer.js, `mampfer*`) verwechseln: Id `mampfaffe`, Dateien `mampfaffe.js`.

### 3.2 Modell
Neues `buildMampfaffe({ scale: 1.8 })` (Boxen wie `buildBarrotz`/`buildRaptor`, Hilfsfunktionen `add(part, w,h,d, mat, parent, x,y,z)`; Teile-Meshes je `partMeshes[part]`; PS1 `lambert` mit Textur `tex(name, {size:16})`):
- Knoten: `body` (breit, vorn hoch), `neck`, `head` (kleiner Kopf, Backentaschen `cheekL/R` als seitliche Würfel mit `spread` 0..1 = aufgeblasen), `jaw`, Arme `armL/armR` (lang, Knöchelgang, Fäuste 0,7er Würfel), `legL/legR` (kurz, hockend), Stummelschwanz. Fell: Textur `mampfaffe_fur` (braun-beige), Gesicht dunkel.
- Pose-Schlüssel (MREST wiederverwendet wie Kroll/Gorgo es tun): `legL/legR` = Arm-Schwung, `wing` = Brust/Arme nach innen (Brusttrommeln), `spread` = Backen, `jaw`, `bodyY/bodyPitch/bodyRoll`, `head/neck`. Beine werden vom Lauf-Zyklus bewegt (`m.walkPhase`, wie Barrotz).
- **Buff-Leuchten**: Fell-Materialien (`mats[...].emissive`) bekommen Farbe und Puls (`def.tick`): Kokos `#c8902c`, Feuerpilz `#ff4a1a`, Giftkraut `#a8c030`, Glitchpilz `#39ff14` (nur dieser flackert, 12 Hz, mit Scanline-Verschiebung der Fell-Textur-Offsets `tex.offset.y` stufenweise). Brocken-Körpersprache zusätzlich über `monsters/statusfx.js` (Puffs in Buff-Farbe am Mund).

### 3.3 Werte und Futter-KI

```
id 'mampfaffe', name 'Mampfaffe, der Magenkönig', hp 16000, scale 1.8, bodyRadius 1.9, predator true,
walk 3.4, run 8.0, turn 1.1, detect 30, prefer 4.5, stamina true, flinchDmg 1050, teachAttack 'mampfaffe_faeuste',
recoverAfter: (m) => (0.15 + m.rng() * 0.3) / m.speedMul
```
Angriffe `tempo 1.15`, Treffer 14-44.

**Fressen** (`def.tick` + interner Angriff `mampfaffe_fressen`, nur Host/Solo entscheidet, alle sehen das Ereignis):
1. Alle 1,5 s (nur wenn kein Angriff, `foodCd <= 0`, kein Buff oder Buff < 10 s): nächste `world.gatherPoints` mit `kind ∈ {kokosnuss, feuerpilz, giftkraut, glitchpilz}`, `usesLeft > 0`, Distanz <= 40 m (wander) bzw. <= 18 m (combat). Zone egal (er verlässt Zonen, folgt der Route sonst).
2. Läuft hin (`wanderTo`, im Kampf nur wenn der Pirscher > 8 m weg ist), `mampfaffe_fressen` (`internal`, 2,2 s, Telegraph 0,6 = Maul auf, `hits: []`): bei t 1,2 `world.setGatherState(id, usesLeft - 1)` + Bus `foodEaten`, Buff setzen. Er ist beim Fressen verwundbar (kein Super-Armor), Flinch unterbricht -> Futter bleibt (nur Verbrauch bei Event).
3. Buff: `m.food = { kind, t: 40 }` (40 s), neuer Buff überschreibt, danach `foodCd = 12`. Betäubung (`stunT`) oder Teilbruch am Kopf beendet den Buff ("spuckt es aus": Puff, Zahl "Ausgespuckt"). `snapExtra` -> `{ food: kind, foodT }`, Gäste zeigen Leuchten/Anim.
4. Aushungern: ist **kein** Futter mehr da (alle Stellen `usesLeft 0`) und 120 s ohne Buff vergangen: "Knurrender Magen", +10 % Schaden, `mampfaffe_grabbel` Gewicht x2 (er sucht sich Futter bei den Pirschern). Kompendium weist auf diese Taktik hin.

**Futterklau**: Treffer von `mampfaffe_grabbel` (`hit.steal: true`), Hook `def.onHitPlayer(m, player, h, res)`: bei `res === 'hit'` und lokalem Pirscher `p.local`: aus `hunt.inv.loot` (`game/inventory.js`, die in der Jagd gesammelten Materialien, `gathered()`) **nur** `FOOD_IDS = ['kokosnuss','feuerpilz','giftkraut','glitchpilz']` auswählen (zufällig ein vorhandenes, Menge Kokos 2, sonst 1) und abziehen; Zahl "−1 Feuerpilz geklaut!" (`fx.number`). Nichts anderes (kein Item der Item-Leiste, keine anderen Materialien, `unbring` nicht anfassen). Der Brocken frisst das Geklaute sofort (Event `foodStolen {kind}` -> Host setzt Buff, ohne Stelle zu verbrauchen). Koop: der getroffene Client zieht seinen eigenen Beutel ab und sendet das Event über den vorhandenen EV-Kanal.

### 3.4 Moveset

Grundangriffe (immer):

| Angriff | Reichweite | Telegraph | Dauer | Treffer | Besonderes |
|---|---|---|---|---|---|
| `mampfaffe_faeuste` (Teach) | 0-5 | 0,6 | 2,0 | zwei Fäuste nacheinander t 0,7/1,0: je 30, flinch, dann Faust-Stampf 36 down t 1,45 | Ausfallschritt |
| `mampfaffe_grabbel` | 0-4,5 | 0,5 | 1,3 | schneller Wischer 14 flinch, `steal: true` | Klau; Gewicht 3 |
| `mampfaffe_stampfer` | 0-7 | 0,7 | 2,2 | Sprung + Landung r 5,0, 32 down | `marker self r 5` |
| `mampfaffe_rolle` | 5-16 | 0,7 | 2,6 | rollt 12 m gerade, Kapsel r 1,6, 30 down | Wand-Prall: 1,2 s dizzy |
| `mampfaffe_brust` | 0-30 | 0,8 | 2,4 | Brusttrommeln, Kugel r 8, dmg 0, `knock:'pin'` | Rudelruf-Muster: Glitch-Konter möglich; `cond` Abstand < 8 |
| `mampfaffe_fressen` | intern | 0,6 | 2,2 | - | siehe oben |

Buff-Angriffe (nur bei passendem `m.food.kind`, Gewicht 6, Cooldown 5-8 s):

| Buff | Angriff | Telegraph | Wirkung |
|---|---|---|---|
| Kokosnuss (Zone 1/2) | passiv: **harter Schädel** | - | `kopf.factor` x0,5 (und Teil-HP-Schaden halbiert), Kopf wird bräunlich glänzend, Funken `#c8902c` bei Kopftreffern |
| | `mampfaffe_kokoswurf` | 0,7 | 3 Kokosnüsse im Bogen (`mprojectiles.js`: `mudDef` -> neues `kokosDef`, `kind:'kokos'`, `mode:'impact'`, `splash 1.3`, `dmg 16`, `knock:'flinch'`, Reichweite 6-22), Aufschlag-Marker, Streuung wie `gorgo_spucke` |
| Feuerpilz (Zone 2) | `mampfaffe_feuerruelpser` | **0,9** (Backen blähen sich rot, `spread` 1) | Kegel 8 m / 60 Grad vor dem Maul: 3 Kugeln z 2,5/5/7,5, r 1,6/2,2/2,8, t 1,0-1,5, **dmg 20 + Brand** (`status {type:'burn'}`) |
| Giftkraut (Zone 2/3) | `mampfaffe_stinkwolke` | 0,8 | Wolke r 5,5 m für 9 s an der Maulposition/(Ziel bei Wurf): im Inneren alle 1,0 s `poison` aufgefrischt (8 s) **und `itemlock`**; Brocken selbst unbeeindruckt. Liste `m.extra.clouds` wie Gorgo-Pools (`gorgo.js` `m.extra.pools` + Tick), Mesh: durchsichtige gelbgrüne Würfel-Wolke (Puffs aus `statusfx.puff`) |
| Glitchpilz (Zone 3/4) | `mampfaffe_flimmersprung` | 0,5 | **Flicker-Teleport** bis 9 m: ab t 0,5 Mesh flackert (`visible` 24 Hz, Neongrün-Silhouette), bei t 0,8 neue Position (seitlich/hinter dem Ziel, `a.landing` per `prepare`), Treffer r 2,4, 24 down |
| | passiv: **Verwirrungstreffer** | - | `def.hitStatus(m)`: jeder Treffer (alle Angriffe) setzt `verwirrt` 3 s |

Ketten: `faeuste -> {grabbel 3, stampfer 3, buff-Angriff 4 (wenn Buff), null 3}`, `grabbel -> {faeuste 4, null 2}`, `rolle -> {stampfer 2, null 3}`, `brust -> {rolle 2, faeuste 3}`.
Phase 50 % "Fressrausch": `special: 'mampfaffe_brust'`, Buff-Dauer 60 s und `foodCd` 6 s.

### 3.5 Teile / Schwächen

| id | label | factor | breakHp | elem (fire/shock) | Notiz |
|---|---|---|---|---|---|
| `kopf` | Kopf | 1,0 (Kokosbuff 0,5) | 1050 | 10/10 | `blunt`, `stunPart`; Bruch: Buff weg, Kokoswurf gesperrt |
| `prankeL` / `prankeR` | Fäuste | 0,8 | 650 | 15/10 | Bruch: Faustschlag-Schaden x0,75 auf der Seite |
| `bauch` | Bauch/Backentaschen | 0,9 | - | **28**/10 | Feuer wirkt gut (Fett); mit Feuerpilz-Buff nur 0 (immun, "frisst Feuer") |
| `koerper` | Körper | 0,6 | - | 15/15 | |
| `beine` | Beine | 0,8 | - | 15/**25** | Schock lähmt: `stunT` Aufbau x1,3 |

`ELEM_NOTES.mampfaffe`: "Mit Feuerpilz im Bauch ist Feuer wirkungslos; mit Glitchpilz verträgt er keinen Schock (flackert, Teleport gesperrt 5 s).". `onElement`-Hook.

### 3.6 Rotglut-Haken
Dauerwut + Buff ist **immer** an (`foodCd 0`, Startbuff zufällig aus Zone-Futter), Buff-Dauer 60 s. `onRage`: Augen rot.

### 3.7 Kompendium

```js
{
  id: 'mampfaffe', name: 'Mampfaffe', where: 'Smaragdküste · überall', title: 'Magenkönig',
  intro: 'Ein hockender Affe, der alles frisst, was im Dschungel wächst, und von jedem Happen etwas ganz anderes wird. Sein Fell zeigt dir, was er zuletzt gegessen hat.',
  entries: [
    { at: 1, kind: 'angriff', name: 'Fäuste', text: 'Zwei Faustschläge, dann ein Stampfer. Seitlich raus, nicht zurück.' },
    { at: 1, kind: 'verhalten', name: 'Fressen', text: 'Er sucht Kokosnüsse, Feuerpilze, Giftkraut und Glitchpilze. Beim Fressen steht er 2 s still: freier Schlag. Wer die Stellen vorher abräumt, nimmt ihm den Buff.' },
    { at: 2, kind: 'verhalten', name: 'Futterklau', text: 'Sein Wischer klaut dir genau eines von den vier Futtersorten aus dem Beutel, sonst nichts. Er frisst es sofort.' },
    { at: 2, kind: 'angriff', name: 'Kokos (braunes Fell)', text: 'Harter Schädel: Kopftreffer richten nur halben Schaden an. Dazu wirft er drei Kokosnüsse in hohem Bogen.' },
    { at: 3, kind: 'angriff', name: 'Feuerpilz (rotes Fell)', text: 'Backen blähen sich auf, dann ein Feuerrülpser im Kegel, 8 m. Brennen. Mit dem Pilz im Bauch ist er feuerfest.' },
    { at: 3, kind: 'angriff', name: 'Giftkraut (gelbes Fell)', text: 'Stinkwolke, 5,5 m, 9 s: Gift, und du kannst keine Items benutzen, solange du drinstehst. Raus, dann heilen.' },
    { at: 4, kind: 'angriff', name: 'Glitchpilz (grünes Flackern)', text: 'Er flackert aus dem Bild und taucht bis 9 m weiter wieder auf. Jeder Treffer verwirrt dich 3 s: Steuerung verkehrt. Sprudelwasser hilft.' },
    { at: 4, kind: 'schwaeche', name: 'Magen', text: 'Betäubung oder Kopfbruch spucken den Pilz wieder aus. Ist alles Futter weg, wird er hungrig und aggressiv.' },
  ],
}
```
`CONDITIONS`: `verwirrt` (Glitch-Verwirrung), `itemlock` (Item-Sperre), und Brocken-Zustand `{ id: 'm_fed', name: 'Gefüttert', who: 'brocken', text: 'Mampfaffe: 40 s Futter-Buff (Fellfarbe verrät welcher). Betäubung oder Kopfbruch beendet ihn.' }`.

### 3.8 Drops

Materialien: `mampfaffe_fell` ("Fell, das nach Mittagessen riecht", value 70), `mampfaffe_knoechel` (value 75), `mampfaffe_backe` (Backentasche, value 80), `mampfaffe_magenstein` (selten, 280).

```js
mampfaffe: {
  carve: [{ id:'mampfaffe_fell', w:38 }, { id:'mampfaffe_knoechel', w:24 }, { id:'mampfaffe_backe', w:14 }, { id:'kokosnuss', w:4 }, { id:'feuerpilz', w:4 }, { id:'giftkraut', w:4 }, { id:'glitchpilz', w:8 }, { id:'mampfaffe_magenstein', w:4 }], // Mageninhalt
  tail: [], 
  breaks: { head: [{ id:'mampfaffe_backe', n:1, chance:1 }], pranke: [{ id:'mampfaffe_knoechel', n:1, chance:1 }] },
  reward: [{ id:'mampfaffe_fell', n:[1,2], chance:1 }, { id:'mampfaffe_knoechel', n:1, chance:0.5 }, { id:'glitchpilz', n:1, chance:0.4 }, { id:'mampfaffe_magenstein', n:1, chance:0.12 }],
}
```

### 3.9 Rüstung / Waffe
Set `mampfaffe` (Prot **46**, Macke `eisenmagen`, `max 3`: Gift-, Brand-, Verwirrungs- und Item-Sperren-Dauer −15 % je Stufe, `loadout`-`resist`-Pfad via `addStatus`-Wrapper: neue Typen in die Skalierung aufnehmen).

| Teil | Kosten |
|---|---|
| Mampfaffe-Backenschutz (head) | schrott 2100, mampfaffe_fell 3, mampfaffe_backe 1, giftkraut 2 |
| Mampfaffe-Pelzmantel (body) | schrott 2400, mampfaffe_fell 5, mampfaffe_knoechel 2, mampfaffe_backe 1, feuerpilz 2 |
| Mampfaffe-Knöchelhosen (legs) | schrott 2100, mampfaffe_fell 3, mampfaffe_knoechel 3, kokosnuss 3 |

Zusatzmacke je Teil `dickschaedel: 1` (passt zum Rammen). `SET_TIER.mampfaffe = 7`. Waffenast `m`: stumpf (`bluntMul 1.4`).

### 3.10 Musik / Sound
`chew`, `burp`, `stinkHiss`, `glitchTp`; Cue-Farben: Kokos `#c8902c`, Feuer `#ff4a1a`, Gift `#a8c030`, Glitch `#39ff14`.

### 3.11 Budget
Ca. 900 Zeilen `mampfaffe.js` (Futter-KI 150, Buff-Angriffe 300, Modell 250), 150 Infrastruktur (Futter-Daten, `foodEaten`-Sync, `hitStatus`, Wolken), 200 Daten/Texte, 150 Tests. Aufwand L. Risiko: Futter-KI im Koop (nur Host entscheidet, `snapExtra`), Teleport-Hurtboxes (Hurtboxen folgen dem Node, sofort versetzt).

### 3.12 Build-Checkliste
1. Futter: `items.js`, `gather.js`, `smaragdkuesteProps.js` (3 Builder), `smaragdkueste.test.js`, `gather.test.js`
2. `src/game/monsters/mampfaffe.js` (+ Modell; `index.js`)
3. `monster.js`: `def.onHitPlayer`, `hit.steal`-Durchreichen, `def.hitStatus` (falls nicht schon bei Blendax)
4. `mprojectiles.js`: `kokosDef` + `kind:'kokos'` (Farbe, Mesh)
5. `game/monsters/statusfx.js`: Buff-Puffs; `game/statusFx.js`: optional Funkenfarben je Buff
6. `src/net/sync.js`: `foodEaten` -> `MSG.GATHER`; `foodStolen`-Event
7. `smaragdkueste.js`/`Layout.js`: `NEST_ZONE.mampfaffe`, `ROUTE_ZONES`, `monsterSpawns.mampfaffe`
8. `render/fx.js` `monGlitch` (falls nicht schon da), `ui.css`
9. Daten: `drops.js`, `compendium.js` (+ `CONDITIONS`, `ELEM_NOTES`), `quests.js`, `armor.js` (+ `SKILLS.eisenmagen`, `loadout.js`), `gearlook.js`, `gear/armor.js`
10. `audio/sfx.js`, Tests (`mampfaffe.test.js`: Futter-KI mit Mock-Welt, Klau nur Whitelist)

---------------------------------------------------------------------------------------------------

## 4. KRACHFAUST (Brachydios)

### 4.1 Rolle / Zone
Apex, haust im Tempel (Zone 4, Default-Nest `(65,-65)`, Default-Spawn `(80,-80)`; `NEST_ZONE` bleibt unberührt). **Greift alles an, was den Tempel betritt, auch andere Brocken** (Revier-System). Dramaturgie: Telegraph, Bildschirmwackeln, Licht, Sound; **kein Zerstörungs-Engineering**.

### 4.2 Modell
`buildKrachfaust({ scale: 2.7 })` = Mampfaffe-Rig (Abschnitt 3.2) größer, anderes Fell/Haut: dunkle Steinhaut mit Rissen (Textur `krachfaust_hide`), **Fäuste und Kopf** mit Schleimhülle: je ein zweites, etwas größeres Box-Mesh (`slimeMat = basic({color:'#39ff14', fog:false})`, `opacity 0.75`, `transparent`), das mit dem Puls (4.3) leuchtet. Rücken-Runen (`basic`, Neongrün) leuchten in der Wutphase auf. Knoten wie Mampfaffe (`armL/armR` via `legL/legR`-Pose, `wing` = Brust/Arme).

### 4.3 Werte

```
id 'krachfaust', name 'Krachfaust, der Tempelbrecher', hp 20000, scale 2.7, bodyRadius 2.3, predator true,
walk 3.3, run 8.2, turn 0.95, detect 36, prefer 5.5, stamina true, flinchDmg 1200, teachAttack 'krachfaust_schleimfaust',
recoverAfter: (m) => (0.1 + m.rng() * 0.25) / m.speedMul
```
Angriffe `tempo 1.0` (Wut 1.15), Treffer 28-60 (Voltaro 28-44).

**Glitch-Schleim-System** (geteilt von allen Schleim-Angriffen), `m.extra.slimes = [{ id, x, z, t0, fuse, r }]`, gefüllt durch `all`-Events (`calls.slime(m, ctx, inst, age)`), also deterministisch bei allen Clients (Muster `gorgo.js` `spuckCall` + `m.extra.pools`):
- **Boden-Schleim**: Pfütze r 1,6 (Visual: flache Kreisscheibe + 4 Klötze, `basic` Neongrün). Fuse 2,2 s (Wut 1,5 s). Läuft ein Pirscher in r 1,3 hinein (lokal geprüft): Pfütze wird absorbiert, er bekommt `schleim` (statt Explosion am Boden). Sonst Explosion bei Fuse-Ende: Kugel r 3,4, **28 Schaden**, `flinch` (lokaler Hit-Test + `fx.slimeBurst`, `shake 0.25`).
- **Schleim am Pirscher**: `schleim`-Status (1.3): Zündschnur 2,0 s (Wut 1,4), **eine Rolle entfernt ihn**; Explosion wie oben am Pirscher (trifft Mitstehende im Radius).
- **Puls-Telegraph (Farbe, Hz, Ton)**: Rest > 1,0 s: `#1f9d0f` bei 2 Hz, `slimePulse` pitch 1.0; 1,0-0,4 s: `#39ff14` bei 5 Hz, pitch 1.3; < 0,4 s: `#d8ffd0` bei 12 Hz, pitch 1.7. Pirscher-Schleim: derselbe Puls auf einem kleinen Klötzchen-Cluster am Mesh (kein Emissive-Eingriff, damit `glitchVisual` ungestört bleibt).

### 4.4 Moveset

| Angriff | Reichweite | Telegraph | Dauer | Treffer | Schleim |
|---|---|---|---|---|---|
| `krachfaust_schleimfaust` (Teach) | 0-6 | 0,65 | 2,0 | Rechte Faust t 0,8: 40 down | Treffer -> `schleim` auf Pirscher; Fehlschlag -> Boden-Schleim an Faustpunkt |
| `krachfaust_trommel` | 0-6,5 | 0,7 | 3,0 | 4 Schläge L/R/L/R t 0,85/1,2/1,55/1,9, je 30 flinch | je Schlag Boden-Schleim an Faustpunkt (versetzt), letzter Schlag Schleim auf Pirscher |
| `krachfaust_kopfstoss` | 3-11 | 0,7 | 2,2 | Anlauf 6 m, Kopf 46 down | 3 kleine Boden-Schleime (r 1,2) entlang der Strecke |
| `krachfaust_sprungstampfer` | 4-16 | 0,8 | 2,5 | Landung r 5,5: 52 down | Ring aus 5 Boden-Schleimen r 6 um die Landestelle; Marker am Landepunkt (wie `jaggo_huepfer`) |
| `krachfaust_salve` | 8-26 | 0,8 | 2,4 | 3 Schleimbälle (`mprojectiles.js` `slimeDef`, `kind:'slime'`, Impact, `splash 1.4`, `dmg 20`) | Aufschlag erzeugt Boden-Schleim; Streuung wie `gorgo_spucke` |
| `krachfaust_runenwut` (Phase-Special bei 40 %) | 0-99 | 1,0 | 2,6 | Brüll-Kugel r 9, dmg 0, `knock:'pin'` (Konter möglich) | löst die Wutphase aus, `calls.enrage`: Runen glühen |
| `krachfaust_urknall` (Phase 12 %) | 0-99 | siehe 4.6 | 8,5 | siehe 4.6 | Finale |

Ketten: `schleimfaust -> {trommel 4, kopfstoss 3, sprungstampfer 2, null 2}`, `trommel -> {schleimfaust 3, salve 2, null 2}`, `kopfstoss -> {schleimfaust 3, sprungstampfer 2}`, `sprungstampfer -> {schleimfaust 4, null 2}`, `salve -> {kopfstoss 3, trommel 3}`.
Wut (HP < 40 %): Fuse -0,7 s, `tempo 1.15`, **jeder** Faustschlag macht zusätzlich eine kleine Druckwelle (Kugel r 3, 14 Schaden) beim Aufprall, Runen glühen.

### 4.5 Teile / Schwächen / Brüche

| id | label | factor | breakHp | elem (fire/shock) |
|---|---|---|---|---|
| `kopf` | Kopf | 1,0 | 1300 | 12/20 (`blunt`, `stunPart`) |
| `prankeL` / `prankeR` | Schleimfäuste | 0,8 | 900 | 10/**30** |
| `koerper` | Körper | 0,6 | - | 10/15 |
| `beine` | Beine | 0,8 | - | 10/20 |

Schwäche: **Schock** (Schleim leitet), Feuer **schlecht** (er ist sprengfest: `fire` Werte niedrig). Faustbruch: Schlag auf der Seite macht keinen Pirscher-Schleim mehr (nur Boden). `ELEM_NOTES.krachfaust`: "Schock fährt durch den Schleim und zündet ihn zu früh: Pfützen im Umkreis platzen sofort (harmlos).". Umsetzung: Schock-Treffer auf Faust: `m.extra.slimes` des Brockens in 4 m detonieren (ohne Schaden am Pirscher, wenn nicht im Radius), Spaß-Konter statt Bug.
Kopfbruch zusätzlich: Spielt Betäubungsfenster 3 s. Kein Schwanz-Severing.

### 4.6 Finale: Urknall (HP <= 12 %, einmalig, Rotglut zweimal bei 12 % und 5 %)

`phases: [{ at: 0.4, name: 'Runenwut', special: 'krachfaust_runenwut' }, { at: 0.12, name: 'Zerfall', special: 'krachfaust_urknall' }]` (Phasen laufen über `at` = Rest-HP-Anteil wie Jaggo `at: 0.5`).

| t (s) | Ereignis | Telegraph |
|---|---|---|
| 0-1,5 | springt zur Daismitte `TEMPLE_C (65,-65)`, schlägt beide Fäuste auf den Boden | Marker r 52 (die ganze Plattform: Kante zu Ecke ≤ 50 m) rot-grün pulsierend, Banner `hud.center('Hinter die Säulen!', 4)` |
| 1,5-6,5 | **Aufladen**, 5 s: Runenring (`runeRing` Glow) und Rückenrunen steigern Helligkeit; Boden-Schleime im Radius poppen alle 1 s kleine Funken; `sfx charge` mit steigender Tonhöhe; `fx.shake` Amplitude 0,1 -> 0,5; `world.pulse(k)` Licht pulst mit dem Takt (Ambient x (1 + 0,45 sin)), **Takt beschleunigt**: 1 Hz -> 4 Hz | `slimePulse`-Farben wie 4.3 auf den Fäusten; letzte 1,0 s `#d8ffd0`, Bildschirmrand `fx.flash('rgba(57,255,20,.12)')` im Takt |
| 6,5-7,1 | **Detonation**: Treffer-Kugel r 52 am Brocken (Mitte), `dmgPct 0.7` (70 % Max-LP, 0.4), `knock:'down'`, `occlude: true`, t0 6,5 / t1 7,1 (0,6 s: Rollen-I-Frames reichen nicht durch) | `sfx boom`, `fx.whiteout(0.5)` (nur Wirkung, bei Gedeckten kurzer Flash), `shake 1.0 / 0.6 s` |
| 7,1-8,5 | Brocken **erschöpft** 6 s (`m.recover = 6`, Atemwolken), voll angreifbar: Fenster zum Finishen | Säulen, die abgeschirmt haben, sind gebrochen |

Rotglut: zweiter Urknall bei 5 %, Aufladen 3,5 s.

**Deckung hinter Säulen (einfach)**: Die Smaragd-Welt exportiert `world.temple = { pillars: [{ id, x, z, r: 1.15, h, broken: false, mesh }] , c: TEMPLE_C }` (Befüllung in `smaragdkueste.js` Z.256-267: bei jeder `templePillar(rng, h, 0.9)` mit `h >= 6` Eintrag anlegen; **statt `add('lit', …)` Mesh einzeln halten** (nur diese ~6-7 hohen Säulen, damit `mesh.visible = false` beim Brechen geht)). Funktion:

```js
world.coverBetween(a, b) {            // a = Brocken, b = Pirscher, beide {x,z}
  for (const p of world.temple.pillars) {
    if (p.broken) continue;
    // Abstand Säulenmitte -> Strecke a-b (2D), Säule liegt zwischen den beiden
    if (distSqPointSegment({x:p.x,y:0,z:p.z}, {x:a.x,y:0,z:a.z}, {x:b.x,y:0,z:b.z}) <= (p.r + 0.4) ** 2) return p;
  }
  return null;
}
```
(`distSqPointSegment` ist in `hitbox.js` exportiert.) In `_attackHits` bei `hit.occlude`: `const cov = world.coverBetween(this.pos, p.pos); if (cov) { markPillarForBreak(cov); skip; }`. Nach Detonation (t1): `breakPillar(p)` = `p.broken = true; mesh.visible = false; fx.spark(...); shake` + Schutt-Block bleibt (der Collider `r 1,15` existiert schon und bleibt als Trümmer). **Eine Säule schützt alle, die dahinter stehen**, aber nur einmal. Tempel-Layout: 12 Säulen am Ring r 29, jede dritte kurz (`i % 3 == 0`, h 2-4), 1-2 am Tor weggelassen => **mindestens 6 hohe Säulen**. Für 4 Pirscher reicht das; wenn Playtest zu knapp: zusätzlich 2 Säulen auf Ring r 14 setzen (Layout-Zeilen, kein Engineering).
Hinweis Gäste: Hit-Test läuft client-seitig pro lokalem Pirscher => `coverBetween` bei jedem Client mit identischem `world.temple` (deterministisch, Säulen-Bruch-Event per `all`-Call an der Detonationszeit, kein Netz-Sonderfall).

**Wutphase-Visuals**: `world.setRuneGlow(hex, k)`: tauscht Farbe/Helligkeit des `add('glow')`-Materials (Runenring + 6 Slabs `runeSlab().glow`, Z.252/272) von Türkis `#58ffd0` auf `#39ff14` und pulsiert mit k. (Prüfen: ist `glow` ein gemeinsames Material? Sonst Referenzen sammeln; Hint: `add('glow', ...)` merged nach Material-Gruppe.) `world.pulse(k)` skaliert `ENV[3].ambI`/`sunI` im Per-Frame-Blend (`smaragdkueste.js` Z.416-460).

### 4.7 Revier-System: greift andere Brocken an
`game/revier.js` ist für 2 Boss-Brocken (`quest.multi: 'revier'`). Erweiterung "Apex-Modus" (ca. 30 Zeilen):
- `hunt.js` (um Z.205-215): bei `quest.monster === 'krachfaust'` (oder `def.apex`) `this.revier = new Revier(this, [krachfaust], { apex: true })`.
- `Revier.rivalOf(m)`: im Apex-Modus für den Apex-Brocken: **nächster anderer lebender Brocken** innerhalb `onTemple(x,z)` (aus `smaragdkuesteLayout.js`, exportiert; oder Distanz < 40 m zu `TEMPLE_C`), auch `minor` (Fauna). Für andere Brocken: `rivalOf` liefert den Apex, wenn sie im Tempel stehen (sie wehren sich nicht aktiv, das reicht: Zielwahl `monster.js:593` greift).
- `Revier.resolve(att, inst, hits)`: statt einem `vic` über Kandidatenliste iterieren; `room` (FLOOR 60 %) gilt nur für Nicht-`minor`; Kleinvieh darf sterben. `ally()` wird im Apex-Modus nie ausgelöst (`phase` bleibt `'clash'`; `noteDamage` ignoriert).
- Damit ein Rivale überhaupt in den Tempel kommt: Mampfaffe streift durch alle Zonen (Route 4 = Tempel) und läuft Krachfaust ins Revier. **Stretch (optional, ~60 Zeilen):** Krachfaust-Auftrag setzt nach 90 s einen Mampfaffe-Eindringling (`hpMul 0.4`, nicht auftragsrelevant) am Pass 3-4 aus (Muster `#spawnAmbient`/`#spawnMulti`), damit Spieler den Revierkampf sehen. Der Eindringling zählt nicht für den Sieg.
- Teststrategie: `revierstreit.test.js` als Muster; neu `apex.test.js`.

### 4.8 Rotglut-Haken
Dauerwut = Wutphase von Anfang an (Runen glühen, Fuse kurz), Finale zweimal (12 % / 5 %), Beute x2.

### 4.9 Kompendium

```js
{
  id: 'krachfaust', name: 'Krachfaust', where: 'Smaragdküste · Verfluchter Tempel', title: 'Tempelbrecher',
  intro: 'Der Herr des Tempels. Seine Fäuste und sein Schädel sind mit grünem Pixelschleim überzogen, der pulsiert, bevor er platzt. Alles, was den Tempel betritt, bekommt Prügel, auch die anderen Brocken.',
  entries: [
    { at: 1, kind: 'angriff', name: 'Schleimfaust', text: 'Ein Hieb mit der Rechten. Trifft er, klebt der Schleim an dir; verfehlt er, bleibt er als Pfütze liegen. Beides platzt nach 2 s.' },
    { at: 1, kind: 'verhalten', name: 'Schleim abrollen', text: 'Dunkelgrün pulsiert langsam, hellgrün schneller, weißgrün ist gleich vorbei. Eine Rolle schüttelt den Schleim vom Körper. Pfützen darf man umgehen.' },
    { at: 2, kind: 'angriff', name: 'Trommelwirbel', text: 'Vier Schläge im Wechsel, jeder hinterlässt Schleim. Zwischen den Pfützen laufen, nicht stehen bleiben.' },
    { at: 2, kind: 'angriff', name: 'Sprungstampfer & Kopfstoß', text: 'Er springt auf dich zu oder rammt mit dem Schädel, dahinter Schleimkleckse. Der Stampfer legt einen Ring.' },
    { at: 3, kind: 'angriff', name: 'Schleimsalve', text: 'Drei Schleimbälle aus der Ferne: Weglaufen löst das Problem nicht, nur Rollen.' },
    { at: 3, kind: 'verhalten', name: 'Revier', text: 'Im Tempel greift er jeden an. Wer sich mit ihm anlegen will, soll andere Brocken einlassen.' },
    { at: 4, kind: 'verhalten', name: 'Runenwut', text: 'Unter 40 % Leben glühen die Tempelrunen grün, der Schleim zündet schneller, jeder Schlag macht eine kleine Druckwelle.' },
    { at: 4, kind: 'angriff', name: 'Urknall', text: 'Am Ende lädt er 5 s auf. Der Boden pulsiert, das Licht flackert. Dann geht die ganze Plattform hoch. Hinter eine hohe Säule, sie bricht danach.' },
    { at: 5, kind: 'schwaeche', name: 'Schock', text: 'Schock fährt durch den Schleim, Pfützen platzen früh und harmlos. Fäuste und Kopf sind die Brechstellen.' },
  ],
}
```
`CONDITIONS`: `{ id: 'schleim', name: 'Glitch-Schleim', who: 'du', text: 'Krachfausts Schleim: pulsiert 2 s, dann Explosion (28 Schaden, trifft auch Mit-Pirscher). Eine Rolle schüttelt ihn ab, Sprudelwasser auch.' }`.

### 4.10 Drops
Materialien: `krachfaust_schleim` ("Pulsiert immer noch. Bitte nicht schütteln.", Icon `ember`, `#39ff14`, value 85), `krachfaust_kruste` (value 80), `krachfaust_faustplatte` (value 100), `krachfaust_runenherz` (selten, 350, Icon `gem`).

```js
krachfaust: {
  carve: [{ id:'krachfaust_kruste', w:36 }, { id:'krachfaust_schleim', w:30 }, { id:'krachfaust_faustplatte', w:14 }, { id:'tempelstein', w:14 }, { id:'krachfaust_runenherz', w:6 }],
  tail: [],
  breaks: { pranke: [{ id:'krachfaust_faustplatte', n:1, chance:1 }], head: [{ id:'krachfaust_kruste', n:[1,2], chance:1 }] },
  reward: [{ id:'krachfaust_kruste', n:[1,2], chance:1 }, { id:'krachfaust_schleim', n:1, chance:0.6 }, { id:'tempelstein', n:1, chance:0.4 }, { id:'krachfaust_runenherz', n:1, chance:0.15 }],
}
```

### 4.11 Rüstung / Waffe
Set `krachfaust` (Prot **50**, Macke `schleimhaut`, `max 3`: Zündschnur +0,4 s je Stufe (Rollen reicht dann sicher) und Explosionsschaden −15 % je Stufe; Zahlen `loadout.skillEffects.schleimFuse/schleimDmg`, vom `schleim`-Status gelesen). Zweite Macke `erdung` (aus dem Voltaro-Set, Schock-Resistenz) **nicht**; stattdessen `zaehe_socke: 1` je Teil.

| Teil | Kosten |
|---|---|
| Krachfaust-Schleimhelm (head) | schrott 2600, krachfaust_kruste 3, krachfaust_faustplatte 1, tempelstein 2 |
| Krachfaust-Tempelpanzer (body) | schrott 3000, krachfaust_kruste 5, krachfaust_schleim 2, krachfaust_faustplatte 1, tempelstein 2 |
| Krachfaust-Trümmerstiefel (legs) | schrott 2600, krachfaust_kruste 3, krachfaust_schleim 2, tempelstein 1 |

`SET_TIER.krachfaust = 7`. Waffenast `x`: Feuer 34 + `partDmgMul 1.2` (Krachfaust-Kruste als Bruchmaterial). `krachfaust_runenherz` nur für das Stufe-6-`x`-Upgrade (je 1).

### 4.12 Musik / Sound
`slimePulse` (Tick, pitch), `slimeSplat`, `charge`, `boom`; Tempel-Ambient: im Aufladen `sfx.stopAmbient` leiser stellen (Welt: `sfx.stopAmbient?.()` wird bereits in `dispose` genutzt). Cue-Farbe der Schleimangriffe `#39ff14`.

### 4.13 Budget
Ca. 950 Zeilen `krachfaust.js` (Modell 250, Schleim-System 200, Angriffe 350, Finale 150), Welt 120 (`temple.pillars`, `coverBetween`, Runenglow, Pulse), Revier 60, Daten 200, Tests 200. Aufwand L. Risiko: Finale im Koop (Hit-Test lokal, deterministisch), Performance (Schleim-Liste auf max. 24 Einträge begrenzen).

### 4.14 Build-Checkliste
1. `src/game/world/smaragdkueste.js`: `world.temple.pillars` (Z.256-267), `coverBetween`, `breakPillar`, `setRuneGlow`, `pulse`
2. `src/game/monsters/monster.js`: `hit.occlude`
3. `src/game/monsters/mprojectiles.js`: `slimeDef`/`kind:'slime'`
4. `src/game/monsters/krachfaust.js` (+ `index.js`)
5. `src/game/revier.js` + `src/game/hunt.js`: Apex-Modus (opt. Eindringling)
6. `src/game/player.js`: `schleim`-Details (Tick, Explosion, Rollen, Klötzchen-Cluster)
7. `src/game/effects.js`: `schleimblast`
8. `src/render/fx.js`: `slimeBurst`, Hilfen für `world.pulse`
9. Daten: `drops.js`, `items.js`, `compendium.js` (+ `CONDITIONS`), `quests.js`, `armor.js` (+ `SKILLS.schleimhaut`, `loadout.js`), `gearlook.js`, `gear/armor.js`
10. `audio/sfx.js`
11. Tests: `krachfaust.test.js`, `apex.test.js`, `smaragdkueste.test.js` (`pillars >= 6`, `coverBetween`)

---------------------------------------------------------------------------------------------------

## 5. Build-Reihenfolge

1. **Blendax**: Infrastruktur für Status (`player.js` Basis), `faceCheck`/`hitStatus`, `retune`, Overlay-FX, Nest/Spawn/Route; Quests `blendax` (+ RANKS-Eintrag JR 8) laut 0.2. Spielbar am Ende: Quest `blendax`.
2. **Mampfaffe**: Futter (Items/Gather/Props), `onHitPlayer`, Sync `foodEaten`, Wolken (`itemlock`), `verwirrt`. Spielbar: `mampfaffe`.
3. **Krachfaust**: Schleim, Revier-Apex, Tempel-Export (`pillars`), Finale. Spielbar: `krachfaust` (benötigt Clears aus 1+2).
4. Optional zuletzt: Waffenäste `b/m/x` (1.7), Feldstudie, Eindringling.

## 6. Offene Fragen an den User

1. (Entschieden und umgesetzt: jr 7, 700.)
2. (Entschieden, siehe 0.2: Rangkette, kein needClears.)
3. (Entschieden, 0.3: Stufe 6, Ast `x` Sprengung.)
4. (Entschieden, 0.4: 70 % Max-LP.)
5. (Entschieden, 0.5: Spawn Zone 2, Patrouille Zone 1+2.)
