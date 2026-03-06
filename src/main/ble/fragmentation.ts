/**
 * Application-level BLE message fragmentation and reassembly.
 *
 * Fragment header (7 bytes):
 *   Byte 0:     flags (bit 0 = first, bit 1 = last)
 *   Bytes 1-2:  messageId (uint16 BE)
 *   Bytes 3-4:  fragmentSeq (uint16 BE, 0-based)
 *   Bytes 5-6:  totalLen (uint16 BE, only meaningful in first fragment)
 */

const FLAG_FIRST = 0x01;
const FLAG_LAST = 0x02;
const HEADER_SIZE = 7;
const REASSEMBLY_TIMEOUT_MS = 5000;
let nextMessageId = 1;

function allocateMessageId(): number {
  const messageId = nextMessageId;
  nextMessageId = (nextMessageId + 1) & 0xffff;
  if (nextMessageId === 0) nextMessageId = 1;
  return messageId;
}

export function fragmentMessage(data: Buffer, mtu: number): Buffer[] {
  const payloadPerFragment = mtu - HEADER_SIZE;
  if (payloadPerFragment <= 0) throw new Error(`MTU too small: ${mtu}`);

  const totalFragments = Math.ceil(data.length / payloadPerFragment);
  const fragments: Buffer[] = [];
  const messageId = allocateMessageId();

  for (let i = 0; i < totalFragments; i++) {
    const offset = i * payloadPerFragment;
    const chunk = data.subarray(offset, offset + payloadPerFragment);

    let flags = 0;
    if (i === 0) flags |= FLAG_FIRST;
    if (i === totalFragments - 1) flags |= FLAG_LAST;

    const header = Buffer.alloc(HEADER_SIZE);
    header[0] = flags;
    header.writeUInt16BE(messageId, 1);
    header.writeUInt16BE(i, 3);
    header.writeUInt16BE(data.length, 5);

    fragments.push(Buffer.concat([header, chunk]));
  }

  return fragments;
}

export class Reassembler {
  private buffers = new Map<number, { totalLen: number; fragments: Map<number, Buffer>; firstSeen: number }>();

  /**
   * Feed a fragment. Returns the complete reassembled message when all fragments
   * have arrived, or null if still waiting.
   */
  addFragment(data: Buffer): Buffer | null {
    if (data.length < HEADER_SIZE) return null;

    const flags = data[0];
    const messageId = data.readUInt16BE(1);
    const seq = data.readUInt16BE(3);
    const totalLen = data.readUInt16BE(5);
    const payload = data.subarray(HEADER_SIZE);

    // Single-fragment message (both first and last)
    if ((flags & FLAG_FIRST) && (flags & FLAG_LAST)) {
      return payload;
    }

    const isFirst = !!(flags & FLAG_FIRST);
    const isLast = !!(flags & FLAG_LAST);

    // Use totalLen from first fragment as the buffer key
    if (isFirst) {
      this.buffers.set(messageId, {
        totalLen,
        fragments: new Map([[seq, payload]]),
        firstSeen: Date.now(),
      });
      return null;
    }

    // Find matching reassembly buffer by checking all active buffers
    // (use totalLen from header — it's the same across all fragments of a message)
    const entry = this.buffers.get(messageId);
    if (!entry) return null;
    if (entry.totalLen !== totalLen) return null;

    entry.fragments.set(seq, payload);

    if (!isLast) return null;

    // Last fragment arrived — reassemble
    const payloadPerFragment = data.length - HEADER_SIZE; // approximate from this fragment
    const totalFragments = seq + 1;
    const parts: Buffer[] = [];

    for (let i = 0; i < totalFragments; i++) {
      const part = entry.fragments.get(i);
      if (!part) {
        // Missing fragment — can't reassemble yet
        return null;
      }
      parts.push(part);
    }

    this.buffers.delete(messageId);
    const result = Buffer.concat(parts);
    return result.subarray(0, entry.totalLen);
  }

  /** Remove stale reassembly buffers older than the timeout. */
  sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.buffers) {
      if (now - entry.firstSeen > REASSEMBLY_TIMEOUT_MS) {
        this.buffers.delete(key);
      }
    }
  }
}
