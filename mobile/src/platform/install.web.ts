import { useSyncExternalStore } from 'react';

// Adding the website to the home screen. Chrome and Edge (Android, desktop) offer their own install prompt, which
// the app shows on a button; iPhone Safari has no prompt, so the app explains Share → Add to Home Screen instead.
export type InstallState = { installed:boolean; canPrompt:boolean; ios:boolean };
type PromptEvent = Event & { prompt:() => Promise<void>; userChoice:Promise<{ outcome:'accepted'|'dismissed' }> };
let deferred:PromptEvent|null = null;
const listeners = new Set<() => void>();
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?:boolean }).standalone === true;
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let state:InstallState = { installed:standalone(), canPrompt:false, ios };
function update(next:Partial<InstallState>) { state = { ...state, ...next }; listeners.forEach(fn => fn()); }

window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferred = event as PromptEvent; update({ canPrompt:true }); });
window.addEventListener('appinstalled', () => { deferred = null; update({ installed:true, canPrompt:false }); });
// Chrome only offers installing a site that has a service worker; this one caches nothing (public/sw.js).
if ('serviceWorker' in navigator && window.isSecureContext) void navigator.serviceWorker.register('/sw.js').catch(() => {});

export const useInstall = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);
/** Shows the browser's install prompt; resolves true when the user accepted. */
export async function promptInstall() {
  if (!deferred) return false;
  const event = deferred; deferred = null; update({ canPrompt:false });
  await event.prompt();
  return (await event.userChoice).outcome === 'accepted';
}
