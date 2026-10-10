import { describe, it, expect } from 'vitest';
import { make, DT } from './p3helpers.js';
import { jaggo } from '../../src/game/monsters/jaggo.js';
import { createInteractables, IA, LABELS } from '../../src/game/world/interactables.js';

const defs = () => [
  { id: 'valve1', type: 'valve', x: 0, z: 0, yaw: 0, zone: 2 },
  { id: 'crane1', type: 'crane', x: 20, z: 0, yaw: 0, zone: 1, dropAt: { x: 20, z: 6 } },
  { id: 'rod1', type: 'rod', x: -20, z: 0, yaw: 0, zone: 4 },
];

/** Mini-Hunt um das p3helpers-ctx: world.interactables selbst gesetzt (Arena). */
function setup(opts = {}) {
  const { ctx, m, p } = make(jaggo, 'combat', 0, 0);
  const hunt = Object.assign(ctx, { player: p, contextLabel: null, scene: null, net: opts.net ?? null, time: 0 });
  hunt.world.interactables = defs();
  hunt.interact = createInteractables(hunt);
  return { hunt, m, p };
}
const run = (hunt, secs) => { for (let i = 0; i < Math.round(secs / DT); i++) { hunt.monsters.forEach((m) => m.alive && m.update(DT)); hunt.interact.update(DT); } };

describe('Dampfventil', () => {
  it('Kontext-Label + Kegel: Brocken 150 Schaden + Verbruht, Pirscher im Kegel 15, Abklingzeit 90 s', () => {
    const { hunt, m, p } = setup();
    p.spawnAt(0.5, 0.5, 0);
    hunt.interact.update(DT);
    expect(hunt.contextLabel).toBe(LABELS.valve);
    m.pos.set(0, 0, 4); m.target = null;
    const hp = m.hp, php = p.v.hp;
    expect(hunt.interact.onContext(p, 'press')).toBe(true);
    run(hunt, 0.2);
    expect(m.hp).toBe(hp - IA.VALVE.dmg);
    expect(m.st.scaldT).toBeGreaterThan(9);
    expect(php - p.v.hp).toBeGreaterThan(0);
    run(hunt, 3);
    expect(m.hp).toBe(hp - IA.VALVE.dmg); // nur einmal pro Auslosung
    // CD
    expect(hunt.interact.use(p, 'valve1')).toBe(false);
    for (let i = 0; i < 80 / DT; i++) hunt.interact.update(DT);
    expect(hunt.interact.use(p, 'valve1')).toBe(false);
    for (let i = 0; i < 12 / DT; i++) hunt.interact.update(DT);
    expect(hunt.interact.use(p, 'valve1')).toBe(true);
  });
  it('Brocken ausserhalb des Kegels (hinten / zu weit) bleibt unverletzt', () => {
    const { hunt, m, p } = setup();
    p.spawnAt(0.5, 0.5, 0);
    m.pos.set(0, 0, -4);
    hunt.interact.use(p, 'valve1'); run(hunt, 3.5);
    expect(m.hp).toBe(m.maxHp);
    const { hunt: h2, m: m2, p: p2 } = setup();
    p2.spawnAt(0.5, 0.5, 0); m2.pos.set(0, 0, 14);
    h2.interact.use(p2, 'valve1'); run(h2, 3.5);
    expect(m2.hp).toBe(m2.maxHp);
  });
});

describe('Schrottkran', () => {
  it('Seil kappen: nach 1 s 400 Schaden + 5 s Betaeubung auf dem Kreis, auch eingegraben; 1x pro Jagd', () => {
    const { hunt, m, p } = setup();
    p.spawnAt(20.5, 0.5, 0);
    hunt.interact.update(DT);
    expect(hunt.contextLabel).toBe(LABELS.crane);
    m.pos.set(20, 0, 6); m.burrowed = true;
    const hp = m.hp;
    expect(hunt.interact.onContext(p, 'press')).toBe(true);
    run(hunt, 0.8);
    expect(m.hp).toBe(hp);
    run(hunt, 0.4);
    expect(m.hp).toBe(hp - IA.CRANE.dmg);
    expect(m.stunT).toBeGreaterThan(4);
    expect(hunt.interact.use(p, 'crane1')).toBe(false);
    expect(hunt.interact.byId('crane1').used).toBe(true);
  });
  it('Brocken ausserhalb des Kreises bleibt heil', () => {
    const { hunt, m, p } = setup();
    p.spawnAt(20.5, 0.5, 0); m.pos.set(20, 0, 14);
    hunt.interact.use(p, 'crane1'); run(hunt, 1.5);
    expect(m.hp).toBe(m.maxHp);
  });
});

