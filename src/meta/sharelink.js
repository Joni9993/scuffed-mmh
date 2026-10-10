// Join-Link: Basis-URL + ?join=ABCD (rein, testbar) und Teilen-Helfer (Web Share / Zwischenablage).
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // wie protocol.js (ohne I und O)
const okCode = (c) => typeof c === 'string' && c.length === 4 && [...c].every((ch) => CHARS.includes(ch));

/** Basis-URL ohne Query/Hash + ?join=CODE. Ungültiger Code → null. */
export function buildJoinUrl(base, code) {
  const c = String(code ?? '').toUpperCase();
  if (!okCode(c)) return null;
  return `${String(base).split('#')[0].split('?')[0]}?join=${c}`;
}

/** Liest ?join= aus einem Such-String; gültiger Großbuchstaben-Code oder null. */
export function parseJoinParam(search) {
  const v = new URLSearchParams(search).get('join');
  const c = String(v ?? '').trim().toUpperCase();
  return okCode(c) ? c : null;
}

/** Teilt den Link. Rückgabe: 'shared' | 'copied' | 'failed'. */
export async function shareJoinLink(code, nav = globalThis.navigator, loc = globalThis.location) {
  const url = buildJoinUrl(loc.origin + loc.pathname, code);
  if (!url) return 'failed';
  const data = { title: 'Glitch Hunter', text: `Komm in meinen Raum ${code} bei Glitch Hunter!`, url };
  try { if (nav?.share) { await nav.share(data); return 'shared'; } } catch (e) { if (e?.name === 'AbortError') return 'failed'; }
  try { await nav.clipboard.writeText(url); return 'copied'; } catch { return 'failed'; }
}
