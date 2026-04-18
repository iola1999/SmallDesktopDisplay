# Settings UX Refresh And Background Sync Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the single-button settings UX production-ready by decoupling background weather refresh from blocking WiFi UI, scoping the home animation to Home only, upgrading diagnostics into a scrollable info page, and adding visible long-press feedback.

**Architecture:** Keep `src/app` as the source of truth for page routing, hold-feedback state, diagnostics content, and background-sync intent. Thread the approved `ConnectWifi + payload.mode` contract through `AppCore`, `AppDriver`, `ports::NetworkPort`, and `net::connect()`, while `Input`, `main.cpp`, `TftDisplayPort`, `Screen`, and `Animate` render the new interaction model without reintroducing page-specific hacks.

**Tech Stack:** PlatformIO (`esp12e` + `host`), doctest, Arduino framework, Button2, TFT_eSPI, ESP8266WiFi, WiFiManager, existing `AppCore` / `AppDriver` / `ports` architecture

---

## Planned File Structure

- Modify: `src/AppConfig.h`
- Modify: `src/Input.h`
- Modify: `src/Input.cpp`
- Modify: `src/Net.h`
- Modify: `src/Net.cpp`
- Modify: `src/Screen.h`
- Modify: `src/Screen.cpp`
- Modify: `src/main.cpp`
- Modify: `src/Animate/Animate.h`
- Modify: `src/Animate/Animate.cpp`
- Modify: `src/adapters/Esp8266NetworkPort.h`
- Modify: `src/adapters/Esp8266NetworkPort.cpp`
- Modify: `src/adapters/Esp8266SystemStatusPort.h`
- Modify: `src/adapters/Esp8266SystemStatusPort.cpp`
- Modify: `src/app/AppAction.h`
- Modify: `src/app/AppCore.h`
- Modify: `src/app/AppCore.cpp`
- Modify: `src/app/AppDriver.cpp`
- Modify: `src/app/AppEvent.h`
- Modify: `src/app/AppViewModel.h`
- Modify: `src/app/DiagnosticsSnapshot.h`
- Modify: `src/app/UiSessionState.h`
- Modify: `src/ports/NetworkPort.h`
- Modify: `src/ports/SystemStatusPort.h`
- Modify: `src/ui/TftDisplayPort.h`
- Modify: `src/ui/TftDisplayPort.cpp`
- Modify: `README.md`
- Modify: `test/test_native_app_core/test_boot_flow.cpp`
- Modify: `test/test_native_app_core/test_diagnostics_capture.cpp`
- Modify: `test/test_native_app_core/test_driver_dispatch.cpp`
- Modify: `test/test_native_app_core/test_driver_mapping.cpp`
- Modify: `test/test_native_app_core/test_operational_flow.cpp`
- Modify: `test/test_native_app_core/test_settings_model_defaults.cpp`
- Modify: `test/test_native_app_core/test_settings_navigation.cpp`

### Responsibility Map

- `src/app/DiagnosticsSnapshot.h`: Expanded diagnostics payload carrying saved SSID, active SSID, radio/link state, last sync, and refresh interval.
- `src/app/UiSessionState.h`: UI session state for route, menu selection, diagnostics scroll position, and long-press feedback lifecycle.
- `src/app/AppEvent.h`: Adds press lifecycle events (`PressStarted`, `LongPressArmed`, `PressReleased`) alongside existing short/long actions.
- `src/app/AppAction.h`: Adds `WifiConnectMode` and structured action payloads so `ConnectWifi` can remain a single action type with mode-specific behavior.
- `src/app/AppViewModel.h`: Shared render contract for scrollable info pages, hold-progress UI, and home-only animation flags.
- `src/app/AppCore.*`: Reducer changes for silent background refresh, info-page scrolling, hold-feedback state transitions, and route-specific animation enablement.
- `src/ports/NetworkPort.h` / `src/Net.*` / `src/adapters/Esp8266NetworkPort.*`: Foreground-blocking versus background-silent WiFi connect path.
- `src/ports/SystemStatusPort.h` / `src/adapters/Esp8266SystemStatusPort.*`: Capture richer diagnostics by combining WiFi hardware state with app config/runtime context.
- `src/Input.*` / `src/main.cpp`: Queue multiple button lifecycle events and dispatch them without dropping feedback states.
- `src/ui/TftDisplayPort.*` / `src/Screen.*` / `src/Animate/*`: Render scrollable content pages, top hold-progress line, and stop the right-bottom animation outside Home.
- `README.md`: Document the revised button semantics and silent refresh behavior.
- `test/test_native_app_core/*`: Host-side regression coverage for payload modes, diagnostics content, scrolling, hold feedback, and driver dispatch.

### Build Strategy

- Keep all state and behavior assertions in the existing host test suite under `test/test_native_app_core/*`.
- Use `~/.platformio/penv/bin/pio test -e host -f test_native_app_core` as the fast feedback loop after each reducer / driver task.
- Use `~/.platformio/penv/bin/pio run -e esp12e` after any change that touches `Input`, `Net`, adapters, rendering, `Animate`, or `main.cpp`.
- Finish with one full host suite run plus one `esp12e` build before claiming implementation complete.

---

### Task 1: Expand Shared Models And Payload Contracts

**Files:**
- Modify: `src/app/AppEvent.h`
- Modify: `src/app/AppAction.h`
- Modify: `src/app/DiagnosticsSnapshot.h`
- Modify: `src/app/UiSessionState.h`
- Modify: `src/app/AppViewModel.h`
- Test: `test/test_native_app_core/test_settings_model_defaults.cpp`
- Test: `test/test_native_app_core/test_boot_flow.cpp`

- [ ] **Step 1: Write the failing model-default and payload tests**

```cpp
// test/test_native_app_core/test_settings_model_defaults.cpp
#include <doctest.h>

#include "app/AppAction.h"
#include "app/AppEvent.h"
#include "app/AppViewModel.h"
#include "app/UiSessionState.h"

TEST_CASE("settings ui defaults include info-page and hold-feedback state")
{
  app::UiSessionState ui;
  app::AppViewModel view;

  CHECK(ui.route == app::UiRoute::Home);
  CHECK(ui.infoPage.selectedRowIndex == 0);
  CHECK(ui.infoPage.firstVisibleRowIndex == 0);
  CHECK(ui.holdFeedback.visible == false);
  CHECK(ui.holdFeedback.armed == false);
  CHECK(ui.holdFeedback.pressStartedMs == 0);
  CHECK(ui.holdFeedback.progressPercent == 0);

  CHECK(view.main.pageKind == app::OperationalPageKind::Home);
  CHECK(view.main.info.rowCount == 0);
  CHECK(view.main.info.visibleRowCount == 4);
  CHECK(view.main.info.selectedRowIndex == 0);
  CHECK(view.main.info.firstVisibleRowIndex == 0);
  CHECK(view.main.holdFeedback.visible == false);
  CHECK(view.main.holdFeedback.progressPercent == 0);
  CHECK(view.main.homeAnimationEnabled == false);
}

TEST_CASE("connect-wifi actions keep mode in a structured payload")
{
  app::ActionList actions;
  actions.pushConnectWifi(app::WifiConnectMode::BackgroundSilent);

  REQUIRE(actions.count == 1);
  CHECK(actions[0].type == app::AppActionType::ConnectWifi);
  CHECK(actions[0].payload.mode == app::WifiConnectMode::BackgroundSilent);
  CHECK(actions[0].payload.value == 0);
}

TEST_CASE("press lifecycle events preserve monotonic timestamps")
{
  const auto started = app::AppEvent::pressStarted(1000);
  const auto armed = app::AppEvent::longPressArmed(1180);
  const auto released = app::AppEvent::pressReleased(1230);

  CHECK(started.type == app::AppEventType::PressStarted);
  CHECK(started.monotonicMs == 1000);
  CHECK(armed.type == app::AppEventType::LongPressArmed);
  CHECK(armed.monotonicMs == 1180);
  CHECK(released.type == app::AppEventType::PressReleased);
  CHECK(released.monotonicMs == 1230);
}
```

