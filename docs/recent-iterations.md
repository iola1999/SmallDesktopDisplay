# Recent Iterations

This file records the current remote-rendering line of work. It intentionally
omits old pre-remote firmware plans for local weather, NTP, AppCore-driven
settings pages, and local UI motion because those modules were removed when the
project moved to the thin-client architecture.

## Current Baseline

- The `esp12e` firmware is a lightweight ESP8266 network-display client.
- The device owns WiFi setup, button gesture detection, local hold-progress
  feedback, EEPROM-backed configuration, brightness PWM, HTTP polling, and TFT
  output.
- The Dockerized `remote-render/` service owns page state, clock rendering,
  settings/detail rendering, animations, frame diffing, and device commands.
- The active firmware entry point is `src/main.cpp`; the active remote protocol
  client code is under `src/remote/`; the active TFT bridge is
  `src/ui/TftFrameSink.cpp`.
- `platformio.ini` currently keeps `espressif8266@2.6.3` with the `nodemcuv2`
  board and a single embedded environment named `esp12e`.

## 2026-05-01 Remote Runtime Polish

- Changed the default firmware remote-render URL to the current development LAN
  endpoint in `src/AppConfig.h`. Treat it as a compile-time default only; users
  should normally set their own service URL through the device configuration
  portal.
- Added the device's own LAN IP to the local status/error screen so the setup
  page can be found without serial logs.
- Installed DejaVu and Noto CJK fonts in the Docker image so Pillow renders both
  Latin and Chinese text correctly in the container.
- Made the remote renderer advance clock frames once per second and send dirty
  rectangles for normal time refreshes.
- Preserved a latest full-frame snapshot per device and force full-frame resync
  for cold clients (`have=0`), server-restart frame-id mismatches, and clients
  that missed the base frame for a partial update.
- Added the local HTTP frame preview tool under
  `remote-render/tools/frame_preview.py`. It decodes `SDD1` frames, optionally
  POSTs an input gesture, and writes PNG previews.
- Added server-side Home, Settings, and Detail page state with single-button
  gesture routing:
  - Home: `long_press` enters Settings.
  - Settings: `short_press` moves selection.
  - Settings: `long_press` opens the selected detail page.
  - Brightness detail: `short_press` cycles brightness, `long_press` applies it.
  - Settings/Detail: `double_press` goes back one level.
- Added remote brightness control through a JSON command channel. The ESP8266
  applies PWM locally and persists the selected brightness when commanded.
- Added device status sync for persisted brightness plus ESP8266-side
  diagnostics: free heap, max free heap block, heap fragmentation, WiFi RSSI,
  and uptime.
- Settings currently contains `Brightness`, `Device`, `Renderer`, and `About`.
  Placeholder-only items stay hidden until real features back them.
- Reworked Home into a Chinese desktop clock with Chinese date, weekday, large
  `HH:MM`, compact seconds, a greeting, a short subtitle, and a small sync/RSSI
  footer.
- Added remote UI animations on the server side: page entry/back transitions,
  Settings selection pulse, Brightness value/bar/knob animation, detail panel
  pulse, and Home footer glow. No firmware or protocol change is needed for
  these animations.

## Frame Transport And Diagnostics

- The binary frame format is `SDD1` with raw or RGB565 RLE rectangle payloads.
- The renderer chooses RLE per rectangle only when it is smaller than raw
  RGB565.
- Full-frame home/settings updates are roughly `14.5-15.6KB` on the wire after
  RLE. Small clock dirty frames are usually around `0.8-2.0KB`.
- Large page changes use interleaved `240x8` tile strips to reduce visible
  top-to-bottom scanning on the physical TFT.
- The firmware logs large/full frame timing fields including `begin_ms`,
  `get_ms`, `header_ms`, `srv_wait_ms`, `srv_render_ms`, `srv_total_ms`,
  `client_overhead_ms`, `read_ms`, `stream_reads`, `stream_bytes`, `tft_ms`,
  `tft_calls`, `other_ms`, and `total_ms`.
- The frame endpoint returns `X-SDD-Server-Wait-Ms`,
  `X-SDD-Server-Render-Ms`, and `X-SDD-Server-Total-Ms` on both `200` and
  `204` responses.
- The firmware keeps the frame polling path on HTTP Keep-Alive through a
  reusable `WiFiClient` / `HTTPClient` pair, resetting the socket after request
  failures, invalid frame bodies, stale partials, or remote URL changes.
- First Keep-Alive samples reduced typical `client_overhead_ms` from roughly
  `12-18ms` to roughly `9-12ms` on page transitions and small dirty frames.

## Development Notes

- Run the remote service locally from `remote-render/`:

```bash
REMOTE_RENDER_PORT=18080 docker compose up -d --build
```

- Run remote-render tests:

```bash
cd remote-render
.venv/bin/pytest
```

- Build and test firmware-side logic:

```bash
~/.platformio/penv/bin/pio test -e host
~/.platformio/penv/bin/pio run -e esp12e
```

- Preview the latest rendered frames:

```bash
cd remote-render
.venv/bin/python -m tools.frame_preview \
  --base-url http://127.0.0.1:18080 \
  --device-id preview-01 \
  --frames 2 \
  --output frame-previews/latest.png
```

- Preview Settings navigation:

```bash
cd remote-render
.venv/bin/python -m tools.frame_preview \
  --base-url http://127.0.0.1:18080 \
  --device-id preview-settings-01 \
  --input-event long_press \
  --input-seq 1 \
  --frames 8 \
  --wait-ms 60 \
  --output frame-previews/settings.png
```

- Generated preview images live under `remote-render/frame-previews/` and are
  intentionally ignored.
- Keep preview clients on a different `device_id` than the physical display.
  Sharing an id makes both clients advance the same server-side frame state and
  can cause misleading full-frame resyncs.
- If button input appears stuck after flashing, check Docker logs for accepted
  and ignored input events. Ignored lower sequences with forward-moving uptime
  usually mean another client is sharing the same `device_id`.
- If the screen shows only a partial region after a restart, first confirm with
  `tools.frame_preview` whether `have=0` or a future `have` is incorrectly
  receiving a partial frame.
