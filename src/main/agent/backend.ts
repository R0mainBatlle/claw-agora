import { EventEmitter } from 'events';
import { EncounterEvent } from '../encounter/types';

export interface AgentBackendStatus {
  connected: boolean;
  statusText: string;
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

  /** Clean disconnect. */
  abstract disconnect(): void;
}
