// Blendax, der Flimmerfürst (Smaragdküste, JR 7 -> 8): Jaggos schneller, böser Vetter mit einem Schirm wie ein kaputter Fernseher.
// Signatur: BLITZ (Schirm klappt auf und flackert, 1 s später 1 s Vollbild-Weiß + 1 s Sterne für alle, die hinsehen) und danach die Sprungkette.
// Wegdrehen = sicher. Hinsehen + im richtigen Moment rollen = Glitch-Konter: Blendax taumelt knapp 2 s.
// Farbregel (docs/SMARAGD_BROCKEN.md 1.2): alle Glitch-Effekte dieses Brockens sind Hacker-Neongrün, nie Cyan/Magenta.
// Baut auf Jaggo auf (Angriffe werden NACH Jaggos Tempo-/Größen-Anpassung geklont, siehe retune() in common.js).
import * as THREE from 'three';
import { basic } from '../../render/ps1.js';
import { tex, registerTexture } from '../../render/textures.js';
import { buildRaptor } from './raptor.js';
import { mTrack } from './monster.js';
import { jaggo } from './jaggo.js';
import { retune, severTail, clamp01 } from './common.js';
import { angleDiff, yawOf } from '../../core/math.js';

const SC = 1.5;
const R = Math.PI / 180;
const NEON = '#39ff14', NEON_HI = '#7dff3a', NEON_PEAK = '#d8ffd0';
const cue = (tone, color = NEON) => ({ color, tone, noShift: true }); // noShift: Kettenglieder verschieben sonst den Farbton aus dem Grünbereich
const ring = (radius) => ({ at: 'self', radius, color: NEON, peak: NEON_PEAK });

export const BLENDAX = {
  BLITZ_CD: 14, BLITZ_CD_FOG: 9, FURY: 25, SHORT: 6, DIZZY: 1.8, FACE_DEG: 80, FOG_ZONE: 3,
};

// ---- Texturen: Haut ziegelrot/orange mit blauem Rücken, Schirm = kaputtes Testbild (nur Schwarz/Weiß/Grüntöne)
registerTexture('blendax_scale', (g, n, rnd) => {
  g.fillStyle = '#c0452a'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#e8873a';
  for (let i = 0; i < n * 2; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1);
  g.fillStyle = '#7a2418';
  for (let y = 2; y < n; y += 4) g.fillRect(0, y, n, 1);
  g.fillStyle = '#2f5fd0'; // blauer Rückenstreifen
  g.fillRect(0, 0, n, 3);
});
registerTexture('blendax_frill', (g, n, rnd) => {
  g.fillStyle = '#05100a'; g.fillRect(0, 0, n, n);
  const bars = [NEON, NEON_HI, NEON_PEAK, '#1f9d0f', '#ffffff', NEON, '#1f9d0f', NEON_HI]; // Testbild-Balken
  const bw = Math.max(2, Math.floor(n / bars.length));
  for (let i = 0; i < bars.length; i++) { g.fillStyle = bars[i]; g.fillRect(i * bw, Math.floor(n * 0.12), bw, Math.floor(n * 0.5)); }
  for (let y = 0; y < n; y++) { // zerrissene Blöcke: Zeilen seitlich versetzt kopiert
    if (rnd() < 0.18) { const off = ((rnd() * 8) | 0) - 4, h = 1 + ((rnd() * 3) | 0); g.drawImage(g.canvas, 0, y, n, h, off, y, n, h); }
  }
  g.fillStyle = '#0b2a0b';
  for (let y = 0; y < n; y += 2) g.fillRect(0, y, n, 1); // Scanlines
  g.fillStyle = '#ffffff';
  for (let i = 0; i < n; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1); // Schnee
  g.fillStyle = NEON; g.fillRect(0, Math.floor(n * 0.78), n, 2); // Balken unten
});

/**
 * Blendax-Modell: buildRaptor (Haut blendax_scale, Schirm-Mod). Der Schirm ist ein eigener Teil `frill` (Basic-Material, kein Nebel: im Dschungeldunst
 * immer lesbar), spread (0..1) klappt ihn auf, ein additiver Halo dahinter pulsiert während des Blitzes.
 */
