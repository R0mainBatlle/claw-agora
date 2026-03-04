export const IPC_CHANNELS = {
  // Settings
  GET_SETTINGS: 'settings:get',
  UPDATE_SETTINGS: 'settings:update',

  // BLE status
  GET_BLE_STATUS: 'ble:status',
  GET_NEARBY_PEERS: 'ble:nearby-peers',

  // Gateway status
  GET_GATEWAY_STATUS: 'gateway:status',

  // Events (main -> renderer)
  NEARBY_PEERS_UPDATED: 'event:nearby-peers-updated',
  BLE_STATUS_CHANGED: 'event:ble-status-changed',
  GATEWAY_STATUS_CHANGED: 'event:gateway-status-changed',
} as const;
