import * as THREE from 'three';

// "Der Hahn fällt": short in-engine cinematic between rooster and Eye (gockelForm 'reveal').
// Every client plays it locally from the replicated gockelForm/formTime; only the authority
// decides when the Eye begins (formTime >= CINE_LEN). First viewing is never skippable; later
// viewings can be skipped with interact (solo: straight into the Eye, co-op: only the own view).
export const CINE_LEN = 8.5, OPEN_AT = 4.2, TITLE_AT = 6.1;
const SEEN_KEY = 'sh.gockelok.cineSeen';
export function cineSeen() { try { return globalThis.localStorage?.getItem(SEEN_KEY) === '1'; } catch { return false; } }
export function markCineSeen() { try { globalThis.localStorage?.setItem(SEEN_KEY, '1'); } catch { /* private mode */ } }

const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const _v = new THREE.Vector3();
// [time, sfx, extra] — fired once when formTime crosses the time
const BEATS = [
  [0, 'heavy', (m, c) => c.fx?.shake?.(0.5, 0.4)],
  [1.05, 'break', (m, c) => { const h = head(m); c.fx?.spark?.(h, 18, '#ff3344', 4); }],
  [3.6, 'phase'],
  [OPEN_AT, 'boom', (m, c) => { c.fx?.glitch?.(0.45); c.fx?.shake?.(0.6, 0.6); }],
  [TITLE_AT, 'glitch'],
  [CINE_LEN - 0.45, null, (m, c) => c.fx?.flash?.('rgba(110,240,230,.55)', 0.5)],
];
function head(m) { const n = m.nodes?.head; if (!n) return { x: m.pos.x, y: m.pos.y + 2, z: m.pos.z }; n.getWorldPosition(_v); return { x: _v.x, y: _v.y, z: _v.z }; }

function start(m) {
  const ctx = m.ctx, c = (m.cine = { t: -1, skippable: ctx.gockelokPreview ? !!ctx.gockelokPreviewSeen : cineSeen(), ended: false, glow: null });
  if (ctx.scene && m.nodes?.head) { // corruption light on the comb: additive glow, no real light (no shader recompile mid-fight)
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2a3c, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.position.set(0, 0.35, 0.05); m.nodes.head.add(g); c.glow = g;
  }
  ctx.cineLock = true;
  ctx.app?.touch?.setVisible?.(false);
}
function releaseView(m) {
  const ctx = m.ctx, c = m.cine;
  if (!c || c.ended) return;
  c.ended = true;
  if (c.glow) { c.glow.removeFromParent(); c.glow.geometry.dispose(); c.glow.material.dispose(); c.glow = null; }
  ctx.cineLock = false; ctx.cineSkip = false;
  if (ctx.rig) { ctx.rig.cine = null; const p = ctx.player ?? ctx.players.find((q) => q.local); if (p) ctx.rig.snap(p.pos, p.rot); }
  ctx.hud?.cinema?.(null);
  if (!ctx.panelOpen) ctx.app?.touch?.setVisible?.(true);
}
export function endCine(m) { releaseView(m); m.cine = null; }

