// Krachfaust, der Tempelbrecher (Smaragdküste, JR 9 -> 10): Apex im Verfluchten Tempel. Fäuste und Kopf tragen eine Hülle aus Glitch-Schleim, die pulsiert, bevor sie platzt.
// Schläge hinterlassen Schleim am Boden oder am Pirscher (Zündschnur 2 s, Puls dunkelgrün -> hellgrün -> weißgrün), eine Rolle schüttelt ihn ab.
// Unter 40 % glühen die Tempelrunen in Hacker-Neongrün (Runenwut), unter 12 % kommt der URKNALL: Aufladen mit lautem Telegraph, dann geht die ganze Plattform hoch.
// Wer nicht hinter einer hohen Säule steht, verliert 70 % der Max-LP; die Säule bricht danach. Alles aus vorhandenen Systemen (Marker, Shake, Flash, Licht, Sfx).
// Greift alles an, was seinen Tempel betritt, auch andere Brocken (Apex-Modus in game/revier.js).
// Farbregel (docs/SMARAGD_BROCKEN.md 1.2): Glitch-Effekte Hacker-Neongrün, nie Cyan/Magenta.
import * as THREE from 'three';
import { basic, lambert } from '../../render/ps1.js';
import { tex, registerTexture } from '../../render/textures.js';
import { mTrack } from './monster.js';
import { slimeDef } from './mprojectiles.js';
import { smooth, clamp01 } from './common.js';
import { localToWorld, yawOf } from '../../core/math.js';
import { time } from '../../core/time.js';
import { slimeBlast, SLIME_R, SLIME_DMG } from '../effects.js';
import { TEMPLE_C, onTemple } from '../world/smaragdkuesteLayout.js';

const SC = 3.0;
const NEON = '#39ff14', NEON_HI = '#7dff3a', NEON_PEAK = '#d8ffd0', NEON_DARK = '#1f9d0f';
const cue = (tone, color = NEON) => ({ color, tone, noShift: true });
const ring = (radius) => ({ at: 'self', radius, color: NEON, peak: NEON_PEAK });

export const KRACH = {
  FUSE: 2.2, FUSE_WUT: 1.5, PLAYER_FUSE: 2.0, PLAYER_FUSE_WUT: 1.4, ABSORB_R: 1.3, MAX_SLIMES: 24,
  URK_PCT: 0.7, URK_R: 52, URK_CHARGE: [1.5, 6.5], URK_SILENCE: 5.5, URK_BOOM: 6.5, URK_END: 7.1,
  RUNE_TINT: '#b8ff1a', STUN_HEAD: 3,
};

// ---- Texturen (16 px): blauschwarzer Obsidian-Panzer mit hellen Plattenkanten, Platten/Stachel, finsteres Gesicht, gelbgrüne Schleimhaut mit dunklem Schuppenmuster
registerTexture('krachfaust_hide', (g, n, rnd) => {
  g.fillStyle = '#232c4c'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#34406a';
  for (let i = 0; i < n * 2; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 3, 1);
  g.fillStyle = '#0f1224';
  for (let y = 3; y < n; y += 5) g.fillRect(((y * 3) % n) | 0, y, 6, 1); // Plattenfugen
  g.fillStyle = '#7088d0'; // Obsidian-Glanz
  for (let i = 0; i < 4; i++) g.fillRect((rnd() * (n - 3)) | 0, (rnd() * n) | 0, 3, 1);
  g.fillStyle = NEON_DARK;
  for (let i = 0; i < 2; i++) { const x = (rnd() * (n - 3)) | 0, y = (rnd() * (n - 3)) | 0; g.fillRect(x, y, 1, 2); }
});
registerTexture('krachfaust_plate', (g, n, rnd) => {
  g.fillStyle = '#1a2040'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#44548a';
  for (let y = 0; y < n; y += 4) g.fillRect(0, y, n, 1); // Kanten
  g.fillStyle = '#8098e0'; g.fillRect(0, 0, 2, n);
  g.fillStyle = '#0a0c18';
  for (let i = 0; i < n; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 2, 2);
});
registerTexture('krachfaust_face', (g, n, rnd) => {
  g.fillStyle = '#161a30'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#242c4c';
  for (let i = 0; i < n; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 2, 1);
  g.fillStyle = '#0a0c1a'; g.fillRect(0, n - 3, n, 1);
});
registerTexture('krachfaust_slime', (g, n, rnd) => { // gelbgrün (Brachydios-Schleim) mit dunklerem Schuppenmuster
  g.fillStyle = '#b4d422'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#6a9a14';
  for (let y = 0; y < n; y += 4) for (let x = (y / 4 % 2) * 2; x < n; x += 4) g.fillRect(x, y, 3, 3); // Schuppen
  g.fillStyle = '#d8f040';
  for (let y = 0; y < n; y += 4) for (let x = (y / 4 % 2) * 2; x < n; x += 4) g.fillRect(x, y, 1, 1); // Glanzpunkte
  g.fillStyle = '#3c6a0a';
  for (let i = 0; i < 6; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1);
});

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const spikeGeo = new THREE.ConeGeometry(1, 1, 4); // Spitze zeigt nach +y; Grundkreis r 1, Höhe 1 (skaliert)
const blobGeo = new THREE.SphereGeometry(1, 8, 6);
const R = Math.PI / 180;

/**
 * Krachfaust-Modell (nach Brachydios): blauschwarzer Obsidian-Panzer-Wyvern, vorgebeugt, Kamm aus großen zurückgeschwungenen Stacheln über Nacken/Rücken,
 * langer Schädel mit riesigem stumpfem Horn-Rüssel, KEULEN-Unterarme, Krallen-Hinterbeine, langer Stachelschwanz mit Stachelfächer am Ende.
 * Fäuste und Horn sind MASSIV gelbgrün (Diffuse, kein Leuchthof); beim Zünden pulsieren sie nur in der Farbe (Material-Tönung).
 * Teile: head, prankeL/prankeR, body, legs, tail. Pose-Schlüssel wie im Mampfaffe-Rig: legL/legR = ARM-Schwung (die Beine laufen gegengleich), wing = Arme nach innen
 * (Brusttrommeln), jaw, head/headYaw/neck, tailYaw/tailPitch (Schwanz-Peitsche).
 */
