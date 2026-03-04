export const IPC_CHANNELS = {
  // Settings
  GET_SETTINGS: 'settings:get',
  UPDATE_SETTINGS: 'settings:update',

  // BLE status
  GET_BLE_STATUS: 'ble:status',
  GET_NEARBY_PEERS: 'ble:nearby-peers',

  // Backend
  GET_BACKEND_STATUS: 'backend:status',

  // Encounter policy
  GET_ENCOUNTER_POLICY: 'policy:get',
  UPDATE_ENCOUNTER_POLICY: 'policy:update',

  // Events (main -> renderer)
  NEARBY_PEERS_UPDATED: 'event:nearby-peers-updated',
  BLE_STATUS_CHANGED: 'event:ble-status-changed',
  BACKEND_STATUS_CHANGED: 'event:backend-status-changed',
} as const;
