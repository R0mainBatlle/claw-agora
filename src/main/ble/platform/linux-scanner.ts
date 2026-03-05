import dbus, { Variant, MessageBus } from 'dbus-next';
import { EventEmitter } from 'events';
import {
  AURA_SERVICE_UUID,
  AURA_BEACON_CHARACTERISTIC_UUID,
  READ_COOLDOWN_MS,
} from '../constants';
import { decodeBeacon, BeaconPayload } from '../beacon';
import type { IScanner, ConnectionHook, DiscoveredBeacon } from './types';

const GATT_ATTEMPT_COOLDOWN_MS = 120_000;

const BLUEZ = 'org.bluez';
const ADAPTER_PATH = '/org/bluez/hci0';
const AGENT_PATH = '/com/aura/agent';

const { Interface } = dbus.interface;

// Auto-accept pairing agent (NoInputNoOutput)
class AutoAcceptAgent extends Interface {
  Release(): void {}
  RequestDefault(): void {}
  AuthorizeService(_device: string, _uuid: string): void {}
  Cancel(): void {}
  RequestConfirmation(_device: string, _passkey: number): void {}
  RequestAuthorization(_device: string): void {}
  DisplayPasskey(_device: string, _passkey: number, _entered: number): void {}
  DisplayPinCode(_device: string, _pincode: string): void {}
  RequestPinCode(_device: string): string { return '0000'; }
  RequestPasskey(_device: string): number { return 0; }
}

AutoAcceptAgent.configureMembers({
  methods: {
    Release: { inSignature: '', outSignature: '' },
    RequestDefault: { inSignature: '', outSignature: '' },
    AuthorizeService: { inSignature: 'os', outSignature: '' },
    Cancel: { inSignature: '', outSignature: '' },
    RequestConfirmation: { inSignature: 'ou', outSignature: '' },
    RequestAuthorization: { inSignature: 'o', outSignature: '' },
    DisplayPasskey: { inSignature: 'ouq', outSignature: '' },
    DisplayPinCode: { inSignature: 'os', outSignature: '' },
    RequestPinCode: { inSignature: 'o', outSignature: 's' },
    RequestPasskey: { inSignature: 'o', outSignature: 'u' },
  },
});

export class LinuxScanner extends EventEmitter implements IScanner {
  private bus: MessageBus | null = null;
  private isScanning = false;
  private lastEmit = new Map<string, number>();
  private gattFailures = new Map<string, number>();
  private knownAuraDevices = new Set<string>();

  addConnectionHook(_hook: ConnectionHook): void {
    // Connection hooks expect noble peripheral objects (macOS-only).
    // Linux connection hook support is not yet implemented.
    console.warn('[Scanner] addConnectionHook() not yet implemented for Linux');
  }

  async start(): Promise<void> {
    this.bus = dbus.systemBus();

    const bluez = await this.bus.getProxyObject(BLUEZ, ADAPTER_PATH);
    const adapter = bluez.getInterface('org.bluez.Adapter1');

    await adapter.SetDiscoveryFilter({
      UUIDs: new Variant('as', [AURA_SERVICE_UUID]),
      Transport: new Variant('s', 'le'),
      DuplicateData: new Variant('b', true),
    });

    // Subscribe to BlueZ signals
    const matchRules = [
      "type='signal',sender='org.bluez',interface='org.freedesktop.DBus.ObjectManager',member='InterfacesAdded'",
      "type='signal',sender='org.bluez',interface='org.freedesktop.DBus.Properties',member='PropertiesChanged',arg0='org.bluez.Device1'",
    ];
    for (const rule of matchRules) {
      const msg = new dbus.Message({
        destination: 'org.freedesktop.DBus',
        path: '/org/freedesktop/DBus',
        interface: 'org.freedesktop.DBus',
        member: 'AddMatch',
        signature: 's',
        body: [rule],
      });
      this.bus.call(msg).catch(() => {});
    }

    (this.bus as any).on('message', (msg: any) => {
      if (msg.interface === 'org.freedesktop.DBus.ObjectManager' && msg.member === 'InterfacesAdded') {
        const [path, interfaces] = msg.body as [string, Record<string, Record<string, Variant>>];
        const dev = interfaces?.['org.bluez.Device1'];
        if (dev) this.handleDevice(path, dev);
      } else if (
        msg.interface === 'org.freedesktop.DBus.Properties' &&
        msg.member === 'PropertiesChanged' &&
        msg.path?.startsWith('/org/bluez/hci0/dev_')
      ) {
        const [iface, changed] = msg.body as [string, Record<string, Variant>, string[]];
        if (iface === 'org.bluez.Device1') {
          this.handleDevice(msg.path!, changed);
        }
      }
    });

    // Register auto-accept agent to avoid pairing popups
    const agent = new AutoAcceptAgent('org.bluez.Agent1');
    this.bus.export(AGENT_PATH, agent);
    try {
      const agentMgr = (await this.bus.getProxyObject(BLUEZ, '/org/bluez')).getInterface('org.bluez.AgentManager1');
      await agentMgr.RegisterAgent(AGENT_PATH, 'NoInputNoOutput');
      await agentMgr.RequestDefaultAgent(AGENT_PATH);
      console.log('[Scanner] Auto-accept agent registered');
    } catch (err: any) {
      console.warn('[Scanner] Agent registration failed:', err?.message);
    }

    await adapter.StartDiscovery();
    this.isScanning = true;
    this.emit('scanning-started');
    console.log('[Scanner] BLE scanning started via BlueZ DBus');

    this.scanExistingDevices().catch(() => {});
  }

