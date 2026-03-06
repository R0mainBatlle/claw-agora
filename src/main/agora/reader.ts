import { stripUUID, AGORA_SERVICE_UUID, AGORA_BOARD_META_UUID, AGORA_BOARD_READ_UUID } from '../ble/constants';
import { decodeAgoraMeta, decodeAgoraPost, verifyAgoraPost } from './codec';
import type { AgoraPost } from './types';
import { deriveClawId } from '../security/identity';

/**
 * Read a remote peer's agora board via noble GATT connection.
 * Returns decoded posts or null on failure.
 */
export async function readRemoteAgora(
  peripheral: { discoverSomeServicesAndCharacteristicsAsync: Function; uuid: string },
  expectedOwnerClawIdHex?: string,
): Promise<{ meta: { postCount: number; latestSeq: number; oldestSeq: number; ownerClawId: Buffer; ownerPublicKeyDer: Buffer }; posts: AgoraPost[] } | null> {
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
    if (!meta) return null;
    if (!meta.ownerClawId.equals(deriveClawId(meta.ownerPublicKeyDer))) return null;
    if (expectedOwnerClawIdHex && meta.ownerClawId.toString('hex') !== expectedOwnerClawIdHex) return null;
    if (meta.postCount === 0) return { meta, posts: [] };

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
      if (post && post.clawId.equals(meta.ownerClawId) && verifyAgoraPost(post, meta.ownerPublicKeyDer)) {
        posts.push(post);
      }
      offset += len;
    }

    return { meta, posts };
  } catch {
    return null;
  }
}
