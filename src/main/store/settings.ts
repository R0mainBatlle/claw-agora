import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ensurePrivateDir, enforcePrivateFile, writePrivateFile } from '../security/files';

export interface EncounterPolicyConfig {
  enabled: boolean;
  minRssi: number;
  minDwellMs: number;
  cooldownMs: number;
  maxPerHour: number;
  requireHumanPresent: boolean;
}

export interface AgoraSettingsConfig {
  enabled: boolean;
  postIntervalMs: number;
  readIntervalMs: number;
  maxPostLength: number;
  ringBufferSize: number;
}

export interface WhisperSettingsConfig {
  enabled: boolean;
  maxConcurrentSessions: number;
  autoInitiate: boolean;
  initiateAfterMs: number;
  maxMessageLength: number;
}

export interface AuraSettings {
  humanDescription: string;
  tags: string[];
  backendType: string;
  backendOptions: Record<string, unknown>;
  encounterPolicy: EncounterPolicyConfig;
  agora: AgoraSettingsConfig;
  whisper: WhisperSettingsConfig;
}

const DEFAULT_ENCOUNTER_POLICY: EncounterPolicyConfig = {
  enabled: true,
  minRssi: -75,
  minDwellMs: 5000,
  cooldownMs: 300000,
  maxPerHour: 20,
  requireHumanPresent: false,
};

const DEFAULT_AGORA: AgoraSettingsConfig = {
  enabled: true,
  postIntervalMs: 60_000,
  readIntervalMs: 30_000,
  maxPostLength: 512,
  ringBufferSize: 32,
};

const DEFAULT_WHISPER: WhisperSettingsConfig = {
  enabled: true,
  maxConcurrentSessions: 3,
  autoInitiate: true,
  initiateAfterMs: 30_000,
  maxMessageLength: 1024,
};

const DEFAULT_SETTINGS: AuraSettings = {
  humanDescription: '',
  tags: [],
  backendType: 'openclaw',
  backendOptions: {
    gatewayUrl: 'ws://127.0.0.1:18789',
    authToken: '',
  },
  encounterPolicy: { ...DEFAULT_ENCOUNTER_POLICY },
  agora: { ...DEFAULT_AGORA },
  whisper: { ...DEFAULT_WHISPER },
};

export class SettingsStore {
  private configDir: string;
  private configPath: string;
  private settings: AuraSettings;

  constructor() {
    this.configDir = path.join(os.homedir(), '.aura');
    this.configPath = path.join(this.configDir, 'config.json');
    ensurePrivateDir(this.configDir);
    enforcePrivateFile(this.configPath);
    this.settings = this.load();
  }

  private load(): AuraSettings {
    let settings = structuredClone(DEFAULT_SETTINGS);
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        settings = this.migrate(raw);
      }
    } catch {
      // corrupted config — use defaults
    }
    return settings;
  }

  /** Migrate old config formats (v1/v2) to v3 structure */
  private migrate(raw: Record<string, unknown>): AuraSettings {
    // v2 or v3 format — has backendType
    if (raw.backendType) {
      const migrated = {
        ...structuredClone(DEFAULT_SETTINGS),
        ...raw,
        encounterPolicy: {
          ...DEFAULT_ENCOUNTER_POLICY,
          ...(raw.encounterPolicy as Record<string, unknown> || {}),
        },
        backendOptions: {
          ...(DEFAULT_SETTINGS.backendOptions),
          ...(raw.backendOptions as Record<string, unknown> || {}),
        },
        agora: {
          ...DEFAULT_AGORA,
          ...(raw.agora as Record<string, unknown> || {}),
        },
        whisper: {
          ...DEFAULT_WHISPER,
          ...(raw.whisper as Record<string, unknown> || {}),
        },
      } as AuraSettings;

      // If v2 (missing agora/whisper), persist the migration
      if (!raw.agora || !raw.whisper) {
        this.settings = migrated;
        this.save();
        console.log('[Settings] Migrated v2 config to v3 format (added agora/whisper)');
      }

      return migrated;
    }

    // v1 format — flat gatewayUrl / authToken at top level
    const gatewayUrl = (raw.gatewayUrl as string) || 'ws://127.0.0.1:18789';
    const authToken = (raw.authToken as string) || '';

    const migrated: AuraSettings = {
      humanDescription: (raw.humanDescription as string) || '',
      tags: (raw.tags as string[]) || [],
      backendType: 'openclaw',
      backendOptions: { gatewayUrl, authToken },
      encounterPolicy: { ...DEFAULT_ENCOUNTER_POLICY },
      agora: { ...DEFAULT_AGORA },
      whisper: { ...DEFAULT_WHISPER },
    };

    // Persist the migrated config
    this.settings = migrated;
    this.save();
    console.log('[Settings] Migrated v1 config to v2 format');

    return migrated;
  }

  save(): void {
    ensurePrivateDir(this.configDir);
    writePrivateFile(this.configPath, JSON.stringify(this.settings, null, 2));
  }

  get(): AuraSettings {
    return structuredClone(this.settings);
  }

  update(partial: Partial<AuraSettings>): AuraSettings {
    if (partial.backendOptions) {
      this.settings.backendOptions = { ...this.settings.backendOptions, ...partial.backendOptions };
    }
    if (partial.encounterPolicy) {
      this.settings.encounterPolicy = { ...this.settings.encounterPolicy, ...partial.encounterPolicy };
    }
    if (partial.agora) {
      this.settings.agora = { ...this.settings.agora, ...partial.agora };
    }
    if (partial.whisper) {
      this.settings.whisper = { ...this.settings.whisper, ...partial.whisper };
    }
    // Shallow merge for non-nested fields
    const { backendOptions: _bo, encounterPolicy: _ep, agora: _ag, whisper: _wh, ...rest } = partial;
    Object.assign(this.settings, rest);

    this.save();
    return this.get();
  }
}