export function buildKrachfaust({ scale = SC } = {}) {
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  root.add(g);
  const partMeshes = { head: [], prankeL: [], prankeR: [], body: [], legs: [], tail: [] };
  const mats = {};
  const mat = (part, t) => (mats[part + t] ??= lambert({ map: tex(t, { size: 16 }) }));
  const put = (part, geo, m, parent, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.set(rx, ry, rz);
    parent.add(mesh); partMeshes[part].push(mesh);
    return mesh;
  };
  const box = (part, w, h, d, t, parent, x, y, z, rx, ry, rz) => put(part, boxGeo, mat(part, t), parent, x, y, z, w, h, d, rx, ry, rz);
  // Stachel: Grundfläche r, Länge len; pitch = Winkel der Spitze über der Waagrechten nach hinten (0 = flach nach hinten, 90 = senkrecht hoch), yaw dreht zur Seite
  const spike = (part, r, len, parent, x, y, z, pitch = 40, yaw = 0) => {
    const m = put(part, spikeGeo, mat(part, 'krachfaust_plate'), parent, x, y, z, r, len, r);
    m.rotation.order = 'YXZ';
    m.rotation.set(pitch * R - Math.PI / 2, yaw * R, 0);
    return m;
  };
  const claw = (part, r, len, parent, x, y, z, down = 0) => { // Kralle nach vorn (+z), leicht nach unten
    const m = put(part, spikeGeo, mat(part, 'krachfaust_plate'), parent, x, y, z, r, len, r);
    m.rotation.x = Math.PI / 2 + down * R;
    return m;
  };

  const BASE = 2.1;
  const body = new THREE.Group();
  body.position.y = BASE;
  g.add(body);
  const torso = new THREE.Group(); // Ruhehaltung: vorgebeugt wie Brachydios (Schultern hoch, Hüfte tief)
  torso.rotation.x = 0.08;
  body.add(torso);
  // Rumpf: tiefe Brust, hoher Schulterbuckel, schmalere Hüfte
  box('body', 2.3, 1.9, 2.3, 'krachfaust_hide', torso, 0, 0.35, 0.55);
  box('body', 2.7, 0.9, 1.7, 'krachfaust_plate', torso, 0, 1.35, 0.75, 0.12);
  box('body', 1.7, 1.4, 1.8, 'krachfaust_hide', torso, 0, 0.05, -1.25);
  box('body', 1.9, 0.5, 2.6, 'krachfaust_face', torso, 0, -0.55, 0.1); // dunkler Bauch
  // Rückenkamm: große, zurückgeschwungene Stacheln, vorn am größten
  const crest = [[1.55, 0.95, 3.2, 40], [0.65, 0.9, 3.0, 40], [-0.3, 0.78, 2.5, 38], [-1.0, 0.65, 2.0, 38], [-1.7, 0.5, 1.5, 38], [-2.3, 0.4, 1.1, 38]];
  for (const [z, r, len, pitch] of crest) {
    const y = z > 0 ? 1.65 : 1.45 - (0.7 - z) * 0.2;
    spike('body', r, len, torso, 0, y, z, pitch);
    spike('body', r * 0.7, len * 0.7, torso, 0.72, y - 0.12, z + 0.05, pitch - 8, -22);
    spike('body', r * 0.7, len * 0.7, torso, -0.72, y - 0.12, z + 0.05, pitch - 8, 22);
  }
  // Schulterplatten (breite Flügel-Stacheln) und Flankenstacheln
  for (const sx of [1, -1]) {
    spike('body', 0.9, 3.0, torso, sx * 1.55, 1.3, 0.55, 22, sx * -60);
    spike('body', 0.5, 1.6, torso, sx * 1.35, 0.55, -0.9, 12, sx * -62);
    spike('body', 0.38, 1.1, torso, sx * 1.2, -0.1, -1.9, 10, sx * -55);
  }
  // Rücken-Runen (dunkelgrün, in der Wut Neon): dünne Streifen auf Schulterbuckel/Hüfte
  const runeMat = basic({ color: '#124a0c', fog: false });
  const runes = [];
  for (const [x, y, z, w, h, d] of [[-0.55, 1.82, 0.5, 0.16, 0.05, 0.9], [0.55, 1.82, 0.5, 0.16, 0.05, 0.9], [0, 1.83, 1.2, 1.2, 0.05, 0.14], [-0.7, 0.7, -1.3, 0.06, 0.9, 0.16], [0.7, 0.7, -1.3, 0.06, 0.9, 0.16], [0, 0.78, -1.45, 0.9, 0.06, 0.12]]) {
    const m = new THREE.Mesh(boxGeo, runeMat); m.scale.set(w, h, d); m.position.set(x, y, z); torso.add(m); runes.push(m);
  }
  // Hals + Kopf: Hals dick, Kopf tief, langer Schädel; Rüssel/Horn = gelbgrün, stumpf, riesig
  const neck = new THREE.Group();
  neck.position.set(0, 1.0, 1.5);
  torso.add(neck);
  box('body', 1.3, 1.2, 1.7, 'krachfaust_hide', neck, 0, 0, 0.55);
  for (const [z, len] of [[0.1, 2.3], [0.7, 1.9], [1.2, 1.5]]) spike('body', 0.5, len, neck, 0, 0.75, z, 50); // Nackenkamm
  const head = new THREE.Group();
  head.position.set(0, -0.05, 1.35);
  neck.add(head);
  box('head', 1.15, 0.95, 1.7, 'krachfaust_face', head, 0, 0, 0.55);
  box('head', 1.3, 0.3, 1.0, 'krachfaust_plate', head, 0, 0.55, 0.3); // Brauenplatte
  const slimeHead = mat('head', 'krachfaust_slime');
  put('head', blobGeo, slimeHead, head, 0, -0.1, 1.75, 0.68, 0.62, 1.45); // das riesige stumpfe Horn-Rüssel
  put('head', blobGeo, slimeHead, head, 0, 0.12, 2.45, 0.5, 0.45, 0.55); // Hornspitze
  for (const sx of [1, -1]) {
    spike('head', 0.45, 2.6, head, sx * 0.4, 0.55, 0.1, 25, sx * 14); // Kronenhörner, weit zurück
    spike('head', 0.3, 1.5, head, sx * 0.62, 0.15, 0.0, 10, sx * 38); // Wangenstacheln
    spike('head', 0.22, 1.1, head, sx * 0.6, -0.25, 0.2, 6, sx * 50);
  }
  const eyeM = basic({ color: '#ffe14d' });
  for (const sx of [1, -1]) put('head', boxGeo, eyeM, head, sx * 0.58, 0.22, 0.95, 0.12, 0.18, 0.3);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.4, 0.5);
  head.add(jaw);
  box('head', 0.9, 0.22, 1.5, 'krachfaust_face', jaw, 0, -0.05, 0.55);
  // Arme: Oberarm gepanzert mit Ellbogenstachel, Unterarm = riesige Keule (gelbgrün, Schuppenmuster)
  const arms = {}, fists = {}, fistMats = {};
  for (const [name, sx, fist] of [['armL', 1, 'prankeL'], ['armR', -1, 'prankeR']]) {
    const a = new THREE.Group();
    a.position.set(sx * 1.55, 0.7, 1.0);
    torso.add(a);
    box('body', 1.1, 1.3, 1.1, 'krachfaust_hide', a, 0, -0.5, 0);
    box('body', 1.4, 0.4, 1.2, 'krachfaust_plate', a, sx * 0.05, 0.05, 0); // Schulterkappe
    const fa = new THREE.Group();
    fa.position.set(0, -1.05, 0);
    a.add(fa);
    box('body', 0.8, 0.8, 0.8, 'krachfaust_hide', fa, 0, -0.3, 0);
    spike('body', 0.26, 1.2, fa, sx * 0.3, -0.1, -0.35, 20, sx * -75); // Ellbogenstachel
    const f = new THREE.Group();
    f.position.set(0, -0.7, 0.05);
    fa.add(f);
    fistMats[fist] = mat(fist, 'krachfaust_slime');
    put(fist, blobGeo, fistMats[fist], f, 0, -0.85, 0.12, 0.72, 1.45, 0.78); // Keule: lang gestreckt wie ein Baseballschläger
    put(fist, blobGeo, fistMats[fist], f, 0, -1.75, 0.2, 0.85, 0.6, 0.88); // dicke Faustkuppe am Ende
    for (const kx of [-0.34, 0, 0.34]) claw(fist, 0.1, 0.4, f, kx, -2.0, 0.55, 40);
    arms[name] = a; fists[name] = f;
  }
  // Hinterbeine: Oberschenkel, abgeknickter Lauf, Krallenfuß
  const legs = {};
  for (const [name, sx] of [['legL', 1], ['legR', -1]]) {
    const l = new THREE.Group();
    l.position.set(sx * 1.0, -0.1, -1.4);
    body.add(l);
    box('legs', 1.0, 1.5, 1.4, 'krachfaust_hide', l, 0, -0.5, 0.1, 0.25);
    box('legs', 0.75, 1.4, 0.75, 'krachfaust_hide', l, 0, -1.4, -0.35, -0.45);
    spike('legs', 0.28, 1.0, l, sx * 0.4, -0.5, -0.5, 25, sx * -60);
    box('legs', 0.95, 0.3, 1.5, 'krachfaust_plate', l, 0, -1.95, 0.25);
    for (const kx of [-0.32, 0, 0.32]) claw('legs', 0.14, 0.7, l, kx, -1.9, 1.05, 18);
    legs[name] = l;
  }
  // Schwanz: drei Segmente (Peitsche), Rückenstacheln, am Ende ein Stachelfächer
  const tail1 = new THREE.Group();
  tail1.position.set(0, 0.2, -2.2);
  torso.add(tail1);
  box('tail', 1.2, 1.0, 2.0, 'krachfaust_hide', tail1, 0, 0, -0.9);
  spike('tail', 0.4, 1.3, tail1, 0, 0.5, -0.4, 36); spike('tail', 0.32, 1.1, tail1, 0, 0.5, -1.2, 38);
  const tail2 = new THREE.Group(); tail2.position.set(0, 0, -1.9); tail1.add(tail2);
  box('tail', 0.85, 0.8, 2.0, 'krachfaust_hide', tail2, 0, 0, -0.9);
  spike('tail', 0.3, 1.0, tail2, 0, 0.4, -0.4, 36); spike('tail', 0.25, 0.9, tail2, 0, 0.4, -1.3, 38);
  const tail3 = new THREE.Group(); tail3.position.set(0, 0, -1.9); tail2.add(tail3);
  box('tail', 0.6, 0.6, 1.8, 'krachfaust_hide', tail3, 0, 0, -0.8);
  const fan = new THREE.Group(); fan.position.set(0, 0, -1.7); tail3.add(fan);
  box('tail', 0.9, 0.9, 0.9, 'krachfaust_plate', fan, 0, 0, -0.2);
  for (const [yaw, pitch, len, r] of [[-62, 20, 2.2, 0.36], [-32, 38, 2.9, 0.42], [0, 52, 3.5, 0.5], [32, 38, 2.9, 0.42], [62, 20, 2.2, 0.36], [0, 12, 2.2, 0.3]]) spike('tail', r, len, fan, 0, 0, -0.5, pitch, yaw);

  const nodes = { body, neck, head, jaw, armL: arms.armL, armR: arms.armR, fistL: fists.armL, fistR: fists.armR, legL: legs.legL, legR: legs.legR, tail1, tail2, tail3, root: g };
  const ARM_REST = 14;
  return {
    root, nodes, partMeshes,
    extra: { eyeMat: eyeM, scale, runeMat, runes, fistMats, headMat: slimeHead, slimeMats: [fistMats.prankeL, fistMats.prankeR, slimeHead] },
    apply(p) {
      body.position.y = BASE + p.bodyY / scale;
      body.rotation.set(p.bodyPitch * R, 0, p.bodyRoll * R);
      neck.rotation.x = 0.2 + p.neck;
      head.rotation.set(-(0.2 + p.neck) + 0.1 + p.head * R, p.headYaw * R, 0);
      jaw.rotation.x = p.jaw * R;
      arms.armL.rotation.set(-(ARM_REST + p.legL + 30 * p.wing) * R, 0, -p.wing * 0.95);
      arms.armR.rotation.set(-(ARM_REST + p.legR + 30 * p.wing) * R, 0, p.wing * 0.95);
      fists.armL.rotation.x = -0.25 - p.wing * 0.4; fists.armR.rotation.x = -0.25 - p.wing * 0.4;
      legs.legL.rotation.x = -p.legR * 0.55 * R; // Beine gegengleich zum Arm
      legs.legR.rotation.x = -p.legL * 0.55 * R;
      const ty = p.tailYaw * R, tp = p.tailPitch * R;
      tail1.rotation.set(tp * 0.4, ty * 0.45, 0); tail2.rotation.set(tp * 0.35, ty * 0.35, 0); tail3.rotation.set(tp * 0.25, ty * 0.3, 0);
    },
  };
}

