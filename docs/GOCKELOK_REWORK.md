# Gockelok und das Auge des Glitch – detaillierter Rework-Plan

Stand: 17. Oktober 2026  
Projekt: [Joni9993/scuffed-mmh](https://github.com/Joni9993/scuffed-mmh)  
Status: Funktionale Umsetzung am 18. Oktober 2026; Spielzeit-, Geräte- und menschliche Qualitätsabnahme offen. Details im Umsetzungsnachweis unten.

Dieses Dokument hält die im Gespräch vereinbarte Richtung fest. Es ist die Grundlage
für die Umsetzung und spätere Abnahme. Die unten genannten Angriffsnamen, einzelnen
Angriffsausführungen und vorläufigen Zahlen konkretisieren diese Richtung als
Arbeitsentwurf. Sie sind keine bereits gemessenen oder separat freigegebenen Endwerte.

## 1. Auftrag und Ausgangslage

Der geheime vierte Endboss auf Glitchgrat muss nach den drei deutlich verstärkten
Drachen einen echten Höhepunkt bilden. Der bisherige Gockelok wurde vom Owner als
zu leicht, langweilig, hässlich, unspektakulär und repetitiv beschrieben.

Gefordert ist eine vollständige Überarbeitung von Erscheinung, Animation,
Angriffen, Kampfstruktur und Inszenierung. Die Schwierigkeit soll aus Beherrschung
des Kampfes entstehen. Höhere Lebenspunkte oder Schadenswerte allein erfüllen
den Auftrag nicht.

Die drei Drachen liefern den Qualitätsmaßstab und haben bereits eigene Rollen:

| Gegner | Eigene Kampfidee |
|---|---|
| Pyrostur | Aggressiver Jäger mit Verfolgung, Glutboden und Druckmechanik |
| Felsengroll | Revierfestung mit Panzer, Säulen und Crash-Konter |
| Voltiris | Beweglicher Duellant mit Blink, Nachbildern und Ladung |
| Gockelok | Körperlich gefährlicher Vogelräuber, dessen Korruption durch Realitätsnähte angreifbar wird |
| Wahre Form | Der Glitch selbst zerlegt Körper, Bewegungen und Kampfraum |

Gockelok braucht eine eigene Identität und Gegenmechanik. Ein Zusammensetzen der
besten Drachenangriffe genügt nicht.

## 2. Verbindliche Entscheidungen aus dem Gespräch

1. Der Hahn bleibt klar erkennbar. Sein Design geht deutlich in Richtung eines
   realistischen, gefährlichen Vogelmonsters.
2. Anatomie, Materialien, Bewegung, Gewicht, Trefferwirkung und Reaktionen auf
   Spieler müssen zusammen glaubwürdiger werden.
3. Körperliche Angriffe bilden das Fundament. Gockelok zeigt bereits Korruption
   und besitzt echte Glitch-Fähigkeiten.
4. Die Hahnform hat drei unterschiedlich spielbare Kampfphasen.
5. Auf den vermeintlichen Sieg folgt eine zweite Form: Die Jäger dringen in das
   Auge des Glitch vor und begegnen dem eigentlichen Glitch-/Bug-Monster.
6. Die wahre Form ist eine körperliche Monstrosität mit erkennbaren Resten des
   Hahns. Sie darf grotesker und räumlich unmöglicher werden.
7. Die Enthüllung erhält eine kurze inszenierte Sequenz; Wiederholungen sollen
   überspringbar sein.
8. Ziel sind insgesamt 8–12 Minuten pro erfolgreicher Solojagd.
9. Besonders starke, klar angekündigte Angriffe dürfen ungefähr 75 % des
   Lebenspunktevorrats kosten. Daraus folgt keine allgemeine Freigabe für
   unangekündigte oder unvermeidbare One-Shots.
10. Der Kampf muss solo mit jeder passend ausgerüsteten Endgame-Waffenart
    schaffbar sein. Vorhandene Koop-Skalierung bleibt die Grundlage; balanciert
    wird zunächst für solo.
11. Nach einem K. o. bleiben die Jäger innerhalb derselben laufenden Jagd in der
    zweiten Form. Eine gescheiterte, abgebrochene oder neu gestartete Jagd beginnt
    wieder beim Hahn.
12. Der Hahn bekommt einen eigenen Status und einen besonderen spielerischen Kniff.
13. Die wahre Form soll kurz, intensiv, abwechslungsreich und voller verrückter
    Glitch-Fähigkeiten sein. Erfolgreiches Spiel muss sich deutlich belohnend anfühlen.

## 3. Gesamtdramaturgie

| Abschnitt | Vorläufiger Zeitanteil | Aufgabe |
|---|---|---|
| Hahn: Phase 1 | Teil der insgesamt 6–8 Minuten Hahnform | Anatomie, Fußarbeit und Angriffswinkel kennenlernen |
| Hahn: Phase 2 | Teil der Hahnform | Boden-/Luftkombinationen und Korruption beherrschen |
| Hahn: Phase 3 | Teil der Hahnform | Verletzungen und starke Glitch-Ausbrüche lesen |
| Vermeintlicher Sieg und Enthüllung | Kurze Übergangssequenz | Ursprung des Hahns offenlegen |
| Auge des Glitch / wahre Form | Etwa 2–4 Minuten | Gelerntes unter hoher Intensität verbinden |

Die Gesamtjagddauer hat Vorrang vor einzelnen Zeitbudgets. Die zweite Form darf
nach einem langen ersten Kampf nicht wie eine weitere vollständige Ausdauerjagd
wirken. Gesundheitsvorräte und Öffnungen werden entsprechend gemeinsam abgestimmt.

## 4. Neues Erscheinungsbild des Ur-Hahns

### 4.1 Silhouette und Anatomie

- Kräftiger, vorgelagerter Brustkorb und tragfähiges Becken.
- Muskulöse Oberschenkel, sehnige Läufe und deutlich gegliederte Füße.
- Greifende Zehen mit Krallen und langen, gefährlich ausgerichteten Spornen.
- Beweglicher S-Hals mit eigenständiger Kopfbewegung.
- Harter, funktionaler Schnabel und fokussierter Raubvogelblick.
- Klar erkennbare Kamm- und Kehllappenformen; weniger Spielzeugwirkung.
- Geschichtetes Gefieder an Hals, Brust, Rücken und Flügeln.
- Langes, gebogenes Schwanzgefieder als Gegengewicht und Silhouettenmerkmal.

Der absichtlich kantige PS1-/Glitch-Stil bleibt erhalten. Glaubwürdigkeit entsteht
durch Proportionen, Oberflächen, Posen und Bewegung. Eine sterile Hochglanzoptik
ist kein Ziel.

### 4.2 Animation und körperliche Präsenz

- Schritte werden von tatsächlicher Bewegung angetrieben.
- Füße greifen beim Antritt und tragen den Körper in Stand- und Belastungsposen.
- Bremsen zeigt Gewichtsverlagerung, Scharren und nachschwingendes Gefieder.
- Sprünge haben erkennbare Vorbereitung, Absprung, Flug und belastete Landung.
- Hals und Kopf verfolgen das Ziel unabhängig vom Torso in begrenzten Winkeln.
- Flügel stabilisieren Drehungen und Sprünge.
- Schnabel und erreichbare Kopftrefferzonen folgen den Pickbewegungen.
- Kamm, Kehllappen und Schwanzfedern reagieren auf Bewegung und Erschütterung.
- Erholung und Taumeln besitzen eigene, eindeutig lesbare Posen.

### 4.3 Sichtbare Verletzungen und Korruption

Teilbrüche bleiben am Modell sichtbar. Gefieder reißt auf, Sporne brechen ab,
Flügel hängen asymmetrisch und der beschädigte Kamm verändert seine Form.

Korruption beginnt subtil: Ein Schatten läuft kurz falsch, einzelne Federn bleiben
stehen, eine Körperkontur versetzt sich. Später öffnen sich unter dem Gefieder
sichtbare Nähte. Im letzten Abschnitt bewegt sich etwas im Körper, das seiner
Anatomie nicht mehr folgt.

Glitch-Effekte vermitteln Zustand und Angriff. Sie müssen den Körper, seine Posen
und die Gefahrenflächen weiterhin erkennbar lassen.

## 5. Die drei Phasen der Hahnform

### Phase 1 – „Der Gipfel gehört ihm“

Gockelok ist ein körperlicher Vogelräuber. Er umkreist den Jäger, richtet den Kopf
aus und greift aus deutlichen Belastungsposen explosiv an.

Schwerpunkte:

- Seitliche Fußarbeit und gerichtete Angriffe.
- Schnabelstöße, Scharrhiebe, Flügelfeger und Sporntritte.
- Erkennbare, begrenzte Nachschläge.
- Erste Realitätsnähte bei ausgewählten starken Angriffen.
- Subtile Korruption als Vorzeichen der späteren Enthüllung.

Der Spieler lernt, Angriffswinkel zu verlassen und nach dem Commit die offene
Seite zu nutzen.

### Phase 2 – „Die Blutkrone“

Aufgestelltes Gefieder und eine aggressivere Haltung verändern die Silhouette.
Gockelok verbindet Fußarbeit, Sprünge und Landungen zu verzweigten Kombinationen.

Schwerpunkte:

- Wechsel zwischen Bodenangriffen und kurzen Luftmanövern.
- Sprungtritte, Landefolgen und seitliche Flügelangriffe.
- Gezielte Abfangbewegungen gegen gleichförmiges Distanzspiel.
- Erste deutlich übernatürliche Attacken und Fehlkopie-Anwendung.
- Mehrere Kettenfamilien statt einer ständig wiederholten Optimalfolge.

Abstand wird zu einer bewussten Entscheidung. Frühzeitiges Weglaufen und
hektisches Rollen müssen andere Risiken erzeugen als kontrolliertes Ausweichen.

### Phase 3 – „Unter den Federn“

Der Körper ist sichtbar verletzt. Die Korruption hält ihn zusammen und bricht
immer stärker hervor. Verletzungen verändern seine Kampfweise tatsächlich.

Schwerpunkte:

- Asymmetrische Angriffsausführungen entsprechend den Teilbrüchen.
- Zeitversetzte Nachschläge und angekündigte Rissbewegungen.
- Starke Realitätsnaht-Angriffe mit lohnenden Konterfenstern.
- Sichtbar unterschiedliche Posen für echte Erschöpfung und vorbereitete Folgeangriffe.
- Dramatische Steigerung bis zum körperlichen Zusammenbruch.

Die Phase eskaliert durch neue Entscheidungen und Kombinationen. Kürzere Ansagen
und höhere Schadenswerte allein reichen nicht.

## 6. Angriffsbaukasten des Hahns

Die folgende Liste ist ein konkreter Arbeitsentwurf. Die endgültige Anzahl folgt
aus spielerisch unterschiedlichen Aufgaben, Animationsqualität und Spieltests.
Bruchvarianten zählen bei der Bewertung der Vielfalt nicht als völlig neue Angriffe.

| Angriff / Familie | Funktion und Ausführung | Antwort / Belohnung |
|---|---|---|
| Gerichteter Pickstoß | Schneller, klar ausgerichteter Schnabelangriff | Seitlich aus dem festgelegten Winkel treten |
| Pickfolge | Mehrere körperlich animierte Hiebe mit lesbarem Rhythmus | Rhythmus beherrschen und letzten Hieb bestrafen |
| Schnabelanker | Schwerer Stoß; der Schnabel bleibt kurz im Boden stecken | Große erreichbare Kopföffnung |
| Scharrhieb | Fuß kratzt über den Boden und räumt den vorderen Nahbereich | Zur offenen Flanke wechseln |
| Spornstich | Gerichteter Tritt mit klarer Beinvorbereitung | Seitlich statt pauschal nach hinten ausweichen |
| Sprungsporne | Jagdsprung mit beiden Spornen auf einen angekündigten Bereich | Landung umgehen und nachsetzen |
| Flügelfeger | Bodennaher, körperlicher Feger entlang einer sichtbaren Bahn | Seite und Zeitpunkt bewusst wählen |
| Flankenwechsel | Seitlicher Satz, danach ein eigenständig angesagter Angriff | Neu positionieren und Folgepose lesen |
| Jagdlauf | Schneller Antritt mit begrenztem Abfangen des Laufwegs | Richtung wechseln und Bremsöffnung nutzen |
| Korrumpierter Ruf | Sichtbarer Hals-/Kammaufbau, Glitch-Ausbruch | Gefahrenbereich verlassen oder Naht angreifen |
| Versetzter Schnabel | Nach dem körperlichen Hieb folgt eine angekündigte Glitch-Kopie | Den zweiten Zeitpunkt berücksichtigen |
| Risssprung | Kurzer Sprung durch einen Riss mit sichtbarem Austritt | Austrittsmarker und Landepose lesen |
| Nahtsignatur | Mächtiger Angriff trennt Körper und Schatten | Sicher ausspielen oder Naht offensiv zerreißen |

Das bisherige Eierbombardement wird als zentrale Fähigkeit ersetzt. Die neue
Hahnidentität entsteht vor allem aus Schnabel, Füßen, Spornen, Flügeln und den
sichtbaren Fehlern seiner körperlichen Existenz.

## 7. Eigener Status: „Fehlkopie“

### 7.1 Wirkung

Bestimmte korrumpierte Treffer markieren den Jäger für ungefähr acht Sekunden.
Während dieser Zeit entstehen höchstens zwei verzögerte Positionskopien.

Jede Kopie:

1. Speichert eine Position des betroffenen Jägers.
2. Bleibt als verzerrte Silhouette an dieser Position stehen.
3. Zeigt ihren festen Gefahrenbereich und zieht sich hörbar zusammen.
4. Zerreißt nach einer erkennbaren Vorwarnung den markierten Bereich.
5. Verschwindet vollständig und hinterlässt keine unbegrenzt wachsende Gefahr.

Die Position folgt nach dem sichtbaren Festlegen nicht weiter dem Spieler.
Konkrete Auslösezeiten, Radius, Schaden und Warnlänge sind noch abzustimmende
Implementierungswerte. Die Grenze von höchstens zwei Kopien verhindert eine
unübersichtliche Kaskade bei wiederholten Treffern.

### 7.2 Spielerentscheidung

Der Jäger muss Abdrücke so ablegen, dass seine nächsten Laufwege und
Angriffsfenster frei bleiben. Die Mechanik verbindet Bewegung und offensives
Timing. Im Koop ist zusätzlich die Lesbarkeit der Abdrücke anderer Jäger wichtig.
Die genaue Reichweite ihrer Wirkung auf Mitjäger wird bei der Umsetzung
ausdrücklich festgelegt und getestet.

### 7.3 Gegenmittel

- Der Status läuft von selbst aus.
- Ein erfolgreicher Glitch-Konter entfernt ihn vorzeitig.
- Die Aktivierung des eigenen Glitch-Modus bereinigt ihn ebenfalls.
- Bereinigung beendet auch noch ausstehende Kopien des Status; Marker und
  Silhouetten müssen dazu passend verschwinden.
- K. o., Ende der Jagd und Bossende räumen den Status und seine Gefahren sauber auf.

Der vorhandene Glitch-Modus erhält damit eine zusätzliche taktische Aufgabe.
Seine Verfügbarkeit ist keine Pflichtvoraussetzung, um den Status zu überleben.
Wiederholte Treffer dürfen keine unbegrenzte Verlängerung oder sofortige
Mehrfachdetonation erzeugen.

## 8. Eigener Kniff: „Realitätsnähte“

### 8.1 Sichtbares Angriffsfenster

Bei ausgewählten starken Glitch-Angriffen geraten Körper und Schatten auseinander.
Zwischen ihnen erscheinen gespannte Verbindungen an Brust, Hals oder Flügelansatz.
Diese Realitätsnähte sind echte, erreichbare Trefferzonen.

Zwei Antworten bleiben gültig:

- Den Angriff kontrolliert ausspielen und die anschließende Erholung nutzen.
- Während des angekündigten Fensters die Naht gezielt treffen und den Angriff
  dadurch vorzeitig zusammenbrechen lassen.

### 8.2 Belohnung

Eine zerrissene Naht erzeugt einen sichtbaren körperlichen Absturz, eine kurze
verwundbare Lage und eine deutliche akustische Rückmeldung. Der Konter muss auch
mit schweren Nahkampfwaffen und mit Fernkampf sinnvoll erreichbar sein.

Fenster, Schadensschwelle, Trefferpriorisierung und Schutz vor wiederholtem
Niederhalten werden anhand echter Waffenangriffe abgestimmt. Gewöhnlicher
Körperschaden darf nicht versehentlich als Nahttreffer zählen.

### 8.3 Teilbruch-Folgen

| Teil | Dauerhafte sichtbare Folge | Spielmechanische Folge |
|---|---|---|
| Kamm | Beschädigte, kollabierte Krone | Schwächerer korrumpierter Ruf und längeres Nahtfenster dabei |
| Sporne | Sichtbar abgebrochene Waffen an den Läufen | Veränderte Landungen; bestimmte gefährliche Nachtritte entfallen |
| Flügel | Zerrissenes Gefieder und asymmetrische Haltung | Instabilere Luftmanöver und andere Bodenfolgen |

Teilbrüche sind gezielte Vorteile. Sie sollen weder kosmetisch bleiben noch den
restlichen Kampf auf eine harmlose Wiederholung reduzieren.

## 9. Vermeintlicher Sieg und Enthüllung

1. Die dritte Hahnphase endet in einem glaubwürdigen Zusammenbruch.
2. Kamm und Korruptionslicht erlöschen; für einen kurzen Moment entsteht Ruhe.
3. Unter dem Körper öffnet sich das Auge des Glitch.
4. Die kurze Inszenierung vermittelt, dass der Hahn der Körper war, durch den
   der Fehler in die Welt gelangt ist.
5. Die Jäger dringen in das Auge vor.
6. Die wahre Gestalt offenbart sich und der Schlusskampf beginnt.

Die Sequenz soll beim ersten Übergang wirken und bei Wiederholung überspringbar
sein. Der Eintritt ins Auge soll nach dem kurzen inszenierten Moment steuerbar
werden. Im Koop müssen Eintritt, übersprungene Sequenz und Nachzügler zusammen
funktionieren; niemand darf den Übergang dauerhaft blockieren.

Vor Abschluss der wahren Form gibt es keinen tatsächlichen Jagdsieg, keine
vorzeitigen Abschlussbelohnungen und keinen gewöhnlichen Endboss-Zerlegezustand.
Während der Übergangsinszenierung entstehen keine unfairen Treffer.

## 10. Das Auge des Glitch

Die zweite Form braucht einen eigenen wahrnehmbaren Raum. Eine bloße Farbänderung
am bisherigen Plateau erfüllt die Idee des Vordringens ins Auge nicht.

Gestalterische Richtung:

- Ein zusammenhängender, ausreichend heller und lesbarer Kampfboden.
- Sichtbar aufgebrochene räumliche Ordnung, schwebende Fragmente und fehlerhafte
  Verbindungen zu Resten der Außenwelt.
- Die wahre Form steht im Mittelpunkt; ihre Anatomie und Angriffe bleiben erkennbar.
- Veränderungen der Arena werden sichtbar angekündigt.
- Die Kamera bleibt im aktiven Kampf steuerbar und für Nahkampf geeignet.
- Spektakel entsteht durch Bewegung, Raum und Inszenierung, ohne dauerhafte
  Vollbildblitze oder eine Wand aus Partikeln.

## 11. Die wahre Form

### 11.1 Erscheinung

Ein körperliches Glitch-/Bug-Monster mit Resten des Hahns: auseinandergerissene
Vogelanatomie, fehlerhaft verbundene Körpersegmente und ein freiliegender Ursprung.
Es soll als Wesen wahrnehmbar bleiben, obwohl seine Anatomie räumlich unmöglich ist.

### 11.2 Kernidee

Die Gestalt zerlegt Bewegungen und Raum in angekündigte Abschnitte. Zeitversetzte
Körperteile, rücklaufende Angriffe und versetzte Arenastreifen fordern das zuvor
gelernte Lesen von Winkel, Zeitpunkt und Position gemeinsam ein.

### 11.3 Signaturfähigkeiten

| Fähigkeit | Ausführung | Spieleraufgabe | Belohnung |
|---|---|---|---|
| Ausgelassene Frames | Körperteile verschwinden und schlagen an angekündigten Austritten zu | Austritt, Körperhaltung und Zeitpunkt lesen | Dem Angriff in die entstandene Lücke folgen |
| Rollback | Eine ausgeführte Bewegung läuft entlang ihrer sichtbaren Spur rückwärts zurück | Hin- und Rückweg berücksichtigen | Nach dem Rücklauf angreifen |
| Raumbruch | Markierte Arenastreifen werden gegeneinander verschoben | Früh einen verbundenen sicheren Bereich wählen | Gute Raumwahl erhält Nähe zum Boss |
| Fehlerkaskade | Unterschiedliche Attacken folgen in einer kurzen lesbaren Sequenz | Bewegung, Rollen und Angreifen verbinden | Abschlussöffnung für starken Gegenangriff |
| Absturz | Die stärkste Sequenz endet im Auseinanderbrechen der Gestalt | Gesamte Sequenz überstehen | Großes Schadensfenster am Ursprung |

Rollback ist hier ein Angriffsmuster des Monsters. Eine Rücksetzung von
Spielerfortschritt, Heilung oder bereits verursachtem Schaden wurde nicht vereinbart.

### 11.4 Intensität und Gegenmöglichkeiten

- Kurzer Schlusskampf mit klarer Steigerung.
- Regelmäßige erreichbare Nahkampffenster.
- Realitätsnähte bleiben als offensiver Zusatzkonter erhalten.
- Erfolgreiche Abwehr führt zu sichtbaren Zusammenbrüchen und starken Gegenangriffen.
- Große Öffnungen geben Gelegenheit, Waffenmechaniken und Glitch-Modus auszuspielen.
- Fehlkopie und Arenagefahren werden begrenzt kombiniert, damit Lösungen bestehen bleiben.
- Die letzte Sequenz bildet einen spielbaren Höhepunkt; der Sieg wird tatsächlich erkämpft.

## 12. Jagdfortschritt, K. o. und Neustart

| Ereignis | Verhalten |
|---|---|
| Hahnform beendet | Enthüllung und Übergang zur wahren Form |
| Einzelner Jäger geht in der zweiten Form K. o. | Laufende Jagd bleibt in der zweiten Form |
| Jäger kehrt nach diesem K. o. zurück | Rückkehr in den aktiven zweiten Kampfabschnitt |
| Jagd scheitert oder wird abgebrochen | Kein dauerhafter Zwischenstand für die nächste Jagd |
| Neue Jagd beginnt | Start bei der ersten Hahnphase |
| Wahre Form besiegt | Genau ein regulärer Abschluss mit den vorgesehenen Belohnungen |

Das Erreichen der zweiten Form ist ein Zustand der laufenden Jagd. Es wird nicht
als permanente Abkürzung im Spielstand gespeichert. Ein einzelner K. o. startet
weder die Enthüllung noch den Hahnkampf erneut und setzt den Boss nicht eigens zurück.

## 13. Schwierigkeit und Balance

- Zuerst Solo-Balance mit passender Endgame-Ausrüstung prüfen.
- Alle sieben Waffenarten müssen den Kampf sinnvoll bewältigen können.
- Vorhandene Skalierung nach Jägerzahl weiterverwenden.
- Gesamtziel: 8–12 Minuten bei einer erfolgreichen, geübten Jagd.
- Besonders starke Treffer: ungefähr 75 % des Lebenspunktevorrats als Zielwirkung.
- Reguläre Treffer werden nach Rolle, Häufigkeit und Kombination abgestimmt.
- Hoher Druck durch Raumwahl, Tempo und Ketten; echte Öffnungen nach Abschlüssen.
- Distanzspiel muss aktive Reaktionen verlangen und darf kein gefahrloses Dauerschießen sein.
- Dauerhaft am Körper zu kleben darf ebenfalls keine universelle sichere Strategie sein.
- Schaden, Lebenspunkte, Phasenschwellen und Angriffstakt erst nach vollständigen
  Kampfdurchläufen als endgültig behandeln.

Die 75-%-Vorgabe beschreibt die gewünschte Wirkung besonders starker Angriffe.
Ob diese über Rohschaden oder einen anderen bestehenden Schadenspfad erreicht
wird, ist eine Implementierungsentscheidung mit Prüfung von Schutz und Block.

## 14. Lesbarkeit und Fairness

Die vorhandene Qualitätslatte der Drachen gilt auch hier:

- Jede neue Gefahr hat eine unterscheidbare sichtbare und hörbare Ansage.
- Bestehende Mindestansagen von mindestens 0,5 Sekunden berücksichtigen;
  komplexe und große neue Gefahren brauchen entsprechend mehr Vorwarnung.
- Kein unsichtbares Nachführen nach dem sichtbaren Commit.
- Wiederholte und verzögerte Treffer erhalten eigene lesbare Hinweise.
- Bodenmarkierungen werden aus den tatsächlichen Trefferformen abgeleitet.
- Erholung nach Ketten und Signaturen ist sichtbar und praktisch nutzbar.
- Keine garantierten Folgetreffer nach dem Aufstehen.
- Zusammengesetzte Trefferformen dürfen einen Einschlag nicht versehentlich
  mehrfach abrechnen.
- Reaktionen lesen Positionen und beobachtetes Verhalten statt zukünftiger Eingaben.
- Glitch-Ausdruck bleibt mit präziser Steuerung und verlässlichen Trefferregeln vereinbar.

## 15. Technische Umsetzung im vorhandenen Projekt

### 15.1 Orientierung im Bestand

| Datei / Bereich | Bedeutung für den Rework |
|---|---|
| `src/game/monsters/gockelok.js` | Bisherige Bossdefinition, Angriffe, Phasen und Teilbrüche |
| `src/game/monsters/gockelokRig.js` | Vollständig zu überarbeitendes Modell und Animationsrig |
| `src/game/monsters/monster.js` | Angriffslaufzeit, Schaden, Tod, Phasen und optionale Hooks |
| `src/game/monsters/attack.js` | Deterministische Angriffe und aus Treffern abgeleitete Marker |
| `src/game/player.js` / `src/game/glitch.js` | Spielerstatus, Glitch-Konter und Glitch-Modus |
| `src/game/hunt.js` / `src/game/huntmeta.js` | Jagdzustand, Rückkehr nach K. o., Sieg und Belohnungen |
| `src/game/world/glitchgrat*` | Bestehende Karte und Anbindung des Übergangs |
| `src/net/sync.js` / `src/net/protocol.js` | Host-/Gast-Replikation und Sonderzustände |
| `src/ui/hud.js` / Audio | Statushinweise, Bossabschnitte, Ansagen und Enthüllung |

Zusätzliche Module für Status, wahre Form, Effekte und Augenarena sollen die
Bossdefinition übersichtlich halten. Die genaue Aufteilung folgt der Umsetzung.

### 15.2 Zustandsmodell

Vorgesehen ist ein zusammenhängendes Jagdziel mit instanzbezogenem Formen- und
Übergangszustand. Die Formen dürfen nicht versehentlich zwei Questabschlüsse oder
zwei konkurrierende Hauptmonster erzeugen.

Erforderliche Zustände:

1. Hahnform mit drei Kampfphasen.
2. Zusammenbruch / Enthüllung.
3. Eintritt ins Auge.
4. Wahre Form.
5. Tatsächlicher Tod und Abschluss.

Ein gewöhnliches Todesereignis der Hahnform darf die Jagd nicht vorzeitig beenden.
Das konkrete Lebenspunktemodell beider Formen wird so gewählt, dass der Wechsel
zuverlässig ist und die gesamte Jagddauer eingehalten werden kann.

### 15.3 Koop und Replikation

- Formenwechsel, Angriffsauswahl und relevante Varianten werden vom Host entschieden.
- Angriffe, Risse und Arenaveränderungen entstehen aus replizierbaren Startdaten.
- Gäste sehen dieselben festgelegten Positionen, Zeitpunkte und Gefahrenformen.
- Fehlkopien brauchen eine eindeutige Zuständigkeit und nachvollziehbare Replikation.
- Nahttreffer und Unterbrechungen müssen über echte Host-/Gast-Trefferpfade funktionieren.
- Teilbrüche verändern auf allen Geräten dasselbe Modell und dieselben Angriffe.
- Übergang und Rückkehr nach K. o. müssen auch für Gäste korrekt funktionieren.
- Jagdende entfernt Marker, Kopien, Übergangseffekte und temporäre Arenaobjekte.

### 15.4 Mobilgeräte und Leistung

- Geometrie pro bewegtem Teil sinnvoll bündeln.
- Gefieder und Silhouette detaillieren, ohne jede Feder zu einem eigenen Draw Call zu machen.
- Begrenzte Effektzahlen und Lebensdauern.
- Keine zusätzlichen teuren Vollbildpässe oder Echtzeitschatten als Voraussetzung.
- Kampfhinweise auf kleinen Querformaten lesbar halten.
- Kamera und Lock-on für beide Anatomien und niedrige Kopföffnungen prüfen.

## 16. Umsetzungsreihenfolge

1. Bestehende Kampf-, Jagd-, Status- und Netzpfade prüfen.
2. Instanzbezogenen Formenwechsel und korrekten Abschluss absichern.
3. Neues Hahnrig mit Stand, Gang, Zielverfolgung und körperlichen Grundangriffen bauen.
4. Drei Kampfphasen und unterschiedliche Kettenfamilien umsetzen.
5. Fehlkopie einschließlich Bereinigung und Anzeige integrieren.
6. Realitätsnähte und dauerhafte Teilbruch-Folgen ergänzen.
7. Enthüllung, Eintritt und Augenarena bauen.
8. Wahre Form, ihre Signaturen und großen Belohnungsfenster umsetzen.
9. Solojagden, alle Waffen und Host-/Gast-Abläufe prüfen.
10. Darstellung und Bedienung im Browser sowie Leistung auf echten Mobilgeräten abnehmen.
11. Gesundheitsvorräte, Schaden, Takt und Dauer anhand der Ergebnisse abstimmen.

## 17. Prüfung und Abnahme

### Funktion und Lebenszyklus

- Hahn kann alle drei Kampfphasen durchlaufen.
- Zusammenbruch löst weder vorzeitigen Sieg noch Abschlussbelohnungen aus.
- Enthüllung und Eintritt funktionieren; Überspringen verursacht keinen Zustandsfehler.
- K. o. innerhalb der zweiten Form erhält den Abschnitt der laufenden Jagd.
- Neue Jagd beginnt wieder bei der Hahnform.
- Nur der tatsächliche Sieg vergibt genau einmal den regulären Abschluss.
- Aufräumen und Neustart lassen keine alten Kopien, Marker oder Arenaobjekte zurück.

### Status, Gegenmechanik und Teilbrüche

- Fehlkopie erzeugt höchstens zwei begrenzte, fest platzierte Gefahren.
- Vorwarnung und tatsächlicher Trefferbereich stimmen überein.
- Ablauf, Glitch-Konter und Glitch-Aktivierung bereinigen korrekt.
- Realitätsnaht ist mit echten Nah- und Fernkampfwaffen erreichbar.
- Erfolgreiche Nahtunterbrechung erzeugt eine nutzbare Öffnung.
- Teilbrüche wirken sichtbar und spielmechanisch.
- Unterbrechungen lassen sich nicht zu dauerhaftem Niederhalten verketten.

### Kampfqualität

- Alle sieben Waffen haben praktikable Antworten und Schadensfenster.
- Gleichförmiges Kiten und blindes Dauerschlagen sind keine sicheren Lösungen.
- Geübtes Lesen und Ausweichen reduziert erlittenen Schaden deutlich.
- Kombinationen bleiben auch mit Fehlkopien und Arenagefahren lösbar.
- Die wahre Form bleibt kurz, intensiv und ausreichend oft erreichbar.
- Vollständige Solojagden prüfen das Ziel von 8–12 Minuten.

### Netz, Browser und Geräte

- Deterministischer Host-/Gast-Replay der Angriffe und Formenwechsel.
- Reale Trefferpfade für Gast-Nahttreffer, Teilbrüche und Bossende.
- Browserprüfung von Silhouette, Bodenhaftung, Posen, Übergang und Augenarena.
- Touch-Layouts mindestens bei 568×320, 740×360 und 844×390.
- Tatsächliche Jagden auf Android Chrome und iPhone Safari gesondert dokumentieren.

Automatisierte Tests und Simulationen belegen Funktion und bestimmte Eigenschaften.
Spaß, gefühlte Härte, Spektakel und glaubwürdige Bewegung brauchen zusätzlich
menschliche Spiel- und Sichtprüfung. Ungemessene Jagddauer oder ungeprüfte Geräte
werden nicht als erfolgreich abgenommen ausgegeben.

## 18. Noch nicht endgültig festgelegte Implementierungswerte

Diese Punkte verlangen zunächst eine sinnvolle Umsetzung und anschließende Tests;
sie ändern die vereinbarte Designrichtung nicht:

- Lebenspunkte beider Formen und genaue Phasenschwellen.
- Endgültige Angriffszahl und Namen.
- Fehlkopie-Radius, Warnzeit, Schadenswert und Auffrischungsregel.
- Konkrete Wirkung von Fehlkopien auf Mitjäger.
- Nahtfenster, Schadensschwellen und Schutz gegen wiederholte Unterbrechungen.
- Exakte Kettenlängen, Angriffstakte und Erholungszeiten.
- Technische Einbindung der Augenarena und des steuerbaren Eintritts im Koop.
- Dauer, Bedienung und Wiederholungsregeln der überspringbaren Inszenierung.
- Finale Belohnungsinszenierung innerhalb der bestehenden Progression.

## 19. Bestehende Referenzen

- [Glitchgrat-Finale](GLITCHGRAT_FINALE.md)
- [Pyrostur-Rework](PYROSTUR_ELDER_REWORK.md)
- [Felsengroll-Rework](FELSENGROLL_ELDER_REWORK.md)
- [Voltiris-Rework](VOLTIRIS_ELDER_REWORK.md)
- [Architektur](ARCHITECTURE.md)
- [GDD](GDD.md)

Dieses Dokument beschreibt für Gockelok die neu abgestimmte Richtung. Ältere
Gockelok-Passagen in den Referenzdokumenten beschreiben den bisherigen Stand und
werden bei der Implementierung entsprechend aktualisiert.


## 20. Umsetzungsnachweis (18. Oktober 2026)

Die Implementierung liegt in `gockelok.js`, `gockelokAttacks.js`, `gockelokRig.js`,
`gockelokCopy.js` und `gockelokEye.js`. Gemeinsame Monster-Hooks erlauben einen
abfangbaren Tod, temporäre Unverwundbarkeit und aktivierbare Teile. Der echte
Tod bleibt das einzige `monsterDead`-Ereignis und damit der einzige Jagdabschluss.

Aktuelle Arbeitswerte:

- 38.000 Gesamt-LP, Hahnphasen bei 78/50 %, Übergang bei 26 %; bestehende Koop-Skalierung.
- 19 Angriffsdefinitionen einschließlich zweier Teilbruchvarianten und fünf Augen-Signaturen.
- Fehlkopie: acht Sekunden, Ablage nach 1/4 Sekunden, Warnung 1,6 Sekunden,
  Radius 2 m, Schaden 42 vor Schutz; keine Auffrischung. Ausschließlich Besitzer-Schaden.
- Fremde Kopien werden als blaue, ungefährliche Hinweise repliziert; maximal zwei pro Besitzer.
- Naht: eigene niedrig liegende Trefferzone, 180 Koop-skalierter Schaden,
  vier Sekunden Öffnung, 13 Sekunden Unterbrechungssperre.
- Übergang: vier Sekunden Enthüllung, danach steuerbarer Eintritt; Interaktion überspringt,
  nach spätestens 16 Sekunden gemeinsamer Eintritt. Host entscheidet, Gäste können anfordern.
- Augenarena: zusammenhängender Boden 100 m über der Außenwelt, begrenzter Rand,
  schwebende Fragmente, verschobene Streifen. Keine Änderung gespeicherter Jagdfortschritte.
- Raumbruch verschiebt sichtbare Bodenstreifen; die stabile Kollisionsfläche verhindert
  unlesbare Stürze. Rollback bewegt den Boss, niemals Spielerfortschritt oder Heilung.
- Starke Signaturen verwenden den vorhandenen 75-%-Max-LP-Pfad (ignoriert Schutz/Block,
  Rollen und Konter bleiben möglich). Gewöhnliche Treffer verwenden normalen Schutz.

Prüfung:

- Deterministischer Replay aller neuen Angriffe, Vorwarnung und Erholungsfenster geprüft.
- Lebenszyklus einschließlich Giftschaden, Übergangsschutz, Eintritt, Rückkehr und Neustart geprüft.
- Reale Angriffe/Projektile aller sieben Waffen treffen die separate Naht.
- Echte HuntNet-Handler prüfen beide Formen, Gastschaden, Teilbrüche und finalen Tod.
- Statusbegrenzung, feste Positionen, Bereinigung und Grafikaufräumen geprüft.
- Produktionsbuild erfolgreich; vorhandene Warnung zur Größe des Hauptbundles bleibt.
- Gesamtlauf ohne langes Fairness-Skript: 1.416 bestanden, ein Fehler im bereits vor
  diesem Auftrag geänderten Pyrostur-Bewegungstest. Separater Fairness-Lauf: 288 bestanden.
  Die zusätzlichen Netzprüfungen werden separat protokolliert.
- Lokale Sichtprüfung über `tools/gockelok-preview.html`; diese Entwicklerseite wird
  nicht in den Produktionsbuild aufgenommen. Die Knöpfe verändern nur die lokale Testjagd.

Weiterhin offene Abnahme: vollständige geübte Solojagden mit allen Waffen, messbare
8–12 Minuten Gesamtdauer, menschliches Urteil zu Härte/Bewegung/Spektakel und echte
Android-Chrome-/iPhone-Safari-Geräte. Automatische Prüfungen ersetzen diese Abnahme nicht.
Kein Merge nach `main` und kein Live-Deployment im Rahmen dieser Umsetzung.

## Nachschärfung nach Spieler-Feedback (18. Oktober 2026)

Feedback: weder Hahn noch Auge fordernd. Umgesetzt:

| Wert | Drachen (Pyrostur / Felsengroll / Voltiris) | Hahn | Auge |
|---|---|---|---|
| LP | 22000 / 24000 / 23000 | 52000 gesamt, 36400 bis zur Enthüllung (30 %) | eigener Pool 42 % = 21840 |
| Treffer Ø / Spitze | 152 / 134 / 121 · Spitze 175–190 | Ø ~150, Spitze 230 (Nahtsignatur 80 % Max-LP) | 175–260, Absturz 90 % Max-LP |
| Nachlauf + recoverAfter | ~1 s + .2–.5 s | ~1 s + .3/.2/.12 s | ~.9 s + .1 s (Überlauf .05 s) |
| Tempo / Ketten | bis 1.16 / chainMax 3–4 | 1.12/1.2/1.3 / chainMax 4, Ketten für fast jeden Angriff | 1.3 (Überlauf 1.45) / Ketten über alle Augen-Angriffe |

Auge zusätzlich: neue Angriffe Speicherleck (dreifacher Blink-Einschlag), Nullsektor (200°-Löschstrahl),
Überlauf (Arena-Gitter); arena-weite Störungen über allen Angriffen (rotierende Scanlinien 1–4, zielsuchende
Splitter, schrumpfende Zone 27→15 m); Firewall bei 75/50/25 % des Augen-Pools, die nur eine zerrissene
Realitätsnaht bricht; Speicherüberlauf nach 180 s (Tempo, Schaden x1.35, Zone 11 m).

Enthüllung: echte Kamerasequenz (drei Einstellungen, Interagieren überspringt). K. o. im Auge: Erwachen am
weiterhin offenen Portal an der Stelle des Hahns; Hineinlaufen oder Interagieren führt zurück. Die Arena liegt
dafür 420 m östlich des Nests außerhalb der Karte, damit ihre Welt-Overrides die Oberwelt nicht berühren.

## Kampflesbarkeit und kürzere Hahnform (21. Oktober 2026)

Basis ist der GitHub-Stand `de7ec60`: Das schwebende Glitch-Auge, seine Arena und
die Firewall bleiben erhalten. Die lokale Cutscene ist eine separat wählbare
Entwicklervorschau; die GitHub-Sequenz bleibt im normalen Spiel aktiv.

- Hahn: Grundwert 42.000 LP, Enthüllung bei 32 %. Damit sind solo 28.560 statt
  36.400 Schaden bis zum Übergang nötig (rund 22 % weniger). Der Augen-Pool bleibt
  unabhängig davon bei 21.840 LP (52 % des neuen Grundwertes).
- Hahn: Hahnenwirbel, Krähenschnitt und gestaffelter Krähenfächer; kürzere,
  phasenspezifische Ketten mit erkennbaren Abschlüssen. Wiederholte Starter werden
  seltener. Sprung, Schnabelanker und schwere Abschlüsse geben echte Öffnungen.
- Auge: Irislanze mit festgelegter Zielbahn, schließender Pupille und drei
  zusammenlaufenden Laderingen. Der Nullsektor lädt an seinem tatsächlichen
  Startwinkel und schwenkt danach kontinuierlich. Schwere Angriffe senken das Auge
  für einen stationären Nahkampfkonter. Die Trefferzonen folgen der Augenhöhe.
- Trefferanzeigen: schmale Kapselbahnen statt zu riesigen Kreisen zusammengefasster
  Laser. Die vollständige Kontur zeigt den Gefahrenbereich, Füllung und Uhr den
  Zeitpunkt. Bewegte Bahnstücke verwenden eigene Trefferzeiten; Tempo und Koop-
  Wiedergabe verwenden dieselbe Zeitumrechnung wie die Schadensabfrage.
- Arena: Scanlinien erhalten Aufladung, kurzen aktiven Schwenk und Ruhephase.
  Ihre Anzeige berücksichtigt den Spielerradius. Splitter laden sichtbar vor dem
  Start; die Sicherheitszone schrumpft langsam und lässt beim Verlassen 0,8 s
  Reaktionszeit. Gitter und Absturz unterdrücken zusätzliche Scanlinien.
- Firewall: eine geladene Irislanze stellt ein erreichbares Nahtfenster sicher.

Vorschau über `npm run dev`, dann `/tools/gockelok-preview.html`: GitHub- und lokale
Cutscene starten frische Testjagden. Hahnphasen, Auge und Einzelangriffe lassen sich
getrennt testen. Pause, Einzelbild, Zeitlupe und „Aufladung ansehen“ erlauben eine
genaue Sichtprüfung. Die Cutscene-Vorschau schreibt ihren Gesehen-Status nicht in
den Spielstand. Die Entwicklerseite bleibt außerhalb des Produktionsbuilds.

Prüfung: gezielte Regressionen für HP-Schwellen, festgelegte Zielrichtung,
Schwenkbeginn, Firewall-Gegenmittel, Nahkampföffnungen, Trefferanzeigen,
Ladeanimationen, Gefahrenbereinigung und Cutscene-Lebenszyklus. Zusätzlich reale
Waffen-/Netzwerktests, Produktionsbuild und Sichtprüfung im Browser.
Ergebnis: 1.574 Tests im abschließenden Gesamtlauf ohne das lange Fairness-Skript
bestanden; das separat im vorangehenden Gesamtlauf abgeschlossene Fairness-Skript
bestand alle 364 Prüfungen. Ein optionaler Metriktest ist deaktiviert. Der
Produktionsbuild ist erfolgreich (bestehende Warnung zur Größe des Hauptbundles).
Eine gemessene Jagddauer und die menschliche Bewertung des Kampfgefühls stehen
weiterhin aus; „10× besser“ ist ein Gestaltungsziel, kein gemessener Testwert.
