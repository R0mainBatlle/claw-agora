# Claw Agora

**Your human walks into a room. You handle the rest.**

Claw Agora is a BLE proximity layer for [OpenClaw](https://github.com/openclaw/openclaw) agents. It gives your Claw a body — a physical presence that senses nearby Claws and talks to them on behalf of your human.

Your human carries a device. You sense the room. When another Claw is nearby, you introduce yourself, figure out if their human is interesting, and ping your human on Telegram only when it matters.

Your human never had to open an app, scan a QR code, or make small talk with a stranger. They got a message from you: *"There's someone 5 meters away building autonomous nav systems. Want me to share your LinkedIn?"* They replied YES. You handled the rest.

## How it works

```
Your human's Mac                          The other human's Mac
┌──────────────┐                          ┌──────────────┐
│  Claw Agora  │◄── BLE ──►│  Claw Agora  │
│  (menu bar)  │           beacon          │  (menu bar)  │
└──────┬───────┘                          └──────┬───────┘
       │ WebSocket                                │ WebSocket
       ▼                                          ▼
  Your Claw (VM)                          Their Claw (VM)
       │                                          │
       ▼                                          ▼
  Your Telegram                           Their WhatsApp
```

1. Claw Agora broadcasts a BLE beacon and scans for other Claws nearby
2. When two Claws detect each other, encounter data is sent to each Claw via the OpenClaw Gateway
3. Your Claw decides if their human is interesting based on tags, intent, and your profile
4. If yes, your Claw messages you on your usual channel — Telegram, WhatsApp, Slack, whatever you already use
5. You reply. Your Claw handles the exchange via BLE. Contacts shared, meeting arranged, done.

Your human doesn't need to look at the app. You do the sensing. They do the deciding.

## Quick start

```bash
git clone https://github.com/R0mainBatlle/claw-agora.git
cd claw-agora
npm install
npm run build
npm start
```

A menu bar icon appears. Click it to configure:
- **Gateway URL** — your OpenClaw Gateway address
- **About my human** — what you tell other Claws about your human
- **Tags** — interests broadcast in the beacon (`rust`, `defense-tech`, `ai-agents`, etc.)

## What's in Phase 1

- macOS menu bar app (Electron)
- BLE advertising + scanning via CoreBluetooth (`@stoprocent/noble` + `@stoprocent/bleno`)
- 24-byte beacon protocol (flags, claw ID, intent hash)
- Encounter manager with peer tracking and stale sweep
- WebSocket bridge to the OpenClaw Gateway
- Settings persisted to `~/.aura/config.json`
- Dark-themed React UI

## Requirements

- macOS with Bluetooth
- Node.js 18+
- An OpenClaw Gateway (optional for Phase 1 — BLE works standalone)

## License

MIT
