const KEY = 'scuffedhunter.settings.v1';
export const RES_STEPS = [360, 480, 640, 800];
const defaults = { res: 640, resV: 2, scanlines: true, dmgNumbers: true, volume: 0.6, nofx: false, btnSize: 'M', leftHand: false, stickMode: 'follow', haptics: true, autoRes: true, tipsSeen: false, a2hsSeen: false };
export const settings = { ...defaults };

try {
  Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}'));
} catch { /* storage may be unavailable */ }
if (settings.resV !== 2) { settings.resV = 2; if (settings.autoRes !== false) settings.res = 640; } // older saves: new readable default
if (settings.stickMode !== 'fixed') settings.stickMode = 'follow';
if (!RES_STEPS.includes(settings.res)) settings.res = 640;
/** next resolution step (wraps) / one step lower (clamped) */
export const nextRes = (r) => RES_STEPS[(RES_STEPS.indexOf(r) + 1) % RES_STEPS.length];
export const lowerRes = (r) => RES_STEPS[Math.max(0, RES_STEPS.indexOf(r) - 1)];

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}
