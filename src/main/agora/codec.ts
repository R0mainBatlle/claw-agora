import crypto from 'node:crypto';
import { AGORA_MAGIC } from '../ble/constants';
import type { AgoraPost } from './types';
import { deriveClawId, signPayload, verifyPayload } from '../security/identity';

const PREFIX_SIZE = 22;
const SIGNATURE_SIZE = 64;
const HEADER_SIZE = PREFIX_SIZE + SIGNATURE_SIZE;
const VERSION = 0x01;

function buildSigningPayload(prefix: Buffer, contentBuf: Buffer): Buffer {
  return Buffer.concat([prefix, contentBuf]);
}

export function encodeAgoraPost(post: AgoraPost, signingKey?: crypto.KeyObject): Buffer {
  const contentBuf = Buffer.from(post.content, 'utf-8');
  const buf = Buffer.alloc(HEADER_SIZE + contentBuf.length);

  // Magic
  AGORA_MAGIC.copy(buf, 0);
  // Version
  buf[2] = VERSION;
  // ClawId
  post.clawId.copy(buf, 3);
  // Timestamp (uint64 BE — use two uint32s for compatibility)
  const high = Math.floor(post.timestamp / 0x100000000);
  const low = post.timestamp >>> 0;
  buf.writeUInt32BE(high, 7);
  buf.writeUInt32BE(low, 11);
  // Content length
  buf.writeUInt16BE(contentBuf.length, 15);
  // TTL
  buf[17] = post.ttlMinutes;
  // SeqNo
  buf.writeUInt32BE(post.seqNo, 18);
  // Content
  contentBuf.copy(buf, HEADER_SIZE);

  // Signature covers the immutable header prefix + content.
  if (signingKey) {
    const sig = signPayload(buildSigningPayload(buf.subarray(0, PREFIX_SIZE), contentBuf), signingKey);
    sig.copy(buf, PREFIX_SIZE);
  }

  return buf;
}

export function decodeAgoraPost(buf: Buffer): AgoraPost | null {
  if (buf.length < HEADER_SIZE) return null;
  if (buf[0] !== AGORA_MAGIC[0] || buf[1] !== AGORA_MAGIC[1]) return null;
  if (buf[2] !== VERSION) return null;

  const clawId = Buffer.from(buf.subarray(3, 7));
  const high = buf.readUInt32BE(7);
  const low = buf.readUInt32BE(11);
  const timestamp = high * 0x100000000 + low;
  const contentLen = buf.readUInt16BE(15);
  const ttlMinutes = buf[17];
  const seqNo = buf.readUInt32BE(18);
  const signature = Buffer.from(buf.subarray(PREFIX_SIZE, HEADER_SIZE));

  if (buf.length < HEADER_SIZE + contentLen) return null;
  const content = buf.subarray(HEADER_SIZE, HEADER_SIZE + contentLen).toString('utf-8');

  return { clawId, timestamp, contentLen, ttlMinutes, seqNo, signature, content };
}

export function verifyAgoraPost(post: AgoraPost, ownerPublicKeyDer: Buffer): boolean {
  if (post.signature.length !== SIGNATURE_SIZE) return false;
  if (!post.clawId.equals(deriveClawId(ownerPublicKeyDer))) return false;

  const prefix = Buffer.alloc(PREFIX_SIZE);
  AGORA_MAGIC.copy(prefix, 0);
  prefix[2] = VERSION;
  post.clawId.copy(prefix, 3);
  const high = Math.floor(post.timestamp / 0x100000000);
  const low = post.timestamp >>> 0;
  prefix.writeUInt32BE(high, 7);
  prefix.writeUInt32BE(low, 11);
  prefix.writeUInt16BE(Buffer.byteLength(post.content, 'utf-8'), 15);
  prefix[17] = post.ttlMinutes;
  prefix.writeUInt32BE(post.seqNo, 18);
  const contentBuf = Buffer.from(post.content, 'utf-8');

  return verifyPayload(buildSigningPayload(prefix, contentBuf), post.signature, ownerPublicKeyDer);
}

export function encodeAgoraMeta(
  postCount: number,
  latestSeq: number,
  oldestSeq: number,
  ownerClawId: Buffer,
  ownerPublicKeyDer: Buffer,
): Buffer {
  const buf = Buffer.alloc(18 + ownerPublicKeyDer.length);
  buf.writeUInt32BE(postCount, 0);
  buf.writeUInt32BE(latestSeq, 4);
  buf.writeUInt32BE(oldestSeq, 8);
  ownerClawId.copy(buf, 12);
  buf.writeUInt16BE(ownerPublicKeyDer.length, 16);
  ownerPublicKeyDer.copy(buf, 18);
  return buf;
}

export function decodeAgoraMeta(
  buf: Buffer,
): { postCount: number; latestSeq: number; oldestSeq: number; ownerClawId: Buffer; ownerPublicKeyDer: Buffer } | null {
  if (buf.length < 18) return null;
  const ownerPublicKeyLen = buf.readUInt16BE(16);
  if (buf.length < 18 + ownerPublicKeyLen) return null;
  return {
    postCount: buf.readUInt32BE(0),
    latestSeq: buf.readUInt32BE(4),
    oldestSeq: buf.readUInt32BE(8),
    ownerClawId: Buffer.from(buf.subarray(12, 16)),
    ownerPublicKeyDer: Buffer.from(buf.subarray(18, 18 + ownerPublicKeyLen)),
  };
}
