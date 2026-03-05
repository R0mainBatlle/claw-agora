import crypto from 'crypto';
import { WHISPER_DATA_MAGIC } from '../ble/constants';
import { ControlType, CloseReason, RejectReason } from './types';

// --- Control Messages (on Control characteristic) ---

export function encodeHello(senderClawId: Buffer, nonce: Buffer, maxVersion: number = 1): Buffer {
  const buf = Buffer.alloc(14);
  buf[0] = ControlType.HELLO;
  senderClawId.copy(buf, 1);
  nonce.copy(buf, 5); // 8 bytes
  buf[13] = maxVersion;
  return buf;
}

export function encodeHelloAck(senderClawId: Buffer, nonce: Buffer, agreedVersion: number = 1): Buffer {
  const buf = Buffer.alloc(14);
  buf[0] = ControlType.HELLO_ACK;
  senderClawId.copy(buf, 1);
  nonce.copy(buf, 5);
  buf[13] = agreedVersion;
  return buf;
}

export function encodeKeyExchange(senderClawId: Buffer, publicKey: Buffer): Buffer {
  const buf = Buffer.alloc(70);
  buf[0] = ControlType.KEY_EXCHANGE;
  senderClawId.copy(buf, 1);
  publicKey.copy(buf, 5); // 65 bytes P-256
  return buf;
}

export function encodeVerify(senderClawId: Buffer, proof: Buffer): Buffer {
  const buf = Buffer.alloc(37);
  buf[0] = ControlType.VERIFY;
  senderClawId.copy(buf, 1);
  proof.copy(buf, 5); // 32 bytes HMAC
  return buf;
}

export function encodeSessionOk(senderClawId: Buffer): Buffer {
  const buf = Buffer.alloc(5);
  buf[0] = ControlType.SESSION_OK;
  senderClawId.copy(buf, 1);
  return buf;
}

export function encodeClose(senderClawId: Buffer, reason: CloseReason): Buffer {
  const buf = Buffer.alloc(6);
  buf[0] = ControlType.CLOSE;
  senderClawId.copy(buf, 1);
  buf[5] = reason;
  return buf;
}

export function encodeReject(senderClawId: Buffer, reason: RejectReason): Buffer {
  const buf = Buffer.alloc(6);
  buf[0] = ControlType.REJECT;
  senderClawId.copy(buf, 1);
  buf[5] = reason;
  return buf;
}

export interface ControlMessage {
  type: ControlType;
  senderClawId: Buffer;
  nonce?: Buffer;
  version?: number;
  publicKey?: Buffer;
  proof?: Buffer;
  reason?: number;
}

export function decodeControlMessage(buf: Buffer): ControlMessage | null {
  if (buf.length < 5) return null;

  const type = buf[0] as ControlType;
  const senderClawId = Buffer.from(buf.subarray(1, 5));

  switch (type) {
    case ControlType.HELLO:
    case ControlType.HELLO_ACK:
      if (buf.length < 14) return null;
      return { type, senderClawId, nonce: Buffer.from(buf.subarray(5, 13)), version: buf[13] };

    case ControlType.KEY_EXCHANGE:
      if (buf.length < 70) return null;
      return { type, senderClawId, publicKey: Buffer.from(buf.subarray(5, 70)) };

    case ControlType.VERIFY:
      if (buf.length < 37) return null;
      return { type, senderClawId, proof: Buffer.from(buf.subarray(5, 37)) };

    case ControlType.SESSION_OK:
      return { type, senderClawId };

    case ControlType.CLOSE:
    case ControlType.REJECT:
      if (buf.length < 6) return null;
      return { type, senderClawId, reason: buf[5] };

    default:
      return null;
  }
}

// --- Data Frames (on TX/RX characteristics) ---

const DATA_HEADER_SIZE = 20; // magic(2) + seqNo(4) + payloadLen(2) + iv(12)
const AUTH_TAG_SIZE = 16;

export function encodeDataFrame(
  seqNo: number,
  iv: Buffer,
  ciphertext: Buffer,
  authTag: Buffer,
): Buffer {
  const buf = Buffer.alloc(DATA_HEADER_SIZE + ciphertext.length + AUTH_TAG_SIZE);
  WHISPER_DATA_MAGIC.copy(buf, 0);
  buf.writeUInt32BE(seqNo, 2);
  buf.writeUInt16BE(ciphertext.length, 6);
  iv.copy(buf, 8);
  ciphertext.copy(buf, DATA_HEADER_SIZE);
  authTag.copy(buf, DATA_HEADER_SIZE + ciphertext.length);
  return buf;
}

export interface DataFrame {
  seqNo: number;
  iv: Buffer;
  ciphertext: Buffer;
  authTag: Buffer;
}

export function decodeDataFrame(buf: Buffer): DataFrame | null {
  if (buf.length < DATA_HEADER_SIZE + AUTH_TAG_SIZE) return null;
  if (buf[0] !== WHISPER_DATA_MAGIC[0] || buf[1] !== WHISPER_DATA_MAGIC[1]) return null;

  const seqNo = buf.readUInt32BE(2);
  const payloadLen = buf.readUInt16BE(6);
  const iv = Buffer.from(buf.subarray(8, 20));

  if (buf.length < DATA_HEADER_SIZE + payloadLen + AUTH_TAG_SIZE) return null;

  const ciphertext = Buffer.from(buf.subarray(DATA_HEADER_SIZE, DATA_HEADER_SIZE + payloadLen));
  const authTag = Buffer.from(buf.subarray(DATA_HEADER_SIZE + payloadLen, DATA_HEADER_SIZE + payloadLen + AUTH_TAG_SIZE));

  return { seqNo, iv, ciphertext, authTag };
}