```cpp
// test/test_native_app_core/test_boot_flow.cpp
TEST_CASE("boot request renders splash and starts foreground wifi connection")
{
  app::AppCore core;
  const auto actions = core.handle(app::AppEvent::bootRequested());

  CHECK(actions.count == 2);
  CHECK(actions[0].type == app::AppActionType::RenderRequested);
  CHECK(actions[1].type == app::AppActionType::ConnectWifi);
  CHECK(actions[1].payload.mode == app::WifiConnectMode::ForegroundBlocking);
  CHECK(core.runtime().mode == app::AppMode::Booting);
  CHECK(core.view().kind == app::ViewKind::Splash);
}
```

- [ ] **Step 2: Run the host suite to verify the new fields and helpers are missing**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: FAIL with errors such as `struct app::UiSessionState has no member named infoPage`, `ActionList has no member named pushConnectWifi`, and `PressStarted is not a member of app::AppEventType`.

- [ ] **Step 3: Implement the shared models, payload types, and default view contract**

```cpp
// src/app/AppAction.h
enum class WifiConnectMode
{
  ForegroundBlocking,
  BackgroundSilent,
};

struct AppActionPayload
{
  uint32_t value = 0;
  WifiConnectMode mode = WifiConnectMode::ForegroundBlocking;
};

struct AppAction
{
  AppActionType type = AppActionType::RenderRequested;
  AppActionPayload payload;
};

struct ActionList
{
  std::array<AppAction, 12> items{};
  std::size_t count = 0;

  void push(AppActionType type)
  {
    items[count].type = type;
    items[count].payload = AppActionPayload{};
    ++count;
  }

  void pushValue(AppActionType type, uint32_t value)
  {
    items[count].type = type;
    items[count].payload = AppActionPayload{};
    items[count].payload.value = value;
    ++count;
  }

  void pushConnectWifi(WifiConnectMode mode)
  {
    items[count].type = AppActionType::ConnectWifi;
    items[count].payload = AppActionPayload{};
    items[count].payload.mode = mode;
    ++count;
  }

  const AppAction &operator[](std::size_t index) const
  {
    return items[index];
  }
};
```

```cpp
// src/app/AppEvent.h
enum class AppEventType
{
  BootRequested,
  WifiConnected,
  WifiConnectionFailed,
  TimeSynced,
  TimeSyncFailed,
  WeatherFetched,
  WeatherFetchFailed,
  RefreshDue,
  PressStarted,
  LongPressArmed,
  PressReleased,
  ShortPressed,
  LongPressed,
  ToastExpired,
  DiagnosticsSnapshotCaptured,
};

static AppEvent pressStarted(uint32_t nowMs)
{
  AppEvent event;
  event.type = AppEventType::PressStarted;
  event.monotonicMs = nowMs;
  return event;
}

static AppEvent longPressArmed(uint32_t nowMs)
{
  AppEvent event;
  event.type = AppEventType::LongPressArmed;
  event.monotonicMs = nowMs;
  return event;
}

static AppEvent pressReleased(uint32_t nowMs)
{
  AppEvent event;
  event.type = AppEventType::PressReleased;
  event.monotonicMs = nowMs;
  return event;
}
```

```cpp
// src/app/DiagnosticsSnapshot.h
struct DiagnosticsSnapshot
{
  bool valid = false;
  uint32_t freeHeapBytes = 0;
  uint32_t programFlashUsedBytes = 0;
  uint32_t programFlashTotalBytes = 0;
  std::string savedWifiSsid;
  std::string activeWifiSsid;
  bool wifiLinkConnected = false;
  bool wifiRadioAwake = false;
  uint32_t lastWeatherSyncEpoch = 0;
  uint32_t refreshIntervalMinutes = 0;
};
```

```cpp
// src/app/UiSessionState.h
struct InfoPageState
{
  uint8_t selectedRowIndex = 0;
  uint8_t firstVisibleRowIndex = 0;
};

struct HoldFeedbackState
{
  bool visible = false;
  bool armed = false;
  uint32_t pressStartedMs = 0;
  uint8_t progressPercent = 0;
};

struct UiSessionState
{
  UiRoute route = UiRoute::Home;
  uint8_t selectedMenuIndex = 0;
  uint8_t selectedBrightnessPresetIndex = 0;
  bool toastVisible = false;
  uint32_t toastDeadlineMs = 0;
  DiagnosticsSnapshot diagnostics;
  InfoPageState infoPage;
  HoldFeedbackState holdFeedback;
};
```

```cpp
// src/app/AppViewModel.h
struct HoldFeedbackViewData
{
  bool visible = false;
  bool armed = false;
  uint32_t pressStartedMs = 0;
  uint8_t progressPercent = 0;
};

struct InfoBodyData
{
  std::string title;
  std::string subtitle;
  std::array<InfoRowData, 10> rows{};
  std::size_t rowCount = 0;
  std::size_t visibleRowCount = 4;
  std::size_t firstVisibleRowIndex = 0;
  std::size_t selectedRowIndex = 0;
};

struct MainViewData
{
  OperationalPageKind pageKind = OperationalPageKind::Home;
  FooterHints footer;
  ToastData toast;
  MenuBodyData menu;
  InfoBodyData info;
  AdjustBodyData adjust;
  HoldFeedbackViewData holdFeedback;
  bool homeAnimationEnabled = false;
  std::string timeText = "--:--:--";
  std::string dateText;
  std::string cityName;
  std::string temperatureText;
  std::string humidityText;
  int temperatureC = 0;
  int humidityPercent = 0;
  int aqi = 0;
  int weatherCode = 99;
  std::array<std::string, app_config::kBannerSlotCount> bannerLines{};
  bool showSyncInProgress = false;
  bool showIndoorClimate = false;
  float indoorTemperatureC = 0.0f;
  float indoorHumidityPercent = 0.0f;
};
```

- [ ] **Step 4: Run the host suite to verify the shared contracts pass**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: PASS for the new default / payload assertions, with any remaining failures limited to call sites not yet updated to `payload.value` or `pushConnectWifi`.

- [ ] **Step 5: Commit the shared model contract changes**

```bash
git add src/app/AppAction.h src/app/AppEvent.h src/app/AppViewModel.h src/app/DiagnosticsSnapshot.h src/app/UiSessionState.h test/test_native_app_core/test_settings_model_defaults.cpp test/test_native_app_core/test_boot_flow.cpp
git commit -m "refactor: extend settings ui model contracts"
```

---

### Task 2: Update AppCore For Silent Refresh, Scrollable Info Pages, And Hold Feedback

**Files:**
- Modify: `src/app/AppCore.h`
- Modify: `src/app/AppCore.cpp`
- Test: `test/test_native_app_core/test_operational_flow.cpp`
- Test: `test/test_native_app_core/test_settings_navigation.cpp`
- Test: `test/test_native_app_core/test_diagnostics_capture.cpp`

