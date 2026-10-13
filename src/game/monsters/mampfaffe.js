// Mampfaffe, der Magenkönig (Smaragdküste, JR 8 -> 9): ein hockender Riesenaffe, der alles frisst, was im Dschungel wächst.
// Vom Futter wird er jedes Mal ein anderer Brocken, und sein Fell leuchtet in der Futterfarbe (Buff 40 s):
//   Kokosnuss (braun)   harter Schädel (Kopfschaden halbiert) + Kokosnuss-Würfe
//   Feuerpilz (rot)     Backen blähen sich auf, Feuerrülpser im Kegel (Brennen), feuerfest
//   Giftkraut (gelbgrün) Stinkwolke: Gift + Item-Sperre, solange man drinsteht
//   Glitchpilz (neongrün) Flicker-Teleport, jeder Treffer verwirrt (Steuerung 3 s verkehrt)
// Wer die Futterstellen vorher abräumt, nimmt ihm die Fähigkeiten. Sein Wischer klaut genau EIN Futter aus dem Beutel (nur die vier Sorten).
// Farbregel (docs/SMARAGD_BROCKEN.md 1.2): Glitch-Effekte Hacker-Neongrün, nie Cyan/Magenta; Futterfarben (Braun/Rot/Gelbgrün) sind erlaubt.
import * as THREE from 'three';
import { lambert, basic } from '../../render/ps1.js';
import { tex, registerTexture } from '../../render/textures.js';
import { mTrack } from './monster.js';
import { kokosDef } from './mprojectiles.js';
import { smooth, clamp01 } from './common.js';
import { angleDiff, stepAngle, yawOf } from '../../core/math.js';

const SC = 1.8;
const R = Math.PI / 180;
const NEON = '#39ff14', NEON_HI = '#7dff3a', NEON_PEAK = '#d8ffd0';
const cue = (tone, color = NEON) => ({ color, tone, noShift: true });
// Gefahrenzonen sind ROT (wie bei Jaggo/Voltaro) und werden aus den echten Trefferformen gezeichnet (markerFromHits, attack.js footprints()); Neongrün bleibt Deko am Affen
const DANGER = '#ff2a2a', DANGER_HI = '#ff6a4a';

/** Futtersorten: Fellfarbe (Leuchten, rgb 0..1), Aura/Funken-Farbe, Banner-Text. */
export const FOODS = {
  kokosnuss: { name: 'KOKOSNUSS', color: '#c8902c', hi: '#ffd070', glow: [0.3, 0.18, 0.02], banner: 'KOKOS-SCHÄDEL!' },
  feuerpilz: { name: 'FEUERPILZ', color: '#ff4a1a', hi: '#ffe14d', glow: [0.46, 0.08, 0.01], banner: 'FEUERPILZ: RÜLPS-ALARM!' },
  giftkraut: { name: 'GIFTKRAUT', color: '#a8c030', hi: '#d8f060', glow: [0.23, 0.31, 0.01], banner: 'GIFTKRAUT: STINKT!' },
  glitchpilz: { name: 'GLITCHPILZ', color: NEON, hi: NEON_PEAK, glow: [0.015, 0.42, 0.015], banner: 'GLITCHPILZ: FLIMMERT!' },
};
export const FOOD_IDS = Object.keys(FOODS);

export const MAMPFAFFE = {
  BUFF: 40, BUFF_RAGE: 60, CD: 12, CD_RAGE: 6, HUNGER: 120, EAT_NEAR: 18, EAT_FAR: 40, EAT_DIST: 3.0, SAFE_DIST: 8,
  CLOUD_R: 5.5, CLOUD_SECS: 9, TP_MAX: 9, TP_LOCK: 5, DIZZY: 1.6, CRASH_STUN: 1.2, VERWIRRT: 3,
  RAMPAGE: 15, TIRED: 5.5, TIRED_DMG: 1.3, FORAGE_MAX: 60, FORAGE_FAR: 260, RAMPAGE_SPEED: 1.3,
};
/** Affenwut: Wut (m.rage / Phase 2 / Rotglut) = Kette ohne Pause, dann ERSCHÖPFT, dann Futtersuche (auch in anderen Zonen), dann neue Kette mit neuem Futter-Status. */
export const furious = (m) => m.rage || m.phase >= 1 || !!m.mm?.rageAlways;

// ---- Texturen (16 px): braun-beiges Fell, dunkles Gesicht, heller Bauch, rosige Backen, Kokosschale, Fäuste
registerTexture('mampfaffe_fur', (g, n, rnd) => {
  g.fillStyle = '#8a6a48'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#a88860';
  for (let i = 0; i < n * 2; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 2);
  g.fillStyle = '#5e4630';
  for (let y = 1; y < n; y += 3) g.fillRect(((y * 5) % n) | 0, y, 3, 1);
});
registerTexture('mampfaffe_face', (g, n, rnd) => {
  g.fillStyle = '#3c2c22'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#54402f';
  for (let i = 0; i < n; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 2, 1);
  g.fillStyle = '#1e140e'; g.fillRect(0, 0, n, 2);
});
registerTexture('mampfaffe_belly', (g, n, rnd) => {
  g.fillStyle = '#d8c090'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#c0a874';
  for (let y = 2; y < n; y += 4) g.fillRect(0, y, n, 1);
  g.fillStyle = '#e8d8a8';
  for (let i = 0; i < n; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 2, 1);
});
registerTexture('mampfaffe_cheek', (g, n, rnd) => {
  g.fillStyle = '#e8a890'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#f4c0a8';
  for (let i = 0; i < n; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 2, 2);
  g.fillStyle = '#c88068'; g.fillRect(0, n - 2, n, 2);
});
registerTexture('mampfaffe_fist', (g, n, rnd) => {
  g.fillStyle = '#4a3626'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#6a5038';
  for (let i = 0; i < n; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 2, 2);
  g.fillStyle = '#2a1c12';
  for (let x = 3; x < n; x += 5) g.fillRect(x, 0, 1, n); // Knöchel-Falten
});
registerTexture('mampfaffe_coco', (g, n, rnd) => {
  g.fillStyle = '#6b4423'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#8a5a2e';
  for (let i = 0; i < n * 2; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 2);
  g.fillStyle = '#2a1608'; g.fillRect(3, 5, 2, 2); g.fillRect(8, 5, 2, 2); g.fillRect(6, 9, 2, 2); // die drei Kokos-Löcher
});

/**
 * Mampfaffe-Modell: hockender Riese, Knöchelgang. Teile: head (Kopf + Kiefer + Kokos-Helm), prankeL/prankeR (Fäuste), belly (Bauch + Backentaschen),
 * body (Rumpf + Arme), legs (kurze Hockbeine). Pose-Schlüssel: legL/legR = ARM-Schwung (die Beine laufen gegengleich mit), wing = Brusttrommeln
 * (Arme nach innen), spread = Backen aufblasen (0..1), jaw = Kiefer. Extra: aura (additive Hülle in Futterfarbe), helmet (Kokos-Helm).
 */
