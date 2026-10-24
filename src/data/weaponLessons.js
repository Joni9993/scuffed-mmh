// Each lesson describes an observable action. No timer or button press can pass a hit lesson.
const lesson = (id, title, how, why, rule, extra = {}) => ({ id, title, how, why, rule, ...extra });
const move = (...ids) => ({ event: 'weaponMove', moves: ids });
const hit = (count = 1, moves) => ({ event: 'hit', count, moves });
const fin = (id, how) => lesson('finisher', 'Das große Angriffsfenster', how, 'Wucht kommt durch Treffer. Hebe den Finisher für einen taumelnden oder erschöpften Brocken auf.', move(id), { wucht: true });
const glitch = (name, how) => lesson('glitch', name, `Glitch aktivieren, dann ${how}`, 'In einer Jagd laden Treffer, Teilbrüche und perfekte Ausweichmanöver deine Glitch-Energie. Hier lädt sie automatisch.', { event: 'glitchHit', count: 3 }, { glitch: true });
const lock = lesson('lock', 'Ziel und Abstand', 'Lock antippen. Laufe dann zur markierten Übungsposition vor der Puppe.', 'Lock hält das Ziel im Blick. Über die Lock-Taste wischen wechselt das Körperteil.', { state: 'position' });
const evade = lesson('evade', 'Perfekt ausweichen', 'Lies den Countdown. Beim Signal „JETZT“ zur Seite rollen. Weiche zwei Übungsschlägen perfekt aus.', 'Die ersten unverwundbaren Momente der Rolle belohnen dich mit Glitch-Energie und einem verstärkten nächsten Angriff. Frühes Wegrollen ist sicher, zählt aber nicht als perfektes Timing.', { event: 'trainingDefense', result: 'perfect', count: 2 }, { defense: 'dodge' });
export const WEAPON_LESSONS = {
  gs: {
    name: 'Plattmacher', role: 'Lücken lesen. Aufladen. Einen gewaltigen Treffer setzen.', rhythm: 'Ausweichen → sicher aufladen → treffen → aus der Erholung rollen.',
    steps: [lock,
      lesson('chain', 'Drei schwere Schläge', 'A dreimal im Rhythmus tippen: Hieb → Querschlag → Aufwärtshaken. Tippe den nächsten Schlag während des laufenden Schlags.', 'Du bist während der Schläge langsam. Eine komplette Kette lohnt nur in einem großen Fenster.', hit(1, ['gs_haken'])),
      lesson('charge', 'Sauber aufladen', 'A halten. Bei der dritten Ladestufe / dem goldenen Signal loslassen. Triff die Puppe mit einem sauberen Schlag.', 'Zu frühes Loslassen kostet Wucht. Zu langes Halten verliert wieder eine Stufe.', { event: 'hit', sauber: true }),
      lesson('guard', 'Frontal blocken', 'Zur Puppe schauen und B halten. Blocke zwei angekündigte Übungsschläge.', 'Blocken kostet Puste und lässt Restschaden durch. Es hilft, wenn keine Zeit zum Wegrollen bleibt.', { event: 'trainingDefense', result: 'block', count: 2 }, { defense: 'block' }),
      lesson('tackle', 'Rempler in die Ladung', 'B kurz tippen = Rempler. Danach A halten: Die folgende Ladung startet bereits auf Stufe 1.', 'Der Rempler übersteht leichtes Zucken. Er ist dein schneller Einstieg in eine Ladung.', move('gs_charge_r')),
      fin('gs_finisher', 'Die Wucht ist für diese Übung voll. B kurz tippen = Schrottbrecher.'),
      glitch('Frame-Skip', 'A halten und loslassen: volle Ladung ohne Warten. Lande drei Treffer im Glitch-Modus.')],
  },
  db: {
    name: 'Zwillingsklingen', role: 'Dranbleiben, kurze Trefferfolgen setzen und rechtzeitig ausweichen.', rhythm: 'Kette → seitlich ausweichen → Sprungschnitt → weiterkämpfen.',
    steps: [lock,
      lesson('chain', 'Die Schnittfolge', 'A wiederholt im Schlagrhythmus tippen. Erreiche den dritten Angriff der Kette und triff damit.', 'Viele kleine Treffer summieren sich. Bewege dich mit der Kette an die Flanke.', hit(1, ['db_a3', 'db_a3r'])),
      lesson('rage', 'Rausch bewusst nutzen', 'B kurz tippen, dann mit A drei Treffer im Rausch landen. B schaltet ihn später wieder aus.', 'Rausch gibt zusätzliche Treffer und schnellere Bewegung, verbraucht aber laufend Puste. Im echten Kampf nicht leer laufen lassen.', { event: 'hit', rausch: true, count: 3 }),
      lesson('jump', 'Ausweichen und zurückschneiden', 'Rollen, dann sofort A tippen. Triff mit dem Sprungschnitt.', 'So setzt du nach dem Ausweichen wieder zum Angriff an, statt nur zurückzulaufen.', hit(1, ['db_jump', 'db_jumpr'])),
      fin('db_finisher', 'Wucht ist voll. B mindestens 0,3 Sekunden halten = Schrottwirbel. Währenddessen bewegen.'),
      glitch('Echo-Input', 'mit A angreifen. Drei eigene Treffer reichen: Geisterschläge wiederholen deine Angriffe.')],
  },
  bow: {
    name: 'Spannbogen', role: 'Abstand halten, Spannung aufbauen und Schwachstellen treffen.', rhythm: 'Spannen → schießen → ausweichen → mit höherer Spannung weiterschießen.',
    steps: [lock,
      lesson('shot', 'Zielen und treffen', 'Auf den Kopf locken. Aus 8–16 Metern A kurz tippen und dreimal treffen.', 'Innerhalb dieser Distanz trifft der Bogen mit voller Kraft. Die Waffenanzeige hilft beim Abstand.', { ...hit(3), range: [8, 16] }),
      lesson('draw', 'Der Durchschuss', 'A mindestens 0,9 Sekunden halten, dann loslassen. Feuere zweimal auf Stufe 3.', 'Stufe 1 streut, Stufe 2 schießt doppelt, Stufe 3 durchbohrt mehrere Körperteile.', { event: 'weaponTechnique', technique: 'bowShot3', count: 2 }),
      lesson('dodgeDraw', 'Ausweichspannen', 'Rollen, unmittelbar danach A halten und wieder loslassen.', 'Nach der Rolle beginnt die Spannung schon auf Stufe 2. So bleibst du beweglich.', move('b_draw_r')),
      fin('b_finisher', 'Wucht ist voll. B kurz tippen = Pfeilregen. Das Ziel während der Markierung im Blick behalten.'),
      glitch('Debug-Modus', 'mit A schießen. Drei Treffer zählen; Schwachstelle und optimale Distanz sind im Modus garantiert.')],
  },
  kt: {
    name: 'Katana', role: 'Angriffe lesen, präzise kontern und den Schliff erhalten.', rhythm: 'Kurze Schnitte → gegnerischen Schlag kontern → das neue Fenster nutzen.',
    steps: [lock,
      lesson('chain', 'Schnittkette', 'A im Rhythmus tippen und mit dem dritten Schnitt treffen.', 'Die Kette ist dein verlässlicher Schaden zwischen Kontern.', hit(1, ['kt_a3'])),
      lesson('draw', 'Blankgezogen', 'A halten und beim goldenen Signal nach etwa 0,6 Sekunden loslassen. Triff sauber.', 'Das kurze Loslassfenster verstärkt den Ziehschnitt. Blindes Dauerhalten hilft nicht.', { event: 'hit', sauber: true }),
      lesson('counter', 'Den Angriff beantworten', 'Zur Puppe schauen. Beim Signal „JETZT“ B kurz tippen. Kontere zwei Übungsschläge.', 'Die ersten 0,25 Sekunden der Haltung kontern. Ein Erfolg erhöht den Schliff; zu frühes B lässt dich offen stehen.', { event: 'counter', count: 2 }, { defense: 'counter' }),
      fin('kt_finisher', 'Wucht ist voll. B mindestens 0,3 Sekunden halten = Mondsichel; setzt den Schliff auf Stufe 3.'),
      glitch('Desync-Schnitte', 'dreimal mit A treffen. Deine Schnitte bleiben als Risse hängen; RESYNC oder das Modus-Ende löst sie zusammen aus.')],
  },
  kk: {
    name: 'Krachkiste', role: 'Körperzonen samplen, Beats spielen und das Team stärken.', rhythm: 'Gezielte Treffer sammeln → passende Leiste abspielen → gemeinsam angreifen.',
    steps: [lock,
      lesson('samples', 'Treffer werden Samples', 'Mit A dreimal die Puppe treffen. Kopf = rot, Körper = blau, Arme = grün. Die drei Slots stehen am Waffenkragen.', 'Rot verstärkt Angriff, Blau gibt Standfestigkeit, Grün heilt. Ein Schlag sammelt höchstens ein Sample.', hit(3)),
      lesson('play', 'Den eigenen Beat abspielen', 'Mindestens ein Sample sammeln, dann B kurz tippen. Bleibe beim Team: Der Radius beträgt 8 Meter.', 'Gleiche Farben verstärken ihre Wirkung. Drei verschiedene Farben ergeben einen Remix. Eine leere Leiste gibt nur einen Schallstoß.', { event: 'kkPlay' }),
      lesson('charge', 'Voll aufgedreht', 'A halten und im goldenen Fenster nach etwa 0,8 Sekunden loslassen. Triff mit dem sauberen Stampfer.', 'Der aufgeladene Schlag ist für große Lücken; normale Ketten sammeln schneller Samples.', { event: 'hit', sauber: true }),
      fin('kk_finisher', 'Wucht ist voll. Samples sammeln und B mindestens 0,3 Sekunden halten = Zugabe! Spielt die Leiste auf Stufe 3.'),
      glitch('Feedback-Schleife', 'mit A drei Treffer sammeln. Deine Leiste spielt automatisch alle zwei Sekunden, Treffer bekommen ein Echo.')],
  },
  ga: {
    name: 'Glitchaxt', role: 'In der Axt Druck sammeln, im Schwert ausgeben und sauber zurückschalten.', rhythm: 'Axttreffer → ab 25 Druck ins Schwert → Druck nutzen → beim Blitz zurück.',
    steps: [lock,
      lesson('pressure', 'Druck aufbauen', 'In der Axt mit A treffen, bis mindestens 25 Druck in der Waffenanzeige stehen.', 'Axttreffer sind dein Treibstoff. A halten führt wilde Schwünge aus.', { state: 'pressure' }),
      lesson('sword', 'Ins Schwert wechseln', 'Ab 25 Druck B kurz tippen. Mit A dreimal im Schwert treffen.', 'Das Schwert ist stärker, verliert aber Druck durch Zeit und Treffer.', { event: 'hit', mode: 'schwert', count: 3 }),
      lesson('switch', 'Sauber zurückschalten', 'Im Schwert warten, bis der Druck leer wird und die Waffe weiß aufblitzt. Dann B kurz tippen.', 'B im Blitzfenster gibt einen Bonusschlag und neuen Druck. Zu spätes Schalten verursacht eine Fehlzündung.', move('ga_sauber'), { setup: 'switch' }),
      lesson('discharge', 'Druck entladen', 'In der Axt 25 Druck sammeln, mit B ins Schwert. Dann B halten und die Entladung ausführen.', 'Die Entladung verbraucht deinen Druck für eine Folge von Pulsen. Nutze ein sicheres Fenster.', { event: 'weaponMove', prefix: 'ga_entlad' }),
      fin('ga_finisher', 'Wucht ist voll. B halten = Kernschmelze. Danach bleiben 50 Druck für die nächste Aktion.'),
      glitch('Zustandsfehler', 'mit A drei Treffer setzen. Beide Waffenformen treffen gleichzeitig und der Druck sinkt nicht.')],
  },
  lb: {
    name: 'Ratterbüchse', role: 'Passende Distanz halten, Magazine nutzen und das Nachladen timen.', rhythm: 'Schießen → Angriff ausweichen → Magazin sauber laden → weiterschießen.',
    steps: [lock,
      lesson('shots', 'Einzelschuss und Rattern', 'A halten und mindestens fünf Bolzen abfeuern. Normalmunition ist bei 6–14 Metern am stärksten.', 'A tippen gibt Einzelschüsse. Halten feuert automatisch, macht dich aber langsamer.', { event: 'weaponTechnique', technique: 'lbRattern', count: 5 }),
      lesson('reload', 'Sauber geladen', 'Magazin mit A leerschießen. A loslassen. Beim automatischen Nachladen A NEU im gelben Feld drücken.', 'Ein sauberer Druck beendet das Laden sofort und verstärkt das nächste Magazin. Daneben entsteht ein Klemmer.', { event: 'weaponTechnique', technique: 'lbReload' }),
      lesson('mine', 'Die Schrottmine', 'B kurz tippen, um eine Mine zu platzieren. Für den echten Kampf: in die Laufbahn des Brockens legen.', 'Minen betäuben und verursachen zusätzlichen Teilschaden. Zwei Ladungen, eine kommt alle 20 Sekunden zurück.', { event: 'weaponTechnique', technique: 'lbMine' }),
      lesson('hop', 'Ausfallschritt und Hüpfschuss', 'Rollen, dann sofort A tippen. Feuere den Hüpfschuss ab.', 'Der Schuss nach dem Ausfallschritt erhält zusätzlichen Schaden.', move('lb_hop')),
      fin('lb_finisher', 'Wucht ist voll. B mindestens 0,3 Sekunden halten = Rückstoß-Kracher. Der Klebebolzen detoniert verzögert.'),
      glitch('Buffer Overflow', 'A halten und dreimal treffen. Kein Nachladen, schnelleres Feuer und volle Bewegung beim Rattern.')],
  },
};
// Every weapon teaches the shared defensive foundation before its specific techniques.
for (const course of Object.values(WEAPON_LESSONS)) course.steps.splice(1, 0, evade);

