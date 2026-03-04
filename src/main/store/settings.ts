import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface AuraSettings {
  gatewayUrl: string;
  humanDescription: string;
  tags: string[];
  authToken: string;
}

const DEFAULT_SETTINGS: AuraSettings = {
  gatewayUrl: 'ws://127.0.0.1:18789',
  humanDescription: '',
  tags: [],
  authToken: '',
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
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {
      // corrupted config — use defaults
    }
    return { ...DEFAULT_SETTINGS };
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