- [ ] **Step 1: Write the failing reducer tests for background mode, scrolling, animation scope, and hold feedback**

```cpp
// test/test_native_app_core/test_operational_flow.cpp
TEST_CASE("background refresh stays on the current route and uses silent connect mode")
{
  auto core = bootedCore();
  core.handle(app::AppEvent::longPressed(1000));

  const auto actions = core.handle(app::AppEvent::refreshDue(1710000600));

  REQUIRE(actions.count == 2);
  CHECK(actions[0].type == app::AppActionType::WakeWifi);
  CHECK(actions[1].type == app::AppActionType::ConnectWifi);
  CHECK(actions[1].payload.mode == app::WifiConnectMode::BackgroundSilent);
  CHECK(core.ui().route == app::UiRoute::SettingsMenu);
  CHECK(core.view().main.pageKind == app::OperationalPageKind::Menu);
  CHECK(core.view().main.homeAnimationEnabled == false);
}
```

```cpp
// test/test_native_app_core/test_settings_navigation.cpp
TEST_CASE("press lifecycle events drive hold feedback without changing route")
{
  auto core = operationalCore();

  auto started = core.handle(app::AppEvent::pressStarted(1000));
  CHECK(started.count == 1);
  CHECK(started[0].type == app::AppActionType::RenderRequested);
  CHECK(core.ui().holdFeedback.visible == true);
  CHECK(core.view().main.holdFeedback.visible == true);
  CHECK(core.view().main.holdFeedback.pressStartedMs == 1000);

  auto armed = core.handle(app::AppEvent::longPressArmed(1200));
  CHECK(armed.count == 1);
  CHECK(core.ui().holdFeedback.armed == true);
  CHECK(core.view().main.holdFeedback.progressPercent == 100);

  auto released = core.handle(app::AppEvent::pressReleased(1230));
  CHECK(released.count == 1);
  CHECK(core.ui().holdFeedback.visible == false);
  CHECK(core.view().main.holdFeedback.visible == false);
  CHECK(core.ui().route == app::UiRoute::Home);
}

TEST_CASE("home is the only page that enables the right-bottom animation")
{
  auto core = operationalCore();
  CHECK(core.view().main.homeAnimationEnabled == true);

  core.handle(app::AppEvent::longPressed(1000));
  CHECK(core.view().main.homeAnimationEnabled == false);
}
```

```cpp
// test/test_native_app_core/test_diagnostics_capture.cpp
TEST_CASE("captured diagnostics render a scrollable info page")
{
  auto core = diagnosticsCore();

  app::DiagnosticsSnapshot snapshot;
  snapshot.valid = true;
  snapshot.savedWifiSsid = "StudioWiFi";
  snapshot.activeWifiSsid = "-";
  snapshot.wifiLinkConnected = false;
  snapshot.wifiRadioAwake = false;
  snapshot.lastWeatherSyncEpoch = 1710000000;
  snapshot.refreshIntervalMinutes = 15;
  snapshot.freeHeapBytes = 32768;
  snapshot.programFlashUsedBytes = 846012;
  snapshot.programFlashTotalBytes = 1044464;

  core.handle(app::AppEvent::diagnosticsSnapshotCaptured(snapshot));

  CHECK(core.view().main.info.rowCount == 9);
  CHECK(core.view().main.info.visibleRowCount == 4);
  CHECK(core.view().main.info.rows[0].label == "Saved SSID");
  CHECK(core.view().main.info.rows[1].value == "sleeping");
  CHECK(core.view().main.info.rows[4].label == "Last Sync");
}

TEST_CASE("content-page short press scrolls and long press returns")
{
  auto core = diagnosticsCore();
  app::DiagnosticsSnapshot snapshot;
  snapshot.valid = true;
  snapshot.savedWifiSsid = "StudioWiFi";
  snapshot.activeWifiSsid = "-";
  snapshot.wifiLinkConnected = false;
  snapshot.wifiRadioAwake = false;
  snapshot.lastWeatherSyncEpoch = 1710000000;
  snapshot.refreshIntervalMinutes = 15;
  snapshot.freeHeapBytes = 32768;
  snapshot.programFlashUsedBytes = 846012;
  snapshot.programFlashTotalBytes = 1044464;
  core.handle(app::AppEvent::diagnosticsSnapshotCaptured(snapshot));

  core.handle(app::AppEvent::shortPressed(1000));
  core.handle(app::AppEvent::shortPressed(1001));
  core.handle(app::AppEvent::shortPressed(1002));
  core.handle(app::AppEvent::shortPressed(1003));

  CHECK(core.ui().infoPage.selectedRowIndex == 4);
  CHECK(core.ui().infoPage.firstVisibleRowIndex == 1);

  const auto back = core.handle(app::AppEvent::longPressed(1004));
  CHECK(back.count == 1);
  CHECK(back[0].type == app::AppActionType::RenderRequested);
  CHECK(core.ui().route == app::UiRoute::SettingsMenu);
}
```

- [ ] **Step 2: Run the host suite to verify the reducer does not yet satisfy the new semantics**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: FAIL with assertions showing `payload.mode` still defaults to foreground in background refresh, diagnostics rows still equal `4`, `ShortPressed` on diagnostics still returns immediately, and `homeAnimationEnabled` never changes.

- [ ] **Step 3: Implement the AppCore reducer helpers and view refresh logic**

```cpp
// src/app/AppCore.h
private:
  void beginHoldFeedback(uint32_t nowMs);
  void armHoldFeedback();
  void clearHoldFeedback();
  void resetInfoPage();
  void advanceInfoPage(std::size_t rowCount, std::size_t visibleRowCount);
```

```cpp
// src/app/AppCore.cpp
namespace
{

constexpr std::size_t kInfoVisibleRows = 4;

std::string formatUint32(uint32_t value)
{
  char buffer[16];
  snprintf(buffer, sizeof(buffer), "%lu", static_cast<unsigned long>(value));
  return buffer;
}

std::string formatEpochCompact(uint32_t epochSeconds)
{
  if (epochSeconds == 0)
  {
    return "-";
  }

  const std::time_t raw = static_cast<std::time_t>(epochSeconds);
  const std::tm *tm = std::localtime(&raw);
  if (!tm)
  {
    return "-";
  }

  char buffer[20];
  snprintf(buffer,
           sizeof(buffer),
           "%02d-%02d %02d:%02d",
           tm->tm_mon + 1,
           tm->tm_mday,
           tm->tm_hour,
           tm->tm_min);
  return buffer;
}

std::string textOrDash(const std::string &value)
{
  return value.empty() ? "-" : value;
}

} // namespace

void AppCore::beginHoldFeedback(uint32_t nowMs)
{
  ui_.holdFeedback.visible = true;
  ui_.holdFeedback.armed = false;
  ui_.holdFeedback.pressStartedMs = nowMs;
  ui_.holdFeedback.progressPercent = 0;
}

void AppCore::armHoldFeedback()
{
  ui_.holdFeedback.visible = true;
  ui_.holdFeedback.armed = true;
  ui_.holdFeedback.progressPercent = 100;
}

void AppCore::clearHoldFeedback()
{
  ui_.holdFeedback = HoldFeedbackState{};
}

void AppCore::resetInfoPage()
{
  ui_.infoPage = InfoPageState{};
}

void AppCore::advanceInfoPage(std::size_t rowCount, std::size_t visibleRowCount)
{
  if (rowCount == 0)
  {
    return;
  }

  ui_.infoPage.selectedRowIndex =
    static_cast<uint8_t>((ui_.infoPage.selectedRowIndex + 1U) % rowCount);

  if (ui_.infoPage.selectedRowIndex == 0)
  {
    ui_.infoPage.firstVisibleRowIndex = 0;
    return;
  }

  const std::size_t lastVisible = ui_.infoPage.firstVisibleRowIndex + visibleRowCount - 1U;
  if (ui_.infoPage.selectedRowIndex > lastVisible)
  {
    ui_.infoPage.firstVisibleRowIndex =
      static_cast<uint8_t>(ui_.infoPage.selectedRowIndex - visibleRowCount + 1U);
  }
}
```

