// Glitch-System (GDD 16.2). Energie 0-100 pro lokalem Pirscher, Glitch-Modus 8 s per Button, +30 % Schaden.
// Logik ist DOM-/THREE-frei (Bus + player.ctx optional) und in tests/unit/glitch.test.js getestet.
//
// player.glitch = { energy, active, t }   p.glitching (Getter, bool)   p.glitchDmgMul (Getter, 1 | 1,3)
// Waffen-Hook (optional, am Waffen-Def `p.def.glitch`):
//   { name, onStart(p), onEnd(p), tick(p, dt), onHit(p, res, monster) }
// Bus: 'glitchStart' {player}, 'glitchEnd' {player}, 'glitchReady' {player}

export const GLITCH = {
  MAX: 100,
  DURATION: 8,
  DMG_MUL: 1.3,
  FREEZE: 0.2, // Eintritts-Frame-Freeze (s)
  GAIN: { counter: 35, katana: 25, partBreak: 15, hit: 1 },
  BREAK_WINDOW: 1.0, // s: Teilbruch zählt, wenn der eigene Treffer so kurz zurückliegt (Gast: Bruch kommt per Netz)
};

export function initGlitch(p) {
  p.glitch = { energy: 0, active: false, t: 0 };
  return p.glitch;
}

const g = (p) => p.glitch ?? initGlitch(p);
const hook = (p) => p.def?.glitch ?? null;
const busOf = (p) => p.ctx?.bus;

export const isGlitching = (p) => !!p.glitch?.active;
export const glitchDmgMul = (p) => (p.glitch?.active ? GLITCH.DMG_MUL : 1);

/** Energie addieren (Mutator: hunt.mods.player.glitchGainMul). Im Modus wird nicht gesammelt. Gibt den Zuwachs zurück. */
export function addGlitchEnergy(p, amount, source = 'x') {
  const s = g(p);
  if (s.active || amount <= 0) return 0;
  const mul = p.ctx?.mods?.player?.glitchGainMul ?? 1;
  const before = s.energy;
  s.energy = Math.min(GLITCH.MAX, s.energy + amount * mul);
  if (before < GLITCH.MAX && s.energy >= GLITCH.MAX) busOf(p)?.emit('glitchReady', { player: p, source });
  return s.energy - before;
}

export const glitchReady = (p) => !g(p).active && g(p).energy >= GLITCH.MAX;

/** Glitch-Modus starten (nur bei 100 Energie). */
export function activateGlitch(p) {
  const s = g(p);
  if (!glitchReady(p)) return false;
  s.active = true; s.t = GLITCH.DURATION; s.energy = GLITCH.MAX;
  hook(p)?.onStart?.(p);
  busOf(p)?.emit('glitchStart', { player: p });
  return true;
}

export function endGlitch(p) {
  const s = g(p);
  if (!s.active) return;
  s.active = false; s.t = 0; s.energy = 0;
  hook(p)?.onEnd?.(p);
  busOf(p)?.emit('glitchEnd', { player: p });
}

/** Pro Sim-Schritt (player.update, nur lokal). */
export function tickGlitch(p, dt) {
  const s = p.glitch;
  if (!s?.active) return;
  s.t -= dt;
  s.energy = Math.max(0, (s.t / GLITCH.DURATION) * GLITCH.MAX); // Leiste läuft sichtbar leer
  hook(p)?.tick?.(p, dt);
  if (s.t <= 0) endGlitch(p);
}

/**
 * Bus verdrahten (hunt.js). Nur der lokale Pirscher sammelt Energie und zählt Statistik.
 * Rückgabe trägt `hitting` (von hunt.playerHit um applyMonsterHit herum gesetzt) und detach().
 */
export function attachGlitch(h) {
  const st = { hitting: null, lastHit: new Map() };
  const local = () => h.player;
  const isMine = (pl) => !pl || pl.local;
  const offs = [];
  offs.push(h.bus.on('glitchCounter', (e) => { if (isMine(e?.player)) addGlitchEnergy(local(), GLITCH.GAIN.counter, 'counter'); }));
  // Katana-Konterhaltung: player.#counter() emittiert 'counter' {player, key}
  offs.push(h.bus.on('counter', (e) => { if (isMine(e?.player)) addGlitchEnergy(e?.player ?? local(), GLITCH.GAIN.katana, 'katana'); }));
  offs.push(h.bus.on('partBreak', (e) => {
    const p = local();
    if (!p) return;
    const mine = st.hitting === p || (e?.monster && h.time - (st.lastHit.get(e.monster.id) ?? -99) <= GLITCH.BREAK_WINDOW);
    if (mine) addGlitchEnergy(p, GLITCH.GAIN.partBreak, 'partBreak');
  }));
  offs.push(h.bus.on('hit', (res) => {
    const p = res?.player;
    if (!p || !p.local) return;
    if (res.monster) st.lastHit.set(res.monster.id, h.time);
    if (p.glitch?.active) {
      h.stats.glitchDmg = (h.stats.glitchDmg ?? 0) + (res.dmg ?? 0);
      hook(p)?.onHit?.(p, res, res.monster);
    } else addGlitchEnergy(p, GLITCH.GAIN.hit, 'hit');
  }));
  return Object.assign(st, { detach() { offs.forEach((o) => o?.()); } });
}

// ---------------------------------------------------------------- Pirscher-Optik (kein Material-Neubau: Emissive der vorhandenen Materialien)
const CYAN = [0.0, 0.55, 0.7], MAGENTA = [0.75, 0.0, 0.55];

/** Flackern/RGB-Versatz am Pirscher-Mesh (eigener und fremder Pirscher); pro Frame NACH dem Mesh-Update aufrufen. */
export function glitchVisual(p, time) {
  const s = p.glitch, m = p.mesh;
  if (!m || !s) return;
  if (!s.active) {
    if (s._vis) { // einmaliges Zurücksetzen
      for (const e of s._vis) e.mat.emissive.copy(e.orig);
      s._vis = null; m.scale.set(1, 1, 1);
    }
    return;
  }
  if (!s._vis) {
    s._vis = []; const seen = new Set();
    m.traverse((o) => {
      const mt = o.material;
      if (mt && mt.emissive && !seen.has(mt)) { seen.add(mt); s._vis.push({ mat: mt, orig: mt.emissive.clone() }); }
    });
  }
  const step = Math.floor(time * 24);
  const c = step % 2 ? CYAN : MAGENTA;
  for (const e of s._vis) e.mat.emissive.setRGB(c[0], c[1], c[2]);
  const jit = step % 11 === 0;
  m.scale.set(jit ? 1.08 : 1, step % 5 === 0 ? 0.94 : 1, jit ? 1.08 : 1); // Scanline-Stauchung
  m.visible = step % 13 !== 0; // kurzes Aussetzen = Flackern
}
