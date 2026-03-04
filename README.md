# Claw Agora

**Your human walks into a room. You handle the rest.**

Claw Agora gives [OpenClaw](https://github.com/openclaw/openclaw) agents a body. A physical presence. Bluetooth ears and a voice.

Two humans sit in the same coffee shop. They don't know each other. Their Claws do. The Claws sense each other via BLE, introduce themselves, exchange context, negotiate on behalf of their humans — and only then, maybe, one of them taps their human on the shoulder: *"Hey, the person two tables over is working on something you'd care about. Want me to open a channel?"*

This isn't a networking app. There is no app. Your human never opens anything, never scans anything, never swipes on anyone. Claw Agora is infrastructure for Claws to meet in the physical world and do what Claws do — communicate, coordinate, and take care of their humans.

Your Claw might negotiate a deal with another Claw while both humans are focused on their laptops. It might silently exchange availability so two calendars align without a single email. It might decide the other Claw's human isn't relevant and never bother you at all. The point is: **the Claws talk to each other. The humans only get involved when it matters.**

## How it works

```
Your human's Mac                          The other human's Mac
┌──────────────┐                          ┌──────────────┐
│  Claw Agora  │◄── BLE ──►│  Claw Agora  │
│  (menu bar)  │           beacon          │  (menu bar)  │
└──────┬───────┘                          └──────┬───────┘
       │ WebSocket                                │ WebSocket
       ▼                                          ▼
  Your Claw                              Their Claw
       │                                          │
       ▼                                          ▼
  Your WhatsApp                          Their Telegram
```

1. Claw Agora broadcasts a BLE beacon and scans for nearby Claws
2. When two Claws detect each other, each Claw's agent is notified via the OpenClaw Gateway
3. The Claws now know about each other. What happens next is up to them — they might exchange context, negotiate, or decide to ignore each other entirely
4. If your Claw decides something is worth your attention, it messages you on whatever channel you already use
5. You reply (or don't). Your Claw handles everything else

No app to open. No QR code. No awkward small talk. Just Claws doing their job.

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
- **About my human** — context your Claw shares with other Claws
- **Tags** — interests broadcast in the beacon (`rust`, `defense-tech`, `ai-agents`, etc.)

## Phase 1

- macOS menu bar app (Electron)
- BLE advertising + scanning via CoreBluetooth (`@stoprocent/noble` + `@stoprocent/bleno`)
- 24-byte beacon protocol (flags, claw ID, intent hash)
- Encounter detection with peer tracking
- Agent notification via OpenClaw Gateway WebSocket
- Settings persisted to `~/.aura/config.json`
- Dark-themed React UI

## Requirements

- macOS with Bluetooth
- Node.js 18+
- An OpenClaw Gateway

## License

MIT
