// Rostwerke: Umgebung als Waffe (GDD 15.2). hunt.interact = createInteractables(hunt).
// Dampfventil (Kegel 6 m, 3 s), Schrottkran (Last auf Kreis r=3,5, 1x pro Jagd), Blitzableiter (3 Treffer -> zerstoert).
// Host-autoritativ: Gaeste schicken den Wunsch (net.sendIa({a:'use'|'rod', id})), der Host fuehrt aus und broadcastet
// ({a:'fire'|'cut'|'rod'|'full'}); jeder Client spielt die Optik, Pirscher-Schaden trifft nur den LOKALEN Pirscher (wie Brocken-Angriffe),
// Brocken-Schaden nur der Host. Zustand wird vom Host periodisch ('full', ~2 s) und bei Aenderung nachgezogen (Join mitten in der Jagd).
import * as THREE from 'three';

export const IA = {
  RANGE: 2.6,           // Kontext-Reichweite (m)
  VALVE: { cone: 6, half: 35 * Math.PI / 180, dur: 3, cd: 90, dmg: 150, pdmg: 15, scald: 10 },
  CRANE: { delay: 1, r: 3.5, dmg: 400, stun: 5 },
  ROD: { hits: 3, swingRange: 3.2 },
  FULL_EVERY: 2,        // s: Host -> Gaeste kompletter Zustand
};
export const LABELS = { valve: 'Ventil aufdrehen', crane: 'Seil kappen', rod: 'Umwerfen' };
const TYPES = new Set(['valve', 'crane', 'rod']);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Monster-Treffer ohne Teil (Umgebungsschaden, zaehlt nicht als Bedrohung). */
function envHit(dmg) {
  return { dmg, elemDmg: 0, crit: false, weak: false, zone: 1, blunt: 0, stunEligible: false, wucht: 0, partId: null, hitstop: 0, shake: 0, env: true, attackerId: 'env' };
}

