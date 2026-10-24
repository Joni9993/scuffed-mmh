// World effects of items (hunt.spawnEffect(kind, params)): 'flash' | 'stink' (thrown), 'trap' | 'bomb' (placed).
// Params are plain serializable objects (positions {x,y,z}) so the net layer can mirror them.
import * as THREE from 'three';
import { lambert } from '../render/ps1.js';
import { applyMonsterHit } from './combat.js';
import { ITEMS } from '../data/items.js';

const THROW_TIME = 0.6;
const FLASH_R = 3.6, STINK_R = 3.6, TRAP_R = 2.0, BOMB_R = 4.0;
const BOMB_DMG = 120, BOMB_STUN = 50;
export const BLAST_R = 2.2, SLIME_R = 3.4, SLIME_DMG = 28; // Sprengung (Waffen-Ast x) / Glitch-Schleim (Krachfaust)
const RUST_R = 3.6, RUST_BOMB = 60, GROUND_R = 4, GROUND_SECS = 20;

/** [B] gameplay effects (status, damage) are applied by the host / solo only; guests replay the visuals. */
const auth = (h) => !h.net || h.net.isHost;
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** monsters whose body is within r (+ their radius) of a ground point */
export function monstersNear(monsters, pt, r, { alive = true, air = 0 } = {}) {
  // air: extra reach against flyers (the flash bursts in the air, the flier circles high above the ground point)
  return monsters.filter((m) => (!alive || m.alive) && flat(m.pos, pt) <= r + (m.bodyRadius ?? 0) * 0.8 + (m.air > 2 ? air : 0));
}

export class Effects {
  constructor(hunt) {
    this.hunt = hunt;
    this.list = [];
    this.group = new THREE.Group();
    hunt.scene?.add(this.group);
    const box = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    this.geo = { box, disc: new THREE.CylinderGeometry(1, 1, 0.06, 10), cuke: new THREE.CylinderGeometry(0.16, 0.16, 0.5, 6) };
    this.geo.ring = new THREE.RingGeometry(0.96, 1, 32);
  }

  spawn(kind, params = {}) {
    const fn = KINDS[kind];
    if (!fn) return null;
    const e = fn(this, params);
    e.kind = kind;
    e.params = params;
    e.age = 0;
    this.list.push(e);
    if (e.mesh) this.group.add(e.mesh);
    return e;
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.age = (e.age ?? 0) + dt;
      if (e.update(dt) === false) {
        this.list.splice(i, 1);
        if (e.mesh) this.group.remove(e.mesh);
        e.dispose?.();
      }
    }
  }

  dispose() {
    for (const e of this.list) e.dispose?.();
    this.hunt.scene?.remove(this.group);
    for (const g of Object.values(this.geo)) g.dispose();
    this.list.length = 0;
  }

  snapshot() { return this.list.filter(e => e.kind && e.params).map(e => ({ kind: e.kind, params: e.params, age: e.age ?? 0 })); }
  restore(list) {
    for (const e of this.list) { if (e.mesh) this.group.remove(e.mesh); e.dispose?.(); }
    this.list.length = 0;
    for (const d of list ?? []) {
      const e = this.spawn(d.kind, d.params); if (!e) continue;
      e.age = Math.max(0, Number(d.age) || 0);
      if (e.update(e.age) === false) { this.list.splice(this.list.indexOf(e), 1); e.mesh?.removeFromParent(); e.dispose?.(); }
    }
  }
}

// ---- thrown: arc, then burst on landing
function thrown(fx, p, { color, onLand }) {
  const h = fx.hunt;
  const from = { x: p.from.x, y: p.from.y ?? 1.4, z: p.from.z };
  const gy = h.world.heightAt(p.to.x, p.to.z);
  const mesh = new THREE.Mesh(fx.geo.box, lambert({ color }));
  mesh.position.set(from.x, from.y, from.z);
  let t = 0;
  return {
    mesh,
    dispose() { mesh.material.dispose(); },
    update(dt) {
      t += dt;
      const k = Math.min(1, t / THROW_TIME);
      mesh.position.set(from.x + (p.to.x - from.x) * k, from.y + (gy - from.y) * k + Math.sin(Math.PI * k) * 1.8, from.z + (p.to.z - from.z) * k);
      mesh.rotation.x += dt * 12;
      if (k >= 1) { onLand(h, { x: p.to.x, y: gy, z: p.to.z }); return false; }
      return true;
    },
  };
}

