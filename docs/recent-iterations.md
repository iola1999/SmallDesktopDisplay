# Recent Iterations

This file is the rolling log for recent firmware and UI iterations.
Update it whenever behavior, architecture, or interaction details change.

## 2026-04-30

### Remote Rendering Thin Client

- Added the `SDD/1` HTTP frame protocol design in `docs/remote-rendering-http-frame-design.md`.
- Added a Dockerized `remote-render/` FastAPI + Pillow service that renders 240x240 RGB565 frames and accepts button gesture events.
- Switched the `esp12e` firmware entrypoint to a remote-display loop: connect WiFi, poll the latest frame, draw raw RGB565 rectangles, and POST button events.
- Added firmware-side frame header/rect parsing tests.
- Removed old local weather/NTP/settings/motion code and made `esp12e` build the remaining remote-display firmware without source filtering.
- First-version remote service URLs are intentionally `http://` only.

## 2026-05-01

### Remote Rendering Runtime Polish

- Changed the default remote renderer URL to `http://192.168.1.7:18080` for the current Mac-based Docker setup.
- Added the device's own LAN IP to the local status/debug screen so the config page can be found without serial logs.
- Installed DejaVu TrueType fonts in the Docker image so Pillow renders readable clock text instead of falling back to a tiny default bitmap font.
- Made the remote renderer advance clock frames once per second and send dirty rectangles for normal time refreshes.
- Preserved a latest full-frame snapshot per device and force full-frame resync for cold clients (`have=0`) and server-restart frame-id mismatches.
- Added a local HTTP frame preview tool under `remote-render/tools/frame_preview.py` that decodes `SDD1` frames and writes PNG previews.
- Batched TFT output in 4-row RGB565 blocks to reduce the visible top-to-bottom scan effect on full-frame updates.

### Remote Settings UI Framework

- Added a pure server-side `DeviceUiState` state machine for Home, Settings, and Detail pages.
- Mapped the single button gestures remotely: long press enters Settings, short press moves selection, long press opens a detail page, and double press goes back.
- Added Pillow-rendered Settings and Detail screens, keeping the ESP8266 as a thin display/input client.
- Added first-pass navigation animation scheduling in the Docker service, capped at 20 FPS for now so animation pressure is explicit and measurable.
- Changed navigation motion to a bounded accent-bar animation instead of full-screen sliding, keeping follow-up animation frames around a few KB instead of nearly full-screen payloads.
- Moved hold-progress feedback back onto the device as a tiny local overlay, so press-and-hold feedback starts immediately and does not depend on HTTP round trips.
- Changed long-press routing to POST `long_press` on `LongPressArmed`, with the later `LongPress` event only acting as a fallback, so Settings can open as soon as the threshold is reached.
- Delayed the local hold-progress overlay until the double-click window has passed, avoiding a visual flash on ordinary taps.
- Fixed the Settings -> Home route so it diffs the whole page transition instead of treating the destination Home page as a footer-only update.
- Replaced large dirty bounding boxes with interleaved `240x8` tile strips for big page changes, reducing the visible top-to-bottom scan effect even when the total changed payload is still large.
- Added server and device frame logs for large/full updates, including frame id, rect count, payload size, and device draw time.
- Made partial frames carry the previous frame as `base_frame_id`; if a client misses that base, the service returns the latest full snapshot instead of an unsafe dirty diff.
- Added a firmware-side stale-partial guard that refuses to draw partial frames whose `base_frame_id` does not match the device's current `have`.
- Made input de-duplication tolerate device reboot/flash cycles: if `uptime_ms` moves backwards, the service accepts the restarted device's lower input sequence instead of silently ignoring all later button presses.
- Added Docker-side input accepted/ignored logs for quicker button-path debugging.
- Extended the local frame preview client so it can POST an input event before capturing frames, which makes navigation and animation debugging possible without reflashing or photographing the device.
- Split Docker dependency installation from `app/` code copying and enabled BuildKit pip cache so renderer-only rebuilds do not repeatedly download Pillow/FastAPI.
- Fixed the local `clang-format` tooling path by exposing Homebrew LLVM's `clang-format` through a PlatformIO package shim, so `pio pkg exec -- clang-format ...` works on this Mac.

### Current Development And Deployment Notes

- Local Docker service is expected to run from `remote-render/` with `REMOTE_RENDER_PORT=18080 docker compose up -d --build` while 8080 is occupied.
- Device setup should use the Mac LAN URL, currently `http://192.168.1.7:18080`, unless the Mac IP or host port changes.
- For remote renderer changes, run `remote-render/.venv/bin/pytest`; for firmware changes, run `~/.platformio/penv/bin/pio test -e host` and `~/.platformio/penv/bin/pio run -e esp12e`.
- Generated preview images live in `remote-render/frame-previews/` and are intentionally ignored.
- To preview remote navigation locally, use `remote-render/.venv/bin/python -m tools.frame_preview --device-id preview-01 --input-event long_press --frames 8 --wait-ms 60 --output frame-previews/settings.png`.
- Keep preview clients on a different `device_id` than the physical display, otherwise both clients advance the same remote frame state.
- If button input appears stuck after flashing, check Docker logs for `input accepted` / `input ignored`; ignored low sequences with forward-moving uptime usually mean another client is sharing the same `device_id`.
- If the screen shows only a partial region after a restart, first check `tools.frame_preview` output for whether `have=0` or a future `have` is incorrectly receiving a partial frame.

