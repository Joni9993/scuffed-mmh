import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SLOTS, SLOT_NAMES, ARMOR_SETS, SET_ORDER, getPiece } from '../../src/data/armor.js';
import { GEAR_SETS, SET_TIER, encodeGear, decodeGear, makeGear, gearFxLevel, armorSets } from '../../src/data/gearlook.js';
import { encodeTown, decodeTown } from '../../src/net/protocol.js';
import { buildHunterRig } from '../../src/game/rig.js';
import { buildBody, buildArmor, ARMOR_BUILDERS } from '../../src/game/gear/armor.js';
import { GearParts } from '../../src/render/gearfx.js';
import { getWeapon } from '../../src/game/weapons/index.js';
import { REST, sampleTrack, mirrorPose } from '../../src/game/anim.js';

const armorOf = (set) => ({ head: `${set}_head`, body: `${set}_body`, legs: `${set}_legs` });
const countDraws = (root, extra = []) => {
  let n = 0;
  root.updateWorldMatrix(true, true);
  for (const r of [root, ...extra]) r.traverse((o) => { if ((o.isMesh || o.isLine || o.isPoints) && o.visible) { let v = true; for (let p = o; p; p = p.parent) if (!p.visible) v = false; if (v && o.geometry.attributes.position.count > 0) n++; } });
  return n;
};

describe('gear codes', () => {
  it('every armor set has a code letter, a tier and a builder per slot', () => {
    for (const s of SET_ORDER) {
      expect(GEAR_SETS).toContain(s);
      expect(SET_TIER[s]).toBeGreaterThanOrEqual(0);
      for (const sl of SLOTS) expect(typeof ARMOR_BUILDERS[s][sl]).toBe('function');
    }
    expect(ARMOR_SETS.fellkluft.prot).toBe(10);
    expect(getPiece('fellkluft_body').cost.mampfer_fell).toBeGreaterThan(0);
  });
  it('encode -> decode roundtrips weapon (type, tier, branch), armor per slot and colour', () => {
    for (const type of ['gs', 'db', 'bow']) for (const tier of [1, 2, 3, 4]) for (const branch of tier === 3 ? ['a', 'b'] : [null]) {
      const g = { weapon: { type, tier, branch }, armor: { head: 'jaggo_head', body: 'barrotz_body', legs: 'fellkluft_legs' } };
      const code = encodeGear(g, 5);
      expect(code.length).toBe(7);
      const d = decodeGear(code);
      expect(d.weapon).toEqual({ type, tier, branch });
      expect(d.armor).toEqual({ head: 'jaggo_head', body: 'barrotz_body', legs: 'fellkluft_legs' });
      expect(d.colorIdx).toBe(5);
    }
  });
  it('mixed sets keep their slot; unknown / missing data falls back safely', () => {
    const g = makeGear({ weapon: { type: 'nope', tier: 99 }, armor: { head: 'brathalos_body', body: 'knochenkram_body' } });
    expect(g.weapon).toEqual({ type: 'gs', tier: 4, branch: null });
    expect(g.armor.head).toBe('lumpen_head'); // wrong slot piece rejected
    expect(armorSets(g.armor)).toEqual({ head: 'lumpen', body: 'knochenkram', legs: 'lumpen' });
    expect(decodeGear(undefined)).toBeNull();
    expect(decodeGear('zz')).toBeNull();
    expect(decodeGear('g9aaaa0')).toBeNull();
    expect(decodeGear('g1-zaa0')).toBeNull();
  });
  it('top-tier outfits earn aura/embers, lower ones do not', () => {
    expect(gearFxLevel({ armor: armorOf('brathalos') })).toMatchObject({ aura: true, embers: true, visor: 4 });
    expect(gearFxLevel({ armor: armorOf('barrotz') })).toMatchObject({ aura: false, embers: false });
    expect(gearFxLevel({ armor: { head: 'brathalos_head', body: 'lumpen_body', legs: 'lumpen_legs' } })).toMatchObject({ aura: false, embers: true });
  });
  it('town presence carries the gear code and decodes old messages (no code) to null', () => {
    const o = encodeTown({ x: 1, y: 0, z: 2, rot: 0, gear: 'g3bdeb2' }, 1);
    expect(o.g).toBe('g3bdeb2');
    expect(decodeTown(o).gear).toBe('g3bdeb2');
    const old = encodeTown({ x: 1, y: 0, z: 2, rot: 0, weapon: 'db' }, 1);
    expect(old.g).toBeUndefined();
    expect(decodeTown(old).gear).toBeNull();
    expect(decodeTown(old).weapon).toBe('db');
  });
});

