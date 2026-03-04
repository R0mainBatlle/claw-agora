import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface EncounterPolicyConfig {
  enabled: boolean;
  minRssi: number;
  minDwellMs: number;
  cooldownMs: number;
  maxPerHour: number;
  requireHumanPresent: boolean;
}

export interface AuraSettings {
  humanDescription: string;
  tags: string[];
  backendType: string;
  backendOptions: Record<string, unknown>;
  encounterPolicy: EncounterPolicyConfig;
}

const DEFAULT_ENCOUNTER_POLICY: EncounterPolicyConfig = {
  enabled: true,
  minRssi: -75,
  minDwellMs: 5000,
  cooldownMs: 300000,
  maxPerHour: 20,
  requireHumanPresent: false,
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
};

export class SettingsStore {
  private configDir: string;
  private configPath: string;
  private settings: AuraSettings;

  constructor() {
    this.configDir = path.join(os.homedir(), '.aura');
    this.configPath = path.join(this.configDir, 'config.json');
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

  /** Migrate old v1 flat config to v2 structure */
  private migrate(raw: Record<string, unknown>): AuraSettings {
    // Already v2 format — has backendType
    if (raw.backendType) {
      return {
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
      } as AuraSettings;
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
    };

    // Persist the migrated config
    this.settings = migrated;
    this.save();
    console.log('[Settings] Migrated v1 config to v2 format');

    return migrated;
  }

  save(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(this.settings, null, 2), 'utf-8');
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
    // Shallow merge for non-nested fields
    const { backendOptions: _bo, encounterPolicy: _ep, ...rest } = partial;
    Object.assign(this.settings, rest);

    this.save();
    return this.get();
  }
}
