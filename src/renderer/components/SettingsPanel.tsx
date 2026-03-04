import React, { useState, useEffect } from 'react';
import { useSettings } from '../hooks/useAuraAPI';

interface SettingsPanelProps {
  onBack: () => void;
}

export default function SettingsPanel({ onBack }: SettingsPanelProps) {
  const { settings, updateSettings } = useSettings();

  const [gatewayUrl, setGatewayUrl] = useState('');
  const [humanDescription, setHumanDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setGatewayUrl(settings.gatewayUrl);
      setHumanDescription(settings.humanDescription);
      setTagsInput(settings.tags.join(', '));
      setAuthToken(settings.authToken);
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    await updateSettings({ gatewayUrl, humanDescription, tags, authToken });
    setSaving(false);
    onBack();
  };

  if (!settings) {
    return <div className="settings-panel">Loading...</div>;
  }

  return (
    <div className="settings-panel">
      <h2>Settings</h2>

      <div className="form-group">
        <label>Gateway URL</label>
        <input
          type="text"
          value={gatewayUrl}
          onChange={(e) => setGatewayUrl(e.target.value)}
          placeholder="ws://127.0.0.1:18789"
        />
      </div>

      <div className="form-group">
        <label>Auth Token</label>
        <input
          type="password"
          value={authToken}
          onChange={(e) => setAuthToken(e.target.value)}
          placeholder="Gateway auth token"
        />
      </div>

      <div className="form-group">
        <label>About my human</label>
        <textarea
          value={humanDescription}
          onChange={(e) => setHumanDescription(e.target.value)}
          placeholder="Describe yourself — this is what your Claw uses to represent you to other Claws"
        />
      </div>

      <div className="form-group">
        <label>Tags (comma-separated, max 8)</label>
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="rust, defense-tech, ai-agents"
        />
      </div>

      <div className="settings-actions">
        <button className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
