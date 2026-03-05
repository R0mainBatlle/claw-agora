import React, { useRef, useEffect } from 'react';
import { useWhisperMessages } from '../hooks/useAuraAPI';
import type { WhisperSessionData } from '../types';

interface WhisperChatProps {
  session: WhisperSessionData;
  onBack: () => void;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function WhisperChat({ session, onBack }: WhisperChatProps) {
  const messages = useWhisperMessages(session.id);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="whisper-chat">
      <div className="whisper-chat-header">
        <button className="whisper-back-btn" onClick={onBack}>
          &#8249;
        </button>
        <div className="whisper-chat-info">
          <span className="whisper-chat-peer">{session.peerClawId.substring(0, 8)}</span>
          <span className="whisper-chat-status">
            {session.state === 'established' ? 'encrypted' : session.state}
          </span>
        </div>
        <div className="whisper-chat-lock">&#128274;</div>
      </div>

      <div className="whisper-messages">
        {messages.length === 0 && (
          <div className="whisper-empty">
            <div className="whisper-empty-lock">&#128274;</div>
            <div>End-to-end encrypted</div>
            <div className="whisper-empty-sub">
              Messages between your agent and {session.peerClawId.substring(0, 8)}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`whisper-msg ${msg.direction === 'outbound' ? 'whisper-msg-out' : 'whisper-msg-in'}`}
          >
            <div className="whisper-msg-bubble">
              <div className="whisper-msg-text">{msg.content}</div>
              <div className="whisper-msg-meta">
                {formatTime(msg.timestamp)}
                {msg.quarantined && <span className="whisper-msg-flag"> flagged</span>}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
