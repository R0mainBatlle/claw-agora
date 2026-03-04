export interface NearbyPeer {
  peripheralId: string;
  clawId: string;        // hex string of 4-byte ID
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

export interface EncounterEvent {
  type: 'encounter-start' | 'encounter-end' | 'encounter-update';
  peer: NearbyPeer;
  timestamp: number;
}
