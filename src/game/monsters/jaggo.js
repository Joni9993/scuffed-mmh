import { buildRaptor } from './raptor.js';
import { mTrack } from './monster.js';
import { yawOf } from '../../core/math.js';
import { spawnPack } from './jaggling.js';

const SC = 1.3;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// ---- Bissreihe: 3 Bisse vorwärts (Kopf zurück 0,55 s)
const BITE_POSE = { neck: 0.5, head: 14, bodyPitch: 9, bodyY: -0.12 };
const BITE_BACK = { neck: -0.5, head: -12, bodyPitch: -6, bodyY: 0.05 };
const bissreihe = {
  id: 'jaggo_bissreihe', range: [2, 6.5], weight: 4, cooldown: 3, telegraph: 0.55, flashParts: ['head'], duration: 2.4,
  hits: [0, 1, 2].map((i) => ({
    t0: 0.62 + i * 0.5, t1: 0.74 + i * 0.5, shape: 'sphere', at: [0, 2.35, 2.9], radius: 1.05, dmg: 12, knock: 'flinch',
  })),
  motion(tau, a) {
    let f = 0;
    for (let i = 0; i < 3; i++) f += 0.8 * smooth(clamp01((tau - (0.5 + 0.5 * i)) / 0.12));
    return { x: a.origin.x + a.dir.x * f, z: a.origin.z + a.dir.z * f };
  },
  pose: mTrack([
    [0, {}], [0.35, BITE_BACK], [0.55, BITE_BACK], [0.68, BITE_POSE, 'lin'], [0.9, { neck: -0.1, head: 0, bodyPitch: 2, bodyY: 0 }],
    [1.05, { neck: -0.3, head: -8, bodyPitch: -3 }], [1.18, BITE_POSE, 'lin'], [1.4, { neck: -0.1, head: 0, bodyPitch: 2, bodyY: 0 }],
    [1.55, { neck: -0.3, head: -8, bodyPitch: -3 }], [1.68, BITE_POSE, 'lin'], [2.1, { neck: 0, head: 0, bodyPitch: 0, bodyY: 0 }], [2.4, {}],
  ]),
};

// ---- Hüpfer: duckt sich (Beine blinken 0,7 s), Sprung auf das Ziel (max. 10 m)
const huepfer = {
  id: 'jaggo_huepfer', range: [3.5, 10], weight: 3, cooldown: 5, telegraph: 0.7, flashParts: ['legs'], duration: 2.2,
  marker: { at: 'landing', radius: 2.6 }, markerUntil: 1.45,
  prepare(a) {
    const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz) || 1;
    const len = Math.min(10, Math.max(3, d));
    a.landing = { x: a.origin.x + (dx / d) * len, z: a.origin.z + (dz / d) * len };
    a.jumpYaw = yawOf(dx, dz);
  },
  hits: [{ t0: 1.28, t1: 1.42, shape: 'sphere', at: [0, 0.9, 0], radius: 2.6, dmg: 22, knock: 'down' }],
  motion(tau, a) {
    const k = clamp01((tau - 0.7) / 0.6);
    return {
      x: a.origin.x + (a.landing.x - a.origin.x) * k, z: a.origin.z + (a.landing.z - a.origin.z) * k,
      yaw: a.jumpYaw, air: 3.0 * 4 * k * (1 - k),
    };
  },
  pose: mTrack([
    [0, {}], [0.35, { bodyY: -0.45, bodyPitch: 8, legL: 50, legR: 50, neck: -0.2 }], [0.7, { bodyY: -0.5, bodyPitch: 10, legL: 55, legR: 55 }],
    [0.9, { bodyY: 0.2, legL: -35, legR: -35, bodyPitch: -10, neck: -0.2 }], [1.3, { bodyY: 0, bodyPitch: 6, legL: 25, legR: 25, neck: 0.3 }],
    [1.42, { bodyY: -0.35, bodyPitch: 8, legL: 45, legR: 45 }], [1.9, { bodyY: -0.1, legL: 10, legR: 10 }], [2.2, {}],
  ]),
};

