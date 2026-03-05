import { EventEmitter } from 'events';
import { AURA_SERVICE_UUID, AURA_BEACON_CHARACTERISTIC_UUID } from '../constants';
import type { IAdvertiser } from './types';

function stripDashes(uuid: string): string {
  return uuid.replace(/-/g, '');
}

export class DarwinAdvertiser extends EventEmitter implements IAdvertiser {
  private currentPayload: Buffer = Buffer.alloc(24);
  private isAdvertisingFlag = false;
  private bleno: any;
  private extraServices: any[] = [];

  constructor() {
    super();
    this.bleno = require('@stoprocent/bleno');
  }

  updatePayload(payload: Buffer): void {
    this.currentPayload = payload;
  }

  addService(service: any): void {
    this.extraServices.push(service);
  }

  async start(): Promise<void> {
    const bleno = this.bleno;
    await bleno.waitForPoweredOnAsync();

    const serviceUUID = stripDashes(AURA_SERVICE_UUID);
    const charUUID = stripDashes(AURA_BEACON_CHARACTERISTIC_UUID);

    const beaconCharacteristic = new bleno.Characteristic({
      uuid: charUUID,
      properties: ['read'],
      onReadRequest: (_handle: any, offset: number, callback: any) => {
        callback(bleno.Characteristic.RESULT_SUCCESS, this.currentPayload.subarray(offset));
      },
    });

    const auraService = new bleno.PrimaryService({
      uuid: serviceUUID,
      characteristics: [beaconCharacteristic],
    });

    await bleno.setServicesAsync([auraService, ...this.extraServices]);
    await bleno.startAdvertisingAsync('Aura', [serviceUUID]);

    this.isAdvertisingFlag = true;
    this.emit('advertising-started');
    console.log('[Advertiser] BLE advertising started via CoreBluetooth');
  }

  async stop(): Promise<void> {
    if (this.isAdvertisingFlag) {
      this.bleno.stopAdvertising();
      this.isAdvertisingFlag = false;
      this.emit('advertising-stopped');
    }
  }

  get advertising(): boolean {
    return this.isAdvertisingFlag;
  }
}
