import { EventEmitter } from 'events';
import { BeaconPayload } from '../beacon';

export interface DiscoveredBeacon {
  peripheralId: string;
  rssi: number;
  payload: BeaconPayload;
  timestamp: number;
}

export type ConnectionHook = (peripheral: any) => Promise<void>;

export interface IAdvertiser extends EventEmitter {
  updatePayload(payload: Buffer): void;
  addService(service: any): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly advertising: boolean;
}

export interface IScanner extends EventEmitter {
  addConnectionHook(hook: ConnectionHook): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly scanning: boolean;
}
