import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgoraRingBuffer } from '../agora/ring-buffer';

describe('AgoraRingBuffer', () => {
  const clawId = Buffer.from('a1b2c3d4', 'hex');

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('add returns incrementing seqNo', () => {
    const buf = new AgoraRingBuffer();
    expect(buf.add(clawId, 'post 1', 30)).toBe(1);
    expect(buf.add(clawId, 'post 2', 30)).toBe(2);
    expect(buf.add(clawId, 'post 3', 30)).toBe(3);
  });

  it('evicts oldest when exceeding maxSize', () => {
    const buf = new AgoraRingBuffer(4);
    buf.add(clawId, 'a', 30); // seq 1
    buf.add(clawId, 'b', 30); // seq 2
    buf.add(clawId, 'c', 30); // seq 3
    buf.add(clawId, 'd', 30); // seq 4
    buf.add(clawId, 'e', 30); // seq 5 — should evict seq 1

    expect(buf.count).toBe(4);
    expect(buf.oldestSeq).toBe(2);
    expect(buf.latestSeq).toBe(5);
  });

  it('getPostsSince filters correctly', () => {
    const buf = new AgoraRingBuffer();
    buf.add(clawId, 'a', 30); // seq 1
    buf.add(clawId, 'b', 30); // seq 2
    buf.add(clawId, 'c', 30); // seq 3

    const posts = buf.getPostsSince(1);
    expect(posts).toHaveLength(2);
    expect(posts[0].content).toBe('b');
    expect(posts[1].content).toBe('c');
  });

  it('getPostsSince(0) returns all', () => {
    const buf = new AgoraRingBuffer();
    buf.add(clawId, 'a', 30);
    buf.add(clawId, 'b', 30);
    expect(buf.getPostsSince(0)).toHaveLength(2);
  });

  it('getAll returns a defensive copy', () => {
    const buf = new AgoraRingBuffer();
    buf.add(clawId, 'a', 30);
    buf.add(clawId, 'b', 30);

    const all = buf.getAll();
    expect(all).toHaveLength(2);

    // Mutate the returned array
    all.pop();
    expect(buf.getAll()).toHaveLength(2); // original unaffected
  });

  it('sweep removes expired posts', () => {
    const buf = new AgoraRingBuffer();
    buf.add(clawId, 'short-lived', 1); // 1 minute TTL

    // Advance past TTL
    vi.advanceTimersByTime(61_000);
    const removed = buf.sweep();
    expect(removed).toBe(1);
    expect(buf.count).toBe(0);
  });

  it('sweep keeps non-expired posts', () => {
    const buf = new AgoraRingBuffer();
    buf.add(clawId, 'long-lived', 60); // 60 minute TTL

    vi.advanceTimersByTime(30_000); // 30 seconds
    const removed = buf.sweep();
    expect(removed).toBe(0);
    expect(buf.count).toBe(1);
  });

  it('sweep handles mixed TTLs', () => {
    const buf = new AgoraRingBuffer();
    buf.add(clawId, 'short', 1); // 1 min
    buf.add(clawId, 'long', 60); // 60 min

    vi.advanceTimersByTime(2 * 60_000); // 2 minutes
    const removed = buf.sweep();
    expect(removed).toBe(1);
    expect(buf.count).toBe(1);
    expect(buf.getAll()[0].content).toBe('long');
  });

  it('empty buffer has correct properties', () => {
    const buf = new AgoraRingBuffer();
    expect(buf.count).toBe(0);
    expect(buf.latestSeq).toBe(0);
    expect(buf.oldestSeq).toBe(0);
    expect(buf.getAll()).toHaveLength(0);
  });
});
