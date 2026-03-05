import { EventEmitter } from 'events';
import crypto from 'node:crypto';
import { Advertiser } from './advertiser';
import { Scanner, DiscoveredBeacon } from './scanner';
import { createLocalBeacon, BeaconFlags } from './beacon';
import { generateSessionKey } from './crypto';

export class BLEEngine extends EventEmitter {
  readonly advertiser: Advertiser;
  readonly scanner: Scanner;
  private clawId: Buffer;
  private _sessionKey: Buffer;

  constructor() {
    super();
    this.advertiser = new Advertiser();
    this.scanner = new Scanner();
    this.clawId = crypto.randomBytes(4);
    this._sessionKey = generateSessionKey();

    this.scanner.on('beacon-discovered', (beacon: DiscoveredBeacon) => {
      this.emit('beacon-discovered', beacon);
    });
    this.scanner.on('rssi-update', (update) => this.emit('rssi-update', update));
    this.scanner.on('read-error', (err) => this.emit('read-error', err));
  }

  async start(tags: string[], flags: BeaconFlags): Promise<void> {
    const payload = createLocalBeacon(this.clawId, tags, flags, this._sessionKey);
    this.advertiser.updatePayload(payload);

    // Start advertiser first, then scanner
    // Both can run simultaneously on macOS via CoreBluetooth
    await this.advertiser.start();
    await this.scanner.start();
    this.emit('started');
  }

  updateBeacon(tags: string[], flags: BeaconFlags): void {
    const payload = createLocalBeacon(this.clawId, tags, flags, this._sessionKey);
    this.advertiser.updatePayload(payload);
  }

  async stop(): Promise<void> {
    await Promise.all([
      this.advertiser.stop(),
      this.scanner.stop(),
    ]);
    this.emit('stopped');
  }

  get localClawId(): Buffer {
    return this.clawId;
  }

  get sessionKey(): Buffer {
    return this._sessionKey;
  }
}
