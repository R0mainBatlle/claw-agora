export interface NearbyPeerData {
  peripheralId: string;
  clawId: string;
  intentHash: number;
  flags: {
    acceptingEncounters: boolean;
    whisperCapable: boolean;
    humanPresent: boolean;
  };
  rssi: number;
  firstSeen: number;
  lastSeen: number;
}

export interface AuraSettingsData {
  gatewayUrl: string;
  humanDescription: string;
  tags: string[];
  authToken: string;
}

export interface BleStatusData {
  advertising: boolean;
  scanning: boolean;
}

export interface GatewayStatusData {
  connected: boolean;
}
