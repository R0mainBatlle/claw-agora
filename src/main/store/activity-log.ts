import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

export interface ActivityEntry {
  type: 'encounter' | 'agora-post' | 'whisper-message' | 'whisper-session';
  timestamp: number;
  data: Record<string, unknown>;
}

export class ActivityLog {
  private filePath: string;

  constructor() {
    const dir = path.join(os.homedir(), '.aura');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, 'activity.jsonl');
  }

  append(entry: ActivityEntry): void {
    const line = JSON.stringify(entry) + '\n';
    fs.appendFile(this.filePath, line, (err) => {
      if (err) console.error('[ActivityLog] Write failed:', err.message);
    });
  }

  async prune(days = 30): Promise<void> {
    if (!fs.existsSync(this.filePath)) return;

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const kept: string[] = [];

    const stream = fs.createReadStream(this.filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as ActivityEntry;
        if (entry.timestamp >= cutoff) {
          kept.push(line);
        }
      } catch {
        // skip malformed lines
      }
    }

    fs.writeFileSync(this.filePath, kept.length > 0 ? kept.join('\n') + '\n' : '', 'utf-8');
    console.log(`[ActivityLog] Pruned to ${kept.length} entries (cutoff: ${days} days)`);
  }

  async getRecent(opts?: { type?: string; limit?: number }): Promise<ActivityEntry[]> {
    if (!fs.existsSync(this.filePath)) return [];

    const entries: ActivityEntry[] = [];
    const stream = fs.createReadStream(this.filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as ActivityEntry;
        if (!opts?.type || entry.type === opts.type) {
          entries.push(entry);
        }
      } catch {
        // skip malformed lines
      }
    }

    // Return newest first
    entries.reverse();
    if (opts?.limit && opts.limit > 0) {
      return entries.slice(0, opts.limit);
    }
    return entries;
  }
}