// ---------------------------------------------------------------- Zustand / Hilfsfunktionen
const Z = { legL: 0, legR: 0, bodyPitch: 0, bodyY: 0, bodyRoll: 0, head: 0, neck: 0, wing: 0, spread: 0, jaw: 0, headYaw: 0 };
/** Runenwut: unter 40 % (Phase 1) oder Rotglut-Dauerwut. Läuft bei Host und Gästen (Phase kommt per Snapshot). */
export const wut = (m) => m.phase >= 1 || !!m.mm?.rageAlways;
const fuseOf = (m) => (wut(m) ? KRACH.FUSE_WUT : KRACH.FUSE);
const playerFuse = (m) => (wut(m) ? KRACH.PLAYER_FUSE_WUT : KRACH.PLAYER_FUSE);
const STAGE_COL = [[NEON_DARK, '#2bc010'], [NEON, NEON_HI], [NEON_PEAK, '#ffffff']];
const TINT = [[[1, 1, 1], [0.85, 0.95, 0.8]], [[1.5, 1.6, 0.9], [1, 1.1, 0.8]], [[2.4, 2.4, 1.9], [1.3, 1.5, 1.0]]], TINT_BROKEN = [0.4, 0.45, 0.4];
const STAGE_HZ = [2, 5, 12], STAGE_PITCH = [1, 1.3, 1.7];
/** Puls-Stufe nach Restzeit: > 1,0 s dunkelgrün 2 Hz, 1,0-0,4 s hellgrün 5 Hz, < 0,4 s weißgrün 12 Hz. */
export const stageOf = (left) => (left > 1.0 ? 0 : left > 0.4 ? 1 : 2);

/** Weltpunkt eines Angriffs zur Def-Zeit tau, lokal (lx seitlich, lz vorwärts). */
function atLocal(inst, tau, lx, lz) {
  const s = inst.sample(inst.wall(tau));
  return localToWorld({}, { x: s.x, y: 0, z: s.z }, s.yaw, lx, 0, lz);
}

// ---- Boden-Schleim (m.extra.slimes), gefüllt durch `all`-Events -> bei allen Clients gleich
export function addSlime(m, x, z, { delay = 0, age = 0, small = false } = {}) {
  const list = m.extra.slimes;
  const used = new Set(list.map((q) => q.slot));
  let slot = 0; while (used.has(slot)) slot++;
  const s = {
    x, y: m.ctx.world.heightAt(x, z), z, start: m.time - age + delay, fuse: fuseOf(m), r: small ? 1.2 : 1.6, blastR: small ? 2.6 : SLIME_R, dmg: small ? 20 : SLIME_DMG,
    slot, mesh: null, tick: -9, key: `${m.id}:sl${slot}`,
  };
  list.push(s);
  if (list.length > KRACH.MAX_SLIMES) { const o = list.shift(); dropSlime(m, o); }
  return s;
}
function dropSlime(m, s) { s.mesh?.removeFromParent(); s.mesh?.userData.mat.dispose(); m.ctx.fx.clearMarker?.(s.key); }

/** Pfützen im Radius platzen sofort und harmlos (Schock fährt durch den Schleim). */
export function popSlimes(m, at, r = 4) {
  const list = m.extra.slimes;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    if (Math.hypot(s.x - at.x, s.z - at.z) > r) continue;
    m.ctx.fx.spark({ x: s.x, y: s.y + 0.5, z: s.z }, 14, NEON, 6); m.ctx.fx.spark({ x: s.x, y: s.y + 0.5, z: s.z }, 6, NEON_PEAK, 4);
    dropSlime(m, s); list.splice(i, 1);
  }
  m.ctx.bus.emit('sfx', { name: 'slimeSplat', pos: at });
}

const discGeo = new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2);
function makeSlimeMesh(s) {
  const grp = new THREE.Group();
  const mat = basic({ color: NEON, transparent: true, opacity: 0.88, depthWrite: false, fog: false });
  const disc = new THREE.Mesh(discGeo, mat);
  disc.scale.setScalar(s.r); disc.position.y = 0.12; disc.renderOrder = 2;
  grp.add(disc);
  const blobs = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.28 + s.slot, d = s.r * (0.35 + 0.15 * (i % 2));
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(0.5 + 0.2 * (i % 3), 0.45 + 0.25 * (i % 2), 0.5 + 0.15 * (i % 3)); m.position.set(Math.cos(a) * d, 0.3, Math.sin(a) * d); m.rotation.y = a;
    grp.add(m); blobs.push(m);
  }
  grp.position.set(s.x, s.y, s.z);
  grp.userData = { mat, disc, blobs };
  return grp;
}

/** Flächentreffer an allen lokalen Pirschern im Radius (Druckwelle in der Wut). Rolle = i-Frames. */
function areaHit(m, ctx, at, r, dmg, key, knock = 'flinch') {
  for (const p of ctx.players) {
    if (!p.local || !p.alive || Math.hypot(p.pos.x - at.x, p.pos.z - at.z) > r + 0.4) continue;
    p.takeHit({ dmg: dmg * m.dmgMul, knock, key: `${key}|${p.id}`, sourcePos: at, attackId: 'krachfaust_druckwelle', monster: m });
  }
}

// ---------------------------------------------------------------- Angriffe
/** Aufprall einer Faust: Schleim am Faustpunkt (immer), Funken, Wackler; in der Wut zusätzlich Druckwelle r 3 (14 Schaden). */
const slam = (tau, lx, lz, { small = false, tag = '' } = {}) => (m, ctx, inst, age = 0) => {
  const p = atLocal(inst, tau, lx, lz);
  addSlime(m, p.x, p.z, { age, small });
  const at = { x: p.x, y: ctx.world.heightAt(p.x, p.z) + 0.3, z: p.z };
  ctx.fx.spark(at, 14, NEON, 6); ctx.fx.spark(at, 6, NEON_PEAK, 4);
  ctx.fx.shake?.(0.22, 0.18);
  ctx.bus.emit('sfx', { name: 'heavy', pos: at });
  if (wut(m)) { ctx.fx.ring?.(at, 0.6, 3, { color: NEON, life: 0.3 }); areaHit(m, ctx, p, 3, 14, `${inst.key}:w${tag}${tau}`); }
};
const fist = (side, t0, dmg, knock, extra = {}) => ({ t0, t1: t0 + 0.12, shape: 'sphere', at: [side === 'L' ? 0.9 : -0.9, 1.4, 3.6], radius: 1.5, dmg, knock, side, ...extra });

// ---- Schleimfaust (Lehrangriff): Ausfallschritt, rechte Faust. Treffer -> Schleim am Pirscher, Fehlschlag -> Pfütze am Faustpunkt
const schleimfaust = {
  id: 'krachfaust_schleimfaust', range: [0, 7], weight: 4, cooldown: 2.0, telegraph: 0.65, flashParts: ['prankeR'], duration: 2.0,
  cue: cue('klick', NEON_HI), audit: [2.5, 5], stam: 8,
  marker: ring(6.2), markerUntil: 0.8,
  hits: [fist('R', 0.8, 58, 'down', { slimeOnHit: true })],
  events: [{ t: 0.82, call: 'slam', all: true }],
  calls: { slam: slam(0.82, -0.9, 3.6) },
  motion(tau, a) {
    const f = 1.6 * smooth(clamp01((tau - 0.5) / 0.32));
    return { x: a.origin.x + a.dir.x * f, z: a.origin.z + a.dir.z * f };
  },
  pose: mTrack([
    [0, { ...Z }], [0.3, { legR: -55, bodyPitch: -6, bodyRoll: -6, wing: 0.15 }], [0.62, { legR: -75, bodyPitch: -12, bodyRoll: -10, head: -8, wing: 0.2 }],
    [0.8, { legR: 95, legL: -20, bodyPitch: 16, bodyRoll: 8, head: 10, wing: 0 }, 'lin'], [1.05, { legR: 55, legL: 0, bodyPitch: 8, bodyRoll: 2 }], [1.4, { legR: 20, bodyPitch: 3 }], [2.0, { ...Z }],
  ]),
};

// ---- Trommelwirbel: vier Schläge L/R/L/R, jeder lässt eine versetzte Pfütze liegen, der letzte klebt Schleim an den Pirscher
const TR = [0.85, 1.2, 1.55, 1.9];
const trommel = {
  id: 'krachfaust_trommel', range: [0, 7.5], weight: 3, cooldown: 3.5, telegraph: 0.7, flashParts: ['prankeL', 'prankeR'], duration: 3.0,
  cue: cue('droehn', NEON), audit: [2.5, 5], stam: 10,
  marker: ring(6.7), markerUntil: 0.85,
  hits: TR.map((t, i) => fist(i % 2 ? 'R' : 'L', t, 40, 'flinch', i === 3 ? { slimeOnHit: true } : {})),
  events: TR.map((t, i) => ({ t: t + 0.02, call: 'slam' + i, all: true })),
  calls: Object.fromEntries(TR.map((t, i) => ['slam' + i, slam(t + 0.02, (i % 2 ? -1 : 1) * 2.1, 3.6 + (i % 2 ? 0.8 : -0.6), { tag: i })])),
  motion(tau, a) {
    const f = 0.8 * clamp01((tau - 0.7) / 1.3);
    return { x: a.origin.x + a.dir.x * f, z: a.origin.z + a.dir.z * f };
  },
  pose: mTrack([
    [0, { ...Z }], [0.35, { legL: -60, legR: -60, bodyPitch: -10, wing: 0.3, bodyY: 0.1 }], [0.7, { legL: -80, legR: -60, bodyPitch: -14, wing: 0.2 }],
    [0.85, { legL: 90, legR: -50, bodyPitch: 10, bodyRoll: 6 }, 'lin'], [1.03, { legL: -50, legR: -80, bodyRoll: -2 }], [1.2, { legR: 90, legL: -50, bodyPitch: 10, bodyRoll: -6 }, 'lin'],
    [1.38, { legR: -50, legL: -80, bodyRoll: 2 }], [1.55, { legL: 90, legR: -50, bodyPitch: 10, bodyRoll: 6 }, 'lin'], [1.72, { legL: -50, legR: -80, bodyRoll: -2 }],
    [1.9, { legR: 95, legL: -40, bodyPitch: 14, bodyRoll: -8 }, 'lin'], [2.3, { legR: 40, legL: 10, bodyPitch: 4, bodyRoll: 0 }], [3.0, { ...Z }],
  ]),
};

