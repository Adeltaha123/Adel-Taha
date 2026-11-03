import { CryptoDigestAlgorithm, digestStringAsync, getRandomBytes } from 'expo-crypto';
import { AppState } from 'react-native';
import { useSyncExternalStore } from 'react';
import { getSecret, recentlyUnlocked, rememberUnlock, setSecret } from './secure';
import { enablePhoneUnlock, phoneUnlockAvailable, verifyPhoneUnlock } from './phone-auth';

// App lock: a 4-digit PIN kept as a salted hash, plus optional phone unlock
// (Face ID / fingerprint, falling back to the phone's own PIN or passcode).
// The PIN gates the interface; it does not encrypt AsyncStorage.
const PIN = 'mypa_pin', PHONE = 'mypa_phone_unlock';
const RELOCK_AFTER = 3 * 60 * 1000, MAX_TRIES = 5, COOLDOWN = 30 * 1000;
type Mode = 'loading'|'setup'|'locked'|'open';
let state = { mode:'loading' as Mode, phoneUnlock:false, phoneAvailable:false, waitUntil:0 };
const listeners = new Set<() => void>();
function patch(value:Partial<typeof state>) { state = { ...state, ...value }; listeners.forEach(fn => fn()); }
export const useLock = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);

const hex = (bytes:Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
const hash = (salt:string,pin:string) => digestStringAsync(CryptoDigestAlgorithm.SHA256,`${salt}:${pin}`);
let tries = 0, hiddenAt = 0, prompting = false, phoneToken = '';
function open() { tries = 0; rememberUnlock(); patch({ mode:'open', waitUntil:0 }); }

export async function initializeLock() {
  const [saved,phone,phoneAvailable] = await Promise.all([getSecret(PIN),getSecret(PHONE),phoneUnlockAvailable()]);
  phoneToken = phone && phone !== '0' ? phone : '';
  patch({ mode:!saved ? 'setup' : recentlyUnlocked() ? 'open' : 'locked', phoneUnlock:!!phoneToken && phoneAvailable, phoneAvailable });
  AppState.addEventListener('change',value => {
    if (value !== 'active') { if (state.mode === 'open' && !prompting) { hiddenAt = Date.now(); rememberUnlock(); } return; }
    if (hiddenAt && Date.now() - hiddenAt > RELOCK_AFTER) lockNow();
    hiddenAt = 0;
  });
}
export async function setPin(pin:string) {
  const salt = hex(getRandomBytes(16));
  await setSecret(PIN,`${salt}:${await hash(salt,pin)}`);
  open();
}
/** Checks a PIN. After five wrong tries the keypad waits 30 seconds. */
export async function checkPin(pin:string): Promise<'ok'|'wrong'|'wait'> {
  if (Date.now() < state.waitUntil) return 'wait';
  const [salt,expected] = (await getSecret(PIN) ?? ':').split(':');
  if (salt && await hash(salt,pin) === expected) { open(); return 'ok'; }
  if (++tries < MAX_TRIES) return 'wrong';
  tries = 0; patch({ waitUntil:Date.now() + COOLDOWN }); return 'wait';
}
/** Runs one phone prompt at a time; the prompt itself backgrounds the app, which must not count as leaving it. */
async function prompt<T>(fn:() => Promise<T>, fallback:T) {
  if (prompting) return fallback;
  prompting = true;
  try { return await fn(); } finally { prompting = false; }
}
export async function unlockWithPhone(reason:string, cancelLabel:string) {
  if (!state.phoneUnlock) return false;
  const ok = await prompt(() => verifyPhoneUnlock(phoneToken,reason,cancelLabel),false);
  if (ok) open();
  return ok;
}
/** Turning phone unlock on needs one successful prompt first, so it is never saved for a device that can't complete it. */
export async function setPhoneUnlock(on:boolean, reason:string, cancelLabel:string) {
  const token = on ? await prompt(() => enablePhoneUnlock(reason,cancelLabel),null) : '0';
  if (!token) return false;
  await setSecret(PHONE,token);
  phoneToken = on ? token : '';
  patch({ phoneUnlock:on }); return true;
}
export function lockNow() { if (state.mode === 'open') patch({ mode:'locked' }); }
export const changePin = () => patch({ mode:'setup' });