export function buildMampfaffe({ scale = SC, skin = null } = {}) { // skin: { texturName: andereTextur } (Krachfaust nutzt das Rig mit eigener Steinhaut)
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  root.add(g);
  const partMeshes = { head: [], prankeL: [], prankeR: [], belly: [], body: [], legs: [] };
  const mats = {};
  const mat = (part, t) => (mats[part + t] ??= lambert({ map: tex(skin?.[t] ?? t, { size: 16 }) }));
  const add = (part, w, h, d, m, parent, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    parent.add(mesh);
    partMeshes[part].push(mesh);
    return mesh;
  };

  const BASE = 1.5;
  const body = new THREE.Group();
  body.position.y = BASE;
  g.add(body);
  // Rumpf: breite Schultern, vorn hoch (Silberrücken-Hump), dicker Wanst
  add('body', 2.0, 1.5, 1.5, mat('body', 'mampfaffe_fur'), body, 0, 0.2, -0.1);
  add('body', 2.5, 0.9, 1.3, mat('body', 'mampfaffe_fur'), body, 0, 0.95, 0.25, -0.12);
  add('body', 1.2, 0.5, 1.0, mat('body', 'mampfaffe_face'), body, 0, 0.3, -0.95); // Stummelschwanz-Hinterteil
  add('belly', 1.7, 1.15, 1.05, mat('belly', 'mampfaffe_belly'), body, 0, -0.45, 0.62);
  add('belly', 1.3, 0.6, 0.6, mat('belly', 'mampfaffe_belly'), body, 0, -0.95, 0.85);

  const neck = new THREE.Group();
  neck.position.set(0, 0.95, 0.85);
  body.add(neck);
  add('body', 0.9, 0.7, 0.8, mat('body', 'mampfaffe_fur'), neck, 0, 0.05, 0.1);
  const head = new THREE.Group();
  head.position.set(0, 0.15, 0.45);
  neck.add(head);
  add('head', 0.95, 0.8, 0.95, mat('head', 'mampfaffe_face'), head, 0, 0.0, 0.3);
  add('head', 1.05, 0.2, 0.35, mat('head', 'mampfaffe_fur'), head, 0, 0.36, 0.62); // Brauenwulst
  add('head', 0.55, 0.38, 0.35, mat('head', 'mampfaffe_cheek'), head, 0, -0.12, 0.8); // Schnauze
  const eyeM = basic({ color: '#ffe14d' });
  for (const sx of [1, -1]) add('head', 0.15, 0.15, 0.1, eyeM, head, sx * 0.3, 0.17, 0.8);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.32, 0.25);
  head.add(jaw);
  add('head', 0.8, 0.22, 0.85, mat('head', 'mampfaffe_face'), jaw, 0, -0.05, 0.38);
  for (const sx of [1, -1]) add('head', 0.1, 0.16, 0.1, basic({ color: '#f4ead0' }), jaw, sx * 0.25, 0.1, 0.78); // Hauer
  const cheeks = {};
  for (const [name, sx] of [['cheekL', 1], ['cheekR', -1]]) { // Backentaschen: wachsen mit spread zu Ballons
    const c = new THREE.Group();
    c.position.set(sx * 0.62, -0.18, 0.45);
    head.add(c);
    add('belly', 0.5, 0.5, 0.5, mat('belly', 'mampfaffe_cheek'), c, 0, 0, 0);
    cheeks[name] = c;
  }
  // Kokos-Helm (nur beim Kokos-Buff): halbe Kokosnuss auf dem Schädel
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.7, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat('head', 'mampfaffe_coco'));
  helmet.position.set(0, 0.38, 0.28);
  helmet.scale.set(1.1, 0.9, 1.1);
  helmet.visible = false;
  head.add(helmet);
  partMeshes.head.push(helmet);

  // Arme: lang, Knöchelgang; Fäuste = eigene Teile
  const arms = {}, fists = {};
  for (const [name, sx, fist] of [['armL', 1, 'prankeL'], ['armR', -1, 'prankeR']]) {
    const a = new THREE.Group();
    a.position.set(sx * 1.4, 0.95, 0.15);
    body.add(a);
    const m = mat('body', 'mampfaffe_fur');
    add('body', 0.7, 0.95, 0.7, m, a, 0, -0.45, 0);
    const fa = new THREE.Group();
    fa.position.set(0, -0.9, 0);
    a.add(fa);
    add('body', 0.62, 0.85, 0.62, m, fa, 0, -0.4, 0.04);
    const f = new THREE.Group();
    f.position.set(0, -0.8, 0.05);
    fa.add(f);
    add(fist, 1.05, 0.95, 1.05, mat(fist, 'mampfaffe_fist'), f, 0, -0.35, 0.1);
    for (const kx of [-0.3, 0, 0.3]) add(fist, 0.24, 0.24, 0.24, mat(fist, 'mampfaffe_fist'), f, kx, -0.22, 0.65); // Knöchel
    arms[name] = a; fists[name] = f;
  }

  const legs = {};
  for (const [name, sx] of [['legL', 1], ['legR', -1]]) {
    const l = new THREE.Group();
    l.position.set(sx * 0.75, -0.6, -0.4);
    body.add(l);
    const m = mat('legs', 'mampfaffe_fur');
    add('legs', 0.95, 0.8, 1.0, m, l, 0, -0.35, 0);
    add('legs', 0.85, 0.28, 1.25, mat('legs', 'mampfaffe_face'), l, 0, -0.76, 0.2);
    legs[name] = l;
  }

  // Aura: additive Hülle in Futterfarbe (laut und eindeutig, schon von weitem lesbar)
  const auraMat = basic({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const aura = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), auraMat);
  aura.position.set(0, 0.35, 0.1);
  aura.scale.set(2.3, 1.9, 2.3);
  aura.visible = false;
  aura.renderOrder = 2;
  body.add(aura);

  const nodes = { body, neck, head, jaw, cheekL: cheeks.cheekL, cheekR: cheeks.cheekR, armL: arms.armL, armR: arms.armR, fistL: fists.armL, fistR: fists.armR, legL: legs.legL, legR: legs.legR, root: g };
  const ARM_REST = 22;
  return {
    root, nodes, partMeshes,
    extra: { eyeMat: eyeM, helmet, aura, auraMat, scale, fistMeshes: { L: partMeshes.prankeL, R: partMeshes.prankeR } },
    apply(p) {
      body.position.y = BASE + p.bodyY / scale;
      body.rotation.set(p.bodyPitch * R, 0, p.bodyRoll * R);
      neck.rotation.x = 0.3 + p.neck;
      head.rotation.set(-(0.3 + p.neck) + p.head * R, p.headYaw * R, 0);
      jaw.rotation.x = p.jaw * R;
      const cs = 1 + 1.5 * clamp01(p.spread); // Ballonbacken
      for (const sx of [1, -1]) {
        const c = sx > 0 ? cheeks.cheekL : cheeks.cheekR;
        c.scale.setScalar(cs);
        c.position.x = sx * (0.62 + 0.28 * clamp01(p.spread));
      }
      // Arme: legL/legR = Schwung vor/zurück (+ = vor), wing = nach innen und leicht angehoben (Brusttrommeln)
      arms.armL.rotation.set(-(ARM_REST + p.legL + 30 * p.wing) * R, 0, -p.wing * 0.95);
      arms.armR.rotation.set(-(ARM_REST + p.legR + 30 * p.wing) * R, 0, p.wing * 0.95);
      fists.armL.rotation.x = -0.35 - p.wing * 0.4; fists.armR.rotation.x = -0.35 - p.wing * 0.4;
      legs.legL.rotation.x = -p.legR * 0.55 * R; // Beine gegengleich zum Arm
      legs.legR.rotation.x = -p.legL * 0.55 * R;
    },
  };
}

// ---------------------------------------------------------------- Hilfsfunktionen
const Z = { legL: 0, legR: 0, bodyPitch: 0, bodyY: 0, bodyRoll: 0, head: 0, neck: 0, wing: 0, spread: 0, jaw: 0, headYaw: 0 };
const NEON_GLOW = [0.05, 0.6, 0.03];
const mouthOf = (m, out = new THREE.Vector3()) => { m.nodes.head.localToWorld(out.set(0, -0.2, 1.0)); return out; };
const hasBuff = (m, kind) => m.extra.food === kind;

/** Futterstellen in der Welt (nur die Reviere Zone 1 + 2: er wandert nicht nach Zone 3/4). */
function foodPoints(m, maxZone = 2) {
  const pts = m.ctx.world?.gatherPoints;
  return pts ? pts.filter((pt) => FOODS[pt.kind] && pt.usesLeft > 0 && (pt.zone ?? 1) <= maxZone) : [];
}
function nearestFood(m, maxD) {
  let best = null, bd = maxD;
  for (const pt of foodPoints(m)) {
    const d = Math.hypot(pt.pos.x - m.pos.x, pt.pos.z - m.pos.z);
    if (d < bd) { bd = d; best = pt; }
  }
  return best;
}

/** Wirkungen des Buffs auf Teile (idempotent; läuft beim Host UND bei den Gästen, weil Gäste ihren Schaden selbst auswerten). */
function applyFoodState(m, kind) {
  const e = m.extra, head = m.partById.head;
  const hard = kind === 'kokosnuss' && !head.broken;
  if (hard !== !!e.hard) { head.factor += (hard ? -0.5 : 0.5) * head.baseFactor; e.hard = hard; } // harter Schädel: Kopf-Faktor x0,5
  const fire0 = kind === 'feuerpilz';
  for (const p of m.parts) p.elem.fire = fire0 ? 0 : (p.baseElem.fire ?? 0); // mit Feuerpilz im Bauch feuerfest
  if (e.helmet) e.helmet.visible = hard;
  if (e.aura) {
    e.aura.visible = !!kind;
    if (kind) e.auraMat.color.set(FOODS[kind].color);
  }
}

/** Futter-Effekte (Funken, Zahl, Banner, Ton): bei Host und Gästen. */
function foodFx(m, kind) {
  const ctx = m.ctx, p = mouthOf(m);
  if (!kind) return;
  const f = FOODS[kind];
  ctx.fx.spark(p, 36, f.color, 7); ctx.fx.spark(p, 18, f.hi, 5);
  ctx.fx.number({ x: p.x, y: p.y + 1.6, z: p.z }, f.name + '!', 'mf-' + kind);
  ctx.hud?.center?.(f.banner, 1.8);
  ctx.bus.emit('sfx', { name: kind === 'glitchpilz' ? 'glitchTp' : 'burp', pos: m.pos });
  ctx.fx.shake?.(0.12, 0.2);
}

/** Buff setzen (nur Host/Solo; Gäste ziehen per snapExtra nach). opts.free: nichts verbraucht (Rotglut-Start, geklautes Futter). */
export function setFood(m, kind, opts = {}) {
  const e = m.extra;
  if (!FOODS[kind] || !m.alive) return false;
  const rot = !!m.mm?.rageAlways;
  e.food = kind;
  e.foodT = rot || m.phase >= 1 ? MAMPFAFFE.BUFF_RAGE : MAMPFAFFE.BUFF;
  e.foodCd = rot ? 0 : m.phase >= 1 ? MAMPFAFFE.CD_RAGE : MAMPFAFFE.CD;
  e.noBuffT = 0; e.hungry = false;
  e.tpLock = 0;
  applyFoodState(m, kind);
  foodFx(m, kind);
  if (opts.stolen) m.ctx.bus.emit('foodStolen', { monster: m, kind });
  return true;
}
function clearFood(m, why = 'ausgespuckt') {
  const e = m.extra;
  if (!e.food) return;
  const was = e.food;
  e.food = null; e.foodT = 0; e.foodCd = Math.max(e.foodCd, 4);
  applyFoodState(m, null);
  const p = mouthOf(m);
  m.ctx.fx.spark(p, 22, FOODS[was].color, 6);
  m.ctx.fx.number({ x: p.x, y: p.y + 1.4, z: p.z }, why === 'ausgespuckt' ? 'AUSGESPUCKT!' : 'VERDAUT', 'weak');
  m.ctx.bus.emit('sfx', { name: 'chew', pos: m.pos });
}

// ---------------------------------------------------------------- Angriffe
const TEMPO = 1.3;

// ---- Fäuste (Lehrangriff): Ausfallschritt, linke Faust, rechte Faust, dann Doppel-Stampf
const faeuste = {
  id: 'mampfaffe_faeuste', range: [0, 6.5], weight: 4, cooldown: 2.5, telegraph: 0.55, flashParts: ['prankeL', 'prankeR'], duration: 2.2, tempo: TEMPO,
  cue: cue('klick', NEON_HI), audit: [2.5, 4.5], stam: 8,
  markerFromHits: true,
  hits: [
    { t0: 0.72, t1: 0.86, shape: 'sphere', at: [1.0, 1.5, 3.6], radius: 2.0, dmg: 38, knock: 'flinch', side: 'L' },
    { t0: 1.02, t1: 1.16, shape: 'sphere', at: [-1.0, 1.5, 3.6], radius: 2.0, dmg: 38, knock: 'flinch', side: 'R' },
    { t0: 1.45, t1: 1.6, shape: 'sphere', at: [0, 0.6, 3.6], radius: 3.4, dmg: 46, knock: 'down' },
  ],
  motion(tau, a) {
    const f = 2.0 * smooth(clamp01((tau - 0.5) / 0.35));
    return { x: a.origin.x + a.dir.x * f, z: a.origin.z + a.dir.z * f };
  },
  pose: mTrack([
    [0, { ...Z }], [0.3, { legL: -50, bodyPitch: -6, bodyRoll: 6, bodyY: 0.05 }], [0.55, { legL: -55, bodyPitch: -8, bodyRoll: 8 }],
    [0.72, { legL: 85, legR: -35, bodyPitch: 10, bodyRoll: -6, head: 6 }, 'lin'], [0.86, { legL: 30, legR: -50, bodyPitch: 2, bodyRoll: 0 }],
    [0.95, { legR: -58, bodyRoll: -8 }], [1.02, { legR: 85, legL: -35, bodyPitch: 10, bodyRoll: 6 }, 'lin'], [1.18, { legR: 30, legL: 0, bodyRoll: 0, bodyPitch: 2 }],
    [1.3, { legL: -75, legR: -75, bodyPitch: -14, bodyY: 0.4, head: -15, wing: 0.3 }], [1.45, { legL: 90, legR: 90, bodyPitch: 16, bodyY: -0.3, head: 15, wing: 0.4 }, 'lin'],
    [1.7, { legL: 60, legR: 60, bodyPitch: 10, bodyY: -0.2, wing: 0 }], [2.2, { ...Z }],
  ]),
};

