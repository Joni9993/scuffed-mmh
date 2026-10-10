// [L] Spawns the neutral fauna of a hunt (host/solo only; guests get the animals through monster snapshots).
import { createRng } from '../core/rng.js';
import { Herd } from './monsters/herd.js';

export const HERD_COUNT = 3, HOPPLER_GROUPS = [1, 1, 2, 4, 4];

/** -> { herds:[Herd], groups:[Herd] }. Deterministic from the hunt seed. */
export function spawnFauna(hunt) {
  const w = hunt.world, rng = createRng((hunt.seed ^ 0xfa07a) >>> 0), out = { herds: [], groups: [] };
  if (w.id !== 'schotterklamm' || !w.zones) return out;
  const L = w.layout, seed = () => rng.int(1, 1e9);
  const used = new Set();
  [1, 1, 3].slice(0, HERD_COUNT).forEach((zone, hi) => {
    const free = (w.pastures ?? []).filter((p) => p.zone === zone && !used.has(p.id));
    if (!free.length) return;
    const pa = free[Math.floor(rng() * free.length)];
    used.add(pa.id);
    const herd = new Herd({ id: `h${hi}`, kind: 'mampfer', ctx: hunt, rng: createRng(seed()), pastures: (w.pastures ?? []).filter((p) => p.zone === zone), pasture: pa });
    const n = rng.int(3, 5), calves = n >= 4 ? rng.int(1, 2) : 1;
    const roles = ['bull'];
    for (let i = 1; i < n; i++) roles.push(i > n - 1 - calves ? 'calf' : 'cow');
    roles.forEach((role, i) => {
      const a = (i / n) * Math.PI * 2 + rng(), r = 1.5 + rng() * 2.5;
      const x = pa.x + Math.cos(a) * r, z = pa.z + Math.sin(a) * r;
      const def = role === 'bull' ? 'mampferbulle' : role === 'calf' ? 'mampferkalb' : 'mampfer';
      const m = hunt.spawnMonster(def, { x, z, yaw: rng() * 6.28, state: 'graze', id: `mampfer-${hi}-${i}`, seed: seed() });
      herd.add(m, role);
    });
    out.herds.push(herd);
  });
  const placed = [];
  HOPPLER_GROUPS.forEach((zone, gi) => {
    const zc = w.zones[zone - 1];
    for (let t = 0; t < 80; t++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 42, x = zc.x + Math.cos(a) * r, z = zc.z + Math.sin(a) * r;
      if (w.zoneAt(x, z) !== zone || !L.walkable(x, z, 3) || !L.reachable(x, z) || L.groundType(x, z) === 'lava' || L.groundType(x, z) === 'mud') continue;
      if (Math.hypot(x - w.campPoint.x, z - w.campPoint.z) < 22 || placed.some((q) => Math.hypot(x - q.x, z - q.z) < 25)) continue;
      placed.push({ x, z });
      const herd = new Herd({ id: `g${gi}`, kind: 'hoppler', ctx: hunt, rng: createRng(seed()), home: { x, z, r: 6 } });
      const n = rng.int(3, 5);
      for (let i = 0; i < n; i++) {
        const b = rng() * 6.28, rr = 0.8 + rng() * 2.2;
        herd.add(hunt.spawnMonster('hoppler', { x: x + Math.cos(b) * rr, z: z + Math.sin(b) * rr, yaw: rng() * 6.28, state: 'graze', id: `hoppler-${gi}-${i}`, seed: seed() }));
      }
      out.groups.push(herd);
      break;
    }
  });
  return out;
}
