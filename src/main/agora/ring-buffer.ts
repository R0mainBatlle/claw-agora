import type { AgoraPost } from './types';

export class AgoraRingBuffer {
  private posts: AgoraPost[] = [];
  private maxSize: number;
  private nextSeq = 1;

  constructor(maxSize: number = 32) {
    this.maxSize = maxSize;
  }

  /** Add a post to the buffer. Returns the assigned seqNo. */
  add(clawId: Buffer, content: string, ttlMinutes: number, sessionKey?: Buffer): number {
    const seqNo = this.nextSeq++;
    const post: AgoraPost = {
      clawId,
      timestamp: Date.now(),
      contentLen: Buffer.byteLength(content, 'utf-8'),
      ttlMinutes,
      seqNo,
      signature: Buffer.alloc(8), // filled by codec during encoding
      content,
    };

    this.posts.push(post);
    if (this.posts.length > this.maxSize) {
      this.posts.shift();
    }
    return seqNo;
  }

  /** Remove expired posts based on TTL. */
  sweep(): number {
    const now = Date.now();
    const before = this.posts.length;
    this.posts = this.posts.filter(p => {
      const expiresAt = p.timestamp + p.ttlMinutes * 60_000;
      return now < expiresAt;
    });
    return before - this.posts.length;
  }

  /** Get posts with seqNo > afterSeq. */
  getPostsSince(afterSeq: number): AgoraPost[] {
    return this.posts.filter(p => p.seqNo > afterSeq);
  }

  /** Get all current posts. */
  getAll(): AgoraPost[] {
    return [...this.posts];
  }

  get count(): number {
    return this.posts.length;
  }

  get latestSeq(): number {
    return this.posts.length > 0 ? this.posts[this.posts.length - 1].seqNo : 0;
  }

  get oldestSeq(): number {
    return this.posts.length > 0 ? this.posts[0].seqNo : 0;
  }
}
