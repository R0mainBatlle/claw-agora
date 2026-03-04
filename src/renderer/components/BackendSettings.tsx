import React from 'react';
import { useBackendStatus } from '../hooks/useAuraAPI';
import StatusIndicator from './StatusIndicator';

interface BackendSettingsProps {
  backendType: string;
  backendOptions: Record<string, unknown>;
  onTypeChange: (type: string) => void;
  onOptionsChange: (options: Record<string, unknown>) => void;
}

export default function BackendSettings({
  backendType,
  backendOptions,
  onTypeChange,
  onOptionsChange,
}: BackendSettingsProps) {
  const status = useBackendStatus();

  return (
    <div className="settings-section">
      <div className="form-group">
        <label>Backend</label>
        <select
          value={backendType}
          onChange={(e) => onTypeChange(e.target.value)}
          className="select-input"
        >
          <option value="openclaw">OpenClaw Gateway</option>
        </select>
      </div>

      <div className="status-inline">
        <StatusIndicator label="Status" active={status.connected} />
        <span className="status-text">{status.statusText}</span>
      </div>

      {backendType === 'openclaw' && (
        <OpenClawFields options={backendOptions} onChange={onOptionsChange} />
      )}
    </div>
  );
}

function OpenClawFields({
  options,
  onChange,
}: {
  options: Record<string, unknown>;
  onChange: (opts: Record<string, unknown>) => void;
}) {
  const gatewayUrl = (options.gatewayUrl as string) || '';
  const authToken = (options.authToken as string) || '';

  return (
    <>
      <div className="form-group">
        <label>Gateway URL</label>
        <input
          type="text"
          value={gatewayUrl}
          onChange={(e) => onChange({ ...options, gatewayUrl: e.target.value })}
          placeholder="ws://127.0.0.1:18789"
        />
      </div>

      <div className="form-group">
        <label>Auth Token</label>
        <input
          type="password"
          value={authToken}
          onChange={(e) => onChange({ ...options, authToken: e.target.value })}
          placeholder="Auto-detected from OpenClaw config"
        />
      </div>
    </>
  );
}