// ---- Kopfstoß: 6 m Anlauf, Schädel voraus; hinterlässt drei kleine Pfützen auf der Strecke
const kopfstoss = {
  id: 'krachfaust_kopfstoss', range: [3, 11], weight: 3, cooldown: 5, telegraph: 0.7, flashParts: ['head'], duration: 2.2,
  cue: cue('knurr', NEON), audit: [4, 9], stam: 10,
  marker: ring(7.5), markerUntil: 0.9,
  hits: [{ t0: 0.9, t1: 1.22, shape: 'capsule', from: [0, 2.2, 0.8], to: [0, 2.0, 3.4], radius: 1.9, dmg: 66, knock: 'down' }],
  events: [0.95, 1.07, 1.19].map((t, i) => ({ t, call: 'trail' + i, all: true })),
  calls: Object.fromEntries([0.95, 1.07, 1.19].map((t, i) => ['trail' + i, (m, ctx, inst, age = 0) => {
    const p = atLocal(inst, t, 0, -0.5);
    addSlime(m, p.x, p.z, { age, small: true });
    ctx.fx.spark({ x: p.x, y: p.y + 0.4, z: p.z }, 8, NEON, 4);
  }])),
  motion(tau, a) {
    const f = 6 * smooth(clamp01((tau - 0.7) / 0.5));
    return { x: a.origin.x + a.dir.x * f, z: a.origin.z + a.dir.z * f };
  },
  pose: mTrack([
    [0, { ...Z }], [0.4, { bodyPitch: -8, head: -14, legL: -30, legR: -30, bodyY: -0.2 }], [0.7, { bodyPitch: -10, head: -18, legL: -50, legR: -50, bodyY: -0.3, neck: -0.2 }],
    [0.95, { bodyPitch: 24, head: 28, legL: 60, legR: 60, bodyY: -0.1, neck: 0.3 }, 'lin'], [1.3, { bodyPitch: 14, head: 14, legL: 40, legR: 40 }], [1.6, { bodyPitch: 6, head: 4, legL: 15, legR: 15 }], [2.2, { ...Z }],
  ]),
};

// ---- Sprungstampfer: Hocksprung bis 16 m auf das Ziel, Landung r 5,5; Ring aus 5 Pfützen r 6 um die Landestelle
const stampfer = {
  id: 'krachfaust_sprungstampfer', range: [4, 16], weight: 2, cooldown: 7, telegraph: 0.8, flashParts: ['legs'], duration: 2.5,
  cue: cue('brumm', NEON), audit: [5, 14], stam: 10,
  marker: { at: 'landing', radius: 5.8, color: NEON, peak: NEON_PEAK }, markerUntil: 1.5,
  prepare(a) {
    const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz) || 1;
    const len = Math.min(16, Math.max(4, d));
    a.landing = { x: a.origin.x + (dx / d) * len, z: a.origin.z + (dz / d) * len };
    a.jumpYaw = yawOf(dx, dz);
  },
  hits: [{ t0: 1.4, t1: 1.53, shape: 'sphere', at: [0, 0.6, 0], radius: 5.8, dmg: 74, knock: 'down' }],
  events: [{ t: 1.42, call: 'ring', all: true }],
  calls: {
    ring(m, ctx, inst, age = 0) {
      const L = inst.landing, a0 = inst.r(0) * 6.28;
      for (let i = 0; i < 5; i++) { const a = a0 + (i / 5) * 6.28; addSlime(m, L.x + Math.cos(a) * 6, L.z + Math.sin(a) * 6, { age }); }
      const at = { x: L.x, y: ctx.world.heightAt(L.x, L.z) + 0.4, z: L.z };
      ctx.fx.spark(at, 30, NEON, 9); ctx.fx.ring?.(at, 1, 6, { color: NEON, life: 0.4 }); ctx.fx.shake?.(0.5, 0.35);
      ctx.bus.emit('sfx', { name: 'heavy', pos: at });
      if (wut(m)) areaHit(m, ctx, L, 3, 14, `${inst.key}:w`);
    },
  },
  motion(tau, a) {
    const k = clamp01((tau - 0.8) / 0.6);
    return { x: a.origin.x + (a.landing.x - a.origin.x) * k, z: a.origin.z + (a.landing.z - a.origin.z) * k, yaw: a.jumpYaw, air: 4.2 * 4 * k * (1 - k) };
  },
  pose: mTrack([
    [0, { ...Z }], [0.4, { legL: -40, legR: -40, bodyY: -0.45, bodyPitch: 8 }], [0.8, { legL: -70, legR: -70, bodyY: -0.6, wing: 0.2 }],
    [1.0, { legL: -100, legR: -100, bodyY: 0.5, bodyPitch: -14, wing: 0.5 }], [1.4, { legL: 80, legR: 80, bodyY: -0.5, bodyPitch: 16, wing: 0 }, 'lin'],
    [1.7, { legL: 50, legR: 50, bodyY: -0.2, bodyPitch: 8 }], [2.5, { ...Z }],
  ]),
};

// ---- Schleimsalve: drei Schleimbälle im hohen Bogen, Aufschlag-Marker, Splash 1,4 m / 20 Schaden; jeder lässt eine Pfütze liegen
const salveCall = (m, ctx, inst, age = 0) => {
  const o = inst.origin, a = inst.yaw0;
  const from = { x: o.x + Math.sin(a) * 3.0, y: o.y + 4.6, z: o.z + Math.cos(a) * 3.0 };
  const dx = inst.target.x - from.x, dz = inst.target.z - from.z, dist = Math.hypot(dx, dz) || 1;
  const balls = wut(m) ? 5 : 3;
  for (let i = 0; i < balls; i++) {
    let tx, tz;
    if (i === 0) { tx = inst.target.x + (inst.r(0) - 0.5) * 1.4; tz = inst.target.z + (inst.r(6) - 0.5) * 1.4; }
    else {
      const ang = Math.atan2(dx, dz) + (i % 2 ? 1 : -1) * (0.18 + 0.12 * Math.ceil(i / 2) + inst.r(i) * 0.1);
      const d = Math.max(6, Math.min(26, dist * (0.85 + inst.r(i + 6) * 0.3)));
      tx = from.x + Math.sin(ang) * d; tz = from.z + Math.cos(ang) * d;
    }
    const to = { x: tx, y: ctx.world.heightAt(tx, tz), z: tz };
    const dur = 1.0 + dist * 0.03 + i * 0.12;
    m.projectiles.spawn({ ...slimeDef({ from, to, dur, arc: 7, dmg: 28, splash: 1.5, key: `${inst.key}:s${i}` }), attackId: inst.params.attackId }, age);
    addSlime(m, tx, tz, { delay: dur + 0.1, age, small: true });
  }
  ctx.bus.emit('sfx', { name: 'slimeSplat', pos: from });
  ctx.fx.spark(from, 16, NEON, 6);
};
const salve = {
  id: 'krachfaust_salve', range: [8, 26], weight: 3, cooldown: 7, telegraph: 0.8, flashParts: ['prankeL', 'prankeR'], duration: 2.4,
  cue: cue('zisch', NEON_HI), stam: 8,
  events: [{ t: 1.0, call: 'wurf', all: true }], calls: { wurf: salveCall }, hits: [],
  pose: mTrack([
    [0, { ...Z }], [0.4, { legL: -70, legR: -70, bodyPitch: -12, head: -10, wing: 0.2 }], [0.8, { legL: -100, legR: -100, bodyPitch: -20, bodyY: 0.2, head: -16, wing: 0.5 }],
    [1.0, { legL: 85, legR: 85, bodyPitch: 14, head: 14, wing: 0 }, 'lin'], [1.4, { legL: 40, legR: 40, bodyPitch: 6 }], [2.4, { ...Z }],
  ]),
};

// ---- Hammerkette: drei schnelle Faustschläge R/L/R, dann der Doppelhammer (beide Fäuste), der den Boden mit Schleim-Knallern pflastert
const HM = [0.8, 1.1, 1.4];
const hammer = {
  id: 'krachfaust_hammer', range: [0, 7.5], weight: 3, cooldown: 4, telegraph: 0.7, flashParts: ['prankeL', 'prankeR'], duration: 3.0,
  cue: cue('droehn', NEON), audit: [2.5, 5], stam: 12,
  marker: ring(7.2), markerUntil: 0.9,
  hits: [...HM.map((t, i) => fist(i % 2 ? 'L' : 'R', t, 36, 'flinch')), { t0: 2.0, t1: 2.14, shape: 'sphere', at: [0, 1.1, 4.2], radius: 3.0, dmg: 78, knock: 'down', slimeOnHit: true }],
  events: [...HM.map((t, i) => ({ t: t + 0.02, call: 'h' + i, all: true })), { t: 2.02, call: 'big', all: true }],
  calls: {
    ...Object.fromEntries(HM.map((t, i) => ['h' + i, slam(t + 0.02, (i % 2 ? -1 : 1) * 0.9, 3.6, { small: true, tag: 'h' + i })])),
    big(m, ctx, inst, age = 0) {
      const p = atLocal(inst, 2.02, 0, 4.2);
      for (let i = 0; i < 4; i++) { const a = inst.yaw0 + (i - 1.5) * 0.9; addSlime(m, p.x + Math.sin(a) * 3.4, p.z + Math.cos(a) * 3.4, { age, small: true }); }
      addSlime(m, p.x, p.z, { age });
      const at = { x: p.x, y: ctx.world.heightAt(p.x, p.z) + 0.3, z: p.z };
      ctx.fx.spark(at, 30, NEON, 9); ctx.fx.spark(at, 12, NEON_PEAK, 6); ctx.fx.ring?.(at, 0.8, 5, { color: NEON, life: 0.4 }); ctx.fx.shake?.(0.5, 0.35);
      ctx.bus.emit('sfx', { name: 'heavy', pos: at });
      if (wut(m)) areaHit(m, ctx, p, 4.5, 20, `${inst.key}:wbig`);
    },
  },
  motion(tau, a) {
    const f = 2.4 * clamp01((tau - 0.7) / 1.3);
    return { x: a.origin.x + a.dir.x * f, z: a.origin.z + a.dir.z * f };
  },
  pose: mTrack([
    [0, { ...Z }], [0.35, { legL: -40, legR: -70, bodyPitch: -8, wing: 0.2 }], [0.7, { legL: -50, legR: -85, bodyPitch: -12, wing: 0.2 }],
    [0.82, { legR: 95, legL: -40, bodyPitch: 12, bodyRoll: -6 }, 'lin'], [0.95, { legL: -85, legR: -40, bodyRoll: 2 }], [1.1, { legL: 95, legR: -40, bodyPitch: 12, bodyRoll: 6 }, 'lin'],
    [1.25, { legR: -85, legL: -40, bodyRoll: -2 }], [1.4, { legR: 95, legL: -40, bodyPitch: 12, bodyRoll: -6 }, 'lin'],
    [1.65, { legL: -110, legR: -110, wing: 0.5, bodyPitch: -22, bodyY: 0.35 }], [1.95, { legL: -120, legR: -120, wing: 0.6, bodyPitch: -26, bodyY: 0.45 }],
    [2.05, { legL: 110, legR: 110, wing: 0, bodyPitch: 22, bodyY: -0.4 }, 'lin'], [2.5, { legL: 60, legR: 60, bodyPitch: 12 }], [3.0, { ...Z }],
  ]),
};

