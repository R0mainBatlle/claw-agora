import { crc32 } from 'crc';
import crypto from 'node:crypto';
import { MAGIC, VERSION, BEACON_SIZE } from './constants';

export interface BeaconFlags {
  acceptingEncounters: boolean;
  whisperCapable: boolean;
  humanPresent: boolean;
}

export interface BeaconPayload {
  magic: Buffer;
  version: number;
  flags: BeaconFlags;
  clawId: Buffer;       // 4 bytes
  intentHash: number;   // uint32
  nonce: Buffer;        // 4 bytes
  signature: Buffer;    // 8 bytes
}

export function encodeFlags(flags: BeaconFlags): number {
  let byte = 0;
  if (flags.acceptingEncounters) byte |= 0x01;
  if (flags.whisperCapable) byte |= 0x02;
  if (flags.humanPresent) byte |= 0x04;
  return byte;
}

export function decodeFlags(byte: number): BeaconFlags {
  return {
    acceptingEncounters: (byte & 0x01) !== 0,
    whisperCapable: (byte & 0x02) !== 0,
    humanPresent: (byte & 0x04) !== 0,
  };
}

export function computeIntentHash(tags: string[]): number {
  const sorted = [...tags].sort();
  const joined = sorted.join(',');
  return crc32(Buffer.from(joined, 'utf-8'));
}

export function encodeBeacon(payload: BeaconPayload): Buffer {
  const buf = Buffer.alloc(BEACON_SIZE);
  payload.magic.copy(buf, 0);
  buf.writeUInt8(payload.version, 2);
  buf.writeUInt8(encodeFlags(payload.flags), 3);
  payload.clawId.copy(buf, 4);
  buf.writeUInt32BE(payload.intentHash, 8);
  payload.nonce.copy(buf, 12);
  payload.signature.copy(buf, 16);
  return buf;
}

export function decodeBeacon(buf: Buffer): BeaconPayload | null {
  if (buf.length !== BEACON_SIZE) return null;
  if (buf[0] !== MAGIC[0] || buf[1] !== MAGIC[1]) return null;

  const version = buf.readUInt8(2);
  if (version !== VERSION) return null;

  return {
    magic: buf.subarray(0, 2),
    version,
    flags: decodeFlags(buf.readUInt8(3)),
    clawId: buf.subarray(4, 8),
    intentHash: buf.readUInt32BE(8),
    nonce: buf.subarray(12, 16),
    signature: buf.subarray(16, 24),
  };
}

export function createLocalBeacon(
  clawId: Buffer,
  tags: string[],
  flags: BeaconFlags,
): Buffer {
  const nonce = crypto.randomBytes(4);
  const signature = Buffer.alloc(8, 0); // Phase 1: no real signature
  return encodeBeacon({
    magic: MAGIC,
    version: VERSION,
    flags,
    clawId,
    intentHash: computeIntentHash(tags),
    nonce,
    signature,
  });
}
