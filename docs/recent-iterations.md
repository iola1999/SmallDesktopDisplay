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

### Render Transition Fixes

- Fixed the right-bottom home animation teardown ordering bug.
- Root cause: leaving `Home` rendered the destination page first, then `animate::setHomeActive(false)` cleared the old animation region over the newly rendered page.
- New behavior: when transitioning away from `Home`, animation deactivation and region clear happen before the destination page render.
