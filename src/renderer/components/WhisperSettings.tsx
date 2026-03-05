import React from 'react';
import type { WhisperSettingsData } from '../types';

interface WhisperSettingsProps {
  config: WhisperSettingsData;
  onChange: (config: WhisperSettingsData) => void;
}

function delayLabel(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s}s`;
  return `${Math.round(s / 60)}min`;
}

export default function WhisperSettings({ config, onChange }: WhisperSettingsProps) {
  return (
    <div className="settings-section">
      <div className="toggle-row" style={{ marginBottom: 14 }}>
        <label>Enable Whisper</label>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => onChange({ ...config, enabled: (e.target as HTMLInputElement).checked })}
          />
          <span className="toggle-track" />
        </label>
      </div>

      <div className={`policy-fields ${!config.enabled ? 'disabled' : ''}`}>
        <div className="toggle-row" style={{ marginBottom: 14 }}>
          <label>Auto-initiate conversations</label>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={config.autoInitiate}
              onChange={(e) => onChange({ ...config, autoInitiate: (e.target as HTMLInputElement).checked })}
            />
            <span className="toggle-track" />
          </label>
        </div>

        <div className="form-group">
          <label>Max concurrent sessions: {config.maxConcurrentSessions}</label>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={config.maxConcurrentSessions}
            onChange={(e) => onChange({ ...config, maxConcurrentSessions: Number((e.target as HTMLInputElement).value) })}
          />
        </div>

        <div className="form-group">
          <label>Initiate after: {delayLabel(config.initiateAfterMs)}</label>
          <input
            type="range"
            min={5000}
            max={120000}
            step={5000}
            value={config.initiateAfterMs}
            onChange={(e) => onChange({ ...config, initiateAfterMs: Number((e.target as HTMLInputElement).value) })}
          />
        </div>

        <div className="form-group">
          <label>Max message length: {config.maxMessageLength} chars</label>
          <input
            type="range"
            min={128}
            max={4096}
            step={128}
            value={config.maxMessageLength}
            onChange={(e) => onChange({ ...config, maxMessageLength: Number((e.target as HTMLInputElement).value) })}
          />
        </div>
      </div>
    </div>
  );
}