```cpp
// src/app/AppCore.cpp - in refreshOperationalView()
view_.main.holdFeedback.visible = ui_.holdFeedback.visible;
view_.main.holdFeedback.armed = ui_.holdFeedback.armed;
view_.main.holdFeedback.pressStartedMs = ui_.holdFeedback.pressStartedMs;
view_.main.holdFeedback.progressPercent = ui_.holdFeedback.progressPercent;
view_.main.homeAnimationEnabled = (ui_.route == UiRoute::Home);

switch (ui_.route)
{
  case UiRoute::Home:
    view_.main.pageKind = OperationalPageKind::Home;
    view_.main.footer = FooterHints{};
    view_.main.toast.visible = ui_.toastVisible;
    view_.main.toast.text = ui_.toastVisible ? "Debug shortcut" : "";
    break;

  case UiRoute::DiagnosticsPage:
    view_.main.pageKind = OperationalPageKind::Info;
    view_.main.info.title = "Diagnostics";
    view_.main.info.subtitle = "Tap to scroll";
    view_.main.info.rowCount = 9;
    view_.main.info.visibleRowCount = kInfoVisibleRows;
    view_.main.info.firstVisibleRowIndex = ui_.infoPage.firstVisibleRowIndex;
    view_.main.info.selectedRowIndex = ui_.infoPage.selectedRowIndex;
    view_.main.info.rows[0] = {"Saved SSID", textOrDash(ui_.diagnostics.savedWifiSsid)};
    view_.main.info.rows[1] = {"WiFi Radio", ui_.diagnostics.wifiRadioAwake ? "awake" : "sleeping"};
    view_.main.info.rows[2] = {"WiFi Link", ui_.diagnostics.wifiLinkConnected ? "connected" : "disconnected"};
    view_.main.info.rows[3] = {"Active SSID", textOrDash(ui_.diagnostics.activeWifiSsid)};
    view_.main.info.rows[4] = {"Last Sync", formatEpochCompact(ui_.diagnostics.lastWeatherSyncEpoch)};
    view_.main.info.rows[5] = {"Refresh", formatUint32(ui_.diagnostics.refreshIntervalMinutes) + "m"};
    view_.main.info.rows[6] = {"Free Heap", formatUint32(ui_.diagnostics.freeHeapBytes)};
    view_.main.info.rows[7] = {"Flash Used", formatUint32(ui_.diagnostics.programFlashUsedBytes)};
    view_.main.info.rows[8] = {"Flash Total", formatUint32(ui_.diagnostics.programFlashTotalBytes)};
    view_.main.footer.shortPressLabel = "Scroll";
    view_.main.footer.longPressLabel = "Back";
    break;
```

```cpp
// src/app/AppCore.cpp - in handle()
case AppEventType::BootRequested:
  runtime_ = AppRuntimeState{};
  cache_ = AppDataCache{};
  ui_ = UiSessionState{};
  view_ = AppViewModel{};
  runtime_.mode = AppMode::Booting;
  runtime_.blockingError = BlockingErrorReason::None;
  runtime_.backgroundSyncInProgress = false;
  runtime_.lastBackgroundSyncFailed = false;
  runtime_.nextRefreshDueEpoch = 0;
  runtime_.syncPhase = SyncPhase::ConnectingWifi;
  view_.kind = ViewKind::Splash;
  view_.splash.detail = "Connecting WiFi";
  actions.push(AppActionType::RenderRequested);
  actions.pushConnectWifi(WifiConnectMode::ForegroundBlocking);
  break;

case AppEventType::RefreshDue:
  if (runtime_.mode == AppMode::Operational && !runtime_.backgroundSyncInProgress)
  {
    runtime_.backgroundSyncInProgress = true;
    runtime_.lastBackgroundSyncFailed = false;
    runtime_.syncPhase = SyncPhase::ConnectingWifi;
    runtime_.nextRefreshDueEpoch = event.epochSeconds + (config_.weatherUpdateMinutes * 60U);
    actions.push(AppActionType::WakeWifi);
    actions.pushConnectWifi(WifiConnectMode::BackgroundSilent);
  }
  break;

case AppEventType::PressStarted:
  if (runtime_.mode == AppMode::Operational)
  {
    beginHoldFeedback(event.monotonicMs);
    refreshOperationalView();
    actions.push(AppActionType::RenderRequested);
  }
  break;

case AppEventType::LongPressArmed:
  if (runtime_.mode == AppMode::Operational && ui_.holdFeedback.visible)
  {
    armHoldFeedback();
    refreshOperationalView();
    actions.push(AppActionType::RenderRequested);
  }
  break;

case AppEventType::PressReleased:
  if (runtime_.mode == AppMode::Operational && ui_.holdFeedback.visible)
  {
    clearHoldFeedback();
    refreshOperationalView();
    actions.push(AppActionType::RenderRequested);
  }
  break;

case AppEventType::ShortPressed:
  if (runtime_.mode != AppMode::Operational)
  {
    break;
  }

  clearHoldFeedback();
  if (ui_.route == UiRoute::Home)
  {
    ui_.toastVisible = true;
    ui_.toastDeadlineMs = event.monotonicMs + 1500U;
    refreshOperationalView();
    actions.push(AppActionType::RenderRequested);
  }
  else if (ui_.route == UiRoute::SettingsMenu)
  {
    ui_.selectedMenuIndex = static_cast<uint8_t>((ui_.selectedMenuIndex + 1U) % kSettingsItems.size());
    refreshOperationalView();
    actions.push(AppActionType::RenderRequested);
  }
  else if (ui_.route == UiRoute::DiagnosticsPage)
  {
    advanceInfoPage(view_.main.info.rowCount, kInfoVisibleRows);
    refreshOperationalView();
    actions.push(AppActionType::RenderRequested);
  }
  else if (ui_.route == UiRoute::BrightnessAdjustPage)
  {
    ui_.selectedBrightnessPresetIndex =
      static_cast<uint8_t>((ui_.selectedBrightnessPresetIndex + 1U) % kBrightnessPresets.size());
    refreshOperationalView();
    actions.pushValue(AppActionType::PreviewBrightness, view_.main.adjust.value);
    actions.push(AppActionType::RenderRequested);
  }
  else if (ui_.route == UiRoute::RebootConfirmMenu)
  {
    ui_.selectedMenuIndex =
      static_cast<uint8_t>((ui_.selectedMenuIndex + 1U) % kRestartConfirmItems.size());
    refreshOperationalView();
    actions.push(AppActionType::RenderRequested);
  }
  break;

case AppEventType::LongPressed:
  if (runtime_.mode != AppMode::Operational)
  {
    break;
  }

  clearHoldFeedback();
  if (ui_.route == UiRoute::Home)
  {
    openSettingsMenu();
    actions.push(AppActionType::RenderRequested);
  }
  else if (ui_.route == UiRoute::SettingsMenu)
  {
    if (ui_.selectedMenuIndex == 0)
    {
      ui_.route = UiRoute::Home;
      refreshOperationalView();
      actions.push(AppActionType::RenderRequested);
    }
    else if (ui_.selectedMenuIndex == 1)
    {
      actions.push(AppActionType::CaptureDiagnosticsSnapshot);
    }
    else if (ui_.selectedMenuIndex == 2)
    {
      ui_.route = UiRoute::BrightnessAdjustPage;
      ui_.selectedBrightnessPresetIndex = nearestBrightnessPresetIndex(config_.lcdBrightness);
      clearToast();
      refreshOperationalView();
      actions.push(AppActionType::RenderRequested);
    }
    else if (ui_.selectedMenuIndex == 3)
    {
      openRebootConfirmMenu();
      actions.push(AppActionType::RenderRequested);
    }
  }
  else if (ui_.route == UiRoute::BrightnessAdjustPage)
  {
    config_.lcdBrightness = kBrightnessPresets[ui_.selectedBrightnessPresetIndex];
    actions.pushValue(AppActionType::ApplyBrightness, config_.lcdBrightness);
    openSettingsMenu();
    actions.push(AppActionType::RenderRequested);
  }
  else if (ui_.route == UiRoute::DiagnosticsPage)
  {
    openSettingsMenu();
    actions.push(AppActionType::RenderRequested);
  }
  else if (ui_.route == UiRoute::RebootConfirmMenu)
  {
    if (ui_.selectedMenuIndex == 0)
    {
      openSettingsMenu();
      actions.push(AppActionType::RenderRequested);
    }
    else
    {
      actions.push(AppActionType::RestartDevice);
    }
  }
  break;

case AppEventType::DiagnosticsSnapshotCaptured:
  ui_.diagnostics = event.diagnostics;
  ui_.route = UiRoute::DiagnosticsPage;
  resetInfoPage();
  refreshOperationalView();
  actions.push(AppActionType::RenderRequested);
  break;
```

