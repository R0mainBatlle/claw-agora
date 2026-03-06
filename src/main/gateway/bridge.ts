import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { createRpcRequest, parseMessage, GatewayMessage } from './protocol';


interface PendingRpc {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  expectFinal?: boolean;
}

export class GatewayBridge extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private authToken: string;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private shouldReconnect = false;
  private pendingRpcs = new Map<string, PendingRpc>();
  private loggedDisconnect = false;

  constructor(url: string, authToken: string) {
    super();
    this.url = url;
    this.authToken = authToken;
  }

  connect(): void {
    if (!this.url) return;
    if (!this.isAllowedUrl(this.url)) {
      this.emit('status', 'disconnected');
      return;
    }
    this.shouldReconnect = true;
    this.doConnect();
  }

  private doConnect(): void {
    if (!this.url) return;
    if (!this.isAllowedUrl(this.url)) return;

    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      this.emit('error', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.reconnectDelay = 1000;
      this.loggedDisconnect = false;
    });

    this.ws.on('message', (data) => {
      const msg = parseMessage(data.toString());
      if (!msg) return;
      this.handleMessage(msg);
    });

    this.ws.on('close', (code, reason) => {
      const reasonStr = reason ? reason.toString() : 'no reason';
      if (!this.loggedDisconnect) {
        this.loggedDisconnect = true;
        console.log(`[Gateway] Closed (code=${code}, reason=${reasonStr})`);
        this.emit('status', 'disconnected');
      }
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      if (!this.loggedDisconnect) {
        this.emit('error', err);
      }
    });
  }

  private handleMessage(msg: GatewayMessage): void {
    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      const req = createRpcRequest('connect', {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'gateway-client',
          version: '0.1.0',
          platform: 'macos',
          mode: 'backend',
        },
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
        ...(this.authToken ? { auth: { token: this.authToken } } : {}),
      });
      this.send(req);
    } else if (msg.type === 'res' && msg.id && !this.pendingRpcs.has(msg.id)) {
      // Connect response (not a tracked RPC)
      if (msg.ok) {
        console.log('[Gateway] Connected');
        this.emit('status', 'connected');
      } else {
        console.error('[Gateway] Connect failed:', msg.error?.message);
      }
    } else if (msg.type === 'res') {
      const pending = this.pendingRpcs.get(msg.id);
      if (pending) {
        // Two-phase response: skip the "accepted" ack, wait for final
        if (pending.expectFinal && msg.ok && msg.payload?.status === 'accepted') {
          return;
        }
        clearTimeout(pending.timer);
        this.pendingRpcs.delete(msg.id);
        if (msg.ok) {
          pending.resolve(msg.payload || {});
        } else {
          pending.reject(new Error(msg.error?.message || 'RPC failed'));
        }
      }
    } else if (msg.type === 'event') {
      this.emit('gateway-event', msg);
    }
  }

  async sendRpc(
    method: string,
    params: Record<string, unknown>,
    opts?: { expectFinal?: boolean; timeoutMs?: number },
  ): Promise<Record<string, unknown>> {
    const req = createRpcRequest(method, params);
    const timeoutMs = opts?.timeoutMs || 10000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRpcs.delete(req.id);
        reject(new Error('RPC timeout'));
      }, timeoutMs);
      this.pendingRpcs.set(req.id, {
        resolve,
        reject,
        timer,
        expectFinal: opts?.expectFinal,
      });
      this.send(req);
    });
  }

  /** Send a raw message object over the WebSocket. Used by backend adapters. */
  sendRaw(msg: object): void {
    this.send(msg);
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    setTimeout(() => {
      if (this.shouldReconnect) this.doConnect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  updateUrl(url: string): void {
    this.url = url;
    if (this.ws) {
      this.ws.close();
      // Will auto-reconnect with new URL
    }
  }

  updateAuthToken(token: string): void {
    this.authToken = token;
  }

  disconnect(): void {
    this.shouldReconnect = false;
    for (const pending of this.pendingRpcs.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Disconnecting'));
    }
    this.pendingRpcs.clear();
    this.ws?.close();
    this.ws = null;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private isAllowedUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'wss:') return true;
      if (parsed.protocol !== 'ws:') {
        this.emit('error', new Error(`Unsupported gateway protocol: ${parsed.protocol}`));
        return false;
      }

      const hostname = parsed.hostname.toLowerCase();
      const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
      if (isLoopback) return true;

      this.emit('error', new Error('Refusing insecure remote ws:// gateway URL; use wss:// or localhost'));
      return false;
    } catch {
      this.emit('error', new Error('Invalid gateway URL'));
      return false;
    }
  }
}
