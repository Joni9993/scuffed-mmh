import * as THREE from 'three';
import { settings } from '../core/settings.js';
import { setSnapGrid } from './ps1.js';
import { updateLabels } from './labels.js';

/**
 * Low-res PS1 pipeline: render at internal width (480 / 360), canvas is CSS-upscaled with
 * image-rendering: pixelated. Scenes/cameras are owned by the scene; renderer just draws.
 */
export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.id = 'game';
  container.appendChild(canvas);

  const api = {
    renderer, canvas, width: 480, height: 270, aspect: 16 / 9,
    resize() {
      const w = window.innerWidth || 844, h = window.innerHeight || 390;
      this.aspect = w / h;
      this.width = settings.res;
      this.height = Math.max(120, Math.round(this.width / this.aspect));
      renderer.setSize(this.width, this.height, false);
      setSnapGrid(this.width / 3, this.height / 3.65); // ~PS1 grid relative to the internal resolution
      for (const fn of this.onResize) fn(this.aspect);
    },
    onResize: new Set(),
    setResolution(w) { settings.res = w; this.resize(); },
    render(scene, camera) { renderer.render(scene, camera); updateLabels(scene, camera); },
  };
  window.addEventListener('resize', () => api.resize());
  window.visualViewport?.addEventListener('resize', () => api.resize());
  window.addEventListener('orientationchange', () => setTimeout(() => api.resize(), 120));
  api.resize();
  return api;
}
