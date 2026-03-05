import crypto from 'crypto';

export enum WhisperState {
  IDLE = 'idle',
  HELLO_SENT = 'hello_sent',
  HELLO_RECEIVED = 'hello_received',
  KEY_EXCHANGE = 'key_exchange',
  VERIFYING = 'verifying',
  ESTABLISHED = 'established',
  CLOSING = 'closing',
}

export enum ControlType {
  HELLO = 0x01,
  HELLO_ACK = 0x02,
  KEY_EXCHANGE = 0x03,
  VERIFY = 0x04,
  SESSION_OK = 0x05,
  CLOSE = 0x06,
  REJECT = 0x07,
  ERROR = 0xff,
}

export enum CloseReason {
  NORMAL = 0x00,
  TIMEOUT = 0x01,
  AGENT_REQUESTED = 0x02,
}

export enum RejectReason {
  BUSY = 0x00,
  DECLINED = 0x01,
  UNKNOWN_PEER = 0x02,
}

export interface WhisperSessionData {
  id: string;
  state: WhisperState;
  role: 'initiator' | 'responder';
  peerClawId: string;
  localNonce: Buffer;
  peerNonce: Buffer | null;
  localECDH: crypto.ECDH | null;
  peerPublicKey: Buffer | null;
  sharedSecret: Buffer | null;
  sessionKey: Buffer | null;
  txSeq: number;
  rxSeq: number;
  createdAt: number;
  lastActivity: number;
}

export interface WhisperConfig {
  enabled: boolean;
  maxConcurrentSessions: number;
  autoInitiate: boolean;
  initiateAfterMs: number;
  handshakeTimeoutMs: number;
  sessionIdleTimeoutMs: number;
  sessionMaxDurationMs: number;
  maxMessageLength: number;
}

export const DEFAULT_WHISPER_CONFIG: WhisperConfig = {
  enabled: true,
  maxConcurrentSessions: 3,
  autoInitiate: true,
  initiateAfterMs: 30_000,
  handshakeTimeoutMs: 15_000,
  sessionIdleTimeoutMs: 300_000,
  sessionMaxDurationMs: 1_800_000,
  maxMessageLength: 1024,
};
