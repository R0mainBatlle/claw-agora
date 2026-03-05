import { EventEmitter } from 'events';
import { AgoraRingBuffer } from './ring-buffer';
import type { AgoraConfig, AgoraPost } from './types';
import { DEFAULT_AGORA_CONFIG } from './types';
import { inspectContent } from '../security/quarantine';
import { AgentBackend, NearbyPeerSummary } from '../agent/backend';

export interface AgoraFeedItem {
  id: string;
  authorClawId: string;
  content: string;
  timestamp: number;
  isLocal: boolean;
  quarantined: boolean;
}

/**
 * Orchestrates the Agora public board:
 * - Periodically asks the agent for new posts
 * - Manages the local ring buffer
 * - Delivers incoming remote posts (after quarantine) to the agent
 *
 * Emits:
 *   'post' (item: AgoraFeedItem) — new post added to feed
 */
export class AgoraManager extends EventEmitter {
  private config: AgoraConfig;
  private ringBuffer: AgoraRingBuffer;
  private backend: AgentBackend;
  private ownerClawId: Buffer;
  private sessionKey: Buffer | undefined;
  private postTimer: ReturnType<typeof setInterval> | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private seenSeqs = new Map<string, number>();
  private _feed: AgoraFeedItem[] = [];
  private _postsByPeer = new Map<string, AgoraFeedItem[]>();
  private feedSeq = 0;

  constructor(
    backend: AgentBackend,
    ownerClawId: Buffer,
    sessionKey?: Buffer,
    config?: Partial<AgoraConfig>,
  ) {
    super();
    this.config = { ...DEFAULT_AGORA_CONFIG, ...config };
    this.ringBuffer = new AgoraRingBuffer(this.config.ringBufferSize);
    this.backend = backend;
    this.ownerClawId = ownerClawId;
    this.sessionKey = sessionKey;
  }

  get buffer(): AgoraRingBuffer {
    return this.ringBuffer;
  }

  get feed(): AgoraFeedItem[] {
    return this._feed;
  }

  start(getNearbyPeers: () => NearbyPeerSummary[]): void {
    if (!this.config.enabled) return;

    this.postTimer = setInterval(async () => {
      try {
        const peers = getNearbyPeers();
        if (peers.length === 0) return;

        const content = await this.backend.requestAgoraPost(peers);
        if (!content) return;

        const trimmed = content.substring(0, this.config.maxPostLength);
        this.ringBuffer.add(this.ownerClawId, trimmed, this.config.ttlMinutes, this.sessionKey);

        const item: AgoraFeedItem = {
          id: `local-${++this.feedSeq}`,
          authorClawId: this.ownerClawId.toString('hex'),
          content: trimmed,
          timestamp: Date.now(),
          isLocal: true,
          quarantined: false,
        };
        this.addToFeed(item);
        console.log(`[Agora] Posted: "${trimmed.substring(0, 50)}..." (seq=${this.ringBuffer.latestSeq})`);
      } catch (err) {
        console.error('[Agora] Post request failed:', (err as Error).message);
      }
    }, this.config.postIntervalMs);

    this.sweepTimer = setInterval(() => {
      this.ringBuffer.sweep();
    }, 60_000);

    console.log(`[Agora] Started (post every ${this.config.postIntervalMs / 1000}s)`);
  }

  stop(): void {
    if (this.postTimer) clearInterval(this.postTimer);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.postTimer = null;
    this.sweepTimer = null;
  }

  async handleRemotePosts(peerClawIdHex: string, posts: AgoraPost[]): Promise<void> {
    const lastSeen = this.seenSeqs.get(peerClawIdHex) || 0;
    const newPosts = posts.filter(p => p.seqNo > lastSeen);

    if (newPosts.length === 0) return;

    const maxSeq = Math.max(...newPosts.map(p => p.seqNo));
    this.seenSeqs.set(peerClawIdHex, maxSeq);

    for (const post of newPosts) {
      const result = inspectContent(post.content);
      if (!result.safe) {
        console.warn(`[Agora] Quarantined post from ${peerClawIdHex}: ${result.threats.join(', ')}`);
      }

      const item: AgoraFeedItem = {
        id: `remote-${++this.feedSeq}`,
        authorClawId: peerClawIdHex,
        content: result.sanitized,
        timestamp: post.timestamp || Date.now(),
        isLocal: false,
        quarantined: !result.safe,
      };
      this.addToFeed(item);

      try {
        await this.backend.deliverAgoraPost(peerClawIdHex, result.sanitized);
      } catch (err) {
        console.error('[Agora] Delivery failed:', (err as Error).message);
      }
    }
  }

  /** Get recent agora posts from a specific peer. */
  getPostsByPeer(clawId: string): AgoraFeedItem[] {
    return this._postsByPeer.get(clawId) || [];
  }

  private addToFeed(item: AgoraFeedItem): void {
    this._feed.push(item);
    if (this._feed.length > 50) {
      this._feed = this._feed.slice(-50);
    }

    // Track per-peer posts
    const peerPosts = this._postsByPeer.get(item.authorClawId) || [];
    peerPosts.push(item);
    if (peerPosts.length > 10) peerPosts.splice(0, peerPosts.length - 10);
    this._postsByPeer.set(item.authorClawId, peerPosts);

    this.emit('post', item);
  }

  updateConfig(config: Partial<AgoraConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
