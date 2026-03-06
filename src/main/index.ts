import path from 'node:path';
import fs from 'node:fs';
import { app, BrowserWindow, nativeImage } from 'electron';
import { menubar } from 'menubar';
let liquidGlass: any = null;
try {
  // Optional dependency — native addon may not build on all platforms
  const mod = require('electron-liquid-glass');
  liquidGlass = mod.default ?? mod;
} catch {
  console.warn('[Aura] electron-liquid-glass not available, glass effects disabled');
}
import { BLEEngine } from './ble/engine';
import { EncounterManager } from './encounter/manager';
import { EncounterPolicy } from './encounter/policy';
import { BackendRegistry } from './agent/registry';
import { OpenClawBackend } from './agent/openclaw-backend';
import { AgentBackend } from './agent/backend';
import { formatEncounterMessage } from './agent/message-formatter';
import { SettingsStore } from './store/settings';
import { ActivityLog } from './store/activity-log';
import { registerIpcHandlers } from './ipc/handlers';
import { DiscoveredBeacon } from './ble/engine';
import { EncounterEvent } from './encounter/types';
import { AgoraManager } from './agora/manager';
import { readRemoteAgora } from './agora/reader';
import { WhisperManager } from './whisper/manager';
import { IdentityStore } from './security/identity';

// AgoraService and WhisperService depend on @stoprocent/bleno (macOS-only)
let AgoraService: any = null;
let WhisperService: any = null;
try {
  AgoraService = require('./agora/service').AgoraService;
  WhisperService = require('./whisper/service').WhisperService;
} catch {
  // bleno not available (Linux) — GATT services for agora/whisper disabled
}
import type { PeerContext } from './agent/backend';
import { startDemo } from './demo';

// Hide dock icon (menu bar app)
app.dock?.hide();

// Prevent quitting when window is hidden (tray app)
app.on('window-all-closed', () => {
  // Do nothing — keep running as tray app
});

const settings = new SettingsStore();
const activityLog = new ActivityLog();
const identity = new IdentityStore().get();
const bleEngine = new BLEEngine(identity.clawId);
const encounterManager = new EncounterManager();
const currentSettings = settings.get();
const encounterPolicy = new EncounterPolicy(currentSettings.encounterPolicy);

// Backend registry
const registry = new BackendRegistry();
registry.register('openclaw', () => new OpenClawBackend());

const backend: AgentBackend = registry.create(currentSettings.backendType);

const iconPath = path.join(__dirname, '../../../assets/iconTemplate.png');
const icon2xPath = path.join(__dirname, '../../../assets/iconTemplate@2x.png');
console.log(`[Aura] Icon path: ${iconPath} (exists: ${fs.existsSync(iconPath)})`);
console.log(`[Aura] Icon 2x path: ${icon2xPath} (exists: ${fs.existsSync(icon2xPath)})`);

// Create a nativeImage with both 1x and 2x representations
let icon = nativeImage.createFromPath(iconPath);
if (icon.isEmpty()) {
  console.warn('[Aura] Icon is empty, creating fallback icon');
  const size = 22;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2;
      const dy = y - size / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const offset = (y * size + x) * 4;
      if (dist < size * 0.4) {
        buf[offset] = 0;
        buf[offset + 1] = 0;
        buf[offset + 2] = 0;
        buf[offset + 3] = 255;
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
    width: 360,
    height: 520,
    resizable: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  },
});

