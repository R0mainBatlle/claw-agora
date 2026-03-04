import noble, { Peripheral } from '@stoprocent/noble';
import { EventEmitter } from 'events';
import {
  AURA_SERVICE_UUID,
  AURA_BEACON_CHARACTERISTIC_UUID,
  GATT_READ_TIMEOUT_MS,
  READ_COOLDOWN_MS,
  stripUUID,
} from './constants';
import { decodeBeacon, BeaconPayload } from './beacon';

export interface DiscoveredBeacon {
  peripheralId: string;
  rssi: number;
  payload: BeaconPayload;
  timestamp: number;
}

export class Scanner extends EventEmitter {
  private isScanning = false;
  private readCache = new Map<string, number>();
  private activeReads = new Set<string>();

  async start(): Promise<void> {
    await noble.waitForPoweredOnAsync();

    noble.on('discover', (peripheral: Peripheral) => this.onDiscover(peripheral));

    await noble.startScanningAsync(
      [stripUUID(AURA_SERVICE_UUID)],
      true, // allowDuplicates — keeps emitting for RSSI updates
    );

    this.isScanning = true;
    this.emit('scanning-started');
  }

  private async onDiscover(peripheral: Peripheral): Promise<void> {
    const id = peripheral.id;
    const now = Date.now();
    const lastRead = this.readCache.get(id) || 0;

    if (now - lastRead < READ_COOLDOWN_MS) {
      this.emit('rssi-update', { peripheralId: id, rssi: peripheral.rssi });
      return;
    }

    // Avoid concurrent reads to the same peripheral
    if (this.activeReads.has(id)) return;
    this.activeReads.add(id);

    try {
      const payload = await this.readBeaconPayload(peripheral);
      if (payload) {
        this.readCache.set(id, now);
        this.emit('beacon-discovered', {
          peripheralId: id,
          rssi: peripheral.rssi,
          payload,
          timestamp: now,
        } as DiscoveredBeacon);
      }
    } catch (err) {
      this.emit('read-error', { peripheralId: id, error: err });
    } finally {
      this.activeReads.delete(id);
    }
  }

  private async readBeaconPayload(peripheral: Peripheral): Promise<BeaconPayload | null> {
    const connectPromise = peripheral.connectAsync();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connect timeout')), GATT_READ_TIMEOUT_MS),
    );
    await Promise.race([connectPromise, timeoutPromise]);

    try {
      const serviceUUID = stripUUID(AURA_SERVICE_UUID);
      const charUUID = stripUUID(AURA_BEACON_CHARACTERISTIC_UUID);

      const { characteristics } =
        await peripheral.discoverSomeServicesAndCharacteristicsAsync(
          [serviceUUID],
          [charUUID],
        );

      if (!characteristics || characteristics.length === 0) return null;

      const data = await characteristics[0].readAsync();
      return decodeBeacon(data);
    } finally {
      try {
        await peripheral.disconnectAsync();
      } catch {
        // best effort
      }
    }
  }

  async stop(): Promise<void> {
    if (this.isScanning) {
      noble.removeAllListeners('discover');
      await noble.stopScanningAsync();
      this.isScanning = false;
      this.emit('scanning-stopped');
    }
  }

  get scanning(): boolean {
    return this.isScanning;
  }
}