describe('armor mesh builder', () => {
  it('returns geometry for every slot of every set (per joint) and bigger tiers add more', () => {
    const size = {};
    for (const set of SET_ORDER) {
      const P = {};
      for (const k of ['torso', 'head', 'armR', 'armL', 'legL', 'legR']) P[k] = new GearParts();
      const before = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, v.geos.length]));
      const r = buildArmor(P, armorOf(set), '#44aa66');
      expect(r.tiers.head).toBe(SET_TIER[set]);
      for (const slot of SLOTS) for (const j of { head: ['head'], body: ['torso', 'armR', 'armL'], legs: ['legL', 'legR'] }[slot]) expect(P[j].geos.length, `${set}.${slot}->${j}`).toBeGreaterThan(before[j]);
      size[set] = Object.values(P).reduce((a, p) => a + p.geos.length, 0);
    }
    expect(size.brathalos).toBeGreaterThan(size.lumpen);
    expect(size.barrotz).toBeGreaterThan(size.lumpen);
    expect(SLOT_NAMES.head).toBe('Kopf');
  });
  it('merged geometry carries colour + glow attributes (glow only on lit parts)', () => {
    const P = new GearParts();
    P.box(1, 1, 1, '#ffffff', { glow: 1 }).box(1, 1, 1, '#ffffff');
    const g = P.merge();
    expect(g.attributes.glow.count).toBe(g.attributes.position.count);
    expect(Math.max(...g.attributes.glow.array)).toBe(1);
    expect(Math.min(...g.attributes.glow.array)).toBe(0);
    expect(g.attributes.color).toBeTruthy();
  });
});

describe('draw-call budget (hunter incl. gear, idle pose)', () => {
  const combos = [];
  for (const set of SET_ORDER) for (const [type, tier, branch] of [['gs', 1, null], ['gs', 4, null], ['db', 4, null], ['bow', 4, null], ['db', 3, 'b'], ['bow', 3, 'b']]) combos.push([set, type, tier, branch]);
  it.each(combos)('%s + %s t%d%s <= 10 draw calls', (set, type, tier, branch) => {
    const gear = { weapon: { type, tier, branch }, armor: armorOf(set) };
    const def = getWeapon(type);
    const rig = buildHunterRig({ merged: true, gear, weaponMesh: def.buildMesh({ tier, branch }) });
    rig.apply({ ...REST, ...def.rest });
    const n = countDraws(rig.root, [rig.shadow]);
    expect(n).toBeLessThanOrEqual(10);
    // 4 players in view = 4 x n
    expect(4 * n).toBeLessThanOrEqual(40);
  });
  it('setGear rebuilds the outfit without growing the draw calls', () => {
    const rig = buildHunterRig({ merged: true, gear: { armor: armorOf('lumpen') } });
    const a = countDraws(rig.root, [rig.shadow]);
    rig.setGear({ armor: armorOf('brathalos') });
    expect(rig.gear.armor.body).toBe('brathalos_body');
    expect(countDraws(rig.root, [rig.shadow])).toBeLessThanOrEqual(a + 1); // + particle points
    rig.setGear({ armor: armorOf('lumpen') });
    expect(countDraws(rig.root, [rig.shadow])).toBe(a);
  });
});

