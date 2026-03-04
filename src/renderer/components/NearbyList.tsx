import React from 'react';
import type { NearbyPeerData } from '../types';

interface NearbyListProps {
  peers: NearbyPeerData[];
}

function rssiToDistance(rssi: number): string {
  // Rough estimate: RSSI to distance
  if (rssi >= -40) return '~1m';
  if (rssi >= -55) return '~3m';
  if (rssi >= -65) return '~8m';
  if (rssi >= -75) return '~15m';
  return '~20m+';
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export default function NearbyList({ peers }: NearbyListProps) {
  if (peers.length === 0) {
    return (
      <div className="empty-state">
        No Claws nearby<br />
        <span style={{ fontSize: 11 }}>Scanning for Aura beacons...</span>
      </div>
    );
  }

  return (
    <div className="peer-list">
      {peers.map((peer) => (
        <div key={peer.clawId} className="peer-item">
          <div className="peer-id">
            Claw {peer.clawId.substring(0, 8)}
          </div>
          <div className="peer-meta">
            <span>{rssiToDistance(peer.rssi)} ({peer.rssi} dBm)</span>
            <span>seen {timeAgo(peer.lastSeen)}</span>
          </div>
          <div className="peer-flags">
            {peer.flags.acceptingEncounters && (
              <span className="flag-badge">accepting</span>
            )}
            {peer.flags.whisperCapable && (
              <span className="flag-badge">whisper</span>
            )}
            {peer.flags.humanPresent && (
              <span className="flag-badge">human</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
