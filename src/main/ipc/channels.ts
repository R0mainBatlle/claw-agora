export const IPC_CHANNELS = {
  // Settings
  GET_SETTINGS: 'settings:get',
  UPDATE_SETTINGS: 'settings:update',

  // BLE status
  GET_BLE_STATUS: 'ble:status',
  GET_NEARBY_PEERS: 'ble:nearby-peers',

  // Backend
  GET_BACKEND_STATUS: 'backend:status',

  // Agent query
  QUERY_AGENT: 'agent:query',

  // Encounter policy
  GET_ENCOUNTER_POLICY: 'policy:get',
  UPDATE_ENCOUNTER_POLICY: 'policy:update',

  // Agora
  GET_AGORA_POSTS: 'agora:get-posts',

  // Whisper
  GET_WHISPER_SESSIONS: 'whisper:get-sessions',
  GET_WHISPER_MESSAGES: 'whisper:get-messages',

  // Activity log
  GET_ACTIVITY_LOG: 'activity:get-recent',

  // App
  APP_QUIT: 'app:quit',

  // Events (main -> renderer)
  NEARBY_PEERS_UPDATED: 'event:nearby-peers-updated',
  BLE_STATUS_CHANGED: 'event:ble-status-changed',
  BACKEND_STATUS_CHANGED: 'event:backend-status-changed',
  AGORA_POST_RECEIVED: 'event:agora-post',
  WHISPER_SESSION_UPDATE: 'event:whisper-session-update',
  WHISPER_MESSAGE: 'event:whisper-message',
} as const;
