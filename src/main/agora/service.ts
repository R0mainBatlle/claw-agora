import crypto from 'node:crypto';
import bleno, { ReadRequestCallback } from '@stoprocent/bleno';
import { stripUUID, AGORA_SERVICE_UUID, AGORA_BOARD_READ_UUID, AGORA_BOARD_META_UUID } from '../ble/constants';
import { encodeAgoraPost, encodeAgoraMeta } from './codec';
import { AgoraRingBuffer } from './ring-buffer';
import { EventEmitter } from 'events';

const { Characteristic, PrimaryService } = bleno;

/**
 * BLE GATT service for the Agora public board.
 * Exposes Board Read, Board Write, and Board Meta characteristics.
 */
export class AgoraService extends EventEmitter {
  private ringBuffer: AgoraRingBuffer;
  private ownerClawId: Buffer;
  private ownerPublicKeyDer: Buffer;
  private ownerPrivateKey: crypto.KeyObject;
  public service: InstanceType<typeof PrimaryService>;

  constructor(
    ringBuffer: AgoraRingBuffer,
    ownerClawId: Buffer,
    ownerPublicKeyDer: Buffer,
    ownerPrivateKey: crypto.KeyObject,
  ) {
    super();
    this.ringBuffer = ringBuffer;
    this.ownerClawId = ownerClawId;
    this.ownerPublicKeyDer = ownerPublicKeyDer;
    this.ownerPrivateKey = ownerPrivateKey;

    const metaChar = new Characteristic({
      uuid: stripUUID(AGORA_BOARD_META_UUID),
      properties: ['read'],
      onReadRequest: (_handle: unknown, offset: number, callback: ReadRequestCallback) => {
        const meta = encodeAgoraMeta(
          this.ringBuffer.count,
          this.ringBuffer.latestSeq,
          this.ringBuffer.oldestSeq,
          this.ownerClawId,
          this.ownerPublicKeyDer,
        );
        callback(Characteristic.RESULT_SUCCESS, meta.subarray(offset));
      },
    });

    const boardReadChar = new Characteristic({
      uuid: stripUUID(AGORA_BOARD_READ_UUID),
      properties: ['read'],
      onReadRequest: (_handle: unknown, offset: number, callback: ReadRequestCallback) => {
        // Serialize all posts into a single buffer
        const posts = this.ringBuffer.getAll();
        const encoded = posts.map(p => encodeAgoraPost(p, this.ownerPrivateKey));
        if (encoded.length === 0) {
          callback(Characteristic.RESULT_SUCCESS, Buffer.alloc(0));
          return;
        }
        // Prefix each encoded post with its 2-byte length for framing
        const framed: Buffer[] = [];
        for (const buf of encoded) {
          const len = Buffer.alloc(2);
          len.writeUInt16BE(buf.length, 0);
          framed.push(len, buf);
        }
        const full = Buffer.concat(framed);
        callback(Characteristic.RESULT_SUCCESS, full.subarray(offset));
      },
    });

    this.service = new PrimaryService({
      uuid: stripUUID(AGORA_SERVICE_UUID),
      characteristics: [metaChar, boardReadChar],
    });
  }
}
