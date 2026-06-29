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
- `remote-render/` now runs as a Node.js/TypeScript service. UI screens are
  expressed as React elements, reconciled into a custom host tree, laid out with
  Yoga, rasterized with Skia through `@napi-rs/canvas`, and then encoded into
  the existing `SDD1` RGB565 frame protocol.
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
- Installed DejaVu, Noto CJK, LXGW WenKai Screen, and Maple Mono NF CN fonts in
  the Docker image so the Node/Skia renderer can draw both Latin and Chinese
  text correctly in the container.
- Made the remote renderer advance clock frames once per second and send dirty
  rectangles for normal time refreshes.
- Preserved a latest full-frame snapshot per device and force full-frame resync
  for cold clients (`have=0`), server-restart frame-id mismatches, and clients
  that missed the base frame for a partial update.
- Added the local HTTP frame preview tool under
  `remote-render/src/tools/frame-preview.ts`. It decodes `SDD1` frames and
  writes PNG previews.
- Added server-side Home, Settings, and Detail page state with single-button
  gesture routing:
  - Home: `long_press` enters Settings.
  - Settings: `short_press` moves selection.
  - Settings: `long_press` opens the selected detail page.
  - Brightness detail: `short_press` applies the next brightness immediately.
  - Font detail: `short_press` applies the next renderer font immediately.
  - Settings/Detail: `double_press` goes back one level.
- Added remote brightness control through a JSON command channel. The ESP8266
  applies PWM locally and persists the selected brightness when commanded. The
  service now sends that command as soon as brightness is changed in the detail
  page, so the physical backlight follows the visible setting without a separate
  confirm step.
- Added server-side font selection for the renderer. The custom React/Yoga/Skia
  renderer now applies the chosen font during text painting, not only during
  text measurement.
- Added device status sync for persisted brightness plus ESP8266-side
  diagnostics: free heap, max free heap block, heap fragmentation, WiFi RSSI,
  and uptime.
- Settings currently contains `Brightness`, `Font`, `Device`, `Renderer`, and
  `About`.
- Reworked Home into a Chinese desktop clock with Chinese date, weekday, large
  `HH:MM`, compact seconds, a greeting, and a short subtitle. Development-only
  sync/RSSI text is intentionally kept off the first screen.
- Added remote UI animations on the server side: page entry/back transitions,
  Settings selection pulse, Brightness value/bar/knob animation, detail panel
  pulse. No firmware or protocol change is needed for these animations.

## 2026-06-29 Audit Optimizations And New Features

Outcome of a code audit pass plus the requested feature work. All changes keep
the thin-client architecture; remote-render stays at 81 vitest tests, firmware at
31 host doctest cases, and the `esp12e` build is unchanged in footprint class.

Optimizations (behavior-preserving unless noted):

- Server request hardening (`server.ts`): malformed JSON now returns `422`
  instead of `500`; non-object bodies fall through to `422`; request bodies are
  capped at 16KB with `413`. A small `HttpError` maps these without log noise.
- Lazy full-frame (`state.ts`): the per-device full-screen snapshot is no longer
  re-encoded on every partial/animation/game frame. It is computed lazily by a
  memoized getter only when a cold/resync client needs it. Byte-identical
  semantics; verified by the existing cold-client/cleanup tests.
- Device eviction (`state.ts`): idle device entries are swept after a TTL
  (default 1h, max once/60s) so arbitrary or preview device ids no longer grow
  the registry without bound. Returning devices resync via the normal full-frame
  path.
- Snake Hamiltonian cycle is memoized per `(columns, rows)` instead of rebuilt
  every tick.
- Graceful shutdown (`main.ts`): `SIGTERM`/`SIGINT` close the HTTP server so
  in-flight long-poll requests are not hard-killed.
- Firmware frame hot path (`HttpFrameClient.cpp`): the request URL is built with
  `snprintf` into a fixed buffer instead of chained Arduino `String`
  concatenation, and the three timing-response-header reads are deferred to only
  when frame diagnostics are actually logged. This reduces per-poll heap churn at
  ~20Hz. Also: removed the unreachable wait-loop in `Net.cpp`
  `loadingUntilConnected`, the dead overflow guard in `parseHeaderMs`, and added
  an offline-banner recovery path (force `have=0` once after a failed poll
  succeeds so a stale "Render server offline" screen repaints).
- Engineering: added a GitHub Actions CI workflow (vitest + typecheck + build,
  `pio test -e host`, `pio run -e esp12e`), an `npm run typecheck` that also
  checks test files, and a `docker-compose` healthcheck against `/api/v1/health`.
- UI cleanups: removed a dead `useMemo`, deduped `nextFontLabel` into the shared
  `nextFontKey`, and dropped an unreachable brightness "saved" label branch.

New features (server-only, no firmware reflash):

- Home lunar subtitle: a self-contained lunar calendar service
  (`renderer/services/lunar.ts`, 1900-2100, no new npm dependency) adds农历 date
  plus solar terms (二十四节气) and major festivals as a subtitle line under the
  Gregorian date.
- Optional weather: `renderer/services/weather.ts` polls Open-Meteo (free, no API
  key) for Hangzhou Xiaoshan and caches the next 12 hours. Failures are silent and
  never block the clock; weather polling starts in `main.ts`.
  - Follow-up (same day): weather was first added as a Settings -> Weather detail
    page, which buried glanceable info two levels deep. It was promoted onto the
    Home screen instead. Settings now holds only config + diagnostics (no Weather
    item). The home header and forecast regions were added to the per-second
    dirty-render set so the weather elements refresh within ~1s of a cache update.

- Calm home + game show (interaction rework): the ambient game was removed from
  the Home screen so Home is a quiet clock + weather dashboard (current
  temp/condition chip + a full next-12-hour forecast with per-hour temperatures
  and a precipitation bar strip in the freed lower area). The games moved into a
  dedicated game show (new `page: "game"`, GameShowPage = big clock + large game)
  reached by `short_press` on Home. The show advances through the games on a
  per-game dwell timer and on manual `short_press`, then returns to the calm home
  after the last game; games never auto-run on Home. New regions GAME_TIME_REGION
  / GAME_AREA_REGION drive game-show dirty updates; games render larger
  (cellSize/canvas bumped ~216-224px wide).
- Clock themes: a Settings -> Theme detail cycles Midnight / Sakura / Amber /
  Mono palettes applied to the home clock, date, lunar line, and card background
  (`renderer/services/clock-theme.ts`). Settings row spacing is now adaptive so
  the longer menu still fits the card.
- New ambient game: a deterministic digital-rain screensaver
  (`renderer/services/auto-rain.ts` + widget) joins the home game rotation.

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
npm test
npm run build
```

- Build and test firmware-side logic:

```bash
~/.platformio/penv/bin/pio test -e host
~/.platformio/penv/bin/pio run -e esp12e
```

- Preview the latest rendered frames:

```bash
cd remote-render
npm run preview -- \
  --base-url http://127.0.0.1:18080 \
  --device-id preview-01 \
  --frames 2 \
  --output frame-previews/latest.png
```

- Preview Settings navigation:

```bash
cd remote-render
npm run preview -- \
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
  `npm run preview` whether `have=0` or a future `have` is incorrectly
  receiving a partial frame.
- If the ESP8266 reports invalid frame headers after a backend change, confirm
  with `curl --raw` that the frame body starts with `SDD1`. Node responses must
  include `Content-Length`; chunked transfer encoding puts chunk-size bytes
  before the binary frame and breaks the firmware stream parser.
