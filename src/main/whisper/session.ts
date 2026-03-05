import crypto from 'crypto';
import { EventEmitter } from 'events';
import { WhisperState, ControlType, CloseReason, RejectReason, WhisperSessionData } from './types';
import * as wCrypto from './crypto';
import * as codec from './codec';

/**
 * Whisper session state machine.
 *
 * Emits:
 *   'send-control' (data: Buffer)     — send via Control characteristic
 *   'send-data'    (data: Buffer)     — send via TX/RX characteristic
 *   'established'  ()                 — session ready for messages
 *   'message'      (plaintext: string)— decrypted incoming message
 *   'closed'       (reason: string)   — session ended
 *   'error'        (err: Error)       — error
 */
export class WhisperSession extends EventEmitter {
  private data: WhisperSessionData;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(role: 'initiator' | 'responder', localClawId: Buffer, peerClawId: string, handshakeTimeoutMs: number = 15_000) {
    super();
    this.data = {
      id: crypto.randomUUID(),
      state: WhisperState.IDLE,
      role,
      peerClawId,
      localNonce: crypto.randomBytes(8),
      peerNonce: null,
      localECDH: null,
      peerPublicKey: null,
      sharedSecret: null,
      sessionKey: null,
      txSeq: 0,
      rxSeq: 0,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    this._localClawId = localClawId;
    this._handshakeTimeoutMs = handshakeTimeoutMs;
  }

  private _localClawId: Buffer;
  private _handshakeTimeoutMs: number;

  get id(): string { return this.data.id; }
  get state(): WhisperState { return this.data.state; }
  get peerClawId(): string { return this.data.peerClawId; }
  get lastActivity(): number { return this.data.lastActivity; }
  get createdAt(): number { return this.data.createdAt; }

  /** Initiator: start the handshake by sending HELLO. */
  startHandshake(): void {
    if (this.data.role !== 'initiator' || this.data.state !== WhisperState.IDLE) return;

    this.data.state = WhisperState.HELLO_SENT;
    this.emit('send-control', codec.encodeHello(this._localClawId, this.data.localNonce));
    this.startHandshakeTimer();
  }

  /** Handle an incoming control message. */
  handleControlMessage(msg: codec.ControlMessage): void {
    this.data.lastActivity = Date.now();

    switch (msg.type) {
      case ControlType.HELLO:
        this.handleHello(msg);
        break;
      case ControlType.HELLO_ACK:
        this.handleHelloAck(msg);
        break;
      case ControlType.KEY_EXCHANGE:
        this.handleKeyExchange(msg);
        break;
      case ControlType.VERIFY:
        this.handleVerify(msg);
        break;
      case ControlType.SESSION_OK:
        this.handleSessionOk();
        break;
      case ControlType.CLOSE:
        this.handleClose(msg);
        break;
      case ControlType.REJECT:
        this.handleReject(msg);
        break;
    }
  }

  private handleHello(msg: codec.ControlMessage): void {
    if (this.data.role !== 'responder' || this.data.state !== WhisperState.IDLE) return;
    this.data.peerNonce = msg.nonce!;
    this.data.state = WhisperState.HELLO_RECEIVED;
    // The manager will call acceptHandshake() or rejectHandshake() after querying the agent
  }

  /** Responder: accept the HELLO and continue handshake. */
  acceptHandshake(): void {
    if (this.data.state !== WhisperState.HELLO_RECEIVED) return;

    this.emit('send-control', codec.encodeHelloAck(this._localClawId, this.data.localNonce));
    this.sendKeyExchange();
    this.startHandshakeTimer();
  }

  /** Responder: reject the HELLO. */
  rejectHandshake(reason: RejectReason = RejectReason.DECLINED): void {
    this.emit('send-control', codec.encodeReject(this._localClawId, reason));
    this.data.state = WhisperState.IDLE;
    this.emit('closed', 'rejected');
  }

  private handleHelloAck(msg: codec.ControlMessage): void {
    if (this.data.role !== 'initiator' || this.data.state !== WhisperState.HELLO_SENT) return;
    this.data.peerNonce = msg.nonce!;
    this.sendKeyExchange();
  }

  private sendKeyExchange(): void {
    const { ecdh, publicKey } = wCrypto.generateKeyPair();
    this.data.localECDH = ecdh;
    this.data.state = WhisperState.KEY_EXCHANGE;
    this.emit('send-control', codec.encodeKeyExchange(this._localClawId, publicKey));
  }

  private handleKeyExchange(msg: codec.ControlMessage): void {
    if (this.data.state !== WhisperState.KEY_EXCHANGE) return;
    if (!this.data.localECDH || !msg.publicKey) return;

    this.data.peerPublicKey = msg.publicKey;
    this.data.sharedSecret = wCrypto.computeSharedSecret(this.data.localECDH, msg.publicKey);

    const initNonce = this.data.role === 'initiator' ? this.data.localNonce : this.data.peerNonce!;
    const respNonce = this.data.role === 'initiator' ? this.data.peerNonce! : this.data.localNonce;

    this.data.sessionKey = wCrypto.deriveSessionKey(this.data.sharedSecret, initNonce, respNonce);

    // Send verify proof
    const proof = wCrypto.computeVerifyProof(this.data.sharedSecret, initNonce, respNonce, this._localClawId);
    this.data.state = WhisperState.VERIFYING;
    this.emit('send-control', codec.encodeVerify(this._localClawId, proof));
  }

  private handleVerify(msg: codec.ControlMessage): void {
    if (this.data.state !== WhisperState.VERIFYING) return;
    if (!this.data.sharedSecret || !msg.proof) return;

    const initNonce = this.data.role === 'initiator' ? this.data.localNonce : this.data.peerNonce!;
    const respNonce = this.data.role === 'initiator' ? this.data.peerNonce! : this.data.localNonce;
    const peerClawIdBuf = Buffer.from(this.data.peerClawId, 'hex');

    const expectedProof = wCrypto.computeVerifyProof(this.data.sharedSecret, initNonce, respNonce, peerClawIdBuf);

    if (!crypto.timingSafeEqual(msg.proof, expectedProof)) {
      this.emit('error', new Error('Verify proof mismatch'));
      this.close(CloseReason.NORMAL);
      return;
    }

    // Send SESSION_OK
    this.emit('send-control', codec.encodeSessionOk(this._localClawId));
    this.data.state = WhisperState.ESTABLISHED;
    this.clearHandshakeTimer();
    this.emit('established');
  }

  private handleSessionOk(): void {
    // If we're already established (we sent our own SESSION_OK), this is the peer's confirmation
    if (this.data.state === WhisperState.ESTABLISHED) return;
    // Otherwise we might get this before our own verify completes — ignore
  }

  private handleClose(msg: codec.ControlMessage): void {
    this.data.state = WhisperState.IDLE;
    this.clearHandshakeTimer();
    this.emit('closed', `peer-closed: ${msg.reason}`);
  }

  private handleReject(msg: codec.ControlMessage): void {
    this.data.state = WhisperState.IDLE;
    this.clearHandshakeTimer();
    this.emit('closed', `rejected: ${msg.reason}`);
  }

  /** Encrypt and send a plaintext message. */
  sendMessage(plaintext: string): void {
    if (this.data.state !== WhisperState.ESTABLISHED || !this.data.sessionKey) return;

    const buf = Buffer.from(plaintext, 'utf-8');
    const { iv, ciphertext, authTag } = wCrypto.encrypt(buf, this.data.sessionKey, this.data.txSeq);
    const frame = codec.encodeDataFrame(this.data.txSeq, iv, ciphertext, authTag);
    this.data.txSeq++;
    this.data.lastActivity = Date.now();
    this.emit('send-data', frame);
  }

  /** Decrypt an incoming data frame. */
  handleDataFrame(frame: codec.DataFrame): string | null {
    if (this.data.state !== WhisperState.ESTABLISHED || !this.data.sessionKey) return null;

    try {
      const plaintext = wCrypto.decrypt(frame.ciphertext, frame.iv, frame.authTag, this.data.sessionKey);
      this.data.rxSeq++;
      this.data.lastActivity = Date.now();
      const text = plaintext.toString('utf-8');
      this.emit('message', text);
      return text;
    } catch (err) {
      this.emit('error', new Error('Decryption failed'));
      return null;
    }
  }

  /** Gracefully close the session. */
  close(reason: CloseReason = CloseReason.NORMAL): void {
    if (this.data.state === WhisperState.IDLE) return;
    this.emit('send-control', codec.encodeClose(this._localClawId, reason));
    this.data.state = WhisperState.IDLE;
    this.clearHandshakeTimer();
    this.emit('closed', `local-close: ${reason}`);
  }

  private startHandshakeTimer(): void {
    this.handshakeTimer = setTimeout(() => {
      if (this.data.state !== WhisperState.ESTABLISHED && this.data.state !== WhisperState.IDLE) {
        this.close(CloseReason.TIMEOUT);
      }
    }, this._handshakeTimeoutMs);
  }

  private clearHandshakeTimer(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
  }
}
