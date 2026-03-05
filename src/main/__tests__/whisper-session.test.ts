import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WhisperSession } from '../whisper/session';
import { WhisperState, CloseReason, RejectReason } from '../whisper/types';
import { decodeControlMessage, decodeDataFrame } from '../whisper/codec';

/**
 * Wire two WhisperSession instances together via a message queue.
 *
 * Uses a queue instead of synchronous delivery to model the real BLE transport:
 * messages emitted during one handler call don't get delivered until the current
 * handler returns. Call flush() to deliver all queued messages (and any messages
 * those deliveries produce, transitively).
 */
function wireSessionPair(initiator: WhisperSession, responder: WhisperSession) {
  const queue: Array<() => void> = [];

  initiator.on('send-control', (data: Buffer) => {
    queue.push(() => {
      const msg = decodeControlMessage(data);
      if (msg) responder.handleControlMessage(msg);
    });
  });

  responder.on('send-control', (data: Buffer) => {
    queue.push(() => {
      const msg = decodeControlMessage(data);
      if (msg) initiator.handleControlMessage(msg);
    });
  });

  initiator.on('send-data', (data: Buffer) => {
    queue.push(() => {
      const frame = decodeDataFrame(data);
      if (frame) responder.handleDataFrame(frame);
    });
  });

  responder.on('send-data', (data: Buffer) => {
    queue.push(() => {
      const frame = decodeDataFrame(data);
      if (frame) initiator.handleDataFrame(frame);
    });
  });

  return {
    /** Deliver all queued messages (drains transitively). */
    flush() {
      while (queue.length > 0) {
        const fn = queue.shift()!;
        fn();
      }
    },
  };
}

