# Remote Rendering HTTP Frame Design

## Goal

Turn the ESP-12E device into a thin network display. A Docker service renders
the 240x240 screen image, receives button gestures from the device, and returns
only the newest frame state. The device keeps WiFi, button input, EEPROM config,
local hold feedback, brightness PWM, HTTP polling, and TFT output, while local
weather, NTP, page routing, and complex screen drawing stay out of the firmware.

## Current Version

- Transport: two interchangeable links, auto-selected by the device at boot
  with no manual switch:
  - HTTP long-polling over WiFi (`wait_ms=80` parks the request across one
    20fps animation frame; the server wait loop wakes every 5ms).
  - A pushed serial link over the USB-serial cable (see "Serial Transport"),
    used automatically whenever the render host answers on the wire.
- Frame model: latest-state sync, not queued playback. Missed intermediate
  frames are healed with a catch-up partial diffed against the canvas the
  device last confirmed (full-frame resync only for cold clients or when the
  canvas history has been evicted).
- Image format: RGB565 rectangles, either raw or RLE-compressed.
- Rendering service: Dockerized Node.js/TypeScript service under `remote-render/`.
- Device role: fetch binary frames, draw rectangles to TFT, POST button events,
  POST status, and execute local hardware commands.

The protocol intentionally accepts dropped intermediate frames. The device sends
the frame id it has fully drawn; the server either returns the newest update
relative to that frame or falls back to a newest full-screen frame.

The current implementation renders the Chinese clock home page, Settings, and
detail pages on the server. It stores both the latest dirty update and a
full-frame snapshot, then uses the full snapshot for cold clients or resync.
This avoids a device booting into a partial frame and leaving old local debug
text on untouched screen regions.

## HTTP API

```text
GET  /api/v1/devices/{device_id}/frame?have=<frame_id>&wait_ms=<milliseconds>
POST /api/v1/devices/{device_id}/input
POST /api/v1/devices/{device_id}/status
GET  /api/v1/devices/{device_id}/commands?after=<command_id>
GET  /api/v1/health
```

`GET /frame` responses:

- `200 application/octet-stream`: a binary `SDD1` frame.
- `204 No Content`: no newer frame exists before `wait_ms` expires.
- `400`: malformed request.

Both `200` and `204` carry `X-SDD-Cmd: <latest command id>` (`0` = none).
The firmware compares it with its local command watermark and only issues
`GET /commands` when the server actually holds a newer command. This replaced
the old fixed 100ms blind command poll, which opened a fresh TCP connection
ten times per second and injected 10-30ms stalls into the 20fps animation
cadence. If the id moves backwards (service restart), the device adopts the
smaller watermark and converges on the next real command.

`POST /input` body:

```json
{
  "seq": 42,
  "event": "short_press",
  "uptime_ms": 123456
}
```

Supported gesture events:

- `short_press`
- `double_press`
- `long_press`

Current remote UI gesture mapping:

- Home: `short_press` is a no-op. The home screen is the only content page;
  there is nothing to switch to, and an accidental tap must not move the clock.
- Home: `long_press` enters Settings.
- Home: `double_press` keeps the page unchanged but forces the next frame to be
  a full-screen refresh. This is a manual resync path for display corruption or
  missed partial updates.
- Settings: `short_press` moves the selected item.
- Settings: `long_press` enters the selected detail page.
- Brightness detail: `short_press` applies the next brightness immediately and
  queues a `set_brightness` command for the device.
- Font detail: `short_press` applies the next renderer font immediately.
- Settings/Detail: `double_press` goes back one level.

The firmware only recognizes gestures and posts them; all page routing lives in
the Docker service.

## Web console

