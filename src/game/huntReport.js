import { ITEMS } from '../data/items.js';

export const REPORT_KEYS = ['damage', 'hits', 'perfect', 'kos', 'rolls', 'glitchDmg', 'damageTaken', 'potions', 'support'];
export function cleanReportStats(raw = {}) {
  return Object.fromEntries(REPORT_KEYS.map(k => [k, Number.isFinite(raw?.[k]) ? Math.floor(Math.max(0, Math.min(1e9, raw[k]))) : 0]));
}

/** One roster and one host-issued result for everybody. Personal counters are sampled before carving. */
export function createHuntReport(h) {
  const roster = new Map(), submitted = new Map(), actual = new Map();
  for (const p of [...(h.opts?.players ?? []), h.player]) if (p?.id) roster.set(p.id, { id: p.id, name: String(p.name ?? 'Pirscher').slice(0, 12), weapon: p.weaponId ?? p.weapon?.type ?? p.weapon ?? 'gs' });
  const local = { damageTaken: 0, potions: 0, support: 0 };
  let frozen = null, final = null;
  const authoritative = () => !h.net?.isGuest;
  const metric = id => { if (!actual.has(id)) actual.set(id, { damage: 0, hits: 0, breaks: 0, stuns: 0 }); return actual.get(id); };
  const offs = [
    h.bus.on('monsterDamaged', ({ monster, res, appliedDamage }) => {
      if (!authoritative() || h.result || monster.def?.neutral || !res || res.env || res.revier || !roster.has(res.attackerId)) return;
      const r = metric(res.attackerId); r.damage += Math.max(0, appliedDamage ?? res.dmg ?? 0); r.hits++;
    }),
    h.bus.on('partBreak', ({ attackerId }) => { if (authoritative() && !h.result && roster.has(attackerId)) metric(attackerId).breaks++; }),
    h.bus.on('monsterStun', ({ attackerId }) => { if (authoritative() && !h.result && roster.has(attackerId)) metric(attackerId).stuns++; }),
    h.bus.on('playerHit', e => { if (!h.result && e.player === h.player && !h.player.god) local.damageTaken += Math.max(0, e.dmg ?? 0); }),
    h.bus.on('itemUsed', e => { if (!h.result && e.player === h.player && e.tip === undefined && ITEMS[e.id]?.effect?.type === 'heal') local.potions++; }),
    h.bus.on('kkPlay', e => {
      if (h.result || e.player !== h.player || !e.decoded?.buffs?.length) return;
      if (h.players.some(p => p !== h.player && p.alive && Math.hypot(p.pos.x - h.player.pos.x, p.pos.z - h.player.pos.z) <= 8)) local.support++;
    }),
  ];
  const api = {
    local(freeze = false) {
      if (frozen) return { ...frozen };
      const s = cleanReportStats({ ...h.stats, ...local });
      if (freeze) frozen = s;
      return { ...s };
    },
    accept(id, stats, complete = false) {
      if (final || !roster.has(id)) return false;
      const clean = cleanReportStats(stats), prev = submitted.get(id);
      // An older sample cannot roll counters back after a final sample.
      if (prev?.complete && !complete) return false;
      submitted.set(id, { stats: clean, complete: complete || !!prev?.complete });
      return true;
    },
    departed(id) { const p = roster.get(id); if (p) p.left = true; },
    snapshot(complete = false) {
      if (final) return final;
      api.accept(h.player.id, api.local(complete), complete);
      const report = {
        version: 1, complete,
        players: [...roster.values()].map(p => {
          const sample = submitted.get(p.id), a = metric(p.id), s = sample?.stats ?? cleanReportStats();
          return { ...p, ...s, ...cleanReportStats({ ...s, damage: a.damage, hits: a.hits }), breaks: a.breaks, stuns: a.stuns, glitchDmg: Math.min(s.glitchDmg, Math.floor(a.damage)), complete: !!sample?.complete };
        }),
        moments: h.teamplay?.summary() ?? [],
      };
      if (complete) final = report;
      return report;
    },
    receive(report) {
      if (!report || report.version !== 1 || !report.complete || !Array.isArray(report.players) || report.players.length > 6) return false;
      if (report.players.length !== roster.size || report.players.some(p => !p || !roster.has(p.id)) || new Set(report.players.map(p => p.id)).size !== report.players.length) return false;
      final = { version: 1, complete: true, players: report.players.map(p => ({ ...roster.get(p.id), name: String(p.name ?? roster.get(p.id).name).slice(0, 12), weapon: typeof p.weapon === 'string' ? p.weapon.slice(0, 12) : roster.get(p.id).weapon, ...cleanReportStats(p), breaks: Math.floor(Math.max(0, Math.min(1000, Number(p.breaks) || 0))), stuns: Math.floor(Math.max(0, Math.min(1000, Number(p.stuns) || 0))), complete: !!p.complete, left: !!p.left })), moments: (Array.isArray(report.moments) ? report.moments : []).filter(e => e && typeof e === 'object').slice(0, 12).map(e => ({ title: String(e.title ?? '').slice(0, 80), text: String(e.text ?? '').slice(0, 300), at: Number.isFinite(e.at) ? Math.max(0, e.at) : 0 })) };
      return true;
    },
    get final() { return final; },
    dispose() { offs.forEach(off => off()); },
  };
  return api;
}