// Short reminders stay on screen while practising. Full instructions are read before the attempt.
const CUES = {
  gs: { chain: 'A → A → A im Rhythmus; mit dem Aufwärtshaken treffen.', charge: 'A halten → beim dritten, goldenen Signal loslassen.', guard: 'Zur Puppe schauen. B beim Übungsschlag halten.', tackle: 'B kurz tippen → danach A halten.', finisher: 'Wucht voll: B kurz tippen.', glitch: 'Glitch → A halten und loslassen. Dreimal treffen.' },
  db: { chain: 'A im Rhythmus tippen; mit dem dritten Schnitt treffen.', rage: 'B kurz → im Rausch mit A dreimal treffen.', jump: 'Rollen → sofort A → treffen.', finisher: 'Wucht voll: B mindestens 0,3 s halten.', glitch: 'Glitch → mit A drei eigene Treffer landen.' },
  bow: { shot: 'Kopf locken → aus 8–16 m A tippen. Dreimal treffen.', draw: 'A mindestens 0,9 s halten → loslassen. Zweimal.', dodgeDraw: 'Rollen → sofort A halten → loslassen.', finisher: 'Wucht voll: B kurz tippen; Ziel im Blick halten.', glitch: 'Glitch → mit A dreimal treffen.' },
  kt: { chain: 'A im Rhythmus tippen; mit dem dritten Schnitt treffen.', draw: 'A halten → nach etwa 0,6 s beim Goldsignal loslassen.', counter: 'Zur Puppe schauen. Bei JETZT B kurz tippen.', finisher: 'Wucht voll: B mindestens 0,3 s halten.', glitch: 'Glitch → mit A dreimal treffen.' },
  kk: { samples: 'Mit A drei Treffer und damit Samples sammeln.', play: 'Ein Sample mit A sammeln → B kurz beim Team tippen.', charge: 'A halten → nach etwa 0,8 s beim Goldsignal loslassen.', finisher: 'Wucht voll: Samples sammeln → B mindestens 0,3 s halten.', glitch: 'Glitch → mit A dreimal treffen.' },
  ga: { pressure: 'In der Axt mit A treffen, bis 25 Druck erreicht sind.', sword: 'Ab 25 Druck B kurz → im Schwert mit A dreimal treffen.', switch: 'Druck leer werden lassen → beim weißen Blitz B kurz.', discharge: '25 Druck sammeln → B kurz ins Schwert → B halten.', finisher: 'Wucht voll: B halten für die Kernschmelze.', glitch: 'Glitch → mit A dreimal treffen.' },
  lb: { shots: 'Aus 6–14 m A halten und fünf Bolzen abfeuern.', reload: 'Magazin leeren → A loslassen → im gelben Feld A neu drücken.', mine: 'B kurz tippen, um eine Mine zu legen.', hop: 'Rollen → sofort A für den Hüpfschuss.', finisher: 'Wucht voll: B mindestens 0,3 s halten.', glitch: 'Glitch → A halten und dreimal treffen.' },
};
for (const [id, course] of Object.entries(WEAPON_LESSONS)) {
  // lock/evade are shared objects across courses.
  for (const step of course.steps) step.cue = step.id === 'lock' ? 'Lock antippen → zur markierten Position laufen.'
    : step.id === 'evade' ? 'Beim Signal JETZT zur Seite rollen. Zweimal perfekt.' : CUES[id][step.id];
}

/** Pure progress tracker: replayable steps, no automatic skipping, duplicates cannot farm a completed step. */
export function newLessonProgress(weapon, index = 0) { return { weapon, index, count: 0, done: false }; }
export function recordLesson(progress, event, payload = {}) {
  const step = WEAPON_LESSONS[progress.weapon]?.steps[progress.index], rule = step?.rule;
  if (!rule || progress.done || rule.event !== event || rule.state) return false;
  if (rule.moves && !rule.moves.includes(payload.moveId)) return false;
  if (rule.prefix && !payload.moveId?.startsWith(rule.prefix)) return false;
  for (const key of ['technique', 'result', 'mode']) if (rule[key] !== undefined && payload[key] !== rule[key]) return false;
  if (rule.sauber && !payload.sauber || rule.rausch && !payload.rausch) return false;
  if (rule.range && !(payload.distance >= rule.range[0] && payload.distance <= rule.range[1])) return false;
  progress.count = Math.min(rule.count ?? 1, progress.count + 1);
  progress.done = progress.count >= (rule.count ?? 1);
  return true;
}
