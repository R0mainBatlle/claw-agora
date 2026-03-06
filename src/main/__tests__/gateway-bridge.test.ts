import { beforeEach, describe, expect, it, vi } from 'vitest';

const wsState = vi.hoisted(() => {
  const instances: MockWebSocket[] = [];

  class MockWebSocket {
    static OPEN = 1;
    readyState = MockWebSocket.OPEN;
    handlers = new Map<string, Function[]>();

    constructor(public url: string) {
      instances.push(this);
    }

    on(event: string, handler: Function): void {
      const current = this.handlers.get(event) || [];
      current.push(handler);
      this.handlers.set(event, current);
    }

    send(_data: string): void {}

    close(): void {}
  }

  return { MockWebSocket, instances };
});

vi.mock('ws', () => ({
  default: wsState.MockWebSocket,
}));

import { GatewayBridge } from '../gateway/bridge';

describe('GatewayBridge URL policy', () => {
  beforeEach(() => {
    wsState.instances.length = 0;
  });

  it('refuses insecure remote ws:// URLs', () => {
    const bridge = new GatewayBridge('ws://example.com:18789', '');
    const errors: string[] = [];
    const statuses: string[] = [];

    bridge.on('error', (err: Error) => errors.push(err.message));
    bridge.on('status', (status: string) => statuses.push(status));

    bridge.connect();

    expect(wsState.instances).toHaveLength(0);
    expect(errors).toContain('Refusing insecure remote ws:// gateway URL; use wss:// or localhost');
    expect(statuses).toContain('disconnected');
  });

  it('allows loopback ws:// URLs', () => {
    const bridge = new GatewayBridge('ws://127.0.0.1:18789', '');
    const errors: string[] = [];

    bridge.on('error', (err: Error) => errors.push(err.message));
    bridge.connect();

    expect(wsState.instances).toHaveLength(1);
    expect(wsState.instances[0].url).toBe('ws://127.0.0.1:18789');
    expect(errors).toHaveLength(0);
  });
});
