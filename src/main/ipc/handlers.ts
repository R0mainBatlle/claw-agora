import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from './channels';
import { SettingsStore } from '../store/settings';
import { BLEEngine } from '../ble/engine';
import { EncounterManager } from '../encounter/manager';
import { GatewayBridge } from '../gateway/bridge';

export function registerIpcHandlers(
  settings: SettingsStore,
  bleEngine: BLEEngine,
  encounterManager: EncounterManager,
  gatewayBridge: GatewayBridge,
  getWindow: () => BrowserWindow | undefined,
): void {
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => {
    return settings.get();
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_SETTINGS, (_event, partial) => {
    const updated = settings.update(partial);
    bleEngine.updateBeacon(updated.tags, {
      acceptingEncounters: true,
      whisperCapable: false,
      humanPresent: true,
    });
    if (partial.gatewayUrl) {
      gatewayBridge.updateUrl(updated.gatewayUrl);
    }
    if (partial.authToken !== undefined) {
      gatewayBridge.updateAuthToken(updated.authToken);
    }
    return updated;
  });

  ipcMain.handle(IPC_CHANNELS.GET_NEARBY_PEERS, () => {
    return encounterManager.getNearbyPeers();
  });

  ipcMain.handle(IPC_CHANNELS.GET_BLE_STATUS, () => {
    return {
      advertising: bleEngine.advertiser.advertising,
      scanning: bleEngine.scanner.scanning,
    };
  });

  ipcMain.handle(IPC_CHANNELS.GET_GATEWAY_STATUS, () => {
    return { connected: gatewayBridge.connected };
  });

  // Push events to renderer
  const sendToRenderer = (channel: string, data: unknown) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  };

  encounterManager.on('encounter', () => {
    sendToRenderer(IPC_CHANNELS.NEARBY_PEERS_UPDATED, encounterManager.getNearbyPeers());
  });

  bleEngine.on('started', () => {
    sendToRenderer(IPC_CHANNELS.BLE_STATUS_CHANGED, { advertising: true, scanning: true });
  });

  bleEngine.on('stopped', () => {
    sendToRenderer(IPC_CHANNELS.BLE_STATUS_CHANGED, { advertising: false, scanning: false });
  });

  gatewayBridge.on('status', (status: string) => {
    sendToRenderer(IPC_CHANNELS.GATEWAY_STATUS_CHANGED, { connected: status === 'connected' });
  });
}
