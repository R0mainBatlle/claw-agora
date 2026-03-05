import { stripUUID, AGORA_SERVICE_UUID, AGORA_BOARD_META_UUID, AGORA_BOARD_READ_UUID } from '../ble/constants';
import { decodeAgoraMeta, decodeAgoraPost } from './codec';
import type { AgoraPost } from './types';

/**
 * Read a remote peer's agora board via noble GATT connection.
 * Returns decoded posts or null on failure.
 */
export async function readRemoteAgora(
  peripheral: { discoverSomeServicesAndCharacteristicsAsync: Function; uuid: string },
): Promise<{ meta: { postCount: number; latestSeq: number; oldestSeq: number; ownerClawId: Buffer }; posts: AgoraPost[] } | null> {
  try {
    const serviceUUID = stripUUID(AGORA_SERVICE_UUID);
    const metaUUID = stripUUID(AGORA_BOARD_META_UUID);
    const readUUID = stripUUID(AGORA_BOARD_READ_UUID);

    const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
      [serviceUUID],
      [metaUUID, readUUID],
    );

    if (!characteristics || characteristics.length === 0) return null;

    const metaChar = characteristics.find((c: { uuid: string }) => c.uuid === metaUUID);
    const readChar = characteristics.find((c: { uuid: string }) => c.uuid === readUUID);

    if (!metaChar || !readChar) return null;

    // Read meta
    const metaBuf: Buffer = await new Promise((resolve, reject) => {
      metaChar.read((err: Error | null, data: Buffer) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const meta = decodeAgoraMeta(metaBuf);
    if (!meta || meta.postCount === 0) return { meta: meta || { postCount: 0, latestSeq: 0, oldestSeq: 0, ownerClawId: Buffer.alloc(4) }, posts: [] };

    // Read board
    const boardBuf: Buffer = await new Promise((resolve, reject) => {
      readChar.read((err: Error | null, data: Buffer) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    // Decode length-prefixed posts
    const posts: AgoraPost[] = [];
    let offset = 0;
    while (offset + 2 <= boardBuf.length) {
      const len = boardBuf.readUInt16BE(offset);
      offset += 2;
      if (offset + len > boardBuf.length) break;
      const postBuf = boardBuf.subarray(offset, offset + len);
      const post = decodeAgoraPost(postBuf);
      if (post) posts.push(post);
      offset += len;
    }

    return { meta, posts };
  } catch {
    return null;
  }
}