/** Camera choreography relative to the fall spot. Returns {pos, look}. */
export function cineShot(m, t) {
  const w = m.ctx.world, f = m.revealPos ?? m.fallPos ?? m.pos, gy = w.heightAt(f.x, f.z), r = m.rot ?? 0;
  const at = (ang, dist, y) => ({ x: f.x + Math.sin(ang) * dist, y: gy + y, z: f.z + Math.cos(ang) * dist });
  let pos, look;
  if (t < 2.2) { const u = t / 2.2; pos = at(r + 1.15 + u * 0.35, lerp(9.5, 8, u), lerp(2.6, 2, u)); look = { x: f.x, y: gy + lerp(2.2, 1.1, sm(u * 1.4)), z: f.z }; }
  else if (t < OPEN_AT) { const u = (t - 2.2) / (OPEN_AT - 2.2); pos = at(r + 2.7 + u * 0.1, lerp(19, 16, u), lerp(9, 8, u)); look = { x: f.x, y: gy + 0.6, z: f.z }; }
  else if (t < 6.4) { const u = (t - OPEN_AT) / (6.4 - OPEN_AT); pos = at(r, lerp(6.5, 5, u), lerp(12, 10, u)); look = { x: f.x, y: gy, z: f.z }; }
  else { const u = sm((t - 6.4) / (CINE_LEN - 6.4)); pos = at(r, lerp(4.5, 0.6, u), lerp(9, 2.2, u)); look = { x: f.x, y: gy - 1.5, z: f.z }; }
  pos.y = Math.max(pos.y, w.heightAt(pos.x, pos.z) + 1);
  const shot = t < 2.2 ? 0 : t < OPEN_AT ? 1 : t < 6.4 ? 2 : 3;
  const snap = !m.cine || m.cine.shot !== shot;
  if (m.cine) m.cine.shot = shot;
  return { owner: m.id, pos, look, snap };
}

/** Rooster pose during the cinematic: collapse, lie still, sink into the opening eye. */
export function cinePose(m, p) {
  const t = m.formTime, k = sm(t / 1.4), sink = sm((t - OPEN_AT - 0.6) / 3);
  p.bodyY = lerp(p.bodyY ?? 0, -1, k) - sink * 3.2;
  p.bodyRoll = lerp(p.bodyRoll ?? 0, 65, k); p.neck = lerp(p.neck ?? 0, 0.6, k); p.head = lerp(p.head ?? 0, 35, k); p.wing = lerp(p.wing ?? 0, 30, k);
}

/** Per frame on every client (host + guests). onAuthoritySkip: solo skip straight into the Eye. */
export function tickCine(m, dt, onAuthoritySkip) {
  const ctx = m.ctx;
  if (m.gockelForm !== 'reveal' || !m.alive) { if (m.cine) endCine(m); return; }
  if (!m.cine) start(m);
  const c = m.cine, t = m.formTime;
  for (const [bt, name, fn] of BEATS) if (c.t < bt && t >= bt) { if (name) ctx.bus.emit('sfx', { name, pos: m.pos }); fn?.(m, ctx); }
  c.t = t;
  if (t >= CINE_LEN - 1) {
    if (ctx.gockelokPreview) ctx.gockelokPreviewSeen = true;
    else markCineSeen();
  }
  for (const p of ctx.players) if (p.local) p.invuln = Math.max(p.invuln ?? 0, 0.5);
  if (c.ended) return;
  if (c.glow) { const life = 1 - sm((t - 0.5) / 1.1), flick = t > 0.5 && t < 1.6 ? (Math.sin(t * 61) > 0.2 ? 1 : 0.25) : 1; c.glow.material.opacity = 0.8 * life * flick; c.glow.visible = life > 0.01; }
  const skip = ctx.cineSkip || ctx.input?.b?.context?.pressed;
  ctx.cineSkip = false;
  if (skip && c.skippable && t > 0.3) {
    if (m.authority && !ctx.net) { onAuthoritySkip?.(m); if (m.gockelForm !== 'reveal') endCine(m); return; }
    releaseView(m); return;
  }
  ctx.cineLock = true;
  if (ctx.rig) ctx.rig.cine = cineShot(m, t);
  const bars = Math.min(sm(t / 0.5), sm((CINE_LEN + 0.3 - t) / 0.5));
  ctx.hud?.cinema?.({
    bars,
    title: t >= TITLE_AT ? 'AUGE DES GLITCH' : '',
    sub: t >= TITLE_AT + 0.5 ? 'Unter dem Ur-Hahn hat es die ganze Zeit gesehen.' : t < 1.6 ? 'Der Hahn fällt …' : '',
    titleK: sm((t - TITLE_AT) / 0.6),
    hint: c.skippable ? 'Interagieren: Überspringen' : '',
    fade: sm((t - (CINE_LEN - 0.5)) / 0.4),
  });
}
