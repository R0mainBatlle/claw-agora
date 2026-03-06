import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensurePrivateDir, enforcePrivateFile, writePrivateFile } from './files';

interface StoredIdentity {
  publicKeyDerBase64: string;
  privateKeyDerBase64: string;
}

export interface AuraIdentity {
  clawId: Buffer;
  publicKeyDer: Buffer;
  privateKey: crypto.KeyObject;
}

function exportPublicKeyDer(publicKey: crypto.KeyObject): Buffer {
  return Buffer.from(publicKey.export({ format: 'der', type: 'spki' }));
}

function exportPrivateKeyDer(privateKey: crypto.KeyObject): Buffer {
  return Buffer.from(privateKey.export({ format: 'der', type: 'pkcs8' }));
}

export function deriveClawId(publicKeyDer: Buffer): Buffer {
  return crypto.createHash('sha256').update(publicKeyDer).digest().subarray(0, 4);
}

export function importPublicKeyDer(publicKeyDer: Buffer): crypto.KeyObject {
  return crypto.createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' });
}

export function importPrivateKeyDer(privateKeyDer: Buffer): crypto.KeyObject {
  return crypto.createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' });
}

export function signPayload(payload: Buffer, privateKey: crypto.KeyObject): Buffer {
  return crypto.sign(null, payload, privateKey);
}

export function verifyPayload(payload: Buffer, signature: Buffer, publicKeyDer: Buffer): boolean {
  try {
    return crypto.verify(null, payload, importPublicKeyDer(publicKeyDer), signature);
  } catch {
    return false;
  }
}

export class IdentityStore {
  private readonly dirPath: string;
  private readonly filePath: string;
  private readonly identity: AuraIdentity;

  constructor() {
    this.dirPath = path.join(os.homedir(), '.aura');
    this.filePath = path.join(this.dirPath, 'identity.json');
    ensurePrivateDir(this.dirPath);
    enforcePrivateFile(this.filePath);
    this.identity = this.loadOrCreate();
  }

  get(): AuraIdentity {
    return {
      clawId: Buffer.from(this.identity.clawId),
      publicKeyDer: Buffer.from(this.identity.publicKeyDer),
      privateKey: this.identity.privateKey,
    };
  }

  private loadOrCreate(): AuraIdentity {
    const stored = this.loadStoredIdentity();
    if (stored) {
      const publicKeyDer = Buffer.from(stored.publicKeyDerBase64, 'base64');
      const privateKeyDer = Buffer.from(stored.privateKeyDerBase64, 'base64');
      return {
        clawId: deriveClawId(publicKeyDer),
        publicKeyDer,
        privateKey: importPrivateKeyDer(privateKeyDer),
      };
    }

    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicKeyDer = exportPublicKeyDer(publicKey);
    const privateKeyDer = exportPrivateKeyDer(privateKey);

    const payload: StoredIdentity = {
      publicKeyDerBase64: publicKeyDer.toString('base64'),
      privateKeyDerBase64: privateKeyDer.toString('base64'),
    };
    writePrivateFile(this.filePath, JSON.stringify(payload, null, 2));

    return {
      clawId: deriveClawId(publicKeyDer),
      publicKeyDer,
      privateKey,
    };
  }

  private loadStoredIdentity(): StoredIdentity | null {
    if (!fs.existsSync(this.filePath)) return null;

    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Partial<StoredIdentity>;
      if (!raw.publicKeyDerBase64 || !raw.privateKeyDerBase64) return null;
      return {
        publicKeyDerBase64: raw.publicKeyDerBase64,
        privateKeyDerBase64: raw.privateKeyDerBase64,
      };
    } catch {
      return null;
    }
  }
}
