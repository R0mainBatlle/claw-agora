import { EventEmitter } from 'events';
import {
  stripUUID,
  WHISPER_SERVICE_UUID,
  WHISPER_CONTROL_UUID,
  WHISPER_TX_UUID,
  WHISPER_RX_UUID,
} from '../ble/constants';
import { decodeControlMessage, decodeDataFrame } from './codec';
import { fragmentMessage, Reassembler } from '../ble/fragmentation';

const DEFAULT_MTU = 512;

/**
 * Noble-side whisper client — connects to a remote peer's Whisper service
 * and drives the handshake as initiator.
 *
 * Emits:
 *   'control-message' (msg)   — decoded control message from remote
 *   'data-frame'      (frame) — decoded data frame from remote
 *   'disconnected'    ()      — remote disconnected
 */
export class WhisperClient extends EventEmitter {
  private peripheral: any;
  private controlChar: any = null;
  private txChar: any = null;
  private rxChar: any = null;
  private reassembler = new Reassembler();
  private controlReassembler = new Reassembler();
  private mtu: number;
  private connected = false;

  constructor(peripheral: any, mtu: number = DEFAULT_MTU) {
    super();
    this.peripheral = peripheral;
    this.mtu = mtu;
  }

  /** Connect and discover whisper characteristics. */
  async connect(timeoutMs: number = 5000): Promise<boolean> {
    try {
      const connectPromise = this.peripheral.connectAsync();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Whisper connect timeout')), timeoutMs),
      );
      await Promise.race([connectPromise, timeoutPromise]);

      const serviceUUID = stripUUID(WHISPER_SERVICE_UUID);
      const controlUUID = stripUUID(WHISPER_CONTROL_UUID);
      const txUUID = stripUUID(WHISPER_TX_UUID);
      const rxUUID = stripUUID(WHISPER_RX_UUID);

      const { characteristics } = await this.peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [serviceUUID],
        [controlUUID, txUUID, rxUUID],
      );

      if (!characteristics || characteristics.length < 3) {
        await this.disconnect();
        return false;
      }

      this.controlChar = characteristics.find((c: any) => c.uuid === controlUUID);
      this.txChar = characteristics.find((c: any) => c.uuid === txUUID);
      this.rxChar = characteristics.find((c: any) => c.uuid === rxUUID);

      if (!this.controlChar || !this.txChar || !this.rxChar) {
        await this.disconnect();
        return false;
      }

      // Subscribe to Control notifications (handshake responses)
      this.controlChar.on('data', (data: Buffer) => {
        const complete = this.controlReassembler.addFragment(data);
        if (complete) {
          const msg = decodeControlMessage(complete);
          if (msg) this.emit('control-message', msg);
        }
      });
      await new Promise<void>((resolve, reject) => {
        this.controlChar.subscribe((err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Subscribe to TX notifications (encrypted data from peripheral)
      this.txChar.on('data', (data: Buffer) => {
        const complete = this.reassembler.addFragment(data);
        if (complete) {
          const frame = decodeDataFrame(complete);
          if (frame) this.emit('data-frame', frame);
        }
      });
      await new Promise<void>((resolve, reject) => {
        this.txChar.subscribe((err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Listen for disconnect
      this.peripheral.once('disconnect', () => {
        this.connected = false;
        this.emit('disconnected');
      });

      this.connected = true;
      return true;
    } catch (err) {
      console.error('[WhisperClient] Connect failed:', (err as Error).message);
      return false;
    }
  }

  /** Write a control message (handshake) to the remote peripheral. */
  sendControl(data: Buffer): void {
    if (!this.controlChar) return;
    const fragments = fragmentMessage(data, this.mtu);
    for (const frag of fragments) {
      this.controlChar.write(frag, false);
    }
  }

  /** Write encrypted data to the remote peripheral via RX. */
  sendData(data: Buffer): void {
    if (!this.rxChar) return;
    const fragments = fragmentMessage(data, this.mtu);
    for (const frag of fragments) {
      this.rxChar.write(frag, false);
    }
  }

  async disconnect(): Promise<void> {
    if (this.peripheral) {
      try {
        await this.peripheral.disconnectAsync();
      } catch {
        // best effort
      }
    }
    this.connected = false;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get peripheralId(): string {
    return this.peripheral?.id || '';
  }
}
