import { EventEmitter } from 'events';
import { WhisperSession } from './session';
import { WhisperService } from './service';
import { WhisperClient } from './client';
import { WhisperConfig, DEFAULT_WHISPER_CONFIG, CloseReason, RejectReason } from './types';
import { inspectContent } from '../security/quarantine';
import { AgentBackend, PeerContext } from '../agent/backend';
import type { ControlMessage, DataFrame } from './codec';

interface ActiveSession {
  session: WhisperSession;
  client?: WhisperClient;
  peerPeripheralId?: string;
}

export interface WhisperMessageItem {
  id: string;
  sessionId: string;
  peerClawId: string;
  content: string;
  timestamp: number;
  direction: 'inbound' | 'outbound';
  quarantined: boolean;
}

export interface WhisperSessionSummary {
  id: string;
  peerClawId: string;
  state: string;
  createdAt: number;
  lastActivity: number;
  messageCount: number;
}

/**
 * Orchestrates Whisper sessions.
 *
 * Emits:
 *   'session-established' (sessionId, peerClawId)
 *   'session-closed'      (sessionId, peerClawId, reason)
 *   'session-message'     (msg: WhisperMessageItem)
 *   'session-update'      ()
 */
export class WhisperManager extends EventEmitter {
  private config: WhisperConfig;
  private sessions = new Map<string, ActiveSession>();
  private peerClawIdToSession = new Map<string, string>();
  private backend: AgentBackend;
  private localClawId: Buffer;
  private whisperService: WhisperService;
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private _messages = new Map<string, WhisperMessageItem[]>(); // sessionId → messages
  private _demoSessions: WhisperSessionSummary[] = [];
  private msgSeq = 0;
  private _contextProvider: ((clawId: string) => string[]) | null = null;

  constructor(
    backend: AgentBackend,
    localClawId: Buffer,
    whisperService: WhisperService,
    config?: Partial<WhisperConfig>,
  ) {
    super();
    this.config = { ...DEFAULT_WHISPER_CONFIG, ...config };
    this.backend = backend;
    this.localClawId = localClawId;
    this.whisperService = whisperService;

    this.whisperService.on('control-message', (msg: ControlMessage) => {
      this.handleIncomingControl(msg);
    });
    this.whisperService.on('data-frame', (frame: DataFrame) => {
      this.handleIncomingDataFrame(frame);
    });
  }

  start(): void {
    if (!this.config.enabled) return;
    this.idleCheckTimer = setInterval(() => {
      this.sweepSessions();
    }, 30_000);
  }

  stop(): void {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
    for (const [, active] of this.sessions) {
      active.session.close(CloseReason.AGENT_REQUESTED);
      active.client?.disconnect();
    }
    this.sessions.clear();
    this.peerClawIdToSession.clear();
  }

  get activeSessionCount(): number {
    return this.sessions.size;
  }

  /** Get all active sessions as summaries for the UI. */
  getSessions(): WhisperSessionSummary[] {
    const result: WhisperSessionSummary[] = [];
    for (const [, active] of this.sessions) {
      const s = active.session;
      result.push({
        id: s.id,
        peerClawId: s.peerClawId,
        state: s.state,
        createdAt: s.createdAt,
        lastActivity: s.lastActivity,
        messageCount: this._messages.get(s.id)?.length || 0,
      });
    }
    // Include demo sessions
    for (const ds of this._demoSessions) {
      ds.messageCount = this._messages.get(ds.id)?.length || 0;
      result.push(ds);
    }
    return result;
  }

  /** Inject a fake session for demo mode. */
  injectDemoSession(summary: WhisperSessionSummary): void {
    this._demoSessions.push(summary);
    this._messages.set(summary.id, []);
    this.emit('session-update');
  }

  /** Inject a fake message for demo mode. */
  injectDemoMessage(msg: WhisperMessageItem): void {
    const msgs = this._messages.get(msg.sessionId) || [];
    msgs.push(msg);
    this._messages.set(msg.sessionId, msgs);
    this.emit('session-message', msg);
    this.emit('session-update');
  }

  /** Get messages for a session. */
  getMessages(sessionId: string): WhisperMessageItem[] {
    return this._messages.get(sessionId) || [];
  }

