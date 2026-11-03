// Browser phone unlock: a WebAuthn platform credential, which the browser confirms with
// Face ID, a fingerprint, or the device PIN. The saved token is the credential ID.
const b64 = (buffer:ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));
const unb64 = (value:string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const challenge = () => crypto.getRandomValues(new Uint8Array(32));

export async function phoneUnlockAvailable() {
  try { return !!(window.PublicKeyCredential && window.isSecureContext && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
  catch { return false; }
}
export async function verifyPhoneUnlock(token:string, _reason:string, _cancelLabel:string) {
  if (!token) return false;
  try {
    return !!await navigator.credentials.get({ publicKey:{ challenge:challenge(), allowCredentials:[{ type:'public-key', id:unb64(token) }], userVerification:'required', timeout:60000 } });
  } catch { return false; }
}
export async function enablePhoneUnlock(_reason:string, _cancelLabel:string) {
  try {
    const credential = await navigator.credentials.create({ publicKey:{
      challenge:challenge(), rp:{ name:'My PA' },
      user:{ id:crypto.getRandomValues(new Uint8Array(16)), name:'owner', displayName:'My PA owner' },
      pubKeyCredParams:[{ type:'public-key', alg:-7 },{ type:'public-key', alg:-257 }],
      authenticatorSelection:{ authenticatorAttachment:'platform', userVerification:'required', residentKey:'discouraged' }, timeout:60000,
    } }) as PublicKeyCredential | null;
    return credential ? b64(credential.rawId) : null;
  } catch { return null; }
}