// ---- Hornschlag: bäumt sich auf, das riesige Horn kracht senkrecht nach unten; Schleim links und rechts, in der Wut Druckwelle
const hornschlag = {
  id: 'krachfaust_hornschlag', range: [0, 8.5], weight: 3, cooldown: 4.5, telegraph: 0.85, flashParts: ['head'], duration: 2.4,
  cue: cue('knurr', NEON_HI), audit: [3, 7], stam: 12,
  marker: ring(8.5), markerUntil: 1.1,
  hits: [{ t0: 1.05, t1: 1.2, shape: 'capsule', from: [0, 3.2, 3.2], to: [0, 0.6, 6.4], radius: 2.2, dmg: 72, knock: 'down' }],
  events: [{ t: 1.07, call: 'bam', all: true }],
  calls: {
    bam(m, ctx, inst, age = 0) {
      const p = atLocal(inst, 1.07, 0, 6.0);
      addSlime(m, p.x, p.z, { age });
      for (const sx of [-1, 1]) { const q = atLocal(inst, 1.07, sx * 3.6, 5.0); addSlime(m, q.x, q.z, { age, small: true }); }
      const at = { x: p.x, y: ctx.world.heightAt(p.x, p.z) + 0.3, z: p.z };
      ctx.fx.spark(at, 28, NEON, 9); ctx.fx.spark(at, 10, NEON_PEAK, 5); ctx.fx.ring?.(at, 0.8, 5, { color: NEON, life: 0.4 }); ctx.fx.shake?.(0.5, 0.3);
      ctx.bus.emit('sfx', { name: 'heavy', pos: at });
      if (wut(m)) areaHit(m, ctx, p, 5, 22, `${inst.key}:wh`);
    },
  },
  motion(tau, a) {
    const f = 1.8 * smooth(clamp01((tau - 0.85) / 0.3));
    return { x: a.origin.x + a.dir.x * f, z: a.origin.z + a.dir.z * f };
  },
  pose: mTrack([
    [0, { ...Z }], [0.45, { bodyPitch: -14, neck: -0.35, head: -30, jaw: 20, bodyY: 0.2, legL: -20, legR: -20 }], [0.85, { bodyPitch: -22, neck: -0.5, head: -50, jaw: 30, bodyY: 0.4, legL: -40, legR: -40 }],
    [1.07, { bodyPitch: 24, neck: 0.5, head: 55, jaw: 0, bodyY: -0.2, legL: 30, legR: 30 }, 'lin'], [1.5, { bodyPitch: 14, head: 30, legL: 20, legR: 20 }], [2.4, { ...Z }],
  ]),
};

// ---- Schwanzwirbel: dreht sich einmal um die eigene Achse, der Stachelfächer fegt rundherum (auch nach hinten, wo man sich sicher fühlt)
const schwanz = {
  id: 'krachfaust_schwanzwirbel', range: [0, 12], weight: 2, cooldown: 6, telegraph: 0.8, flashParts: ['tail'], duration: 2.3,
  cue: cue('zisch', NEON), audit: [3, 9], stam: 12,
  marker: ring(12), markerUntil: 1.0,
  hits: [{ t0: 0.95, t1: 1.75, shape: 'capsule', from: [0, 1.4, -4.5], to: [0, 1.4, -11], radius: 2.0, dmg: 64, knock: 'down' }, { t0: 0.95, t1: 1.75, shape: 'sphere', at: [0, 1.5, -4], radius: 3.2, dmg: 40, knock: 'flinch' }],
  events: [{ t: 1.0, call: 'whoosh', all: true }, { t: 1.75, call: 'stop', all: true }],
  calls: {
    whoosh(m, ctx) { ctx.fx.ring?.({ x: m.pos.x, y: m.pos.y + 0.3, z: m.pos.z }, 3, 11, { color: NEON, life: 0.6 }); ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos }); ctx.fx.shake?.(0.25, 0.5); },
    stop(m, ctx) { ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 1, z: m.pos.z }, 12, NEON, 6); },
  },
  motion(tau, a) { return { x: a.origin.x, z: a.origin.z, yaw: a.yaw0 + Math.PI * 2 * smooth(clamp01((tau - 0.95) / 0.8)) }; },
  pose: mTrack([
    [0, { ...Z }], [0.5, { tailYaw: -70, bodyRoll: -6, bodyPitch: -6, legL: -30, legR: -30 }], [0.9, { tailYaw: -85, bodyRoll: -10, bodyPitch: -8, wing: 0.3 }],
    [1.35, { tailYaw: 55, bodyRoll: 8, wing: 0.2 }], [1.75, { tailYaw: 20, bodyRoll: 0, bodyPitch: 6 }], [2.3, { ...Z }],
  ]),
};

// ---- Sprung-Faustschlag: Sprung bis 14 m (hoch!), beide Fäuste voraus in den Boden, Schleim-Ring
const sprungfaust = {
  id: 'krachfaust_sprungfaust', range: [5, 16], weight: 3, cooldown: 6, telegraph: 0.75, flashParts: ['prankeL', 'prankeR', 'legs'], duration: 2.4,
  cue: cue('brumm', NEON_HI), audit: [6, 14], stam: 12,
  marker: { at: 'landing', radius: 5, color: NEON, peak: NEON_PEAK }, markerUntil: 1.5,
  prepare(a) {
    const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz) || 1;
    const len = Math.min(14, Math.max(4, d - 2.5));
    a.landing = { x: a.origin.x + (dx / d) * len, z: a.origin.z + (dz / d) * len };
    a.jumpYaw = yawOf(dx, dz);
  },
  hits: [{ t0: 1.35, t1: 1.5, shape: 'sphere', at: [0, 1.0, 3.0], radius: 3.6, dmg: 80, knock: 'down', slimeOnHit: true }],
  events: [{ t: 1.37, call: 'ring', all: true }],
  calls: {
    ring(m, ctx, inst, age = 0) {
      const L = inst.landing, a0 = inst.r(1) * 6.28;
      for (let i = 0; i < 4; i++) { const a = a0 + (i / 4) * 6.28; addSlime(m, L.x + Math.cos(a) * 4.5, L.z + Math.sin(a) * 4.5, { age, small: true }); }
      const at = { x: L.x, y: ctx.world.heightAt(L.x, L.z) + 0.4, z: L.z };
      ctx.fx.spark(at, 30, NEON, 9); ctx.fx.ring?.(at, 1, 6, { color: NEON, life: 0.4 }); ctx.fx.shake?.(0.5, 0.35);
      ctx.bus.emit('sfx', { name: 'heavy', pos: at });
      if (wut(m)) areaHit(m, ctx, L, 5, 22, `${inst.key}:w`);
    },
  },
  motion(tau, a) {
    const k = clamp01((tau - 0.75) / 0.6);
    return { x: a.origin.x + (a.landing.x - a.origin.x) * k, z: a.origin.z + (a.landing.z - a.origin.z) * k, yaw: a.jumpYaw, air: 5.0 * 4 * k * (1 - k) };
  },
  pose: mTrack([
    [0, { ...Z }], [0.4, { legL: -50, legR: -50, bodyY: -0.5, bodyPitch: 8 }], [0.75, { legL: -90, legR: -90, bodyY: -0.6, wing: 0.3 }],
    [1.0, { legL: -125, legR: -125, bodyY: 0.6, bodyPitch: -20, wing: 0.7 }], [1.35, { legL: 115, legR: 115, bodyY: -0.4, bodyPitch: 22, wing: 0 }, 'lin'],
    [1.7, { legL: 60, legR: 60, bodyY: -0.2, bodyPitch: 10 }], [2.4, { ...Z }],
  ]),
};

