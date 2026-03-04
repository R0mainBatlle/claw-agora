import React from 'react';
import StatusIndicator from './StatusIndicator';
import NearbyList from './NearbyList';
import { useNearbyPeers, useBleStatus, useBackendStatus } from '../hooks/useAuraAPI';

interface MenuBarDropdownProps {
  onOpenSettings: () => void;
}

export default function MenuBarDropdown({ onOpenSettings }: MenuBarDropdownProps) {
  const peers = useNearbyPeers();
  const bleStatus = useBleStatus();
  const backendStatus = useBackendStatus();

  return (
    <div className="app-container">
      <div className="header">
        <h1>Aura</h1>
        <button onClick={onOpenSettings} title="Settings">
          &#9881;
        </button>
      </div>

      <div className="status-bar">
        <StatusIndicator
          label="BLE"
          active={bleStatus.advertising && bleStatus.scanning}
        />
        <StatusIndicator label="Agent" active={backendStatus.connected} />
      </div>

      <div className="peer-count">
        {peers.length} {peers.length === 1 ? 'agent' : 'agents'} nearby
      </div>

      <NearbyList peers={peers} />

      <div className="footer">
        <span>Aura v0.2.0</span>
      </div>
    </div>
  );
}