// ---- Grabbel: schneller Wischer, klaut ein Futter (nur die vier Sorten) aus dem Beutel
const grabbel = {
  id: 'mampfaffe_grabbel', range: [0, 5.5], weight: (m) => (m.extra.hungry ? 7 : 3), cooldown: 3, telegraph: 0.5, flashParts: ['prankeL'], duration: 1.3, tempo: TEMPO,
  cue: cue('zisch', NEON_PEAK), audit: [2, 3.8], stam: 6,
  markerFromHits: true,
  hits: [{ t0: 0.55, t1: 0.67, shape: 'sphere', at: [0, 1.4, 3.2], radius: 1.9, dmg: 20, knock: 'flinch', steal: true }],
  pose: mTrack([
    [0, { ...Z }], [0.3, { legL: -60, bodyPitch: -5, bodyRoll: 8, head: -8, jaw: 12 }], [0.5, { legL: -65, bodyRoll: 10 }],
    [0.6, { legL: 90, bodyPitch: 12, bodyRoll: -8, jaw: 25 }, 'lin'], [0.85, { legL: 40, bodyPitch: 4, bodyRoll: 0, jaw: 0 }], [1.3, { ...Z }],
  ]),
};

// ---- Stampfer: Hocksprung auf der Stelle, Landung mit Schockwelle r 6,5 und einer zweiten, weiteren Welle (r 9,5)
const stampfer = {
  id: 'mampfaffe_stampfer', range: [0, 9], weight: 3, cooldown: 5, telegraph: 0.55, flashParts: ['legs'], duration: 2.2, tempo: TEMPO,
  cue: cue('brumm'), audit: [3, 5], stam: 10,
  markerFromHits: true,
  hits: [
    { t0: 1.3, t1: 1.43, shape: 'sphere', at: [0, 0.5, 0], radius: 6.5, dmg: 42, knock: 'down' },
    { t0: 1.37, t1: 1.48, shape: 'sphere', at: [0, 0.5, 0], radius: 9.5, dmg: 22, knock: 'flinch' },
  ],
  motion(tau) {
    const k = clamp01((tau - 0.78) / 0.52);
    return { air: 2.6 * 4 * k * (1 - k) };
  },
  pose: mTrack([
    [0, { ...Z }], [0.35, { legL: -40, legR: -40, bodyY: -0.3, bodyPitch: 6 }], [0.7, { legL: -70, legR: -70, bodyY: -0.55, wing: 0.2 }],
    [0.88, { legL: -95, legR: -95, bodyY: 0.5, bodyPitch: -12, wing: 0.5 }], [1.3, { legL: 70, legR: 70, bodyY: -0.5, bodyPitch: 14, wing: 0 }, 'lin'],
    [1.55, { legL: 40, legR: 40, bodyY: -0.2, bodyPitch: 8 }], [2.2, { ...Z }],
  ]),
};

// ---- Erdschlag (Bodenstampfer): beide Fäuste hoch, Schlag vor die Füße (r 3,4) und eine Druckwelle um ihn (r 8)
const erdschlag = {
  id: 'mampfaffe_erdschlag', range: [0, 6], weight: 3, cooldown: 4, telegraph: 0.55, flashParts: ['prankeL', 'prankeR'], duration: 1.9, tempo: TEMPO,
  cue: cue('brumm', NEON_PEAK), audit: [2.5, 5], stam: 10,
  markerFromHits: true,
  hits: [
    { t0: 0.8, t1: 0.92, shape: 'sphere', at: [0, 0.6, 3.2], radius: 3.4, dmg: 44, knock: 'down' },
    { t0: 0.86, t1: 0.98, shape: 'sphere', at: [0, 0.5, 0], radius: 8, dmg: 26, knock: 'flinch' },
  ],
  events: [{ t: 0.82, call: 'wumms', all: true }],
  calls: {
    wumms(m, ctx) {
      const c = m.nodes.body.localToWorld(new THREE.Vector3(0, -1.2, 3.0));
      ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos });
      ctx.fx.shake?.(0.5, 0.35);
      ctx.fx.spark(c, 26, NEON, 7); ctx.fx.spark(c, 12, NEON_PEAK, 5);
    },
  },
  pose: mTrack([
    [0, { ...Z }], [0.35, { legL: -70, legR: -70, bodyPitch: -10, bodyY: 0.2, wing: 0.2 }], [0.55, { legL: -110, legR: -110, bodyPitch: -20, bodyY: 0.5, head: -18, wing: 0.5 }],
    [0.8, { legL: 100, legR: 100, bodyPitch: 20, bodyY: -0.5, head: 18, wing: 0 }, 'lin'], [1.1, { legL: 60, legR: 60, bodyPitch: 12, bodyY: -0.3 }], [1.9, { ...Z }],
  ]),
};

// ---- Rundum (Wirbel-Schlag, 360 Grad): breitet die Arme aus und dreht sich zweimal, zwei Schläge r 6 rundherum, der zweite wirft um
const rundum = {
  id: 'mampfaffe_rundum', range: [0, 8], weight: 4, cooldown: 5, telegraph: 0.55, flashParts: ['prankeL', 'prankeR', 'body'], duration: 2.1, tempo: TEMPO,
  cue: cue('droehn', NEON_HI), audit: [3, 6], stam: 12,
  markerFromHits: true,
  hits: [
    { t0: 0.8, t1: 0.9, shape: 'sphere', at: [0, 1.2, 0], radius: 6, dmg: 36, knock: 'flinch' },
    { t0: 0.88, t1: 0.98, shape: 'sphere', at: [0, 1.2, 0], radius: 6.3, dmg: 44, knock: 'down' },
  ],
  motion(tau, a) {
    const k = smooth(clamp01((tau - 0.45) / 0.75)), f = 3.0 * smooth(clamp01((tau - 0.5) / 0.6));
    return { x: a.origin.x + a.dir.x * f, z: a.origin.z + a.dir.z * f, yaw: a.yaw0 + Math.PI * 4 * k }; // zwei volle Drehungen
  },
  pose: mTrack([
    [0, { ...Z }], [0.3, { legL: 50, legR: -50, bodyPitch: -4, bodyRoll: 10, wing: -0.5, bodyY: -0.1 }], [0.55, { legL: 70, legR: 70, bodyPitch: 4, bodyRoll: 18, wing: -1, bodyY: -0.2 }],
    [1.1, { legL: 70, legR: 70, bodyRoll: 22, wing: -1, bodyY: -0.15 }], [1.35, { legL: 40, legR: 40, bodyRoll: 8, wing: -0.4, bodyY: -0.3 }], [2.1, { ...Z }],
  ]),
};

// ---- Sprungschlag (Gap-Closer): springt weit (bis 26 m) auf den Pirscher und kracht mit Wucht + Welle herunter
const sprungschlag = {
  id: 'mampfaffe_sprungschlag', range: [8, 26], weight: 5, cooldown: 5, telegraph: 0.6, flashParts: ['legs'], duration: 2.0, tempo: TEMPO,
  cue: cue('schrill', NEON), audit: [10, 20], stam: 12,
  markerFromHits: true,
  prepare(a) {
    const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz) || 1, len = Math.min(26, d);
    a.landing = { x: a.origin.x + (dx / d) * len, z: a.origin.z + (dz / d) * len };
    a.jumpYaw = yawOf(dx, dz);
  },
  hits: [
    { t0: 1.1, t1: 1.22, shape: 'sphere', at: [0, 0.6, 0], radius: 4.6, dmg: 46, knock: 'down' },
    { t0: 1.17, t1: 1.28, shape: 'sphere', at: [0, 0.6, 0], radius: 7, dmg: 24, knock: 'flinch' },
  ],
  events: [{ t: 1.1, call: 'bumm', all: true }],
  calls: {
    bumm(m, ctx) {
      ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos });
      ctx.fx.shake?.(0.6, 0.4);
      const c = { x: m.pos.x, y: m.pos.y + 0.4, z: m.pos.z };
      ctx.fx.spark(c, 30, NEON, 8); ctx.fx.spark(c, 14, NEON_PEAK, 6);
    },
  },
  motion(tau, a) {
    const k = clamp01((tau - 0.5) / 0.6);
    return { x: a.origin.x + (a.landing.x - a.origin.x) * k, z: a.origin.z + (a.landing.z - a.origin.z) * k, yaw: a.jumpYaw, air: 6 * 4 * k * (1 - k) };
  },
  pose: mTrack([
    [0, { ...Z }], [0.35, { legL: -60, legR: -60, bodyY: -0.5, bodyPitch: 8 }], [0.6, { legL: -100, legR: -100, bodyY: -0.6, bodyPitch: 10, wing: 0.2 }],
    [0.8, { legL: -120, legR: -120, bodyY: 0.4, bodyPitch: -18, head: -15, wing: 0.5 }], [1.1, { legL: 100, legR: 100, bodyY: -0.4, bodyPitch: 18, head: 16, wing: 0 }, 'lin'],
    [1.35, { legL: 50, legR: 50, bodyY: -0.2, bodyPitch: 8 }], [2.0, { ...Z }],
  ]),
};

// ---- Rolle: rollt als Fellkugel 12 m gerade durch; Wand-Prall = 1,2 s benommen (Verhöhnung inklusive)
const ROLL_LEN = 14;
const rolle = {
  id: 'mampfaffe_rolle', range: [5, 18], weight: 3, cooldown: 7, telegraph: 0.6, flashParts: ['body'], duration: 2.6, tempo: TEMPO,
  cue: cue('droehn', NEON), audit: [9, 14], stam: 12,
  markerFromHits: true,
  hits: [{ t0: 0.85, t1: 1.7, shape: 'capsule', from: [0, 1.5, -0.8], to: [0, 1.5, 2.0], radius: 2.5, dmg: 40, knock: 'down' }],
  motion(tau, a) {
    const f = ROLL_LEN * smooth(clamp01((tau - 0.8) / 0.9));
    return { x: a.origin.x + a.dir.x * f, z: a.origin.z + a.dir.z * f };
  },
  pose: mTrack([
    [0, { ...Z }], [0.4, { legL: 70, legR: 70, bodyPitch: 20, bodyY: -0.5, head: 25, neck: 0.3 }], [0.8, { legL: 80, legR: 80, bodyPitch: 30, bodyY: -0.6, head: 30, wing: 0.7 }],
    [1.7, { bodyPitch: 1110, bodyY: -0.6, wing: 0.9 }, 'lin'], [1.85, { bodyPitch: 1110, bodyY: -0.2, wing: 0.3, legL: 20, legR: 20 }], [2.6, { bodyY: 0, wing: 0, legL: 0, legR: 0 }],
  ]),
};

