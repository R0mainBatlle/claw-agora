import React from 'react';

export type SettingsTab = 'identity' | 'backend' | 'policy';

interface SettingsSidebarProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

const TABS: { key: SettingsTab; label: string }[] = [
  { key: 'identity', label: 'Identity' },
  { key: 'backend', label: 'Backend' },
  { key: 'policy', label: 'Policy' },
];

export default function SettingsSidebar({ activeTab, onTabChange }: SettingsSidebarProps) {
  return (
    <div className="settings-sidebar">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          className={`sidebar-tab ${activeTab === tab.key ? 'active' : ''}`}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
