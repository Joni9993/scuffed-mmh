import { teamAwards } from '../meta/teamAwards.js';
import { WEAPON_TYPES } from '../data/weapons.js';
import { esc } from './hubKit.js';

export function teamReportHtml(report, myId) {
  const players = report.players ?? [], awards = teamAwards(players);
  const names = ids => ids.map(id => players.find(p => p.id === id)?.name ?? 'Pirscher').map(esc).join(' & ');
  const card = a => `<article class="team-award${a.low ? ' low' : ''}"><small>${a.low ? 'MIT LIEBE PROTOKOLLIERT' : 'EHRE, WEM SCHROTT GEBÜHRT'}${a.winners.length > 1 ? ' · GETEILTER TITEL' : ''}</small><h3>${esc(a.title)}</h3><b>${names(a.winners)}</b><p>${esc(a.text)}</p></article>`;
  return `<div class="team-intro"><b>Das Rostnest-Jagdgericht</b><p>Ein gemeinsamer Bericht. Große Taten. Kleine Betriebsunfälle.</p></div>
    ${!report.complete ? '<div class="note">Der Teambericht konnte nicht vollständig übertragen werden. Angezeigt wird der letzte verfügbare Stand.</div>' : ''}
    <div class="team-awards">${awards.filter(a => !a.low).map(card).join('')}</div>
    <div class="sub">Die ganze Truppe</div><div class="team-roster">${players.map(p => {
      const titles = awards.filter(a => a.winners.includes(p.id));
      return `<article class="team-player${p.id === myId ? ' me' : ''}"><header><b>${esc(p.name)}${p.id === myId ? ' · du' : ''}</b><small>${esc(WEAPON_TYPES[p.weapon]?.name ?? 'Pirscher')}</small></header>
        <p>${titles.filter(a => !a.low).map(a => esc(a.title)).join(' · ') || 'Mit von der Partie. Das Rostnest führt Anwesenheit.'}</p>
        <dl><div><dt>Schaden</dt><dd>${Math.round(p.damage)}</dd></div><div><dt>Teilbrüche</dt><dd>${p.breaks}</dd></div><div><dt>Perfekt gerollt</dt><dd>${p.complete ? p.perfect : '–'}</dd></div><div><dt>Team-Beats</dt><dd>${p.complete ? p.support : '–'}</dd></div><div><dt>Umgekippt</dt><dd>${p.complete ? p.kos : '–'}</dd></div></dl>
        ${!p.complete ? '<small>Persönlicher Abschlussbericht fehlt; bestätigte Kampfdaten bleiben erhalten.</small>' : ''}${p.left ? '<small>Hat die Verbindung vor dem Bericht verloren oder die Jagd verlassen.</small>' : ''}</article>`;
    }).join('')}</div>
    ${awards.some(a => a.low) ? `<div class="sub">Die Akte der kleinen Katastrophen</div><div class="team-awards">${awards.filter(a => a.low).map(card).join('')}</div>` : '<div class="note">Keine besonderen Betriebsunfälle gemeldet. Verdächtig professionell.</div>'}
    ${report.moments?.length ? `<div class="sub">Das bleibt hängen</div><div class="team-moments">${report.moments.map(e => `<article><b>${esc(e.title)}</b><small>${Math.floor(e.at / 60)}:${String(Math.floor(e.at % 60)).padStart(2, '0')}</small><p>${esc(e.text)}</p></article>`).join('')}</div>` : ''}`;
}
