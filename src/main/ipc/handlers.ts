import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from './channels';
import { SettingsStore } from '../store/settings';
import { BLEEngine } from '../ble/engine';
import { EncounterManager } from '../encounter/manager';
import { EncounterPolicy } from '../encounter/policy';
import { AgentBackend } from '../agent/backend';
import { AgoraManager } from '../agora/manager';
import { WhisperManager } from '../whisper/manager';

export function registerIpcHandlers(
  settings: SettingsStore,
  bleEngine: BLEEngine,
  encounterManager: EncounterManager,
  backend: AgentBackend,
  encounterPolicy: EncounterPolicy,
  getWindow: () => BrowserWindow | undefined,
  agoraManager?: AgoraManager,
  whisperManager?: WhisperManager,
): void {
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => {
    return settings.get();
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_SETTINGS, (_event, partial) => {
    const updated = settings.update(partial);
    bleEngine.updateBeacon(updated.tags, {
      acceptingEncounters: true,
      whisperCapable: updated.whisper?.enabled ?? true,
      humanPresent: true,
    });
    if (partial.backendOptions) {
      backend.updateOptions(partial.backendOptions);
    }
    if (partial.encounterPolicy) {
      encounterPolicy.updateConfig(partial.encounterPolicy);
    }
    if (partial.agora && agoraManager) {
      agoraManager.updateConfig(partial.agora);
    }
    if (partial.whisper && whisperManager) {
      whisperManager.updateConfig(partial.whisper);
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

  ipcMain.handle(IPC_CHANNELS.GET_BACKEND_STATUS, () => {
    return backend.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.QUERY_AGENT, async (_event, prompt: string, systemPrompt?: string) => {
    return backend.query(prompt, systemPrompt);
  });

  ipcMain.handle(IPC_CHANNELS.GET_ENCOUNTER_POLICY, () => {
    return encounterPolicy.getConfig();
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_ENCOUNTER_POLICY, (_event, partial) => {
    encounterPolicy.updateConfig(partial);
    settings.update({ encounterPolicy: encounterPolicy.getConfig() });
    return encounterPolicy.getConfig();
  });

  // Agora
  ipcMain.handle(IPC_CHANNELS.GET_AGORA_POSTS, () => {
    return agoraManager?.feed || [];
  });

  // Whisper
  ipcMain.handle(IPC_CHANNELS.GET_WHISPER_SESSIONS, () => {
    return whisperManager?.getSessions() || [];
  });

  ipcMain.handle(IPC_CHANNELS.GET_WHISPER_MESSAGES, (_event, sessionId: string) => {
    return whisperManager?.getMessages(sessionId) || [];
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

  backend.on('status', () => {
    sendToRenderer(IPC_CHANNELS.BACKEND_STATUS_CHANGED, backend.getStatus());
  });

  // Agora events
  if (agoraManager) {
    agoraManager.on('post', (item) => {
      sendToRenderer(IPC_CHANNELS.AGORA_POST_RECEIVED, item);
    });
  }

  // Whisper events
  if (whisperManager) {
    whisperManager.on('session-update', () => {
      sendToRenderer(IPC_CHANNELS.WHISPER_SESSION_UPDATE, whisperManager.getSessions());
    });
    whisperManager.on('session-message', (msg) => {
      sendToRenderer(IPC_CHANNELS.WHISPER_MESSAGE, msg);
    });
  }
}
