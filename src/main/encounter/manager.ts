import { EventEmitter } from 'events';
import { DiscoveredBeacon } from '../ble/platform';
import { NearbyPeer, EncounterEvent } from './types';
import { PEER_TIMEOUT_MS } from '../ble/constants';

export class EncounterManager extends EventEmitter {
  private peers = new Map<string, NearbyPeer>();
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.sweepInterval = setInterval(() => this.sweep(), PEER_TIMEOUT_MS / 2);
  }

  handleBeaconDiscovered(beacon: DiscoveredBeacon): void {
    const clawIdHex = beacon.payload.clawId.toString('hex');
    const existing = this.peers.get(clawIdHex);

    if (!existing) {
      const peer: NearbyPeer = {
        peripheralId: beacon.peripheralId,
        clawId: clawIdHex,
        intentHash: beacon.payload.intentHash,
        flags: beacon.payload.flags,
        rssi: beacon.rssi,
        firstSeen: beacon.timestamp,
        lastSeen: beacon.timestamp,
      };
      this.peers.set(clawIdHex, peer);
      this.emit('encounter', {
        type: 'encounter-start',
        peer,
        timestamp: beacon.timestamp,
      } as EncounterEvent);
    } else {
      existing.lastSeen = beacon.timestamp;
      existing.rssi = beacon.rssi;
      existing.flags = beacon.payload.flags;
      existing.intentHash = beacon.payload.intentHash;
      this.emit('encounter', {
        type: 'encounter-update',
        peer: existing,
        timestamp: beacon.timestamp,
      } as EncounterEvent);
    }
  }

  handleRssiUpdate(update: { peripheralId: string; rssi: number }): void {
    for (const peer of this.peers.values()) {
      if (peer.peripheralId === update.peripheralId) {
        peer.rssi = update.rssi;
        peer.lastSeen = Date.now();
        break;
      }
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [clawId, peer] of this.peers) {
      if (now - peer.lastSeen > PEER_TIMEOUT_MS) {
        this.peers.delete(clawId);
        this.emit('encounter', {
          type: 'encounter-end',
          peer,
          timestamp: now,
        } as EncounterEvent);
      }
    }
  }

  getNearbyPeers(): NearbyPeer[] {
    return Array.from(this.peers.values());
  }

  stop(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
    this.peers.clear();
  }
}
