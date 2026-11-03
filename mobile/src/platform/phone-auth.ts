import * as LocalAuthentication from 'expo-local-authentication';

// Phone unlock: Face ID / fingerprint, falling back to the phone's own PIN or passcode.
// phone-auth.web.ts uses the browser's platform authenticator instead.

/** True when the phone has Face ID, a fingerprint, or at least its own PIN/passcode set. */
export async function phoneUnlockAvailable() {
  try { return await LocalAuthentication.getEnrolledLevelAsync() > LocalAuthentication.SecurityLevel.NONE; } catch { return false; }
}
/** Resolves true when the phone confirmed the owner. */
export async function verifyPhoneUnlock(_token:string, reason:string, cancelLabel:string) {
  try { return (await LocalAuthentication.authenticateAsync({ promptMessage:reason, cancelLabel, disableDeviceFallback:false })).success; }
  catch { return false; }
}
/** Confirms the owner once and returns the value to save, or null if it was not confirmed. */
export async function enablePhoneUnlock(reason:string, cancelLabel:string) {
  return await verifyPhoneUnlock('',reason,cancelLabel) ? '1' : null;
}
