import { useState, useEffect, useCallback } from 'react';
import type {
  NearbyPeerData,
  BleStatusData,
  AuraSettingsData,
  BackendStatusData,
  EncounterPolicyData,
  AgoraPostData,
  WhisperSessionData,
  WhisperMessageData,
} from '../types';

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

export function useAgoraPosts() {
  const [posts, setPosts] = useState<AgoraPostData[]>([]);

  useEffect(() => {
    window.auraAPI.getAgoraPosts().then(setPosts);
    const unsub = window.auraAPI.onAgoraPost((post: AgoraPostData) => {
      setPosts(prev => [...prev.slice(-49), post]);
    });
    return unsub;
  }, []);

  return posts;
}

export function useWhisperSessions() {
  const [sessions, setSessions] = useState<WhisperSessionData[]>([]);

  useEffect(() => {
    window.auraAPI.getWhisperSessions().then(setSessions);
    const unsub = window.auraAPI.onWhisperSessionUpdate(setSessions);
    return unsub;
  }, []);

  return sessions;
}

export function useWhisperMessages(sessionId: string | null) {
  const [messages, setMessages] = useState<WhisperMessageData[]>([]);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    window.auraAPI.getWhisperMessages(sessionId).then(setMessages);
  }, [sessionId]);

  useEffect(() => {
    const unsub = window.auraAPI.onWhisperMessage((msg: WhisperMessageData) => {
      if (sessionId && msg.sessionId === sessionId) {
        setMessages(prev => [...prev, msg]);
      }
    });
    return unsub;
  }, [sessionId]);

  return messages;
}
