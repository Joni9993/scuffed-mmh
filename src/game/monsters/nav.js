// Coarse navigation grid + A* for Brocken / small monsters. Built once per world (cached), pure + deterministic.
// Worlds without a `layout` (test arena, stub worlds) get null -> callers fall back to straight-line steering.
const CELL = 2;
const cache = new WeakMap();

export function getNav(world) {
  if (!world) return null;
  if (cache.has(world)) return cache.get(world);
  const nav = world.layout?.sdfAt ? buildNav(world) : null;
  cache.set(world, nav);
  return nav;
}

function buildNav(world) {
  const L = world.layout;
  const half = world.bounds ? world.bounds.maxX : 120;
  const N = Math.round((half * 2) / CELL);
  const blocked = new Uint8Array(N * N);
  const cx = (i) => -half + (i + 0.5) * CELL;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = cx(i), z = cx(j);
    let b = L.sdfAt(x, z) < 1.2 || L.groundType(x, z) === 'lava';
    if (!b) for (const c of L.colliders) { if (Math.abs(c.x - x) < c.r + 1.2 && Math.abs(c.z - z) < c.r + 1.2 && Math.hypot(c.x - x, c.z - z) < c.r + 0.9) { b = true; break; } }
    blocked[j * N + i] = b ? 1 : 0;
  }
  const cell = (x, z) => {
    const i = Math.floor((x + half) / CELL), j = Math.floor((z + half) / CELL);
    return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i;
  };
  const free = (x, z) => { const k = cell(x, z); return k >= 0 && !blocked[k]; };
  /** Straight segment clear of blocked cells? */
  const los = (ax, az, bx, bz) => {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.9);
    for (let s = 1; s <= n; s++) { const t = s / n; if (!free(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
    return true;
  };
  /** Nearest free cell centre (ring search over cells). */
  const snap = (x, z) => {
    if (free(x, z)) return { x, z };
    const k0 = cell(Math.max(-half + 1, Math.min(half - 1, x)), Math.max(-half + 1, Math.min(half - 1, z)));
    const i0 = k0 % N, j0 = (k0 / N) | 0;
    for (let r = 1; r < N; r++) {
      let best = null, bd = 1e9;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= N || j >= N || blocked[j * N + i]) continue;
        const d = Math.hypot(cx(i) - x, cx(j) - z);
        if (d < bd) { bd = d; best = { x: cx(i), z: cx(j) }; }
      }
      if (best) return best;
    }
    return { x, z };
  };
  const g = new Float32Array(N * N), from = new Int32Array(N * N), seen = new Uint32Array(N * N), closed = new Uint32Array(N * N);
  let stamp = 0;
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
  /**
   * A* from (ax,az) to (bx,bz). `avoid` = optional Set of cell indices treated as blocked (stuck recovery).
   * Returns waypoints [{x,z}...] (string-pulled, excludes start, includes goal) or null.
   */
  function find(ax, az, bx, bz, avoid = null) {
    const s = snap(ax, az), e = snap(bx, bz);
    const sk = cell(s.x, s.z), ek = cell(e.x, e.z);
    if (sk < 0 || ek < 0) return null;
    stamp++;
    const heap = [];
    const push = (f, k) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last; let c = 0;
        for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; }
      }
      return top;
    };
    const ex = cx(ek % N), ez = cx((ek / N) | 0);
    const h = (k) => Math.hypot(cx(k % N) - ex, cx((k / N) | 0) - ez) / CELL;
    g[sk] = 0; seen[sk] = stamp; from[sk] = -1; push(h(sk), sk);
    let found = false, budget = N * N; // bounded; callers back off 1.5 s after a failed search
    while (heap.length && budget-- > 0) {
      const k = pop()[1];
      if (closed[k] === stamp) continue;
      closed[k] = stamp;
      if (k === ek) { found = true; break; }
      const i = k % N, j = (k / N) | 0;
      for (const [di, dj, c] of DIRS) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni;
        if (blocked[nk] || closed[nk] === stamp || (avoid && avoid.has(nk))) continue;
        if (di && dj && (blocked[j * N + ni] || blocked[nj * N + i])) continue; // no corner cutting
        const ng = g[k] + c;
        if (seen[nk] !== stamp || ng < g[nk]) { seen[nk] = stamp; g[nk] = ng; from[nk] = k; push(ng + h(nk), nk); }
      }
    }
    if (!found) return null;
    const raw = [];
    for (let k = ek; k !== -1; k = from[k]) raw.push({ x: cx(k % N), z: cx((k / N) | 0) });
    raw.reverse();
    raw[raw.length - 1] = free(bx, bz) ? { x: bx, z: bz } : e;
    // string-pulling: greedily skip to the farthest waypoint in line of sight
    const out = [];
    let cur = { x: ax, z: az }, idx = 0;
    while (idx < raw.length) {
      let far = idx;
      for (let t = raw.length - 1; t > idx; t--) { if (los(cur.x, cur.z, raw[t].x, raw[t].z)) { far = t; break; } }
      out.push(raw[far]); cur = raw[far]; idx = far + 1;
    }
    return out;
  }
  return { CELL, N, half, blocked, cell, free, los, snap, find };
}
