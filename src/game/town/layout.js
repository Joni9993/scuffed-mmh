// Rostnest layout: pure data + pure functions (no three.js) so it can be unit-tested and shared by the builder and the scene.
// Coordinates: metres, y up, yaw 0 faces +z (forward(yaw) = (sin yaw, cos yaw)). The town is ~54 x 54 m on a rocky plateau.

export const TOWN_HALF_X = 27;
export const TOWN_HALF_Z = 26.2; // north edge is the gate (decor continues outside, but nobody can walk there)
export const SPAWN = { x: 0, z: -11, yaw: 0 };
/** Spawn points for up to 4 members (side by side, facing the fire). */
export const SPAWNS = [{ x: 0, z: -11, yaw: 0 }, { x: -2.2, z: -11.6, yaw: 0 }, { x: 2.2, z: -11.6, yaw: 0 }, { x: 0, z: -13, yaw: 0 }];

/**
 * Stations. (x,z) = where the hunter stands to use it, r = interaction radius. `panel` = station panel id (ui/stations.js);
 * `npc` = optional person standing behind it (faces the interaction point).
 */
export const STATIONS = [
  { id: 'schmiede', label: 'Schmiede', panel: 'schmiede', x: -11.6, z: 5, r: 3.4, tag: null, npc: { name: 'Schmiedin Funke', x: -14.4, z: 4.4, kind: 'smith' } },
  { id: 'laden', label: 'Laden', panel: 'laden', x: 11.0, z: 6, r: 3.4, tag: null, npc: { name: 'Krämer Kiesel', x: 15.4, z: 6, kind: 'trader' } },
  { id: 'kochtopf', label: 'Kochtopf', panel: 'kochtopf', x: -10.3, z: -9, r: 3.2, tag: null, npc: { name: 'Koch Brösel', x: -13.7, z: -10.8, kind: 'cook' } },
  { id: 'truhe', label: 'Truhe', panel: 'truhe', x: 10.2, z: -9.5, r: 2.8, tag: 'Deine Truhe', npc: null },
  { id: 'auftragsbrett', label: 'Brett', panel: 'auftragsbrett', x: -6.2, z: 18.4, r: 4.2, tag: null, npc: { name: 'Brettwart Ole', x: -2.4, z: 20.2, kind: 'clerk' } },
  { id: 'tor', label: 'Abflugtor', panel: null, x: 0, z: 22.6, r: 3.8, tag: 'Abflugtor', npc: null },
  { id: 'spiegel', label: 'Spiegel', panel: 'spiegel', x: 9.6, z: 17.4, r: 2.8, tag: 'Spiegel', npc: null },
  { id: 'training', label: 'Training', panel: null, x: -11.5, z: 12.0, r: 2.6, tag: 'Trainingspuppe', npc: null },
];

/** Solid huts / stalls as rotated boxes: front is local +z (yaw maps local +z to (sin yaw, cos yaw)). h = height (camera clipping). */
export const BOXES = [
  { id: 'forge', x: -20, z: 5, w: 7.4, d: 5.2, h: 3.6, yaw: Math.PI / 2 },
  { id: 'shop', x: 19.6, z: 6, w: 7.4, d: 4.8, h: 3.6, yaw: -Math.PI / 2 },
  { id: 'counter', x: 13.2, z: 6, w: 4.2, d: 1.0, h: 1.1, yaw: -Math.PI / 2 },
  { id: 'cookhut', x: -19.6, z: -10.5, w: 6.4, d: 5, h: 3.4, yaw: Math.PI / 2 },
  { id: 'tent', x: 16.6, z: -10, w: 4.2, d: 4.2, h: 3, yaw: -Math.PI / 2 },
  { id: 'board', x: -7.6, z: 22.2, w: 6.4, d: 0.7, h: 4.4, yaw: Math.PI },
  { id: 'mirrorhut', x: 14.8, z: 21.4, w: 4.2, d: 4.4, h: 3.4, yaw: Math.PI },
  { id: 'hutA', x: -23.4, z: -1.4, w: 4.6, d: 3.6, h: 3.2, yaw: Math.PI / 2 },
  { id: 'hutB', x: 23.2, z: -1.6, w: 4.8, d: 3.6, h: 3.2, yaw: -Math.PI / 2 },
  { id: 'hutC', x: -21.6, z: 17.5, w: 4, d: 4, h: 3.2, yaw: 2.2 },
  { id: 'hutD', x: 22.6, z: -18.6, w: 4.4, d: 4.4, h: 3.4, yaw: -2.3 },
  { id: 'hutE', x: -8.6, z: -22.6, w: 4.6, d: 3.8, h: 3.2, yaw: 0.3 },
  { id: 'hutF', x: 7.4, z: -22.8, w: 4.2, d: 3.6, h: 3.2, yaw: -0.25 },
  { id: 'watch', x: -22.4, z: -19.6, w: 3.0, d: 3.0, h: 7.5, yaw: 0.6 },
];