  private async scanExistingDevices(): Promise<void> {
    if (!this.bus) return;
    const root = await this.bus.getProxyObject(BLUEZ, '/');
    const om = root.getInterface('org.freedesktop.DBus.ObjectManager');
    const objects: Record<string, Record<string, Record<string, Variant>>> = await om.GetManagedObjects();

    for (const [path, ifaces] of Object.entries(objects)) {
      if (!path.startsWith('/org/bluez/hci0/dev_')) continue;
      const dev = ifaces['org.bluez.Device1'];
      if (dev) this.handleDevice(path, dev);
    }
  }

  private handleDevice(path: string, props: Record<string, Variant>): void {
    const rawUUIDs = props.UUIDs?.value;
    const uuids: string[] = Array.isArray(rawUUIDs) ? rawUUIDs : [];
    const hasAuraUUID = uuids.some((u) => u.toLowerCase() === AURA_SERVICE_UUID.toLowerCase());

    if (hasAuraUUID) {
      this.knownAuraDevices.add(path);
    } else if (!this.knownAuraDevices.has(path)) {
      return;
    }

    const serviceData = props.ServiceData?.value as Record<string, Buffer> | undefined;
    const rssi = (props.RSSI?.value as number) ?? -100;
    const now = Date.now();

    const lastTime = this.lastEmit.get(path) || 0;
    if (now - lastTime < READ_COOLDOWN_MS) {
      this.emit('rssi-update', { peripheralId: path, rssi });
      return;
    }

    if (serviceData) {
      const beaconBuf = serviceData[AURA_SERVICE_UUID] || serviceData[AURA_SERVICE_UUID.toLowerCase()];
      if (beaconBuf) {
        const payload = decodeBeacon(Buffer.from(beaconBuf));
        if (payload) {
          this.lastEmit.set(path, now);
          console.log(`[Scanner] Beacon from ${path}: clawId=${payload.clawId.toString('hex')}`);
          this.emit('beacon-discovered', {
            peripheralId: path,
            rssi,
            payload,
            timestamp: now,
          } as DiscoveredBeacon);
          return;
        }
      }
    }

    this.fetchServiceData(path, rssi).then((found) => {
      if (found) return;
      const lastAttempt = this.gattFailures.get(path) || 0;
      if (Date.now() - lastAttempt > GATT_ATTEMPT_COOLDOWN_MS) {
        this.enqueueGattRead(path, rssi);
      }
    });
  }

  private gattQueue: Array<{ path: string; rssi: number }> = [];
  private gattReading = false;

  private enqueueGattRead(path: string, rssi: number): void {
    if (this.gattQueue.some((e) => e.path === path)) return;
    this.gattQueue.push({ path, rssi });
    this.processGattQueue();
  }

  private async processGattQueue(): Promise<void> {
    if (this.gattReading || this.gattQueue.length === 0 || !this.bus) return;
    this.gattReading = true;
    const { path, rssi } = this.gattQueue.shift()!;

    try {
      const payload = await this.readBeaconViaGatt(path);
      const now = Date.now();
      this.gattFailures.set(path, now);
      if (payload) {
        this.lastEmit.set(path, now);
        console.log(`[Scanner] Beacon from ${path} (GATT): clawId=${payload.clawId.toString('hex')}`);
        this.emit('beacon-discovered', {
          peripheralId: path,
          rssi,
          payload,
          timestamp: now,
        } as DiscoveredBeacon);
      }
    } catch (err: any) {
      console.warn(`[Scanner] GATT read failed ${path}: ${err?.message || err}`);
      this.gattFailures.set(path, Date.now());
    } finally {
      this.gattReading = false;
      this.processGattQueue();
    }
  }