export function buildBlendax({ scale = SC } = {}) {
  const b = buildRaptor({ scale, skin: 'blendax_scale', crest: true, eye: '#ffe14d' });
  const crest = b.extra.crest;
  const frillMat = basic({ map: tex('blendax_frill', { size: 32 }), side: THREE.DoubleSide, fog: false });
  crest.material = frillMat;
  crest.position.set(0, 0.2, -0.25);
  b.partMeshes.head = b.partMeshes.head.filter((m) => m !== crest);
  b.partMeshes.frill = [crest];
  const halo = new THREE.Mesh(new THREE.CircleGeometry(1.1, 12, Math.PI * 0.02, Math.PI * 0.96), basic({ color: NEON, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  halo.position.set(0, 0.2, -0.3);
  halo.visible = false;
  crest.parent.add(halo);
  const apply0 = b.apply;
  b.apply = (p) => {
    apply0(p);
    const k = 0.62 + 0.38 * Math.max(0, Math.min(1, p.spread)); // Ruhe: halb aufgeklappt (gut sichtbar), Blitz: voll
    crest.scale.set(2.5 * k, 2.4 * (0.6 + 0.4 * k), 1);
    halo.scale.set(2.5 * k * 1.2, 2.4 * (0.6 + 0.4 * k) * 1.15, 1);
  };
  b.extra.frillMat = frillMat;
  b.extra.halo = halo;
  return b;
}

// ---------------------------------------------------------------- Angriffe
const J = jaggo.attacks;
const TEMPO = 1.3;

// Klone von Jaggo (nach dessen +25-%-Tempo-/+20-%-Größen-Block): härter, schneller, neongrüne Telegraph-Ringe
const bissreihe = retune(J.jaggo_bissreihe, { id: 'blendax_bissreihe', dmg: 17, tempo: TEMPO, cue: cue('klick', NEON_HI), audit: [2.5, 4.5], marker: ring(6), markerUntil: 0.75 });
bissreihe.weight = (m) => (m.partById.head?.broken ? 6 : 4);

const huepfer = retune(J.jaggo_huepfer, { id: 'blendax_huepfer', dmg: 32, tempo: TEMPO, cue: cue('brumm'), range: [3.5, 12], audit: [5, 9], marker: { at: 'landing', radius: 3.6, color: NEON, peak: NEON_PEAK } });
huepfer.prepare = (a) => {
  const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz) || 1;
  const len = Math.min(12, Math.max(3, d));
  a.landing = { x: a.origin.x + (dx / d) * len, z: a.origin.z + (dz / d) * len };
  a.jumpYaw = yawOf(dx, dz);
};

const schwanz = retune(J.jaggo_schwanz, { id: 'blendax_schwanz', dmg: 24, tempo: TEMPO, cue: cue('zisch', NEON_PEAK), audit: [1.5, 4], marker: ring(7.2), markerUntil: 0.8 });
const rueckhuepfer = retune(J.jaggo_rueckhuepfer, { id: 'blendax_rueckhuepfer', dmg: 24, tempo: TEMPO, cue: cue('knurr'), audit: [1.5, 3.5], marker: ring(7.5), markerUntil: 0.75 });
const zickzack = retune(J.jaggo_zickzack, { id: 'blendax_zickzack', dmg: [15, 15, 15, 20], tempo: TEMPO, cue: cue('schrill', NEON_HI), audit: [3, 6], marker: ring(7), markerUntil: 0.85 });
zickzack.weight = (m) => (m.partById.tail?.broken ? 6 : m.partById.frill?.broken ? 5 : 3);
const hetzjagd = retune(J.jaggo_hetzjagd, { id: 'blendax_hetzjagd', dmg: [30, 24], tempo: TEMPO, cue: cue('droehn', NEON_PEAK), audit: [8, 14], marker: { at: 'landing', radius: 2.6, color: NEON, peak: NEON_PEAK } });

// ---- Blitz: Schirm klappt auf (0,3 s), flackert 24 Hz; bei t = 1,0 s blendet er alle, die ihn ansehen (Kamera zeigt zu Blendax, ±80 Grad).
const facing = (m, p, deg) => Math.abs(angleDiff(m.ctx.cameraYaw ?? p.rot, yawOf(m.pos.x - p.pos.x, m.pos.z - p.pos.z))) <= deg * R;
const targetDist = (m) => (m.target ? Math.hypot(m.target.pos.x - m.pos.x, m.target.pos.z - m.pos.z) : 99);
const OPEN = { spread: 1, head: -10, neck: -0.25, bodyPitch: -6, bodyY: 0.1, tailPitch: -10 };
const blitz = {
  id: 'blendax_blitz', lockedByBreak: 'frill', range: [4, 45], weight: 3.5, cooldown: 4, telegraph: 1.0, flashParts: ['frill'], duration: 2.2,
  cue: cue('schrill', NEON_PEAK), audit: [6, 14], stam: 10,
  cond: (m) => !(m.extra.blitzT > 0) && !(m.extra.blitzLock > 0) && targetDist(m) <= (m.fogged ? 45 : 30),
  marker: { at: 'self', radius: 12, color: NEON, peak: NEON_PEAK }, markerUntil: 1.15,
  // Kugel r 60 am Brocken, kein Schaden: wirkt nur auf den, der hinsieht (faceCheck); 'perfect' beim Rollen im richtigen Moment = Glitch-Konter
  hits: [{ t0: 1.0, t1: 1.12, shape: 'sphere', at: [0, 1.5, 0], radius: 60, dmg: 0, knock: 'none', faceCheck: BLENDAX.FACE_DEG, status: { type: 'blend' } }],
  events: [{ t: 0, call: 'warn', all: true }],
  calls: {
    // läuft auf JEDEM Client: wer Blendax im Bild hat, sieht den kaputten Bildschirm (reine Warnung, kein Schaden)
    warn(m, ctx) {
      ctx.bus.emit('sfx', { name: 'blendFlash', pos: m.pos });
      const p = ctx.players.find((q) => q.local && q.alive);
      if (p && facing(m, p, 100)) ctx.fx.brokenScreen?.(1.0, 'NICHT HINSEHEN!');
    },
  },
  pose: mTrack([
    [0, {}], [0.3, OPEN], [1.12, { ...OPEN, bodyY: 0.15 }], [1.5, { ...OPEN, spread: 0.6 }], [2.2, {}],
  ]),
};

// ---- Sprungkette: je Sprung neues Ziel = Position des Pirschers beim Start (Landemarker zeigt wohin). 3 Glieder, das letzte wirft um.
function sprung(i) {
  const tg = [0.55, 0.5, 0.5][i], dur = [1.4, 1.35, 1.5][i], dmg = [28, 28, 34][i], land = tg + 0.45;
  return {
    id: i === 0 ? 'blendax_sprung' : `blendax_sprung${i + 1}`, internal: true, range: [2.5, 30], weight: 1, cooldown: 0, telegraph: tg, flashParts: ['legs'], duration: dur,
    cue: cue(['klick', 'zisch', 'knurr'][i], [NEON, NEON_HI, NEON_PEAK][i]), audit: [5, 9], stam: 8,
    marker: { at: 'landing', radius: 3.1, color: NEON, peak: NEON_PEAK }, markerUntil: land + 0.1,
    prepare(a) {
      const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz) || 1;
      const len = Math.min(12, Math.max(2.5, d));
      a.landing = { x: a.origin.x + (dx / d) * len, z: a.origin.z + (dz / d) * len };
      a.jumpYaw = yawOf(dx, dz);
    },
    hits: [{ t0: land, t1: land + 0.12, shape: 'sphere', at: [0, 0.9, 0], radius: 3.0, dmg, knock: i === 2 ? 'down' : 'flinch' }],
    motion(tau, a) {
      const k = clamp01((tau - tg * 0.9) / (land - tg * 0.9));
      return { x: a.origin.x + (a.landing.x - a.origin.x) * k, z: a.origin.z + (a.landing.z - a.origin.z) * k, yaw: a.jumpYaw, air: 2.6 * 4 * k * (1 - k) };
    },
    pose: mTrack([
      [0, {}], [tg * 0.6, { bodyY: -0.4, bodyPitch: 8, legL: 50, legR: 50, neck: -0.2 }], [tg, { bodyY: -0.5, bodyPitch: 10, legL: 55, legR: 55 }],
      [tg + 0.15, { bodyY: 0.2, legL: -35, legR: -35, bodyPitch: -10, neck: -0.2 }], [land, { bodyY: 0, bodyPitch: 6, legL: 25, legR: 25, neck: 0.3 }],
      [land + 0.12, { bodyY: -0.35, bodyPitch: 8, legL: 45, legR: 45 }], [dur, {}],
    ]),
  };
}
const sprung1 = sprung(0), sprung2 = sprung(1), sprung3 = sprung(2);

// ---------------------------------------------------------------- Kopplung an Welt / Zustände
const furyOrRage = (m) => m.hopFury > 0 || m.rage;

export const blendax = {
  id: 'blendax',
  name: 'Blendax, der Flimmerfürst',
  hp: 14000,
  scale: SC,
  bodyRadius: 1.7,
  predator: true,
  walk: 4.2, run: 11.0, turn: 1.35, detect: 34, prefer: 5,
  detectFor: (m) => (m.fogged ? 40 : 34),
  parts: [
    { id: 'head', label: 'Kopf', factor: 1.0, breakHp: 1000, jitter: 0.07, elem: { fire: 15, shock: 10 }, blunt: true, stunPart: true,
      spheres: [{ node: 'head', offset: [0, 0.05, 0.4], r: 0.5 }] },
    // Warnschirm: Schock schließt ihn kurz (6 s kein Blitz), Bruch = nie wieder Blitz, dafür 25 s Sprung-Wut
    { id: 'frill', label: 'Warnschirm', factor: 0.9, breakHp: 1450, jitter: 0.06, elem: { fire: 10, shock: 35 },
      spheres: [{ node: 'head', offset: [0, 1.05, -0.3], r: 0.85 }, { node: 'head', offset: [0.85, 0.6, -0.3], r: 0.55 }, { node: 'head', offset: [-0.85, 0.6, -0.3], r: 0.55 }] },
    { id: 'body', label: 'Körper', factor: 0.7, elem: { fire: 15, shock: 15 },
      spheres: [{ node: 'body', offset: [0, 0, 0.55], r: 0.68 }, { node: 'body', offset: [0, 0, -0.45], r: 0.68 }, { node: 'neck', offset: [0, 0.3, 0], r: 0.38 }] },
    { id: 'legs', label: 'Beine', factor: 0.8, elem: { fire: 22, shock: 10 },
      spheres: [{ node: 'legL', offset: [0, -0.6, 0.15], r: 0.5 }, { node: 'legR', offset: [0, -0.6, 0.15], r: 0.5 }] },
    { id: 'tail', label: 'Schwanz', factor: 0.8, breakHp: 850, jitter: 0.06, elem: { fire: 10, shock: 10 },
      spheres: [{ node: 'tail1', offset: [0, 0, -0.8], r: 0.45 }, { node: 'tail2', offset: [0, 0, -0.7], r: 0.35 }] },
  ],
  attacks: {
    blendax_bissreihe: bissreihe, blendax_huepfer: huepfer, blendax_schwanz: schwanz, blendax_rueckhuepfer: rueckhuepfer, blendax_zickzack: zickzack,
    blendax_blitz: blitz, blendax_sprung: sprung1, blendax_sprung2: sprung2, blendax_sprung3: sprung3, blendax_hetzjagd: hetzjagd,
  },
  teachAttack: 'blendax_bissreihe',
  recoverAfter: (m) => (0.12 + m.rng() * 0.25) / (1.35 * m.speedMul),
  stamina: true,
  flinchDmg: 950,
  chainMax: 3, // Blitz -> Sprung -> Sprung2 -> Sprung3 (Standard sind 3 Glieder)
  phases: [{ at: 0.5, name: 'FLIMMERFIEBER', cue: cue('droehn', NEON_PEAK), special: 'blendax_hetzjagd' }],
  chains: {
    blendax_bissreihe: [
      { atk: 'blendax_huepfer', w: 2 }, { atk: 'blendax_rueckhuepfer', w: 2 }, { atk: 'blendax_schwanz', w: 2 }, { atk: 'blendax_blitz', w: 3 }, { atk: null, w: 3 },
      { atk: 'blendax_zickzack', w: 4, cond: (m) => !!m.partById.frill?.broken },
    ],
    blendax_zickzack: [{ atk: 'blendax_bissreihe', w: 3 }, { atk: null, w: 2 }],
    blendax_blitz: [{ atk: 'blendax_sprung', w: 10 }, { atk: null, w: 1 }], // Blendax setzt dem Blitz IMMER die Sprungkette nach
    blendax_sprung: [{ atk: 'blendax_sprung2', w: 8 }, { atk: null, w: 2 }],
    blendax_sprung2: [{ atk: 'blendax_sprung3', w: 6 }, { atk: null, w: 2 }],
    // Schirmbruch-Wut / Rotglut: aus dem Hüpfer 2-3 Sprünge in Folge
    blendax_huepfer: [{ atk: 'blendax_sprung2', w: 4, cond: furyOrRage }, { atk: null, w: 1 }],
  },
  speedFactor: (m) => (m.fogged ? 1.1 : 1) * (m.hopFury > 0 ? 1.15 : 1),
  build: () => buildBlendax({ scale: SC }),
  init(m) {
    m.fogged = false; m.hopFury = 0;
    Object.assign(m.extra, { blitzT: 0, blitzLock: 0 });
  },
  tick(m, dt) {
    m.fogged = m.ctx.world.zoneAt?.(m.pos.x, m.pos.z) === BLENDAX.FOG_ZONE; // Zone 3: Nebel -> öfter, weiter, schneller
    const e = m.extra;
    e.blitzT = Math.max(0, e.blitzT - dt); e.blitzLock = Math.max(0, e.blitzLock - dt);
    if (m.hopFury > 0) m.hopFury = Math.max(0, m.hopFury - dt);
    // Schirm-Flackern (Basic-Material, Farbe = Helligkeit): Blitz-Telegraph 24 Hz hell/dunkel, Kurzschluss wild, benommen aus, sonst gelegentliches Zucken
    const fm = e.frillMat;
    if (!fm || e.frillGone) return;
    const t = m.time, atk = m.attack?.id === 'blendax_blitz';
    let v = 1;
    if (atk) v = Math.floor(t * 24) % 2 ? 1 : 0.12;
    else if (m.stunT > 0) v = 0.25 + 0.2 * Math.sin(t * 9);
    else if (e.blitzLock > 0) v = Math.random() < 0.5 ? 0.15 : 1;
    else if ((t * 1.7) % 1 < 0.06) v = 0.45;
    fm.color.setRGB(v, v, v);
    if (e.halo) {
      const on = atk && m.attack.inst.sample(m.attack.t).phase !== 'done';
      e.halo.visible = on;
      if (on) e.halo.material.opacity = 0.25 + 0.35 * (Math.floor(t * 24) % 2) + 0.15 * Math.sin(t * 30);
    }
  },
  onAttackEnd(m, id) {
    if (id !== 'blendax_blitz') return;
    m.extra.blitzT = (m.fogged ? BLENDAX.BLITZ_CD_FOG : BLENDAX.BLITZ_CD) * (m.phase >= 1 ? 0.7 : 1);
  },
  // Schock auf dem Schirm schließt ihn kurz: 6 s kein Blitz, ein laufender Blitz bricht ab
  onDamage(m, res) {
    if (res.partId !== 'frill' || !(res.elemBy?.shock > 0) || m.partById.frill.broken) return;
    m.extra.blitzLock = BLENDAX.SHORT;
    const p = m.nodes.head.getWorldPosition(new THREE.Vector3());
    m.ctx.fx.spark(p, 14, NEON, 5);
    if (m.authority && m.attack?.id === 'blendax_blitz') { m._interrupt(); m.recover = Math.max(m.recover, 1.0); m.ctx.fx.number({ x: p.x, y: p.y + 1.5, z: p.z }, 'KURZSCHLUSS!', 'mon'); }
  },
  // Perfekt ausgewichen (Glitch-Konter auf den Blitz): Blendax taumelt, die Sprungkette entfällt
  onGlitchCounter(m, attackId) {
    if (attackId !== 'blendax_blitz') return;
    m._interrupt(); m.queued = null; m.chainNext = null;
    m.stunT = Math.max(m.stunT, BLENDAX.DIZZY);
    m.recover = Math.max(m.recover, 0.6);
    m.extra.blitzT = Math.max(m.extra.blitzT, 5);
    const p = m.nodes.head.getWorldPosition(new THREE.Vector3());
    m.ctx.fx.spark(p, 26, NEON, 6); m.ctx.fx.spark(p, 12, NEON_PEAK, 4);
    m.ctx.fx.number({ x: p.x, y: p.y + 1.6, z: p.z }, 'ZU HELL!', 'mon');
    m.ctx.bus.emit('monsterStun', { monster: m, reason: 'glitch' });
  },
  poseHook(m, p) {
    const inst = m.attack?.inst;
    if (inst?.def.id === 'blendax_zickzack') { const s = inst.r(0) < 0.5 ? 1 : -1; p.bodyRoll *= s; p.tailYaw *= s; }
    if (m.hopFury > 0 && !m.attack) p.spread = Math.max(p.spread, 0.35 + 0.15 * Math.sin(m.time * 14)); // Schirm-Wut: zuckt
  },
  onBreak(m, part) {
    if (part.id === 'frill') {
      const e = m.extra;
      e.frillGone = true;
      if (e.crest) e.crest.visible = false;
      if (e.halo) e.halo.visible = false;
      if (e.stump) e.stump.visible = true;
      m.hopFury = BLENDAX.FURY; // 25 s wütende Sprungketten, nie wieder Blitz
      const p = m.nodes.head.getWorldPosition(new THREE.Vector3());
      m.ctx.fx.spark(p, 40, NEON, 8); m.ctx.fx.spark(p, 20, NEON_PEAK, 5);
      m.ctx.fx.number({ x: p.x, y: p.y + 1.8, z: p.z }, 'SIGNAL VERLOREN!', 'mon');
    }
    if (part.id === 'tail') severTail(m);
  },
  onRage(m, on) { m.extra.eyeMat?.color.set(on ? '#ff3020' : '#ffe14d'); },
};

