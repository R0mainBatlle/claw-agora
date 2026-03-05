import dbus, { Variant, MessageBus } from 'dbus-next';
import { EventEmitter } from 'events';
import { AURA_SERVICE_UUID, AURA_BEACON_CHARACTERISTIC_UUID } from '../constants';
import type { IAdvertiser } from './types';

const { Interface } = dbus.interface;

const BLUEZ = 'org.bluez';
const ADAPTER_PATH = '/org/bluez/hci0';
const AD_PATH = '/com/aura/advertisement0';
const APP_PATH = '/com/aura';
const SERVICE_PATH = '/com/aura/service0';
const CHAR_PATH = '/com/aura/service0/char0';

// ── LE Advertisement ──

class LEAdvertisement extends Interface {
  Type = 'peripheral';
  ServiceUUIDs = [AURA_SERVICE_UUID];
  LocalName = 'Aura';
  ServiceData: Record<string, Variant> = {};

  Release(): void {}
}

LEAdvertisement.configureMembers({
  properties: {
    Type: { signature: 's', access: 'read' },
    ServiceUUIDs: { signature: 'as', access: 'read' },
    LocalName: { signature: 's', access: 'read' },
    ServiceData: { signature: 'a{sv}', access: 'read' },
  },
  methods: {
    Release: { inSignature: '', outSignature: '' },
  },
});

// ── GATT Application (ObjectManager) ──

class GattApplication extends Interface {
  private objects: Record<string, Record<string, Record<string, Variant>>>;

  constructor(objects: Record<string, Record<string, Record<string, Variant>>>) {
    super('org.freedesktop.DBus.ObjectManager');
    this.objects = objects;
  }

  GetManagedObjects(): Record<string, Record<string, Record<string, Variant>>> {
    return this.objects;
  }
}

GattApplication.configureMembers({
  methods: {
    GetManagedObjects: { inSignature: '', outSignature: 'a{oa{sa{sv}}}' },
  },
});

// ── GATT Service ──

class GattService extends Interface {
  UUID = AURA_SERVICE_UUID;
  Primary = true;
  Characteristics: string[] = [CHAR_PATH];
}

GattService.configureMembers({
  properties: {
    UUID: { signature: 's', access: 'read' },
    Primary: { signature: 'b', access: 'read' },
    Characteristics: { signature: 'ao', access: 'read' },
  },
});

// ── GATT Characteristic (beacon payload, read-only) ──

class BeaconCharacteristic extends Interface {
  UUID = AURA_BEACON_CHARACTERISTIC_UUID;
  Service = SERVICE_PATH;
  Flags = ['read'];
  private payload: Buffer = Buffer.alloc(24);

  setPayload(buf: Buffer): void {
    this.payload = buf;
  }

  ReadValue(_options: Record<string, Variant>): number[] {
    return [...this.payload];
  }
}

BeaconCharacteristic.configureMembers({
  properties: {
    UUID: { signature: 's', access: 'read' },
    Service: { signature: 'o', access: 'read' },
    Flags: { signature: 'as', access: 'read' },
  },
  methods: {
    ReadValue: { inSignature: 'a{sv}', outSignature: 'ay' },
  },
});

// ── Advertiser ──

export class LinuxAdvertiser extends EventEmitter implements IAdvertiser {
  private bus: MessageBus | null = null;
  private advertisement: LEAdvertisement | null = null;
  private beaconChar: BeaconCharacteristic | null = null;
  private isAdvertisingFlag = false;
  private pendingPayload: Buffer = Buffer.alloc(24);

  addService(_service: any): void {
    // Agora/Whisper GATT services use bleno types (macOS-only).
    // Linux GATT support for these services is not yet implemented.
    console.warn('[Advertiser] addService() not yet implemented for Linux');
  }

  updatePayload(payload: Buffer): void {
    this.pendingPayload = payload;
    if (this.advertisement) {
      this.advertisement.ServiceData = {
        [AURA_SERVICE_UUID]: new Variant('ay', [...payload]),
      };
    }
    if (this.beaconChar) {
      this.beaconChar.setPayload(payload);
    }
  }

  async start(): Promise<void> {
    this.bus = dbus.systemBus();

    // --- LE Advertisement ---
    this.advertisement = new LEAdvertisement('org.bluez.LEAdvertisement1');
    this.advertisement.ServiceData = {
      [AURA_SERVICE_UUID]: new Variant('ay', [...this.pendingPayload]),
    };
    this.bus.export(AD_PATH, this.advertisement);

    // --- GATT Service + Characteristic ---
    const gattService = new GattService('org.bluez.GattService1');
    this.bus.export(SERVICE_PATH, gattService);

    this.beaconChar = new BeaconCharacteristic('org.bluez.GattCharacteristic1');
    this.beaconChar.setPayload(this.pendingPayload);
    this.bus.export(CHAR_PATH, this.beaconChar);

    // --- GATT Application (ObjectManager for BlueZ) ---
    const managedObjects: Record<string, Record<string, Record<string, Variant>>> = {
      [SERVICE_PATH]: {
        'org.bluez.GattService1': {
          UUID: new Variant('s', AURA_SERVICE_UUID),
          Primary: new Variant('b', true),
        },
      },
      [CHAR_PATH]: {
        'org.bluez.GattCharacteristic1': {
          UUID: new Variant('s', AURA_BEACON_CHARACTERISTIC_UUID),
          Service: new Variant('o', SERVICE_PATH),
          Flags: new Variant('as', ['read']),
        },
      },
    };

    const gattApp = new GattApplication(managedObjects);
    this.bus.export(APP_PATH, gattApp);

    // --- Register with BlueZ ---
    const bluez = await this.bus.getProxyObject(BLUEZ, ADAPTER_PATH);

    const gattMgr = bluez.getInterface('org.bluez.GattManager1');
    await gattMgr.RegisterApplication(APP_PATH, {});
    console.log('[Advertiser] GATT application registered');

    const adManager = bluez.getInterface('org.bluez.LEAdvertisingManager1');
    await adManager.RegisterAdvertisement(AD_PATH, {});

    this.isAdvertisingFlag = true;
    this.emit('advertising-started');
    console.log('[Advertiser] BLE advertising started via BlueZ DBus');
  }

  async stop(): Promise<void> {
    if (!this.isAdvertisingFlag || !this.bus) return;

    try {
      const bluez = await this.bus.getProxyObject(BLUEZ, ADAPTER_PATH);
      const adManager = bluez.getInterface('org.bluez.LEAdvertisingManager1');
      await adManager.UnregisterAdvertisement(AD_PATH).catch(() => {});
      const gattMgr = bluez.getInterface('org.bluez.GattManager1');
      await gattMgr.UnregisterApplication(APP_PATH).catch(() => {});
    } catch {
      // best effort
    }

    this.bus.disconnect();
    this.bus = null;
    this.isAdvertisingFlag = false;
    this.emit('advertising-stopped');
  }

  get advertising(): boolean {
    return this.isAdvertisingFlag;
  }
}
