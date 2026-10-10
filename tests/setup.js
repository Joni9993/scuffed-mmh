// Minimal DOM stub so procedural canvas textures can be created in node (no pixels needed).
const ctx2d = new Proxy({}, { get: (t, k) => ((k === 'createRadialGradient' || k === 'createLinearGradient') ? () => ({ addColorStop() {} }) : typeof k === 'string' ? () => {} : undefined), set: () => true });
globalThis.document = globalThis.document ?? {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} } }),
  getElementById: () => null,
};
globalThis.window = globalThis.window ?? globalThis;
