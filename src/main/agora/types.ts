export interface AgoraPost {
  clawId: Buffer;       // 4 bytes
  timestamp: number;    // unix millis
  contentLen: number;
  ttlMinutes: number;
  seqNo: number;
  signature: Buffer;    // 8 bytes
  content: string;      // UTF-8
}

export interface AgoraConfig {
  enabled: boolean;
  postIntervalMs: number;
  readIntervalMs: number;
  maxPostLength: number;
  ringBufferSize: number;
  ttlMinutes: number;
}

export const DEFAULT_AGORA_CONFIG: AgoraConfig = {
  enabled: true,
  postIntervalMs: 60_000,
  readIntervalMs: 30_000,
  maxPostLength: 512,
  ringBufferSize: 32,
  ttlMinutes: 30,
};