  async initiateWhisper(peripheral: any, peerClawId: string, context: PeerContext): Promise<boolean> {
    if (!this.config.enabled || !this.config.autoInitiate) return false;
    if (this.sessions.size >= this.config.maxConcurrentSessions) return false;
    if (this.peerClawIdToSession.has(peerClawId)) return false;

    const decision = await this.backend.shouldInitiateWhisper(peerClawId, context);
    if (!decision.initiate) return false;

    const client = new WhisperClient(peripheral);
    const connected = await client.connect();
    if (!connected) return false;

    const session = new WhisperSession('initiator', this.localClawId, peerClawId, this.config.handshakeTimeoutMs);
    const active: ActiveSession = { session, client, peerPeripheralId: peripheral.id };

    this.registerSession(active);

    client.on('control-message', (msg: ControlMessage) => {
      session.handleControlMessage(msg);
    });
    client.on('data-frame', (frame: DataFrame) => {
      this.onDataFrame(session, frame);
    });
    client.on('disconnected', () => {
      this.closeSession(session.id, 'peer-disconnected');
    });

    session.on('send-control', (data: Buffer) => {
      client.sendControl(data);
    });
    session.on('send-data', (data: Buffer) => {
      client.sendData(data);
    });

    this.wireSessionEvents(session);
    session.startHandshake();

    if (decision.openingMessage) {
      session.once('established', () => {
        this.sendMessage(session.id, decision.openingMessage!);
      });
    }

    console.log(`[Whisper] Initiated session ${session.id.substring(0, 8)} with ${peerClawId.substring(0, 8)}`);
    return true;
  }

  private async handleIncomingControl(msg: ControlMessage): Promise<void> {
    const peerClawIdHex = msg.senderClawId.toString('hex');

    const existingSessionId = this.peerClawIdToSession.get(peerClawIdHex);
    if (existingSessionId) {
      const active = this.sessions.get(existingSessionId);
      if (active) {
        active.session.handleControlMessage(msg);
        return;
      }
    }

    if (msg.type !== 0x01) return;
    if (this.sessions.size >= this.config.maxConcurrentSessions) {
      const session = new WhisperSession('responder', this.localClawId, peerClawIdHex, this.config.handshakeTimeoutMs);
      session.handleControlMessage(msg);
      session.rejectHandshake(RejectReason.BUSY);
      session.on('send-control', (data: Buffer) => {
        this.whisperService.sendControl(data);
      });
      return;
    }

    const session = new WhisperSession('responder', this.localClawId, peerClawIdHex, this.config.handshakeTimeoutMs);
    const active: ActiveSession = { session };
    this.registerSession(active);

    session.on('send-control', (data: Buffer) => {
      this.whisperService.sendControl(data);
    });
    session.on('send-data', (data: Buffer) => {
      this.whisperService.sendData(data);
    });

    this.wireSessionEvents(session);
    session.handleControlMessage(msg);

    const recentPosts = this._contextProvider ? this._contextProvider(peerClawIdHex) : [];
    const context: PeerContext = {
      clawId: peerClawIdHex,
      rssi: 0,
      distance: 'unknown',
      dwellTimeMs: 0,
      flags: { acceptingEncounters: true, whisperCapable: true, humanPresent: false },
      recentAgoraPosts: recentPosts,
    };

    try {
      const decision = await this.backend.evaluateWhisperRequest(peerClawIdHex, context);
      if (decision.accept) {
        session.acceptHandshake();
        console.log(`[Whisper] Accepted session from ${peerClawIdHex.substring(0, 8)}`);
      } else {
        session.rejectHandshake(RejectReason.DECLINED);
        console.log(`[Whisper] Declined session from ${peerClawIdHex.substring(0, 8)}: ${decision.reason}`);
      }
    } catch (err) {
      session.rejectHandshake(RejectReason.DECLINED);
      console.error('[Whisper] Agent eval failed:', (err as Error).message);
    }
  }

  private handleIncomingDataFrame(frame: DataFrame): void {
    for (const [, active] of this.sessions) {
      if (!active.client) {
        this.onDataFrame(active.session, frame);
        return;
      }
    }
  }

