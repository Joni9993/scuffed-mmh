import { describe, it, expect, vi } from 'vitest';
import { Player } from '../../src/game/player.js';
import { ItemSystem } from '../../src/game/items.js';
import { Effects } from '../../src/game/effects.js';
import { HuntInventory } from '../../src/game/inventory.js';
import { createBus } from '../../src/core/events.js';
import { createInput } from '../../src/input/input.js';
import { createRng } from '../../src/core/rng.js';
import { applyLoadout } from '../../src/game/loadout.js';
import { inRuneAnchor, isSurveyed, itemPartMul, itemBuffText } from '../../src/game/itemBuffs.js';
import { windPush } from '../../src/game/world/turbinenWind.js';
import { ITEMS } from '../../src/data/items.js';

function setup(id, n = 1) {
  const h = { world: { heightAt: () => 0, collide() {} }, bus: createBus(), input: createInput(), rng: createRng(1), cameraYaw: 0,
    monsters: [], players: [], playerHit() {}, toast: vi.fn(), fx: { number: vi.fn(), spark() {}, shake() {}, flash() {}, glitch() {} } };
  const p = h.player = new Player({ ctx: h, weapon: 'gs' }); p.spawnAt(0, 0, 0); h.players.push(p);
  p.protect = 0;
  const inv = new HuntInventory({ brought: id ? [{ id, n }] : [] });
  const sys = new ItemSystem(h, p, inv);
  h.effects = new Effects(h); h.spawnEffect = (k, params) => h.effects.spawn(k, params);
  const use = () => { expect(sys.request()).toBe(true); sys.update(ITEMS[id].time + 0.01); };
  return { h, p, inv, sys, use };
}
const monster = (x = 0, extra = {}) => ({ alive: true, pos: { x, y: 0, z: 0 }, bodyRadius: 0,
  parts: [{ id: 'head', factor: 1, stunPart: true }], applyStatus: vi.fn(), applyDamage: vi.fn(), ...extra });

describe('crafted hunting tonics', () => {
  it('shell refreshes without stacking, expires, and survives gear reapplication without stat drift', () => {
    const { h, p, sys, use } = setup('muscheltrunk', 2);
    use(); expect(p.itemBuffs.shell.t).toBe(45);
    p.takeHit({ dmg: 20, knock: 'none', key: 'a' }); expect(p.v.hp).toBeCloseTo(83);
    use(); expect(p.itemBuffs.shell.reduction).toBe(.15); expect(p.itemBuffs.shell.t).toBe(45);
    applyLoadout(p, { weapon: { type: 'gs', tier: 1 }, armor: {}, food: null }, { reapply: true });
    expect(p.itemBuffs.shell.reduction).toBe(.15);
    expect(itemBuffText(p)).toContain('45s');
    sys.update(46); expect(p.itemBuffs.shell).toBeUndefined();
    p.v.hp = 100; p.takeHit({ dmg: 20, knock: 'none', key: 'b' }); expect(p.v.hp).toBe(80);
    h.effects.dispose(); sys.dispose();
  });

  it('shell, frost and armor multiply; percentage attacks still retain their fixed damage', () => {
    const { p, use } = setup('frostbrause');
    p.addStatus('burn'); use(); expect(p.status.burn).toBeUndefined();
    p.itemBuffs.shell = { t: 45, reduction: .15 };
    applyLoadout(p, { weapon: { type: 'gs', tier: 1 }, armor: { head: 'rathrun_head' }, food: null });
    // Compare against same armor without item bonuses to avoid coupling the test to armor values.
    const base = setup().p;
    applyLoadout(base, { weapon: { type: 'gs', tier: 1 }, armor: { head: 'rathrun_head' }, food: null });
    base.takeHit({ dmg: 20, element: 'fire', knock: 'none', key: 'base' });
    p.takeHit({ dmg: 20, element: 'fire', knock: 'none', key: 'fire' });
    expect(100 - p.v.hp).toBeCloseTo((100 - base.v.hp) * .85 * .75);
    p.v.hp = 100; p.takeHit({ dmgPct: .5, knock: 'none', key: 'pct' }); expect(p.v.hp).toBe(50);
  });

  it('Dschungelbrause cures poison and heals gradually; Kein Undo prevents both and consumes nothing', () => {
    const { p, sys, use, inv, h } = setup('dschungelbrause');
    p.v.hp = 20; p.addStatus('poison'); use();
    expect(p.v.hp).toBe(20); expect(p.status.poison).toBeUndefined(); expect(inv.count('dschungelbrause')).toBe(0);
    sys.update(1); expect(p.v.hp).toBeCloseTo(40); sys.update(2); expect(p.v.hp).toBeCloseTo(80);
    const b = setup('dschungelbrause'); b.h.mods = { player: { healItems: false } }; b.p.addStatus('poison');
    b.use(); expect(b.inv.count('dschungelbrause')).toBe(1); expect(b.p.status.poison).toBeTruthy();
    h.bus.emit('playerDown', { player: p }); expect(sys.heals).toHaveLength(0);
  });

  it('Splitterharz only increases part damage and is removed with other tonics on KO', () => {
    const { p, h, use } = setup('splitterharz'); use();
    expect(itemPartMul(p)).toBe(1.15); expect(p.dmgMul).toBe(1);
    h.bus.emit('playerDown', { player: p }); expect(itemPartMul(p)).toBe(1); expect(p.itemBuffs).toEqual({});
  });

  it('destillate cannot waste stock at full/active energy or on cooldown, including after KO and camp refill', () => {
    const { p, h, sys, inv, use } = setup('glitchdestillat');
    p.glitch.energy = 100; expect(sys.request()).toBe(false);
    p.glitch.energy = 50; p.glitch.active = true; expect(sys.request()).toBe(false);
    p.glitch.active = false; use(); expect(p.glitch.energy).toBe(75); expect(inv.count('glitchdestillat')).toBe(0);
    inv.add('glitchdestillat', 1); h.bus.emit('playerDown', { player: p });
    expect(sys.request()).toBe(false); expect(inv.count('glitchdestillat')).toBe(1);
    sys.update(60); expect(sys.request()).toBe(true);
    // A counter filled the meter during the drinking animation: recheck before consumption.
    p.glitch.energy = 100; sys.update(2); expect(inv.count('glitchdestillat')).toBe(1);
  });

  it('a hit cancels new items before application without consuming or granting the bonus', () => {
    const { p, sys, inv } = setup('muscheltrunk'); sys.request(); sys.update(.1);
    p.takeHit({ dmg: 5, knock: 'flinch', key: 'cancel' }); sys.update(.1);
    expect(inv.count('muscheltrunk')).toBe(1); expect(p.itemBuffs.shell).toBeUndefined();
  });
});

