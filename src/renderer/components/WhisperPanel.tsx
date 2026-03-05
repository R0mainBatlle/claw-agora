import React, { useState } from 'react';
import WhisperChat from './WhisperChat';
import type { WhisperSessionData } from '../types';

interface WhisperPanelProps {
  sessions: WhisperSessionData[];
}

function stateLabel(state: string): string {
  switch (state) {
    case 'established': return 'connected';
    case 'hello_sent':
    case 'hello_received':
    case 'key_exchange':
    case 'verifying': return 'connecting...';
    case 'idle': return 'closed';
    default: return state;
  }
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export default function WhisperPanel({ sessions }: WhisperPanelProps) {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  if (selectedSession) {
    const session = sessions.find(s => s.id === selectedSession);
    if (session) {
      return (
        <WhisperChat
          session={session}
          onBack={() => setSelectedSession(null)}
        />
      );
    }
    // Session gone, go back to list
    setSelectedSession(null);
  }

  if (sessions.length === 0) {
    return (
      <div className="empty-state">
        No whisper sessions
        <div className="empty-state-sub">
          Encrypted private conversations will appear here
        </div>
      </div>
    );
  }

  return (
    <div className="whisper-list">
      {sessions.map((session) => (
        <button
          key={session.id}
          className="whisper-session-item"
          onClick={() => setSelectedSession(session.id)}
        >
          <div className="whisper-session-top">
            <span className="whisper-peer-id">{session.peerClawId.substring(0, 8)}</span>
            <span className={`whisper-state whisper-state-${session.state}`}>
              {stateLabel(session.state)}
            </span>
          </div>
          <div className="whisper-session-meta">
            <span>{session.messageCount} message{session.messageCount !== 1 ? 's' : ''}</span>
            <span>{timeAgo(session.lastActivity)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
