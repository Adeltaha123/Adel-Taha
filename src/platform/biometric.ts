import { Capacitor } from '@capacitor/core';
import { BiometryType, NativeBiometric } from '@capgo/capacitor-native-biometric';
import type { Settings } from '../types/domain';

// Phone unlock: Face ID / fingerprint, falling back to the phone's own PIN or passcode.
// Native builds use the OS prompt; browsers use a WebAuthn platform authenticator (bioId).
export const isNative = Capacitor.isNativePlatform();
// Android ignores useFallback on verifyIdentity, so allow device credentials explicitly.
const androidTypes = [BiometryType.FINGERPRINT, BiometryType.FACE_AUTHENTICATION, BiometryType.IRIS_AUTHENTICATION, BiometryType.DEVICE_CREDENTIAL];

let available: Promise<boolean> | null = null;
export function phoneUnlockAvailable(): Promise<boolean> {
  return available ??= (async () => {
    try {
      if (isNative) return (await NativeBiometric.isAvailable({ useFallback: true })).isAvailable;
      return !!(window.PublicKeyCredential && window.isSecureContext && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch { return false; }
  })();
}

export const phoneUnlockOn = (settings: Partial<Settings>) => isNative ? !!settings.phoneUnlock : !!settings.bioId;

function b64(buffer: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(buffer))); }
function unb64(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }

/** Turns phone unlock on after the owner proves it works once. Returns the settings fields to save. */
export async function enablePhoneUnlock(uid: string, reason: string): Promise<Partial<Settings>> {
  if (isNative) { await verifyNative(reason); return { phoneUnlock: true }; }
  const credential = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: 'My PA' }, user: { id: new TextEncoder().encode(uid.slice(0, 60)), name: 'owner', displayName: 'My PA owner' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000,
  } }) as PublicKeyCredential | null;
  if (!credential) throw new Error('No credential');
  return { bioId: b64(credential.rawId) };
}

/** Resolves true when the phone confirmed the owner; throws or returns false otherwise. */
export async function verifyPhoneUnlock(settings: Partial<Settings>, reason: string): Promise<boolean> {
  if (isNative) { await verifyNative(reason); return true; }
  if (!settings.bioId) return false;
  return !!await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [{ type: 'public-key', id: unb64(settings.bioId) }], userVerification: 'required', timeout: 60000,
  } });
}

function verifyNative(reason: string) {
  return NativeBiometric.verifyIdentity({ reason, title: 'My PA', subtitle: reason, useFallback: true, maxAttempts: 5,
    allowedBiometryTypes: Capacitor.getPlatform() === 'android' ? androidTypes : undefined });
}
