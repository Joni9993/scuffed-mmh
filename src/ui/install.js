// PWA install: service worker registration + beforeinstallprompt handling (Android Chrome) + iOS hint text.
import { isIos, isStandalone } from './a2hs.js';

let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((f) => f());

export function initInstall() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
  if ('serviceWorker' in navigator && (import.meta.env?.PROD || location.search.includes('sw=1'))) {
    const reg = () => navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
    if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
  }
}
export const onInstallChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const canInstall = () => !!deferred;
export const installed = () => isStandalone();
export async function promptInstall() {
  if (!deferred) return false;
  const d = deferred; deferred = null; notify();
  try { await d.prompt(); const r = await d.userChoice; return r?.outcome === 'accepted'; } catch { return false; }
}
export const IOS_TEXT = 'iPhone/iPad: Teilen-Symbol antippen, dann „Zum Home-Bildschirm“.';
export const ANDROID_TEXT = 'Android: Browser-Menü (drei Punkte), dann „App installieren“.';
/** html for an install button (when the browser offered the prompt) or a short how-to; wire with bindInstall(root) */
export function installHtml() {
  if (installed()) return '';
  if (canInstall()) return '<button class="btn small go" data-install="1">Installieren</button>';
  return `<div class="note" data-install-hint="1">${isIos() ? IOS_TEXT : `${ANDROID_TEXT} ${IOS_TEXT}`}</div>`;
}
export function bindInstall(root) {
  root.querySelectorAll('[data-install]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); promptInstall(); }));
}
