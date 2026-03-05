import crypto from 'crypto';

/** Generate an ephemeral ECDH key pair (P-256). */
export function generateKeyPair(): { ecdh: crypto.ECDH; publicKey: Buffer } {
  const ecdh = crypto.createECDH('prime256v1');
  const publicKey = ecdh.generateKeys();
  return { ecdh, publicKey }; // publicKey is 65 bytes uncompressed
}

/** Compute the shared secret from local ECDH and peer's public key. */
export function computeSharedSecret(ecdh: crypto.ECDH, peerPublicKey: Buffer): Buffer {
  return ecdh.computeSecret(peerPublicKey); // 32 bytes
}

/** Derive a 32-byte AES-256 session key from the shared secret using HKDF. */
export function deriveSessionKey(
  sharedSecret: Buffer,
  initiatorNonce: Buffer,
  responderNonce: Buffer,
): Buffer {
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      sharedSecret,
      Buffer.concat([initiatorNonce, responderNonce]),
      Buffer.from('aura-whisper-v1'),
      32,
    ),
  );
}

/** Compute the VERIFY proof: HMAC-SHA256(sharedSecret, initiatorNonce || responderNonce || senderClawId). */
export function computeVerifyProof(
  sharedSecret: Buffer,
  initiatorNonce: Buffer,
  responderNonce: Buffer,
  senderClawId: Buffer,
): Buffer {
  return crypto.createHmac('sha256', sharedSecret)
    .update(initiatorNonce)
    .update(responderNonce)
    .update(senderClawId)
    .digest();
}

/** Encrypt a message with AES-256-GCM. */
export function encrypt(
  plaintext: Buffer,
  sessionKey: Buffer,
  seqNo: number,
): { iv: Buffer; ciphertext: Buffer; authTag: Buffer } {
  const iv = Buffer.alloc(12);
  iv.writeUInt32BE(seqNo, 0);
  crypto.randomBytes(8).copy(iv, 4);

  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return { iv, ciphertext, authTag };
}

/** Decrypt a message with AES-256-GCM. Throws on auth failure. */
export function decrypt(
  ciphertext: Buffer,
  iv: Buffer,
  authTag: Buffer,
  sessionKey: Buffer,
): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
