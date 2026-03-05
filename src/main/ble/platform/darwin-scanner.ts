import { EventEmitter } from 'events';
import {
  AURA_SERVICE_UUID,
  AURA_BEACON_CHARACTERISTIC_UUID,
  GATT_READ_TIMEOUT_MS,
  READ_COOLDOWN_MS,
} from '../constants';
import { decodeBeacon } from '../beacon';
import type { IScanner, ConnectionHook, DiscoveredBeacon } from './types';

function stripDashes(uuid: string): string {
  return uuid.replace(/-/g, '');
}

export class DarwinScanner extends EventEmitter implements IScanner {
  private noble: any;
  private isScanning = false;
  private readCache = new Map<string, number>();
  private activeReads = new Set<string>();
  private connectionHooks: ConnectionHook[] = [];

  constructor() {
    super();
    this.noble = require('@stoprocent/noble');
  }

  addConnectionHook(hook: ConnectionHook): void {
    this.connectionHooks.push(hook);
  }

  async start(): Promise<void> {
    const noble = this.noble;
    await noble.waitForPoweredOnAsync();

    noble.on('discover', (peripheral: any) => this.onDiscover(peripheral));

    await noble.startScanningAsync(
      [stripDashes(AURA_SERVICE_UUID)],
      true,
    );

    this.isScanning = true;
    this.emit('scanning-started');
    console.log('[Scanner] BLE scanning started via CoreBluetooth');
  }

  private async onDiscover(peripheral: any): Promise<void> {
    const id = peripheral.id;
    const now = Date.now();
    const lastRead = this.readCache.get(id) || 0;

    if (now - lastRead < READ_COOLDOWN_MS) {
      this.emit('rssi-update', { peripheralId: id, rssi: peripheral.rssi });
      return;
    }

    if (this.activeReads.has(id)) return;
    this.activeReads.add(id);

    try {
      const connectPromise = peripheral.connectAsync();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connect timeout')), GATT_READ_TIMEOUT_MS),
      );
      await Promise.race([connectPromise, timeoutPromise]);

      try {
        const serviceUUID = stripDashes(AURA_SERVICE_UUID);
        const charUUID = stripDashes(AURA_BEACON_CHARACTERISTIC_UUID);

        const { characteristics } =
          await peripheral.discoverSomeServicesAndCharacteristicsAsync(
            [serviceUUID],
            [charUUID],
          );

        if (!characteristics || characteristics.length === 0) return;

        const data = await characteristics[0].readAsync();
        const payload = decodeBeacon(data);
        if (payload) {
          this.readCache.set(id, now);
          this.emit('beacon-discovered', {
            peripheralId: id,
            rssi: peripheral.rssi,
            payload,
            timestamp: now,
          } as DiscoveredBeacon);
        }

        // Run connection hooks while still connected
        for (const hook of this.connectionHooks) {
          try { await hook(peripheral); } catch (err) {
            console.warn(`[Scanner] Connection hook error for ${id}:`, (err as Error).message);
          }
        }
      } finally {
        try { await peripheral.disconnectAsync(); } catch { /* best effort */ }
      }
    } catch (err) {
      this.emit('read-error', { peripheralId: id, error: err });
    } finally {
      this.activeReads.delete(id);
    }
  }

  async stop(): Promise<void> {
    if (this.isScanning) {
      this.noble.removeAllListeners('discover');
      await this.noble.stopScanningAsync();
      this.isScanning = false;
      this.emit('scanning-stopped');
    }
  }

  get scanning(): boolean {
    return this.isScanning;
  }
}