// ---- Brusttrommeln: Rudelruf-Muster (dmg 0, pin), Glitch-Konter möglich
const drumEvents = [0.45, 0.65, 0.85, 1.05, 1.25].map((t) => ({ t, call: 'drum', all: true }));
const brust = {
  id: 'mampfaffe_brust', range: [0, 30], weight: 2, cooldown: 14, telegraph: 0.8, flashParts: ['body', 'belly'], duration: 2.4, tempo: TEMPO,
  cue: cue('droehn', NEON_PEAK), audit: [3, 7], stam: 10,
  cond: (m) => !!m.target && Math.hypot(m.target.pos.x - m.pos.x, m.target.pos.z - m.pos.z) < MAMPFAFFE.SAFE_DIST,
  markerFromHits: true,
  hits: [{ t0: 1.0, t1: 1.1, shape: 'sphere', at: [0, 0.8, 0], radius: 8, dmg: 0, knock: 'pin' }],
  events: drumEvents,
  calls: {
    drum(m, ctx) {
      ctx.bus.emit('sfx', { name: 'drum', pos: m.pos });
      const c = m.nodes.body.localToWorld(new THREE.Vector3(0, 0.5, 1.0));
      ctx.fx.spark(c, 6, '#e8d8a8', 3.5);
      ctx.fx.shake?.(0.08, 0.1);
    },
  },
  pose: mTrack([
    [0, { ...Z }], [0.3, { wing: 0.2, bodyPitch: -14, head: -18, bodyY: 0.15, jaw: 25 }], [0.45, { wing: 1, bodyPitch: -16, bodyY: 0.2 }], [0.55, { wing: 0.35 }],
    [0.65, { wing: 1 }], [0.75, { wing: 0.35 }], [0.85, { wing: 1 }], [0.95, { wing: 0.35 }], [1.05, { wing: 1 }], [1.15, { wing: 0.35 }], [1.25, { wing: 1, spread: 0.7 }],
    [1.9, { wing: 0.4, bodyPitch: -8, spread: 0.2 }], [2.4, { ...Z }],
  ]),
};

// ---- Fressen: interner Angriff (Host/Solo), läuft auch im Wandern; Maul auf, kauen, bei 1,2 s wird die Stelle verbraucht
const chewFrames = [];
for (let i = 0; i < 9; i++) chewFrames.push([0.7 + i * 0.16, { jaw: i % 2 ? 6 : 28, spread: 0.25 + 0.3 * (i % 2), head: 22 + (i % 2) * 6 }]);
const fressen = {
  id: 'mampfaffe_fressen', internal: true, wanderAttack: true, range: [0, 99], weight: 0, cooldown: 0, telegraph: 0.6, flashParts: [], duration: 2.2, stam: 0,
  cue: cue('klick', NEON_HI), hits: [],
  events: [{ t: 0.9, call: 'chew', all: true }, { t: 1.2, call: 'eat' }, { t: 1.4, call: 'chew', all: true }, { t: 1.6, call: 'chew', all: true }],
  calls: {
    chew(m, ctx) {
      ctx.bus.emit('sfx', { name: 'chew', pos: m.pos });
      ctx.fx.spark(mouthOf(m), 6, '#c8b088', 2.5);
    },
    eat(m, ctx) { // nur Autorität
      const e = m.extra, pt = e.eatPt;
      e.eatPt = null;
      if (!pt || pt.usesLeft <= 0) { ctx.fx.number({ x: m.pos.x, y: m.pos.y + 4.5, z: m.pos.z }, 'LEER?!', 'weak'); return; }
      ctx.world.setGatherState?.(pt.id, pt.usesLeft - 1);
      ctx.bus.emit('foodEaten', { pointId: pt.id, kind: pt.kind });
      setFood(m, pt.kind);
      afterEat(m);
    },
  },
  pose: mTrack([
    [0, { ...Z }], [0.3, { head: 10, jaw: 30, bodyPitch: 8, neck: 0.15, legL: 30, legR: 30 }], [0.6, { head: 14, jaw: 45, bodyPitch: 10, neck: 0.2, legL: 35, legR: 35, spread: 0.1 }],
    ...chewFrames,
    [2.05, { jaw: 4, spread: 0.1, head: 6, bodyPitch: 4 }], [2.2, { ...Z }],
  ]),
};

// ---- Kokoswurf (Kokosnuss-Buff): drei Kokosnüsse im hohen Bogen, Aufschlag-Marker, Splash
const kokosCall = (m, ctx, inst, age = 0) => {
  const o = inst.origin, a = inst.yaw0;
  const from = { x: o.x + Math.sin(a) * 2.4, y: o.y + 3.2, z: o.z + Math.cos(a) * 2.4 };
  const dx = inst.target.x - from.x, dz = inst.target.z - from.z, dist = Math.hypot(dx, dz) || 1;
  for (let i = 0; i < 3; i++) {
    let tx, tz;
    if (i === 0) { tx = inst.target.x + (inst.r(0) - 0.5) * 1.4; tz = inst.target.z + (inst.r(6) - 0.5) * 1.4; }
    else {
      const ang = Math.atan2(dx, dz) + (i % 2 ? 1 : -1) * (0.2 + 0.14 * Math.ceil(i / 2) + inst.r(i) * 0.1);
      const d = Math.max(5, Math.min(22, dist * (0.85 + inst.r(i + 6) * 0.3)));
      tx = from.x + Math.sin(ang) * d; tz = from.z + Math.cos(ang) * d;
    }
    const to = { x: tx, y: ctx.world.heightAt(tx, tz), z: tz };
    const dur = 1.0 + dist * 0.03 + i * 0.12;
    m.projectiles.spawn({ ...kokosDef({ from, to, dur, arc: 6.5, dmg: 22, splash: 2.0, key: `${inst.key}:k${i}` }), attackId: inst.params.attackId }, age);
  }
  ctx.bus.emit('sfx', { name: 'coconut', pos: from });
  ctx.fx.spark(from, 14, FOODS.kokosnuss.hi, 5);
};
const kokoswurf = {
  id: 'mampfaffe_kokoswurf', range: [6, 22], weight: 6, cooldown: 6, telegraph: 0.7, flashParts: ['prankeL', 'prankeR'], duration: 2.4, tempo: TEMPO, stam: 6,
  cue: cue('klick', FOODS.kokosnuss.color),
  cond: (m) => hasBuff(m, 'kokosnuss') && !m.partById.head?.broken,
  events: [{ t: 0.95, call: 'wurf', all: true }], calls: { wurf: kokosCall }, hits: [],
  pose: mTrack([
    [0, { ...Z }], [0.35, { legL: -70, legR: -70, bodyPitch: -12, head: -10 }], [0.7, { legL: -95, legR: -95, bodyPitch: -18, bodyY: 0.2, head: -14, wing: 0.2 }],
    [0.95, { legL: 80, legR: 80, bodyPitch: 14, head: 14, wing: 0 }, 'lin'], [1.3, { legL: 40, legR: 40, bodyPitch: 6, head: 4 }], [2.4, { ...Z }],
  ]),
};

// ---- Feuerrülpser (Feuerpilz-Buff): Backen blähen sich rot auf, Kegel 8 m / 60 Grad vor dem Maul, Brennen
const BURP_T = 1.0;
const feuerruelpser = {
  id: 'mampfaffe_feuerruelpser', range: [1.5, 10], weight: 6, cooldown: 6, telegraph: 0.75, flashParts: ['belly'], duration: 2.6, tempo: TEMPO, stam: 10,
  cue: cue('droehn', FOODS.feuerpilz.color), audit: [3.5, 6],
  cond: (m) => hasBuff(m, 'feuerpilz'),
  markerFromHits: true,
  hits: [[2.5, 1.6, 1.0], [5.0, 2.2, 1.2], [7.5, 2.8, 1.4]].map(([z, r, t0]) => ({ t0, t1: t0 + 0.12, shape: 'sphere', at: [0, 1.5, z], radius: r + 0.6, dmg: 26, knock: 'flinch', status: { type: 'burn' } })),
  events: [{ t: 0.95, call: 'rulps', all: true }],
  calls: {
    rulps(m, ctx, inst, age = 0) {
      m.extra.burpUntil = m.time + 0.8 - age;
      ctx.bus.emit('sfx', { name: 'burp', pos: m.pos });
      ctx.fx.shake?.(0.3, 0.4);
    },
  },
  pose: mTrack([
    [0, { ...Z }], [0.45, { spread: 0.7, bodyPitch: -6, head: -8, jaw: 6 }], [0.9, { spread: 1, bodyPitch: -14, head: -24, jaw: 10, bodyY: 0.12 }],
    [1.0, { spread: 0.6, bodyPitch: 8, head: 10, jaw: 45, bodyY: -0.1 }, 'lin'], [1.6, { spread: 0.25, head: 8, jaw: 42, bodyPitch: 6 }], [2.0, { spread: 0, jaw: 10, head: 0, bodyPitch: 0 }], [2.6, { ...Z }],
  ]),
};

