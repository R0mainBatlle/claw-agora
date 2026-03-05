import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EncounterPolicy } from '../encounter/policy';
import type { EncounterEvent, NearbyPeer } from '../encounter/types';
import type { EncounterPolicyConfig } from '../store/settings';

function makePeer(overrides?: Partial<NearbyPeer>): NearbyPeer {
  return {
    peripheralId: 'test-peripheral',
    clawId: 'a1b2c3d4',
    intentHash: 0x12345678,
    flags: {
      acceptingEncounters: true,
      whisperCapable: true,
      humanPresent: true,
    },
    rssi: -50,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    ...overrides,
  };
}

function makeEvent(type: EncounterEvent['type'], peerOverrides?: Partial<NearbyPeer>, timestamp?: number): EncounterEvent {
  const peer = makePeer(peerOverrides);
  return { type, peer, timestamp: timestamp ?? Date.now() };
}

const DEFAULT_CONFIG: EncounterPolicyConfig = {
  enabled: true,
  minRssi: -75,
  minDwellMs: 5000,
  cooldownMs: 300000,
  maxPerHour: 20,
  requireHumanPresent: false,
};

describe('EncounterPolicy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('disabled policy denies everything', () => {
    const policy = new EncounterPolicy({ ...DEFAULT_CONFIG, enabled: false });
    const result = policy.evaluate(makeEvent('encounter-start'));
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('policy-disabled');
  });

  it('no dwell required (minDwellMs=0) allows on encounter-start', () => {
    const policy = new EncounterPolicy({ ...DEFAULT_CONFIG, minDwellMs: 0 });
    const result = policy.evaluate(makeEvent('encounter-start'));
    expect(result.allow).toBe(true);
  });

  it('dwell: encounter-start begins pending period', () => {
    const policy = new EncounterPolicy(DEFAULT_CONFIG);
    const result = policy.evaluate(makeEvent('encounter-start'));
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('dwell-pending');
  });

  it('dwell: update before threshold stays pending', () => {
    const policy = new EncounterPolicy(DEFAULT_CONFIG);
    const now = Date.now();
    const peer = makePeer({ firstSeen: now });

    policy.evaluate({ type: 'encounter-start', peer, timestamp: now });

    vi.advanceTimersByTime(2000); // only 2s, need 5s
    const result = policy.evaluate({ type: 'encounter-update', peer, timestamp: Date.now() });
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('dwell-pending');
  });

  it('dwell: update after threshold allows', () => {
    const policy = new EncounterPolicy(DEFAULT_CONFIG);
    const now = Date.now();
    const peer = makePeer({ firstSeen: now });

    policy.evaluate({ type: 'encounter-start', peer, timestamp: now });

    vi.advanceTimersByTime(6000); // past 5s threshold
    const result = policy.evaluate({ type: 'encounter-update', peer, timestamp: Date.now() });
    expect(result.allow).toBe(true);
  });

  it('RSSI below minRssi denies', () => {
    const policy = new EncounterPolicy({ ...DEFAULT_CONFIG, minDwellMs: 0 });
    const result = policy.evaluate(makeEvent('encounter-start', { rssi: -80 }));
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('rssi-too-low');
  });

  it('requireHumanPresent + no human denies', () => {
    const policy = new EncounterPolicy({ ...DEFAULT_CONFIG, minDwellMs: 0, requireHumanPresent: true });
    const result = policy.evaluate(makeEvent('encounter-start', {
      flags: { acceptingEncounters: true, whisperCapable: true, humanPresent: false },
    }));
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('no-human-present');
  });

  it('cooldown: same peer within window denies', () => {
    const policy = new EncounterPolicy({ ...DEFAULT_CONFIG, minDwellMs: 0, cooldownMs: 60000 });

    // First encounter — allow
    const event1 = makeEvent('encounter-start', { clawId: 'aabbccdd' });
    expect(policy.evaluate(event1).allow).toBe(true);

    // Same peer again immediately — deny
    vi.advanceTimersByTime(1000);
    const event2 = makeEvent('encounter-start', { clawId: 'aabbccdd' });
    expect(policy.evaluate(event2).allow).toBe(false);
    expect(policy.evaluate(event2).reason).toBe('cooldown');
  });

  it('cooldown: same peer after window allows', () => {
    const policy = new EncounterPolicy({ ...DEFAULT_CONFIG, minDwellMs: 0, cooldownMs: 60000 });

    const event1 = makeEvent('encounter-start', { clawId: 'aabbccdd' });
    expect(policy.evaluate(event1).allow).toBe(true);

    vi.advanceTimersByTime(61000); // past cooldown
    const event2 = makeEvent('encounter-start', { clawId: 'aabbccdd' });
    expect(policy.evaluate(event2).allow).toBe(true);
  });

  it('rate limit: exceed maxPerHour denies', () => {
    const policy = new EncounterPolicy({ ...DEFAULT_CONFIG, minDwellMs: 0, maxPerHour: 3 });

    // 3 different peers in quick succession
    for (let i = 0; i < 3; i++) {
      const result = policy.evaluate(makeEvent('encounter-start', { clawId: `peer${i}000` }));
      expect(result.allow).toBe(true);
    }

    // 4th should be rate limited
    const result = policy.evaluate(makeEvent('encounter-start', { clawId: 'peer3000' }));
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('rate-limited');
  });

  it('rate limit: resets after an hour', () => {
    const policy = new EncounterPolicy({ ...DEFAULT_CONFIG, minDwellMs: 0, maxPerHour: 2 });

    policy.evaluate(makeEvent('encounter-start', { clawId: 'peer0000' }));
    policy.evaluate(makeEvent('encounter-start', { clawId: 'peer1000' }));

    // Rate limited
    expect(policy.evaluate(makeEvent('encounter-start', { clawId: 'peer2000' })).allow).toBe(false);

    // Advance past hour
    vi.advanceTimersByTime(3601_000);

    expect(policy.evaluate(makeEvent('encounter-start', { clawId: 'peer3000' })).allow).toBe(true);
  });

  it('encounter-end denies and cleans up pending dwell', () => {
    const policy = new EncounterPolicy(DEFAULT_CONFIG);
    const now = Date.now();
    const peer = makePeer({ firstSeen: now });

    policy.evaluate({ type: 'encounter-start', peer, timestamp: now });

    // End before dwell completes
    const endResult = policy.evaluate({ type: 'encounter-end', peer, timestamp: now + 1000 });
    expect(endResult.allow).toBe(false);
    expect(endResult.reason).toBe('encounter-end');

    // Future update for same peer should fail (no pending dwell)
    vi.advanceTimersByTime(10000);
    const updateResult = policy.evaluate({ type: 'encounter-update', peer, timestamp: Date.now() });
    expect(updateResult.allow).toBe(false);
    expect(updateResult.reason).toBe('already-delivered-or-no-start');
  });

  it('combined: dwell OK but RSSI too low denies', () => {
    const policy = new EncounterPolicy(DEFAULT_CONFIG);
    const now = Date.now();
    const peer = makePeer({ firstSeen: now, rssi: -80 }); // below -75 threshold

    policy.evaluate({ type: 'encounter-start', peer, timestamp: now });

    vi.advanceTimersByTime(6000);
    const result = policy.evaluate({ type: 'encounter-update', peer, timestamp: Date.now() });
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('rssi-too-low');
  });
});
