// First-hunt controls overlay (compact, non-blocking) + weapon tip. Shown max. TIPS_MAX times unless "Nicht mehr zeigen".
import { settings, saveSettings } from '../core/settings.js';

export const TIPS_MAX = 2;
export const CONTROLS = [
  ['Stick', 'laufen · Rolle: Taste/Doppeltipp'],
  ['A', 'Angriff'], ['B', 'Spezial'],
  ['Lock', 'tippen = an/aus · wischen = Körperteil wechseln'],
  ['Item', 'benutzen (links/rechts wechseln)'],
  ['Sammeln', 'Taste halten bei Pflanzen/Kadaver'],
];
export const WEAPON_TIPS = {
  gs: 'Plattmacher: A halten = Aufladen, Stufe 3 haut am härtesten. Block mit B.',
  db: 'Zwillingsklingen: schnelle Kombos, B = Wirbel. Rollen zum Ausweichen.',
  bow: 'Spannbogen: A halten = spannen, loslassen schießt. Schwachstellen per Lock anvisieren.',
  kt: 'Katana: Konter mit B im richtigen Moment, A-Ketten füllen die Klingenleiste.',
  ga: 'Glitchaxt: Treffer in der Axt bauen Druck auf, B = Schwert (ab 25 %). Im Schwert sinkt der Druck – bei 0 blitzt es weiß.',
  lb: 'Ratterbüchse: A = Schuss, A halten = Rattern. B = Nachladen (zweites B bei 0,5 s = sauber), B halten = Schrottmine. Munition: Lock-Taste (Teil wechseln) ohne Ziel.',
  kk: 'Krachkiste: jeder Schlag nimmt ein Sample (Kopf ▲ · Körper ■ · Glieder ●). B spielt die Leiste ab und buffed alle im Umkreis.',
};
/** [GA] Zusatzzeile nach Fehlzündungen (Zähler settings.gaFehl): kleiner Lerntext, kein Banner */
export const GA_EXTRA = 'B beim Aufblitzen = sauber schalten.';
export const shouldShowTips = (s = settings) => !s.tipsSeen && (s.tipsShown ?? 0) < TIPS_MAX;

export function showOnboarding(root, weaponId, { s = settings, save = saveSettings, autoMs = 22000 } = {}) {
  if (!shouldShowTips(s)) return null;
  s.tipsShown = (s.tipsShown ?? 0) + 1;
  save();
  const el = document.createElement('div');
  el.className = 'ob ui-hit';
  el.innerHTML = `<b>Steuerung</b>
    <ul>${CONTROLS.map(([k, v]) => `<li><i>${k}</i> ${v}</li>`).join('')}</ul>
    <p>${WEAPON_TIPS[weaponId] ?? ''}</p>${weaponId === 'ga' && (s.gaFehl | 0) >= 1 ? `<p><small>${GA_EXTRA}</small></p>` : ''}
    <div><button class="btn small go" data-a="ok">Los</button> <button class="btn small" data-a="never">Nicht mehr zeigen</button></div>`;
  root.appendChild(el);
  const close = () => { clearTimeout(tm); el.remove(); };
  const tm = setTimeout(close, autoMs);
  el.addEventListener('click', (e) => {
    const a = e.target.dataset?.a;
    if (a === 'never') { s.tipsSeen = true; save(); }
    if (a) close();
  });
  return { el, close };
}
