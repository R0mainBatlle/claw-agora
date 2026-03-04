import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { createRpcRequest, parseMessage, GatewayMessage } from './protocol';
import { EncounterEvent } from '../encounter/types';

interface PendingRpc {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class GatewayBridge extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private authToken: string;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private shouldReconnect = false;
  private pendingRpcs = new Map<string, PendingRpc>();

  constructor(url: string, authToken: string) {
    super();
    this.url = url;
    this.authToken = authToken;
  }

  connect(): void {
    if (!this.url) return;
    this.shouldReconnect = true;
    this.doConnect();
  }

  private doConnect(): void {
    if (!this.url) return;

    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      this.emit('error', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.reconnectDelay = 1000;
      this.emit('status', 'connected');
    });

    this.ws.on('message', (data) => {
      const msg = parseMessage(data.toString());
      if (!msg) return;
      this.handleMessage(msg);
    });

    this.ws.on('close', () => {
      this.emit('status', 'disconnected');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      this.emit('error', err);
    });
  }

  private handleMessage(msg: GatewayMessage): void {
    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      const req = createRpcRequest('connect', {
        role: 'node',
        caps: ['encounter-report'],
        token: this.authToken || 'phase1-stub',
        platform: 'macos',
        version: '0.1.0',
      });
      this.send(req);
    } else if (msg.type === 'res') {
      const pending = this.pendingRpcs.get(msg.id);
      if (pending) {
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

  async sendRpc(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const req = createRpcRequest(method, params);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRpcs.delete(req.id);
        reject(new Error('RPC timeout'));
      }, 10000);
      this.pendingRpcs.set(req.id, { resolve, reject, timer });
      this.send(req);
    });
  }

  sendEncounterEvent(event: EncounterEvent): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const req = createRpcRequest('encounter.report', {
      event: event.type,
      clawId: event.peer.clawId,
      intentHash: event.peer.intentHash,
      flags: event.peer.flags,
      rssi: event.peer.rssi,
      firstSeen: event.peer.firstSeen,
      lastSeen: event.peer.lastSeen,
      timestamp: event.timestamp,
    });
    this.send(req);
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
}
