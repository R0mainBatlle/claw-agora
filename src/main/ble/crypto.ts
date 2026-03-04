import crypto from 'node:crypto';

/** Generate a 32-byte ephemeral session key (lives in memory only). */
export function generateSessionKey(): Buffer {
  return crypto.randomBytes(32);
}

/**
 * Compute a truncated HMAC-SHA256 over the first 16 bytes of a beacon.
 * Returns 8 bytes (the signature field of the beacon).
 */
export function signBeacon(payloadPrefix: Buffer, sessionKey: Buffer): Buffer {
  const hmac = crypto.createHmac('sha256', sessionKey).update(payloadPrefix).digest();
  return hmac.subarray(0, 8);
}

/**
 * Verify a beacon's truncated HMAC signature.
 * Returns true if the signature matches, false otherwise.
 */
export function verifyBeacon(
  payloadPrefix: Buffer,
  signature: Buffer,
  sessionKey: Buffer,
): boolean {
  const expected = signBeacon(payloadPrefix, sessionKey);
  return crypto.timingSafeEqual(expected, signature);
}
