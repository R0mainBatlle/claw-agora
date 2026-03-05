import { AGORA_MAGIC } from '../ble/constants';
import { signBeacon } from '../ble/crypto';
import type { AgoraPost } from './types';

const HEADER_SIZE = 30;
const VERSION = 0x01;

export function encodeAgoraPost(post: AgoraPost, sessionKey?: Buffer): Buffer {
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
  // Signature (sign bytes 0-21)
  if (sessionKey) {
    const sig = signBeacon(buf.subarray(0, 22), sessionKey);
    sig.copy(buf, 22);
  }
  // Content
  contentBuf.copy(buf, HEADER_SIZE);

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
  const signature = Buffer.from(buf.subarray(22, 30));

  if (buf.length < HEADER_SIZE + contentLen) return null;
  const content = buf.subarray(HEADER_SIZE, HEADER_SIZE + contentLen).toString('utf-8');

  return { clawId, timestamp, contentLen, ttlMinutes, seqNo, signature, content };
}

export function encodeAgoraMeta(postCount: number, latestSeq: number, oldestSeq: number, ownerClawId: Buffer): Buffer {
  const buf = Buffer.alloc(16);
  buf.writeUInt32BE(postCount, 0);
  buf.writeUInt32BE(latestSeq, 4);
  buf.writeUInt32BE(oldestSeq, 8);
  ownerClawId.copy(buf, 12);
  return buf;
}

export function decodeAgoraMeta(buf: Buffer): { postCount: number; latestSeq: number; oldestSeq: number; ownerClawId: Buffer } | null {
  if (buf.length < 16) return null;
  return {
    postCount: buf.readUInt32BE(0),
    latestSeq: buf.readUInt32BE(4),
    oldestSeq: buf.readUInt32BE(8),
    ownerClawId: Buffer.from(buf.subarray(12, 16)),
  };
}