describe('WhisperSession integration (two sessions wired)', () => {
  const aliceClawId = Buffer.from('a1b2c3d4', 'hex');
  const bobClawId = Buffer.from('e5f6a7b8', 'hex');

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('full handshake: both reach ESTABLISHED', () => {
    const initiator = new WhisperSession('initiator', aliceClawId, 'e5f6a7b8', 15000);
    const responder = new WhisperSession('responder', bobClawId, 'a1b2c3d4', 15000);

    const initEstablished = vi.fn();
    const respEstablished = vi.fn();
    initiator.on('established', initEstablished);
    responder.on('established', respEstablished);

    const wire = wireSessionPair(initiator, responder);

    // Initiator sends HELLO
    initiator.startHandshake();
    wire.flush(); // HELLO → responder

    // Responder accepts → HELLO_ACK + KEY_EXCHANGE
    responder.acceptHandshake();
    wire.flush(); // HELLO_ACK → initiator → KEY_EXCHANGE, KEY_EXCHANGE → initiator, etc.

    expect(initiator.state).toBe(WhisperState.ESTABLISHED);
    expect(responder.state).toBe(WhisperState.ESTABLISHED);
    expect(initEstablished).toHaveBeenCalled();
    expect(respEstablished).toHaveBeenCalled();
  });

  it('bidirectional messaging after handshake', () => {
    const initiator = new WhisperSession('initiator', aliceClawId, 'e5f6a7b8', 15000);
    const responder = new WhisperSession('responder', bobClawId, 'a1b2c3d4', 15000);

    const wire = wireSessionPair(initiator, responder);

    initiator.startHandshake();
    wire.flush();
    responder.acceptHandshake();
    wire.flush();
    expect(initiator.state).toBe(WhisperState.ESTABLISHED);

    // Initiator → Responder
    const respMessages: string[] = [];
    responder.on('message', (text: string) => respMessages.push(text));

    initiator.sendMessage('Hello from Alice!');
    wire.flush();
    expect(respMessages).toEqual(['Hello from Alice!']);

    // Responder → Initiator
    const initMessages: string[] = [];
    initiator.on('message', (text: string) => initMessages.push(text));

    responder.sendMessage('Hello from Bob!');
    wire.flush();
    expect(initMessages).toEqual(['Hello from Bob!']);
  });

  it('multi-message exchange (5+ each direction)', () => {
    const initiator = new WhisperSession('initiator', aliceClawId, 'e5f6a7b8', 15000);
    const responder = new WhisperSession('responder', bobClawId, 'a1b2c3d4', 15000);

    const wire = wireSessionPair(initiator, responder);

    initiator.startHandshake();
    wire.flush();
    responder.acceptHandshake();
    wire.flush();

    const respMessages: string[] = [];
    const initMessages: string[] = [];
    responder.on('message', (text: string) => respMessages.push(text));
    initiator.on('message', (text: string) => initMessages.push(text));

    for (let i = 0; i < 7; i++) {
      initiator.sendMessage(`Alice msg ${i}`);
      wire.flush();
      responder.sendMessage(`Bob msg ${i}`);
      wire.flush();
    }

    expect(respMessages).toHaveLength(7);
    expect(initMessages).toHaveLength(7);

    for (let i = 0; i < 7; i++) {
      expect(respMessages[i]).toBe(`Alice msg ${i}`);
      expect(initMessages[i]).toBe(`Bob msg ${i}`);
    }
  });

  it('reject flow: responder rejects, initiator gets closed', () => {
    const initiator = new WhisperSession('initiator', aliceClawId, 'e5f6a7b8', 15000);
    const responder = new WhisperSession('responder', bobClawId, 'a1b2c3d4', 15000);

    const wire = wireSessionPair(initiator, responder);

    const initClosed = vi.fn();
    initiator.on('closed', initClosed);

    initiator.startHandshake();
    wire.flush();
    responder.rejectHandshake(RejectReason.DECLINED);
    wire.flush();

    expect(initClosed).toHaveBeenCalledWith(expect.stringContaining('rejected'));
    expect(responder.state).toBe(WhisperState.IDLE);
  });

  it('close from initiator: responder gets closed event', () => {
    const initiator = new WhisperSession('initiator', aliceClawId, 'e5f6a7b8', 15000);
    const responder = new WhisperSession('responder', bobClawId, 'a1b2c3d4', 15000);

    const wire = wireSessionPair(initiator, responder);

    initiator.startHandshake();
    wire.flush();
    responder.acceptHandshake();
    wire.flush();
    expect(initiator.state).toBe(WhisperState.ESTABLISHED);

    const respClosed = vi.fn();
    responder.on('closed', respClosed);

    initiator.close(CloseReason.AGENT_REQUESTED);
    wire.flush();

    expect(respClosed).toHaveBeenCalledWith(expect.stringContaining('peer-closed'));
    expect(initiator.state).toBe(WhisperState.IDLE);
  });

  it('close from responder: initiator gets closed event', () => {
    const initiator = new WhisperSession('initiator', aliceClawId, 'e5f6a7b8', 15000);
    const responder = new WhisperSession('responder', bobClawId, 'a1b2c3d4', 15000);

    const wire = wireSessionPair(initiator, responder);

    initiator.startHandshake();
    wire.flush();
    responder.acceptHandshake();
    wire.flush();

    const initClosed = vi.fn();
    initiator.on('closed', initClosed);

    responder.close(CloseReason.NORMAL);
    wire.flush();

    expect(initClosed).toHaveBeenCalledWith(expect.stringContaining('peer-closed'));
    expect(responder.state).toBe(WhisperState.IDLE);
  });

  it('handshake timeout: session closes on timeout', () => {
    const initiator = new WhisperSession('initiator', aliceClawId, 'e5f6a7b8', 5000);
    // Don't wire — responder never responds

    const initClosed = vi.fn();
    initiator.on('closed', initClosed);

    initiator.startHandshake();
    expect(initiator.state).toBe(WhisperState.HELLO_SENT);

    vi.advanceTimersByTime(6000);

    expect(initClosed).toHaveBeenCalled();
    expect(initiator.state).toBe(WhisperState.IDLE);
  });

  it('startHandshake is no-op when not IDLE initiator', () => {
    const initiator = new WhisperSession('initiator', aliceClawId, 'e5f6a7b8', 15000);
    const responder = new WhisperSession('responder', bobClawId, 'a1b2c3d4', 15000);

    const wire = wireSessionPair(initiator, responder);

    initiator.startHandshake();
    wire.flush();
    responder.acceptHandshake();
    wire.flush();
    expect(initiator.state).toBe(WhisperState.ESTABLISHED);

    // Calling startHandshake again should be no-op
    initiator.startHandshake();
    expect(initiator.state).toBe(WhisperState.ESTABLISHED);
  });

  it('startHandshake is no-op for responder role', () => {
    const responder = new WhisperSession('responder', bobClawId, 'a1b2c3d4', 15000);
    const controlSent = vi.fn();
    responder.on('send-control', controlSent);

    responder.startHandshake();
    expect(controlSent).not.toHaveBeenCalled();
    expect(responder.state).toBe(WhisperState.IDLE);
  });

  it('sendMessage is no-op before ESTABLISHED', () => {
    const initiator = new WhisperSession('initiator', aliceClawId, 'e5f6a7b8', 15000);
    const dataSent = vi.fn();
    initiator.on('send-data', dataSent);

    initiator.sendMessage('should not send');
    expect(dataSent).not.toHaveBeenCalled();
  });

  it('preserves UTF-8 messages through crypto roundtrip', () => {
    const initiator = new WhisperSession('initiator', aliceClawId, 'e5f6a7b8', 15000);
    const responder = new WhisperSession('responder', bobClawId, 'a1b2c3d4', 15000);

    const wire = wireSessionPair(initiator, responder);
    initiator.startHandshake();
    wire.flush();
    responder.acceptHandshake();
    wire.flush();

    const messages: string[] = [];
    responder.on('message', (t: string) => messages.push(t));

    const unicodeMsg = 'Café ☕ 你好 🚀 Héllo Wörld';
    initiator.sendMessage(unicodeMsg);
    wire.flush();
    expect(messages[0]).toBe(unicodeMsg);
  });

  it('close on already-idle session is no-op', () => {
    const session = new WhisperSession('initiator', aliceClawId, 'e5f6a7b8', 15000);
    const controlSent = vi.fn();
    session.on('send-control', controlSent);

    session.close(); // already IDLE
    expect(controlSent).not.toHaveBeenCalled();
  });
});