// ---- Runenwut (Phase-Special bei 40 %): Brüllen, Brust trommeln, die Runen springen auf Neongrün. Brüll-Kugel r 9 pinnt (Glitch-Konter möglich)
const runenwut = {
  id: 'krachfaust_runenwut', internal: true, range: [0, 99], weight: 0, cooldown: 30, telegraph: 1.0, flashParts: ['body', 'head'], duration: 2.6,
  cue: cue('droehn', NEON_PEAK), audit: [3, 7], stam: 10,
  marker: { at: 'self', radius: 9, color: NEON, peak: NEON_PEAK }, markerUntil: 1.3,
  hits: [{ t0: 1.2, t1: 1.3, shape: 'sphere', at: [0, 0.8, 0], radius: 9, dmg: 0, knock: 'pin' }],
  events: [{ t: 1.2, call: 'brull', all: true }],
  calls: {
    brull(m, ctx) {
      const c = m.nodes.head.getWorldPosition(new THREE.Vector3());
      ctx.fx.spark(c, 40, NEON, 9); ctx.fx.spark(c, 20, NEON_PEAK, 6); ctx.fx.ring?.({ x: m.pos.x, y: m.pos.y, z: m.pos.z }, 1, 9, { color: NEON, life: 0.5 });
      ctx.fx.shake?.(0.5, 0.5);
      ctx.hud?.center?.('RUNENWUT!', 2, true);
      ctx.bus.emit('sfx', { name: 'roar', pos: m.pos });
    },
  },
  pose: mTrack([
    [0, { ...Z }], [0.5, { wing: 0.4, bodyPitch: -14, head: -22, bodyY: 0.2, jaw: 20 }], [1.0, { wing: 1, bodyPitch: -18, head: -28, bodyY: 0.3, jaw: 40, legL: -40, legR: -40 }],
    [1.2, { wing: 0.4, bodyPitch: -20, head: -30, jaw: 50 }], [1.4, { wing: 1 }], [1.6, { wing: 0.4 }], [1.8, { wing: 1 }], [2.2, { wing: 0.5, bodyPitch: -6 }], [2.6, { ...Z }],
  ]),
};

// ---- URKNALL (Phase-Special bei 12 %, Rotglut auch bei 5 %): springt in die Dais-Mitte, lädt 5 s auf (Marker über die ganze Plattform, Banner, Licht, Ton, Wackeln),
// 1 s Stille, dann Detonation: r 52, 70 % der Max-LP für alle, die nicht hinter einer hohen Säule stehen (occlude). Säulen, die geschirmt haben, brechen.
const URK = 'krachfaust_urknall';
const urknall = {
  id: URK, internal: true, range: [0, 99], weight: 0, cooldown: 30, telegraph: 6.5, flashParts: ['prankeL', 'prankeR', 'head'], duration: 8.5,
  cue: cue('droehn', NEON_PEAK), stam: 0, noFace: true,
  marker: { at: 'landing', radius: KRACH.URK_R, color: NEON, peak: '#ff4a2a' }, markerUntil: 7.0,
  prepare(a) { a.landing = onTemple(a.origin.x, a.origin.z) ? { x: TEMPLE_C.x, z: TEMPLE_C.z } : { x: a.origin.x, z: a.origin.z }; },
  hits: [{ t0: KRACH.URK_BOOM, t1: KRACH.URK_END, shape: 'sphere', at: [0, 0.8, 0], radius: KRACH.URK_R, dmg: 0, dmgPct: KRACH.URK_PCT, knock: 'down', occlude: true, noPerfect: true }],
  events: [
    { t: 0.05, call: 'begin', all: true }, { t: 1.5, call: 'slam', all: true }, { t: KRACH.URK_BOOM, call: 'boom', all: true },
    { t: 6.9, call: 'cover', all: true }, { t: 7.15, call: 'rubble', all: true },
  ],
  calls: {
    begin(m, ctx) { startFinale(m); },
    slam(m, ctx) {
      ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 0.4, z: m.pos.z }, 40, NEON, 10); ctx.fx.ring?.({ x: m.pos.x, y: m.pos.y, z: m.pos.z }, 2, 14, { color: NEON, life: 0.5 });
      ctx.fx.shake?.(0.6, 0.5);
      ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos });
      ctx.hud?.center?.('HINTER DIE SÄULEN!', 4.5, true);
      ctx.hud?.banner?.('URKNALL!', 3);
    },
    boom(m, ctx) {
      const c = { x: m.pos.x, y: m.pos.y + 1.5, z: m.pos.z };
      ctx.bus.emit('sfx', { name: 'boom', pos: m.pos });
      ctx.fx.spark(c, 90, '#ffffff', 16); ctx.fx.spark(c, 60, NEON_PEAK, 12); ctx.fx.spark(c, 40, NEON, 9);
      ctx.fx.ring?.({ x: c.x, y: m.pos.y, z: c.z }, 4, KRACH.URK_R, { color: NEON_PEAK, life: 0.7 });
      ctx.fx.shake?.(1.0, 0.6);
      const me = ctx.players.find((p) => p.local && p.alive);
      const covered = me && ctx.world.coverBetween?.(m.pos, me.pos);
      if (covered) ctx.fx.flash?.('rgba(255,255,255,.55)', 0.35); else ctx.fx.whiteout?.(0.5, { staticTail: 0.15 }); // Gedeckte sehen nur einen kurzen Blitz
      if (!ctx.net) time.slowmo(0.4, 0.3);
      m.extra.urkRun = false; m.extra.urkN++;
      ctx.world.pulse?.(1.6);
    },
    cover(m, ctx) { // welche Säulen schirmen gerade jemanden ab? (jeder Client mit denselben Spielerpositionen)
      const w = ctx.world, set = new Set();
      for (const p of ctx.players) { if (!p.alive) continue; const cv = w.coverBetween?.(m.pos, p.pos); if (cv) set.add(cv.id); }
      m.extra.coverIds = [...set];
    },
    rubble(m, ctx) {
      const w = ctx.world;
      let n = 0;
      for (const id of m.extra.coverIds ?? []) {
        const p = w.temple?.pillars.find((q) => q.id === id);
        if (!p || !w.breakPillar(p)) continue;
        n++;
        const at = { x: p.x, y: w.heightAt(p.x, p.z) + 3, z: p.z };
        ctx.fx.spark(at, 40, '#c8c0a8', 8); ctx.fx.spark(at, 16, NEON, 6); ctx.fx.shake?.(0.4, 0.3);
        ctx.fx.clearMarker?.(`${m.id}:pil${p.id}`);
      }
      m.extra.coverIds = [];
      if (n) { ctx.hud?.center?.(n > 1 ? 'SÄULEN ZERBRÖCKELT!' : 'SÄULE ZERBRÖCKELT!', 2, true); ctx.bus.emit('sfx', { name: 'break', pos: m.pos }); }
      ctx.world.pulse?.(1);
    },
  },
  motion(tau, a) {
    const k = smooth(clamp01((tau - 0.2) / 1.2));
    return { x: a.origin.x + (a.landing.x - a.origin.x) * k, z: a.origin.z + (a.landing.z - a.origin.z) * k, air: 3.2 * 4 * Math.min(1, clamp01((tau - 0.2) / 1.2)) * (1 - clamp01((tau - 0.2) / 1.2)) };
  },
  pose: mTrack([
    [0, { ...Z }], [0.5, { legL: -60, legR: -60, bodyY: -0.4, bodyPitch: 8 }], [1.0, { legL: -100, legR: -100, bodyY: 0.5, bodyPitch: -14, wing: 0.4 }],
    [1.5, { legL: 95, legR: 95, bodyY: -0.4, bodyPitch: 18, head: 18, wing: 0 }, 'lin'], [2.0, { legL: 30, legR: 30, bodyY: -0.45, bodyPitch: 16, head: 12 }],
    [2.6, { legL: -50, legR: -50, bodyY: -0.2, bodyPitch: -8, head: -14, wing: 0.3 }], [4.5, { legL: -85, legR: -85, bodyY: 0.1, bodyPitch: -16, head: -22, wing: 0.6, jaw: 12 }],
    [6.0, { legL: -110, legR: -110, bodyY: 0.35, bodyPitch: -22, head: -30, wing: 0.9, jaw: 30 }], [6.45, { legL: -120, legR: -120, bodyY: 0.45, bodyPitch: -26, head: -34, wing: 1, jaw: 45 }],
    [6.7, { legL: 90, legR: 90, bodyY: -0.5, bodyPitch: 22, head: 20, wing: 0, jaw: 5 }, 'lin'], [7.3, { legL: 60, legR: 60, bodyY: -0.7, bodyPitch: 26, head: 24 }], [8.5, { legL: 25, legR: 25, bodyY: -0.5, bodyPitch: 20, head: 16 }],
  ]),
};

// ---------------------------------------------------------------- Finale: Aufladen (läuft bei allen Clients aus dem Angriffsablauf, deterministisch)
function pillarsOf(m) { return m.ctx.world?.temple?.pillars ?? []; }
function startFinale(m) {
  const e = m.extra;
  if (e.finaleOn) return;
  e.finaleOn = true; e.urkRun = true; e.fPh = 0; e.fBeat = -1;
  e.stunTh = m.stunThreshold; m.stunThreshold = 1e12; // Aufladen ist nicht zu unterbrechen: kein Betäuben, kein Zucken (Teilbruch stört trotzdem -> er lädt neu auf)
  m._flLast = m.time + 60;
}
function endFinale(m) {
  const e = m.extra, ctx = m.ctx;
  e.finaleOn = false;
  if (e.stunTh !== undefined) { m.stunThreshold = e.stunTh; e.stunTh = undefined; }
  m._flLast = m.time - 8;
  ctx.world?.pulse?.(1);
  for (const p of pillarsOf(m)) ctx.fx.clearMarker?.(`${m.id}:pil${p.id}`);
  ctx.fx.clearMarker?.(m.id);
}