// ---- Stinkwolke (Giftkraut-Buff): spuckt eine gelbgrüne Wolke aufs Ziel (r 5,5, 9 s): Gift + Item-Sperre, solange man drinsteht
const stinkwolke = {
  id: 'mampfaffe_stinkwolke', range: [3, 16], weight: 6, cooldown: 8, telegraph: 0.8, flashParts: ['belly'], duration: 2.4, tempo: TEMPO, stam: 8,
  cue: cue('zisch', FOODS.giftkraut.color),
  cond: (m) => hasBuff(m, 'giftkraut'),
  marker: { at: 'landing', radius: MAMPFAFFE.CLOUD_R, color: DANGER, peak: DANGER_HI }, markerUntil: 1.4,
  prepare(a) {
    const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz) || 1;
    const len = Math.min(16, Math.max(3, d));
    a.landing = { x: a.origin.x + (dx / d) * len, z: a.origin.z + (dz / d) * len };
  },
  hits: [],
  events: [{ t: 1.0, call: 'wolke', all: true }],
  calls: {
    wolke(m, ctx, inst, age = 0) {
      const L = inst.landing, clouds = m.extra.clouds;
      clouds.push({ x: L.x, y: ctx.world.heightAt(L.x, L.z), z: L.z, t0: m.time - age, t1: m.time - age + MAMPFAFFE.CLOUD_SECS, mesh: null, nextPoison: 0 });
      if (clouds.length > 3) { const o = clouds.shift(); o.mesh?.removeFromParent(); }
      ctx.bus.emit('sfx', { name: 'stinkHiss', pos: L });
      ctx.fx.spark({ x: L.x, y: L.y ?? 0.5, z: L.z }, 24, FOODS.giftkraut.color, 6);
    },
  },
  pose: mTrack([
    [0, { ...Z }], [0.4, { spread: 0.6, bodyPitch: -8, head: -10 }], [0.85, { spread: 1, bodyPitch: -16, head: -26, jaw: 8 }], [1.0, { spread: 0.4, bodyPitch: 10, head: 14, jaw: 45 }, 'lin'],
    [1.6, { spread: 0.1, head: 6, jaw: 20 }], [2.4, { ...Z }],
  ]),
};

// ---- Flimmersprung (Glitchpilz-Buff): flackert aus dem Bild und taucht bis 9 m weiter neben dem Ziel wieder auf
const TP_AT = 0.8;
const flimmersprung = {
  id: 'mampfaffe_flimmersprung', range: [3, 16], weight: 6, cooldown: 6, telegraph: 0.5, flashParts: ['legs'], duration: 2.0, tempo: TEMPO, stam: 8,
  cue: cue('schrill', NEON), audit: [4, 8],
  cond: (m) => hasBuff(m, 'glitchpilz') && !(m.extra.tpLock > 0),
  markerFromHits: true,
  prepare(a) {
    const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz) || 1;
    const side = a.r(0) < 0.5 ? 1 : -1;
    // seitlich/hinter dem Ziel; weiter als 9 m weg: nur bis 9 m ran
    const ox = a.target.x + (-dz / d) * side * 1.6 + (dx / d) * 1.2, oz = a.target.z + (dx / d) * side * 1.6 + (dz / d) * 1.2;
    const tx = ox - a.origin.x, tz = oz - a.origin.z, td = Math.hypot(tx, tz) || 1, len = Math.min(MAMPFAFFE.TP_MAX, td);
    a.landing = { x: a.origin.x + (tx / td) * len, z: a.origin.z + (tz / td) * len };
    a.landYaw = yawOf(a.target.x - a.landing.x, a.target.z - a.landing.z);
  },
  hits: [{ t0: 0.85, t1: 0.97, shape: 'sphere', at: [0, 1.2, 0], radius: 3.4, dmg: 34, knock: 'down' }],
  events: [{ t: TP_AT, call: 'tp', all: true }],
  calls: {
    tp(m, ctx) {
      ctx.bus.emit('sfx', { name: 'glitchTp', pos: m.pos });
      ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 3, z: m.pos.z }, 24, NEON, 7); ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 3, z: m.pos.z }, 10, NEON_PEAK, 5);
    },
  },
  motion(tau, a) {
    if (tau < TP_AT) return {};
    return { x: a.landing.x, z: a.landing.z, yaw: a.landYaw };
  },
  pose: mTrack([
    [0, { ...Z }], [0.25, { bodyY: -0.3, bodyPitch: 6, legL: -30, legR: -30 }], [0.5, { bodyY: -0.45, bodyPitch: 8, head: 10, legL: -45, legR: -45 }],
    [0.78, { bodyY: -0.2, bodyPitch: 0 }], [0.86, { legL: 85, legR: 85, bodyPitch: 14, bodyY: -0.1, head: 12 }, 'lin'], [1.2, { legL: 40, legR: 40, bodyPitch: 6 }], [2.0, { ...Z }],
  ]),
};

// ---------------------------------------------------------------- Beutel: Futterklau (nur die vier Sorten, sonst NICHTS)
/** Zieht genau 1 Futter (Kokosnuss: 2) aus dem Beutel (`inv.loot`: gesammelt/zerlegt). Gibt { id, n } zurück oder null. Fasst nichts anderes an. */
export function stealFromPouch(inv, rnd = Math.random) {
  if (!inv?.loot) return null;
  const have = FOOD_IDS.filter((id) => (inv.loot[id] ?? 0) > 0);
  if (!have.length) return null;
  const id = have[Math.floor(rnd() * have.length) % have.length];
  const n = Math.min(inv.loot[id], id === 'kokosnuss' ? 2 : 1);
  inv.loot[id] -= n;
  if (inv.loot[id] <= 0) delete inv.loot[id];
  if (inv.carved?.[id]) { inv.carved[id] = Math.min(inv.carved[id], inv.loot[id] ?? 0); if (!inv.carved[id]) delete inv.carved[id]; } // Zerlege-Log bleibt Teilmenge des Beutels
  return { id, n };
}

// ---------------------------------------------------------------- Wolken, Rülpser, Optik (Host + Gäste)
const cloudGeo = new THREE.IcosahedronGeometry(1, 0);
const cloudMat = () => basic({ color: FOODS.giftkraut.color, transparent: true, opacity: 0.38, depthWrite: false, fog: false });
const discMat = () => basic({ color: FOODS.giftkraut.color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false });
const discGeo = new THREE.CircleGeometry(1, 20);
function makeCloudMesh() {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(discGeo, discMat());
  disc.rotation.x = -Math.PI / 2; disc.scale.setScalar(MAMPFAFFE.CLOUD_R); disc.position.y = 0.12;
  grp.add(disc);
  const edge = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 40), basic({ color: DANGER, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, fog: false })); // roter Rand = hier wirkt das Gift (Wirkradius CLOUD_R)
  edge.rotation.x = -Math.PI / 2; edge.scale.setScalar(MAMPFAFFE.CLOUD_R); edge.position.y = 0.14;
  grp.add(edge);
  const m = cloudMat();
  grp.userData.puffs = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * 6.28 + (i % 3), r = (0.3 + ((i * 37) % 10) / 14) * MAMPFAFFE.CLOUD_R * 0.8;
    const p = new THREE.Mesh(cloudGeo, m);
    p.position.set(Math.cos(a) * r, 0.7 + (i % 4) * 0.7, Math.sin(a) * r);
    p.userData.s = 1.0 + (i % 3) * 0.45; p.userData.ph = i * 1.3;
    grp.add(p); grp.userData.puffs.push(p);
  }
  grp.userData.mat = m; grp.userData.disc = disc; grp.userData.edge = edge;
  return grp;
}

function visuals(m, dt) {
  const e = m.extra, ctx = m.ctx, t = m.time;
  const food = e.food;
  // ---- Aura + Funken in Futterfarbe
  if (e.aura) {
    if (food) {
      const k = food === 'glitchpilz' ? (Math.floor(t * 12) % 2 ? 0.16 : 0.03) : 0.07 + 0.03 * Math.sin(t * 5);
      e.auraMat.opacity = k;
      const s = 1 + 0.05 * Math.sin(t * 6);
      e.aura.scale.set(2.3 * s, 1.9 * s, 2.3 * s);
      e.puffT = (e.puffT ?? 0) - dt;
      if (e.puffT <= 0 && m.alive) {
        e.puffT = food === 'feuerpilz' ? 0.07 : 0.14;
        const f = FOODS[food], mp = mouthOf(m);
        if (food === 'feuerpilz') ctx.fx.spark({ x: mp.x, y: mp.y + 0.3, z: mp.z }, 1, Math.random() < 0.5 ? f.color : f.hi, 2.2);
        else if (food === 'giftkraut') ctx.fx.spark({ x: mp.x + (Math.random() - 0.5), y: mp.y + 0.2, z: mp.z + (Math.random() - 0.5) }, 1, Math.random() < 0.5 ? f.color : f.hi, 1.0);
        else if (food === 'kokosnuss') { if (Math.random() < 0.3) ctx.fx.spark({ x: mp.x, y: mp.y + 0.9, z: mp.z }, 1, f.hi, 1.6); }
        else ctx.fx.spark({ x: m.pos.x + (Math.random() - 0.5) * 4, y: m.pos.y + 1 + Math.random() * 3, z: m.pos.z + (Math.random() - 0.5) * 4 }, 1, Math.random() < 0.5 ? NEON : NEON_PEAK, 1.5);
      }
    } else e.auraMat.opacity = 0;
  }
  // ---- Affenwut / Erschöpfung (Hacker-Neongrün): Funkenregen, Fell flackert; erschöpft: grüner Dampf
  if (m.alive && (e.fz === 'rampage' || e.fz === 'tired') && Math.random() < dt * (e.fz === 'rampage' ? 30 : 8)) {
    const sx = (Math.random() - 0.5) * 4.5, sz = (Math.random() - 0.5) * 4.5;
    ctx.fx.spark({ x: m.pos.x + sx, y: m.pos.y + (e.fz === 'rampage' ? 0.5 + Math.random() * 4 : 3.2), z: m.pos.z + sz }, 1, Math.random() < 0.5 ? NEON : NEON_PEAK, e.fz === 'rampage' ? 3 : 1.0);
  }
  if (m.attack?.id === 'mampfaffe_rundum' && m.alive) { // Wirbel: Neon-Funkenring auf Armlänge
    const tau = m.attack.inst.sample(m.attack.t).tau;
    if (tau > 0.7 && tau < 1.4) for (let i = 0; i < 4; i++) { const a = Math.random() * 6.283; ctx.fx.spark({ x: m.pos.x + Math.cos(a) * 5.2, y: m.pos.y + 1.2, z: m.pos.z + Math.sin(a) * 5.2 }, 1, i % 2 ? NEON : NEON_PEAK, 3); }
  }
  // ---- Glitchpilz: Scanline-Versatz (Wurzelknoten springt seitlich), Teleport-Flackern
  const g = m.nodes.root;
  if ((food === 'glitchpilz' || e.fz === 'rampage') && m.alive && Math.floor(t * 12) % 4 === 0) g.position.x = (((Math.floor(t * 12) * 7919) % 11) / 11 - 0.5) * 0.4; else g.position.x = 0;
  let tpFlick = false;
  if (m.attack?.id === 'mampfaffe_flimmersprung') {
    const tau = m.attack.inst.sample(m.attack.t).tau;
    tpFlick = tau > 0.4 && tau < 1.2;
  }
  m.mesh.visible = !tpFlick || Math.floor(t * 24) % 2 === 0;
  e.tpFlick = tpFlick;
  // ---- Feuerrülpser: Kegelstrahl + Funken, solange er rülpst
  if (e.burpUntil > t && m.alive) {
    const mp = mouthOf(m), dx = Math.sin(m.rot), dz = Math.cos(m.rot);
    const to = { x: mp.x + dx * 9, y: mp.y - 0.6, z: mp.z + dz * 9 };
    ctx.fx.jet?.(m.id + ':burp', mp, to, { radius: 3.2, color: '#ff6a1a', life: 0.12, opacity: 0.85 });
    ctx.fx.jet?.(m.id + ':burp2', mp, { x: mp.x + dx * 8.2, y: mp.y - 0.5, z: mp.z + dz * 8.2 }, { radius: 1.7, color: '#ffe14d', life: 0.12, opacity: 0.95 });
    for (let i = 0; i < 2; i++) { const d = 1 + Math.random() * 8; ctx.fx.spark({ x: mp.x + dx * d + (Math.random() - 0.5) * d * 0.5, y: mp.y - 0.4, z: mp.z + dz * d + (Math.random() - 0.5) * d * 0.5 }, 1, Math.random() < 0.5 ? '#ffb020' : '#ffe14d', 2); }
  }
  // ---- Stinkwolken: Mesh, Wabern, Wirkung auf den lokalen Pirscher (jeder Client prüft seinen eigenen)
  const clouds = e.clouds;
  for (let i = clouds.length - 1; i >= 0; i--) {
    const q = clouds[i];
    const live = t >= q.t0 && t <= q.t1 && m.alive;
    if (!live && (t > q.t1 || !m.alive)) { q.mesh?.removeFromParent(); clouds.splice(i, 1); continue; }
    if (!q.mesh && ctx.scene) { q.mesh = makeCloudMesh(); q.mesh.position.set(q.x, q.y, q.z); ctx.scene.add(q.mesh); }
    const age = t - q.t0, left = q.t1 - t;
    if (q.mesh) {
      const grow = Math.min(1, age / 0.5), fade = Math.min(1, left / 1.0);
      q.mesh.userData.mat.opacity = 0.38 * fade; q.mesh.userData.disc.material.opacity = 0.22 * fade; q.mesh.userData.edge.material.opacity = 0.8 * fade;
      q.mesh.userData.puffs.forEach((p, k) => { const s = p.userData.s * grow * (1 + 0.12 * Math.sin(t * 2.2 + p.userData.ph)); p.scale.setScalar(s); p.rotation.y = t * 0.4 + k; p.position.y = 0.7 + (k % 4) * 0.7 + 0.2 * Math.sin(t * 1.5 + p.userData.ph); });
    }
    if (age >= 0.3 && left > 0.2) for (const p of ctx.players) {
      if (!p.local || !p.alive) continue;
      if (Math.hypot(p.pos.x - q.x, p.pos.z - q.z) > MAMPFAFFE.CLOUD_R) continue;
      p.addStatus?.('itemlock', { t: 1.0 });
      if (t >= q.nextPoison) { q.nextPoison = t + 1.0; p.addStatus?.('poison', { t: 8 }); ctx.fx.number({ x: p.pos.x, y: p.pos.y + 2.4, z: p.pos.z }, 'PFUI!', 'mf-giftkraut'); }
    }
    if (age < 60 && Math.random() < dt * 5) ctx.fx.spark({ x: q.x + (Math.random() - 0.5) * 9, y: q.y + 0.6 + Math.random() * 2, z: q.z + (Math.random() - 0.5) * 9 }, 1, FOODS.giftkraut.hi, 0.8);
  }
}

