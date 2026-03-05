import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AgentBackend, AgentBackendStatus } from './backend';
import { GatewayBridge } from '../gateway/bridge';
import { EncounterEvent } from '../encounter/types';

export interface OpenClawOptions {
  gatewayUrl: string;
  authToken: string;
}

export class OpenClawBackend extends AgentBackend {
  readonly type = 'openclaw';
  readonly displayName = 'OpenClaw Gateway';

  private bridge: GatewayBridge | null = null;
  private _connected = false;

  /** Try to read the gateway token from ~/.openclaw/openclaw.json */
  static autoDetectToken(): string {
    try {
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return config?.gateway?.auth?.token || '';
      }
    } catch { /* ignore */ }
    return '';
  }

  connect(options: Record<string, unknown>): void {
    const opts = options as unknown as OpenClawOptions;
    const url = opts.gatewayUrl || '';
    let token = opts.authToken || '';
    if (!token) token = OpenClawBackend.autoDetectToken();

    this.bridge = new GatewayBridge(url, token);

    this.bridge.on('status', (status: string) => {
      this._connected = status === 'connected';
      this.emit('status', this.getStatus());
    });

    this.bridge.on('error', (err: Error) => {
      this.emit('error', err);
    });

    if (url) {
      this.bridge.connect();
    }
  }

  deliverEncounter(event: EncounterEvent, message: string): void {
    if (!this.bridge?.connected) return;

    this.bridge.sendRpc('agent', {
      message,
      agentId: 'main',
      idempotencyKey: `aura-encounter-${event.peer.clawId}-${event.timestamp}`,
    }).catch(() => { /* fire-and-forget */ });
    console.log(`[OpenClaw] Sent encounter to agent: clawId=${event.peer.clawId}`);
  }

  async query(prompt: string, systemPrompt?: string): Promise<string | null> {
    if (!this.bridge?.connected) return null;

    const params: Record<string, unknown> = {
      message: prompt,
      agentId: 'main',
      idempotencyKey: `aura-query-${Date.now()}`,
      sessionKey: 'aura-internal',
    };
    if (systemPrompt) {
      params.extraSystemPrompt = systemPrompt;
    }

    try {
      const result = await this.bridge.sendRpc('agent', params, {
        expectFinal: true,
        timeoutMs: 120_000,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payloads = (result as any)?.result?.payloads;
      return payloads?.[0]?.text || null;
    } catch (err) {
      console.error('[OpenClaw] Query failed:', (err as Error).message);
      return null;
    }
  }

  getStatus(): AgentBackendStatus {
    return {
      connected: this._connected,
      statusText: this._connected ? 'connected' : 'disconnected',
    };
  }

  updateOptions(options: Partial<Record<string, unknown>>): void {
    if (!this.bridge) return;
    const opts = options as Partial<OpenClawOptions>;
    if (opts.gatewayUrl !== undefined) {
      this.bridge.updateUrl(opts.gatewayUrl);
    }
    if (opts.authToken !== undefined) {
      this.bridge.updateAuthToken(opts.authToken);
    }
  }

  disconnect(): void {
    this._connected = false;
    this.bridge?.disconnect();
    this.bridge = null;
  }
}
