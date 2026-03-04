import { contextBridge, ipcRenderer } from 'electron';

const CHANNELS = {
  GET_SETTINGS: 'settings:get',
  UPDATE_SETTINGS: 'settings:update',
  GET_BLE_STATUS: 'ble:status',
  GET_NEARBY_PEERS: 'ble:nearby-peers',
  GET_BACKEND_STATUS: 'backend:status',
  GET_ENCOUNTER_POLICY: 'policy:get',
  UPDATE_ENCOUNTER_POLICY: 'policy:update',
  NEARBY_PEERS_UPDATED: 'event:nearby-peers-updated',
  BLE_STATUS_CHANGED: 'event:ble-status-changed',
  BACKEND_STATUS_CHANGED: 'event:backend-status-changed',
} as const;

const auraAPI = {
  getSettings: () => ipcRenderer.invoke(CHANNELS.GET_SETTINGS),

  updateSettings: (partial: Record<string, unknown>) =>
    ipcRenderer.invoke(CHANNELS.UPDATE_SETTINGS, partial),

  getBleStatus: () => ipcRenderer.invoke(CHANNELS.GET_BLE_STATUS),

  getNearbyPeers: () => ipcRenderer.invoke(CHANNELS.GET_NEARBY_PEERS),

  getBackendStatus: () => ipcRenderer.invoke(CHANNELS.GET_BACKEND_STATUS),

  getEncounterPolicy: () => ipcRenderer.invoke(CHANNELS.GET_ENCOUNTER_POLICY),

  updateEncounterPolicy: (partial: Record<string, unknown>) =>
    ipcRenderer.invoke(CHANNELS.UPDATE_ENCOUNTER_POLICY, partial),

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
};

contextBridge.exposeInMainWorld('auraAPI', auraAPI);
