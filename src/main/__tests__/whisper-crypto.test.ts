import { describe, it, expect } from 'vitest';
import {
  generateKeyPair,
  computeSharedSecret,
  deriveSessionKey,
  computeVerifyProof,
  encrypt,
  decrypt,
} from '../whisper/crypto';

describe('Whisper Crypto', () => {
  describe('generateKeyPair', () => {
    it('produces a 65-byte uncompressed P-256 public key', () => {
      const { publicKey } = generateKeyPair();
      expect(publicKey.length).toBe(65);
      expect(publicKey[0]).toBe(0x04); // uncompressed marker
    });

    it('produces unique key pairs', () => {
      const a = generateKeyPair();
      const b = generateKeyPair();
      expect(a.publicKey.equals(b.publicKey)).toBe(false);
    });
  });

  describe('computeSharedSecret', () => {
    it('is symmetric: A→B === B→A', () => {
      const alice = generateKeyPair();
      const bob = generateKeyPair();

      const secretAB = computeSharedSecret(alice.ecdh, bob.publicKey);
      const secretBA = computeSharedSecret(bob.ecdh, alice.publicKey);

      expect(secretAB.equals(secretBA)).toBe(true);
      expect(secretAB.length).toBe(32);
    });
  });

  describe('deriveSessionKey', () => {
    it('is deterministic', () => {
      const secret = Buffer.alloc(32, 0x42);
      const initNonce = Buffer.alloc(8, 0x01);
      const respNonce = Buffer.alloc(8, 0x02);

      const key1 = deriveSessionKey(secret, initNonce, respNonce);
      const key2 = deriveSessionKey(secret, initNonce, respNonce);
      expect(key1.equals(key2)).toBe(true);
      expect(key1.length).toBe(32);
    });

    it('is nonce-sensitive', () => {
      const secret = Buffer.alloc(32, 0x42);
      const initNonce = Buffer.alloc(8, 0x01);
      const respNonce1 = Buffer.alloc(8, 0x02);
      const respNonce2 = Buffer.alloc(8, 0x03);

      const key1 = deriveSessionKey(secret, initNonce, respNonce1);
      const key2 = deriveSessionKey(secret, initNonce, respNonce2);
      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('computeVerifyProof', () => {
    it('is deterministic', () => {
      const secret = Buffer.alloc(32, 0x42);
      const initNonce = Buffer.alloc(8, 0x01);
      const respNonce = Buffer.alloc(8, 0x02);
      const clawId = Buffer.from('a1b2c3d4', 'hex');

      const proof1 = computeVerifyProof(secret, initNonce, respNonce, clawId);
      const proof2 = computeVerifyProof(secret, initNonce, respNonce, clawId);
      expect(proof1.equals(proof2)).toBe(true);
      expect(proof1.length).toBe(32);
    });

    it('is clawId-sensitive', () => {
      const secret = Buffer.alloc(32, 0x42);
      const initNonce = Buffer.alloc(8, 0x01);
      const respNonce = Buffer.alloc(8, 0x02);

      const proof1 = computeVerifyProof(secret, initNonce, respNonce, Buffer.from('a1b2c3d4', 'hex'));
      const proof2 = computeVerifyProof(secret, initNonce, respNonce, Buffer.from('11223344', 'hex'));
      expect(proof1.equals(proof2)).toBe(false);
    });
  });

  describe('encrypt / decrypt', () => {
    it('roundtrips plaintext', () => {
      const key = Buffer.alloc(32, 0x42);
      const plaintext = Buffer.from('Hello, secret world!');
      const { iv, ciphertext, authTag } = encrypt(plaintext, key, 0);

      const decrypted = decrypt(ciphertext, iv, authTag, key);
      expect(decrypted.equals(plaintext)).toBe(true);
    });

    it('throws on wrong key', () => {
      const key = Buffer.alloc(32, 0x42);
      const wrongKey = Buffer.alloc(32, 0x43);
      const plaintext = Buffer.from('secret');
      const { iv, ciphertext, authTag } = encrypt(plaintext, key, 0);

      expect(() => decrypt(ciphertext, iv, authTag, wrongKey)).toThrow();
    });

    it('throws on tampered ciphertext', () => {
      const key = Buffer.alloc(32, 0x42);
      const plaintext = Buffer.from('secret');
      const { iv, ciphertext, authTag } = encrypt(plaintext, key, 0);

      ciphertext[0] ^= 0xff; // flip bits
      expect(() => decrypt(ciphertext, iv, authTag, key)).toThrow();
    });

    it('throws on tampered authTag', () => {
      const key = Buffer.alloc(32, 0x42);
      const plaintext = Buffer.from('secret');
      const { iv, ciphertext, authTag } = encrypt(plaintext, key, 0);

      authTag[0] ^= 0xff;
      expect(() => decrypt(ciphertext, iv, authTag, key)).toThrow();
    });

    it('produces different ciphertexts for same plaintext (random IV component)', () => {
      const key = Buffer.alloc(32, 0x42);
      const plaintext = Buffer.from('same message');

      const e1 = encrypt(plaintext, key, 0);
      const e2 = encrypt(plaintext, key, 0);

      // IVs should differ due to random bytes
      expect(e1.iv.equals(e2.iv)).toBe(false);
    });
  });

  describe('full handshake crypto', () => {
    it('two sides derive the same session key and can cross-encrypt', () => {
      // Simulate Alice (initiator) and Bob (responder)
      const alice = generateKeyPair();
      const bob = generateKeyPair();

      const aliceNonce = Buffer.alloc(8, 0x11);
      const bobNonce = Buffer.alloc(8, 0x22);

      // Both compute shared secret
      const secretA = computeSharedSecret(alice.ecdh, bob.publicKey);
      const secretB = computeSharedSecret(bob.ecdh, alice.publicKey);
      expect(secretA.equals(secretB)).toBe(true);

      // Both derive session key (initiator nonce first)
      const keyA = deriveSessionKey(secretA, aliceNonce, bobNonce);
      const keyB = deriveSessionKey(secretB, aliceNonce, bobNonce);
      expect(keyA.equals(keyB)).toBe(true);

      // Alice encrypts, Bob decrypts
      const msg1 = Buffer.from('Hello from Alice');
      const enc1 = encrypt(msg1, keyA, 0);
      const dec1 = decrypt(enc1.ciphertext, enc1.iv, enc1.authTag, keyB);
      expect(dec1.equals(msg1)).toBe(true);

      // Bob encrypts, Alice decrypts
      const msg2 = Buffer.from('Hello from Bob');
      const enc2 = encrypt(msg2, keyB, 0);
      const dec2 = decrypt(enc2.ciphertext, enc2.iv, enc2.authTag, keyA);
      expect(dec2.equals(msg2)).toBe(true);
    });
  });
});
