import React, { useState } from 'react';
import MenuBarDropdown from './components/MenuBarDropdown';
import SettingsPanel from './components/SettingsPanel';

export default function App() {
  const [showSettings, setShowSettings] = useState(false);

  return showSettings ? (
    <SettingsPanel onBack={() => setShowSettings(false)} />
  ) : (
    <MenuBarDropdown onOpenSettings={() => setShowSettings(true)} />
  );
}
