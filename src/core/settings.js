const KEY = 'scuffedhunter.settings.v1';
export const RES_STEPS = [360, 480, 640, 800];
export const DMG_MODES = ['all', 'own', 'off'];
const defaults = { res: 640, resV: 2, scanlines: true, dmgNumbers: 'all', volume: 0.6, musicOn: true, musicVolume: 0.5, nofx: false, btnSize: 'M', leftHand: false, stickMode: 'follow', camDist: 'M', haptics: true, autoRes: true, tipsSeen: false, a2hsSeen: false };
export const settings = { ...defaults };
/** dmgNumbers: 'all' | 'own' | 'off'; older saves stored a boolean */
export const normDmgMode = (v) => (v === true ? 'all' : v === false ? 'off' : DMG_MODES.includes(v) ? v : 'all');
export const nextDmgMode = (v) => DMG_MODES[(DMG_MODES.indexOf(normDmgMode(v)) + 1) % DMG_MODES.length];

try {
  Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}'));
} catch { /* storage may be unavailable */ }
if (settings.resV !== 2) { settings.resV = 2; if (settings.autoRes !== false) settings.res = 640; } // older saves: new readable default
settings.dmgNumbers = normDmgMode(settings.dmgNumbers);
if (settings.stickMode !== 'fixed') settings.stickMode = 'follow';
if (!['N', 'M', 'W'].includes(settings.camDist)) settings.camDist = 'M';
if (!RES_STEPS.includes(settings.res)) settings.res = 640;
/** next resolution step (wraps) / one step lower (clamped) */
export const nextRes = (r) => RES_STEPS[(RES_STEPS.indexOf(r) + 1) % RES_STEPS.length];
export const lowerRes = (r) => RES_STEPS[Math.max(0, RES_STEPS.indexOf(r) - 1)];

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}
