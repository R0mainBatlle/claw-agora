import path from 'node:path';
import fs from 'node:fs';
import { app, BrowserWindow, nativeImage } from 'electron';
import { menubar } from 'menubar';
import { BLEEngine } from './ble/engine';
import { EncounterManager } from './encounter/manager';
import { GatewayBridge } from './gateway/bridge';
import { SettingsStore } from './store/settings';
import { registerIpcHandlers } from './ipc/handlers';
import { DiscoveredBeacon } from './ble/scanner';
import { EncounterEvent } from './encounter/types';

// Hide dock icon (menu bar app)
app.dock?.hide();

const settings = new SettingsStore();
const bleEngine = new BLEEngine();
const encounterManager = new EncounterManager();
const currentSettings = settings.get();
const gatewayBridge = new GatewayBridge(currentSettings.gatewayUrl, currentSettings.authToken);

const iconPath = path.join(__dirname, '../../../assets/iconTemplate.png');
const icon2xPath = path.join(__dirname, '../../../assets/iconTemplate@2x.png');
console.log(`[Aura] Icon path: ${iconPath} (exists: ${fs.existsSync(iconPath)})`);
console.log(`[Aura] Icon 2x path: ${icon2xPath} (exists: ${fs.existsSync(icon2xPath)})`);

// Create a nativeImage with both 1x and 2x representations
let icon = nativeImage.createFromPath(iconPath);
if (icon.isEmpty()) {
  console.warn('[Aura] Icon is empty, creating fallback icon');
  // Create a simple 22x22 filled circle as fallback
  const size = 22;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2;
      const dy = y - size / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const offset = (y * size + x) * 4;
      if (dist < size * 0.4) {
        buf[offset] = 0;     // R
        buf[offset + 1] = 0; // G
        buf[offset + 2] = 0; // B
        buf[offset + 3] = 255; // A
      }
    }
  }
  icon = nativeImage.createFromBuffer(buf, { width: size, height: size });
}
icon.setTemplateImage(true);

const mb = menubar({
  index: `file://${path.join(__dirname, '../../renderer/index.html')}`,
  icon,
  preloadWindow: true,
  showDockIcon: false,
  browserWindow: {
    width: 320,
    height: 480,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  },
});

mb.on('ready', async () => {
  console.log('[Aura] Menu bar app ready');

  // Register IPC handlers
  registerIpcHandlers(
    settings,
    bleEngine,
    encounterManager,
    gatewayBridge,
    () => mb.window as BrowserWindow | undefined,
  );

  // Wire BLE discoveries to encounter manager
  bleEngine.on('beacon-discovered', (beacon: DiscoveredBeacon) => {
    encounterManager.handleBeaconDiscovered(beacon);
  });

  bleEngine.on('rssi-update', (update: { peripheralId: string; rssi: number }) => {
    encounterManager.handleRssiUpdate(update);
  });

  // Wire encounter events to gateway
  encounterManager.on('encounter', (event: EncounterEvent) => {
    gatewayBridge.sendEncounterEvent(event);
  });

  // Start encounter manager
  encounterManager.start();

  // Start BLE
  try {
    await bleEngine.start(currentSettings.tags, {
      acceptingEncounters: true,
      whisperCapable: false,
      humanPresent: true,
    });
    console.log(`[Aura] BLE started. Claw ID: ${bleEngine.localClawId.toString('hex')}`);
  } catch (err) {
    console.error('[Aura] BLE start failed:', err);
  }

  // Connect to gateway (non-blocking, will auto-reconnect)
  if (currentSettings.gatewayUrl) {
    gatewayBridge.connect();
    console.log(`[Aura] Connecting to Gateway: ${currentSettings.gatewayUrl}`);
  }

  gatewayBridge.on('error', (err: Error) => {
    console.error('[Aura] Gateway error:', err.message);
  });
});

// Clean shutdown
app.on('before-quit', async () => {
  console.log('[Aura] Shutting down...');
  encounterManager.stop();
  gatewayBridge.disconnect();
  await bleEngine.stop();
});
