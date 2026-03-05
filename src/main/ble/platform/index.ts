import type { IAdvertiser, IScanner } from './types';

export type { IAdvertiser, IScanner, ConnectionHook, DiscoveredBeacon } from './types';

export function createAdvertiser(): IAdvertiser {
  if (process.platform === 'linux') {
    const { LinuxAdvertiser } = require('./linux-advertiser');
    return new LinuxAdvertiser();
  }
  const { DarwinAdvertiser } = require('./darwin-advertiser');
  return new DarwinAdvertiser();
}

export function createScanner(): IScanner {
  if (process.platform === 'linux') {
    const { LinuxScanner } = require('./linux-scanner');
    return new LinuxScanner();
  }
  const { DarwinScanner } = require('./darwin-scanner');
  return new DarwinScanner();
}
