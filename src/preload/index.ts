import { contextBridge, ipcRenderer } from 'electron';

const CHANNELS = {
  GET_SETTINGS: 'settings:get',
  UPDATE_SETTINGS: 'settings:update',
  GET_BLE_STATUS: 'ble:status',
  GET_NEARBY_PEERS: 'ble:nearby-peers',
  GET_GATEWAY_STATUS: 'gateway:status',
  NEARBY_PEERS_UPDATED: 'event:nearby-peers-updated',
  BLE_STATUS_CHANGED: 'event:ble-status-changed',
  GATEWAY_STATUS_CHANGED: 'event:gateway-status-changed',
} as const;

const auraAPI = {
  getSettings: () => ipcRenderer.invoke(CHANNELS.GET_SETTINGS),

  updateSettings: (partial: Record<string, unknown>) =>
    ipcRenderer.invoke(CHANNELS.UPDATE_SETTINGS, partial),

  getBleStatus: () => ipcRenderer.invoke(CHANNELS.GET_BLE_STATUS),

  getNearbyPeers: () => ipcRenderer.invoke(CHANNELS.GET_NEARBY_PEERS),

  getGatewayStatus: () => ipcRenderer.invoke(CHANNELS.GET_GATEWAY_STATUS),

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

  onGatewayStatusChanged: (callback: (status: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status);
    ipcRenderer.on(CHANNELS.GATEWAY_STATUS_CHANGED, listener);
    return () => ipcRenderer.removeListener(CHANNELS.GATEWAY_STATUS_CHANGED, listener);
  },
};

contextBridge.exposeInMainWorld('auraAPI', auraAPI);
