// Recognition only: no bonus damage, slow motion, or changes to monster authority.
const KINDS = { break: 'Teilbruch', stun: 'Betäubung', trap: 'Falle', flash: 'Flugsturz' };
export const OPENING_SECONDS = { break: 2, stun: 6, trap: 6, flash: 4 };
export const PING_COOLDOWN = 4;

export function cleanTeamPing(d, hunt, from) {
  if (!d || !['focus', 'trap', 'glitch'].includes(d.kind)) return null;
  const p = hunt.players.find(p => p.id === from && p.alive);
  if (!p) return null;
  if (d.kind === 'focus') {
    const m = hunt.monsters.find(m => m.id === d.monster && m.alive && !m.minor);
    const part = m?.partById[d.part];
    if (!part || part.gone || m.def.partActive?.(m, part) === false) return null;
    return { kind: 'focus', owner: from, monster: m.id, part: part.id };
  }
  // Position comes from the authoritative peer pose, never arbitrary incoming coordinates.
  return { kind: d.kind, owner: from, x: p.pos.x, z: p.pos.z };
}

export function createTeamplay(h) {
  const windows = new Map(), buffs = new Map(), pingTimes = new Map(), seen = new Set(), journal = [];
  let sequence = 0, lastMoment = -99, lastGlitchPing = false;
  const player = id => h.players.find(p => p.id === id);
  const authority = () => !h.net?.isGuest;
  const coop = () => h.players.length > 1 && !h.training;
  function receive(e) {
    if (!e || !Number.isInteger(e.id) || seen.has(e.id) || !['opening', 'moment', 'ping'].includes(e.type)) return;
    seen.add(e.id); if (seen.size > 256) seen.delete(seen.values().next().value);
    if (e.type === 'moment') { journal.push(e); if (journal.length > 12) journal.shift(); }
    h.bus.emit('teamNotice', e);
  }
  function publish(type, data) {
    if (!coop()) return;
    const e = { ...data, type, id: ++sequence, at: h.time };
    receive(e); h.net?.broadcastTeam(e);
  }
  function open(kind, m, owner, part, threatened) {
    if (!authority() || !coop() || !owner || !player(owner) || !m?.alive || m.minor) return;
    const old = windows.get(m.id);
    // A simultaneous stun extends the same player's opening, without two banners.
    if (old && old.owner === owner && old.until > h.time) { old.until = Math.max(old.until, h.time + OPENING_SECONDS[kind]); return; }
    windows.set(m.id, { owner, kind, part, until: h.time + OPENING_SECONDS[kind], damage: new Map(), used: false });
    publish('opening', { title: 'FENSTER OFFEN', text: `${player(owner).name}: ${KINDS[kind]} bei ${m.def.name}. Jetzt gemeinsam angreifen!`, monster: m.id, owner, until: h.time + OPENING_SECONDS[kind] });
    if (threatened && threatened !== owner && player(threatened)) moment('Rettung in letzter Sekunde', `${player(owner).name} bricht den Angriff auf ${player(threatened).name} durch einen Teilbruch ab.`, [owner, threatened], m);
  }
  function moment(title, text, participants, m) {
    if (h.time - lastMoment < 1 || !coop()) return;
    lastMoment = h.time;
    publish('moment', { title, text, participants, monster: m?.id });
  }
  function damage({ monster: m, res }) {
    if (!authority() || !coop() || res.env || res.revier || !(res.dmg > 0) || !player(res.attackerId)) return;
    const w = windows.get(m.id);
    if (w && !w.used && w.until >= h.time && res.attackerId !== w.owner && player(w.owner)) {
      const id = res.attackerId, n = (w.damage.get(id) ?? 0) + res.dmg; w.damage.set(id, n);
      if (n >= Math.max(25, m.maxHp * .008)) {
        w.used = true;
        moment('Vorlage verwandelt', `${player(w.owner).name} schafft das Fenster (${KINDS[w.kind]}). ${player(id).name} nutzt es gegen ${m.def.name}.`, [w.owner, id], m);
      }
    }
    const b = buffs.get(res.attackerId);
    if (b && b.until >= h.time && b.owner !== res.attackerId && player(b.owner)) {
      b.damage += res.dmg;
      if (b.damage >= Math.max(40, m.maxHp * .012)) {
        buffs.delete(res.attackerId);
        moment('Im selben Takt', `${player(b.owner).name} gibt den Beat vor. ${player(res.attackerId).name} setzt die verstärkten Treffer gegen ${m.def.name}.`, [b.owner, res.attackerId], m);
      }
    }
  }
  function support(owner, ev) {
    if (!authority() || !coop() || !player(owner) || !ev?.buffs?.some(b => b.c === 'r')) return;
    const strength = ev.buffs.find(b => b.c === 'r').lvl;
    for (const p of h.players) if (p.id !== owner && p.alive && (p.buffs?.r?.lvl ?? 0) <= strength && Math.hypot(p.pos.x - ev.x, p.pos.z - ev.z) <= 8) buffs.set(p.id, { owner, until: h.time + 8, damage: 0 });
  }
  function ping(d, from) {
    if (!authority() || !coop() || h.result || (pingTimes.get(from) ?? -99) + PING_COOLDOWN > h.time) return false;
    const clean = cleanTeamPing(d, h, from); if (!clean) return false;
    pingTimes.set(from, h.time);
    const p = player(from), m = h.monsters.find(m => m.id === clean.monster);
    const text = clean.kind === 'focus' ? `${p.name}: Auf ${m.partById[clean.part].label}!` : clean.kind === 'trap' ? `${p.name}: Falle hier vorbereiten!` : `${p.name}: Glitch bereit – Fenster suchen!`;
    publish('ping', { ...clean, title: clean.kind === 'focus' ? 'GEMEINSAMES ZIEL' : clean.kind === 'trap' ? 'FALLENPLAN' : 'GLITCH BEREIT', text, until: h.time + 6 });
    return true;
  }
  const offs = [
    h.bus.on('partBreak', e => open('break', e.monster, e.attackerId, e.part, e.threatened)),
    h.bus.on('monsterStun', e => open('stun', e.monster, e.attackerId)),
    h.bus.on('monsterOpening', e => open(e.kind, e.monster, e.attackerId)),
    h.bus.on('monsterDamaged', damage),
    h.bus.on('kkPlay', e => support(e.player?.id, e.decoded)),
  ];
  return {
    receive, ping, support,
    requestPing(kind) {
      const p = h.player;
      if (kind === 'glitch' && (p.glitch.active || p.glitch.energy < 100)) return false;
      const target = p.lock, points = target?.monster?.lockPoints() ?? [], part = points.length ? points[target.idx % points.length] : null;
      const d = { kind, monster: target?.monster?.id, part: part?.partId };
      if (h.net?.isGuest) h.net.requestTeamPing(d); else return ping(d, p.id);
      return true;
    },
    update() {
      for (const [id, w] of windows) if (w.until < h.time || !h.monsters.some(m => m.id === id && m.alive)) windows.delete(id);
      for (const [id, b] of buffs) if (b.until < h.time) buffs.delete(id);
      // One useful signal per charge, on the same rate limit as manual pings.
      const ready = h.player.glitch.energy >= 100 && !h.player.glitch.active;
      if (ready && !lastGlitchPing && coop()) this.requestPing('glitch');
      lastGlitchPing = ready;
    },
    summary: () => journal.map(e => ({ title: e.title, text: e.text, participants: e.participants, at: e.at })),
    dispose() { offs.forEach(off => off()); windows.clear(); buffs.clear(); },
  };
}
