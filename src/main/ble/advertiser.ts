import bleno, { ConnectionHandle, ReadRequestCallback } from '@stoprocent/bleno';
import { EventEmitter } from 'events';
import { AURA_SERVICE_UUID, AURA_BEACON_CHARACTERISTIC_UUID, stripUUID } from './constants';

const { PrimaryService, Characteristic } = bleno;

export class Advertiser extends EventEmitter {
  private currentPayload: Buffer = Buffer.alloc(24);
  private isAdvertising = false;

  updatePayload(payload: Buffer): void {
    this.currentPayload = payload;
  }

  async start(): Promise<void> {
    await bleno.waitForPoweredOnAsync();

    const serviceUUID = stripUUID(AURA_SERVICE_UUID);
    const charUUID = stripUUID(AURA_BEACON_CHARACTERISTIC_UUID);

    const beaconCharacteristic = new Characteristic({
      uuid: charUUID,
      properties: ['read'],
      onReadRequest: (_handle: ConnectionHandle, offset: number, callback: ReadRequestCallback) => {
        callback(Characteristic.RESULT_SUCCESS, this.currentPayload.subarray(offset));
      },
    });

    const auraService = new PrimaryService({
      uuid: serviceUUID,
      characteristics: [beaconCharacteristic],
    });

    await bleno.setServicesAsync([auraService]);
    await bleno.startAdvertisingAsync('Aura', [serviceUUID]);

    this.isAdvertising = true;
    this.emit('advertising-started');
  }

  async stop(): Promise<void> {
    if (this.isAdvertising) {
      bleno.stopAdvertising();
      this.isAdvertising = false;
      this.emit('advertising-stopped');
    }
  }

  get advertising(): boolean {
    return this.isAdvertising;
  }
}
