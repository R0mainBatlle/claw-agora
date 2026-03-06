import { describe, it, expect } from 'vitest';
import {
  encodeHello, encodeHelloAck, encodeKeyExchange, encodeVerify,
  encodeSessionOk, encodeClose, encodeReject,
  decodeControlMessage,
  encodeDataFrame, decodeDataFrame,
} from '../whisper/codec';
import { ControlType, CloseReason, RejectReason } from '../whisper/types';

describe('Whisper Control Codec', () => {
  const clawId = Buffer.from('a1b2c3d4', 'hex');

  it('HELLO encode/decode roundtrip', () => {
    const nonce = Buffer.from('0102030405060708', 'hex');
    const buf = encodeHello(clawId, nonce, 1);
    const msg = decodeControlMessage(buf);

    expect(msg).not.toBeNull();
    expect(msg!.type).toBe(ControlType.HELLO);
    expect(msg!.senderClawId.equals(clawId)).toBe(true);
    expect(msg!.nonce!.equals(nonce)).toBe(true);
    expect(msg!.version).toBe(1);
  });

  it('HELLO_ACK encode/decode roundtrip', () => {
    const nonce = Buffer.from('aabbccdd11223344', 'hex');
    const buf = encodeHelloAck(clawId, nonce, 1);
    const msg = decodeControlMessage(buf);

    expect(msg).not.toBeNull();
    expect(msg!.type).toBe(ControlType.HELLO_ACK);
    expect(msg!.senderClawId.equals(clawId)).toBe(true);
    expect(msg!.nonce!.equals(nonce)).toBe(true);
    expect(msg!.version).toBe(1);
  });

  it('KEY_EXCHANGE encode/decode roundtrip', () => {
    const publicKey = Buffer.alloc(65, 0x04); // uncompressed P-256 starts with 0x04
    const identityPublicKey = Buffer.alloc(44, 0x11);
    const identitySignature = Buffer.alloc(64, 0x22);
    const buf = encodeKeyExchange(clawId, publicKey, identityPublicKey, identitySignature);
    const msg = decodeControlMessage(buf);

    expect(msg).not.toBeNull();
    expect(msg!.type).toBe(ControlType.KEY_EXCHANGE);
    expect(msg!.senderClawId.equals(clawId)).toBe(true);
    expect(msg!.publicKey!.length).toBe(65);
    expect(msg!.publicKey!.equals(publicKey)).toBe(true);
    expect(msg!.identityPublicKey!.equals(identityPublicKey)).toBe(true);
    expect(msg!.identitySignature!.equals(identitySignature)).toBe(true);
  });

  it('VERIFY encode/decode roundtrip', () => {
    const proof = Buffer.alloc(32, 0xab);
    const buf = encodeVerify(clawId, proof);
    const msg = decodeControlMessage(buf);

    expect(msg).not.toBeNull();
    expect(msg!.type).toBe(ControlType.VERIFY);
    expect(msg!.senderClawId.equals(clawId)).toBe(true);
    expect(msg!.proof!.length).toBe(32);
    expect(msg!.proof!.equals(proof)).toBe(true);
  });

  it('SESSION_OK encode/decode roundtrip', () => {
    const buf = encodeSessionOk(clawId);
    const msg = decodeControlMessage(buf);

    expect(msg).not.toBeNull();
    expect(msg!.type).toBe(ControlType.SESSION_OK);
    expect(msg!.senderClawId.equals(clawId)).toBe(true);
  });

  it('CLOSE encode/decode roundtrip', () => {
    const buf = encodeClose(clawId, CloseReason.TIMEOUT);
    const msg = decodeControlMessage(buf);

    expect(msg).not.toBeNull();
    expect(msg!.type).toBe(ControlType.CLOSE);
    expect(msg!.senderClawId.equals(clawId)).toBe(true);
    expect(msg!.reason).toBe(CloseReason.TIMEOUT);
  });

  it('REJECT encode/decode roundtrip', () => {
    const buf = encodeReject(clawId, RejectReason.BUSY);
    const msg = decodeControlMessage(buf);

    expect(msg).not.toBeNull();
    expect(msg!.type).toBe(ControlType.REJECT);
    expect(msg!.senderClawId.equals(clawId)).toBe(true);
    expect(msg!.reason).toBe(RejectReason.BUSY);
  });

  it('returns null for truncated buffer', () => {
    expect(decodeControlMessage(Buffer.alloc(3))).toBeNull();
    // HELLO needs 14 bytes
    const hello = encodeHello(clawId, Buffer.alloc(8));
    expect(decodeControlMessage(hello.subarray(0, 10))).toBeNull();
  });

  it('returns null for unknown control type', () => {
    const buf = Buffer.alloc(14);
    buf[0] = 0xfe; // unknown type
    expect(decodeControlMessage(buf)).toBeNull();
  });
});

describe('Whisper DataFrame Codec', () => {
  it('encode/decode roundtrip', () => {
    const iv = Buffer.alloc(12, 0x01);
    const ciphertext = Buffer.from('encrypted data here');
    const authTag = Buffer.alloc(16, 0xaa);
    const seqNo = 42;

    const buf = encodeDataFrame(seqNo, iv, ciphertext, authTag);
    const frame = decodeDataFrame(buf);

    expect(frame).not.toBeNull();
    expect(frame!.seqNo).toBe(42);
    expect(frame!.iv.equals(iv)).toBe(true);
    expect(frame!.ciphertext.equals(ciphertext)).toBe(true);
    expect(frame!.authTag.equals(authTag)).toBe(true);
  });

  it('returns null for wrong magic', () => {
    const iv = Buffer.alloc(12);
    const ciphertext = Buffer.from('data');
    const authTag = Buffer.alloc(16);
    const buf = encodeDataFrame(0, iv, ciphertext, authTag);
    // Corrupt magic
    buf[0] = 0x00;
    expect(decodeDataFrame(buf)).toBeNull();
  });

  it('returns null for truncated buffer', () => {
    expect(decodeDataFrame(Buffer.alloc(10))).toBeNull();
  });

  it('handles empty ciphertext', () => {
    const iv = Buffer.alloc(12);
    const ciphertext = Buffer.alloc(0);
    const authTag = Buffer.alloc(16);

    const buf = encodeDataFrame(0, iv, ciphertext, authTag);
    const frame = decodeDataFrame(buf);

    expect(frame).not.toBeNull();
    expect(frame!.ciphertext.length).toBe(0);
  });

  it('handles large sequence numbers', () => {
    const iv = Buffer.alloc(12);
    const ciphertext = Buffer.from('x');
    const authTag = Buffer.alloc(16);

    const buf = encodeDataFrame(0xffffffff, iv, ciphertext, authTag);
    const frame = decodeDataFrame(buf);
    expect(frame!.seqNo).toBe(0xffffffff);
  });
});
