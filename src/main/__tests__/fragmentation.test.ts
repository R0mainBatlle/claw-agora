import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fragmentMessage, Reassembler } from '../ble/fragmentation';

describe('fragmentMessage', () => {
  it('returns a single fragment when data fits in one MTU', () => {
    const data = Buffer.from('hello');
    const fragments = fragmentMessage(data, 100); // 100 - 5 header = 95 payload
    expect(fragments).toHaveLength(1);
    // Single fragment should have both FIRST and LAST flags
    const flags = fragments[0][0];
    expect(flags & 0x01).toBe(0x01); // FIRST
    expect(flags & 0x02).toBe(0x02); // LAST
  });

  it('splits data into correct number of fragments', () => {
    const data = Buffer.alloc(100, 0x42);
    const mtu = 25; // 25 - 5 = 20 payload per fragment → 5 fragments
    const fragments = fragmentMessage(data, mtu);
    expect(fragments).toHaveLength(5);

    // First fragment has FIRST flag only
    expect(fragments[0][0] & 0x01).toBe(0x01);
    expect(fragments[0][0] & 0x02).toBe(0x00);

    // Middle fragments have neither
    expect(fragments[2][0]).toBe(0x00);

    // Last fragment has LAST flag only
    expect(fragments[4][0] & 0x01).toBe(0x00);
    expect(fragments[4][0] & 0x02).toBe(0x02);
  });

  it('handles exact MTU boundary (data exactly fills one fragment)', () => {
    const payloadSize = 20;
    const mtu = payloadSize + 5; // header
    const data = Buffer.alloc(payloadSize, 0xaa);
    const fragments = fragmentMessage(data, mtu);
    expect(fragments).toHaveLength(1);
    expect(fragments[0][0]).toBe(0x03); // FIRST | LAST
  });

  it('throws when MTU is too small', () => {
    expect(() => fragmentMessage(Buffer.from('x'), 5)).toThrow('MTU too small');
    expect(() => fragmentMessage(Buffer.from('x'), 3)).toThrow('MTU too small');
  });

  it('writes correct headers', () => {
    const data = Buffer.alloc(50, 0x42);
    const mtu = 25; // 20 payload → 3 fragments
    const fragments = fragmentMessage(data, mtu);

    for (let i = 0; i < fragments.length; i++) {
      const seq = fragments[i].readUInt16BE(1);
      const totalLen = fragments[i].readUInt16BE(3);
      expect(seq).toBe(i);
      expect(totalLen).toBe(50);
    }
  });
});

describe('Reassembler', () => {
  let reassembler: Reassembler;

  beforeEach(() => {
    reassembler = new Reassembler();
  });

  it('returns payload immediately for single-fragment messages', () => {
    const data = Buffer.from('hello world');
    const fragments = fragmentMessage(data, 100);
    const result = reassembler.addFragment(fragments[0]);
    expect(result).not.toBeNull();
    expect(result!.toString()).toBe('hello world');
  });

  it('reassembles multi-fragment messages', () => {
    const data = Buffer.alloc(50, 0x42);
    const fragments = fragmentMessage(data, 25);
    expect(fragments.length).toBeGreaterThan(1);

    let result: Buffer | null = null;
    for (const frag of fragments) {
      result = reassembler.addFragment(frag);
    }
    expect(result).not.toBeNull();
    expect(result!.equals(data)).toBe(true);
  });

  it('returns null for intermediate fragments', () => {
    const data = Buffer.alloc(100, 0x42);
    const fragments = fragmentMessage(data, 25);

    for (let i = 0; i < fragments.length - 1; i++) {
      expect(reassembler.addFragment(fragments[i])).toBeNull();
    }
    // Last one completes it
    expect(reassembler.addFragment(fragments[fragments.length - 1])).not.toBeNull();
  });

  it('returns null when a fragment is missing', () => {
    const data = Buffer.alloc(60, 0x42);
    const fragments = fragmentMessage(data, 25); // 3 fragments

    // Feed first and last, skip middle
    reassembler.addFragment(fragments[0]);
    const result = reassembler.addFragment(fragments[fragments.length - 1]);
    expect(result).toBeNull();
  });

  it('returns null for buffers smaller than header size', () => {
    expect(reassembler.addFragment(Buffer.alloc(4))).toBeNull();
  });

  it('sweeps stale reassembly buffers', () => {
    vi.useFakeTimers();
    const data = Buffer.alloc(50, 0x42);
    const fragments = fragmentMessage(data, 25);

    // Feed only the first fragment
    reassembler.addFragment(fragments[0]);

    // Advance past timeout
    vi.advanceTimersByTime(6000);
    reassembler.sweep();

    // Now feed remaining — should fail because buffer was swept
    let result: Buffer | null = null;
    for (let i = 1; i < fragments.length; i++) {
      result = reassembler.addFragment(fragments[i]);
    }
    expect(result).toBeNull();

    vi.useRealTimers();
  });

  it('roundtrips small data through fragment/reassemble', () => {
    const original = Buffer.from('The quick brown fox jumps over the lazy dog');
    const fragments = fragmentMessage(original, 20);
    let result: Buffer | null = null;
    for (const frag of fragments) {
      result = reassembler.addFragment(frag);
    }
    expect(result).not.toBeNull();
    expect(result!.equals(original)).toBe(true);
  });

  it('roundtrips large payload (2KB+)', () => {
    const original = Buffer.alloc(2500);
    for (let i = 0; i < original.length; i++) {
      original[i] = i % 256;
    }
    const fragments = fragmentMessage(original, 50);
    expect(fragments.length).toBeGreaterThan(40);

    let result: Buffer | null = null;
    for (const frag of fragments) {
      result = reassembler.addFragment(frag);
    }
    expect(result).not.toBeNull();
    expect(result!.equals(original)).toBe(true);
  });
});
