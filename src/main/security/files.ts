import fs from 'node:fs';

export const PRIVATE_DIR_MODE = 0o700;
export const PRIVATE_FILE_MODE = 0o600;

export function ensurePrivateDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: PRIVATE_DIR_MODE });
  }
  try {
    fs.chmodSync(dirPath, PRIVATE_DIR_MODE);
  } catch {
    // Best effort: chmod can fail on some filesystems.
  }
}

export function enforcePrivateFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  try {
    fs.chmodSync(filePath, PRIVATE_FILE_MODE);
  } catch {
    // Best effort: chmod can fail on some filesystems.
  }
}

export function writePrivateFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, { encoding: 'utf-8', mode: PRIVATE_FILE_MODE });
  enforcePrivateFile(filePath);
}
