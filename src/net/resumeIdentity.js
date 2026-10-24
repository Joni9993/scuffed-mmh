const KEY = 'glitchhunter.room-resume.v1';
export const RECONNECT_GRACE_MS = 90000;
export function randomToken() { return globalThis.crypto?.randomUUID?.() ?? Array.from(globalThis.crypto?.getRandomValues?.(new Uint32Array(4)) ?? [Math.random(), Math.random(), Date.now(), Math.random()], n => n.toString(36)).join('-'); }
export function loadResume(code) { try { return JSON.parse(globalThis.sessionStorage?.getItem(KEY) || '{}')[code]?.token ?? null; } catch { return null; } }
export function saveResume(code, token) { try { const all = JSON.parse(globalThis.sessionStorage?.getItem(KEY) || '{}'); all[code] = { token }; const keys = Object.keys(all); while (keys.length > 4) delete all[keys.shift()]; globalThis.sessionStorage?.setItem(KEY, JSON.stringify(all)); } catch { /* storage unavailable: same-tab reconnect still works */ } }
export function clearResume(code) { try { const all = JSON.parse(globalThis.sessionStorage?.getItem(KEY) || '{}'); delete all[code]; globalThis.sessionStorage?.setItem(KEY, JSON.stringify(all)); } catch { /* unavailable */ } }
