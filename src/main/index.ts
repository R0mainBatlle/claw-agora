import path from 'node:path';
import fs from 'node:fs';
import { app, BrowserWindow, nativeImage } from 'electron';
import { menubar } from 'menubar';
import liquidGlass from 'electron-liquid-glass';
import { BLEEngine } from './ble/engine';
import { EncounterManager } from './encounter/manager';
import { EncounterPolicy } from './encounter/policy';
import { BackendRegistry } from './agent/registry';
import { OpenClawBackend } from './agent/openclaw-backend';
import { AgentBackend } from './agent/backend';
import { formatEncounterMessage } from './agent/message-formatter';
import { SettingsStore } from './store/settings';
import { registerIpcHandlers } from './ipc/handlers';
import { DiscoveredBeacon } from './ble/scanner';
import { EncounterEvent } from './encounter/types';
import { AgoraService } from './agora/service';
import { AgoraManager } from './agora/manager';
import { AgoraRingBuffer } from './agora/ring-buffer';
import { readRemoteAgora } from './agora/reader';
import { WhisperService } from './whisper/service';
import { WhisperManager } from './whisper/manager';
import type { PeerContext } from './agent/backend';

// Hide dock icon (menu bar app)
app.dock?.hide();

const settings = new SettingsStore();
const bleEngine = new BLEEngine();
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

  // Apply Liquid Glass to the window
  const win = mb.window;
  if (win) {
    const glassId = liquidGlass.addView(win.getNativeWindowHandle(), {
      cornerRadius: 12,
      opaque: true,
      tintColor: '#00000030',
    });
    console.log(`[Aura] Liquid Glass: id=${glassId}, supported=${liquidGlass.isGlassSupported()}`);
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

  // Start encounter manager
  encounterManager.start();

  // --- Agora setup ---
  const agoraRingBuffer = new AgoraRingBuffer();
  const agoraService = new AgoraService(agoraRingBuffer, bleEngine.localClawId, bleEngine.sessionKey);
  const agoraManager = new AgoraManager(backend, bleEngine.localClawId, bleEngine.sessionKey);

  // Register agora GATT service
  bleEngine.advertiser.addService(agoraService.service);

  // Handle remote posts submitted to our board
  agoraService.on('remote-post', (post) => {
    const clawIdHex = post.clawId instanceof Buffer ? post.clawId.toString('hex') : String(post.clawId);
    agoraManager.handleRemotePosts(clawIdHex, [post]);
  });

  // Wire agora reading into scan cycle — read remote boards while still connected
  bleEngine.scanner.addConnectionHook(async (peripheral) => {
    const result = await readRemoteAgora(peripheral);
    if (!result || result.posts.length === 0) return;
    const peerClawIdHex = result.meta.ownerClawId.toString('hex');
    await agoraManager.handleRemotePosts(peerClawIdHex, result.posts);
    console.log(`[Aura] Read ${result.posts.length} agora post(s) from ${peerClawIdHex.substring(0, 8)}`);
  });

  // --- Whisper setup ---
  const whisperService = new WhisperService();
  const whisperManager = new WhisperManager(backend, bleEngine.localClawId, whisperService);

  // Register whisper GATT service
  bleEngine.advertiser.addService(whisperService.service);

  // Give whisper manager access to agora posts for enriching incoming request context
  whisperManager.setContextProvider((clawId) =>
    agoraManager.getPostsByPeer(clawId).map(p => p.content),
  );

  whisperManager.on('session-established', (sessionId: string, peerClawId: string) => {
    console.log(`[Aura] Whisper session established: ${sessionId.substring(0, 8)} with ${peerClawId.substring(0, 8)}`);
  });
  whisperManager.on('session-closed', (sessionId: string, peerClawId: string, reason: string) => {
    console.log(`[Aura] Whisper session closed: ${sessionId.substring(0, 8)} — ${reason}`);
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
      distance: peer.rssi > -50 ? 'immediate' : peer.rssi > -70 ? 'near' : 'far',
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
  );

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
      distance: p.rssi > -50 ? 'immediate' : p.rssi > -70 ? 'near' : 'far',
      flags: p.flags,
      recentAgoraPosts: agoraManager.getPostsByPeer(p.clawId).map(post => post.content),
    }));
  });

  // Start Whisper session management
  whisperManager.start();

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
