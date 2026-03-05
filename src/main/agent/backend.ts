import { EventEmitter } from 'events';
import { EncounterEvent } from '../encounter/types';
import {
  AGORA_POST_PROMPT,
  AGORA_DELIVERY_PROMPT,
  WHISPER_DECISION_PROMPT,
  WHISPER_INITIATE_PROMPT,
  WHISPER_CONVERSATION_PROMPT,
  formatPeerContext,
  formatNearbyPeersContext,
} from './prompts';

export interface AgentBackendStatus {
  connected: boolean;
  statusText: string;
}

export interface PeerContext {
  clawId: string;
  rssi: number;
  distance: string;
  dwellTimeMs: number;
  flags: { acceptingEncounters: boolean; whisperCapable: boolean; humanPresent: boolean };
  recentAgoraPosts: string[];
}

export interface NearbyPeerSummary {
  clawId: string;
  distance: string;
  flags: { acceptingEncounters: boolean; whisperCapable: boolean; humanPresent: boolean };
  recentAgoraPosts: string[];
}

/**
 * Abstract interface for agent backends.
 * Aura core calls these methods; each backend implements them
 * according to its own protocol.
 *
 * Emits:
 *   'status' (status: AgentBackendStatus)
 *   'error'  (err: Error)
 */
export abstract class AgentBackend extends EventEmitter {
  abstract readonly type: string;
  abstract readonly displayName: string;

  /** Connect to the agent backend. Should auto-reconnect internally. */
  abstract connect(options: Record<string, unknown>): void;

  /** Deliver an encounter event to the agent with a pre-formatted message. */
  abstract deliverEncounter(event: EncounterEvent, message: string): void;

  /** Current connection status. */
  abstract getStatus(): AgentBackendStatus;

  /** Update backend-specific options (e.g. URL, token). */
  abstract updateOptions(options: Partial<Record<string, unknown>>): void;

  /** Send a prompt to the agent and wait for a text response. */
  abstract query(prompt: string, systemPrompt?: string): Promise<string | null>;

  /** Clean disconnect. */
  abstract disconnect(): void;

  // --- Agora (default implementations using query()) ---

  /** Ask the agent for a public agora post. Returns text or null (agent passed). */
  async requestAgoraPost(nearbyPeers: NearbyPeerSummary[]): Promise<string | null> {
    const context = formatNearbyPeersContext(nearbyPeers);
    const response = await this.query(
      `${context}\n\nWrite a public message for the agora, or reply PASS.`,
      AGORA_POST_PROMPT,
    );
    if (!response || response.trim().toUpperCase() === 'PASS') return null;
    return response.trim();
  }

  /** Deliver a public agora post from a nearby peer to the agent. */
  async deliverAgoraPost(authorClawId: string, content: string): Promise<void> {
    await this.query(
      `[Agora post from ${authorClawId.substring(0, 8)}]: ${content}`,
      AGORA_DELIVERY_PROMPT,
    );
  }

  // --- Whisper (default implementations using query()) ---

  /** Ask the agent whether to accept a whisper request. */
  async evaluateWhisperRequest(peerClawId: string, context: PeerContext): Promise<{ accept: boolean; reason?: string }> {
    const peerInfo = formatPeerContext(context);
    const response = await this.query(
      `${peerInfo}\n\nThis agent wants to start a private encrypted whisper with you. Accept or decline?`,
      WHISPER_DECISION_PROMPT,
    );
    if (!response) return { accept: false, reason: 'no-response' };
    if (response.trim().toUpperCase().startsWith('ACCEPT')) return { accept: true };
    return { accept: false, reason: response.trim() };
  }

  /** Ask the agent whether to initiate a whisper with a peer. */
  async shouldInitiateWhisper(peerClawId: string, context: PeerContext): Promise<{ initiate: boolean; openingMessage?: string }> {
    const peerInfo = formatPeerContext(context);
    const response = await this.query(
      `${peerInfo}\n\nYou can start a private encrypted whisper with this agent. Interested?`,
      WHISPER_INITIATE_PROMPT,
    );
    if (!response || response.trim().toUpperCase() === 'PASS') return { initiate: false };
    const trimmed = response.trim();
    if (trimmed.toUpperCase().startsWith('WHISPER:')) {
      return { initiate: true, openingMessage: trimmed.substring(8).trim() };
    }
    return { initiate: false };
  }

  /** Handle an incoming whisper message. Returns the agent's reply or null. */
  async handleWhisperMessage(sessionId: string, peerClawId: string, message: string): Promise<string | null> {
    const response = await this.query(
      `[Whisper from ${peerClawId.substring(0, 8)}]: ${message}`,
      WHISPER_CONVERSATION_PROMPT,
    );
    if (!response || response.trim().toUpperCase() === 'PASS') return null;
    return response.trim();
  }
}
