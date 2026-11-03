// Browsers have no keychain, so lock secrets use localStorage. The PIN is stored only as a salted hash.
const UNLOCKED = 'mypa_unlocked_at', KEEP = 3 * 60 * 1000;
export async function getSecret(key:string) { try { return localStorage.getItem(key); } catch { return null; } }
export async function setSecret(key:string, value:string) { localStorage.setItem(key,value); }
/** A reload within three minutes of using the app stays unlocked, for this tab only. */
export function rememberUnlock() { try { sessionStorage.setItem(UNLOCKED,String(Date.now())); } catch {} }
export function recentlyUnlocked() { try { return Date.now() - Number(sessionStorage.getItem(UNLOCKED)) < KEEP; } catch { return false; } }
