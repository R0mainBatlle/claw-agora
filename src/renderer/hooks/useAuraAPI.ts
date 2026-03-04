import { useState, useEffect } from 'react';
import type { NearbyPeerData, BleStatusData, AuraSettingsData, BackendStatusData, EncounterPolicyData } from '../types';

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

export function useBackendStatus() {
  const [status, setStatus] = useState<BackendStatusData>({ connected: false, statusText: 'disconnected' });

  useEffect(() => {
    window.auraAPI.getBackendStatus().then(setStatus);
    const unsub = window.auraAPI.onBackendStatusChanged(setStatus);
    return unsub;
  }, []);

  return status;
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

export function useEncounterPolicy() {
  const [policy, setPolicy] = useState<EncounterPolicyData | null>(null);

  useEffect(() => {
    window.auraAPI.getEncounterPolicy().then(setPolicy);
  }, []);

  const updatePolicy = async (partial: Partial<EncounterPolicyData>) => {
    const updated = await window.auraAPI.updateEncounterPolicy(partial);
    setPolicy(updated);
    return updated;
  };

  return { policy, updatePolicy };
}
