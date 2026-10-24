import { ITEMS } from '../data/items.js';
import { WEAPON_TYPES } from '../data/weapons.js';
import { monsters as MONSTERS } from '../game/monsters/index.js';

const KEY = 'glitchhunter.hunt-checkpoint.v1';
const clone = value => { const ancestors = []; return JSON.parse(JSON.stringify(value, function (k, v) {
  if (['mesh', 'gmesh', 'material', 'mat', 'parent', 'ownerRef', 'node'].includes(k)) return undefined;
  if (v?.isObject3D || v?.isMaterial || v?.isTexture || v?.sph && v?.elem || k === 'ctx' || v?.ctx && v?.pos) return undefined;
  if (v instanceof Set) return { $set: [...v] };
  if (v instanceof Map) return { $map: [...v] };
  if (v && typeof v === 'object') {
    while (ancestors.length && ancestors.at(-1) !== this) ancestors.pop();
    if (ancestors.includes(v)) return undefined;
    ancestors.push(v);
  }
  return v;
})); };
const revive = value => JSON.parse(JSON.stringify(value), (k, v) => v?.$set ? new Set(v.$set) : v?.$map ? new Map(v.$map) : v);
const mapItems = (v, signed = false) => Object.fromEntries(Object.entries(v ?? {}).filter(([id, n]) => ITEMS[id] && Number.isFinite(n)).map(([id, n]) => [id, Math.max(signed ? -999 : 0, Math.min(999, Math.floor(n)))]));
export function loadCheckpoint(round, id) { try { const d = JSON.parse(globalThis.sessionStorage?.getItem(KEY) || 'null'); return d?.round === round && d?.id === id ? d : null; } catch { return null; } }
export function saveCheckpoint(d) { try { globalThis.sessionStorage?.setItem(KEY, JSON.stringify(d)); } catch { /* same-tab state remains available */ } }
export function clearCheckpoint(round) { try { if (JSON.parse(globalThis.sessionStorage?.getItem(KEY) || 'null')?.round === round) globalThis.sessionStorage.removeItem(KEY); } catch { /* unavailable */ } }
export function capturePersonal(h, round, seq) {
  const p = h.player, inv = h.inventory, meta = h.meta;
  return clone({ version: 1, round, id: p.id, seq, at: h.time, stats: h.stats, localReport: h.report?.local(), loadout: h.loadout, v: p.v, state: p.state, stateT: p.stateT, glitch: p.glitch, status: p.status, buffs: p.buffs, itemBuffs: p.itemBuffs, weapon: { wucht: p.weapon.wucht, data: p.weapon.data }, ammoTip: p.ammoTip,
    runtime: { koCount: p.koCount, grillHp: p.grillHp, grillStamina: p.grillStamina, grillCount: p.grillCount, voltCharge: p.voltCharge, glitchCd: p.glitchCd, perfectKeys: [...p.perfectKeys].slice(-128) },
    inventory: { free: inv.free, loot: inv.loot, brought: inv.brought, brought0: inv.brought0, carved: inv.carved, bar: inv.bar, sel: inv.sel },
    chest: { delta: meta.chest.delta, weapon: meta.chest.weapon, armor: meta.chest.armor, gearChanged: meta.chest.gearChanged },
    items: { heals: meta.items.heals, buffs: meta.items.buffs, glitchCooldown: meta.items.glitchCooldown, using: meta.items.using ? { ...meta.items.using, def: undefined } : null },
    meta: { carveCount: meta.carveCount, foodLost: meta.foodLost, rng: meta.rng.state(), corpses: meta.corpses.map(c => ({ id: c.monster.id, tail: c.tail, fauna: c.fauna, dropId: c.dropId, left: c.left, pos: { x: c.pos.x, y: c.pos.y, z: c.pos.z } })) } });
}
export function validPersonal(d, round, id) { return !!d && d.version === 1 && d.round === round && d.id === id && Number.isSafeInteger(d.seq) && d.seq >= 0 && !!WEAPON_TYPES[d.loadout?.weapon?.type] && !!d.inventory && !!d.v && Number.isFinite(d.v.hp) && Number.isFinite(d.v.stamina); }
export function restorePersonal(h, d) {
  if (!validPersonal(d, h.net.net.roundId, h.player.id)) return false;
  const p = h.player, meta = h.meta, inv = h.inventory;
  meta.foodLost = !!d.meta?.foodLost;
  for (const k of ['koCount', 'grillHp', 'grillStamina', 'grillCount', 'glitchCd']) if (Number.isFinite(d.runtime?.[k])) p[k] = d.runtime[k];
  p.voltCharge = d.runtime?.voltCharge; p.perfectKeys = new Set(d.runtime?.perfectKeys ?? []);
  meta.applyGear(d.loadout);
  for (const k of ['hp', 'bruise', 'stamina', 'exhaust', 'sinceHit', 'sinceSpend', 'costMul']) if (Number.isFinite(d.v[k])) p.v[k] = d.v[k];
  p.v.hp = Math.max(0, Math.min(p.v.maxHp, p.v.hp)); p.v.stamina = Math.max(0, Math.min(p.v.maxStamina, p.v.stamina));
  p.state = d.state === 'ko' ? 'ko' : 'free'; p.stateT = Number(d.stateT) || 0; p.weapon.cancel(); p.lock = null;
  p.glitch = { ...p.glitch, ...d.glitch }; p.status = d.status ?? {}; p.buffs = d.buffs ?? {}; p.itemBuffs = d.itemBuffs ?? {};
  const elapsed = Math.max(0, h.time - (d.at ?? h.time));
  if (p.glitch.active) { p.glitch.t = Math.max(0, p.glitch.t - elapsed); if (!p.glitch.t) { p.glitch.active = false; p.glitch.energy = 0; } }
  for (const group of [p.status, p.buffs, p.itemBuffs]) for (const [key, value] of Object.entries(group)) if (Number.isFinite(value?.t)) { value.t -= elapsed; if (value.t <= 0) delete group[key]; }
  p.weapon.data = d.weapon?.data ?? {}; p.weapon.wucht = Math.max(0, Math.min(100, Number(d.weapon?.wucht) || 0)); p.ammoTip = d.ammoTip ?? null;
  for (const key of ['free', 'loot', 'brought', 'brought0', 'carved']) inv[key] = mapItems(d.inventory[key]);
  inv.bar = (d.inventory.bar ?? []).filter(id => ITEMS[id]).slice(0, 8); inv.sel = Math.max(0, Math.min(inv.bar.length - 1, Number(d.inventory.sel) || 0));
  meta.chest.delta = mapItems(d.chest?.delta, true); meta.chest.weapon = d.chest?.weapon ?? meta.chest.weapon; meta.chest.armor = d.chest?.armor ?? meta.chest.armor; meta.chest.gearChanged = !!d.chest?.gearChanged;
  h.stats = { ...h.stats, ...d.stats }; meta.carveCount = Math.max(0, Number(d.meta?.carveCount) || 0); meta.foodLost = !!d.meta?.foodLost; meta.rng.restore(d.meta?.rng);
  h.report?.restoreLocal(d.localReport ?? {});
  meta.items.heals = d.items?.heals ?? []; meta.items.buffs = d.items?.buffs ?? []; meta.items.glitchCooldown = Number(d.items?.glitchCooldown) || 0;
  p.itemUse = meta.items.using = d.items?.using && ITEMS[d.items.using.id] ? { ...d.items.using, def: ITEMS[d.items.using.id] } : null;
  for (const c of d.meta?.corpses ?? []) { const old = meta.corpses.find(old => old.monster.id === c.id && !!old.tail === !!c.tail); if (old) old.left = c.left; }
  return true;
}