- [ ] **Step 4: Run the host suite to verify the reducer behavior passes**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: PASS for the new reducer tests, with any remaining failures limited to driver / network interfaces still using `value` instead of `payload` or `connect(config)` instead of `connect(config, mode)`.

- [ ] **Step 5: Commit the reducer changes**

```bash
git add src/app/AppCore.h src/app/AppCore.cpp test/test_native_app_core/test_operational_flow.cpp test/test_native_app_core/test_settings_navigation.cpp test/test_native_app_core/test_diagnostics_capture.cpp
git commit -m "refactor: refresh settings reducer semantics"
```

---

### Task 3: Thread WiFi Mode And Rich Diagnostics Through Driver And ESP Adapters

**Files:**
- Modify: `src/ports/NetworkPort.h`
- Modify: `src/ports/SystemStatusPort.h`
- Modify: `src/app/AppDriver.cpp`
- Modify: `src/adapters/Esp8266NetworkPort.h`
- Modify: `src/adapters/Esp8266NetworkPort.cpp`
- Modify: `src/adapters/Esp8266SystemStatusPort.h`
- Modify: `src/adapters/Esp8266SystemStatusPort.cpp`
- Modify: `src/Net.h`
- Modify: `src/Net.cpp`
- Test: `test/test_native_app_core/test_driver_mapping.cpp`
- Test: `test/test_native_app_core/test_driver_dispatch.cpp`
- Test: `test/test_native_app_core/test_diagnostics_capture.cpp`

- [ ] **Step 1: Write the failing driver and adapter-facing tests for connect mode and richer diagnostics**

```cpp
// test/test_native_app_core/test_driver_mapping.cpp
struct FakeNetworkPort : ports::NetworkPort
{
  bool connectCalled = false;
  app::WifiConnectMode lastMode = app::WifiConnectMode::ForegroundBlocking;

  void wake() override {}
  void sleep() override {}

  bool connect(app::AppConfigData &, app::WifiConnectMode mode) override
  {
    connectCalled = true;
    lastMode = mode;
    return true;
  }

  void restart() override {}
  void resetAndRestart() override {}
};

TEST_CASE("driver execute forwards wifi connect mode through the port")
{
  FakeDisplayPort display;
  FakeNetworkPort network;
  NullStoragePort storage;
  NullWeatherPort weather;
  NullTimeSyncPort timeSync;
  NullSensorPort sensor;
  NullSystemStatusPort systemStatus;
  ports::ClockPort *clock = nullptr;

  app::AppDriver driver(storage, network, weather, timeSync, sensor, systemStatus, display, clock);
  app::ActionList actions;
  actions.pushConnectWifi(app::WifiConnectMode::BackgroundSilent);

  app::AppConfigData config;
  app::AppViewModel view;
  driver.execute(actions, config, view);

  CHECK(network.connectCalled == true);
  CHECK(network.lastMode == app::WifiConnectMode::BackgroundSilent);
}
```

```cpp
// test/test_native_app_core/test_diagnostics_capture.cpp
struct FakeSystemStatusPort : ports::SystemStatusPort
{
  app::DiagnosticsSnapshot capture(const app::AppConfigData &config,
                                   const app::AppRuntimeState &runtime) const override
  {
    app::DiagnosticsSnapshot snapshot;
    snapshot.valid = true;
    snapshot.savedWifiSsid = config.wifiSsid;
    snapshot.activeWifiSsid = runtime.backgroundSyncInProgress ? "BackgroundSSID" : "-";
    snapshot.wifiLinkConnected = runtime.backgroundSyncInProgress;
    snapshot.wifiRadioAwake = runtime.backgroundSyncInProgress;
    snapshot.lastWeatherSyncEpoch = runtime.lastWeatherSyncEpoch;
    snapshot.refreshIntervalMinutes = config.weatherUpdateMinutes;
    snapshot.freeHeapBytes = 1111;
    snapshot.programFlashUsedBytes = 2222;
    snapshot.programFlashTotalBytes = 3333;
    return snapshot;
  }
};

TEST_CASE("driver dispatch captures diagnostics with config and runtime context")
{
  FakeDisplayPort display;
  FakeNetworkPort network;
  NullStoragePort storage;
  NullWeatherPort weather;
  NullTimeSyncPort timeSync;
  NullSensorPort sensor;
  FakeSystemStatusPort systemStatus;
  app::AppCore core = diagnosticsCore();
  core.configMutable().wifiSsid = "StudioWiFi";
  core.configMutable().weatherUpdateMinutes = 15;
  app::AppDriver driver(storage, network, weather, timeSync, sensor, systemStatus, display, nullptr);

  app::ActionList diagnostics;
  diagnostics.push(app::AppActionType::CaptureDiagnosticsSnapshot);
  driver.dispatch(core, diagnostics);

  CHECK(core.ui().route == app::UiRoute::DiagnosticsPage);
  CHECK(core.view().main.info.rows[0].value == "StudioWiFi");
  CHECK(core.view().main.info.rows[5].value == "15m");
}
```