export function createInteractables(hunt) {
  const group = new THREE.Group();
  group.name = 'interactables';
  hunt.scene?.add(group);
  let src = null;           // world.interactables, die zuletzt gebaut wurden
  let items = [];
  const steams = [];        // aktive Dampfsaeulen { it, t, hit:Set }
  const drops = [];         // fallende Lasten { it, t }
  let fullT = 0, time = 0;
  const swing = { name: null, t: 0 };

  const isHost = () => !hunt.net || hunt.net.isHost;
  const isGuest = () => !!hunt.net?.isGuest;
  const sendIa = (d) => hunt.net?.sendIa?.(d);

  // ------------------------------------------------------------ Aufbau
  function mk(def) {
    const it = {
      id: def.id, type: def.type, x: def.x, z: def.z, yaw: def.yaw ?? 0, zone: def.zone ?? 0, dropAt: def.dropAt ?? null,
      y: hunt.world?.heightAt?.(def.x, def.z) ?? 0,
      cd: 0, burning: 0,          // Ventil
      used: false,                // Kran
      hits: 0, alive: true,       // Blitzableiter
      mesh: null, glow: null, ring: null,
    };
    buildMesh(it);
    return it;
  }
  function buildMesh(it) {
    const g = new THREE.Group();
    g.position.set(it.x, it.y, it.z);
    g.rotation.y = it.yaw;
    const metal = new THREE.MeshLambertMaterial({ color: 0x6a5a4a });
    const glowCol = it.type === 'valve' ? 0xffe14d : it.type === 'crane' ? 0xff5a3a : 0x5ad8ff;
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 5, 8, 1, true), new THREE.MeshBasicMaterial({ color: glowCol, transparent: true, opacity: 0.25, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    glow.position.y = 2.5;
    if (it.type === 'valve') {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.3, 8), metal); pipe.position.y = 0.65;
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 5, 10), new THREE.MeshLambertMaterial({ color: 0xc83a2a })); wheel.position.y = 1.45; wheel.rotation.x = Math.PI / 2;
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.8, 8), metal); nozzle.rotation.x = Math.PI / 2; nozzle.position.set(0, 0.8, 0.5);
      g.add(pipe, wheel, nozzle);
      it.wheel = wheel;
      const r = Math.tan(IA.VALVE.half) * IA.VALVE.cone; // Dampfkegel, nur waehrend des Ausstosses sichtbar
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, IA.VALVE.cone, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xe8f0f0, transparent: true, opacity: 0.4, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      cone.rotation.x = Math.PI / 2; cone.position.set(0, 0.8, IA.VALVE.cone / 2); cone.visible = false;
      g.add(cone); it.cone = cone;
    } else if (it.type === 'crane') {
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), metal); mast.position.y = 3;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 5), metal); arm.position.set(0, 6, 2);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 4), new THREE.MeshLambertMaterial({ color: 0x2a2018 })); rope.position.set(0, 4.4, 4);
      g.add(mast, arm, rope);
      it.rope = rope;
    } else {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 5.5, 6), metal); pole.position.y = 2.75;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, fog: false })); tip.position.y = 5.6;
      g.add(pole, tip);
      it.pole = pole;
    }
    g.add(glow);
    it.glow = glow; it.mesh = g;
    group.add(g);
    if (it.type === 'crane' && it.dropAt) { // markierter Lastkreis, sichtbar bis die Last gefallen ist
      const ring = new THREE.Mesh(new THREE.RingGeometry(IA.CRANE.r - 0.25, IA.CRANE.r, 24), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.6, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(it.dropAt.x, (hunt.world?.heightAt?.(it.dropAt.x, it.dropAt.z) ?? 0) + 0.12, it.dropAt.z);
      group.add(ring); it.ring = ring;
    }
  }
  function clearItems() {
    for (const it of items) { if (it.mesh) group.remove(it.mesh); if (it.ring) group.remove(it.ring); }
    items = []; steams.length = 0; drops.length = 0;
  }
  function rebuild() {
    clearItems();
    src = hunt.world?.interactables ?? null;
    for (const d of src ?? []) if (d && TYPES.has(d.type)) items.push(mk(d));
  }
  const byId = (id) => items.find((i) => i.id === id) ?? null;
  const sync = () => { if ((hunt.world?.interactables ?? null) !== src) rebuild(); };

  // ------------------------------------------------------------ Regeln (Host / Solo)
  const usable = (it) => (it.type === 'valve' ? it.cd <= 0 : it.type === 'crane' ? !it.used : it.alive);

  /** Ein Pirscher benutzt eine Stelle (Kontext-Taste). Solo/Host fuehren aus, Gaeste schicken den Wunsch. true = Eingabe verbraucht. */
  function use(player, id) {
    sync();
    const it = byId(id);
    if (!it || !usable(it)) return false;
    if (player && player.alive === false) return false;
    if (isGuest()) { sendIa({ a: 'use', id }); return true; }
    return exec(it, player);
  }
  function exec(it, player) {
    if (!usable(it)) return false;
    if (player && flat(player.pos, it) > IA.RANGE + 2) return false; // Host prueft die Distanz (Gast-Wunsch)
    if (it.type === 'valve') { startValve(it); sendIa({ a: 'fire', id: it.id }); }
    else if (it.type === 'crane') { startCrane(it); sendIa({ a: 'cut', id: it.id }); }
    else damageRod(it.id, 1, true);
    return true;
  }

  function startValve(it) {
    it.cd = IA.VALVE.cd; it.burning = IA.VALVE.dur;
    steams.push({ it, t: 0, hit: new Set() });
    hunt.bus?.emit('sfx', { name: 'heavy', pos: { x: it.x, y: it.y, z: it.z } });
    hunt.bus?.emit('valveBurst', { id: it.id, x: it.x, z: it.z });
  }
  function startCrane(it) {
    it.used = true;
    hunt.fx?.spark?.({ x: it.x, y: it.y + 4.4, z: it.z }, 10, '#ffd060', 3);
    hunt.bus?.emit('sfx', { name: 'break', pos: { x: it.x, y: it.y, z: it.z } });
    drops.push({ it, t: 0 });
  }
  function coneHit(it, pt, extra = 0) {
    const dx = pt.x - it.x, dz = pt.z - it.z, d = Math.hypot(dx, dz);
    if (d > IA.VALVE.cone + extra) return false;
    if (d < 1) return true;
    let da = Math.atan2(dx, dz) - it.yaw;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    return Math.abs(da) <= IA.VALVE.half + (extra ? Math.atan2(extra, d) : 0);
  }
  function tickSteam(s, dt) {
    const it = s.it;
    s.t += dt;
    if (hunt.fx?.spark && Math.random() < dt * 40) {
      const d = 0.5 + Math.random() * IA.VALVE.cone, a = it.yaw + (Math.random() - 0.5) * IA.VALVE.half * 1.6;
      hunt.fx.spark({ x: it.x + Math.sin(a) * d, y: it.y + 0.8 + Math.random() * 1.2, z: it.z + Math.cos(a) * d }, 1, '#e8f0f0', 1.2);
    }
    if (isHost()) {
      for (const m of hunt.monsters ?? []) {
        if (!m.alive || s.hit.has(m.id)) continue;
        if (!coneHit(it, m.pos, (m.bodyRadius ?? 0) * 0.8)) continue;
        s.hit.add(m.id);
        m.applyDamage(envHit(IA.VALVE.dmg));
        m.applyStatus?.('scald', { t: IA.VALVE.scald });
        hunt.fx?.number?.({ x: m.pos.x, y: m.pos.y + 2.5, z: m.pos.z }, IA.VALVE.dmg, 'crit');
      }
    }
    const lp = hunt.player; // jeder Client verletzt nur seinen eigenen Pirscher
    if (lp && lp.alive !== false && !s.hit.has('me') && coneHit(it, lp.pos)) {
      s.hit.add('me');
      lp.takeHit?.({ dmg: IA.VALVE.pdmg, knock: 'none', sourcePos: { x: it.x, z: it.z }, key: `valve:${it.id}:${Math.floor(time)}`, attackId: 'dampfventil' });
    }
  }
  function landLoad(it) {
    const at = it.dropAt ?? { x: it.x, z: it.z };
    hunt.fx?.spark?.({ x: at.x, y: (hunt.world?.heightAt?.(at.x, at.z) ?? 0) + 0.5, z: at.z }, 40, '#c8b090', 8);
    hunt.fx?.shake?.(0.5, 0.4);
    hunt.bus?.emit('sfx', { name: 'heavy', pos: { x: at.x, y: 0, z: at.z } });
    hunt.bus?.emit('craneDrop', { id: it.id, x: at.x, z: at.z });
    if (it.ring) it.ring.visible = false;
    if (!isHost()) return;
    for (const m of hunt.monsters ?? []) {
      if (!m.alive) continue; // eingegrabene Brocken (m.burrowed) werden bewusst mitgetroffen
      if (flat(m.pos, at) > IA.CRANE.r + (m.bodyRadius ?? 0) * 0.8) continue;
      m.applyDamage(envHit(IA.CRANE.dmg));
      if (m.alive) {
        m._interrupt?.(); m.queued = null;
        m.stunT = Math.max(m.stunT ?? 0, IA.CRANE.stun);
        hunt.bus?.emit('monsterStun', { monster: m });
      }
      hunt.fx?.number?.({ x: m.pos.x, y: m.pos.y + 2.5, z: m.pos.z }, IA.CRANE.dmg, 'crit');
    }
  }

  // ---- Blitzableiter
  function destroyRod(id, silent = false) {
    sync();
    const it = byId(id);
    if (!it || it.type !== 'rod' || !it.alive) return false;
    if (isGuest() && !silent) { sendIa({ a: 'rod', id, d: 1 }); return true; }
    it.alive = false; it.hits = IA.ROD.hits;
    if (it.mesh) it.mesh.rotation.z = 1.2; // umgekippt
    if (it.glow) it.glow.visible = false;
    hunt.fx?.spark?.({ x: it.x, y: it.y + 3, z: it.z }, 24, '#9fe8ff', 6);
    hunt.bus?.emit('sfx', { name: 'break', pos: { x: it.x, y: it.y, z: it.z } });
    hunt.bus?.emit('rodDestroyed', { id });
    if (!silent) sendIa({ a: 'rod', id, dead: 1 });
    return true;
  }
  function damageRod(id, n = 1, fromHost = false) {
    sync();
    const it = byId(id);
    if (!it || it.type !== 'rod' || !it.alive) return false;
    if (isGuest() && !fromHost) { sendIa({ a: 'rod', id, n }); return true; }
    it.hits += n;
    hunt.fx?.spark?.({ x: it.x, y: it.y + 2, z: it.z }, 6, '#9fe8ff', 3);
    hunt.bus?.emit('sfx', { name: 'block', pos: { x: it.x, y: it.y, z: it.z } });
    if (it.hits >= IA.ROD.hits) return destroyRod(id);
    sendIa({ a: 'rod', id, h: it.hits });
    return true;
  }
  const rods = () => { sync(); return items.filter((i) => i.type === 'rod' && i.alive).map((i) => ({ id: i.id, x: i.x, z: i.z, alive: i.alive })); };

  // ------------------------------------------------------------ Kontext + Update
  function nearest(player, range = IA.RANGE) {
    sync();
    if (!player || player.alive === false || (player.state && player.state !== 'free')) return null;
    let best = null, bd = range;
    for (const it of items) {
      if (!usable(it)) continue;
      const d = flat(player.pos, it);
      if (d < bd && Math.abs((player.pos.y ?? 0) - it.y) < 3) { bd = d; best = it; }
    }
    return best;
  }
  /** Hunt.onContext(player, kind): true = Taste verbraucht. */
  function onContext(player, kind) {
    if (kind !== 'press') return false;
    const it = nearest(player);
    return it ? use(player, it.id) : false;
  }

  function update(dt) {
    sync();
    time += dt;
    const lp = hunt.player;
    const near = lp ? nearest(lp) : null;
    const mine = (l) => l === LABELS.valve || l === LABELS.crane || l === LABELS.rod;
    if (near) { if (hunt.contextLabel == null || hunt.contextLabel === 'Sammeln' || mine(hunt.contextLabel)) hunt.contextLabel = LABELS[near.type]; }
    else if (mine(hunt.contextLabel)) hunt.contextLabel = null;
    // Blitzableiter: jeder neue Schlag des lokalen Pirschers in Reichweite zaehlt als Treffer
    const pose = lp?.weapon?.pose?.() ?? null;
    if (pose?.name && (swing.name !== pose.name || pose.t < swing.t - 0.01)) {
      for (const it of items) if (it.type === 'rod' && it.alive && flat(lp.pos, it) <= IA.ROD.swingRange) damageRod(it.id, 1);
    }
    swing.name = pose?.name ?? null; swing.t = pose?.t ?? 0;
    const pulse = 0.2 + 0.12 * Math.sin(time * 4);
    for (const it of items) {
      if (it.type === 'valve') {
        it.cd = Math.max(0, it.cd - dt); it.burning = Math.max(0, it.burning - dt);
        if (it.cone) it.cone.visible = it.burning > 0;
        if (it.wheel && it.burning > 0) it.wheel.rotation.z += dt * 8;
      }
      if (it.glow) it.glow.material.opacity = usable(it) ? pulse + 0.08 : 0.04;
      if (it.ring?.visible) it.ring.material.opacity = 0.35 + 0.3 * Math.sin(time * 5);
    }
    for (let i = steams.length - 1; i >= 0; i--) { tickSteam(steams[i], dt); if (steams[i].t >= IA.VALVE.dur) steams.splice(i, 1); }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.t += dt;
      if (d.it.rope) d.it.rope.visible = d.t < 0.15;
      if (d.t >= IA.CRANE.delay) { landLoad(d.it); drops.splice(i, 1); }
    }
    if (isHost() && hunt.net) { fullT -= dt; if (fullT <= 0) { fullT = IA.FULL_EVERY; sendIa({ a: 'full', s: state() }); } }
  }

  // ------------------------------------------------------------ Netz
  /** kompakter Zustand: [id, cd(s), used, hits, alive] */
  function state() { return items.map((i) => [i.id, Math.round(i.cd * 10) / 10, i.used ? 1 : 0, i.hits, i.alive ? 1 : 0]); }
  function applyState(list) {
    sync();
    for (const [id, cd, used, hits, alive] of list ?? []) {
      const it = byId(id);
      if (!it) continue;
      it.cd = cd;
      if (used && !it.used) { it.used = true; if (it.ring) it.ring.visible = false; if (it.rope) it.rope.visible = false; } // Last war schon gefallen (spaeter Beitritt)
      it.hits = hits;
      if (!alive && it.alive) destroyRod(id, true);
    }
  }
  /** Eingehende Netz-Nachricht { a, id, ... } (sync.js: EV k:'ia'). */
  function onNet(d, from) {
    sync();
    if (d.a === 'full') { if (!isHost()) applyState(d.s); return; }
    const it = d.id ? byId(d.id) : null;
    if (!it) return;
    if (isHost()) { // Wunsch eines Gastes
      const pl = (hunt.players ?? []).find((p) => p.id === from) ?? null;
      if (d.a === 'use') exec(it, pl);
      else if (d.a === 'rod' && it.type === 'rod' && pl && flat(pl.pos, it) <= IA.ROD.swingRange + 2.5) {
        if (d.d) destroyRod(it.id); else damageRod(it.id, 1, true);
      }
      return;
    }
    if (d.a === 'fire' && it.type === 'valve') startValve(it);
    else if (d.a === 'cut' && it.type === 'crane' && !it.used) startCrane(it);
    else if (d.a === 'rod' && it.type === 'rod') { if (d.dead) destroyRod(it.id, true); else if (d.h !== undefined) it.hits = d.h; }
  }

  rebuild();
  return {
    get list() { sync(); return items; },
    nearest, use, onContext, update, rods, damageRod, destroyRod, state, applyState, onNet, byId,
    labelFor: (it) => (it ? LABELS[it.type] : null),
    dispose() { hunt.scene?.remove(group); clearItems(); },
  };
}
