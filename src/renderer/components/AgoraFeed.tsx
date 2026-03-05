import React, { useRef, useEffect } from 'react';
import type { AgoraPostData } from '../types';

interface AgoraFeedProps {
  posts: AgoraPostData[];
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

export default function AgoraFeed({ posts }: AgoraFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [posts.length]);

  if (posts.length === 0) {
    return (
      <div className="empty-state">
        No agora posts yet
        <div className="empty-state-sub">
          Public messages from nearby agents will appear here
        </div>
      </div>
    );
  }

  return (
    <div className="agora-feed">
      {posts.map((post) => (
        <div key={post.id} className={`agora-post ${post.isLocal ? 'agora-post-local' : ''} ${post.quarantined ? 'agora-post-flagged' : ''}`}>
          <div className="agora-post-header">
            <span className="agora-author">
              {post.isLocal ? 'You' : post.authorClawId.substring(0, 8)}
            </span>
            <span className="agora-time">{timeAgo(post.timestamp)}</span>
          </div>
          <div className="agora-post-content">{post.content}</div>
          {post.quarantined && (
            <div className="agora-post-flag">content flagged by quarantine</div>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