// ---- Schwanzwirbel: Schwanz hebt sich 0,6 s, dann 360-Grad-Drehung
const schwanz = {
  id: 'jaggo_schwanz', range: [0, 6], weight: 3, cooldown: 5, telegraph: 0.6, flashParts: ['tail'], duration: 1.9,
  hits: [{ t0: 0.62, t1: 1.35, shape: 'capsule', from: [0, 1.4, -2.2], to: [0, 1.3, -7.8], radius: 0.9, dmg: 15, knock: 'flinch' }],
  motion(tau, a) {
    const sign = a.r(0) < 0.5 ? 1 : -1;
    return { yaw: a.yaw0 + sign * Math.PI * 2 * smooth(clamp01((tau - 0.6) / 0.7)) };
  },
  pose: mTrack([
    [0, {}], [0.4, { tailPitch: -22, tailYaw: 0, bodyY: -0.15, bodyPitch: 4, legL: 20, legR: 20 }], [0.6, { tailPitch: -22, bodyY: -0.15 }],
    [0.8, { tailPitch: 0, tailYaw: -25, bodyY: -0.1 }], [1.3, { tailPitch: 0, tailYaw: -25, bodyY: -0.1 }], [1.9, {}],
  ]),
};

// ---- Rudelruf: Brüllen, ruft 2 Jagglinge, hält Pirscher im 8-m-Radius 1 s fest
const rudelruf = {
  id: 'jaggo_rudelruf', range: [0, 30], weight: 2, cooldown: 22, telegraph: 0.8, flashParts: ['head'], duration: 2.4,
  marker: { at: 'self', radius: 8 }, markerUntil: 1.15,
  cond: (m, ctx) => ctx.countMonsters('jaggling') < 3,
  hits: [{ t0: 1.0, t1: 1.1, shape: 'sphere', at: [0, 0.8, 0], radius: 8, dmg: 0, knock: 'pin' }],
  events: [{ t: 1.0, call: 'summon' }],
  calls: {
    // authority only: Jagglinge appear around Jaggo (max 3 alive in total)
    summon(m, ctx) {
      spawnPack(ctx, m.pos, 2, { state: 'combat', spread: 4, target: m.target });
    },
  },
  pose: mTrack([
    [0, {}], [0.6, { bodyPitch: -12, neck: -0.6, head: -40, bodyY: 0.15, tailPitch: -12 }], [1.0, { bodyPitch: -14, neck: -0.65, head: -45, bodyY: 0.2 }],
    [1.9, { bodyPitch: -12, neck: -0.6, head: -40 }], [2.4, {}],
  ]),
};

export const jaggo = {
  id: 'jaggo',
  name: 'Jaggo der Große',
  hp: 7000,
  scale: SC,
  bodyRadius: 1.5,
  walk: 2.6, run: 6.2, detect: 30, prefer: 4.5,
  parts: [
    { id: 'head', label: 'Kopf', factor: 1.0, breakHp: 600, jitter: 0.07, elem: { fire: 25, shock: 5 }, blunt: true, stunPart: true,
      spheres: [{ node: 'head', offset: [0, 0.05, 0.4], r: 0.5 }] },
    { id: 'body', label: 'Körper', factor: 0.7, elem: { fire: 10, shock: 10 },
      spheres: [{ node: 'body', offset: [0, 0, 0.55], r: 0.68 }, { node: 'body', offset: [0, 0, -0.45], r: 0.68 }, { node: 'neck', offset: [0, 0.3, 0], r: 0.38 }] },
    { id: 'legs', label: 'Beine', factor: 0.8, elem: { fire: 10, shock: 10 },
      spheres: [{ node: 'legL', offset: [0, -0.6, 0.15], r: 0.5 }, { node: 'legR', offset: [0, -0.6, 0.15], r: 0.5 }] },
    { id: 'tail', label: 'Schwanz', factor: 0.6, elem: { fire: 10, shock: 10 },
      spheres: [{ node: 'tail1', offset: [0, 0, -0.8], r: 0.45 }, { node: 'tail2', offset: [0, 0, -0.7], r: 0.35 }] },
  ],
  attacks: { jaggo_bissreihe: bissreihe, jaggo_huepfer: huepfer, jaggo_schwanz: schwanz, jaggo_rudelruf: rudelruf },
  build: () => buildRaptor({ scale: SC, skin: 'scale', crest: true }),
  onBreak(m, part) {
    if (part.id === 'head') {
      if (m.extra.crest) m.extra.crest.visible = false;
      if (m.extra.stump) m.extra.stump.visible = true;
    }
  },
  onRage(m, on) { m.extra.eyeMat?.color.set(on ? '#ff3020' : '#ffe14d'); },
};
