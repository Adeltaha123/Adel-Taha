import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { CryptoDigestAlgorithm, digestStringAsync, getRandomBytes } from 'expo-crypto';
import { AppState, Platform } from 'react-native';
import { useSyncExternalStore } from 'react';

// App lock: a 4-digit PIN kept as a salted hash in the keychain, plus optional phone unlock
// (Face ID / fingerprint, falling back to the phone's own PIN or passcode).
// The PIN gates the interface; it does not encrypt AsyncStorage. Expo web has no keychain, so it stays unlocked.
export const lockSupported = Platform.OS !== 'web';
const PIN = 'mypa_pin', PHONE = 'mypa_phone_unlock';
const RELOCK_AFTER = 3 * 60 * 1000, MAX_TRIES = 5, COOLDOWN = 30 * 1000;
type Mode = 'loading'|'setup'|'locked'|'open';
let state = { mode:(lockSupported ? 'loading' : 'open') as Mode, phoneUnlock:false, phoneAvailable:false, waitUntil:0 };
const listeners = new Set<() => void>();
function patch(value:Partial<typeof state>) { state = { ...state, ...value }; listeners.forEach(fn => fn()); }
export const useLock = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);

const hex = (bytes:Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
const hash = (salt:string,pin:string) => digestStringAsync(CryptoDigestAlgorithm.SHA256,`${salt}:${pin}`);
let tries = 0, hiddenAt = 0, prompting = false;

export async function initializeLock() {
  if (!lockSupported) return;
  const [saved,phone,phoneAvailable] = await Promise.all([SecureStore.getItemAsync(PIN),SecureStore.getItemAsync(PHONE),phoneUnlockAvailable()]);
  patch({ mode:saved ? 'locked' : 'setup', phoneUnlock:phone === '1' && phoneAvailable, phoneAvailable });
  AppState.addEventListener('change',value => {
    if (value !== 'active') { if (state.mode === 'open' && !prompting) hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > RELOCK_AFTER) lockNow();
    hiddenAt = 0;
  });
}
/** True when the phone has Face ID, a fingerprint, or at least its own PIN/passcode set. */
async function phoneUnlockAvailable() {
  try { return await LocalAuthentication.getEnrolledLevelAsync() > LocalAuthentication.SecurityLevel.NONE; } catch { return false; }
}
export async function setPin(pin:string) {
  const salt = hex(getRandomBytes(16));
  await SecureStore.setItemAsync(PIN,`${salt}:${await hash(salt,pin)}`);
  tries = 0; patch({ mode:'open' });
}
/** Checks a PIN. After five wrong tries the keypad waits 30 seconds. */
export async function checkPin(pin:string): Promise<'ok'|'wrong'|'wait'> {
  if (Date.now() < state.waitUntil) return 'wait';
  const [salt,expected] = (await SecureStore.getItemAsync(PIN) ?? ':').split(':');
  if (salt && await hash(salt,pin) === expected) { tries = 0; patch({ mode:'open', waitUntil:0 }); return 'ok'; }
  if (++tries < MAX_TRIES) return 'wrong';
  tries = 0; patch({ waitUntil:Date.now() + COOLDOWN }); return 'wait';
}
/** Shows the phone's own unlock prompt. Resolves true when the owner was confirmed. */
export async function verifyWithPhone(reason:string, cancelLabel:string) {
  if (prompting) return false;
  prompting = true;
  try { return (await LocalAuthentication.authenticateAsync({ promptMessage:reason, cancelLabel, disableDeviceFallback:false })).success; }
  catch { return false; }
  finally { prompting = false; }
}
export async function unlockWithPhone(reason:string, cancelLabel:string) {
  if (!state.phoneUnlock) return false;
  const ok = await verifyWithPhone(reason,cancelLabel);
  if (ok) { tries = 0; patch({ mode:'open', waitUntil:0 }); }
  return ok;
}
/** Turning phone unlock on needs one successful prompt first, so it is never saved for a phone that can't complete it. */
export async function setPhoneUnlock(on:boolean, reason:string, cancelLabel:string) {
  if (on && !await verifyWithPhone(reason,cancelLabel)) return false;
  await SecureStore.setItemAsync(PHONE,on ? '1' : '0');
  patch({ phoneUnlock:on }); return true;
}
export function lockNow() { if (lockSupported && state.mode === 'open') patch({ mode:'locked' }); }
export const changePin = () => { if (lockSupported) patch({ mode:'setup' }); };