/** Round obstacles: fire, crates, barrels, chest, posts, anvil, cauldron. */
export const CIRCLES = [
  { id: 'fire', x: 0, z: 0, r: 1.5, h: 1.0 },
  { id: 'anvil', x: -13.2, z: 2.6, r: 0.6, h: 1.1 },
  { id: 'cauldron', x: -11.8, z: -11.8, r: 1.0, h: 1.3 },
  { id: 'chest', x: 11.8, z: -9.5, r: 0.75, h: 1.0 },
  { id: 'gateL', x: -4.2, z: 25.9, r: 0.55, h: 6 },
  { id: 'gateR', x: 4.2, z: 25.9, r: 0.55, h: 6 },
  { id: 'pole1', x: 6.5, z: 9.5, r: 0.3, h: 5 },
  { id: 'pole2', x: -6.5, z: 9.5, r: 0.3, h: 5 },
  { id: 'crate1', x: 12.6, z: 11.5, r: 0.7, h: 1.3 },
  { id: 'crate2', x: 13.9, z: 12.2, r: 0.6, h: 1.1 },
  { id: 'barrel1', x: -14.8, z: 9.6, r: 0.6, h: 1.2 },
  { id: 'barrel2', x: -15.9, z: 10.4, r: 0.6, h: 1.2 },
  { id: 'crate3', x: 19.2, z: 12.6, r: 0.7, h: 1.3 },
  { id: 'crate4', x: -17.4, z: -3.8, r: 0.65, h: 1.2 },
  { id: 'barrel3', x: 5.2, z: -17.5, r: 0.6, h: 1.2 },
  { id: 'crate5', x: 14.2, z: -3.2, r: 0.7, h: 1.3 },
  { id: 'scrap1', x: -4.6, z: -17.2, r: 1.1, h: 1.8 },
  { id: 'scrap2', x: 17.8, z: 0.8, r: 1.0, h: 1.6 },
  { id: 'dummy', x: -11.5, z: 13.8, r: 0.55, h: 2.4 }, // Trainingspuppe (Station 'training' steht davor)
];

/** Ground height: gentle, mostly flat plateau. */
export function heightAtTown(x, z) {
  const k = Math.max(0, Math.hypot(x, z) - 8) / 30;
  return 0.16 * Math.sin(x * 0.23 + 1.3) * Math.cos(z * 0.19 - 0.4) * Math.min(1, k + 0.15) + 0.05 * Math.sin(x * 0.7 + z * 0.55);
}

/** Push a point (circle of `radius`) out of a rotated box. Mutates {x,z}. Returns true if it moved. */
export function pushOutOfBox(pos, radius, b) {
  const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
  const dx = pos.x - b.x, dz = pos.z - b.z;
  // into box-local (lx along box x, lz along box z); localToWorld: world = (lx*c + lz*s, -lx*s + lz*c)
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const hx = b.w / 2 + radius, hz = b.d / 2 + radius;
  if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) return false;
  const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
  let nx = lx, nz = lz;
  if (px < pz) nx = Math.sign(lx || 1) * hx; else nz = Math.sign(lz || 1) * hz;
  pos.x = b.x + nx * c + nz * s;
  pos.z = b.z - nx * s + nz * c;
  return true;
}

/** Collide a circle against the town: plateau edge + boxes + circles. Mutates pos. */
export function collideTown(pos, radius, boxes = BOXES, circles = CIRCLES) {
  for (let it = 0; it < 4; it++) {
    for (const b of boxes) pushOutOfBox(pos, radius, b);
    for (const k of circles) {
      const dx = pos.x - k.x, dz = pos.z - k.z, d = Math.hypot(dx, dz), min = k.r + radius;
      if (d < min) {
        if (d > 1e-4) { pos.x = k.x + (dx / d) * min; pos.z = k.z + (dz / d) * min; } else pos.x = k.x + min;
      }
    }
  }
  const mx = TOWN_HALF_X - radius, mz = TOWN_HALF_Z - radius;
  pos.x = Math.max(-mx, Math.min(mx, pos.x));
  pos.z = Math.max(-mz, Math.min(mz, pos.z));
  return pos;
}

/** True when a 3D point (camera) lies inside a solid, so the camera should be pulled in. */
export function insideSolid(x, y, z, pad = 0.35, boxes = BOXES, circles = CIRCLES) {
  const p = { x, z };
  for (const b of boxes) if (y < b.h && pushOutOfBox(p, pad, { ...b }) ) return true;
  for (const k of circles) if (y < k.h && Math.hypot(x - k.x, z - k.z) < k.r + pad) return true;
  return false;
}

/**
 * Which station would the context button use? The closest one measured in radii (so a small station next to a big one still wins when
 * you stand on it). Returns the station or null.
 */
export function pickStation(x, z, stations = STATIONS) {
  let best = null, bs = Infinity;
  for (const s of stations) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d > s.r) continue;
    const score = d / s.r;
    if (score < bs) { bs = score; best = s; }
  }
  return best;
}

export const stationById = (id) => STATIONS.find((s) => s.id === id) ?? null;
