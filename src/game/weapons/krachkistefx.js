import * as THREE from 'three';
import { SAMPLE_HEX } from '../buffs.js';

// Krachkiste-Effekte (GDD 17.1), alles gepoolt und klein (PS1-Look):
//  - Boden-Ring in Leisten-Farben (Sektoren), laeuft beim Abspielen bis 8 m aus
//  - kleines farbiges Symbol ▲■● fliegt vom Treffpunkt zum Pirscher (Sample-Feedback)
//  - Equalizer-Balken um den Pirscher (Glitch "Feedback-Schleife"), 1 InstancedMesh
// Eine Instanz pro Jagd: hunt.kkfx (angelegt beim ersten Aufruf von ensureKkFx, hunt.update/dispose rufen update/dispose).

const PI = Math.PI;
const RING_POOL = 3, SYM_POOL = 8;
const RING_LIFE = 0.85, SYM_LIFE = 0.42;

function symbolTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = SAMPLE_HEX[color]; g.strokeStyle = '#101018'; g.lineWidth = 2;
  g.beginPath();
  if (color === 'r') { g.moveTo(8, 1.5); g.lineTo(14.5, 13.5); g.lineTo(1.5, 13.5); } else if (color === 'b') g.rect(2.5, 2.5, 11, 11); else g.arc(8, 8, 6, 0, PI * 2);
  g.closePath(); g.fill(); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Ring-Geometrie (inneres Verhaeltnis 0,9 .. 1) mit Vertexfarben; Farben pro Sektor per setColors() */
function ringMesh() {
  const geo = new THREE.RingGeometry(0.9, 1, 48, 1);
  geo.rotateX(-PI / 2);
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false; mesh.renderOrder = 2; mesh.frustumCulled = false;
  return mesh;
}
const _c = new THREE.Color();
function setRingColors(mesh, cols) {
  const pos = mesh.geometry.attributes.position, col = mesh.geometry.attributes.color, n = Math.max(1, cols.length);
  for (let i = 0; i < pos.count; i++) {
    const a = (Math.atan2(pos.getZ(i), pos.getX(i)) + PI * 2) % (PI * 2);
    _c.set(SAMPLE_HEX[cols[Math.min(n - 1, Math.floor((a / (PI * 2)) * n))]] ?? '#ffffff');
    col.setXYZ(i, _c.r, _c.g, _c.b);
  }
  col.needsUpdate = true;
}

export function createKkFx(scene) {
  const rings = [];
  for (let i = 0; i < RING_POOL; i++) { const m = ringMesh(); scene.add(m); rings.push({ mesh: m, age: 99, r1: 8 }); }
  let ringHead = 0;
  const texs = { r: symbolTexture('r'), b: symbolTexture('b'), g: symbolTexture('g') };
  const syms = [];
  for (let i = 0; i < SYM_POOL; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texs.r, transparent: true, depthTest: false, fog: false }));
    sp.visible = false; sp.renderOrder = 30;
    scene.add(sp);
    syms.push({ sp, age: 99, from: new THREE.Vector3(), target: null, c: 'r' });
  }
  let symHead = 0;

  return {
    /** Boden-Ring in den Farben der Leiste (cols: ['r','b','g'] ...), waechst bis maxR */
    ring(pos, cols, maxR = 8) {
      const r = rings[ringHead]; ringHead = (ringHead + 1) % rings.length;
      setRingColors(r.mesh, cols.length ? cols : ['r']);
      r.mesh.position.set(pos.x, (pos.y ?? 0) + 0.14, pos.z);
      r.age = 0; r.r1 = maxR; r.mesh.visible = true;
    },
    /** Symbol fliegt von `from` (Treffpunkt) zum Pirscher `p` (Brust) */
    symbol(from, p, color) {
      const s = syms[symHead]; symHead = (symHead + 1) % syms.length;
      s.sp.material.map = texs[color] ?? texs.r; s.sp.material.needsUpdate = true;
      s.from.set(from.x, from.y, from.z); s.target = p; s.c = color; s.age = 0; s.sp.visible = true;
      s.sp.position.copy(s.from); s.sp.scale.set(0.34, 0.34, 1);
    },
    update(dt) {
      for (const r of rings) {
        if (r.age > RING_LIFE) continue;
        r.age += dt;
        if (r.age > RING_LIFE) { r.mesh.visible = false; continue; }
        const k = r.age / RING_LIFE;
        r.mesh.scale.setScalar(0.6 + (r.r1 - 0.6) * (1 - (1 - k) * (1 - k)));
        r.mesh.material.opacity = 0.85 * (1 - k * k);
      }
      for (const s of syms) {
        if (s.age > SYM_LIFE) continue;
        s.age += dt;
        if (s.age > SYM_LIFE) { s.sp.visible = false; continue; }
        const k = s.age / SYM_LIFE, e = k * k * (3 - 2 * k), t = s.target;
        const tx = t?.pos ? t.pos.x : s.from.x, ty = t?.pos ? t.pos.y + 1.3 : s.from.y, tz = t?.pos ? t.pos.z : s.from.z;
        s.sp.position.set(s.from.x + (tx - s.from.x) * e, s.from.y + (ty - s.from.y) * e + Math.sin(k * PI) * 0.55, s.from.z + (tz - s.from.z) * e);
        const sc = 0.34 - 0.16 * k;
        s.sp.scale.set(sc, sc, 1);
      }
    },
    dispose() {
      for (const r of rings) { scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); }
      for (const s of syms) { scene.remove(s.sp); s.sp.material.dispose(); }
      for (const k in texs) texs[k].dispose();
    },
  };
}

/** Pro Jagd genau eine Instanz (am Kontext = Hunt); ohne Szene (Tests) -> null */
export function ensureKkFx(ctx) {
  if (!ctx?.scene?.add) return null;
  return (ctx.kkfx ??= createKkFx(ctx.scene));
}

// ---------------------------------------------------------------- Equalizer (Glitch "Feedback-Schleife")
const EQ_N = 14;
/** Balkenkranz um den Pirscher; haengt am Pirscher-Mesh. update(time) animiert die Hoehen. */
export function createEqualizer(parent) {
  const geo = new THREE.BoxGeometry(0.09, 1, 0.09);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false });
  const mesh = new THREE.InstancedMesh(geo, mat, EQ_N);
  mesh.frustumCulled = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < EQ_N; i++) mesh.setColorAt(i, _c.set(i % 2 ? '#5ad8ff' : '#ff3df0'));
  mesh.visible = false;
  parent.add(mesh);
  return {
    mesh,
    setVisible(v) { mesh.visible = v; },
    update(t) {
      if (!mesh.visible) return;
      for (let i = 0; i < EQ_N; i++) {
        const a = (i / EQ_N) * PI * 2;
        const h = 0.25 + 1.05 * Math.abs(Math.sin(t * 7 + i * 1.9) * Math.cos(t * 3.1 + i * 0.7));
        pv.set(Math.cos(a) * 1.05, 0.05, Math.sin(a) * 1.05);
        q.setFromAxisAngle(up, -a);
        m4.compose(pv, q, s.set(1, h, 1));
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { parent.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}
