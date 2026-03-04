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

export interface EncounterPolicyData {
  enabled: boolean;
  minRssi: number;
  minDwellMs: number;
  cooldownMs: number;
  maxPerHour: number;
  requireHumanPresent: boolean;
}

export interface AuraSettingsData {
  humanDescription: string;
  tags: string[];
  backendType: string;
  backendOptions: Record<string, unknown>;
  encounterPolicy: EncounterPolicyData;
}

export interface BleStatusData {
  advertising: boolean;
  scanning: boolean;
}

export interface BackendStatusData {
  connected: boolean;
  statusText: string;
}