```cpp
// test/test_native_app_core/test_driver_dispatch.cpp
struct DispatchNetworkPort : ports::NetworkPort
{
  app::WifiConnectMode lastMode = app::WifiConnectMode::ForegroundBlocking;

  bool connect(app::AppConfigData &, app::WifiConnectMode mode) override
  {
    lastMode = mode;
    return true;
  }

  void wake() override {}
  void sleep() override {}
  void restart() override {}
  void resetAndRestart() override {}
};

TEST_CASE("driver dispatch keeps bootstrap foreground connect mode")
{
  DispatchStoragePort storage;
  DispatchNetworkPort network;
  DispatchWeatherPort weather;
  DispatchTimeSyncPort timeSync;
  DispatchSensorPort sensor;
  NullSystemStatusPort systemStatus;
  DispatchDisplayPort display;

  app::AppCore core;
  app::AppDriver driver(storage, network, weather, timeSync, sensor, systemStatus, display, nullptr);

  driver.dispatch(core, core.handle(app::AppEvent::bootRequested()));

  CHECK(network.lastMode == app::WifiConnectMode::ForegroundBlocking);
}
```

- [ ] **Step 2: Run the host suite to verify the port signatures are still outdated**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: FAIL with errors such as `no matching function for call to connect(app::AppConfigData&, app::WifiConnectMode)` and `FakeSystemStatusPort::capture marked override but does not override`.

- [ ] **Step 3: Implement the new port signatures, driver plumbing, and silent connect path**

```cpp
// src/ports/NetworkPort.h
class NetworkPort
{
public:
  virtual ~NetworkPort() {}
  virtual void wake() = 0;
  virtual void sleep() = 0;
  virtual bool connect(app::AppConfigData &config, app::WifiConnectMode mode) = 0;
  virtual void restart() = 0;
  virtual void resetAndRestart() = 0;
};
```

```cpp
// src/ports/SystemStatusPort.h
#include "app/AppConfigData.h"
#include "app/AppRuntimeState.h"

class SystemStatusPort
{
public:
  virtual ~SystemStatusPort() {}
  virtual app::DiagnosticsSnapshot capture(const app::AppConfigData &config,
                                           const app::AppRuntimeState &runtime) const = 0;
};
```

```cpp
// src/app/AppDriver.cpp
void AppDriver::appendActions(ActionList &target, const ActionList &source)
{
  for (std::size_t index = 0; index < source.count; ++index)
  {
    switch (source[index].type)
    {
      case AppActionType::ConnectWifi:
        target.pushConnectWifi(source[index].payload.mode);
        break;

      case AppActionType::PreviewBrightness:
      case AppActionType::ApplyBrightness:
        target.pushValue(source[index].type, source[index].payload.value);
        break;

      default:
        target.push(source[index].type);
        break;
    }
  }
}

case AppActionType::ConnectWifi:
  if (network_.connect(core.configMutable(), pending[index].payload.mode))
  {
    storage_.save(core.config());
    appendActions(next, core.handle(AppEvent::wifiConnected()));
  }
  else
  {
    appendActions(next, core.handle(AppEvent::wifiConnectionFailed()));
  }
  break;

case AppActionType::CaptureDiagnosticsSnapshot:
  appendActions(next,
                core.handle(AppEvent::diagnosticsSnapshotCaptured(
                  systemStatus_.capture(core.config(), core.runtime()))));
  break;

case AppActionType::PreviewBrightness:
  display_.setBrightness(static_cast<uint8_t>(pending[index].payload.value));
  break;

case AppActionType::ApplyBrightness:
  display_.setBrightness(static_cast<uint8_t>(pending[index].payload.value));
  storage_.save(core.config());
  break;
```

```cpp
// src/Net.h
#include "app/AppAction.h"

namespace net
{

bool connect(app::AppConfigData &config, app::WifiConnectMode mode);
bool isWifiAwake();
void sleep();
void wake();
void restart();
void resetAndRestart();

} // namespace net
```

```cpp
// src/Net.cpp
bool connect(app::AppConfigData &config, app::WifiConnectMode mode)
{
  const bool blockingUi = (mode == app::WifiConnectMode::ForegroundBlocking);

  WiFi.begin(config.wifiSsid.c_str(), config.wifiPsk.c_str());

  const uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 12000U)
  {
    if (blockingUi)
    {
      display::drawLoading(30, 1);
    }
    else
    {
      delay(30);
    }
  }

  if (WiFi.status() != WL_CONNECTED)
  {
#if WM_EN
    if (!blockingUi)
    {
      return false;
    }
    runWebConfig(config);
#else
    if (!blockingUi)
    {
      return false;
    }
    runSmartConfig();
#endif
  }

  if (blockingUi && WiFi.status() != WL_CONNECTED)
  {
    loadingUntilConnected();
  }

  if (WiFi.status() == WL_CONNECTED)
  {
    config.wifiSsid = WiFi.SSID().c_str();
    config.wifiPsk = WiFi.psk().c_str();
    storage::saveConfig(config);
    display::setRotation(config.lcdRotation);
    display::setBrightness(config.lcdBrightness);
    return true;
  }

  return false;
}

bool isWifiAwake()
{
  return s_wifiAwake;
}
```

```cpp
// src/adapters/Esp8266SystemStatusPort.cpp
#include "Net.h"

app::DiagnosticsSnapshot Esp8266SystemStatusPort::capture(const app::AppConfigData &config,
                                                          const app::AppRuntimeState &runtime) const
{
  app::DiagnosticsSnapshot snapshot;
  snapshot.valid = true;
  snapshot.freeHeapBytes = ESP.getFreeHeap();
  snapshot.programFlashUsedBytes = ESP.getSketchSize();
  snapshot.programFlashTotalBytes = ESP.getSketchSize() + ESP.getFreeSketchSpace();
  snapshot.savedWifiSsid = config.wifiSsid;
  snapshot.wifiLinkConnected = (WiFi.status() == WL_CONNECTED);
  snapshot.activeWifiSsid = snapshot.wifiLinkConnected ? WiFi.SSID().c_str() : "-";
  snapshot.wifiRadioAwake = net::isWifiAwake();
  snapshot.lastWeatherSyncEpoch = runtime.lastWeatherSyncEpoch;
  snapshot.refreshIntervalMinutes = config.weatherUpdateMinutes;
  return snapshot;
}
```

- [ ] **Step 4: Run host tests and the embedded build to verify interface alignment**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: PASS for the driver and diagnostics tests.

Run: `~/.platformio/penv/bin/pio run -e esp12e`

Expected: PASS with no signature mismatches in `Esp8266NetworkPort`, `Esp8266SystemStatusPort`, or `Net.cpp`.

- [ ] **Step 5: Commit the WiFi-mode and diagnostics plumbing**

```bash
git add src/ports/NetworkPort.h src/ports/SystemStatusPort.h src/app/AppDriver.cpp src/adapters/Esp8266NetworkPort.h src/adapters/Esp8266NetworkPort.cpp src/adapters/Esp8266SystemStatusPort.h src/adapters/Esp8266SystemStatusPort.cpp src/Net.h src/Net.cpp test/test_native_app_core/test_driver_mapping.cpp test/test_native_app_core/test_driver_dispatch.cpp test/test_native_app_core/test_diagnostics_capture.cpp
git commit -m "refactor: decouple wifi connect modes from ui"
```

---

### Task 4: Queue Input Lifecycle Events And Render Transient Hold Feedback

**Files:**
- Modify: `src/AppConfig.h`
- Modify: `src/Input.h`
- Modify: `src/Input.cpp`
- Modify: `src/main.cpp`
- Modify: `src/ui/TftDisplayPort.h`
- Modify: `src/ui/TftDisplayPort.cpp`
- Modify: `src/Screen.h`
- Modify: `src/Screen.cpp`

- [ ] **Step 1: Run the embedded build to surface the current input and display limitations**

