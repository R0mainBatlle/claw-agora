import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EncounterManager } from '../encounter/manager';
import type { DiscoveredBeacon } from '../ble/scanner';
import type { EncounterEvent } from '../encounter/types';

function makeBeacon(clawIdHex: string, overrides?: Partial<{
  peripheralId: string;
  rssi: number;
  timestamp: number;
  flags: { acceptingEncounters: boolean; whisperCapable: boolean; humanPresent: boolean };
}>): DiscoveredBeacon {
  return {
    peripheralId: overrides?.peripheralId ?? 'periph-1',
    rssi: overrides?.rssi ?? -50,
    payload: {
      magic: Buffer.from([0xa0, 0xba]),
      version: 1,
      flags: overrides?.flags ?? {
        acceptingEncounters: true,
        whisperCapable: true,
        humanPresent: true,
      },
      clawId: Buffer.from(clawIdHex, 'hex'),
      intentHash: 0x12345678,
      nonce: Buffer.alloc(4),
      signature: Buffer.alloc(8),
    },
    timestamp: overrides?.timestamp ?? Date.now(),
  };
}

describe('EncounterManager', () => {
  let manager: EncounterManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new EncounterManager();
    manager.start();
  });

  afterEach(() => {
    manager.stop();
    vi.useRealTimers();
  });

  it('emits encounter-start for new beacon', () => {
    const events: EncounterEvent[] = [];
    manager.on('encounter', (e: EncounterEvent) => events.push(e));

    manager.handleBeaconDiscovered(makeBeacon('a1b2c3d4'));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('encounter-start');
    expect(events[0].peer.clawId).toBe('a1b2c3d4');
    expect(events[0].peer.rssi).toBe(-50);
  });

  it('emits encounter-update for same beacon', () => {
    const events: EncounterEvent[] = [];
    manager.on('encounter', (e: EncounterEvent) => events.push(e));

    manager.handleBeaconDiscovered(makeBeacon('a1b2c3d4', { rssi: -50 }));
    manager.handleBeaconDiscovered(makeBeacon('a1b2c3d4', { rssi: -40 }));

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('encounter-start');
    expect(events[1].type).toBe('encounter-update');
    expect(events[1].peer.rssi).toBe(-40);
  });

  it('emits encounter-end after peer timeout', () => {
    const events: EncounterEvent[] = [];
    manager.on('encounter', (e: EncounterEvent) => events.push(e));

    manager.handleBeaconDiscovered(makeBeacon('a1b2c3d4'));

    // Advance past PEER_TIMEOUT_MS (60s) + sweep interval (30s)
    vi.advanceTimersByTime(90_000);

    const endEvents = events.filter(e => e.type === 'encounter-end');
    expect(endEvents).toHaveLength(1);
    expect(endEvents[0].peer.clawId).toBe('a1b2c3d4');
  });

  it('updates RSSI by peripheralId', () => {
    manager.handleBeaconDiscovered(makeBeacon('a1b2c3d4', { peripheralId: 'periph-1', rssi: -60 }));

    manager.handleRssiUpdate({ peripheralId: 'periph-1', rssi: -35 });

    const peers = manager.getNearbyPeers();
    expect(peers).toHaveLength(1);
    expect(peers[0].rssi).toBe(-35);
  });

  it('tracks multiple concurrent peers independently', () => {
    const events: EncounterEvent[] = [];
    manager.on('encounter', (e: EncounterEvent) => events.push(e));

    manager.handleBeaconDiscovered(makeBeacon('a1b2c3d4', { peripheralId: 'p1' }));
    manager.handleBeaconDiscovered(makeBeacon('11223344', { peripheralId: 'p2' }));
    manager.handleBeaconDiscovered(makeBeacon('55667788', { peripheralId: 'p3' }));

    expect(manager.getNearbyPeers()).toHaveLength(3);

    const starts = events.filter(e => e.type === 'encounter-start');
    expect(starts).toHaveLength(3);

    // Keep only first peer alive
    vi.advanceTimersByTime(30_000);
    manager.handleBeaconDiscovered(makeBeacon('a1b2c3d4', { peripheralId: 'p1' }));

    // Advance past timeout — need to reach a sweep tick where peers 2&3 have
    // exceeded PEER_TIMEOUT_MS (60s, strict >). Sweep fires every 30s.
    // At t=90s sweep: peers 2&3 lastSeen=0 → 90s > 60s ✓. Peer 1 lastSeen=30 → 60s, not > 60s.
    vi.advanceTimersByTime(61_000);

    const ends = events.filter(e => e.type === 'encounter-end');
    expect(ends).toHaveLength(2);
    expect(manager.getNearbyPeers()).toHaveLength(1);
    expect(manager.getNearbyPeers()[0].clawId).toBe('a1b2c3d4');
  });

  it('getNearbyPeers returns current set', () => {
    expect(manager.getNearbyPeers()).toHaveLength(0);

    manager.handleBeaconDiscovered(makeBeacon('a1b2c3d4'));
    expect(manager.getNearbyPeers()).toHaveLength(1);

    manager.handleBeaconDiscovered(makeBeacon('11223344'));
    expect(manager.getNearbyPeers()).toHaveLength(2);
  });

  it('updates flags on subsequent beacon', () => {
    manager.handleBeaconDiscovered(makeBeacon('a1b2c3d4', {
      flags: { acceptingEncounters: true, whisperCapable: false, humanPresent: true },
    }));

    manager.handleBeaconDiscovered(makeBeacon('a1b2c3d4', {
      flags: { acceptingEncounters: true, whisperCapable: true, humanPresent: true },
    }));

    const peers = manager.getNearbyPeers();
    expect(peers[0].flags.whisperCapable).toBe(true);
  });
});
