import { buildRaptor } from './raptor.js';
import { mTrack } from './monster.js';

// PLACEHOLDER Jaggling (phase 1): simple biter. The monsters agent fleshes this out (packs, flanking, drops).
const SC = 0.62;
const bite = {
  id: 'jaggling_biss', range: [0, 2.6], weight: 1, cooldown: 1.4, telegraph: 0.5, flashParts: ['head'], duration: 1.1,
  hits: [{ t0: 0.58, t1: 0.72, shape: 'sphere', at: [0, 0.9, 1.15], radius: 0.6, dmg: 6, knock: 'flinch' }],
  motion(tau, a) {
    const k = Math.min(1, Math.max(0, (tau - 0.5) / 0.1)) * 0.6;
    return { x: a.origin.x + a.dir.x * k, z: a.origin.z + a.dir.z * k };
  },
  pose: mTrack([[0, {}], [0.4, { neck: -0.4, head: -10 }], [0.5, { neck: -0.4 }], [0.62, { neck: 0.5, head: 12, bodyPitch: 8 }, 'lin'], [0.9, {}], [1.1, {}]]),
};

export const jaggling = {
  id: 'jaggling',
  name: 'Jaggling',
  minor: true,
  hp: 80,
  scale: SC,
  bodyRadius: 0.6,
  walk: 2.4, run: 6.6, detect: 40, prefer: 1.4,
  parts: [
    { id: 'head', label: 'Kopf', factor: 1.0, elem: {}, lock: false, spheres: [{ node: 'head', offset: [0, 0.05, 0.4], r: 0.55 }] },
    { id: 'body', label: 'Körper', factor: 0.8, elem: {}, spheres: [{ node: 'body', offset: [0, 0, 0.2], r: 0.9 }, { node: 'legL', offset: [0, -0.5, 0.1], r: 0.6 }] },
  ],
  attacks: { jaggling_biss: bite },
  build: () => buildRaptor({ scale: SC, skin: 'scale', crest: false }),
};