// ---------------------------------------------------------------- Futter-KI (nur Host/Solo)
function canEat(m) {
  const e = m.extra;
  return m.alive && m.authority && !m.attack && !(m.stunT > 0) && !(m.stagT > 0) && !m.tired && !m.trapped && !m.blind && !(m.st.stink > 0)
    && e.foodCd <= 0 && (!e.food || e.foodT < 10) && !(e.crashT > 0);
}
/** Läuft zur Futterstelle und startet 'mampfaffe_fressen'. true = hat diesen Schritt übernommen. */
function goEat(m, dt, maxD, calm) {
  const e = m.extra;
  e.scanT -= dt;
  if (e.eatPt && e.eatPt.usesLeft <= 0) { e.eatPt = null; e.eatT = 0; }
  if (!e.eatPt && e.scanT <= 0) { e.scanT = 1.5; e.eatPt = nearestFood(m, maxD); e.eatT = 0; }
  const pt = e.eatPt;
  if (!pt) return false;
  if (calm === false) { e.eatPt = null; return false; } // Pirscher zu nah: erst der Kampf
  e.eatT += dt;
  if (e.eatT > 25) { e.eatPt = null; e.foodCd = 8; return false; } // kommt nicht hin: aufgeben
  const dx = pt.pos.x - m.pos.x, dz = pt.pos.z - m.pos.z, d = Math.hypot(dx, dz);
  if (d <= MAMPFAFFE.EAT_DIST) {
    const want = yawOf(dx, dz);
    m.rot = stepAngle(m.rot, want, 3.5 * dt);
    m._brake(dt);
    if (Math.abs(angleDiff(m.rot, want)) < 0.35) m.beginAttack('mampfaffe_fressen');
    return true;
  }
  m._navTo(dt, pt.pos.x, pt.pos.z, m.def.walk * 1.3, 1.8 * (m.def.turn ?? 1));
  return true;
}

// ---------------------------------------------------------------- Affenwut: Kette -> erschöpft -> Futtersuche (Zonenwechsel) -> neue Kette
const BUFF_ATK = { kokosnuss: 'mampfaffe_kokoswurf', feuerpilz: 'mampfaffe_feuerruelpser', giftkraut: 'mampfaffe_stinkwolke', glitchpilz: 'mampfaffe_flimmersprung' };
const FZ_CODE = ['calm', 'rampage', 'tired', 'forage'];
const distTo = (m, t) => Math.hypot(t.pos.x - m.pos.x, t.pos.z - m.pos.z);
const gfx = (m, n, col = NEON, sp = 6) => { const p = m.nodes.body.getWorldPosition(new THREE.Vector3()); p.y += 1.5; m.ctx.fx.spark(p, n, col, sp); return p; };

function startRampage(m) {
  const e = m.extra;
  e.fz = 'rampage'; e.fzT = MAMPFAFFE.RAMPAGE * (m.mm?.rageAlways ? 1.2 : 1); e.last = null; e.links = 0;
  m.queued = null; m.chainNext = null; m.recover = Math.min(m.recover, 0.2); m.stamina = 100;
  const p = gfx(m, 40, NEON, 8); gfx(m, 20, NEON_PEAK, 6);
  m.ctx.fx.number({ x: p.x, y: p.y + 1.6, z: p.z }, 'AFFENWUT!', 'mon');
  m.ctx.hud?.center?.('AFFENWUT!', 1.6);
  m.ctx.fx.shake?.(0.5, 0.5);
  m.ctx.bus.emit('sfx', { name: 'roar', pos: m.pos });
}
function startTired(m) {
  const e = m.extra;
  e.fz = 'tired';
  m._interrupt(); m.queued = null; m.chainNext = null;
  m.tired = true; m.tiredT = MAMPFAFFE.TIRED; m.stamina = 0;
  m.ctx.bus.emit('monsterTired', { monster: m, on: true });
  const p = gfx(m, 24, NEON, 4);
  m.ctx.fx.number({ x: p.x, y: p.y + 1.6, z: p.z }, 'ERSCHÖPFT!', 'weak');
  m.ctx.hud?.center?.('ERSCHÖPFT! JETZT REINHALTEN!', 1.8);
  m.ctx.bus.emit('sfx', { name: 'burp', pos: m.pos });
}
/** Nächste Futterstelle in IRGENDEINER Zone (andere Sorte als zuletzt bevorzugt, Strafe in Metern). */
function pickForage(m) {
  const pts = m.ctx.world?.gatherPoints;
  if (!pts) return null;
  const e = m.extra;
  let best = null, bs = Infinity;
  for (const pt of pts) {
    if (!FOODS[pt.kind] || !(pt.usesLeft > 0)) continue;
    const d = Math.hypot(pt.pos.x - m.pos.x, pt.pos.z - m.pos.z);
    if (d > MAMPFAFFE.FORAGE_FAR) continue;
    const sc = d + (pt.kind === e.lastFood || pt.kind === e.food ? 35 : 0);
    if (sc < bs) { bs = sc; best = pt; }
  }
  return best;
}
function furyTick(m, dt) {
  const e = m.extra;
  e.fzCd = Math.max(0, e.fzCd - dt);
  if (!m.alive || m.state === 'dead') return;
  if (e.fz === 'calm') {
    if (furious(m) && m.state === 'combat' && e.fzCd <= 0 && m.target?.alive && !(m.stunT > 0) && !(m.stagT > 0) && !m.fleeing) startRampage(m);
  } else if (e.fz === 'rampage') {
    e.fzT -= dt; m.stamina = Math.max(m.stamina, 50);
    if (e.fzT <= 0 && !m.attack && m.state === 'combat') startTired(m);
    else if (!m.target?.alive && m.state !== 'combat') e.fz = 'calm';
  } else if (e.fz === 'tired') {
    if (!m.tired && !(m.stunT > 0)) { // Atem zurück: auf Futtersuche
      e.fz = 'forage'; e.fzT = 0; e.eatPt = null; e.eatT = 0;
      m.ctx.hud?.center?.('MAMPFAFFE HAT HUNGER!', 1.4);
    }
  } else if (e.fz === 'forage') {
    e.fzT += dt;
    if (e.fzT > MAMPFAFFE.FORAGE_MAX) { e.fz = 'calm'; e.fzCd = 3; e.eatPt = null; }
  }
}
/** Nach dem Fressen in der Futtersuche: neuer Status -> neue Kette. */
function afterEat(m) {
  const e = m.extra;
  e.lastFood = e.food;
  if (e.fz === 'forage') { if (furious(m)) startRampage(m); else { e.fz = 'calm'; e.fzCd = 3; } }
}
function rampageStep(m, dt) {
  const e = m.extra, tgt = m.target;
  m.chainNext = null; m.queued = null;
  if (m.attack) { m.chain = null; return false; } // läuft normal weiter, kein Kettenwürfeln
  if (m.recover > 0 || m.phaseT > 0 || !tgt) return false;
  const dist = distTo(m, tgt), want = yawOf(tgt.pos.x - m.pos.x, tgt.pos.z - m.pos.z);
  const diff = Math.abs(angleDiff(m.rot, want)), turn = m.def.turn ?? 1;
  const A = m.def.attacks, bk = BUFF_ATK[e.food];
  const opts = [];
  const add = (id, w) => { const a = A[id]; if (a && id !== e.last && dist >= a.range[0] && dist <= a.range[1] && (!a.cond || a.cond(m, m.ctx)) && m._atkAllowed(a)) opts.push([id, w]); };
  add('mampfaffe_sprungschlag', 6); add('mampfaffe_rolle', 2);
  add('mampfaffe_rundum', 5); add('mampfaffe_faeuste', 4); add('mampfaffe_erdschlag', 4); add('mampfaffe_stampfer', 3); add('mampfaffe_grabbel', 1.5);
  if (bk) add(bk, 4);
  if (!opts.length) { m._navTo(dt, tgt.pos.x, tgt.pos.z, m.def.run, 3.2 * turn); return true; } // hinterher, nie Pause
  if (diff > 0.45) { m._faceTarget(dt, 7 * turn); m._brake(dt); return true; }
  if (m._aggroGate?.()) { m.recover = 0.2; return true; }
  let r = m.rng() * opts.reduce((q, o) => q + o[1], 0), pick = opts[opts.length - 1][0];
  for (const o of opts) { r -= o[1]; if (r <= 0) { pick = o[0]; break; } }
  e.last = pick; e.links = (e.links ?? 0) + 1;
  m.beginAttack(pick);
  m.chain = null;
  return true;
}
function forageStep(m, dt) {
  const e = m.extra;
  if (m.attack) { if (m.attack.inst.def.wanderAttack) { m._runAttack(dt); return true; } return false; }
  if (m.stunT > 0 || m.stagT > 0) return false;
  m.chainNext = null; m.queued = null;
  if (e.eatPt && !(e.eatPt.usesLeft > 0)) e.eatPt = null;
  if (!e.eatPt) {
    e.eatPt = pickForage(m); e.eatT = 0;
    if (!e.eatPt) { e.fz = 'calm'; e.fzCd = 3; return false; } // nichts mehr zu fressen: wütet ohne neuen Status weiter
    const z = m.ctx.world.zoneAt?.(e.eatPt.pos.x, e.eatPt.pos.z), z0 = m.ctx.world.zoneAt?.(m.pos.x, m.pos.z);
    if (z != null && z0 != null && z !== z0) { // Zonenwechsel: Futter ist woanders
      e.zoneHops++;
      const p = gfx(m, 30, NEON, 7);
      m.ctx.fx.number({ x: p.x, y: p.y + 1.6, z: p.z }, 'REVIERWECHSEL!', 'mon');
      m.ctx.bus.emit('mampfaffeZone', { monster: m, from: z0, to: z });
    }
  }
  const pt = e.eatPt;
  e.eatT += dt;
  if (e.eatT > MAMPFAFFE.FORAGE_MAX) { e.eatPt = null; return false; }
  const dx = pt.pos.x - m.pos.x, dz = pt.pos.z - m.pos.z, d = Math.hypot(dx, dz);
  if (d <= MAMPFAFFE.EAT_DIST) {
    const want = yawOf(dx, dz);
    m.rot = stepAngle(m.rot, want, 4 * dt); m._brake(dt);
    if (Math.abs(angleDiff(m.rot, want)) < 0.35) m.beginAttack('mampfaffe_fressen');
    return true;
  }
  m._navTo(dt, pt.pos.x, pt.pos.z, m.def.run, 3.4 * (m.def.turn ?? 1));
  return true;
}