describe('greatsword is held with two hands', () => {
  const def = getWeapon('gs');
  const tmp = new THREE.Vector3();
  /** distance of the left hand centre to the hilt axis (weapon-local y in [-0.1, 0.7]) in the current pose */
  function gripGap(rig) {
    rig.root.updateWorldMatrix(true, true);
    const w = rig.weaponMesh;
    const handL = rig.handL.getWorldPosition(new THREE.Vector3());
    const p = w.worldToLocal(handL.clone());
    const y = Math.min(0.7, Math.max(-0.1, p.y));
    return tmp.set(p.x, p.y - y, p.z).length();
  }
  it('the weapon declares a two-hand grip; dual blades / bow do not', () => {
    expect(def.buildMesh({ tier: 2 }).userData.twoHand).toBeTruthy();
    expect(getWeapon('db').buildMesh({ tier: 1 }).userData.twoHand).toBeUndefined();
    expect(getWeapon('bow').buildMesh({ tier: 1 }).userData.hand).toBe('L');
  });
  it('left hand stays on the hilt in all poses of every move (idle, chain, charge, bump, block, finisher)', () => {
    const rig = buildHunterRig({ merged: true, gear: { weapon: { type: 'gs', tier: 3, branch: 'a' } }, weaponMesh: def.buildMesh({ tier: 3, branch: 'a' }) });
    let worst = 0, worstAt = '', n = 0, far = 0;
    const check = (pose, label) => {
      rig.apply(pose);
      const g = gripGap(rig);
      n++; if (g > 0.3) far++;
      if (g > worst) { worst = g; worstAt = label; }
    };
    check({ ...REST, ...def.rest }, 'idle');
    for (const [name, track] of Object.entries(def.anims)) {
      const end = track[track.length - 1].t;
      for (let t = 0; t <= end; t += 0.04) check({ ...REST, ...sampleTrack(track, t, {}) }, `${name}@${t.toFixed(2)}`);
    }
    // eslint-disable-next-line no-console
    console.log(`two-hand grip: worst gap ${worst.toFixed(2)} m at ${worstAt}, ${far}/${n} samples > 0.3 m`);
    expect(far / n).toBeLessThan(0.12);
    expect(worst).toBeLessThan(0.6);
  });
  it('the blade keeps its authored direction (hit capsules still follow the blade)', () => {
    const rig = buildHunterRig({ merged: true, gear: {}, weaponMesh: def.buildMesh({ tier: 1 }) });
    const legacy = buildHunterRig({ weaponMesh: def.buildMesh({ tier: 1 }) }); // phase-1 one-hand rig = reference for the blade direction
    const dirOf = (r) => { r.root.updateWorldMatrix(true, true); return new THREE.Vector3(0, -1, 0).transformDirection(r.weaponMesh.matrixWorld); };
    for (const [arx, sw, arz] of [[25, 155, 8], [172, 33, 8], [62, -2, 8], [-20, 30, 8], [85, 95, 8], [55, 65, 8]]) {
      const pose = { ...REST, arx, sw, arz, ty: 30, tx: 12 };
      rig.apply(pose); legacy.apply(pose);
      expect(dirOf(rig).distanceTo(dirOf(legacy))).toBeLessThan(1e-4);
    }
    rig.apply({ ...REST, arx: 40, sw: 50, arz: 0, tx: 0 });
    const d = dirOf(rig), a = (90 * Math.PI) / 180; // pitch 90 = straight forward (+z)
    expect(d.y).toBeCloseTo(-Math.cos(a), 3);
    expect(d.z).toBeCloseTo(Math.sin(a), 3);
  });
});

describe('bow is held left, drawn with the right hand', () => {
  it('mirrorPose swaps arms and flips the twist; bow mesh goes into the left slot', () => {
    const t = mirrorPose({ arx: 92, alx: 74, arz: 4, alz: -36, sw: -92, sl: 155, ty: -28, tz: 2, hy: -18, pry: 0 });
    expect(t).toMatchObject({ arx: 74, alx: 92, arz: -36, alz: 4, sw: 155, sl: -92, ty: 28, hy: 18 });
    const def = getWeapon('bow');
    const rig = buildHunterRig({ merged: true, gear: {}, weaponMesh: def.buildMesh({ tier: 2 }) });
    expect(rig.slotL.children.length).toBe(1);
    expect(rig.slot.children.length).toBe(0);
  });
  it('dual blades: one blade per hand', () => {
    const def = getWeapon('db');
    const rig = buildHunterRig({ merged: true, gear: {}, weaponMesh: def.buildMesh({ tier: 3, branch: 'b' }) });
    expect(rig.slot.children.length).toBe(1);
    expect(rig.slotL.children.length).toBe(1);
  });
});