const MONSTER_FIELDS = ['time', 'stateT', 'hp', 'maxHp', 'coopMul', 'phase', 'rage', 'rageT', 'rageUsed', 'discovered', 'air', 'stunT', 'stagT', 'tired', 'deadFor', 'burrowed', 'fleeing', 'fleeUsed', 'fleeT', 'gockelForm', 'formTime', 'eyeShield', 'shieldIdx', 'seamCooldown', 'pressure', 'overheat', 'armor', 'exposedT', '_exposedT'];
export function captureHunt(h) {
  return clone({ version: 1, stamp: performance.now() / 1000, time: h.time, timeLeft: h.timeLeft, teamKo: h.teamKo, result: h.result, reason: h.reason, winTimer: h.winTimer, roster: h.report?.roster() ?? [], report: h.report?.final,
    monsters: h.monsters.map(m => ({ id: m.id, def: m.def.id, home: m.home, pos: { x: m.pos.x, y: m.pos.y, z: m.pos.z }, rot: m.rot, state: m.state, values: Object.fromEntries(MONSTER_FIELDS.filter(k => m[k] !== undefined).map(k => [k, m[k]])), st: m.st,
      parts: m.parts.map(p => ({ id: p.id, hp: Number.isFinite(p.hp) ? p.hp : null, breakHp: p.breakHp, broken: p.broken, factor: p.factor })),
      extra: m.def.snapExtra?.(m), hazards: Object.fromEntries(['pools', 'slimes', 'hazards', 'pillars', 'volt'].filter(k => m.extra?.[k]).map(k => [k, m.extra[k]])),
      attack: m.attack ? { params: m.attack.inst.params, t: m.attack.t } : null, projectiles: m.projectiles?.list.map(p => ({ def: p.def, age: p.age, hit: [...p.hit] })) ?? [] })),
    gather: (h.world.gatherPoints ?? []).map(p => ({ id: p.id, uses: p.usesLeft })), interact: h.interact.state(), effects: h.effects.snapshot(), zones: h.groundingZones,
    meta: { phase: h.meta.phase, carveT: h.meta.carveT, endT: h.meta.endT, breaks: h.meta.breaks, corpses: h.meta.corpses.map(c => ({ id: c.monster.id, tail: !!c.tail, fauna: !!c.fauna, dropId: c.dropId, pos: { x: c.pos.x, y: c.pos.y, z: c.pos.z } })) },
  });
}
export function validHuntSnapshot(d) {
  return d?.version === 1 && Number.isFinite(d.time) && Number.isFinite(d.timeLeft) && Number.isInteger(d.teamKo) && d.teamKo >= 0 && d.teamKo <= 3 && Array.isArray(d.monsters) && d.monsters.length <= 256 && d.monsters.every(m => typeof m.id === 'string' && MONSTERS[m.def] && Array.isArray(m.parts) && Array.isArray(m.projectiles) && Number.isFinite(m.pos?.x) && Number.isFinite(m.pos?.z) && Number.isFinite(m.values?.hp) && Number.isFinite(m.values?.maxHp));
}
export function restoreHunt(h, data) {
  if (!validHuntSnapshot(data)) return false;
  const d = revive(data);
  const wanted = new Set(d.monsters.map(m => m.id));
  for (const m of [...h.monsters]) if (!wanted.has(m.id)) { h.scene.remove(m.mesh, m.shadow); m.projectiles?.clear(); h.monsters.splice(h.monsters.indexOf(m), 1); }
  h.time = d.time; h.timeLeft = d.timeLeft; h.teamKo = d.teamKo; h.winTimer = d.winTimer ?? 0;
  for (const state of d.monsters) {
    const m = h.monsters.find(m => m.id === state.id) ?? h.spawnMonster(state.def, { id: state.id, x: state.pos.x, z: state.pos.z, state: 'wander' });
    const previousForm = m.gockelForm;
    m.authority = false; Object.assign(m, state.values); m.pos.set(state.pos.x, state.pos.y, state.pos.z); m.rot = state.rot; m.st = { ...m.st, ...state.st }; m.home = state.home ?? m.home;
    for (const p of state.parts) { const part = m.partById[p.id]; if (!part) continue; const was = part.broken; Object.assign(part, { ...p, hp: p.hp === null ? Infinity : p.hp }); if (part.broken && !was) m.def.onBreak?.(m, part); }
    if (state.extra) {
      if (m.def.applySnapExtra) { if (m.def.id === 'gockelok') m.gockelForm = previousForm; m.def.applySnapExtra(m, state.extra); }
      else Object.assign(m, state.extra);
    }
    for (const [key, value] of Object.entries(state.hazards ?? {})) {
      for (const old of Array.isArray(m.extra[key]) ? m.extra[key] : []) { old.mesh?.removeFromParent(); old.gmesh?.removeFromParent(); }
      if (value && !Array.isArray(value) && m.extra[key]) Object.assign(m.extra[key], value);
      else m.extra[key] = value;
    }
    m.state = state.state; m.attack = null;
    if (state.attack && m.alive) {
      const inst = m.startAttack(state.attack.params, state.attack.t);
      if (inst) { const tau = inst.tau(state.attack.t); for (const event of inst.def.events ?? []) if (event.t <= tau) inst.firedEvents.add(event); m.attack.key = Math.round(state.attack.params.t0 * 1000) + 1; m.attack.netT = d.stamp; }
    }
    m.projectiles.clear(); for (const p of state.projectiles) { const projectile = m.projectiles.spawn(p.def, p.age); projectile.hit = new Set(p.hit); }
    m.sync?.();
  }
  h.mainMonster = h.monsters.find(m => m.id === h.quest.monster) ?? h.mainMonster;
  h.bosses = h.monsters.filter(m => !m.minor && !m.def.neutral);
  for (const g of d.gather ?? []) h.world.setGatherState?.(g.id, g.uses);
  h.interact.applyState(d.interact); h.effects.restore(d.effects); h.groundingZones = d.zones ?? [];
  h.meta.breaks = d.meta?.breaks ?? []; for (const p of d.roster ?? []) h.report?.add(p);
  if (d.report) h.report?.receive(d.report);
  // Rebuild corpses without replaying past break/death rewards or awarding fresh Glitch energy.
  for (const c of d.meta?.corpses ?? []) {
    const monster = h.monsters.find(m => m.id === c.id);
    if (monster && !h.meta.corpses.some(old => old.monster.id === c.id && !!old.tail === !!c.tail)) h.meta.corpses.push({ ...c, monster, left: c.tail || c.fauna ? 1 : 3 });
  }
  return true;
}