function brain(m, dt) {
  const e = m.extra;
  e.foodCd = Math.max(0, e.foodCd - dt);
  e.tpLock = Math.max(0, e.tpLock - dt);
  e.crashT = Math.max(0, e.crashT - dt);
  e.noteT = Math.max(0, e.noteT - dt);
  const rot = !!m.mm?.rageAlways;
  if (e.food) {
    e.foodT -= dt;
    if (e.foodT <= 0) clearFood(m, 'verdaut');
  } else e.noBuffT += dt;
  if (rot && !e.food) setFood(m, FOOD_IDS[Math.floor(m.rng() * FOOD_IDS.length)], { free: true }); // Rotglut: immer ein Buff an
  // Aushungern: kein Futter mehr im Revier und 120 s ohne Buff
  e.hungerScan -= dt;
  if (e.hungerScan <= 0) {
    e.hungerScan = 2;
    const hungry = !rot && !e.food && e.noBuffT >= MAMPFAFFE.HUNGER && foodPoints(m).length === 0;
    if (hungry && !e.hungry) { const p = mouthOf(m); m.ctx.fx.number({ x: p.x, y: p.y + 1.6, z: p.z }, 'KNURRRR!', 'mon'); m.ctx.bus.emit('sfx', { name: 'burp', pos: m.pos }); }
    e.hungry = hungry;
  }
  furyTick(m, dt);
  // Wand-Prall der Rolle: weicht die Position nennenswert vom Plan ab, ist er gegen etwas geknallt
  if (m.attack?.id === 'mampfaffe_rolle') {
    const s = m.attack.inst.sample(m.attack.t);
    if (s.tau > 0.95 && s.tau < 1.75 && Math.hypot(s.x - m.pos.x, s.z - m.pos.z) > 0.7) crash(m);
  }
}
function crash(m) {
  const p = m.nodes.head.getWorldPosition(new THREE.Vector3());
  m._interrupt(); m.queued = null;
  m.stunT = Math.max(m.stunT, MAMPFAFFE.CRASH_STUN);
  m.recover = Math.max(m.recover, 1.0);
  m.extra.crashT = 3;
  m.ctx.fx.shake?.(0.6, 0.5);
  m.ctx.fx.spark(p, 30, '#ffe14d', 7); m.ctx.fx.spark(p, 14, '#ffffff', 5);
  m.ctx.fx.number({ x: p.x, y: p.y + 1.8, z: p.z }, 'RUMMS!', 'mon');
  m.ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos });
  m.ctx.bus.emit('monsterStun', { monster: m, reason: 'crash' });
}

// ---------------------------------------------------------------- Definition
const anyBuff = (kind) => ({ atk: kind, w: 4, cond: (m) => hasBuff(m, ({ mampfaffe_kokoswurf: 'kokosnuss', mampfaffe_feuerruelpser: 'feuerpilz', mampfaffe_stinkwolke: 'giftkraut', mampfaffe_flimmersprung: 'glitchpilz' })[kind]) });

