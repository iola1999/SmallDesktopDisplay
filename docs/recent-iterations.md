# Recent Iterations

This file is the rolling log for recent firmware and UI iterations.
Update it whenever behavior, architecture, or interaction details change.

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

### Follow-Up Candidate

- Evaluate strip-based double buffering for page body regions if partial redraw still shows visible flicker on hardware; avoid full-screen frame buffers on ESP-12E due to RAM pressure.
- Evaluate server-rendered text or image tiles for low-frequency dynamic labels if local flash pressure returns. If implemented later, prefer raw bitmap or RGB565/RLE payloads over PNG/JPEG so the device can blit without adding new decode overhead.
