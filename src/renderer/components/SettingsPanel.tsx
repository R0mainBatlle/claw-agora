import React, { useState, useEffect } from 'react';
import { useSettings, useEncounterPolicy } from '../hooks/useAuraAPI';
import SettingsSidebar, { SettingsTab } from './SettingsSidebar';
import IdentitySettings from './IdentitySettings';
import BackendSettings from './BackendSettings';
import PolicySettings from './PolicySettings';
import type { EncounterPolicyData } from '../types';

interface SettingsPanelProps {
  onBack: () => void;
}

export default function SettingsPanel({ onBack }: SettingsPanelProps) {
  const { settings, updateSettings } = useSettings();
  const { policy, updatePolicy } = useEncounterPolicy();

  const [activeTab, setActiveTab] = useState<SettingsTab>('identity');
  const [humanDescription, setHumanDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [backendType, setBackendType] = useState('openclaw');
  const [backendOptions, setBackendOptions] = useState<Record<string, unknown>>({});
  const [localPolicy, setLocalPolicy] = useState<EncounterPolicyData | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setHumanDescription(settings.humanDescription);
      setTags(settings.tags);
      setBackendType(settings.backendType);
      setBackendOptions(settings.backendOptions);
    }
  }, [settings]);

  useEffect(() => {
    if (policy) {
      setLocalPolicy(policy);
    }
  }, [policy]);

  const handleSave = async () => {
    setSaving(true);
    await updateSettings({
      humanDescription,
      tags,
      backendType,
      backendOptions,
    });
    if (localPolicy) {
      await updatePolicy(localPolicy);
    }
    setSaving(false);
    onBack();
  };

  if (!settings || !localPolicy) {
    return <div className="settings-panel">Loading...</div>;
  }

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2>Settings</h2>
      </div>

      <div className="settings-layout">
        <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="settings-content">
          {activeTab === 'identity' && (
            <IdentitySettings
              humanDescription={humanDescription}
              tags={tags}
              onDescriptionChange={setHumanDescription}
              onTagsChange={setTags}
            />
          )}

          {activeTab === 'backend' && (
            <BackendSettings
              backendType={backendType}
              backendOptions={backendOptions}
              onTypeChange={setBackendType}
              onOptionsChange={setBackendOptions}
            />
          )}

          {activeTab === 'policy' && (
            <PolicySettings
              policy={localPolicy}
              onChange={setLocalPolicy}
            />
          )}
        </div>
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
