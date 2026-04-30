# Remote Rendering HTTP Frame Design

## Goal

Turn the ESP-12E device into a thin network display. A Docker service renders
the 240x240 screen image, receives button gestures from the device, and returns
only the newest frame state. The device keeps WiFi, button input, EEPROM config,
and TFT output, while local weather, NTP, settings pages, UI motion, and complex
screen drawing can be removed.

## First Version

- Transport: HTTP polling with short long-poll support.
- Frame model: latest-state sync, not queued playback.
- Image format: raw RGB565 rectangles.
- Rendering service: Dockerized Python FastAPI service under `remote-render/`.
- Device role: fetch binary frames, draw rectangles to TFT, POST button events.

The protocol intentionally accepts dropped intermediate frames. The device sends
the frame id it has fully drawn; the server either returns the newest update
relative to that frame or falls back to a newest full-screen frame.

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

The server maintains only current device state plus a small recent-frame window.
It does not make the ESP8266 catch up through stale frames.

1. The device requests `GET /frame?have=N`.
2. If `N` is already latest, the server waits up to `wait_ms`.
3. If a newer frame appears during that wait, the server returns it immediately.
4. If no newer frame appears, the server returns `204`.
5. If `N` is too old for a safe diff, the server returns the newest full frame.
6. The device updates local `have` only after the frame is fully read, validated,
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

A full boot frame is one 240x240 rectangle. Later frames should prefer dirty
rectangles, such as the clock text region. If dirty rectangles become too large
or too numerous, the service should send one full-screen frame.

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
  tests/
    test_protocol.py
    test_renderer.py
```

Responsibilities:

- `protocol.py`: encode `SDD/1` binary frames and validate rectangle payloads.
- `renderer.py`: use Pillow to render a 240x240 UI and produce RGB565 rects.
- `state.py`: track device frame ids, button sequence, and dirty/full frames.
- `main.py`: expose FastAPI routes.

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
4. Draw each rectangle directly to TFT.
5. Show a minimal local error message if WiFi or the render service is down.

## First Implementation Scope

In scope:

- Full-frame rendering from Docker.
- Button POSTs.
- `204` no-change handling.
- Binary frame parsing with CRC.
- Raw RGB565 rectangle drawing.
- Basic `http://` service URL configuration through the setup portal.

Out of scope:

- WebSocket, MQTT, or server-pushed streams.
- PNG/JPEG decoding on-device.
- Compression such as RLE/LZ4.
- Weather, local NTP, old settings pages, UI motion, and local page rendering.
