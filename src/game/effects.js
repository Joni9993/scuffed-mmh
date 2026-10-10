// World effects of items (hunt.spawnEffect(kind, params)): 'flash' | 'stink' (thrown), 'trap' | 'bomb' (placed).
// Params are plain serializable objects (positions {x,y,z}) so the net layer can mirror them.
import * as THREE from 'three';
import { lambert } from '../render/ps1.js';
import { applyMonsterHit } from './combat.js';

const THROW_TIME = 0.6;
const FLASH_R = 3.6, STINK_R = 3.6, TRAP_R = 2.0, BOMB_R = 4.0;
const BOMB_DMG = 120, BOMB_STUN = 50;

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
  }

  spawn(kind, params = {}) {
    const fn = KINDS[kind];
    if (!fn) return null;
    const e = fn(this, params);
    e.kind = kind;
    e.params = params;
    this.list.push(e);
    if (e.mesh) this.group.add(e.mesh);
    return e;
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.update(dt) === false) {
        this.list.splice(i, 1);
        if (e.mesh) this.group.remove(e.mesh);
      }
    }
  }

  dispose() {
    this.hunt.scene?.remove(this.group);
    for (const g of Object.values(this.geo)) g.dispose();
    this.list.length = 0;
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
  flash: (fx, p) => thrown(fx, p, {
    color: '#fff4a0',
    onLand(h, at) {
      h.fx.spark({ x: at.x, y: at.y + 0.5, z: at.z }, 36, '#fffbd0', 9);
      h.fx.flash?.('rgba(255,255,220,.35)', 0.25);
      h.bus.emit('sfx', { name: 'break', pos: at });
      if (auth(h)) for (const m of monstersNear(h.monsters, at, FLASH_R, { air: 3 })) m.applyStatus?.('blind', { duration: 4, pos: at });
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
          if (m.applyStatus?.('trap', { duration: 6, pos: p.pos })) {
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

/** Knallgurke: 120 damage + 50 stun build-up on monsters in radius (head part carries the stun). */
export function explode(h, at, owner = 'p1') {
  h.fx.spark({ x: at.x, y: at.y + 0.5, z: at.z }, 50, '#ffb040', 9);
  h.fx.shake?.(0.4, 0.3);
  h.bus.emit('sfx', { name: 'heavy', pos: at });
  if (!auth(h)) return;
  for (const m of monstersNear(h.monsters, at, BOMB_R)) {
    const part = m.parts?.find((p) => p.stunPart) ?? m.parts?.[0];
    if (!part) continue;
    const res = { dmg: BOMB_DMG, elemDmg: 0, crit: false, weak: false, zone: part.factor, blunt: BOMB_STUN, stunEligible: !!part.stunPart, wucht: 0, partId: part.id, hitstop: 0, shake: 0, attackerId: owner };
    applyMonsterHit(m, res, h);
    h.fx.number({ x: m.pos.x, y: m.pos.y + 2.5, z: m.pos.z }, BOMB_DMG, 'crit');
  }
}
