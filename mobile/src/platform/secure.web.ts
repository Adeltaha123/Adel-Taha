// Browsers have no keychain, so the sign-in session and lock secrets use localStorage, behind the app's PIN.
// The PIN is stored only as a salted hash.
const UNLOCKED = 'mypa_unlocked_at', KEEP = 3 * 60 * 1000;
export async function getSecret(key:string) { try { return localStorage.getItem(key); } catch { return null; } }
export async function setSecret(key:string, value:string) { localStorage.setItem(key,value); }
/** A reload within three minutes of using the app stays unlocked, for this tab only. */
export function rememberUnlock() { try { sessionStorage.setItem(UNLOCKED,String(Date.now())); } catch {} }
export function recentlyUnlocked() { try { return Date.now() - Number(sessionStorage.getItem(UNLOCKED)) < KEEP; } catch { return false; } }
export async function deleteSecret(key:string) { try { localStorage.removeItem(key); } catch {} }
