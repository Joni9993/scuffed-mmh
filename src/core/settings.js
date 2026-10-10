const KEY = 'scuffedhunter.settings.v1';
const defaults = { res: 480, scanlines: true, dmgNumbers: true, volume: 0.6, nofx: false, btnSize: 'M', leftHand: false, haptics: true, autoRes: true, tipsSeen: false, a2hsSeen: false };
export const settings = { ...defaults };

try {
  Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}'));
} catch { /* storage may be unavailable */ }

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}
