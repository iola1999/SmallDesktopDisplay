# SmallDesktopDisplay

[简体中文](README.zh-CN.md)

SmallDesktopDisplay is a desktop mini-display project based on ESP-12E / ESP8266. The current mainline uses a remote-rendering architecture: the device firmware acts as a lightweight display client, handling WiFi, buttons, backlight, persistent configuration, and TFT output, while a Node.js service renders the actual 240x240 UI frames and maintains page state. A device attached to the Mac prefers serial transport and falls back to WiFi HTTP when serial is unavailable.

The default UI is now a remotely rendered Chinese desktop clock with a small settings flow for brightness, font selection, device diagnostics, and renderer status. Most UI logic lives on the server side, so new screens, animation, and features can be added without reflashing the device firmware every time.

## Architecture

- `src/`: ESP8266 firmware built with PlatformIO + Arduino.
- `src/main.cpp`: Device entry point for remote frame polling, button reporting, commands, and status sync.
- `src/remote/`: Client code for remote frames, input events, device status, and remote commands.
- `src/ui/`: Bridge layer that writes remote RGB565 rectangle frames to the TFT.
- `remote-render/`: Node.js + React/Yoga/Skia render service that generates frames, maintains remote UI state, and receives device input and status.
- `docs/`: Remote-rendering protocol notes, deployment details, and recent iteration records.
- `.agents/notes/`: Proposals, decisions, implementation records, and current iteration status.

## Quick Start

On Linux, start the remote render service with Docker:

```bash
cd remote-render
REMOTE_RENDER_PORT=18080 docker compose up -d --build
```

The Mac instance used by this repository is managed by launchd. After changing `remote-render/`, run:

```bash
cd remote-render && npm run build
launchctl kickstart -k gui/$UID/com.sdd.remote-render
```

Build the firmware:

```bash
pio run -e esp12e
```

The current Mac sends frames over serial. Stop the launchd service before uploading, then restore it afterward:

```bash
launchctl bootout gui/$UID/com.sdd.remote-render
pio run -e esp12e -t upload
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.sdd.remote-render.plist
```

The service must also release the port while a serial monitor is open. Restore it after leaving the monitor:

```bash
launchctl bootout gui/$UID/com.sdd.remote-render
pio device monitor -b 921600
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.sdd.remote-render.plist
```

Common checks:

```bash
cd remote-render && npm test
pio test -e host
pio run -e esp12e
```

## Configuration

Firmware defaults live in `src/AppConfig.h`. The remote render service address can also be changed from the device configuration portal.

After the device joins WiFi, open its assigned LAN IP address from the same network to reach the configuration portal. If the device has not joined WiFi yet, connect a phone or computer to the `SDD-Setup` access point created by the device, then finish WiFi and remote-render address setup from the portal.

TFT pin mapping comes from the `TFT_eSPI` library's own `User_Setup.h` and is not maintained in this repository.

## Documentation

- `.agents/notes/README.md`: Lifecycle and format for proposals and non-trivial change records.
- `.agents/notes/proposed/feature/2026-08-23-桌面内容页面与同步歌词.md`: Synced lyrics, status pages, and display content ideas.
- `.agents/notes/proposed/architecture/2026-08-23-Web控制台与配置模型.md`: Proposal for the Web console, home layouts, page lists, and configuration model.
- `docs/remote-rendering-http-frame-design.md`: Remote-rendering architecture, HTTP API, frame protocol, command/status sync, and deployment notes.
- `docs/recent-iterations.md`: Iteration history from before the change-record workflow was introduced.
- `docs/roadmap.md`: Future feature direction and iteration priorities.
- `remote-render/src/tools/frame-preview.ts`: Local frame preview tool that fetches remote frames and writes PNG output.