const KINDS = {
  surveyBeacon: (fx, p) => beacon(fx, p.pos, p.owner, 'surveyZones', ITEMS.leuchtsignal.effect, '#40f0d0'),
  venom: (fx, p) => thrown(fx, p, {
    color: '#a8c030',
    onLand(h, at) {
      const cfg = ITEMS.giftbombe.effect;
      h.fx.spark({ ...at, y: at.y + 0.5 }, 28, '#a8c030', 5);
      h.bus.emit('sfx', { name: 'break', pos: at });
      if (auth(h)) for (const m of monstersNear(h.monsters, at, cfg.radius)) {
        if (!m.invulnerable) m.applyStatus?.('poison', { buildup: cfg.poison });
      }
    },
  }),

  survey: (fx, p) => thrown(fx, p, {
    color: '#40f0d0',
    onLand(h, at) {
      const e = beacon(fx, at, p.owner, 'surveyZones', ITEMS.leuchtsignal.effect, '#40f0d0');
      fx.list.push(e); fx.group.add(e.mesh);
      h.bus.emit('sfx', { name: 'ui', pos: at });
    },
  }),

  runeanchor: (fx, p) => beacon(fx, p.pos, p.owner, 'runeZones', ITEMS.runenanker.effect, '#bda0ff'),

  heavybomb: (fx, p) => {
    const h = fx.hunt, cfg = ITEMS.donnerknallgurke.effect;
    const mat = lambert({ color: '#ffe14d', emissive: '#000000' });
    const mesh = new THREE.Mesh(fx.geo.cuke, mat);
    mesh.scale.set(1.8, 1.6, 1.8); mesh.rotation.z = Math.PI / 2;
    mesh.position.set(p.pos.x, p.pos.y + 0.3, p.pos.z);
    let t = cfg.fuse;
    return { mesh, dispose() { mat.dispose(); }, update(dt) {
      t -= dt;
      const blink = Math.floor(t * (t < 1 ? 14 : 5)) % 2;
      mat.emissive.setRGB(blink ? 0.9 : 0, blink ? 0.5 : 0, 0);
      if (t > 0) return true;
      explode(h, p.pos, p.owner, cfg);
      return false;
    } };
  },
  flash: (fx, p) => thrown(fx, p, {
    color: '#fff4a0',
    onLand(h, at) {
      h.fx.spark({ x: at.x, y: at.y + 0.5, z: at.z }, 36, '#fffbd0', 9);
      h.fx.flash?.('rgba(255,255,220,.35)', 0.25);
      h.bus.emit('sfx', { name: 'break', pos: at });
      if (auth(h)) for (const m of monstersNear(h.monsters, at, FLASH_R, { air: 3 })) m.applyStatus?.('blind', { duration: 4, pos: at, attackerId: p.owner });
    },
  }),

  stink: (fx, p) => thrown(fx, p, {
    color: '#8ab030',
    onLand(h, at) {
      h.bus.emit('sfx', { name: 'hit', pos: at });
      if (auth(h)) for (const m of monstersNear(h.monsters, at, STINK_R)) m.applyStatus?.('stink', { pos: at });
      // lingering cloud
      h.effects.list.push(cloud(h, at, 4));
    },
  }),

  rostbomb: (fx, p) => thrown(fx, p, { // Rostbombe: Rost-Aufbau 60 im Radius
    color: '#c8661e',
    onLand(h, at) {
      h.fx.spark({ x: at.x, y: at.y + 0.5, z: at.z }, 30, '#c8661e', 6);
      h.bus.emit('sfx', { name: 'break', pos: at });
      if (auth(h)) for (const m of monstersNear(h.monsters, at, RUST_R)) m.applyStatus?.('rost', { amount: RUST_BOMB });
      h.effects.list.push(cloud(h, at, 3));
    },
  }),

  ground: (fx, p) => { // Erdungsstab: 20 s Schutzzone r=4 (hunt.groundingZones)
    const h = fx.hunt;
    const mesh = new THREE.Mesh(fx.geo.disc, lambert({ color: '#5ad8ff', emissive: '#1a5a70' }));
    mesh.scale.set(GROUND_R, 1, GROUND_R);
    mesh.position.set(p.pos.x, p.pos.y + 0.05, p.pos.z);
    const zone = { x: p.pos.x, z: p.pos.z, r: GROUND_R, until: h.time + GROUND_SECS };
    (h.groundingZones ??= []).push(zone);
    let t = GROUND_SECS;
    return {
      mesh,
      update(dt) {
        t -= dt;
        mesh.material.emissive?.setRGB(0.05, 0.25 + 0.15 * Math.sin(t * 6), 0.3);
        if (t > 0) return true;
        const i = h.groundingZones?.indexOf(zone) ?? -1;
        if (i >= 0) h.groundingZones.splice(i, 1);
        return false;
      },
    };
  },

  // Glitch-Schleim am Pirscher ist abgelaufen (Krachfaust): Explosion r 3,4 m, trifft jeden lokalen Pirscher darin (auch Mit-Pirscher). Wird ueber spawnEffect an alle Clients gespiegelt.
  schleimblast: (fx, p) => {
    slimeBlast(fx.hunt, p.pos, { r: p.r ?? SLIME_R, dmg: p.dmg ?? SLIME_DMG });
    return { update: () => false };
  },

  trap: (fx, p) => {
    const h = fx.hunt;
    const mesh = new THREE.Mesh(fx.geo.disc, lambert({ color: '#d0a050' }));
    mesh.scale.set(0.9, 1, 0.9);
    mesh.position.set(p.pos.x, p.pos.y + 0.05, p.pos.z);
    let age = 0;
    return {
      mesh,
      update(dt) {
        age += dt;
        if (age > 120) return false;
        if (age < 0.5) return true; // arming
        if (!auth(h)) return true;
        for (const m of monstersNear(h.monsters, p.pos, TRAP_R)) {
          if (m.minor) continue;
          if (m.applyStatus?.('trap', { duration: 6, pos: p.pos, attackerId: p.owner })) {
            h.fx.spark({ x: p.pos.x, y: p.pos.y + 0.6, z: p.pos.z }, 20, '#d0a050', 5);
            h.bus.emit('sfx', { name: 'block', pos: p.pos });
            return false;
          }
        }
        return true;
      },
    };
  },

  bomb: (fx, p) => {
    const h = fx.hunt;
    const mat = lambert({ color: '#4ac040', emissive: '#000000' });
    const mesh = new THREE.Mesh(fx.geo.cuke, mat);
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set(p.pos.x, p.pos.y + 0.2, p.pos.z);
    let t = p.fuse ?? 3;
    return {
      mesh,
      update(dt) {
        t -= dt;
        const blink = Math.floor(t * (t < 1 ? 10 : 4)) % 2;
        mat.emissive.setRGB(blink ? 0.9 : 0, blink ? 0.3 : 0, 0);
        if (t > 0) return true;
        explode(h, p.pos, p.owner);
        return false;
      },
    };
  },
};