  private async readBeaconViaGatt(devicePath: string): Promise<BeaconPayload | null> {
    if (!this.bus) return null;

    const device = await this.bus.getProxyObject(BLUEZ, devicePath);
    const deviceIface = device.getInterface('org.bluez.Device1');
    const deviceProps = device.getInterface('org.freedesktop.DBus.Properties');

    await deviceProps.Set('org.bluez.Device1', 'Trusted', new Variant('b', true));

    const TIMEOUT = 10_000;
    try {
      await deviceProps.Set('org.bluez.Device1', 'PreferredBearer', new Variant('s', 'le'));
    } catch {
      // PreferredBearer requires BlueZ experimental features
    }
    const connectPromise = deviceIface.Connect();
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => {
        deviceIface.Disconnect().catch(() => {});
        reject(new Error('Connect timeout'));
      }, TIMEOUT);
    });
    await Promise.race([connectPromise, timeout]);

    try {
      const waitResolved = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('ServicesResolved timeout')), TIMEOUT);
        const check = async () => {
          try {
            const val: Variant = await deviceProps.Get('org.bluez.Device1', 'ServicesResolved');
            if (val.value === true) { clearTimeout(timer); resolve(); return; }
          } catch { /* device gone */ }
          setTimeout(check, 300);
        };
        check();
      });
      await waitResolved;

      const root = await this.bus!.getProxyObject(BLUEZ, '/');
      const om = root.getInterface('org.freedesktop.DBus.ObjectManager');
      const objects: Record<string, Record<string, Record<string, Variant>>> = await om.GetManagedObjects();

      let charPath: string | null = null;
      for (const [objPath, ifaces] of Object.entries(objects)) {
        if (!objPath.startsWith(devicePath)) continue;
        const charIface = ifaces['org.bluez.GattCharacteristic1'];
        if (!charIface) continue;
        const uuid = charIface.UUID?.value as string;
        if (uuid?.toLowerCase() === AURA_BEACON_CHARACTERISTIC_UUID.toLowerCase()) {
          charPath = objPath;
          break;
        }
      }

      if (!charPath) return null;

      const charProxy = await this.bus!.getProxyObject(BLUEZ, charPath);
      const charIface = charProxy.getInterface('org.bluez.GattCharacteristic1');
      const data: Buffer = await charIface.ReadValue({});

      return decodeBeacon(data);
    } finally {
      try { await deviceIface.Disconnect(); } catch { /* best effort */ }
    }
  }

  private async fetchServiceData(path: string, rssi: number): Promise<boolean> {
    if (!this.bus) return false;
    try {
      const obj = await this.bus.getProxyObject(BLUEZ, path);
      const props = obj.getInterface('org.freedesktop.DBus.Properties');
      const allProps: Record<string, Variant> = await props.GetAll('org.bluez.Device1');
      const serviceData = allProps.ServiceData?.value as Record<string, Buffer> | undefined;
      if (!serviceData) return false;

      const beaconBuf = serviceData[AURA_SERVICE_UUID] || serviceData[AURA_SERVICE_UUID.toLowerCase()];
      if (!beaconBuf) return false;

      const payload = decodeBeacon(Buffer.from(beaconBuf));
      if (!payload) return false;

      const now = Date.now();
      this.lastEmit.set(path, now);
      console.log(`[Scanner] Beacon from ${path} (fetched): clawId=${payload.clawId.toString('hex')}`);
      this.emit('beacon-discovered', {
        peripheralId: path,
        rssi,
        payload,
        timestamp: now,
      } as DiscoveredBeacon);
      return true;
    } catch {
      return false;
    }
  }

  async stop(): Promise<void> {
    if (!this.isScanning || !this.bus) return;

    try {
      const bluez = await this.bus.getProxyObject(BLUEZ, ADAPTER_PATH);
      const adapter = bluez.getInterface('org.bluez.Adapter1');
      await adapter.StopDiscovery();
    } catch {
      // best effort
    }

    this.bus.disconnect();
    this.bus = null;
    this.isScanning = false;
    this.knownAuraDevices.clear();
    this.lastEmit.clear();
    this.gattFailures.clear();
    this.emit('scanning-stopped');
  }

  get scanning(): boolean {
    return this.isScanning;
  }
}