describe('Blitzableiter', () => {
  it('3x damageRod zerstoert, rods() listet nur aktive, Bus rodDestroyed', () => {
    const { hunt } = setup();
    expect(hunt.interact.rods().map((r) => r.id)).toEqual(['rod1']);
    hunt.interact.damageRod('rod1', 1); hunt.interact.damageRod('rod1', 1);
    expect(hunt.interact.rods().length).toBe(1);
    hunt.interact.damageRod('rod1', 1);
    expect(hunt.interact.rods().length).toBe(0);
    expect(hunt.events).toContain('rodDestroyed');
  });
  it('3x Kontext (Umwerfen) zerstoert; destroyRod direkt', () => {
    const { hunt, p } = setup();
    p.spawnAt(-19.5, 0.5, 0);
    hunt.interact.update(DT);
    expect(hunt.contextLabel).toBe(LABELS.rod);
    for (let i = 0; i < 3; i++) hunt.interact.onContext(p, 'press');
    expect(hunt.interact.rods().length).toBe(0);
    const s2 = setup();
    expect(s2.hunt.interact.destroyRod('rod1')).toBe(true);
    expect(s2.hunt.interact.destroyRod('rod1')).toBe(false);
  });
  it('3 Schlaege in Reichweite zaehlen', () => {
    const { hunt, p } = setup();
    p.spawnAt(-19.5, 0.5, 0);
    let n = 0;
    p.weapon.pose = () => ({ name: 'swing' + (n % 2), t: 0.1 });
    for (let i = 0; i < 3; i++) { n++; hunt.interact.update(DT); }
    expect(hunt.interact.rods().length).toBe(0);
  });
});

describe('Host/Gast-Wunschpfad', () => {
  function pair() {
    const host = setup({ net: { isHost: true, isGuest: false } });
    const guest = setup({ net: { isHost: false, isGuest: true } });
    const toGuest = [], toHost = [];
    host.hunt.net.sendIa = (d) => toGuest.push(d);
    guest.hunt.net.sendIa = (d) => toHost.push(d);
    // Gast-Pirscher steht beim Host (Fernspieler p2) neben dem Ventil
    host.hunt.players.push({ id: 'p2', pos: { x: 0.5, y: 0, z: 0.5 }, alive: true });
    const flush = () => { while (toGuest.length || toHost.length) { while (toGuest.length) guest.hunt.interact.onNet(toGuest.shift(), 'host'); while (toHost.length) host.hunt.interact.onNet(toHost.shift(), 'p2'); } };
    return { host, guest, flush, toGuest, toHost };
  }
  it('Gast sendet Wunsch, Host fuehrt aus + broadcastet, Gast spielt nach (Kran/Ventil)', () => {
    const { host, guest, flush, toHost } = pair();
    guest.p.spawnAt(0.5, 0.5, 0);
    host.p.spawnAt(40, 40, 0); // Host-Pirscher weit weg
    host.m.pos.set(0, 0, 4); host.m.target = null;
    expect(guest.hunt.interact.use(guest.p, 'valve1')).toBe(true);
    expect(toHost[0]).toEqual({ a: 'use', id: 'valve1' });
    expect(guest.hunt.interact.byId('valve1').cd).toBe(0); // Gast aendert nichts selbst
    flush();
    expect(host.hunt.interact.byId('valve1').cd).toBeGreaterThan(80);
    expect(guest.hunt.interact.byId('valve1').cd).toBeGreaterThan(80); // 'fire' angekommen
    run(host.hunt, 0.3);
    expect(host.m.hp).toBe(host.m.maxHp - IA.VALVE.dmg); // Schaden nur beim Host
    run(guest.hunt, 0.3);
    expect(guest.m.hp).toBe(guest.m.maxHp);
  });
  it('Gast-Wunsch mit zu grosser Distanz wird abgelehnt; Zustand kommt per full nach (Join)', () => {
    const { host, guest, flush, toGuest } = pair();
    host.hunt.players[host.hunt.players.length - 1].pos.x = 30;
    guest.hunt.interact.use(guest.p, 'valve1'); flush();
    expect(host.hunt.interact.byId('valve1').cd).toBe(0);
    // Host zerstoert Ableiter + nutzt Kran, spaeter Beitretender bekommt den Zustand
    host.hunt.interact.destroyRod('rod1');
    host.hunt.interact.use(host.p, 'crane1'); // Host-Pirscher steht bei (0,0): zu weit weg -> false
    host.hunt.interact.byId('crane1').used = true;
    toGuest.length = 0;
    host.hunt.interact.update(IA.FULL_EVERY + 0.1);
    const full = toGuest.find((d) => d.a === 'full');
    expect(full).toBeTruthy();
    flush();
    expect(guest.hunt.interact.rods().length).toBe(0);
    expect(guest.hunt.interact.byId('crane1').used).toBe(true);
  });
  it('Gast-Rod-Wunsch (3 Treffer) zerstoert beim Host und wird gespiegelt', () => {
    const { host, guest, flush } = pair();
    host.hunt.players[host.hunt.players.length - 1].pos.x = -19.5;
    for (let i = 0; i < 3; i++) { guest.hunt.interact.damageRod('rod1', 1); flush(); }
    expect(host.hunt.interact.rods().length).toBe(0);
    expect(guest.hunt.interact.rods().length).toBe(0);
  });
});
