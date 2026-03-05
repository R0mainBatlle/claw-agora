import bleno, { ConnectionHandle, ReadRequestCallback, WriteRequestCallback } from '@stoprocent/bleno';
import { stripUUID, AGORA_SERVICE_UUID, AGORA_BOARD_READ_UUID, AGORA_BOARD_WRITE_UUID, AGORA_BOARD_META_UUID } from '../ble/constants';
import { encodeAgoraPost, encodeAgoraMeta, decodeAgoraPost } from './codec';
import { AgoraRingBuffer } from './ring-buffer';
import type { AgoraPost } from './types';
import { EventEmitter } from 'events';

const { Characteristic, PrimaryService } = bleno;

/**
 * BLE GATT service for the Agora public board.
 * Exposes Board Read, Board Write, and Board Meta characteristics.
 */
export class AgoraService extends EventEmitter {
  private ringBuffer: AgoraRingBuffer;
  private ownerClawId: Buffer;
  private sessionKey: Buffer | undefined;
  public service: InstanceType<typeof PrimaryService>;

  constructor(ringBuffer: AgoraRingBuffer, ownerClawId: Buffer, sessionKey?: Buffer) {
    super();
    this.ringBuffer = ringBuffer;
    this.ownerClawId = ownerClawId;
    this.sessionKey = sessionKey;

    const metaChar = new Characteristic({
      uuid: stripUUID(AGORA_BOARD_META_UUID),
      properties: ['read'],
      onReadRequest: (_handle: unknown, offset: number, callback: ReadRequestCallback) => {
        const meta = encodeAgoraMeta(
          this.ringBuffer.count,
          this.ringBuffer.latestSeq,
          this.ringBuffer.oldestSeq,
          this.ownerClawId,
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
        const encoded = posts.map(p => encodeAgoraPost(p, this.sessionKey));
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

    const boardWriteChar = new Characteristic({
      uuid: stripUUID(AGORA_BOARD_WRITE_UUID),
      properties: ['write'],
      onWriteRequest: (_handle: ConnectionHandle, data: Buffer, _offset: number, _withoutResponse: boolean, callback: WriteRequestCallback) => {
        const post = decodeAgoraPost(data);
        if (post) {
          this.emit('remote-post', post);
        }
        callback(Characteristic.RESULT_SUCCESS);
      },
    });

    this.service = new PrimaryService({
      uuid: stripUUID(AGORA_SERVICE_UUID),
      characteristics: [metaChar, boardReadChar, boardWriteChar],
    });
  }
}
