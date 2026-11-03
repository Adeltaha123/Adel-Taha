import { Capacitor } from '@capacitor/core';

/** Native apps bundle their web assets; only browser builds need an offline cache. */
export async function registerServiceWorker(): Promise<void> {
  if (Capacitor.isNativePlatform() || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  if (!window.isSecureContext) return;
  try {
    const base = new URL(import.meta.env.BASE_URL, window.location.href);
    await navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.pathname });
  } catch (error) {
    console.warn('Offline installation is unavailable.', error);
  }
}
