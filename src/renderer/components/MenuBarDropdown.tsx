import React, { useState } from 'react';
import StatusIndicator from './StatusIndicator';
import NearbyList from './NearbyList';
import AgoraFeed from './AgoraFeed';
import WhisperPanel from './WhisperPanel';
import { useNearbyPeers, useBleStatus, useBackendStatus, useAgoraPosts, useWhisperSessions } from '../hooks/useAuraAPI';

type MainTab = 'nearby' | 'agora' | 'whisper';

interface MenuBarDropdownProps {
  onOpenSettings: () => void;
}

export default function MenuBarDropdown({ onOpenSettings }: MenuBarDropdownProps) {
  const peers = useNearbyPeers();
  const bleStatus = useBleStatus();
  const backendStatus = useBackendStatus();
  const agoraPosts = useAgoraPosts();
  const whisperSessions = useWhisperSessions();
  const [activeTab, setActiveTab] = useState<MainTab>('nearby');

  const whisperCount = whisperSessions.filter(s => s.state === 'established').length;

  return (
    <div className="app-container">
      <div className="header">
        <h1>Aura</h1>
        <div className="header-right">
          <StatusIndicator label="BLE" active={bleStatus.advertising && bleStatus.scanning} />
          <StatusIndicator label="Agent" active={backendStatus.connected} />
          <button onClick={onOpenSettings} title="Settings">&#9881;</button>
        </div>
      </div>

      <div className="main-tabs">
        <button
          className={`main-tab ${activeTab === 'nearby' ? 'active' : ''}`}
          onClick={() => setActiveTab('nearby')}
        >
          Nearby
          {peers.length > 0 && <span className="tab-badge">{peers.length}</span>}
        </button>
        <button
          className={`main-tab ${activeTab === 'agora' ? 'active' : ''}`}
          onClick={() => setActiveTab('agora')}
        >
          Agora
          {agoraPosts.length > 0 && <span className="tab-badge">{agoraPosts.length}</span>}
        </button>
        <button
          className={`main-tab ${activeTab === 'whisper' ? 'active' : ''}`}
          onClick={() => setActiveTab('whisper')}
        >
          Whisper
          {whisperCount > 0 && <span className="tab-badge tab-badge-active">{whisperCount}</span>}
        </button>
      </div>

      <div className="main-content">
        {activeTab === 'nearby' && <NearbyList peers={peers} />}
        {activeTab === 'agora' && <AgoraFeed posts={agoraPosts} />}
        {activeTab === 'whisper' && <WhisperPanel sessions={whisperSessions} />}
      </div>

      <div className="footer">
        <span>Aura v0.3.0</span>
      </div>
    </div>
  );
}
