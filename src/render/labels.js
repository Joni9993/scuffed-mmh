// Crisp DOM name labels for world objects. labelSprite() returns an invisible THREE.Sprite that only carries the
// world position (parent it like any object3d); the text is a DOM element projected every frame by updateLabels()
// (called from renderer.render) so it stays sharp regardless of the internal render resolution.
import * as THREE from 'three';

const live = new Set();
let layer = null;
const tmp = new THREE.Vector3();
const MAX_DIST = 46;

function getLayer() {
  if (layer && layer.isConnected) return layer;
  layer = document.createElement('div');
  layer.id = 'labels';
  (document.getElementById('fxlayer') ?? document.body).appendChild(layer);
  return layer;
}

export function labelSprite(text, { color = '#ffd84a', scale = 0.42 } = {}) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
  sp.material.visible = false;
  sp.scale.set(0.01, 0.01, 1);
  if (typeof document === 'undefined' || typeof document.body?.appendChild !== 'function') return sp;
  const el = document.createElement('div');
  el.className = 'wlabel' + (scale < 0.4 ? ' sm' : '') + (scale > 0.45 ? ' bub' : '');
  el.textContent = text;
  el.style.color = color;
  el.style.display = 'none';
  getLayer().appendChild(el);
  live.add({ sp, el, miss: 0 });
  return sp;
}

/** 1 = in scene and visible, 0 = in scene but hidden, -1 = not in this scene */
function attached(o, scene) {
  let vis = 1;
  for (let p = o; p; p = p.parent) { if (p.visible === false) vis = 0; if (p === scene) return vis; }
  return -1;
}

/** project all labels of `scene` for `camera` (call right after rendering it) */
export function updateLabels(scene, camera) {
  if (!live.size) return;
  const w = window.innerWidth, h = window.innerHeight;
  for (const L of live) {
    const { sp, el } = L;
    const at = attached(sp, scene);
    if (at < 1) {
      el.style.display = 'none';
      if (at < 0 && ++L.miss > 400) { el.remove(); live.delete(L); } // left the world for good (scene disposed / label removed)
      continue;
    }
    L.miss = 0;
    sp.getWorldPosition(tmp);
    const d = tmp.distanceTo(camera.position);
    tmp.project(camera);
    if (tmp.z > 1 || d > MAX_DIST || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1) { el.style.display = 'none'; continue; }
    el.style.display = '';
    el.style.transform = `translate(${((tmp.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -50%)`;
    el.style.opacity = d > MAX_DIST - 10 ? String(Math.max(0, (MAX_DIST - d) / 10)) : '1';
  }
}
