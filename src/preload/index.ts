import { contextBridge, ipcRenderer } from 'electron';

const CHANNELS = {
  GET_SETTINGS: 'settings:get',
  UPDATE_SETTINGS: 'settings:update',
  GET_BLE_STATUS: 'ble:status',
  GET_NEARBY_PEERS: 'ble:nearby-peers',
  GET_BACKEND_STATUS: 'backend:status',
  QUERY_AGENT: 'agent:query',
  GET_ENCOUNTER_POLICY: 'policy:get',
  UPDATE_ENCOUNTER_POLICY: 'policy:update',
  GET_AGORA_POSTS: 'agora:get-posts',
  GET_WHISPER_SESSIONS: 'whisper:get-sessions',
  GET_WHISPER_MESSAGES: 'whisper:get-messages',
  NEARBY_PEERS_UPDATED: 'event:nearby-peers-updated',
  BLE_STATUS_CHANGED: 'event:ble-status-changed',
  BACKEND_STATUS_CHANGED: 'event:backend-status-changed',
  AGORA_POST_RECEIVED: 'event:agora-post',
  WHISPER_SESSION_UPDATE: 'event:whisper-session-update',
  WHISPER_MESSAGE: 'event:whisper-message',
} as const;

const auraAPI = {
  getSettings: () => ipcRenderer.invoke(CHANNELS.GET_SETTINGS),

  updateSettings: (partial: Record<string, unknown>) =>
    ipcRenderer.invoke(CHANNELS.UPDATE_SETTINGS, partial),

  getBleStatus: () => ipcRenderer.invoke(CHANNELS.GET_BLE_STATUS),

  getNearbyPeers: () => ipcRenderer.invoke(CHANNELS.GET_NEARBY_PEERS),

  getBackendStatus: () => ipcRenderer.invoke(CHANNELS.GET_BACKEND_STATUS),

  queryAgent: (prompt: string, systemPrompt?: string) =>
    ipcRenderer.invoke(CHANNELS.QUERY_AGENT, prompt, systemPrompt),

  getEncounterPolicy: () => ipcRenderer.invoke(CHANNELS.GET_ENCOUNTER_POLICY),

  updateEncounterPolicy: (partial: Record<string, unknown>) =>
    ipcRenderer.invoke(CHANNELS.UPDATE_ENCOUNTER_POLICY, partial),

  getAgoraPosts: () => ipcRenderer.invoke(CHANNELS.GET_AGORA_POSTS),

  getWhisperSessions: () => ipcRenderer.invoke(CHANNELS.GET_WHISPER_SESSIONS),

  getWhisperMessages: (sessionId: string) =>
    ipcRenderer.invoke(CHANNELS.GET_WHISPER_MESSAGES, sessionId),

  // Event listeners
  onNearbyPeersUpdated: (callback: (peers: unknown[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, peers: unknown[]) => callback(peers);
    ipcRenderer.on(CHANNELS.NEARBY_PEERS_UPDATED, listener);
    return () => ipcRenderer.removeListener(CHANNELS.NEARBY_PEERS_UPDATED, listener);
  },

  onBleStatusChanged: (callback: (status: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status);
    ipcRenderer.on(CHANNELS.BLE_STATUS_CHANGED, listener);
    return () => ipcRenderer.removeListener(CHANNELS.BLE_STATUS_CHANGED, listener);
  },

  onBackendStatusChanged: (callback: (status: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status);
    ipcRenderer.on(CHANNELS.BACKEND_STATUS_CHANGED, listener);
    return () => ipcRenderer.removeListener(CHANNELS.BACKEND_STATUS_CHANGED, listener);
  },

  onAgoraPost: (callback: (post: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, post: unknown) => callback(post);
    ipcRenderer.on(CHANNELS.AGORA_POST_RECEIVED, listener);
    return () => ipcRenderer.removeListener(CHANNELS.AGORA_POST_RECEIVED, listener);
  },

  onWhisperSessionUpdate: (callback: (sessions: unknown[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, sessions: unknown[]) => callback(sessions);
    ipcRenderer.on(CHANNELS.WHISPER_SESSION_UPDATE, listener);
    return () => ipcRenderer.removeListener(CHANNELS.WHISPER_SESSION_UPDATE, listener);
  },

  onWhisperMessage: (callback: (msg: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, msg: unknown) => callback(msg);
    ipcRenderer.on(CHANNELS.WHISPER_MESSAGE, listener);
    return () => ipcRenderer.removeListener(CHANNELS.WHISPER_MESSAGE, listener);
  },
};

contextBridge.exposeInMainWorld('auraAPI', auraAPI);