Run: `~/.platformio/penv/bin/pio run -e esp12e`

Expected: PASS before this task, confirming the baseline. The goal of this step is to capture a clean compile before changing `Input`, `main.cpp`, and `Screen`.

- [ ] **Step 2: Implement queued button lifecycle events plus a transient hold-feedback tick**

```cpp
// src/AppConfig.h
namespace app_config
{

constexpr uint32_t kButtonLongPressMs = 200;
constexpr uint32_t kHoldFeedbackRefreshMs = 16;

} // namespace app_config
```

```cpp
// src/Input.h
namespace input
{

enum class ButtonEvent
{
  None,
  PressStarted,
  LongPressArmed,
  PressReleased,
  ShortPress,
  LongPress,
};

void begin();
void tick();
bool pollEvent(ButtonEvent &event);

} // namespace input
```

```cpp
// src/Input.cpp
namespace
{

Button2 s_button(app_config::kPinButton);
std::array<input::ButtonEvent, 8> s_queue{};
std::size_t s_head = 0;
std::size_t s_tail = 0;

void pushEvent(input::ButtonEvent event)
{
  const std::size_t next = (s_head + 1U) % s_queue.size();
  if (next == s_tail)
  {
    return;
  }
  s_queue[s_head] = event;
  s_head = next;
}

void onPressed(Button2 &)
{
  pushEvent(input::ButtonEvent::PressStarted);
}

void onReleased(Button2 &)
{
  pushEvent(input::ButtonEvent::PressReleased);
}

void onClick(Button2 &)
{
  pushEvent(input::ButtonEvent::ShortPress);
}

void onLongDetected(Button2 &)
{
  pushEvent(input::ButtonEvent::LongPressArmed);
}

void onLongClick(Button2 &)
{
  pushEvent(input::ButtonEvent::LongPress);
}

} // namespace

void begin()
{
  s_button.setLongClickTime(app_config::kButtonLongPressMs);
  s_button.setPressedHandler(onPressed);
  s_button.setReleasedHandler(onReleased);
  s_button.setClickHandler(onClick);
  s_button.setLongClickDetectedHandler(onLongDetected);
  s_button.setLongClickHandler(onLongClick);
}

bool pollEvent(ButtonEvent &event)
{
  if (s_head == s_tail)
  {
    event = ButtonEvent::None;
    return false;
  }

  event = s_queue[s_tail];
  s_tail = (s_tail + 1U) % s_queue.size();
  return true;
}
```

```cpp
// src/ui/TftDisplayPort.h
class TftDisplayPort : public ports::DisplayPort
{
public:
  void begin(uint8_t rotation, uint8_t brightness);
  void setBrightness(uint8_t brightness) override;
  void setRotation(uint8_t rotation);
  void tickClock();
  void tickBanner();
  void tickTransientUi(const app::AppViewModel &view, uint32_t nowMs);
  void render(const app::AppViewModel &view) override;
};
```

```cpp
// src/ui/TftDisplayPort.cpp
void TftDisplayPort::tickTransientUi(const app::AppViewModel &view, uint32_t nowMs)
{
  if (view.kind != app::ViewKind::Main)
  {
    return;
  }

  screen::refreshHoldFeedback(view.main.holdFeedback, nowMs);
}
```

```cpp
// src/Screen.h
void refreshHoldFeedback(const app::HoldFeedbackViewData &hold, uint32_t nowMs);
```

```cpp
// src/main.cpp
uint32_t g_lastHoldFeedbackTickMs = 0;

void loop()
{
  input::tick();
  const uint32_t nowMs = millis();

  input::ButtonEvent inputEvent;
  while (input::pollEvent(inputEvent))
  {
    switch (inputEvent)
    {
      case input::ButtonEvent::PressStarted:
        dispatch(g_core.handle(app::AppEvent::pressStarted(nowMs)));
        break;

      case input::ButtonEvent::LongPressArmed:
        dispatch(g_core.handle(app::AppEvent::longPressArmed(nowMs)));
        break;

      case input::ButtonEvent::PressReleased:
        dispatch(g_core.handle(app::AppEvent::pressReleased(nowMs)));
        break;

      case input::ButtonEvent::ShortPress:
        dispatch(g_core.handle(app::AppEvent::shortPressed(nowMs)));
        break;

      case input::ButtonEvent::LongPress:
        dispatch(g_core.handle(app::AppEvent::longPressed(nowMs)));
        break;

      case input::ButtonEvent::None:
        break;
    }
  }

  if (nowMs - g_lastHoldFeedbackTickMs >= app_config::kHoldFeedbackRefreshMs)
  {
    g_lastHoldFeedbackTickMs = nowMs;
    g_display.tickTransientUi(g_core.view(), nowMs);
  }

  animate::setHomeActive(g_core.view().kind == app::ViewKind::Main &&
                         g_core.view().main.homeAnimationEnabled);
  animate::tick();

  if (g_core.ui().toastVisible && nowMs >= g_core.ui().toastDeadlineMs)
  {
    dispatch(g_core.handle(app::AppEvent::toastExpired()));
  }

  cli::Command command;
  if (cli::poll(command))
  {
    applyCliCommand(command);
  }

  if (nowMs - g_lastSecondTickMs >= app_config::kTickMs)
  {
    g_lastSecondTickMs = nowMs;
    g_display.tickClock();
  }

  if (nowMs - g_lastBannerTickMs >= app_config::kBannerRefreshMs)
  {
    g_lastBannerTickMs = nowMs;
    g_display.tickBanner();
  }

  const uint32_t nowEpoch = static_cast<uint32_t>(now());
  if (g_core.runtime().mode == app::AppMode::Operational &&
      !g_core.runtime().backgroundSyncInProgress &&
      g_core.runtime().nextRefreshDueEpoch > 0 &&
      nowEpoch >= g_core.runtime().nextRefreshDueEpoch)
  {
    dispatch(g_core.handle(app::AppEvent::refreshDue(nowEpoch)));
  }
}
```

```cpp
// src/Screen.cpp
namespace
{

constexpr int kHoldLineX = 14;
constexpr int kHoldLineY = 4;
constexpr int kHoldLineWidth = 212;
constexpr int kHoldLineHeight = 3;
int s_lastHoldFillWidth = -1;
bool s_holdVisible = false;
bool s_holdArmed = false;

void clearHoldLine()
{
  display::tft.fillRect(kHoldLineX, kHoldLineY, kHoldLineWidth, kHoldLineHeight, app_config::kColorBg);
  s_lastHoldFillWidth = -1;
  s_holdVisible = false;
  s_holdArmed = false;
}

void drawHoldLine(const app::HoldFeedbackViewData &hold, uint32_t nowMs)
{
  if (!hold.visible)
  {
    clearHoldLine();
    return;
  }

  const uint32_t elapsedMs = nowMs > hold.pressStartedMs ? (nowMs - hold.pressStartedMs) : 0U;
  const uint8_t progressPercent = hold.armed
                                    ? 100
                                    : static_cast<uint8_t>(std::min<uint32_t>(
                                        100U,
                                        (elapsedMs * 100U) / app_config::kButtonLongPressMs));
  const int fillWidth = (kHoldLineWidth * progressPercent) / 100;
  if (s_holdVisible && fillWidth == s_lastHoldFillWidth && hold.armed == s_holdArmed)
  {
    return;
  }

  display::tft.fillRect(kHoldLineX, kHoldLineY, kHoldLineWidth, kHoldLineHeight, app_config::kColorBg);
  display::tft.drawFastHLine(kHoldLineX, kHoldLineY + 1, kHoldLineWidth, TFT_DARKGREY);
  if (fillWidth > 0)
  {
    const uint16_t color = hold.armed ? TFT_YELLOW : TFT_WHITE;
    display::tft.fillRect(kHoldLineX, kHoldLineY, fillWidth, kHoldLineHeight, color);
  }

  s_holdVisible = true;
  s_holdArmed = hold.armed;
  s_lastHoldFillWidth = fillWidth;
}

} // namespace

void refreshHoldFeedback(const app::HoldFeedbackViewData &hold, uint32_t nowMs)
{
  drawHoldLine(hold, nowMs);
}
```

