/** Seeded PRNG (mulberry32). All simulation randomness goes through this. */
export function createRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = next;
  rng.range = (a, b) => a + (b - a) * next();
  rng.int = (a, b) => Math.floor(rng.range(a, b + 1));
  rng.chance = (p) => next() < p;
  rng.pick = (arr) => arr[Math.floor(next() * arr.length)];
  rng.sign = () => (next() < 0.5 ? -1 : 1);
  rng.state = () => s;
  return rng;
}
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
