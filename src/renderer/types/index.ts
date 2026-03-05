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

export interface AgoraSettingsData {
  enabled: boolean;
  postIntervalMs: number;
  readIntervalMs: number;
  maxPostLength: number;
  ringBufferSize: number;
}

export interface WhisperSettingsData {
  enabled: boolean;
  maxConcurrentSessions: number;
  autoInitiate: boolean;
  initiateAfterMs: number;
  maxMessageLength: number;
}

export interface AuraSettingsData {
  humanDescription: string;
  tags: string[];
  backendType: string;
  backendOptions: Record<string, unknown>;
  encounterPolicy: EncounterPolicyData;
  agora: AgoraSettingsData;
  whisper: WhisperSettingsData;
}

export interface BleStatusData {
  advertising: boolean;
  scanning: boolean;
}

export interface BackendStatusData {
  connected: boolean;
  statusText: string;
}

export interface AgoraPostData {
  id: string;
  authorClawId: string;
  content: string;
  timestamp: number;
  isLocal: boolean;
  quarantined: boolean;
}

export interface WhisperSessionData {
  id: string;
  peerClawId: string;
  state: string;
  createdAt: number;
  lastActivity: number;
  messageCount: number;
}

export interface WhisperMessageData {
  id: string;
  sessionId: string;
  peerClawId: string;
  content: string;
  timestamp: number;
  direction: 'inbound' | 'outbound';
  quarantined: boolean;
}
