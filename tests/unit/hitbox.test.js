import { describe, it, expect } from 'vitest';
import { sphere, capsule, overlap, distSqSegmentSegment } from '../../src/game/hitbox.js';

describe('hitbox overlaps', () => {
  it('sphere-sphere', () => {
    expect(overlap(sphere(0, 0, 0, 1), sphere(1.9, 0, 0, 1))).toBe(true);
    expect(overlap(sphere(0, 0, 0, 1), sphere(2.1, 0, 0, 1))).toBe(false);
  });
  it('capsule-sphere uses the segment, not just the endpoints', () => {
    const c = capsule({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }, 0.5);
    expect(overlap(c, sphere(1, 0, 5, 0.6))).toBe(true);
    expect(overlap(c, sphere(1, 0, 5, 0.4))).toBe(false);
    expect(overlap(sphere(1, 0, 5, 0.6), c)).toBe(true);
    expect(overlap(c, sphere(0, 0, 11.4, 1))).toBe(true);
    expect(overlap(c, sphere(0, 0, 12, 1))).toBe(false);
  });
  it('capsule-capsule', () => {
    const a = capsule({ x: -5, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, 0.5);
    const b = capsule({ x: 0, y: 0.8, z: -5 }, { x: 0, y: 0.8, z: 5 }, 0.5);
    expect(overlap(a, b)).toBe(true);
    const c = capsule({ x: 0, y: 1.2, z: -5 }, { x: 0, y: 1.2, z: 5 }, 0.5);
    expect(overlap(a, c)).toBe(false);
    expect(distSqSegmentSegment({ x: -5, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 0, y: 2, z: -5 }, { x: 0, y: 2, z: 5 })).toBeCloseTo(4);
  });
});
