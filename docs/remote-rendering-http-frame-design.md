# Remote Rendering HTTP Frame Design

## Goal

Turn the ESP-12E device into a thin network display. A Docker service renders
the 240x240 screen image, receives button gestures from the device, and returns
only the newest frame state. The device keeps WiFi, button input, EEPROM config,
and TFT output, while local weather, NTP, settings pages, UI motion, and complex
screen drawing can be removed.

## Current Version

- Transport: HTTP polling with short long-poll support.
- Frame model: latest-state sync, not queued playback.
- Image format: raw RGB565 rectangles.
- Rendering service: Dockerized Python FastAPI service under `remote-render/`.
- Device role: fetch binary frames, draw rectangles to TFT, POST button events.

The protocol intentionally accepts dropped intermediate frames. The device sends
the frame id it has fully drawn; the server either returns the newest update
relative to that frame or falls back to a newest full-screen frame.

The current implementation renders the clock view on the server, stores both
the latest dirty update and a full-frame snapshot, and uses the full snapshot for
cold clients or resync. This avoids a device booting into a partial frame and
leaving old local debug text on untouched screen regions.

## HTTP API

```text
GET  /api/v1/devices/{device_id}/frame?have=<frame_id>&wait_ms=<milliseconds>
POST /api/v1/devices/{device_id}/input
GET  /api/v1/health
```

`GET /frame` responses:

- `200 application/octet-stream`: a binary `SDD/1` frame.
- `204 No Content`: no newer frame exists before `wait_ms` expires.
- `400`: malformed request.

`POST /input` body:

```json
{
  "seq": 42,
  "event": "short_press",
  "uptime_ms": 123456
}
```

Supported first-version events:

- `short_press`
- `double_press`
- `long_press`

## Latest Frame Semantics

The server maintains current device state plus two encoded frame forms:

- `frame`: latest update, usually a partial dirty rectangle.
- `full_frame`: latest full-screen snapshot for cold start and resync.

It does not make the ESP8266 catch up through stale frames.

1. The device requests `GET /frame?have=N`.
2. If `N == 0`, the server returns `full_frame`.
3. If `N` is greater than the server's current frame id, the server also returns
   `full_frame`; this usually means the Docker service restarted while the
   device kept its old `have` value.
4. If `N` is already latest, the server waits up to `wait_ms`.
5. If a newer frame appears during that wait, the server returns it immediately.
6. If no newer frame appears, the server returns `204`.
7. If a dirty update is unsafe or insufficient, the server returns a full frame.
8. The device updates local `have` only after the frame is fully read, validated,
   and drawn.

## Binary Frame Format

All integers are little-endian.

```text
FrameHeader
  magic          4 bytes   "SDD1"
  version        u8        1
  flags          u8        bit0=full_frame, bit1=reset_required
  header_len     u16       32
  frame_id       u32       monotonic frame id
  base_frame_id  u32       source frame id, or 0 for full frame
  width          u16       240
  height         u16       240
  rect_count     u16
  payload_len    u32       sum of rect payload bytes
  reserved       u16       0
  crc32          u32       CRC32 over rect headers and rect payloads

RectHeader repeated rect_count times, immediately followed by payload
  x              u16
  y              u16
  w              u16
  h              u16
  format         u8        1 = RGB565
  encoding       u8        0 = raw
  reserved       u16
  payload_len    u32       w * h * 2 for raw RGB565
  payload        bytes
```

A full boot/resync frame is one 240x240 rectangle. Later frames prefer dirty
rectangles, such as the clock text region `(0,42,240x100)` and the footer/input
region. If dirty rectangles become too large or too numerous, the service should
send one full-screen frame.

## Docker Service Structure

```text
remote-render/
  Dockerfile
  docker-compose.yml
  pyproject.toml
  app/
    main.py
    protocol.py
    renderer.py
    state.py
  tools/
    frame_preview.py
  tests/
    test_api.py
    test_frame_preview.py
    test_protocol.py
    test_renderer.py
```

Responsibilities:

- `protocol.py`: encode `SDD/1` binary frames and validate rectangle payloads.
- `renderer.py`: use Pillow to render a 240x240 UI and produce RGB565 rects.
- `state.py`: track device frame ids, button sequence, dirty frames, and full-frame
  resync snapshots.
- `main.py`: expose FastAPI routes.
- `tools/frame_preview.py`: local HTTP frame client that decodes `SDD1` frames and
  writes PNG previews for debugging without photographing the physical display.

Docker uses `python:3.12-slim` plus `fonts-dejavu-core`. The font package is
intentional: without a TrueType font, Pillow falls back to a tiny bitmap font and
the physical 240x240 display becomes hard to read.

Local development commands:

```bash
cd remote-render
python3 -m venv .venv
.venv/bin/pip install -e '.[test]'
.venv/bin/pytest
REMOTE_RENDER_PORT=18080 docker compose up -d --build
```

Preview a live service:

```bash
.venv/bin/python -m tools.frame_preview \
  --base-url http://127.0.0.1:18080 \
  --device-id desk-01 \
  --frames 2 \
  --output frame-previews/latest.png
```

`frame-previews/` is ignored and can be freely regenerated.

## Firmware Structure

```text
src/remote/
  FrameProtocol.h/.cpp
  HttpFrameClient.h/.cpp
  RemoteInputClient.h/.cpp

src/ui/
  TftFrameSink.h/.cpp
```

The firmware main loop becomes:

1. Connect WiFi using the existing setup portal path.
2. Poll button events and POST gestures to the Docker service.
3. Poll `/frame?have=...`.
4. Draw each rectangle directly to TFT, batching up to 4 RGB565 rows per
   `pushImage` call to reduce visible top-to-bottom scan artifacts.
5. Show a minimal local error message if WiFi or the render service is down.

The local status/error screen now also includes the device IP when connected, so
the setup page can be reached from another LAN device without opening serial
monitor.

## First Implementation Scope

In scope:

- Full-frame rendering from Docker.
- Per-second dirty rectangle refresh for the clock region.
- Full-frame resync for cold clients and Docker service restarts.
- Button POSTs.
- `204` no-change handling.
- Binary frame parsing with CRC.
- Raw RGB565 rectangle drawing.
- Basic `http://` service URL configuration through the setup portal.
- Local PNG preview tooling for HTTP frames.

Out of scope:

- WebSocket, MQTT, or server-pushed streams.
- PNG/JPEG decoding on-device.
- Compression such as RLE/LZ4.
- Weather, local NTP, old settings pages, UI motion, and local page rendering.
