import * as THREE from 'three';

/** Shared uniforms for the PS1 look. Glitch effect pushes snapScale/jitter up for a moment. */
export const ps1Globals = {
  uSnap: { value: new THREE.Vector2(160, 74) },
  uTime: { value: 0 },
  uGJit: { value: 0 },
};
const base = { x: 160, y: 74 };
let snapScale = 1;

export function setSnapGrid(x, y) { base.x = x; base.y = y; applySnap(); }
/** k > 1 = coarser grid (stronger snapping). */
export function setSnapScale(k) { snapScale = k; applySnap(); }
function applySnap() { ps1Globals.uSnap.value.set(base.x / snapScale, base.y / snapScale); }
export function setGlobalJitter(v) { ps1Globals.uGJit.value = v; }

const HASH = `
uniform vec2 uSnap; uniform float uTime; uniform float uGJit; uniform float uJit;
vec3 shHash(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx)-.5; }
`;

/**
 * Patch a built-in material (Lambert/Basic) with PS1 vertex snapping + optional per-material jitter.
 * Per-material jitter strength: mat.userData.ps1.uJit.value (used for part-damage wobble).
 */
export function ps1(mat) {
  const uJit = { value: 0 };
  mat.userData.ps1 = { uJit };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, ps1Globals, { uJit });
    sh.vertexShader = HASH + sh.vertexShader
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\n transformed += shHash(position*13.0 + floor(uTime*14.0)) * (uJit + uGJit);')
      .replace('#include <project_vertex>',
        '#include <project_vertex>\n vec4 sp = gl_Position; sp.xyz /= sp.w; sp.xy = floor(sp.xy * uSnap + .5) / uSnap; sp.xyz *= sp.w; gl_Position = sp;');
  };
  mat.customProgramCacheKey = () => 'ps1';
  return mat;
}

export const lambert = (opts) => ps1(new THREE.MeshLambertMaterial(opts));
export const basic = (opts) => ps1(new THREE.MeshBasicMaterial(opts));
