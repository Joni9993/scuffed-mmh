import * as THREE from 'three';
import { GearParts, gearMaterial, bar, spike } from '../../render/gearfx.js';

// Ornament positions are weapon-local. The existing grip/muzzle/blade animation roots remain intact.
const TRIM = {
  gs: { x: .26, y: -.55, z: .13, s: 1.15 }, db: { x: .13, y: -.24, z: .1, s: .60 },
  bow: { x: .24, y: -.42, z: .09, s: .75 }, kt: { x: .10, y: .09, z: .04, s: .7 },
  ga: { x: .10, y: .08, z: .10, s: .85 }, kk: { x: .27, y: -.35, z: .21, s: .9 },
  lb: { x: .16, y: -.32, z: .17, s: .65 },
};

/** One merged feather/spur/pixel ornament per held piece, using the existing PS1/gear shader. */
export function addTranscendence(root, type, mirror = 1) {
  if (!root || root.userData.transcendence) return root;
  const p = TRIM[type] ?? TRIM.gs, P = new GearParts();
  const GOLD = '#e5bd64', BONE = '#f2e8bd', INK = '#28283f', PIXEL = '#8cffe1';
  P.box(.12, .36, .12, GOLD, { y: .01 });
  for (let i = 0; i < 3; i++) {
    const x = .11 + i * .09, y = -.02 - i * .09;
    // Layered block feathers and curved, blunt rooster spur: cheap polygons with a clear trophy silhouette.
    bar(P, [0, y, 0], [x, y - .23 - i * .025, -.02], .055, .025, i % 2 ? BONE : INK);
    P.box(.055, .065, .045, PIXEL, { x: x * .7, y: y - .16, z: .035, glow: .75 });
  }
  spike(P, [-.04, -.14, 0], [-.18, -.31, .035], .07, GOLD);
  spike(P, [-.15, -.27, .025], [-.22, -.19, .045], .045, BONE);
  // Offset pixel stair, concentrated on the trim so the weapon's hit silhouette stays readable.
  for (let i = 0; i < 4; i++) P.box(.035, .035, .035, i % 2 ? GOLD : PIXEL, { x: -.07 - i * .035, y: .14 + i * .045, z: .025, glow: .65 });
  const mat = gearMaterial(.85); mat.userData.ps1.uJit.value = .032;
  const ornament = new THREE.Mesh(P.merge(), mat); ornament.name = 'ur-feather-pixel-trim';
  ornament.position.set(p.x * mirror, p.y, p.z); ornament.scale.set(p.s * mirror, p.s, p.s); root.add(ornament);
  root.userData.transcendence = { ornament, material: mat, type };
  // Use the rig's existing bounded emitter. No extra points pool, lights or fullscreen effect.
  root.userData.fx = [{ kind: 'ember', cols: [GOLD, BONE], rate: 2, at: [p.x * mirror, p.y, p.z] },
    { kind: 'shock', cols: [PIXEL], rate: 1, at: [p.x * mirror, p.y - .2, p.z] }];
  root.userData.glowBase = Math.max(root.userData.glowBase ?? 0, .75);
  return root;
}

/** Decorate the real weapon definition: combat, sockets, dual offhand, bow string and axe morph all survive. */
export function withTranscendence(def, type) {
  if (def.transcendenceReady) return def;
  const baseBuild = def.buildMesh;
  def.buildMesh = (opts = {}) => {
    if (opts.tier !== 7) return baseBuild(opts);
    const mesh = baseBuild({ ...opts, tier: 6, branch: 'v' });
    addTranscendence(mesh, type);
    if (mesh.userData.offhand) addTranscendence(mesh.userData.offhand, type, -1);
    return mesh;
  };
  def.transcendenceReady = true;
  return def;
}