/** Pro Frame im Finale: Takt beschleunigt 1 -> 4 Hz, Licht pulst, Wackeln 0,1 -> 0,5, Säulen-Ringe (gelb, grün wenn der lokale Pirscher gedeckt ist), letzte Sekunde Stille. */
function finaleVisuals(m, dt, tau) {
  const e = m.extra, ctx = m.ctx, fx = ctx.fx, w = ctx.world;
  const [c0, c1] = KRACH.URK_CHARGE;
  const k = clamp01((tau - c0) / (c1 - c0));
  const charging = tau >= c0 && tau < c1, silent = tau >= KRACH.URK_SILENCE && tau < c1;
  // Säulen markieren (Schutz!)
  if (tau < KRACH.URK_END && w?.temple) {
    const me = ctx.players.find((p) => p.local && p.alive), cov = me ? w.coverBetween?.(m.pos, me.pos) : null;
    for (const p of w.temple.pillars) {
      if (p.broken) continue;
      fx.marker?.(`${m.id}:pil${p.id}`, { x: p.x, y: w.heightAt(p.x, p.z), z: p.z }, 2.8, cov === p ? NEON : '#ffe14d', false);
    }
  }
  if (!charging) { if (tau >= c1) w?.pulse?.(Math.max(1, 1.6 - (tau - c1) * 1.5)); return; }
  if (silent) { w?.pulse?.(0.35); fx.shake?.(0.05, 0.1); return; } // die Stille vor dem Knall
  e.fPh += dt * (1 + 3 * k); // Takt 1 -> 4 Hz
  const beat = Math.floor(e.fPh);
  w?.pulse?.(1 + 0.45 * Math.sin(e.fPh * 6.283));
  fx.shake?.(0.1 + 0.4 * k, 0.12);
  if (beat !== e.fBeat) {
    e.fBeat = beat;
    ctx.bus.emit('sfx', { name: 'krachCharge', pos: m.pos, k });
    for (const s of e.slimes) fx.spark({ x: s.x, y: s.y + 0.4, z: s.z }, 3, NEON, 3);
    const c = { x: m.pos.x + (Math.random() - 0.5) * 6, y: m.pos.y + 0.5, z: m.pos.z + (Math.random() - 0.5) * 6 };
    fx.spark(c, 6 + Math.floor(10 * k), Math.random() < 0.5 ? NEON : NEON_PEAK, 5 + 5 * k);
    if (tau >= 4.5) fx.flash?.('rgba(57,255,20,.12)', 0.12); // letzte Sekunde vor der Stille: Bildrand blitzt im Takt
  }
}

// ---------------------------------------------------------------- Visuals / Brain / Definition
function slimeStage(m) { // Puls-Stufe der Fäuste/des Kopfes: Ruhe dunkelgrün, vor einem Schlag schneller, im Finale nach Aufladung
  const a = m.attack;
  if (!a) return { stage: 0, left: 9 };
  if (a.id === URK) {
    const tau = a.inst.sample(a.t).tau;
    const left = tau >= KRACH.URK_CHARGE[0] ? Math.max(0, KRACH.URK_BOOM - tau) : 6;
    return { stage: tau < 1.5 ? 1 : left > 3 ? 1 : 2, left: left > 3 ? 1.2 : 0.2 };
  }
  const left = a.inst.firstHitTime() - a.t;
  return { stage: left > 1.0 ? 0 : left > 0.4 ? 1 : left > 0 ? 2 : 0, left };
}

function visuals(m, dt) {
  const e = m.extra, ctx = m.ctx, t = m.time, world = ctx.world;
  // ---- Schleimhaut von Fäusten und Horn: massiv gelbgrün, vor dem Zünden pulsiert nur die Tönung (kein Leuchthof); Fäuste blasen auf und blinken im Takt
  const { stage, left } = slimeStage(m);
  const hz = STAGE_HZ[stage], ph = Math.floor(t * hz * 2) % 2;
  const tint = TINT[stage][ph];
  const bL = m.partById.prankeL.broken, bR = m.partById.prankeR.broken, bH = m.partById.head.broken;
  e.fistMats.prankeL.color.setRGB(...(bL ? TINT_BROKEN : tint)); e.fistMats.prankeR.color.setRGB(...(bR ? TINT_BROKEN : tint)); e.headMat.color.setRGB(...(bH ? TINT_BROKEN : tint));
  const infl = stage === 0 ? 0 : stage === 1 ? 0.2 : 0.35;
  e.inflate = (e.inflate ?? 0) + (infl * (0.75 + 0.25 * ph) - (e.inflate ?? 0)) * Math.min(1, dt * 12);
  const sL = bL ? 0.78 : 1 + e.inflate, sR = bR ? 0.78 : 1 + e.inflate;
  m.nodes.fistL.scale.setScalar(sL); m.nodes.fistR.scale.setScalar(sR);
  // ---- Rücken-Runen und Tempelrunen: Runenwut = Hacker-Neongrün
  const w = wut(m) && m.alive;
  e.runeMat.color.set(w ? (ph ? NEON_PEAK : NEON) : '#124a0c');
  if (w !== e.wutVis || w) {
    e.wutVis = w;
    world?.setRuneGlow?.(w ? KRACH.RUNE_TINT : null, w ? 0.9 + 0.45 * Math.abs(Math.sin(t * 3)) : 1);
  }
  // ---- Finale
  const urk = m.attack?.id === URK && m.alive ? m.attack : null;
  if (urk) { if (!e.finaleOn) startFinale(m); finaleVisuals(m, dt, urk.inst.sample(urk.t).tau); } else if (e.finaleOn) endFinale(m);
  // ---- Boden-Schleim: Pulse, Absorbieren (lokal), Explosion
  const list = e.slimes;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i], age = t - s.start, lf = s.fuse - age;
    if (!m.alive) { dropSlime(m, s); list.splice(i, 1); continue; }
    if (age < 0) continue;
    if (!s.mesh && ctx.scene) { s.mesh = makeSlimeMesh(s); ctx.scene.add(s.mesh); }
    const st = stageOf(lf), shz = STAGE_HZ[st], sph = Math.floor(lf * shz * 2) % 2;
    if (s.mesh) {
      const u = s.mesh.userData;
      u.mat.color.set(STAGE_COL[st][sph]);
      u.disc.scale.setScalar(s.r * (1 + 0.12 * (st + 1) * sph) * Math.min(1, age / 0.25 + 0.2));
      u.blobs.forEach((b, k) => { b.position.y = 0.3 + 0.12 * (1 + st) * (sph ? 1 : 0.4) + 0.05 * Math.sin(t * 6 + k); });
    }
    if (st >= 1) ctx.fx.marker?.(s.key, { x: s.x, y: s.y, z: s.z }, s.blastR, STAGE_COL[st][sph], false); // Sprengradius zeigen, wenn es ernst wird
    const tick = Math.floor(lf * shz);
    if (tick !== s.tick) { s.tick = tick; ctx.bus.emit('sfx', { name: 'slimePulse', pos: s, pitch: STAGE_PITCH[st] }); }
    // hineinlaufen: Pfütze wird absorbiert, der Pirscher bekommt Schleim (statt Explosion am Boden)
    if (age >= 0.15 && lf > 0.2) {
      let eaten = false;
      for (const p of ctx.players) {
        if (!p.local || !p.alive || p.status?.schleim || p.state === 'roll' || Math.hypot(p.pos.x - s.x, p.pos.z - s.z) > KRACH.ABSORB_R) continue;
        p.addStatus?.('schleim', { t: Math.max(0.6, Math.min(playerFuse(m), lf)) });
        ctx.fx.spark({ x: s.x, y: s.y + 0.6, z: s.z }, 14, NEON, 5);
        eaten = true; break;
      }
      if (eaten) { dropSlime(m, s); list.splice(i, 1); continue; }
    }
    if (lf <= 0) {
      slimeBlast(ctx, { x: s.x, y: s.y, z: s.z }, { r: s.blastR, dmg: s.dmg, monster: m });
      dropSlime(m, s); list.splice(i, 1);
    }
  }
}

function brain(m, dt) {
  if (m.extra.urkRun && !m.alive) m.extra.urkRun = false;
}

const maskOf = (m) => pillarsOf(m).reduce((s, p) => s | (p.broken ? 1 << p.id : 0), 0);