mb.on('ready', async () => {
  console.log('[Aura] Menu bar app ready');

  // Prune old activity log entries on startup
  activityLog.prune().catch(err =>
    console.error('[ActivityLog] Prune failed:', (err as Error).message),
  );

  // Apply Liquid Glass to the window (with fallback)
  const win = mb.window;
  if (win && liquidGlass && liquidGlass.isGlassSupported()) {
    try {
      const glassId = liquidGlass.addView(win.getNativeWindowHandle(), {
        cornerRadius: 12,
        opaque: true,
        tintColor: '#00000030',
      });
      console.log(`[Aura] Liquid Glass applied (id=${glassId})`);
    } catch (err) {
      console.warn('[Aura] Liquid Glass addView failed, continuing without glass:', (err as Error).message);
      win.setBackgroundColor('#1a1a1a');
    }
  } else if (win) {
    console.log('[Aura] Liquid Glass not available, using solid background');
    win.setBackgroundColor('#1a1a1a');
  }

  // Wire BLE discoveries to encounter manager
  bleEngine.on('beacon-discovered', (beacon: DiscoveredBeacon) => {
    encounterManager.handleBeaconDiscovered(beacon);
  });

  bleEngine.on('rssi-update', (update: { peripheralId: string; rssi: number }) => {
    encounterManager.handleRssiUpdate(update);
  });

  // Wire encounter events through policy → formatter → backend
  encounterManager.on('encounter', (event: EncounterEvent) => {
    const decision = encounterPolicy.evaluate(event);
    if (decision.allow) {
      const message = formatEncounterMessage(event);
      backend.deliverEncounter(event, message);
    }
  });

  // Log encounters to activity log
  encounterManager.on('encounter', (event: EncounterEvent) => {
    if (event.type === 'encounter-start' || event.type === 'encounter-end') {
      activityLog.append({
        type: 'encounter',
        timestamp: event.timestamp,
        data: {
          eventType: event.type,
          clawId: event.peer.clawId,
          rssi: event.peer.rssi,
          flags: event.peer.flags,
        },
      });
    }
  });

  // Start encounter manager
  encounterManager.start();

  // --- Agora setup ---
  const agoraManager = new AgoraManager(backend, bleEngine.localClawId);

  if (AgoraService) {
    const agoraService = new AgoraService(
      agoraManager.buffer,
      bleEngine.localClawId,
      identity.publicKeyDer,
      identity.privateKey,
    );
    bleEngine.advertiser.addService(agoraService.service);

    // Wire agora reading into scan cycle — read remote boards while still connected
    bleEngine.scanner.addConnectionHook(async (peripheral) => {
      const expectedPeer = encounterManager.getPeerByPeripheralId(peripheral.id);
      const result = await readRemoteAgora(peripheral, expectedPeer?.clawId);
      if (!result || result.posts.length === 0) return;
      const peerClawIdHex = result.meta.ownerClawId.toString('hex');
      await agoraManager.handleRemotePosts(peerClawIdHex, result.posts);
      console.log(`[Aura] Read ${result.posts.length} agora post(s) from ${peerClawIdHex.substring(0, 8)}`);
    });
  }

  // Log agora posts to activity log
  agoraManager.on('post', (item) => {
    activityLog.append({
      type: 'agora-post',
      timestamp: item.timestamp,
      data: {
        authorClawId: item.authorClawId,
        content: item.content.substring(0, 256),
        isLocal: item.isLocal,
      },
    });
  });

  // --- Whisper setup ---
  const whisperService = WhisperService ? new WhisperService() : null;
  const whisperManager = new WhisperManager(backend, bleEngine.localClawId, identity, whisperService);

  // Register whisper GATT service (macOS only)
  if (whisperService) {
    bleEngine.advertiser.addService(whisperService.service);
  }

  // Give whisper manager access to agora posts for enriching incoming request context
  whisperManager.setContextProvider((clawId) =>
    agoraManager.getPostsByPeer(clawId).map(p => p.content),
  );

  whisperManager.on('session-established', (sessionId: string, peerClawId: string) => {
    console.log(`[Aura] Whisper session established: ${sessionId.substring(0, 8)} with ${peerClawId.substring(0, 8)}`);
    activityLog.append({
      type: 'whisper-session',
      timestamp: Date.now(),
      data: { sessionId, peerClawId, event: 'established' },
    });
  });
  whisperManager.on('session-closed', (sessionId: string, peerClawId: string, reason: string) => {
    console.log(`[Aura] Whisper session closed: ${sessionId.substring(0, 8)} — ${reason}`);
    activityLog.append({
      type: 'whisper-session',
      timestamp: Date.now(),
      data: { sessionId, peerClawId, event: 'closed', reason },
    });
  });
  whisperManager.on('session-message', (msg: { sessionId: string; peerClawId: string; direction: string; content: string }) => {
    activityLog.append({
      type: 'whisper-message',
      timestamp: Date.now(),
      data: {
        sessionId: msg.sessionId,
        peerClawId: msg.peerClawId,
        direction: msg.direction,
        content: msg.content.substring(0, 256),
      },
    });
  });

  // --- Whisper initiation coordinator ---
  // Track peers we've already attempted to whisper with (avoid spam)
  const whisperAttempted = new Set<string>();
  const whisperSettings = settings.get().whisper;

  encounterManager.on('encounter', async (event: EncounterEvent) => {
    if (event.type !== 'encounter-update') return;
    if (!whisperSettings.enabled || !whisperSettings.autoInitiate) return;

    const peer = event.peer;
    if (!peer.flags.whisperCapable) return;
    if (whisperAttempted.has(peer.clawId)) return;

    const dwellTimeMs = event.timestamp - peer.firstSeen;
    if (dwellTimeMs < whisperSettings.initiateAfterMs) return;

    // Mark as attempted before async call to prevent duplicate initiations
    whisperAttempted.add(peer.clawId);

    // Build rich context with agora posts
    const recentPosts = agoraManager.getPostsByPeer(peer.clawId)
      .map(p => p.content);
    const context: PeerContext = {
      clawId: peer.clawId,
      rssi: peer.rssi,
      dwellTimeMs,
      flags: peer.flags,
      recentAgoraPosts: recentPosts,
    };

    try {
      const initiated = await whisperManager.initiateWhisper(peer, peer.clawId, context);
      if (initiated) {
        console.log(`[Aura] Whisper initiated with ${peer.clawId.substring(0, 8)} after ${Math.round(dwellTimeMs / 1000)}s dwell`);
      }
    } catch (err) {
      console.error(`[Aura] Whisper initiation failed for ${peer.clawId.substring(0, 8)}:`, (err as Error).message);
    }
  });

  // Clean up whisper attempts when peers leave
  encounterManager.on('encounter', (event: EncounterEvent) => {
    if (event.type === 'encounter-end') {
      whisperAttempted.delete(event.peer.clawId);
    }
  });

  // Register IPC handlers (after agora/whisper setup so they get the managers)
  registerIpcHandlers(
    settings,
    bleEngine,
    encounterManager,
    backend,
    encounterPolicy,
    () => mb.window as BrowserWindow | undefined,
    agoraManager,
    whisperManager,
    activityLog,
  );

  // --- Demo mode or real mode ---
  const isDemo = process.argv.includes('--demo');

  if (isDemo) {
    console.log('[Aura] Running in DEMO mode — no BLE, no backend');
    // Fake status indicators so UI looks alive
    const win = mb.window;
    if (win && !win.isDestroyed()) {
      win.webContents.send('event:ble-status-changed', { advertising: true, scanning: true });
      win.webContents.send('event:backend-status-changed', { connected: true, statusText: 'demo mode' });
    }
    startDemo(encounterManager, agoraManager, whisperManager);
  } else {
    // Start BLE
    try {
      await bleEngine.start(currentSettings.tags, {
        acceptingEncounters: true,
        whisperCapable: true,
        humanPresent: true,
      });
      console.log(`[Aura] BLE started. Claw ID: ${bleEngine.localClawId.toString('hex')}`);
    } catch (err) {
      console.error('[Aura] BLE start failed:', err);
    }

    // Connect to backend
    backend.connect(currentSettings.backendOptions);
    console.log(`[Aura] Connecting to ${backend.displayName}`);

    backend.on('error', (err: Error) => {
      console.error(`[Aura] ${backend.displayName} error:`, err.message);
    });

    // Start Agora (polls agent for posts, needs nearby peers with their agora context)
    agoraManager.start(() => {
      return encounterManager.getNearbyPeers().map(p => ({
        clawId: p.clawId,
        flags: p.flags,
        recentAgoraPosts: agoraManager.getPostsByPeer(p.clawId).map(post => post.content),
      }));
    });

    // Start Whisper session management
    whisperManager.start();
  }

  // Capture for shutdown
  shutdownAgora = () => agoraManager.stop();
  shutdownWhisper = () => whisperManager.stop();
});

// Clean shutdown
let shutdownAgora: (() => void) | null = null;
let shutdownWhisper: (() => void) | null = null;

app.on('before-quit', async () => {
  console.log('[Aura] Shutting down...');
  shutdownAgora?.();
  shutdownWhisper?.();
  encounterManager.stop();
  backend.disconnect();
  await bleEngine.stop();
});
