import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { encodeAgoraPost, decodeAgoraPost, encodeAgoraMeta, decodeAgoraMeta, verifyAgoraPost } from '../agora/codec';
import type { AgoraPost } from '../agora/types';
import { deriveClawId } from '../security/identity';

describe('Agora Post Codec', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const ownerPublicKeyDer = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }));
  const clawId = deriveClawId(ownerPublicKeyDer);

  function makePost(content: string, overrides?: Partial<AgoraPost>): AgoraPost {
    return {
      clawId,
      timestamp: Date.now(),
      contentLen: Buffer.byteLength(content, 'utf-8'),
      ttlMinutes: 30,
      seqNo: 1,
      signature: Buffer.alloc(64),
      content,
      ...overrides,
    };
  }

  it('encode/decode roundtrip (unsigned)', () => {
    const post = makePost('Hello from the agora!');
    const buf = encodeAgoraPost(post);
    const decoded = decodeAgoraPost(buf);

    expect(decoded).not.toBeNull();
    expect(decoded!.clawId.equals(clawId)).toBe(true);
    expect(decoded!.content).toBe('Hello from the agora!');
    expect(decoded!.timestamp).toBe(post.timestamp);
    expect(decoded!.seqNo).toBe(1);
    expect(decoded!.ttlMinutes).toBe(30);
  });

  it('encode/decode roundtrip (signed)', () => {
    const post = makePost('Signed post content');
    const buf = encodeAgoraPost(post, privateKey);
    const decoded = decodeAgoraPost(buf);

    expect(decoded).not.toBeNull();
    expect(decoded!.content).toBe('Signed post content');
    expect(decoded!.signature.some(b => b !== 0)).toBe(true);
    expect(verifyAgoraPost(decoded!, ownerPublicKeyDer)).toBe(true);
  });

  it('returns null for wrong magic', () => {
    const post = makePost('test');
    const buf = encodeAgoraPost(post);
    buf[0] = 0x00; // corrupt magic
    expect(decodeAgoraPost(buf)).toBeNull();
  });

  it('returns null for truncated buffer', () => {
    expect(decodeAgoraPost(Buffer.alloc(10))).toBeNull();
  });

  it('preserves UTF-8 content (emoji, accents, CJK)', () => {
    const content = 'Café ☕ 你好世界 🚀 résumé';
    const post = makePost(content);
    const buf = encodeAgoraPost(post);
    const decoded = decodeAgoraPost(buf);

    expect(decoded).not.toBeNull();
    expect(decoded!.content).toBe(content);
  });

  it('preserves large timestamps', () => {
    const post = makePost('test', { timestamp: 1709654321000 });
    const buf = encodeAgoraPost(post);
    const decoded = decodeAgoraPost(buf);
    expect(decoded!.timestamp).toBe(1709654321000);
  });

  it('preserves various seqNo values', () => {
    for (const seqNo of [0, 1, 255, 65535, 0xffffff]) {
      const post = makePost('test', { seqNo });
      const buf = encodeAgoraPost(post);
      const decoded = decodeAgoraPost(buf);
      expect(decoded!.seqNo).toBe(seqNo);
    }
  });
});

describe('Agora Meta Codec', () => {
  it('encode/decode roundtrip', () => {
    const { publicKey } = crypto.generateKeyPairSync('ed25519');
    const ownerPublicKeyDer = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }));
    const ownerClawId = deriveClawId(ownerPublicKeyDer);
    const buf = encodeAgoraMeta(5, 10, 6, ownerClawId, ownerPublicKeyDer);
    const meta = decodeAgoraMeta(buf);

    expect(meta).not.toBeNull();
    expect(meta!.postCount).toBe(5);
    expect(meta!.latestSeq).toBe(10);
    expect(meta!.oldestSeq).toBe(6);
    expect(meta!.ownerClawId.equals(ownerClawId)).toBe(true);
    expect(meta!.ownerPublicKeyDer.equals(ownerPublicKeyDer)).toBe(true);
  });

  it('returns null for truncated buffer', () => {
    expect(decodeAgoraMeta(Buffer.alloc(10))).toBeNull();
  });

  it('handles zero values', () => {
    const { publicKey } = crypto.generateKeyPairSync('ed25519');
    const ownerPublicKeyDer = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }));
    const ownerClawId = deriveClawId(ownerPublicKeyDer);
    const buf = encodeAgoraMeta(0, 0, 0, ownerClawId, ownerPublicKeyDer);
    const meta = decodeAgoraMeta(buf);

    expect(meta!.postCount).toBe(0);
    expect(meta!.latestSeq).toBe(0);
    expect(meta!.oldestSeq).toBe(0);
  });
});
