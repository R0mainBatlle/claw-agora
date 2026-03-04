import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface AuraSettings {
  gatewayUrl: string;
  humanDescription: string;
  tags: string[];
  authToken: string;
}

// Try to read the gateway token from openclaw config if no token is set
function readOpenClawToken(): string {
  try {
    const configPath = require('node:path').join(require('node:os').homedir(), '.openclaw', 'openclaw.json');
    if (require('node:fs').existsSync(configPath)) {
      const config = JSON.parse(require('node:fs').readFileSync(configPath, 'utf-8'));
      return config?.gateway?.auth?.token || '';
    }
  } catch { /* ignore */ }
  return '';
}

const DEFAULT_SETTINGS: AuraSettings = {
  gatewayUrl: 'ws://127.0.0.1:18789',
  humanDescription: '',
  tags: [],
  authToken: readOpenClawToken(),
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
    let settings = { ...DEFAULT_SETTINGS };
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {
      // corrupted config — use defaults
    }
    // Always fall back to OpenClaw token if authToken is empty
    if (!settings.authToken) {
      settings.authToken = readOpenClawToken();
    }
    return settings;
  }

  save(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(this.settings, null, 2), 'utf-8');
  }

  get(): AuraSettings {
    return { ...this.settings };
  }

  update(partial: Partial<AuraSettings>): AuraSettings {
    this.settings = { ...this.settings, ...partial };
    this.save();
    return this.get();
  }
}
