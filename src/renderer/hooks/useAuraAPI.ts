import { useState, useEffect } from 'react';
import type { NearbyPeerData, BleStatusData, AuraSettingsData } from '../types';

export function useNearbyPeers() {
  const [peers, setPeers] = useState<NearbyPeerData[]>([]);

  useEffect(() => {
    window.auraAPI.getNearbyPeers().then(setPeers);
    const unsub = window.auraAPI.onNearbyPeersUpdated(setPeers);
    return unsub;
  }, []);

  return peers;
}

export function useBleStatus() {
  const [status, setStatus] = useState<BleStatusData>({ advertising: false, scanning: false });

  useEffect(() => {
    window.auraAPI.getBleStatus().then(setStatus);
    const unsub = window.auraAPI.onBleStatusChanged(setStatus);
    return unsub;
  }, []);

  return status;
}

export function useGatewayStatus() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    window.auraAPI.getGatewayStatus().then((s) => setConnected(s.connected));
    const unsub = window.auraAPI.onGatewayStatusChanged((s) => setConnected(s.connected));
    return unsub;
  }, []);

  return connected;
}

export function useSettings() {
  const [settings, setSettings] = useState<AuraSettingsData | null>(null);

  useEffect(() => {
    window.auraAPI.getSettings().then(setSettings);
  }, []);

  const updateSettings = async (partial: Partial<AuraSettingsData>) => {
    const updated = await window.auraAPI.updateSettings(partial);
    setSettings(updated);
    return updated;
  };

  return { settings, updateSettings };
}