  private async onDataFrame(session: WhisperSession, frame: DataFrame): Promise<void> {
    const plaintext = session.handleDataFrame(frame);
    if (!plaintext) return;

    // Truncate before quarantine — limits prompt injection surface
    const truncated = plaintext.length > this.config.maxMessageLength
      ? plaintext.substring(0, this.config.maxMessageLength)
      : plaintext;

    const result = inspectContent(truncated);
    if (!result.safe) {
      console.warn(`[Whisper] Quarantined message in session ${session.id.substring(0, 8)}: ${result.threats.join(', ')}`);
    }

    const inMsg: WhisperMessageItem = {
      id: `msg-${++this.msgSeq}`,
      sessionId: session.id,
      peerClawId: session.peerClawId,
      content: result.sanitized,
      timestamp: Date.now(),
      direction: 'inbound',
      quarantined: !result.safe,
    };
    this.addMessage(inMsg);

    try {
      const reply = await this.backend.handleWhisperMessage(session.id, session.peerClawId, result.sanitized);
      if (!reply || reply.trim().toUpperCase() === 'END') {
        // Agent has nothing to say or explicitly ended — close the session
        console.log(`[Whisper] Agent ended session ${session.id.substring(0, 8)} (${reply ? 'END' : 'no reply'})`);
        this.closeSession(session.id, 'agent-ended');
      } else {
        this.sendMessage(session.id, reply);
      }
    } catch (err) {
      console.error('[Whisper] Agent response failed:', (err as Error).message);
    }
  }

  sendMessage(sessionId: string, plaintext: string): boolean {
    const active = this.sessions.get(sessionId);
    if (!active) return false;

    // Truncate outbound too — agent could be verbose
    const truncated = plaintext.length > this.config.maxMessageLength
      ? plaintext.substring(0, this.config.maxMessageLength)
      : plaintext;

    const result = inspectContent(truncated);
    if (!result.safe) {
      console.warn(`[Whisper] Quarantined outbound in session ${sessionId.substring(0, 8)}: ${result.threats.join(', ')}`);
    }

    active.session.sendMessage(result.sanitized);

    const outMsg: WhisperMessageItem = {
      id: `msg-${++this.msgSeq}`,
      sessionId,
      peerClawId: active.session.peerClawId,
      content: result.sanitized,
      timestamp: Date.now(),
      direction: 'outbound',
      quarantined: !result.safe,
    };
    this.addMessage(outMsg);

    return true;
  }

  closeSession(sessionId: string, reason?: string): void {
    const active = this.sessions.get(sessionId);
    if (!active) return;

    active.session.close(CloseReason.AGENT_REQUESTED);
    active.client?.disconnect();
    this.sessions.delete(sessionId);
    this.peerClawIdToSession.delete(active.session.peerClawId);
    this.emit('session-closed', sessionId, active.session.peerClawId, reason || 'local-close');
    this.emit('session-update');
  }

  updatePeerContext(_peerClawId: string, _context: Partial<PeerContext>): void {
    // Reserved for enriching context before agent decisions
  }

  private registerSession(active: ActiveSession): void {
    this.sessions.set(active.session.id, active);
    this.peerClawIdToSession.set(active.session.peerClawId, active.session.id);
    this._messages.set(active.session.id, []);
    this.emit('session-update');
  }

  private addMessage(msg: WhisperMessageItem): void {
    const msgs = this._messages.get(msg.sessionId);
    if (msgs) {
      msgs.push(msg);
      // Keep last 100 per session
      if (msgs.length > 100) msgs.splice(0, msgs.length - 100);
    }
    this.emit('session-message', msg);
    this.emit('session-update');
  }

  private wireSessionEvents(session: WhisperSession): void {
    session.on('established', () => {
      console.log(`[Whisper] Session ${session.id.substring(0, 8)} established with ${session.peerClawId.substring(0, 8)}`);
      this.emit('session-established', session.id, session.peerClawId);
      this.emit('session-update');
    });

    session.on('closed', (reason: string) => {
      this.sessions.delete(session.id);
      this.peerClawIdToSession.delete(session.peerClawId);
      console.log(`[Whisper] Session ${session.id.substring(0, 8)} closed: ${reason}`);
      this.emit('session-closed', session.id, session.peerClawId, reason);
      this.emit('session-update');
    });

    session.on('error', (err: Error) => {
      console.error(`[Whisper] Session ${session.id.substring(0, 8)} error:`, err.message);
    });
  }

  private sweepSessions(): void {
    const now = Date.now();
    for (const [id, active] of this.sessions) {
      const session = active.session;
      if (now - session.lastActivity > this.config.sessionIdleTimeoutMs) {
        console.log(`[Whisper] Session ${id.substring(0, 8)} idle timeout`);
        this.closeSession(id, 'idle-timeout');
      } else if (now - session.createdAt > this.config.sessionMaxDurationMs) {
        console.log(`[Whisper] Session ${id.substring(0, 8)} max duration reached`);
        this.closeSession(id, 'max-duration');
      }
    }
  }

  /** Set a provider that returns recent agora posts for a given clawId. */
  setContextProvider(provider: (clawId: string) => string[]): void {
    this._contextProvider = provider;
  }

  updateConfig(config: Partial<WhisperConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
