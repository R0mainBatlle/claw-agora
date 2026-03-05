import type { NearbyPeerData, AuraSettingsData, BleStatusData, BackendStatusData, EncounterPolicyData } from './index';

interface AuraAPI {
  getSettings(): Promise<AuraSettingsData>;
  updateSettings(partial: Partial<AuraSettingsData>): Promise<AuraSettingsData>;
  getBleStatus(): Promise<BleStatusData>;
  getNearbyPeers(): Promise<NearbyPeerData[]>;
  getBackendStatus(): Promise<BackendStatusData>;
  queryAgent(prompt: string, systemPrompt?: string): Promise<string | null>;
  getEncounterPolicy(): Promise<EncounterPolicyData>;
  updateEncounterPolicy(partial: Partial<EncounterPolicyData>): Promise<EncounterPolicyData>;
  onNearbyPeersUpdated(callback: (peers: NearbyPeerData[]) => void): () => void;
  onBleStatusChanged(callback: (status: BleStatusData) => void): () => void;
  onBackendStatusChanged(callback: (status: BackendStatusData) => void): () => void;
}

declare global {
  interface Window {
    auraAPI: AuraAPI;
  }
}

export {};