// A beacon belongs to the world, including on guests. Replacing the owner's old beacon
// prevents camp refills from covering the whole arena. Expiry removes gameplay and visuals together.
function beacon(fx, at, owner, key, cfg, color) {
  const h = fx.hunt, zones = (h[key] ??= []);
  for (const old of zones) if (old.owner === owner) old.active = false;
  const zone = { x: at.x, y: at.y, z: at.z, r: cfg.radius, owner, active: true };
  zones.push(zone);
  const mat = lambert({ color, emissive: color, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
  const mesh = new THREE.Group(); mesh.position.set(at.x, at.y + 0.08, at.z);
  const ring = new THREE.Mesh(fx.geo.ring, mat); ring.rotation.x = -Math.PI / 2;
  // The signal's full 35 m radius is gameplay only; a small pulse marks its source.
  const r = key === 'runeZones' ? cfg.radius : 1.5;
  ring.scale.setScalar(r); mesh.add(ring);
  const post = new THREE.Mesh(fx.geo.cuke, mat); post.scale.set(0.5, 2, 0.5); post.position.y = 0.5; mesh.add(post);
  let t = cfg.duration;
  return { mesh, kind: key === 'runeZones' ? 'runeanchor' : 'surveyBeacon', params: { pos: { ...at }, owner }, age: 0, dispose() {
    zone.active = false;
    const i = zones.indexOf(zone); if (i >= 0) zones.splice(i, 1);
    mat.dispose();
  }, update(dt) {
    t -= dt; mat.opacity = Math.min(0.7, t * 0.35) * (0.85 + Math.sin(t * 5) * 0.15);
    return zone.active && t > 0;
  } };
}

function cloud(h, at, secs) {
  let t = secs, acc = 0;
  return {
    update(dt) {
      t -= dt; acc += dt;
      if (acc > 0.2) { acc = 0; h.fx.spark({ x: at.x + (Math.random() - 0.5) * 3, y: at.y + 0.4 + Math.random(), z: at.z + (Math.random() - 0.5) * 3 }, 2, '#9ac040', 0.8); }
      return t > 0;
    },
  };
}

/**
 * Glitch-Schleim-Explosion (Krachfaust-Pfuetze oder Pirscher-Schleim): Optik in Hacker-Neongruen, Schaden nur an den LOKALEN Pirschern im Radius
 * (jeder Client prueft seine eigenen, wie bei Nahkampf-Treffern). Rolle = i-Frames = kein Schaden, perfekte Rolle = Glitch-Konter.
 */
export function slimeBlast(h, at, { r = SLIME_R, dmg = SLIME_DMG, monster = null } = {}) {
  const p0 = { x: at.x, y: (at.y ?? 0) + 0.5, z: at.z };
  h.fx.slimeBurst?.(p0, r);
  h.bus?.emit('sfx', { name: 'slimeSplat', pos: at });
  for (const p of h.players ?? []) {
    if (!p.local || !p.alive || Math.hypot(p.pos.x - at.x, p.pos.z - at.z) > r + 0.4) continue;
    p.takeHit({ dmg: dmg * (monster?.dmgMul ?? 1) * (p._sk?.schleimDmg ?? 1), knock: 'flinch', key: `slime|${Math.round(at.x * 10)}|${Math.round(at.z * 10)}|${Math.round((h.time ?? 0) * 10)}|${p.id}`, sourcePos: at, attackId: 'krachfaust_schleim', monster });
  }
}

/** Sprengung der Sprenger-Waffen: orange/weisse Funken und Ring (KEIN Gruen: gehoert den Brocken), Ton, kleiner Wackler. Rein optisch. */
export function blastFx(h, at, r = BLAST_R) {
  const p0 = { x: at.x, y: at.y + 0.2, z: at.z };
  h.fx.spark(p0, 26, '#ffb020', 8); h.fx.spark(p0, 14, '#fff2c0', 6);
  h.fx.ring?.({ x: at.x, y: at.y - 0.2, z: at.z }, r * 0.3, r, { color: '#ffb020', life: 0.3 });
  h.fx.shake?.(0.14, 0.15);
  h.bus?.emit('sfx', { name: 'heavy', pos: at });
}

/**
 * Sprengung (Waffen-Ast x, elems.blast): jeder Treffer laedt das getroffene Teil auf (Zaehler je Angreifer und Teil), bei 100 detoniert es am Teil:
 * Kugel r 2,2 m, fester Schaden ~ 8 % der Waffenkraft x 6, Teil-HP-Schaden x1,5. Keine Selbstverletzung. Aufruf aus Hunt.playerHit (Host, Solo und Gast).
 * res.blastBuild kommt aus combat.resolvePlayerHit (blast x Trefferstaerke), st = Waffenwerte des Pirschers.
 */
export function blastBuild(h, player, monster, hp, res, st) {
  const acc = (player._blast ??= new Map()), key = monster.id + '|' + hp.part.id;
  const v = (acc.get(key) ?? 0) + res.blastBuild;
  if (v < 100) { acc.set(key, v); return false; }
  acc.set(key, v - 100);
  const at = { x: hp.pos.x, y: hp.pos.y, z: hp.pos.z };
  const dmg = Math.max(1, Math.round(st.power * 0.08 * 6));
  const bres = { dmg, elemDmg: 0, elemBy: {}, crit: false, weak: false, zone: hp.part.factor, blunt: 0, stunEligible: false, wucht: 0, partId: hp.part.id, hitstop: 0, shake: 0, partDmgMul: 1.5, attackerId: player.id, blast: true };
  applyMonsterHit(monster, bres, h);
  blastFx(h, at, BLAST_R);
  h.fx.number({ x: at.x, y: at.y + 1.1, z: at.z }, `PENG ${dmg}`, 'blast');
  h.bus.emit('hit', { player, monster, part: hp.part.id, ...bres });
  return true;
}

/** Knallgurke: 120 damage + 50 stun build-up on monsters in radius (head part carries the stun). */
export function explode(h, at, owner = 'p1', { damage = BOMB_DMG, stun = BOMB_STUN, radius = BOMB_R } = {}) {
  h.fx.spark({ x: at.x, y: at.y + 0.5, z: at.z }, 50, '#ffb040', 9);
  h.fx.shake?.(0.4, 0.3);
  h.bus.emit('sfx', { name: 'heavy', pos: at });
  if (!auth(h)) return;
  for (const m of monstersNear(h.monsters, at, radius)) {
    const part = m.parts?.find((p) => p.stunPart) ?? m.parts?.[0];
    if (!part) continue;
    const res = { dmg: damage, elemDmg: 0, crit: false, weak: false, zone: part.factor, blunt: stun, stunEligible: !!part.stunPart, wucht: 0, partId: part.id, hitstop: 0, shake: 0, attackerId: owner };
    applyMonsterHit(m, res, h);
    h.fx.number({ x: m.pos.x, y: m.pos.y + 2.5, z: m.pos.z }, damage, 'crit');
  }
}
