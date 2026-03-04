import React from 'react';
import StatusIndicator from './StatusIndicator';
import NearbyList from './NearbyList';
import { useNearbyPeers, useBleStatus, useGatewayStatus } from '../hooks/useAuraAPI';

interface MenuBarDropdownProps {
  onOpenSettings: () => void;
}

export default function MenuBarDropdown({ onOpenSettings }: MenuBarDropdownProps) {
  const peers = useNearbyPeers();
  const bleStatus = useBleStatus();
  const gatewayConnected = useGatewayStatus();

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
        <StatusIndicator label="Gateway" active={gatewayConnected} />
      </div>

      <div className="peer-count">
        {peers.length} {peers.length === 1 ? 'Claw' : 'Claws'} nearby
      </div>

      <NearbyList peers={peers} />

      <div className="footer">
        <span>Aura v0.1.0</span>
      </div>
    </div>
  );
}
