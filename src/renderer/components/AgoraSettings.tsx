import React from 'react';
import type { AgoraSettingsData } from '../types';

interface AgoraSettingsProps {
  config: AgoraSettingsData;
  onChange: (config: AgoraSettingsData) => void;
}

function intervalLabel(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s}s`;
  return `${Math.round(s / 60)}min`;
}

export default function AgoraSettings({ config, onChange }: AgoraSettingsProps) {
  return (
    <div className="settings-section">
      <div className="toggle-row" style={{ marginBottom: 14 }}>
        <label>Enable Agora</label>
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
        <div className="form-group">
          <label>Post interval: {intervalLabel(config.postIntervalMs)}</label>
          <input
            type="range"
            min={10000}
            max={300000}
            step={10000}
            value={config.postIntervalMs}
            onChange={(e) => onChange({ ...config, postIntervalMs: Number((e.target as HTMLInputElement).value) })}
          />
        </div>

        <div className="form-group">
          <label>Read interval: {intervalLabel(config.readIntervalMs)}</label>
          <input
            type="range"
            min={10000}
            max={120000}
            step={5000}
            value={config.readIntervalMs}
            onChange={(e) => onChange({ ...config, readIntervalMs: Number((e.target as HTMLInputElement).value) })}
          />
        </div>

        <div className="form-group">
          <label>Max post length: {config.maxPostLength} chars</label>
          <input
            type="range"
            min={128}
            max={1024}
            step={64}
            value={config.maxPostLength}
            onChange={(e) => onChange({ ...config, maxPostLength: Number((e.target as HTMLInputElement).value) })}
          />
        </div>

        <div className="form-group">
          <label>Board size: {config.ringBufferSize} posts</label>
          <input
            type="range"
            min={8}
            max={64}
            step={8}
            value={config.ringBufferSize}
            onChange={(e) => onChange({ ...config, ringBufferSize: Number((e.target as HTMLInputElement).value) })}
          />
        </div>
      </div>
    </div>
  );
}
