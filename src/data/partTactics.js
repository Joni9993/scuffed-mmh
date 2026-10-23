// Intent before a break; consequence afterwards. Generic move gates are read from the real monster definitions.
const note = (before, after) => ({ before, after });
export const PART_TACTICS = {
  jaggo: {
    head: note('Kamm brechen: Bissketten werden aggressiver. Schwanz zuerst nimmt ihm die Rundumschläge.', 'Kamm gebrochen: Vorsicht, zusätzliche Bissketten! Der Rudelruf bleibt möglich.'),
    tail: note('Abtrennen entfernt Schwanzwirbel und Rückhüpfer. Dafür setzt Jaggo mehr Zickzack-Bisse ein.', 'Schwanz ab: kein Wirbel, kein Rückhüpfer. Dafür mehr Zickzack-Bisse. Schwanz separat zerlegen!'),
  },
  barrotz: {
    head: note('Platte brechen öffnet den Kopf als Schwachstelle. Der Hammer wird durch schnelle Kopfstöße ersetzt.', 'Platte weg: Kopf ist weich. Achtung, schnelle Kopfstoßketten ersetzen den Hammer!'),
    tail: note('Keule brechen verkürzt den Schwanzfeger. Barrotz antwortet mit mehr Rammstürmen.', 'Keule gebrochen: kurzer Stummelfeger statt großer Rundumschlag. Vorsicht vor häufigeren Rammstürmen!'),
  },
  brathalos: {
    head: note('Hörner brechen: Feuerfächer werden zu einem geraden Schuss. Dafür setzt er häufiger den Feuerteppich ein.', 'Hörner ab: Feuerfächer gebündelt. Dafür häufiger Feuerteppich – seitliche Fluchtwege freihalten!'),
    wingL: note('Ein Flügelbruch hält ihn dauerhaft am Boden. Die harmlose Distanz gibt er auf: Flammenstoß ersetzt die Böe.', 'Flügel gerissen: dauerhaft am Boden. Vorsicht, Flammenstoß ersetzt die Flügelböe!'),
    wingR: note('Ein Flügelbruch hält ihn dauerhaft am Boden. Danach wird die Böe zum gefährlichen Flammenstoß.', 'Flügel gerissen: dauerhaft am Boden. Vorsicht, Flammenstoß ersetzt die Flügelböe!'),
    tail: note('Abtrennen schaltet den Schwanzhieb aus und gibt ein zusätzliches Zerlegeziel.', 'Schwanz ab: der Schwanzhieb entfällt. Abgetrennten Schwanz zerlegen!'),
  },
  kroll: { kesselpanzer: note('Panzerbruch löst die zweite Phase mit neuen Scherenangriffen aus.', 'Panzer offen: Phase 2! Vorsicht vor Scherenwirbel und Krabbensprung.') },
  gorgo: { segment3: note('Segment brechen verkürzt den Körper und verlangsamt den Wurm.', 'Segment weg: Körper kürzer, Bewegung langsamer. Die Durchbruchketten bleiben gefährlich.') },
  voltaro: {
    antennenkamm: note('Kamm brechen unterbricht die Überladung und halbiert künftigen Ladungsgewinn.', 'Kamm gebrochen: Überladung abgebrochen, Ladungsgewinn halbiert. Bodenblitze bleiben gefährlich.'),
    tail: note('Abtrennen entfernt die Schwanzpeitsche nach dem Funkenlauf.', 'Schwanz ab: keine Schwanzpeitsche nach dem Funkenlauf. Die Rückkehr des Ansturms bleibt!'),
  },
  blendax: { frill: note('Kragen brechen entfernt den Blitz, löst aber wütende Sprungketten aus.', 'Signal verloren: kein Blitz mehr. Dafür 25 Sekunden wütende Sprungketten!') },
  pyrostur: {
    chest: note('Brustpanzer öffnen entlastet den Kessel und legt eine Schwachstelle frei.', 'Brust offen: Druck abgelassen, starke Schwachstelle. Das Gegenangriffsfenster nutzen!'),
    valve: note('Ventil brechen reduziert den Druck und bremst neuen Druckaufbau.', 'Ventil gebrochen: Druck reduziert, Druckaufbau deutlich langsamer.'),
  },
  felsengroll: {
    shoulder: note('Schulterplatte brechen reduziert Panzerung. Während der Walze wirft ihn der Bruch um.', 'Schulter offen: weniger Panzerung. Ein Bruch während der Walze bringt ihn zu Fall.'),
    club: note('Keule brechen reduziert Panzerung und unterbricht die aktuelle Angriffskette.', 'Keule ab: weniger Panzerung, aktuelle Kette unterbrochen.'),
  },
  voltiris: { antenna: note('Antennenkrone brechen verändert die Muster von Raster und Gewitter.', 'Krone gebrochen: Raster und Gewitter nutzen jetzt ihre veränderten Muster. Bodenmarkierungen neu lesen!') },
};

export function partTactic(monster, part) {
  if (!part) return note('', '');
  const custom = PART_TACTICS[monster.def.id]?.[part.id];
  if (custom) return custom;
  if (monster.def.id === 'gorgo' && part.id.startsWith('segment')) return PART_TACTICS.gorgo.segment3;
  const moves = Object.values(monster.def.attacks ?? {}), removed = moves.filter(a => a.lockedByBreak === part.id).length, added = moves.filter(a => a.needsBroken === part.id).length;
  const effect = [removed ? `${removed} Angriffsmuster entfallen` : '', added ? `${added} Ersatzmuster werden möglich` : ''].filter(Boolean).join(', ');
  return note(effect ? `Bruch: ${effect}. Zusätzlich Taumeln und Bruchbeute.` : 'Gezielt brechen: unterbricht die Angriffskette und gibt zusätzliche Bruchbeute.', effect ? `Teil gebrochen: ${effect}.` : 'Teil gebrochen: Angriffskette unterbrochen, Bruchbeute gesichert.');
}

export function partCondition(part) {
  if (part.gone) return 'Abgetrennt';
  if (part.broken) return 'Gebrochen';
  if (!part.breakHp) return 'Nicht brechbar';
  const left = part.hp / part.breakHp;
  return left <= .25 ? 'Kurz vor Bruch' : left <= .6 ? 'Angeschlagen' : 'Intakt';
}