export const mampfaffe = {
  id: 'mampfaffe',
  name: 'Mampfaffe, der Magenkönig',
  hp: 16000,
  scale: SC,
  bodyRadius: 1.9,
  predator: true,
  walk: 3.4, run: 8.0, turn: 1.1, detect: 30, prefer: 4.5,
  parts: [
    { id: 'head', label: 'Kopf', factor: 1.0, breakHp: 1050, jitter: 0.07, elem: { fire: 10, shock: 10 }, blunt: true, stunPart: true,
      spheres: [{ node: 'head', offset: [0, 0.05, 0.4], r: 0.62 }] },
    { id: 'prankeL', label: 'Linke Faust', factor: 0.8, breakHp: 650, jitter: 0.06, elem: { fire: 15, shock: 10 },
      spheres: [{ node: 'fistL', offset: [0, -0.35, 0.15], r: 0.7 }] },
    { id: 'prankeR', label: 'Rechte Faust', factor: 0.8, breakHp: 650, jitter: 0.06, elem: { fire: 15, shock: 10 },
      spheres: [{ node: 'fistR', offset: [0, -0.35, 0.15], r: 0.7 }] },
    { id: 'belly', label: 'Bauch', factor: 0.9, elem: { fire: 28, shock: 10 },
      spheres: [{ node: 'body', offset: [0, -0.45, 0.85], r: 0.95 }, { node: 'cheekL', offset: [0, 0, 0], r: 0.5 }, { node: 'cheekR', offset: [0, 0, 0], r: 0.5 }] },
    { id: 'body', label: 'Körper', factor: 0.6, elem: { fire: 15, shock: 15 },
      spheres: [{ node: 'body', offset: [0, 0.4, -0.2], r: 1.05 }, { node: 'body', offset: [0, 1.0, 0.3], r: 0.8 }, { node: 'neck', offset: [0, 0, 0.1], r: 0.5 }] },
    { id: 'legs', label: 'Beine', factor: 0.8, elem: { fire: 15, shock: 25 },
      spheres: [{ node: 'legL', offset: [0, -0.4, 0.1], r: 0.62 }, { node: 'legR', offset: [0, -0.4, 0.1], r: 0.62 }] },
  ],
  attacks: {
    mampfaffe_faeuste: faeuste, mampfaffe_grabbel: grabbel, mampfaffe_stampfer: stampfer, mampfaffe_rolle: rolle, mampfaffe_brust: brust, mampfaffe_fressen: fressen,
    mampfaffe_erdschlag: erdschlag, mampfaffe_rundum: rundum, mampfaffe_sprungschlag: sprungschlag,
    mampfaffe_kokoswurf: kokoswurf, mampfaffe_feuerruelpser: feuerruelpser, mampfaffe_stinkwolke: stinkwolke, mampfaffe_flimmersprung: flimmersprung,
  },
  teachAttack: 'mampfaffe_faeuste',
  recoverAfter: (m) => (m.extra.fz === 'rampage' ? 0.03 + m.rng() * 0.05 : (0.1 + m.rng() * 0.22) / m.speedMul), // Affenwut: kaum Atempause
  stamina: true,
  flinchDmg: 1050,
  phases: [{
    at: 0.5, name: 'FRESSRAUSCH', cue: cue('droehn', NEON_PEAK), special: 'mampfaffe_brust',
    enter(m) { m.extra.foodCd = Math.min(m.extra.foodCd, MAMPFAFFE.CD_RAGE); if (m.extra.food) m.extra.foodT = Math.max(m.extra.foodT, MAMPFAFFE.BUFF_RAGE); },
  }],
  chains: {
    mampfaffe_faeuste: [
      { atk: 'mampfaffe_grabbel', w: 3 }, { atk: 'mampfaffe_stampfer', w: 3 }, { atk: 'mampfaffe_rundum', w: 3 }, { atk: 'mampfaffe_erdschlag', w: 3 },
      anyBuff('mampfaffe_kokoswurf'), anyBuff('mampfaffe_feuerruelpser'), anyBuff('mampfaffe_stinkwolke'), anyBuff('mampfaffe_flimmersprung'),
      { atk: null, w: 3 },
    ],
    mampfaffe_grabbel: [{ atk: 'mampfaffe_faeuste', w: 4 }, { atk: null, w: 2 }],
    mampfaffe_rolle: [{ atk: 'mampfaffe_stampfer', w: 2 }, { atk: 'mampfaffe_sprungschlag', w: 2 }, { atk: null, w: 3 }],
    mampfaffe_rundum: [{ atk: 'mampfaffe_erdschlag', w: 3 }, { atk: 'mampfaffe_faeuste', w: 2 }, { atk: null, w: 3 }],
    mampfaffe_sprungschlag: [{ atk: 'mampfaffe_rundum', w: 4 }, { atk: 'mampfaffe_faeuste', w: 3 }, { atk: null, w: 2 }],
    mampfaffe_brust: [{ atk: 'mampfaffe_rolle', w: 2 }, { atk: 'mampfaffe_faeuste', w: 3 }],
  },
  speedFactor: (m) => (m.extra.fz === 'rampage' ? MAMPFAFFE.RAMPAGE_SPEED : m.extra.fz === 'forage' ? 1.4 : 1),
  dmgFactor: (m) => (m.extra.hungry ? 1.1 : 1), // Knurrender Magen: +10 % Schaden
  hitDmgMul: (m, hit) => (hit.side && m.partById['pranke' + hit.side]?.broken ? 0.75 : 1), // Faustbruch: -25 % auf der Seite
  partHpMul: (m, part) => (part.id === 'head' && m.extra.hard ? 0.5 : 1) * (m.extra.fz === 'tired' ? MAMPFAFFE.TIRED_DMG : 1), // erschöpft: Teile nehmen +30 % // harter Schädel: Teil-HP-Schaden halbiert
  build: () => buildMampfaffe({ scale: SC }),
  init(m) {
    Object.assign(m.extra, {
      food: null, foodT: 0, foodCd: 3, noBuffT: 0, hungry: false, hungerScan: 2, eatPt: null, eatT: 0, scanT: 0.5, clouds: [], burpUntil: 0, tpLock: 0, crashT: 0, noteT: 0, hard: false, puffT: 0, fz: 'calm', fzT: 0, fzCd: 0, lastFood: null, zoneHops: 0, last: null, links: 0,
    });
  },
  // Im Wandern: Futter suchen und fressen (Angriff 'fressen' läuft hier)
  wander(m, dt) {
    if (m.extra.fz === 'forage') return forageStep(m, dt);
    if (m.attack) { if (m.attack.inst.def.wanderAttack) { m._runAttack(dt); return true; } return false; }
    if (!canEat(m)) { m.extra.eatPt = null; return false; }
    return goEat(m, dt, MAMPFAFFE.EAT_FAR);
  },
  // Im Kampf: nur wenn der Pirscher > 8 m weg ist, in 18 m Umkreis
  combat(m, dt) {
    if (m.extra.fz === 'rampage') return rampageStep(m, dt);
    if (m.extra.fz === 'forage') return forageStep(m, dt);
    if (!canEat(m) || m.chainNext || m.queued || m.phaseT > 0 || m.recover > 0 || !m.target) { if (m.extra.eatPt && !m.attack) m.extra.eatPt = null; return false; }
    const far = Math.hypot(m.target.pos.x - m.pos.x, m.target.pos.z - m.pos.z) > MAMPFAFFE.SAFE_DIST;
    return goEat(m, dt, MAMPFAFFE.EAT_NEAR, far);
  },
  tick(m, dt) {
    visuals(m, dt);
    if (m.authority && m.alive) brain(m, dt);
  },
  glow(m) {
    const f = m.extra.food;
    if (m.extra.fz === 'rampage' && !f) return Math.floor(m.time * 14) % 2 ? NEON_GLOW : null;
    if (!f) return m.extra.tpFlick ? NEON_GLOW : null;
    const c = FOODS[f].glow, t = m.time;
    let k = 0.82 + 0.18 * Math.sin(t * 5);
    if (f === 'glitchpilz') k = Math.floor(t * 12) % 2 ? 1.1 : 0.2;
    const o = (m.extra.glowOut ??= [0, 0, 0]);
    o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k;
    return o;
  },
  // Treffer auf den Pirscher: Wischer klaut Futter, Glitchpilz verwirrt (alle Treffer). Läuft nur beim getroffenen (lokalen) Client.
  onHitPlayer(m, p, h) {
    if (h.hit?.steal) {
      const got = stealFromPouch(m.ctx.inventory);
      if (got) {
        const nm = ({ kokosnuss: 'Kokosnuss', feuerpilz: 'Feuerpilz', giftkraut: 'Giftkraut', glitchpilz: 'Glitchpilz' })[got.id];
        m.ctx.fx.number({ x: p.pos.x, y: p.pos.y + 2.4, z: p.pos.z }, `−${got.n} ${nm} geklaut!`, 'mf-' + got.id);
        m.ctx.toast?.(`Futterklau: −${got.n} ${nm}`);
        m.ctx.bus.emit('sfx', { name: 'chew', pos: m.pos });
        if (m.authority) setFood(m, got.id, { stolen: true, free: true }); // frisst das Geklaute sofort (ohne eine Stelle zu verbrauchen)
        else m.ctx.net?.sendSteal?.(m.id, got.id); // Gast: der Host setzt den Buff
      }
    }
    if (hasBuff(m, 'glitchpilz')) p.addStatus?.('verwirrt', { t: MAMPFAFFE.VERWIRRT });
  },
  // Host: ein Gast hat Futter geklaut -> er frisst es sofort (ohne Stelle zu verbrauchen)
  onFoodStolen(m, kind) { if (FOODS[kind] && m.authority && m.alive) setFood(m, kind, { stolen: true, free: true }); },
  onAttackEnd(m, id) { if (id === 'mampfaffe_fressen') m.extra.eatPt = null; },
  onDamage(m, res, ev) {
    const e = m.extra;
    if (res.partId === 'head' && e.hard && e.noteT <= 0) {
      e.noteT = 0.5;
      const p = m.nodes.head.getWorldPosition(new THREE.Vector3());
      m.ctx.fx.spark(p, 10, FOODS.kokosnuss.hi, 5);
      m.ctx.fx.number({ x: p.x, y: p.y + 1.4, z: p.z }, 'KLONG!', 'mf-kokosnuss');
    }
    // Schock mit Glitchpilz im Bauch: Kurzschluss, Teleport 5 s gesperrt (nur Autorität entscheidet)
    if (res.elemBy?.shock > 0 && e.food === 'glitchpilz' && m.authority && e.tpLock <= 0) {
      e.tpLock = MAMPFAFFE.TP_LOCK;
      const p = m.nodes.body.getWorldPosition(new THREE.Vector3());
      m.ctx.fx.spark(p, 20, NEON, 6); m.ctx.fx.number({ x: p.x, y: p.y + 2.2, z: p.z }, 'KURZSCHLUSS!', 'mon');
      if (m.attack?.id === 'mampfaffe_flimmersprung') { m._interrupt(); m.recover = Math.max(m.recover, 0.8); }
    }
    if (ev?.stunned && e.food && m.authority) clearFood(m, 'ausgespuckt'); // Betäubung: spuckt es aus
  },
  onBreak(m, part) {
    if (part.id === 'head') {
      m.extra.hard = false; // _breakPart hat den Faktor schon zurückgesetzt: nichts mehr draufrechnen
      if (m.extra.helmet) m.extra.helmet.visible = false;
      if (m.authority) clearFood(m, 'ausgespuckt');
      else { m.extra.food = null; applyFoodState(m, null); }
    }
    if (part.id === 'prankeL' || part.id === 'prankeR') {
      const side = part.id.slice(-1);
      for (const mesh of m.extra.fistMeshes[side]) mesh.scale.setScalar(0.78);
      const p = m.nodes['fist' + side].getWorldPosition(new THREE.Vector3());
      m.ctx.fx.spark(p, 20, '#ffffff', 6);
      m.ctx.fx.number({ x: p.x, y: p.y + 1.2, z: p.z }, 'AUTSCH!', 'weak');
    }
  },
  snapExtra: (m) => ({ f: m.extra.food || 0, t: Math.round(m.extra.foodT || 0), h: m.extra.hungry ? 1 : 0, w: Math.max(0, FZ_CODE.indexOf(m.extra.fz)) }),
  applySnapExtra(m, ex) {
    const e = m.extra, f = ex.f || null;
    if (f !== (e.food || null)) { e.food = f; applyFoodState(m, f); if (f) foodFx(m, f); }
    e.foodT = ex.t ?? 0;
    e.hungry = !!ex.h;
    e.fz = FZ_CODE[ex.w || 0] ?? 'calm';
  },
  // Perfekt ausgewichen (Glitch-Konter auf das Brusttrommeln): er verschluckt sich und taumelt
  onGlitchCounter(m, attackId) {
    if (attackId !== 'mampfaffe_brust') return;
    m._interrupt(); m.queued = null; m.chainNext = null;
    m.stunT = Math.max(m.stunT, MAMPFAFFE.DIZZY);
    m.recover = Math.max(m.recover, 0.6);
    const p = m.nodes.head.getWorldPosition(new THREE.Vector3());
    m.ctx.fx.spark(p, 26, NEON, 6); m.ctx.fx.spark(p, 12, NEON_PEAK, 4);
    m.ctx.fx.number({ x: p.x, y: p.y + 1.6, z: p.z }, 'VERSCHLUCKT!', 'mon');
    m.ctx.bus.emit('monsterStun', { monster: m, reason: 'glitch' });
  },
  poseHook(m, p) {
    // nach der Rolle den Salto-Winkel auf (-180, 180] zurücksetzen, sonst wickelt sich der Körper rückwärts auf
    const bp = m.pose.bodyPitch;
    if (!m.attack && Math.abs(bp) > 180) m.pose.bodyPitch = bp - 360 * Math.round(bp / 360);
    if (m.extra.hungry && !m.attack) { p.bodyRoll += Math.sin(m.time * 3.1) * 3; p.jaw += 6 + 5 * Math.sin(m.time * 2.3); p.spread = Math.max(p.spread, 0.15); }
    if (m.extra.food && !m.attack) { p.spread = Math.max(p.spread, 0.18 + 0.1 * Math.sin(m.time * 4)); p.wing = Math.max(p.wing, 0.06); } // satt: Backen immer ein bisschen prall
  },
  onRage(m, on) { m.extra.eyeMat?.color.set(on ? '#ff3020' : '#ffe14d'); },
};
