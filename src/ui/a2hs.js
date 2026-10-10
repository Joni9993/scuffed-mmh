// "Zum Home-Bildschirm hinzufügen" tip: iOS Safari keeps localStorage longer for installed web apps.
export const A2HS_TEXT = 'Tipp: Zum Home-Bildschirm hinzufügen (Teilen-Symbol, dann „Zum Home-Bildschirm“) – so bleibt dein Spielstand sicherer erhalten und das Spiel läuft im Vollbild.';
export function isIos(nav = globalThis.navigator) {
  const ua = nav?.userAgent ?? '';
  return /iPad|iPhone|iPod/.test(ua) || (nav?.platform === 'MacIntel' && (nav?.maxTouchPoints ?? 0) > 1);
}
export function isStandalone(nav = globalThis.navigator, win = globalThis.window) {
  return !!nav?.standalone || !!win?.matchMedia?.('(display-mode: standalone)')?.matches || !!win?.matchMedia?.('(display-mode: fullscreen)')?.matches;
}
/** true on iOS (Safari) when not yet installed */
export const shouldHintA2hs = (nav, win) => isIos(nav) && !isStandalone(nav, win);
