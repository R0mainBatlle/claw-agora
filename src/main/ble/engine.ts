import { EventEmitter } from 'events';
import crypto from 'node:crypto';
import { Advertiser } from './advertiser';
import { Scanner, DiscoveredBeacon } from './scanner';
import { createLocalBeacon, BeaconFlags } from './beacon';

export class BLEEngine extends EventEmitter {
  readonly advertiser: Advertiser;
  readonly scanner: Scanner;
  private clawId: Buffer;

  constructor() {
    super();
    this.advertiser = new Advertiser();
    this.scanner = new Scanner();
    // Phase 1: random 4-byte Claw ID, does not rotate
    this.clawId = crypto.randomBytes(4);

    this.scanner.on('beacon-discovered', (beacon: DiscoveredBeacon) => {
      this.emit('beacon-discovered', beacon);
    });
    this.scanner.on('rssi-update', (update) => this.emit('rssi-update', update));
    this.scanner.on('read-error', (err) => this.emit('read-error', err));
  }

  async start(tags: string[], flags: BeaconFlags): Promise<void> {
    const payload = createLocalBeacon(this.clawId, tags, flags);
    this.advertiser.updatePayload(payload);

    // Start advertiser first, then scanner
    // Both can run simultaneously on macOS via CoreBluetooth
    await this.advertiser.start();
    await this.scanner.start();
    this.emit('started');
  }

  updateBeacon(tags: string[], flags: BeaconFlags): void {
    const payload = createLocalBeacon(this.clawId, tags, flags);
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
}
