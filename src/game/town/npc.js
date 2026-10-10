import * as THREE from 'three';
import { Parts, vcLit } from '../../render/vcolor.js';

/** Pixel label sprite (name tags above NPCs / stations). */
export function labelSprite(text, { color = '#ffd84a', scale = 0.42 } = {}) {
  const c = document.createElement('canvas');
  const w = Math.max(16, text.length * 6 + 8), h = 12;
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = 'rgba(10,8,40,.65)';
    g.fillRect(0, 0, w, h);
    g.font = 'bold 8px monospace';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillStyle = '#000';
    g.fillText(text, w / 2 + 1, h / 2 + 1);
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2);
  }
  const tx = new THREE.CanvasTexture(c);
  tx.magFilter = tx.minFilter = THREE.NearestFilter;
  tx.generateMipmaps = false;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false, fog: false }));
  sp.scale.set((w / h) * scale, scale, 1);
  sp.renderOrder = 20;
  return sp;
}

const LOOKS = {
  smith: { shirt: '#5a4636', pants: '#3a3034', skin: '#d89a74' },
  trader: { shirt: '#3a7a8a', pants: '#5a4a3a', skin: '#e0b088' },
  cook: { shirt: '#e8e0d0', pants: '#4a4a5a', skin: '#e8b090' },
  clerk: { shirt: '#7a3a3a', pants: '#3a3a4a', skin: '#e0a880' },
};

/** Simple PS1 NPC: 2 draw calls (static body + working arm) and an idle animation. */
export function buildNpc(kind) {
  const L = LOOKS[kind];
  const body = new Parts();
  body.box(0.28, 0.8, 0.3, L.pants, { x: 0.17, y: 0.4 }).box(0.28, 0.8, 0.3, L.pants, { x: -0.17, y: 0.4 });
  body.box(0.32, 0.14, 0.44, '#2a1a10', { x: 0.17, y: 0.07, z: 0.06 }).box(0.32, 0.14, 0.44, '#2a1a10', { x: -0.17, y: 0.07, z: 0.06 });
  body.box(0.72, 0.78, 0.44, L.shirt, { y: 1.18 });
  body.box(0.76, 0.14, 0.48, '#3a2a1a', { y: 0.84 });
  body.box(0.46, 0.46, 0.46, L.skin, { y: 1.8 });
  body.box(0.2, 0.68, 0.22, L.shirt, { x: 0.47, y: 1.2, z: 0.04, rx: -0.15 }).box(0.18, 0.18, 0.18, L.skin, { x: 0.47, y: 0.82, z: 0.1 });
  body.box(0.1, 0.06, 0.04, '#101010', { x: 0.1, y: 1.84, z: 0.24 }).box(0.1, 0.06, 0.04, '#101010', { x: -0.1, y: 1.84, z: 0.24 });
  if (kind === 'smith') {
    body.box(0.76, 0.16, 0.5, '#b8402a', { y: 2.06 }); // bandana
    body.box(0.5, 0.1, 0.1, '#222', { y: 1.97, z: 0.24 }); // goggles
    body.box(0.6, 0.62, 0.1, '#4a3a30', { y: 1.0, z: 0.24 }); // leather apron
  } else if (kind === 'trader') {
    body.cyl(0.55, 0.55, 0.06, 8, '#7a5a30', { y: 2.06 }).cyl(0.26, 0.3, 0.3, 8, '#8a6a38', { y: 2.2 });
    body.box(0.3, 0.07, 0.06, '#2a1a10', { y: 1.7, z: 0.25 }); // moustache
    body.box(0.5, 0.22, 0.1, '#d8a030', { y: 1.35, z: 0.25 }); // coin sash
  } else if (kind === 'cook') {
    body.cyl(0.22, 0.24, 0.34, 8, '#f4f0e8', { y: 2.2 }).sphere(0.28, 7, 5, '#f4f0e8', { y: 2.42 });
    body.box(0.64, 0.7, 0.1, '#f4f0e8', { y: 1.0, z: 0.25 }); // apron
    body.box(0.4, 0.06, 0.06, '#5a3a24', { y: 1.7, z: 0.25 });
  } else if (kind === 'clerk') {
    body.box(0.54, 0.05, 0.05, '#222', { y: 1.86, z: 0.25 }); // spectacles
    body.box(0.62, 0.5, 0.1, '#c8a050', { y: 1.15, z: 0.24 }); // vest
    body.box(0.18, 0.22, 0.04, '#e8dcc0', { x: 0.47, y: 0.88, z: 0.22 }); // scroll in left hand
  }
  const root = new THREE.Group();
  const bodyMesh = body.mesh(vcLit());
  root.add(bodyMesh);

  const arm = new THREE.Group();
  arm.position.set(-0.47, 1.5, 0);
  const ap = new Parts();
  ap.box(0.2, 0.68, 0.22, L.shirt, { y: -0.32 }).box(0.18, 0.18, 0.18, L.skin, { y: -0.7 });
  if (kind === 'smith') ap.box(0.1, 0.1, 0.5, '#555', { y: -0.76, z: 0.2 }).box(0.3, 0.2, 0.2, '#6a6a72', { y: -0.76, z: 0.5 });
  else if (kind === 'cook') ap.box(0.06, 0.06, 0.7, '#5a3a24', { y: -0.76, z: 0.3 }).box(0.2, 0.08, 0.2, '#8a8a92', { y: -0.76, z: 0.66 });
  else if (kind === 'clerk') ap.box(0.04, 0.04, 0.4, '#e8dcc0', { y: -0.76, z: 0.2 });
  arm.add(ap.mesh(vcLit()));
  root.add(arm);

  let seed = Math.random() * 10;
  return {
    root,
    update(t) {
      t += seed;
      bodyMesh.rotation.y = Math.sin(t * 0.45) * 0.18;
      bodyMesh.scale.y = 1 + Math.sin(t * 1.9) * 0.012;
      arm.rotation.y = bodyMesh.rotation.y;
      if (kind === 'smith') { const sw = Math.max(0, Math.sin(t * 3.4)); arm.rotation.set(-0.5 - sw * 1.5, 0, 0); }
      else if (kind === 'cook') arm.rotation.set(-0.9 + Math.sin(t * 4) * 0.12, 0, Math.sin(t * 4 + 1.5) * 0.25);
      else if (kind === 'trader') { const wave = t % 6 < 1.8; arm.rotation.set(wave ? -2.7 : -0.1, 0, wave ? Math.sin(t * 9) * 0.3 : 0); }
      else arm.rotation.set(-0.8 + Math.sin(t * 7) * 0.06, 0, 0);
    },
  };
}
