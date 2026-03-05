import bleno, { ConnectionHandle, WriteRequestCallback } from '@stoprocent/bleno';
import { EventEmitter } from 'events';
import {
  stripUUID,
  WHISPER_SERVICE_UUID,
  WHISPER_CONTROL_UUID,
  WHISPER_TX_UUID,
  WHISPER_RX_UUID,
} from '../ble/constants';
import { decodeControlMessage, decodeDataFrame } from './codec';
import { Reassembler, fragmentMessage } from '../ble/fragmentation';

const { Characteristic, PrimaryService } = bleno;

const DEFAULT_MTU = 512;

/**
 * BLE GATT service for Whisper private channels.
 *
 * Characteristics:
 *   Control (write/notify) — handshake messages
 *   TX (notify)            — peripheral pushes encrypted data to central
 *   RX (write)             — central sends encrypted data to peripheral
 *
 * Emits:
 *   'control-message' (msg)  — decoded control message from remote
 *   'data-frame'      (frame)— decoded data frame from remote
 */
export class WhisperService extends EventEmitter {
  public service: InstanceType<typeof PrimaryService>;
  private controlNotify: ((data: Buffer) => void) | null = null;
  private txNotify: ((data: Buffer) => void) | null = null;
  private reassembler = new Reassembler();
  private controlReassembler = new Reassembler();
  private mtu: number;

  constructor(mtu: number = DEFAULT_MTU) {
    super();
    this.mtu = mtu;

    // Control: write (remote→local handshake) + notify (local→remote handshake)
    const controlChar = new Characteristic({
      uuid: stripUUID(WHISPER_CONTROL_UUID),
      properties: ['write', 'notify'],
      onWriteRequest: (_handle: ConnectionHandle, data: Buffer, _offset: number, _withoutResponse: boolean, callback: WriteRequestCallback) => {
        // Reassemble fragmented control messages
        const complete = this.controlReassembler.addFragment(data);
        if (complete) {
          const msg = decodeControlMessage(complete);
          if (msg) this.emit('control-message', msg);
        }
        callback(Characteristic.RESULT_SUCCESS);
      },
      onSubscribe: (_handle: ConnectionHandle, _maxValueSize: number, updateValueCallback: (data: Buffer) => void) => {
        this.controlNotify = updateValueCallback;
      },
      onUnsubscribe: (_handle: ConnectionHandle) => {
        this.controlNotify = null;
      },
    });

    // TX: notify only (peripheral→central encrypted data)
    const txChar = new Characteristic({
      uuid: stripUUID(WHISPER_TX_UUID),
      properties: ['notify'],
      onSubscribe: (_handle: ConnectionHandle, _maxValueSize: number, updateValueCallback: (data: Buffer) => void) => {
        this.txNotify = updateValueCallback;
      },
      onUnsubscribe: (_handle: ConnectionHandle) => {
        this.txNotify = null;
      },
    });

    // RX: write only (central→peripheral encrypted data)
    const rxChar = new Characteristic({
      uuid: stripUUID(WHISPER_RX_UUID),
      properties: ['write'],
      onWriteRequest: (_handle: ConnectionHandle, data: Buffer, _offset: number, _withoutResponse: boolean, callback: WriteRequestCallback) => {
        const complete = this.reassembler.addFragment(data);
        if (complete) {
          const frame = decodeDataFrame(complete);
          if (frame) this.emit('data-frame', frame);
        }
        callback(Characteristic.RESULT_SUCCESS);
      },
    });

    this.service = new PrimaryService({
      uuid: stripUUID(WHISPER_SERVICE_UUID),
      characteristics: [controlChar, txChar, rxChar],
    });
  }

  /** Send a control message (handshake) to the connected central. */
  sendControl(data: Buffer): void {
    if (!this.controlNotify) return;
    const fragments = fragmentMessage(data, this.mtu);
    for (const frag of fragments) {
      this.controlNotify(frag);
    }
  }

  /** Send encrypted data to the connected central via TX. */
  sendData(data: Buffer): void {
    if (!this.txNotify) return;
    const fragments = fragmentMessage(data, this.mtu);
    for (const frag of fragments) {
      this.txNotify(frag);
    }
  }

  get hasSubscribers(): boolean {
    return this.controlNotify !== null || this.txNotify !== null;
  }
}