`GET /` (or `/console`) serves a LAN-only, no-auth control page: a live PNG
preview (`GET /api/v1/devices/{id}/preview.png`, ~1 fps polling), theme / font /
brightness controls (`POST /api/v1/devices/{id}/prefs`), simulated gestures
(`POST /api/v1/devices/{id}/console-input` — deliberately bypasses the seq
dedup so console taps can never poison the device's replay window), a device
list (`GET /api/v1/devices`) and weather/server status (`GET /api/v1/status`).
Theme and font choices persist to `STATE_DIR/device-prefs.json` (a compose
volume), so container rebuilds no longer reset them; brightness stays owned by
the device EEPROM via the command channel.

Current Settings items:

- `Brightness`: local backlight PWM, changed through the command channel.
- `Font`: server-side renderer font selection. It changes future frame pixels
  only; no firmware command is needed.
- `Device`: read-only client diagnostics reported by the ESP8266, including
  heap free bytes, max free heap block, heap fragmentation, WiFi RSSI, and
  uptime.
- `Renderer`: read-only transport/protocol summary for the remote frame link.
- `About`: device id and remote display protocol summary.
- `Theme`: server-side clock palette selection (Midnight / Sakura / Amber /
  Mono), applied to the home clock, date, lunar line, and card background.
  `short_press` cycles and applies immediately, like `Font`.

Settings holds only configuration and read-only diagnostics. Glanceable content
(clock, weather) lives on the Home screen, not behind the Settings menu.

The Home page is a calm single-screen clock + weather dashboard, organized on a
centered axis: a top row with the Gregorian date + short weekday (left) and the
lunar/solar-term/festival subtitle (right), a large 60px `HH:MM` with compact
seconds, then a one-line weather summary instead of any hourly detail: the
condition icon + label (left), the colour-coded current temperature (center),
and today's high/low (right) at near-equal sizes on a shared baseline — no
高/低 captions, the warm/blue colour split carries that meaning. A bottom row
shows 明天 and 后天 as two generous columns (label + icon over high/low). Nothing beyond 后天 is shown. Highs are colour-coded
cool→warm; lows use one muted blue-gray. Weather is fetched server-side from
Open-Meteo for Hangzhou Xiaoshan and cached; failures are silent and never block
the clock, and the weather elements simply do not render until the first
forecast arrives.

Behind the content, a digital-rain backdrop (the one survivor of the removed
ambient-game carousel) drips at one step per second. It is pure `(seed, tick)`
derivation with the tick taken from the wall clock, needs no per-device state,
and is dimmed toward the theme background (mixing the theme's seconds colour at
15-30%) so it never competes with the clock or weather. The rain tick is phase
shifted by +500ms (`RAIN_STEP_OFFSET_MS`): it advances at x.5s, after the
0-450ms clock-flip window has finished, and the scheduler emits one dedicated
mid-second frame to carry the ~11-rect rain diff. Before this, the rain step
landed on the first flip frame of every second and its ~4KB payload regularly
made the seconds flip drop a beat. Device id, tap count,
sync status, RSSI, and other development-only labels are intentionally kept out
of the first screen; detailed diagnostics live under Settings -> Device.
Hour, minute, and second digits use a server-side flip-style transition for the
first 450ms after each second boundary. The registry passes explicit scheduler
progress into the renderer, so the transition is not tied to wall-clock
millisecond timing. Each changing digit is drawn inside a clipped slot: the old
glyph eases out (ease-in-out cubic, quadratic fade) while the new glyph rises in
and settles with a slight ease-out-back overshoot. Flip frames diff all three
home regions so the rain backdrop advances atomically with the clock. After the
animation window expires, the registry emits one extra `progress=1` cleanup
frame. That final partial clears any translucent outgoing glyph pixels before
the second is considered settled.

Brightness uses a separate command channel because it is a local hardware side
effect, not pixels. The current command response is JSON:

```json
{
  "id": 12,
  "type": "set_brightness",
  "value": 70,
  "persist": true
}
```

`GET /commands` returns `204` when there is no command newer than `after`.
The service emits `set_brightness` immediately when the Brightness detail value
changes. The device applies it locally through PWM, stores the value in EEPROM
when `persist=true`, then advances its local `after` id so the command is not
applied repeatedly.

The device also POSTs local status after startup, after applying brightness, and
periodically while connected:

```json
{
  "brightness": 70,
  "uptime_ms": 123456,
  "heap_free": 34560,
  "heap_max_block": 32000,
  "heap_fragmentation": 8,
  "wifi_rssi": -48
}
```

This status payload lets the remote renderer update its per-device brightness
state from the device's persisted EEPROM value. If the Docker service restarts,
the device's next status sync makes the Settings UI converge back to the actual
hardware brightness. The heap and RSSI fields are sampled on the ESP8266
client with `ESP.getFreeHeap()`, `ESP.getMaxFreeBlockSize()`,
`ESP.getHeapFragmentation()`, and `WiFi.RSSI()`; they are not Docker-side
resource metrics. The API still accepts older status payloads that only contain
`brightness` and `uptime_ms`, but new firmware sends the full diagnostic set.

Input de-duplication uses both `seq` and `uptime_ms`. A higher `seq` is accepted
normally. If `seq` moves backwards while `uptime_ms` also moves backwards, the
service treats it as a device reboot or reflashing cycle and accepts the input
as the start of a new sequence. Lower `seq` values with forward-moving uptime are
treated as stale duplicates.

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
6. If the latest update is a partial frame whose `base_frame_id` does not match
   `N`, the server first tries a catch-up partial: it keeps the last 8 rendered
   canvases per device and, when the canvas for `N` is still available, encodes
   the dirty diff between that canvas and the current one (base = `N`). This
   turns what used to be a 15KB/~150ms full-frame resync into a 1-2KB partial.
   Only when the history has been evicted does it fall back to `full_frame`.
7. If no newer frame appears, the server returns `204`.
8. If a dirty update is unsafe or insufficient, the server returns a full frame.
9. The device updates local `have` only after the frame is fully read, validated,
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
  encoding       u8        0 = raw, 1 = RGB565 RLE
  reserved       u16
  payload_len    u32       encoded payload bytes
  payload        bytes
```

A full boot/resync frame is one 240x240 rectangle. Later frames prefer dirty
rectangles. Small changes stay tightly bounded, while large page changes are
split into interleaved tile strips, currently `240x8` for a full-width dirty
row. The interleaved order avoids a single large rectangle visibly scanning from
top to bottom on the physical TFT.

Raw RGB565 payloads are little-endian pixels. RGB565 RLE payloads are repeated
triples:

```text
run_len        u8        1..255 pixels
pixel          u16le     RGB565 pixel value
```

The renderer chooses RLE per rectangle only when the encoded payload is smaller
than raw RGB565. The firmware validates that RLE payload length is divisible by
3, decodes exactly `width * height` pixels, and draws through the same 2-row
buffer used for raw frames. CRC is calculated over the encoded rect headers and
encoded payload bytes, not over the decoded pixels.

## Frame Timing Diagnostics

The firmware logs detailed timing for full frames, large frames, and frames with
many rectangles:

```text
[RemoteFrame] frame=77 full rects=1 payload=15102 begin_ms=0 get_ms=37 header_ms=0 srv_wait_ms=0 srv_render_ms=20 srv_total_ms=21 client_overhead_ms=16 read_ms=7 stream_reads=80 stream_bytes=15118 tft_ms=40 tft_calls=120 other_ms=63 total_ms=147
```

Field meaning:

- `begin_ms`: local `HTTPClient.begin()` setup. This does not open the TCP
  connection.
- `get_ms`: `HTTPClient.GET()`, which includes TCP connect, HTTP request send,
  response status/header parsing, and any server long-poll wait.
- `header_ms`: time to read the 32-byte `SDD1` frame header after status 200.
- `srv_wait_ms`: server-side long-poll wait time before a newer frame became
  available.
- `srv_render_ms`: server-side render time for frames generated inside this
  request.
- `srv_total_ms`: total server route time for the frame request.
- `client_overhead_ms`: estimated client-side HTTP overhead. It subtracts
  `srv_total_ms` from `get_ms` when the header is available, and falls back to
  subtracting `srv_wait_ms + srv_render_ms` otherwise.
- `read_ms`: time to read rectangle headers and encoded RGB565 body bytes from
  the `WiFiClient` stream.
- `stream_reads` / `stream_bytes`: exact stream-read operations and their target
  byte count, including rectangle headers but excluding the 32-byte frame header.
- `tft_ms` / `tft_calls`: time and call count for TFT `pushImage` operations.
- `other_ms`: remaining local parsing, CRC, loop overhead, and scheduler time.

Hardware samples before compression showed the full-frame bottleneck was
response-body transfer, not connection setup or TFT writes. A 115200-byte raw
full frame spent about `1s` in `read_ms`, about `46ms` in `tft_ms`, and only
`11ms` in `get_ms`.

With RGB565 RLE enabled and the stack-safe 2-row draw buffer, the
home/settings full-frame class is roughly `14.5-15.6KB` on the wire. Stable
network device samples show `read_ms=6-14`, `tft_ms=38-56`, and
`total_ms=136-148`. Small clock dirty frames are now usually around
`0.8-2.0KB`, with `read_ms` usually `0-3ms`.

The frame endpoint includes these diagnostic headers on both `200` and `204`
responses:

- `X-SDD-Server-Wait-Ms`
- `X-SDD-Server-Render-Ms`
- `X-SDD-Server-Total-Ms`

The firmware now uses HTTP Keep-Alive for the frame polling path. `HttpFrameClient`
owns a long-lived `WiFiClient` and `HTTPClient`, sets `Connection: keep-alive`,
and calls `HTTPClient.end()` only after the body has been fully consumed so the
ESP8266 HTTP client can preserve the TCP socket. The reusable socket is reset on
request failure, invalid frame headers/bodies, stale partial frames, and remote
base URL changes.

The Node service must send binary frame responses with `Content-Length`.
`Transfer-Encoding: chunked` is intentionally avoided because the firmware reads
the response stream as the raw `SDD1` frame body; chunk-size prefixes would
appear before the magic bytes and make the frame header invalid.

Before Keep-Alive, normal small dirty frames usually showed
`client_overhead_ms` around `12-18ms`, and one forced full-frame resync showed a
`94ms` overhead spike. Keep-Alive changed static RAM from `37756B` to `37924B`
in the ESP8266 release build. First device samples after flashing show
`client_overhead_ms` usually around `9-12ms` on page transitions and small dirty
frames. That is a modest but real win, and much lower risk than jumping directly
to WebSocket or raw TCP.

The 2026-07 transport tuning pass addressed the remaining cadence problems:

- `kRemoteFrameWaitMs` went from 10 to 80ms. With a 10ms wait, the drain-mode
  re-poll usually landed before the next 50ms animation frame was due, burned a
  204, and then waited out the 50ms poll throttle — the 20fps flip actually ran
  at ~12-16fps with 50-90ms jitter. An 80ms park rides across exactly one frame
  interval, so animation frames return on the render beat, one HTTP transaction
  each. The server-side wait loop quantum dropped from 25ms to 5ms for the same
  reason.
- `WIFI_NONE_SLEEP` and default `WiFiClient` no-delay kill the DTIM modem-sleep
  latency spikes and Nagle/delayed-ACK interactions.
- Command polling is piggybacked on `X-SDD-Cmd` (see the API section).
- Status POSTs no longer force a render unless the Device/Brightness page is
  actually showing the reported values; the console preview no longer advances
  the frame chain of an actively polling device. Both used to insert frames
  mid-flip and trigger full-frame resyncs.
- Decode/draw row batching is sized by the 960B buffer instead of a fixed 2
  rows (`computeBatchRows`): narrow rain-column rects now push up to 80 rows
  per `pushImage` instead of 2, cutting dozens of tiny TFT calls per rain frame.
- Raw TCP or WebSocket push over WiFi was evaluated and deliberately skipped:
  with parked long-polls, piggybacked commands, and catch-up partials the
  remaining HTTP overhead is ~300B of headers per frame, and the serial link
  below is the push transport for the cable-reach case.

## Serial Transport

When the display sits within USB reach of the Docker host, the same `SDD1`
frames can travel over the USB-serial cable instead of WiFi. Serial is a push
transport: zero HTTP headers, zero request round-trips, no 2.4G contention or
modem-sleep jitter, and one cable carries both power and data. At the default
921600 baud (~92KB/s effective) the quiet-clock workload (<20KB/s average,
worst single frame ~4KB) fits comfortably; a 15KB full-frame resync takes
~165ms, on par with WiFi today. The baud lives in `AppConfig.h`
(`kSerialBaud`) and `SERIAL_BAUD` on the service; both sides must match.

### Link selection (no manual switch)

The device picks the transport automatically:

1. Boot: the firmware sends a `DEVICE_HELLO` envelope and listens ~1.5s
   (`kSerialDetectWindowMs`). Any valid downlink envelope (the host's probe
   `HELLO`, or the first frame the host pushes in response) selects serial
   mode; WiFi stays completely off (`WIFI_OFF`). On timeout the firmware
   falls back to the existing WiFi path.
2. WiFi mode keeps passively scanning UART RX. When the render host appears
   (it probes `HELLO` every 2s while no device is linked), the firmware
   switches to serial on the fly. In passive mode frame/command envelopes are
   drained but never drawn, so two transports can never paint the panel at
   the same time.
3. Serial mode watches downlink liveness: the home screen renders at least
   one frame per second, so 10s of silence (`kSerialLinkIdleMs`) means the
   link is gone. The firmware re-probes with `HELLO` a few times, then falls
   back to WiFi when credentials exist, or keeps waiting on serial (with a
   status screen) when they do not. Every link (re)establishment starts from
   `have=0`, so recovery is always a clean full frame.

### Wire format

Each message is an envelope; between envelopes the line may carry raw firmware
log text, which the host forwards to its own log (the serial-monitor
experience survives):

```text
magic0   u8     0xA5
magic1   u8     0x5A
type     u8
length   u32le  payload bytes
crc32    u32le  CRC32 of payload (zlib polynomial, same as SDD1)
payload  length bytes
```

Downlink types: `0x01 FRAME` (payload = verbatim `SDD1` frame, envelope length
must equal the frame's self-described size), `0x02 COMMAND` (same JSON as
`GET /commands`), `0x03 HELLO` (`{"proto":1}`). Uplink types: `0x81
DEVICE_HELLO` (`{"device_id","proto"}`), `0x82 INPUT` and `0x83 STATUS` (same
JSON bodies as the HTTP POSTs), `0x84 FRAME_ACK` (`{"frame_id"}`), `0x85
COMMAND_ACK` (`{"id"}`).

The host side reuses `DeviceRegistry` unchanged: a pump loop calls
`getFrameWithStats(deviceId, have, 1000)` exactly like an HTTP client, writes
the frame, and waits for `FRAME_ACK` before advancing `have` (stop-and-wait,
so at most one frame is in flight and the device's 4KB RX buffer bounds
everything). A failed/corrupt frame is acked with the old `have`, which the
registry heals with a catch-up partial. Commands are pushed the moment the
queue changes — no polling anywhere on the serial path.

### Operations

- Enable by uncommenting the `devices:` mapping in
  `remote-render/docker-compose.yml` and starting with
  `SERIAL_PORT=/dev/ttyUSB0 docker compose up -d`. `SERIAL_PORT` empty keeps
  the transport off; the HTTP API always runs.
- The service reopens the port every 5s after USB unplug/errors.
- Flashing firmware uses the same USB port: stop the container (or unplug)
  before `pio run -t upload`, or esptool will fight the render service for
  the port.
- Logging and the protocol share UART0 at 921600; use
  `pio device monitor -b 921600` for bare development. Firmware log lines
  show up in the container log prefixed with `[device]` when the serial link
  is active.

## Docker Service Structure

```text
remote-render/
  Dockerfile
  docker-compose.yml
  package.json
  package-lock.json
  tsconfig.json
  src/
    main.ts
    protocol.ts
    server.ts
    state.ts
    ui-state.ts
    renderer/
      components/
        frame-background.tsx
        primitives.tsx
      constants.ts
      hooks/
        useDeviceViewModel.ts
      host/
        jsx.d.ts
        reconciler.ts
      index.ts
      models/
        view-model.ts
      pages/
        home.tsx
        settings.tsx
        detail.tsx
      rendering/
        animation.ts
        canvas-frame.ts
        device-canvas.tsx
        dirty-rects.ts
        rasterizer.ts
      services/
        color.ts
        font-registry.ts
        home-copy.ts
        view-model.ts
      types.ts
      view.tsx
    tools/
      frame-preview.ts
    *.test.ts
```

Responsibilities:

- `protocol.ts`: encode `SDD1` binary frames and validate rectangle payloads.
- `renderer/index.ts`: public renderer facade. It wires canvas rendering to
  RGB565 frame packaging and deliberately stays free of Yoga, Canvas, and React
  reconciler details.
- `renderer/host/*`: custom React host config and JSX intrinsic element types.
- `renderer/rendering/*`: rendering pipeline internals, including React tree
  rasterization through Yoga/Skia, page transition compositing, dirty-rectangle
  detection, and RGB565 frame packaging.
- `renderer/services/*`: pure renderer services for home copy, clock flip glyph
  modeling, font registry, color math, and UI-state-to-view-model mapping.
- `renderer/hooks/*`: React hooks that bridge renderer services into TSX
  components. `useDeviceViewModel` is the only page-level state derivation hook.
- `renderer/models/*`: page view-model contracts consumed by TSX pages.
- `renderer/components/*`: shared TSX primitives and reusable visual fragments.
- `renderer/pages/*.tsx`: TSX page components for Home, Settings, and Detail.
  Pages consume view models and shared components; they do not import
  `ui-state.ts` directly.
- `renderer/view.tsx`: top-level TSX view selection over the derived view model.
- `state.ts`: track device frame ids, button sequence, dirty frames, and full-frame
  resync snapshots. It also schedules animation frames after navigation input.
- `ui-state.ts`: pure state machine for pages, selection, detail routing, and
  animation progress. Brightness and font details apply changes immediately on
  `short_press`.
- `server.ts`: expose the Node HTTP routes.
- `tools/frame-preview.ts`: local HTTP frame client that decodes `SDD1` frames and
  writes PNG previews for debugging without photographing the physical display.

Docker uses `node:22-bookworm-slim` plus DejaVu, Noto CJK, LXGW WenKai Screen,
and Maple Mono NF CN fonts. The font packages are intentional: without CJK
fonts the Chinese clock text does not render correctly in the container.

Local development commands:

```bash
cd remote-render
npm install
npm test
npm run build
REMOTE_RENDER_PORT=18080 docker compose up -d --build
```

Preview a live service:

```bash
npm run preview -- \
  --base-url http://127.0.0.1:18080 \
  --device-id preview-01 \
  --frames 2 \
  --output frame-previews/latest.png
```

Preview Settings navigation:

```bash
npm run preview -- \
  --base-url http://127.0.0.1:18080 \
  --device-id preview-01 \
  --input-event long_press \
  --input-seq 1 \
  --frames 8 \
  --wait-ms 60 \
  --output frame-previews/settings.png
```

Preview the richer Settings entry animation:

```bash
npm run preview -- \
  --base-url http://127.0.0.1:18080 \
  --device-id preview-animation-01 \
  --input-event long_press \
  --input-seq 1 \
  --frames 8 \
  --wait-ms 60 \
  --output frame-previews/animation-settings.png
```

`frame-previews/` is ignored and can be freely regenerated.

Use a preview-only device id such as `preview-01` when debugging from a laptop.
Sharing `desk-01` with the physical display makes the preview client and device
advance the same server-side frame state, which can force extra full-frame
resyncs and make animation measurements misleading.

## Firmware Structure

```text
src/remote/
  DeviceCommand.h
  DeviceStatusPayload.h
  FrameProtocol.h
  HttpFrameClient.h/.cpp
  RemoteCommandClient.h/.cpp
  RemoteInputClient.h/.cpp
  RemoteStatusClient.h/.cpp

src/app/
  DeviceStatusText.h/.cpp
  FrameDiagnostics.h/.cpp
  HoldInteraction.h/.cpp
  HoldProgress.h/.cpp
  RemoteKeepAlivePolicy.h/.cpp
  WifiPortalPage.h/.cpp

src/ui/
  TftFrameSink.h/.cpp
```

The firmware main loop dispatches on the auto-detected link mode.

WiFi mode:

1. Connect WiFi using the existing setup portal path.
2. Poll button events and POST gestures to the Docker service.
3. Fetch `/commands?after=...` only when a frame response's `X-SDD-Cmd` header
   shows a newer command id, and execute local commands such as brightness PWM.
4. POST local status periodically and after relevant state changes.
5. Long-poll `/frame?have=...&wait_ms=80`.
6. Keep watching UART RX for a render-host `HELLO` to switch to serial mode.

Serial mode replaces 2-5 with envelope handling on UART0: frames are drawn as
they arrive and acked, commands arrive pushed and are acked after applying,
input/status go up the same wire.

Common to both modes:

- Draw each rectangle directly to TFT through the shared
  `FrameStreamConsumer`, batching `computeBatchRows(width)` RGB565 rows per
  `pushImage` call into a 960B buffer (2 rows at full width, up to 80 rows for
  narrow rain-column rects). The buffer lives in BSS, not on the ~4KB loop
  stack.
- Draw only the hold-progress overlay locally while the button is pressed.
- Show a minimal local error message if the active link or the render service
  is down.

The local status/error screen now also includes the device IP when connected, so
the setup page can be reached from another LAN device without opening serial
monitor.

Hold progress is intentionally local. The remote renderer does not draw any
progress-bar-like navigation accent. The device uses press lifecycle events to
draw a 5px progress bar only after the press has lasted roughly 300ms. Reaching
the long-press threshold only arms the gesture; the firmware POSTs `long_press`
when the button is released. This keeps tactile feedback independent from HTTP
latency while preserving remote ownership of page state and avoids entering a
new page before the user lifts their finger.

## Current Implementation Scope

In scope:

- Full-frame rendering from Docker.
- Per-second dirty rectangle refresh for the clock region, plus a short
  server-side digit flip animation for hour, minute, and second changes.
- Home-page `double_press` full-frame refresh for manual resync.
- Server-side settings/detail navigation state.
- Server-side brightness detail UI and a JSON command channel for local
  hardware side effects. Brightness changes apply immediately on `short_press`.
- Server-side font selection for renderer text output.
- Server-side animation capped at 20 FPS by the registry scheduler. Page
  entry/back transitions slide and fade the destination page, Settings selection
  changes pulse the selected row, and Brightness changes animate the value,
  bar, and knob.
- Local device-side hold-progress overlay.
- Interleaved tile-strip dirty frames for large page changes.
- Server/device frame diagnostics for large updates, including server wait,
  server render, server total, and estimated client HTTP overhead.
- Full-frame resync for cold clients, Docker service restarts, and stale partial
  bases.
- Button POSTs.
- Device command polling for `set_brightness`.
- Device status sync for local persisted brightness.
- `204` no-change handling.
- Binary frame parsing with CRC.
- Raw and RLE-compressed RGB565 rectangle drawing.
- Basic `http://` service URL configuration through the setup portal.
- Local PNG preview tooling for HTTP frames.

Out of scope:

- WebSocket, MQTT, or server-pushed streams.
- PNG/JPEG decoding on-device.
- Heavier compression such as LZ4 or image codecs.
- Weather and local NTP in firmware.
- Local firmware-owned settings pages, local page routing, and local page
  rendering.
