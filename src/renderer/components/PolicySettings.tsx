import React from 'react';
import type { EncounterPolicyData } from '../types';

interface PolicySettingsProps {
  policy: EncounterPolicyData;
  onChange: (policy: EncounterPolicyData) => void;
}

function rssiToLabel(rssi: number): string {
  if (rssi >= -50) return '~1-2m';
  if (rssi >= -60) return '~2-4m';
  if (rssi >= -70) return '~4-8m';
  if (rssi >= -80) return '~8-15m';
  return '~15m+';
}

function msToLabel(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(0)}s`;
}

function cooldownToLabel(ms: number): string {
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  return `${(ms / 60000).toFixed(0)} min`;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" />
    </label>
  );
}

export default function PolicySettings({ policy, onChange }: PolicySettingsProps) {
  const update = (partial: Partial<EncounterPolicyData>) => {
    onChange({ ...policy, ...partial });
  };

  return (
    <div className="settings-section">
      <div className="toggle-row" style={{ marginBottom: 16 }}>
        <label>Encounter notifications</label>
        <Toggle checked={policy.enabled} onChange={(v) => update({ enabled: v })} />
      </div>

      <div className={`policy-fields ${!policy.enabled ? 'disabled' : ''}`}>
        <div className="form-group">
          <label>
            Min signal strength: {policy.minRssi} dBm ({rssiToLabel(policy.minRssi)})
          </label>
          <input
            type="range"
            min={-100}
            max={-30}
            value={policy.minRssi}
            onChange={(e) => update({ minRssi: Number(e.target.value) })}
          />
        </div>

        <div className="form-group">
          <label>Min dwell time: {msToLabel(policy.minDwellMs)}</label>
          <input
            type="range"
            min={0}
            max={30000}
            step={1000}
            value={policy.minDwellMs}
            onChange={(e) => update({ minDwellMs: Number(e.target.value) })}
          />
        </div>

        <div className="form-group">
          <label>Cooldown per agent: {cooldownToLabel(policy.cooldownMs)}</label>
          <input
            type="range"
            min={60000}
            max={1800000}
            step={60000}
            value={policy.cooldownMs}
            onChange={(e) => update({ cooldownMs: Number(e.target.value) })}
          />
        </div>

        <div className="form-group">
          <label>Max encounters per hour: {policy.maxPerHour}</label>
          <input
            type="range"
            min={1}
            max={100}
            value={policy.maxPerHour}
            onChange={(e) => update({ maxPerHour: Number(e.target.value) })}
          />
        </div>

        <div className="toggle-row">
          <label>Require human present</label>
          <Toggle checked={policy.requireHumanPresent} onChange={(v) => update({ requireHumanPresent: v })} />
        </div>
      </div>
    </div>
  );
}