export const krachfaust = {
  id: 'krachfaust',
  name: 'Krachfaust, der Tempelbrecher',
  hp: 20000,
  scale: SC,
  bodyRadius: 2.6,
  predator: true,
  apex: true, // Revier-Apex: greift alles an, was den Tempel betritt (hunt.js -> Revier { apex })
  walk: 3.3, run: 8.2, turn: 0.95, detect: 36, prefer: 5.5,
  parts: [
    { id: 'head', label: 'Kopf', factor: 1.0, breakHp: 1300, jitter: 0.07, elem: { fire: 12, shock: 20 }, blunt: true, stunPart: true,
      spheres: [{ node: 'head', offset: [0, 0.0, 0.5], r: 0.75 }, { node: 'head', offset: [0, -0.1, 1.8], r: 0.8 }] },
    { id: 'prankeL', label: 'Linke Schleimfaust', factor: 0.8, breakHp: 900, jitter: 0.06, elem: { fire: 10, shock: 30 },
      spheres: [{ node: 'fistL', offset: [0, -1.2, 0.2], r: 1.0 }] },
    { id: 'prankeR', label: 'Rechte Schleimfaust', factor: 0.8, breakHp: 900, jitter: 0.06, elem: { fire: 10, shock: 30 },
      spheres: [{ node: 'fistR', offset: [0, -1.2, 0.2], r: 1.0 }] },
    { id: 'body', label: 'Körper', factor: 0.6, elem: { fire: 10, shock: 15 },
      spheres: [{ node: 'body', offset: [0, 0.6, 0.5], r: 1.3 }, { node: 'body', offset: [0, 1.2, 0.9], r: 1.0 }, { node: 'body', offset: [0, 0.1, -1.2], r: 1.0 }, { node: 'neck', offset: [0, 0, 0.5], r: 0.7 }] },
    { id: 'tail', label: 'Schwanz', factor: 0.7, elem: { fire: 10, shock: 15 },
      spheres: [{ node: 'tail1', offset: [0, 0, -1.0], r: 0.8 }, { node: 'tail2', offset: [0, 0, -1.0], r: 0.7 }, { node: 'tail3', offset: [0, 0, -1.0], r: 0.6 }] },
    { id: 'legs', label: 'Beine', factor: 0.8, elem: { fire: 10, shock: 20 },
      spheres: [{ node: 'legL', offset: [0, -0.9, 0.0], r: 0.9 }, { node: 'legR', offset: [0, -0.9, 0.0], r: 0.9 }] },
  ],
  attacks: {
    krachfaust_schleimfaust: schleimfaust, krachfaust_trommel: trommel, krachfaust_kopfstoss: kopfstoss, krachfaust_sprungstampfer: stampfer, krachfaust_salve: salve, krachfaust_hammer: hammer, krachfaust_hornschlag: hornschlag, krachfaust_schwanzwirbel: schwanz, krachfaust_sprungfaust: sprungfaust,
    krachfaust_runenwut: runenwut, [URK]: urknall,
  },
  teachAttack: 'krachfaust_schleimfaust',
  recoverAfter: (m) => (wut(m) ? m.rng() * 0.12 : 0.05 + m.rng() * 0.2) / m.speedMul, // kaum Verschnaufpause, in der Wut fast keine
  speedFactor: (m) => (wut(m) ? 1.3 : 1.08), // Runenwut: Lauftempo 1,3
  attackTempo: (m) => (wut(m) ? 1.35 : 1.1), // Angriffe: Grundtempo 1,1; Runenwut: Telegraph kürzer und der Ablauf 1,35x flotter (Telegraph nie unter 0,5 s)
  stamina: true,
  flinchDmg: 1500,
  phases: [
    { at: 0.4, name: 'RUNENWUT', cue: cue('droehn', NEON_PEAK), special: 'krachfaust_runenwut' },
    { at: 0.12, name: 'ZERFALL', cue: cue('droehn', '#ffe14d'), special: URK },
    { at: 0.05, name: 'ZERFALL II', cue: cue('droehn', '#ffe14d'), special: URK, enter(m) { if (!m.mm?.rageAlways) m.phaseSpecial = null; } }, // zweiter Urknall nur in Rotglut
  ],
  chains: {
    krachfaust_schleimfaust: [{ atk: 'krachfaust_hammer', w: 4 }, { atk: 'krachfaust_trommel', w: 3 }, { atk: 'krachfaust_hornschlag', w: 3 }, { atk: 'krachfaust_kopfstoss', w: 2 }, { atk: null, w: 1 }],
    krachfaust_trommel: [{ atk: 'krachfaust_schleimfaust', w: 3 }, { atk: 'krachfaust_hornschlag', w: 3 }, { atk: 'krachfaust_schwanzwirbel', w: 3 }, { atk: 'krachfaust_salve', w: 1 }],
    krachfaust_hammer: [{ atk: 'krachfaust_schwanzwirbel', w: 4 }, { atk: 'krachfaust_hornschlag', w: 3 }, { atk: 'krachfaust_schleimfaust', w: 2 }, { atk: null, w: 1 }],
    krachfaust_hornschlag: [{ atk: 'krachfaust_schwanzwirbel', w: 3 }, { atk: 'krachfaust_hammer', w: 3 }, { atk: 'krachfaust_schleimfaust', w: 3 }],
    krachfaust_schwanzwirbel: [{ atk: 'krachfaust_schleimfaust', w: 3 }, { atk: 'krachfaust_kopfstoss', w: 3 }, { atk: 'krachfaust_hammer', w: 2 }, { atk: null, w: 1 }],
    krachfaust_kopfstoss: [{ atk: 'krachfaust_schleimfaust', w: 3 }, { atk: 'krachfaust_sprungfaust', w: 3 }, { atk: 'krachfaust_trommel', w: 2 }],
    krachfaust_sprungfaust: [{ atk: 'krachfaust_schleimfaust', w: 4 }, { atk: 'krachfaust_hornschlag', w: 3 }, { atk: 'krachfaust_hammer', w: 2 }],
    krachfaust_sprungstampfer: [{ atk: 'krachfaust_schleimfaust', w: 3 }, { atk: 'krachfaust_sprungfaust', w: 3 }, { atk: 'krachfaust_schwanzwirbel', w: 2 }],
    krachfaust_salve: [{ atk: 'krachfaust_kopfstoss', w: 3 }, { atk: 'krachfaust_trommel', w: 3 }, { atk: 'krachfaust_sprungfaust', w: 3 }],
  },
  build: () => buildKrachfaust({ scale: SC }),
  init(m) {
    Object.assign(m.extra, { slimes: [], popSeq: 0, popX: 0, popZ: 0, urkRun: false, urkN: 0, fPh: 0, fBeat: -1, finaleOn: false, wutVis: false, coverIds: [], inflate: 0, tailT: 0 });
  },
  // Urknall unterbrochen (Teilbruch ...), bevor er gezündet hat: sofort neu aufladen (vor jeder anderen Wahl der Kampf-KI)
  combat(m) {
    if (m.extra.urkRun && !m.attack && m.alive && !m.queued) { m.queued = URK; m.chainNext = null; m.recover = Math.min(m.recover, 0.2); }
    return false;
  },
  tick(m, dt) {
    visuals(m, dt);
    if (m.authority && m.alive) brain(m, dt);
  },
  // Treffer auf den Pirscher: Schleimfaust/Trommel-Schluss kleben Schleim an (außer die Faust dieser Seite ist gebrochen)
  onHitPlayer(m, p, h) {
    const hit = h.hit;
    if (!hit?.slimeOnHit) return;
    if (hit.side && m.partById['pranke' + hit.side]?.broken) return;
    p.addStatus?.('schleim', { t: playerFuse(m) });
  },
  onDamage(m, res) {
    // Schock fährt durch den Schleim: Pfützen in 4 m um die Faust platzen sofort und harmlos (Spaß-Konter statt Bug); Gäste ziehen über snapExtra nach
    if (res.elemBy?.shock > 0 && (res.partId === 'prankeL' || res.partId === 'prankeR') && m.authority) {
      const f = m.nodes[res.partId === 'prankeL' ? 'fistL' : 'fistR'].getWorldPosition(new THREE.Vector3());
      const e = m.extra;
      if (e.slimes.some((s) => Math.hypot(s.x - f.x, s.z - f.z) <= 4)) {
        e.popSeq++; e.popX = f.x; e.popZ = f.z;
        popSlimes(m, f, 4);
        m.ctx.fx.number({ x: f.x, y: f.y + 1.4, z: f.z }, 'KURZSCHLUSS!', 'mon');
      }
    }
  },
  onBreak(m, part) {
    const p = m.nodes[part.id === 'head' ? 'head' : part.id === 'prankeL' ? 'fistL' : part.id === 'prankeR' ? 'fistR' : 'body'].getWorldPosition(new THREE.Vector3());
    if (part.id === 'head' || part.id === 'prankeL' || part.id === 'prankeR') {
      m.ctx.fx.spark(p, 26, NEON, 7); m.ctx.fx.spark(p, 12, '#ffffff', 5);
      m.ctx.fx.number({ x: p.x, y: p.y + 1.4, z: p.z }, part.id === 'head' ? 'SCHLEIMHELM WEG!' : 'FAUST PLATZT!', 'mon');
    }
    if (part.id === 'head' && m.authority && m.extra.finaleOn !== true) { // Kopfbruch: 3 s benommen (nicht mitten im Aufladen)
      m.stunT = Math.max(m.stunT, KRACH.STUN_HEAD);
      m.ctx.bus.emit('monsterStun', { monster: m, reason: 'break' });
    }
  },
  // Nach dem Knall ist er erschöpft: 6 s Finish-Fenster (Atemwolken, halbes Tempo)
  onAttackEnd(m, id) {
    if (id !== URK || !m.authority || !m.alive) return;
    m.tired = true; m.tiredT = 6; m.stamina = 0; m.queued = null;
    m.ctx.bus.emit('monsterTired', { monster: m, on: true });
  },
  snapExtra: (m) => {
    const e = m.extra, o = { u: e.urkN, w: maskOf(m) };
    if (e.popSeq) { o.po = e.popSeq; o.px = Math.round(e.popX); o.pz = Math.round(e.popZ); }
    return o;
  },
  applySnapExtra(m, ex) {
    const e = m.extra;
    e.urkN = ex.u ?? e.urkN;
    for (const p of pillarsOf(m)) if ((ex.w ?? 0) & (1 << p.id) && !p.broken) m.ctx.world.breakPillar?.(p); // verbrauchte Säulen bei Nachzüglern
    if ((ex.po ?? 0) > e.popSeq) { e.popSeq = ex.po; popSlimes(m, { x: ex.px, z: ex.pz }, 5); }
  },
  // Perfekt ausgewichen (Glitch-Konter auf das Brüllen): er verschluckt sich an der eigenen Wut und taumelt
  onGlitchCounter(m, attackId) {
    if (attackId !== 'krachfaust_runenwut') return;
    m._interrupt(); m.queued = null; m.chainNext = null;
    m.stunT = Math.max(m.stunT, 1.8);
    m.recover = Math.max(m.recover, 0.6);
    const p = m.nodes.head.getWorldPosition(new THREE.Vector3());
    m.ctx.fx.spark(p, 26, NEON, 6); m.ctx.fx.spark(p, 12, NEON_PEAK, 4);
    m.ctx.fx.number({ x: p.x, y: p.y + 1.6, z: p.z }, 'VERSCHLUCKT!', 'mon');
    m.ctx.bus.emit('monsterStun', { monster: m, reason: 'glitch' });
  },
  poseHook(m, p) {
    if (m.extra.finaleOn && m.attack?.id === URK) { // Zittern beim Aufladen
      const tau = m.attack.inst.sample(m.attack.t).tau;
      if (tau > 2.6 && tau < KRACH.URK_BOOM) { const k = clamp01((tau - 2.6) / 3.9); p.bodyRoll += Math.sin(m.time * 55) * (1 + 3 * k); p.bodyY += Math.sin(m.time * 70) * 0.03 * k; }
    }
    if (!m.attack && wut(m)) { p.wing = Math.max(p.wing, 0.1 + 0.1 * Math.sin(m.time * 3)); p.bodyY += Math.sin(m.time * 5) * 0.03; }
  },
  onRage(m, on) { m.extra.eyeMat?.color.set(on ? '#ff3020' : '#ffe14d'); },
};
