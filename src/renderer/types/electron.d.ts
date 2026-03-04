import type { NearbyPeerData, AuraSettingsData, BleStatusData, GatewayStatusData } from './index';

interface AuraAPI {
  getSettings(): Promise<AuraSettingsData>;
  updateSettings(partial: Partial<AuraSettingsData>): Promise<AuraSettingsData>;
  getBleStatus(): Promise<BleStatusData>;
  getNearbyPeers(): Promise<NearbyPeerData[]>;
  getGatewayStatus(): Promise<GatewayStatusData>;
  onNearbyPeersUpdated(callback: (peers: NearbyPeerData[]) => void): () => void;
  onBleStatusChanged(callback: (status: BleStatusData) => void): () => void;
  onGatewayStatusChanged(callback: (status: GatewayStatusData) => void): () => void;
}

declare global {
  interface Window {
    auraAPI: AuraAPI;
  }
}

export {};
