import { pbkdf2 as pbkdf2Callback, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2 = promisify(pbkdf2Callback), scrypt = promisify(scryptCallback);
// PBKDF2-SHA256 with the iteration count stored in each hash, so it can be raised later without breaking logins.
// Cloudflare's free plan allows about 10 ms of CPU per request, which bounds the default there (PASSWORD_ITERATIONS
// in wrangler.toml); Node servers use a stronger default.
const DEFAULT_ITERATIONS = 210_000;
const iterations = () => Number(process.env.PASSWORD_ITERATIONS) || DEFAULT_ITERATIONS;

/** Stored as pbkdf2$<iterations>$<salt hex>$<hash hex>. */
export async function hashPassword(password: string) {
  const count = iterations(), salt = randomBytes(16).toString('hex');
  return `pbkdf2$${count}$${salt}$${(await pbkdf2(password, salt, count, 32, 'sha256')).toString('hex')}`;
}
/** Checks a password against a stored hash; also reads the scrypt "salt:hash" format used before PBKDF2. */
export async function verifyPassword(password: string, stored: string) {
  const [kind, count, salt, expected] = stored.split('$');
  let actual: Buffer, wanted: Buffer;
  if (kind === 'pbkdf2' && salt && expected) {
    wanted = Buffer.from(expected, 'hex');
    actual = await pbkdf2(password, salt, Number(count), wanted.length, 'sha256');
  } else {
    const [legacySalt, legacyHash] = stored.split(':');
    if (!legacySalt || !legacyHash) return false;
    wanted = Buffer.from(legacyHash, 'hex');
    actual = await scrypt(password, legacySalt, wanted.length) as Buffer;
  }
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}
/** True when a stored hash should be replaced with one at the current settings after a successful login. */
export const needsRehash = (stored: string) => !stored.startsWith(`pbkdf2$${iterations()}$`);
/** Spends the same work as a real check, so unknown emails take as long as wrong passwords. */
export const dummyCheck = (password: string) => pbkdf2(password, '0'.repeat(32), iterations(), 32, 'sha256').then(() => false);
