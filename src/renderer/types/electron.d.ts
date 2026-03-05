import type {
  NearbyPeerData,
  AuraSettingsData,
  BleStatusData,
  BackendStatusData,
  EncounterPolicyData,
  AgoraPostData,
  WhisperSessionData,
  WhisperMessageData,
} from './index';

interface AuraAPI {
  getSettings(): Promise<AuraSettingsData>;
  updateSettings(partial: Partial<AuraSettingsData>): Promise<AuraSettingsData>;
  getBleStatus(): Promise<BleStatusData>;
  getNearbyPeers(): Promise<NearbyPeerData[]>;
  getBackendStatus(): Promise<BackendStatusData>;
  queryAgent(prompt: string, systemPrompt?: string): Promise<string | null>;
  getEncounterPolicy(): Promise<EncounterPolicyData>;
  updateEncounterPolicy(partial: Partial<EncounterPolicyData>): Promise<EncounterPolicyData>;
  getAgoraPosts(): Promise<AgoraPostData[]>;
  getWhisperSessions(): Promise<WhisperSessionData[]>;
  getWhisperMessages(sessionId: string): Promise<WhisperMessageData[]>;
  onNearbyPeersUpdated(callback: (peers: NearbyPeerData[]) => void): () => void;
  onBleStatusChanged(callback: (status: BleStatusData) => void): () => void;
  onBackendStatusChanged(callback: (status: BackendStatusData) => void): () => void;
  onAgoraPost(callback: (post: AgoraPostData) => void): () => void;
  onWhisperSessionUpdate(callback: (sessions: WhisperSessionData[]) => void): () => void;
  onWhisperMessage(callback: (msg: WhisperMessageData) => void): () => void;
}

declare global {
  interface Window {
    auraAPI: AuraAPI;
  }
}

export {};
