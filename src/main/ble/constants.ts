// Aura BLE Service UUID (128-bit, fixed for the protocol)
export const AURA_SERVICE_UUID = 'a07a0001-b5a3-f393-e0a9-e50e24dcca9e';

// GATT Characteristic UUID for reading the beacon payload
export const AURA_BEACON_CHARACTERISTIC_UUID = 'a07a0002-b5a3-f393-e0a9-e50e24dcca9e';

// Protocol magic bytes (0xA0 0xBA — stands for "AURA")
export const MAGIC = Buffer.from([0xa0, 0xba]);

// Protocol version
export const VERSION = 0x01;

// Beacon payload size in bytes
export const BEACON_SIZE = 24;

// How often to re-scan (ms)
export const SCAN_INTERVAL_MS = 10_000;

// Scan duration per cycle (ms)
export const SCAN_DURATION_MS = 5_000;

// How long before a peer is considered gone (ms)
export const PEER_TIMEOUT_MS = 60_000;

// GATT connect + read timeout (ms)
export const GATT_READ_TIMEOUT_MS = 3_000;

// Don't re-read same peripheral within this window (ms)
export const READ_COOLDOWN_MS = 30_000;

// Strip dashes from UUID for bleno/noble (they expect 32 hex chars, no dashes)
export function stripUUID(uuid: string): string {
  return uuid.replace(/-/g, '');
}