## 2026-04-18

### App Core And Settings Foundation

- Rebuilt the firmware around `AppCore`, `AppDriver`, ports, and host-side doctest coverage.
- Split splash, blocking error, and operational routing into explicit app/view state.
- Added the first settings navigation flow, diagnostics capture, brightness adjustment, and restart confirmation.

### Background Refresh And Home Animation Scope

- Decoupled background refresh from the blocking WiFi progress screen.
- Ensured the home animation only renders on `Home` and no longer leaks into settings pages.
- Added diagnostics data for heap, flash usage, saved SSID, active SSID, WiFi state, and refresh interval.

### Compact Single-Button UX

- Unified gesture semantics as:
  - short press = next / scroll / cycle
  - long press = confirm
  - double press = back
- Raised long-press threshold to `500ms`.
- Added double-click routing for non-home pages and removed the redundant `Back` item from the settings menu.
- Compactified the top chrome and restored the bottom operation hint strip on non-home pages.

### Transient Feedback And Input Polish

- Fixed the regression where press lifecycle events caused full-page redraws; hold progress now refreshes only the top transient strip.
- Added a top micro-feedback capsule for `Tap`, `Hold`, and `2x Back`.
- Delayed hold-progress rendering until the double-click disambiguation window has passed, reducing visual noise on every tap.
- Increased gesture feedback display time to `420ms`.
- Vertically centered the page title text inside the compact top title bar.

### WiFi And Refresh Behavior

- Marked the system to keep WiFi awake by default for always-powered use.
- Short-circuited background reconnect work when WiFi is already connected.
- Deferred scheduled blocking refresh work until the device is back on the home page and idle, reducing settings-page freezes.
- Current limitation: weather fetch and NTP sync are still synchronous calls once refresh starts. They are now better contained, but not yet a true async pipeline.

### Follow-Up Candidate

- Refactor weather/NTP/network refresh into an incremental async job runner so background sync no longer blocks even on the home page.

## 2026-04-19

### Firmware Slimming Pass

- Removed the right-bottom home animation and deleted the bundled frame assets.
- Removed the unused DHT11 firmware path, related adapter code, and the old DHT library dependencies.
- Replaced the large Chinese smooth font with built-in English bitmap fonts on the main screen.
- Hid the city-name label on the home page, kept the weather icon set, and switched weather banners/AQI labels to English text.
- Replaced `WiFiManager` with a minimal in-firmware web setup portal that only collects SSID and password, then stores credentials and reboots.
- Kept `TJpg_Decoder` because the temperature/humidity JPEG icons remain in use and future image rendering work is still expected.
- Expanded the lightweight setup portal to list nearby SSIDs and keep `CityCode` editable with `blank/0 = auto detect`.
- Kept the same setup page for both first-time AP provisioning and post-connect LAN reconfiguration; once the device joins WiFi, the page is now reachable from other devices on the same LAN via the device IP.
- Rebalanced the home screen after animation removal by promoting the weather panel on the right and tightening the top information band.
- Changed clock digit refresh from fixed-box clearing to glyph-only redraw so the time ticker no longer punches black rectangles into the lower weather panel area.

### Render Transition Fixes

- Fixed the right-bottom home animation teardown ordering bug.
- Root cause: leaving `Home` rendered the destination page first, then `animate::setHomeActive(false)` cleared the old animation region over the newly rendered page.
- New behavior: when transitioning away from `Home`, animation deactivation and region clear happen before the destination page render.

### Incremental Settings Rendering

- Added a small render-planning layer that compares the last rendered `AppViewModel` with the next one and chooses between full-frame render and targeted page-body redraws.
- Settings menu selection changes now redraw only the menu body region instead of clearing the whole screen first.
- Diagnostics scrolling now redraws only the info rows region, keeping the compact title chrome and footer stable.
- Brightness preset changes now redraw only the adjust-page body region rather than forcing a full-screen clear.
- Top gesture feedback no longer clears and redraws on every transient UI tick while visible; it now draws once when triggered and clears once when it expires.
- Fixed the follow-up conflict where hidden hold-feedback cleanup could still clear the shared top transient strip and erase a visible gesture capsule on the next tick.

### 2026-04-19 UI Motion Upgrade

- Added a lightweight shared motion layer for menu, diagnostics, adjust-page, transient, and home-page micro-interactions.
- Kept the implementation on the existing ESP8266 TFT path without introducing a full-screen frame buffer or LVGL.
- Left strip buffering as a follow-up experiment only if hardware still shows visible flicker after the no-buffer motion pass.

### Follow-Up Candidate

- Evaluate strip-based double buffering for page body regions if partial redraw still shows visible flicker on hardware; avoid full-screen frame buffers on ESP-12E due to RAM pressure.
- Evaluate server-rendered text or image tiles for low-frequency dynamic labels if local flash pressure returns. If implemented later, prefer raw bitmap or RGB565/RLE payloads over PNG/JPEG so the device can blit without adding new decode overhead.
- Evaluate a remote-control architecture where a NAS or other always-on service computes app state and renders frames, and the display device becomes a thin client that only pulls and presents the latest image payload.
