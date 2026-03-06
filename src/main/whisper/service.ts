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
  private controlNotifiers = new Map<ConnectionHandle, (data: Buffer) => void>();
  private txNotifiers = new Map<ConnectionHandle, (data: Buffer) => void>();
  private reassemblers = new Map<ConnectionHandle, Reassembler>();
  private controlReassemblers = new Map<ConnectionHandle, Reassembler>();
  private mtu: number;

  constructor(mtu: number = DEFAULT_MTU) {
    super();
    this.mtu = mtu;

    // Control: write (remote→local handshake) + notify (local→remote handshake)
    const controlChar = new Characteristic({
      uuid: stripUUID(WHISPER_CONTROL_UUID),
      properties: ['write', 'notify'],
      onWriteRequest: (handle: ConnectionHandle, data: Buffer, _offset: number, _withoutResponse: boolean, callback: WriteRequestCallback) => {
        // Reassemble fragmented control messages
        const complete = this.getControlReassembler(handle).addFragment(data);
        if (complete) {
          const msg = decodeControlMessage(complete);
          if (msg) this.emit('control-message', { handle, message: msg });
        }
        callback(Characteristic.RESULT_SUCCESS);
      },
      onSubscribe: (handle: ConnectionHandle, _maxValueSize: number, updateValueCallback: (data: Buffer) => void) => {
        this.controlNotifiers.set(handle, updateValueCallback);
      },
      onUnsubscribe: (handle: ConnectionHandle) => {
        this.controlNotifiers.delete(handle);
        this.controlReassemblers.delete(handle);
        this.maybeEmitDisconnected(handle);
      },
    });

    // TX: notify only (peripheral→central encrypted data)
    const txChar = new Characteristic({
      uuid: stripUUID(WHISPER_TX_UUID),
      properties: ['notify'],
      onSubscribe: (handle: ConnectionHandle, _maxValueSize: number, updateValueCallback: (data: Buffer) => void) => {
        this.txNotifiers.set(handle, updateValueCallback);
      },
      onUnsubscribe: (handle: ConnectionHandle) => {
        this.txNotifiers.delete(handle);
        this.reassemblers.delete(handle);
        this.maybeEmitDisconnected(handle);
      },
    });

    // RX: write only (central→peripheral encrypted data)
    const rxChar = new Characteristic({
      uuid: stripUUID(WHISPER_RX_UUID),
      properties: ['write'],
      onWriteRequest: (handle: ConnectionHandle, data: Buffer, _offset: number, _withoutResponse: boolean, callback: WriteRequestCallback) => {
        const complete = this.getDataReassembler(handle).addFragment(data);
        if (complete) {
          const frame = decodeDataFrame(complete);
          if (frame) this.emit('data-frame', { handle, frame });
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
  sendControl(data: Buffer, handle?: ConnectionHandle): void {
    const notifier = this.getNotifier(this.controlNotifiers, handle);
    if (!notifier) return;
    const fragments = fragmentMessage(data, this.mtu);
    for (const frag of fragments) {
      notifier(frag);
    }
  }

  /** Send encrypted data to the connected central via TX. */
  sendData(data: Buffer, handle?: ConnectionHandle): void {
    const notifier = this.getNotifier(this.txNotifiers, handle);
    if (!notifier) return;
    const fragments = fragmentMessage(data, this.mtu);
    for (const frag of fragments) {
      notifier(frag);
    }
  }

  get hasSubscribers(): boolean {
    return this.controlNotifiers.size > 0 || this.txNotifiers.size > 0;
  }

  private getControlReassembler(handle: ConnectionHandle): Reassembler {
    const existing = this.controlReassemblers.get(handle);
    if (existing) return existing;
    const created = new Reassembler();
    this.controlReassemblers.set(handle, created);
    return created;
  }

  private getDataReassembler(handle: ConnectionHandle): Reassembler {
    const existing = this.reassemblers.get(handle);
    if (existing) return existing;
    const created = new Reassembler();
    this.reassemblers.set(handle, created);
    return created;
  }

  private getNotifier(
    notifiers: Map<ConnectionHandle, (data: Buffer) => void>,
    handle?: ConnectionHandle,
  ): ((data: Buffer) => void) | null {
    if (handle !== undefined) {
      return notifiers.get(handle) || null;
    }
    if (notifiers.size === 1) {
      return notifiers.values().next().value || null;
    }
    return null;
  }

  private maybeEmitDisconnected(handle: ConnectionHandle): void {
    if (this.controlNotifiers.has(handle) || this.txNotifiers.has(handle)) return;
    this.emit('disconnected', handle);
  }
}
