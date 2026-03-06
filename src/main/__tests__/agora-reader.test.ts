import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { readRemoteAgora } from '../agora/reader';
import { encodeAgoraMeta, encodeAgoraPost } from '../agora/codec';
import type { AgoraPost } from '../agora/types';
import { deriveClawId } from '../security/identity';
import { AGORA_BOARD_META_UUID, AGORA_BOARD_READ_UUID, stripUUID } from '../ble/constants';

function createIdentity() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyDer = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }));
  return {
    privateKey,
    publicKeyDer,
    clawId: deriveClawId(publicKeyDer),
  };
}

function encodeBoard(posts: Buffer[]): Buffer {
  const framed: Buffer[] = [];
  for (const post of posts) {
    const len = Buffer.alloc(2);
    len.writeUInt16BE(post.length, 0);
    framed.push(len, post);
  }
  return Buffer.concat(framed);
}

function makePost(clawId: Buffer, content: string, seqNo: number): AgoraPost {
  return {
    clawId,
    timestamp: 1709654321000 + seqNo,
    contentLen: Buffer.byteLength(content, 'utf-8'),
    ttlMinutes: 30,
    seqNo,
    signature: Buffer.alloc(64),
    content,
  };
}

function makePeripheral(metaBuf: Buffer, boardBuf: Buffer) {
  const characteristics = [
    {
      uuid: stripUUID(AGORA_BOARD_META_UUID),
      read: (cb: (err: Error | null, data: Buffer) => void) => cb(null, metaBuf),
    },
    {
      uuid: stripUUID(AGORA_BOARD_READ_UUID),
      read: (cb: (err: Error | null, data: Buffer) => void) => cb(null, boardBuf),
    },
  ];

  return {
    uuid: 'peripheral-1',
    discoverSomeServicesAndCharacteristicsAsync: async () => ({ characteristics }),
  };
}

describe('readRemoteAgora', () => {
  it('rejects metadata when clawId does not match the advertised public key', async () => {
    const owner = createIdentity();
    const forgedClawId = Buffer.from('deadbeef', 'hex');
    const meta = encodeAgoraMeta(0, 0, 0, forgedClawId, owner.publicKeyDer);

    const result = await readRemoteAgora(makePeripheral(meta, Buffer.alloc(0)));
    expect(result).toBeNull();
  });

  it('returns only posts with a valid signature from the board owner', async () => {
    const owner = createIdentity();
    const validPost = encodeAgoraPost(makePost(owner.clawId, 'valid', 1), owner.privateKey);
    const tamperedPost = Buffer.from(encodeAgoraPost(makePost(owner.clawId, 'tampered', 2), owner.privateKey));
    tamperedPost[tamperedPost.length - 1] ^= 0xff;

    const meta = encodeAgoraMeta(2, 2, 1, owner.clawId, owner.publicKeyDer);
    const board = encodeBoard([validPost, tamperedPost]);

    const result = await readRemoteAgora(makePeripheral(meta, board), owner.clawId.toString('hex'));

    expect(result).not.toBeNull();
    expect(result!.posts).toHaveLength(1);
    expect(result!.posts[0].content).toBe('valid');
  });

  it('rejects a board when the discovered owner does not match the expected peer', async () => {
    const owner = createIdentity();
    const meta = encodeAgoraMeta(0, 0, 0, owner.clawId, owner.publicKeyDer);

    const result = await readRemoteAgora(makePeripheral(meta, Buffer.alloc(0)), '00112233');
    expect(result).toBeNull();
  });
});