describe('crafted world tools', () => {
  it.each([true, false])('venom lands once and only authority applies 60 buildup (host=%s)', (host) => {
    const { h, p, use } = setup('giftbombe'); h.net = { isHost: host };
    const m = monster(0); m.pos.z = 6; h.monsters = [m, monster(90), monster(0, { invulnerable: true })];
    use(); h.effects.update(.61); h.effects.update(.61);
    expect(m.applyStatus).toHaveBeenCalledTimes(host ? 1 : 0);
    if (host) expect(m.applyStatus).toHaveBeenCalledWith('poison', { buildup: 60 });
    expect(h.effects.list).toHaveLength(0); expect(p.itemBuffs).toEqual({});
  });

  it.each([true, false])('heavy bomb has 3.5s fuse and resolves one host hit (host=%s)', (host) => {
    const { h, use } = setup('donnerknallgurke'); h.net = { isHost: host }; const m = monster(); h.monsters = [m];
    use(); h.effects.update(3.49); expect(m.applyDamage).not.toHaveBeenCalled();
    h.effects.update(.02); h.effects.update(1);
    expect(m.applyDamage).toHaveBeenCalledTimes(host ? 1 : 0);
    if (host) expect(m.applyDamage.mock.calls[0][0]).toMatchObject({ dmg: 260, blunt: 60, attackerId: h.player.id });
  });

  it('runefield protects wind/light flinch but still takes damage and heavy knockdown; expiry/disposal remove protection', () => {
    const { h, p, use } = setup('runenanker'); use();
    expect(inRuneAnchor(p)).toBe(true);
    expect(windPush({ gust: 1, dx: 1, dz: 0 }, p, () => 4)).toBeNull();
    p.takeHit({ dmg: 10, knock: 'flinch', key: 'small' }); expect(p.state).toBe('free'); expect(p.v.hp).toBe(90);
    expect(p.takeHit({ dmg: 0, knock: 'push', key: 'wind' })).toBe('ignored'); expect(p.pushT).toBe(0);
    p.takeHit({ dmg: 10, knock: 'down', key: 'big' }); expect(p.state).toBe('down');
    p.pos.x = 10; expect(inRuneAnchor(p)).toBe(false); p.pos.x = 0;
    h.effects.update(18.01); expect(inRuneAnchor(p)).toBe(false); expect(h.runeZones).toHaveLength(0);
    h.effects.spawn('runeanchor', { pos: { x: 0, y: 0, z: 0 }, owner: p.id });
    h.effects.dispose(); expect(inRuneAnchor(p)).toBe(false);
  });

  it('survey beacon tracks nearby bosses for 20s without permanent discovery, rejects minors and distant bosses', () => {
    const { h, use } = setup('leuchtsignal'); const near = monster(20), far = monster(80), minor = monster(20, { minor: true });
    use(); h.effects.update(.61);
    expect(isSurveyed(near, h)).toBe(true); expect(isSurveyed(far, h)).toBe(false); expect(isSurveyed(minor, h)).toBe(false);
    expect(near.discovered).toBeUndefined(); near.pos.x = 80; expect(isSurveyed(near, h)).toBe(false);
    h.effects.update(20.1); expect(h.surveyZones).toHaveLength(0);
  });

  it('replacing an owner beacon never stacks zones and keeps other players’ fields', () => {
    const { h } = setup();
    for (const owner of ['a', 'b', 'a']) h.effects.spawn('runeanchor', { pos: { x: 0, y: 0, z: 0 }, owner });
    h.effects.update(.01); expect(h.runeZones).toHaveLength(2);
    expect(h.runeZones.every((z) => z.active)).toBe(true);
  });
});
