import { v4 as uuidv4 } from 'uuid';

export interface RpcRequest {
  type: 'req';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface RpcResponse {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: { code: string; message: string };
}

export interface GatewayEvent {
  type: 'event';
  event: string;
  payload: Record<string, unknown>;
}

export type GatewayMessage = RpcRequest | RpcResponse | GatewayEvent;

export function createRpcRequest(method: string, params: Record<string, unknown>): RpcRequest {
  return { type: 'req', id: uuidv4(), method, params };
}

export function parseMessage(raw: string): GatewayMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.type === 'req' || parsed.type === 'res' || parsed.type === 'event') {
      return parsed as GatewayMessage;
    }
    return null;
  } catch {
    return null;
  }
}
