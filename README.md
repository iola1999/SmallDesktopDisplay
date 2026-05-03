# SmallDesktopDisplay

[简体中文](README.zh-CN.md)

SmallDesktopDisplay is a desktop mini-display project based on ESP-12E / ESP8266. The current mainline uses a remote-rendering architecture: the device firmware acts as a lightweight network display client, handling WiFi, buttons, backlight, persistent configuration, and TFT output, while a Docker service renders the actual 240x240 UI frames and maintains page state.

The default UI is now a remotely rendered Chinese desktop clock with a basic settings page. Most UI logic lives on the server side, so new screens, animation, and features can be added without reflashing the device firmware every time.

## Architecture

- `src/`: ESP8266 firmware built with PlatformIO + Arduino.
- `src/main.cpp`: Device entry point for remote frame polling, button reporting, commands, and status sync.
- `src/remote/`: Client code for remote frames, input events, device status, and remote commands.
- `src/ui/`: Bridge layer that writes remote RGB565 rectangle frames to the TFT.
- `remote-render/`: Dockerized FastAPI + Pillow render service that generates frames, maintains remote UI state, and receives device input and status.
- `docs/`: Remote-rendering protocol notes, deployment details, and recent iteration records.

## Quick Start

Start the remote render service:

```bash
cd remote-render
REMOTE_RENDER_PORT=18080 docker compose up -d --build
```

Build the firmware:

```bash
pio run -e esp12e
```

Upload the firmware and open the serial monitor:

```bash
pio run -e esp12e -t upload
pio device monitor -b 115200
```

Common checks:

```bash
remote-render/.venv/bin/pytest -q
pio test -e host
pio run -e esp12e
```

## Configuration

Firmware defaults live in `src/AppConfig.h`. The remote render service address can also be changed from the device configuration portal.

After the device joins WiFi, open its assigned LAN IP address from the same network to reach the configuration portal. If the device has not joined WiFi yet, connect a phone or computer to the `SDD-Setup` access point created by the device, then finish WiFi and remote-render address setup from the portal.

TFT pin mapping comes from the `TFT_eSPI` library's own `User_Setup.h` and is not maintained in this repository.

## Documentation

- `docs/remote-rendering-http-frame-design.md`: Remote-rendering architecture, HTTP API, frame protocol, command/status sync, and deployment notes.
- `docs/recent-iterations.md`: Recent iteration records and current development notes.
- `docs/roadmap.md`: Future feature direction and iteration priorities.
- `remote-render/tools/frame_preview.py`: Local frame preview tool that fetches remote frames and writes PNG output.