- [ ] **Step 3: Run the embedded build to verify the new input and transient UI path compiles**

Run: `~/.platformio/penv/bin/pio run -e esp12e`

Expected: PASS with `Input`, `main.cpp`, `TftDisplayPort`, and `Screen` compiling against the new queue / tick interfaces.

- [ ] **Step 4: Commit the input and hold-feedback plumbing**

```bash
git add src/AppConfig.h src/Input.h src/Input.cpp src/main.cpp src/ui/TftDisplayPort.h src/ui/TftDisplayPort.cpp src/Screen.h src/Screen.cpp
git commit -m "feat: add queued button lifecycle feedback"
```

---

### Task 5: Scope Animation To Home, Finish Screen Rendering, Update Docs, And Verify End To End

**Files:**
- Modify: `src/Animate/Animate.h`
- Modify: `src/Animate/Animate.cpp`
- Modify: `src/Screen.cpp`
- Modify: `README.md`
- Test: `test/test_native_app_core/test_operational_flow.cpp`
- Test: `test/test_native_app_core/test_settings_navigation.cpp`

- [ ] **Step 1: Finalize animation scoping and info-page rendering polish**

```cpp
// src/Animate/Animate.h
namespace animate
{

void setDhtEnabled(bool enabled);
void setHomeActive(bool active);
void tick();
bool enabled();

} // namespace animate
```

```cpp
// src/Animate/Animate.cpp
#include "Display.h"

namespace
{
bool s_dhtEnabled = false;
bool s_homeActive = false;
constexpr int kAnimX = 160;
constexpr int kAnimY = 160;
constexpr int kAnimWidth = 80;
constexpr int kAnimHeight = 80;

void clearAnimationRegion()
{
  display::tft.fillRect(kAnimX, kAnimY, kAnimWidth, kAnimHeight, app_config::kColorBg);
}
}

void setHomeActive(bool active)
{
  if (s_homeActive == active)
  {
    return;
  }

  s_homeActive = active;
  if (!s_homeActive)
  {
#if ANIMATE_CHOICE != 0
    s_frame = -1;
#endif
    clearAnimationRegion();
  }
}

bool enabled()
{
#if ANIMATE_CHOICE == 0
  return false;
#else
  return s_homeActive && !s_dhtEnabled;
#endif
}
```

```cpp
// src/Screen.cpp - update info page renderer to use the scroll window and focus row
void drawInfoPage(const app::InfoBodyData &info, const app::FooterHints &footer)
{
  drawPageChrome(info.title, info.subtitle, footer);

  for (std::size_t visibleIndex = 0; visibleIndex < info.visibleRowCount; ++visibleIndex)
  {
    const std::size_t rowIndex = info.firstVisibleRowIndex + visibleIndex;
    if (rowIndex >= info.rowCount)
    {
      break;
    }

    const int y = 76 + static_cast<int>(visibleIndex) * 44;
    const bool selected = (rowIndex == info.selectedRowIndex);
    const uint16_t fillColor = selected ? TFT_DARKGREY : app_config::kColorBg;
    const uint16_t borderColor = selected ? TFT_YELLOW : TFT_DARKGREY;
    const uint16_t valueColor = selected ? TFT_WHITE : TFT_YELLOW;

    display::tft.fillRoundRect(14, y - 8, 212, 34, 6, fillColor);
    display::tft.drawRoundRect(14, y - 8, 212, 34, 6, borderColor);
    display::tft.setTextDatum(TL_DATUM);
    display::tft.setTextColor(TFT_WHITE, fillColor);
    display::tft.drawString(info.rows[rowIndex].label.c_str(), 20, y, 2);
    display::tft.setTextDatum(TR_DATUM);
    display::tft.setTextColor(valueColor, fillColor);
    display::tft.drawString(info.rows[rowIndex].value.c_str(), 220, y, 2);
  }
}

void drawMainPage(const app::MainViewData &view)
{
  if (view.pageKind == app::OperationalPageKind::Home)
  {
    s_mainPageActive = true;
    display::clear();
    display::drawTempHumidityIcons();
    copyBannerLines(view.bannerLines);
    drawWeatherMain(view);
    if (view.showIndoorClimate)
    {
      drawIndoorClimate(view.indoorTemperatureC, view.indoorHumidityPercent);
    }
    forceClockRedraw();
    refreshBanner();
    drawToast(view.toast);
    refreshHoldFeedback(view.holdFeedback, millis());
    return;
  }

  s_mainPageActive = false;
  switch (view.pageKind)
  {
    case app::OperationalPageKind::Menu:
      drawMenuPage(view.menu, view.footer);
      break;
    case app::OperationalPageKind::Info:
      drawInfoPage(view.info, view.footer);
      break;
    case app::OperationalPageKind::Adjust:
      drawAdjustPage(view.adjust, view.footer);
      break;
    case app::OperationalPageKind::Home:
      break;
  }

  refreshHoldFeedback(view.holdFeedback, millis());
}
```

```markdown
<!-- README.md -->
## Button Controls

- 首页：短按显示调试气泡，长按进入设置；右下角动图仅在首页播放
- 菜单页：短按切到下一项，长按进入或执行当前项
- 内容页：短按向下浏览内容，长按返回上一层
- 亮度页：短按预览下一档亮度，长按保存并返回
- 后台天气刷新：静默联网，不再弹出全屏 WiFi 进度页，也不会自动抢占当前页面
```

- [ ] **Step 2: Run the full host suite**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: PASS across the existing suite, including new assertions for `homeAnimationEnabled`, diagnostics scrolling, and hold-feedback state.

- [ ] **Step 3: Run the embedded build**

Run: `~/.platformio/penv/bin/pio run -e esp12e`

Expected: PASS with `Animate`, `Screen`, `Input`, `Net`, and `main.cpp` linked together.

- [ ] **Step 4: Perform the device smoke checklist before final commit**

Run on hardware:

```text
1. Boot normally and wait past one refresh interval: no full-screen WiFi progress page should appear.
2. From Home, long press into Settings: right-bottom animation must stop immediately.
3. Enter Diagnostics: footer shows Tap/Scroll + Hold/Back, short presses scroll the focus, long press returns.
4. Diagnostics rows show Saved SSID, WiFi Radio, WiFi Link, Active SSID, Last Sync, Refresh, Free Heap, Flash Used, Flash Total.
5. Hold the touch button on Home and on a settings page: the top progress line grows left-to-right, reaches full width at long-press threshold, and disappears on release.
```

Expected: All five checks pass on the flashed ESP-12E device.

- [ ] **Step 5: Commit the rendering, animation, and documentation updates**

```bash
git add src/Animate/Animate.h src/Animate/Animate.cpp src/Screen.cpp README.md
git commit -m "feat: polish settings ux feedback and silent refresh"
```
