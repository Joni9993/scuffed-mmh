const CATEGORIES = [
  { id: 'damage', key: 'damage', title: 'Abrissunternehmen', min: 1, text: n => `${n} Schaden. Die Reklamation ist beim Brocken eingegangen.` },
  { id: 'breaks', key: 'breaks', title: 'Demontageleitung', min: 1, text: n => `${n} ${n === 1 ? 'Teilbruch' : 'Teilbrüche'}. Zusammenbauen darf jemand anders.` },
  { id: 'perfect', key: 'perfect', title: 'Knapp daneben ist auch vorbei', min: 1, text: n => `${n} ${n === 1 ? 'perfektes Ausweichmanöver' : 'perfekte Ausweichmanöver'}. Sah bestimmt alles geplant aus.` },
  { id: 'support', key: 'support', title: 'Tragende Band', min: 1, text: n => `${n} ${n === 1 ? 'Beat' : 'Beats'} für Mitspieler. Die Gage gibt es in Schrott.` },
  { id: 'stuns', key: 'stuns', title: 'Bitte kurz warten', min: 1, text: n => `${n} ${n === 1 ? 'Betäubung' : 'Betäubungen'}. Der Brocken musste seine Gedanken sortieren.` },
  { id: 'glitch', key: 'glitchDmg', title: 'Fehler mit Absicht', min: 1, text: n => `${n} Glitch-Schaden. Funktioniert offensichtlich wie vorgesehen.` },
  { id: 'floor', key: 'kos', title: 'Bodengutachten', min: 1, low: true, text: n => `${n} ${n === 1 ? 'Bodenbesuch' : 'Bodenbesuche'}. Liegt noch genauso hart wie vorhin.` },
  { id: 'rolls', key: 'rolls', title: 'Amtierender Rollmops', min: 8, low: true, text: n => `${n} Rollen. Anreise zu Fuß wäre auch gegangen.` },
  { id: 'potions', key: 'potions', title: 'Brausebeauftragte', min: 2, low: true, text: n => `${n} Heiltränke. Pfand gibt es leider keins.` },
];

/** Equal scores share the title. No invented failures, lowest-DPS shaming or random MVP. */
export function teamAwards(players = []) {
  return CATEGORIES.flatMap(c => {
    const eligible = players.filter(p => p.complete || ['damage', 'breaks', 'stuns'].includes(c.key));
    const value = Math.max(0, ...eligible.map(p => Number(p[c.key]) || 0));
    if (value < c.min) return [];
    return [{ id: c.id, title: c.title, text: c.text(Math.floor(value)), low: !!c.low, value, winners: eligible.filter(p => p[c.key] === value).map(p => p.id) }];
  });
}
