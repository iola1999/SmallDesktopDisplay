# Settings Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-button settings/navigation framework for the ESP-12E firmware so short/long press behavior becomes consistent, testable, and extensible while supporting a home toast, diagnostics page, brightness adjustment, and reboot confirmation.

**Architecture:** Keep startup/background-sync lifecycle in `AppCore`, but add a nested operational UI session state that owns page routing, menu selection, toast lifetime, and brightness editing. Extend `AppDriver` with diagnostics capture, brightness preview/apply, and restart dispatch, then render everything through a shared `Screen` page chrome instead of page-specific ad hoc logic.

**Tech Stack:** PlatformIO (`esp12e` + `host`), doctest, Arduino framework, Button2, TFT_eSPI, ESP8266 core APIs, existing `AppCore`/`AppDriver`/`ports` architecture

---

## Planned File Structure

- Create: `src/app/DiagnosticsSnapshot.h`
- Create: `src/app/UiSessionState.h`
- Create: `src/ports/SystemStatusPort.h`
- Create: `src/adapters/Esp8266SystemStatusPort.h`
- Create: `src/adapters/Esp8266SystemStatusPort.cpp`
- Create: `test/test_native_app_core/test_settings_model_defaults.cpp`
- Create: `test/test_native_app_core/test_settings_navigation.cpp`
- Create: `test/test_native_app_core/test_brightness_adjust.cpp`
- Create: `test/test_native_app_core/test_diagnostics_capture.cpp`
- Modify: `src/app/AppViewModel.h`
- Modify: `src/app/AppEvent.h`
- Modify: `src/app/AppAction.h`
- Modify: `src/app/AppCore.h`
- Modify: `src/app/AppCore.cpp`
- Modify: `src/app/AppDriver.h`
- Modify: `src/app/AppDriver.cpp`
- Modify: `src/ports/DisplayPort.h`
- Modify: `src/ports/NetworkPort.h`
- Modify: `src/ui/TftDisplayPort.h`
- Modify: `src/ui/TftDisplayPort.cpp`
- Modify: `src/Screen.h`
- Modify: `src/Screen.cpp`
- Modify: `src/main.cpp`
- Modify: `README.md`
- Modify: `test/test_native_app_core/test_driver_dispatch.cpp`
- Modify: `test/test_native_app_core/test_driver_mapping.cpp`

### Responsibility Map

- `src/app/DiagnosticsSnapshot.h`: Pure-C++ diagnostics data captured when entering the info page.
- `src/app/UiSessionState.h`: Operational UI route/menu/brightness/toast session state.
- `src/app/AppViewModel.h`: Shared page chrome plus menu/info/adjust body models.
- `src/app/AppCore.*`: Button-event reducer, page routing, toast timeout, diagnostics and brightness flows.
- `src/ports/SystemStatusPort.h`: Platform status snapshot interface.
- `src/app/AppDriver.*`: Executes new actions, captures diagnostics, previews/applies brightness, restarts device.
- `src/Screen.*` and `src/ui/TftDisplayPort.*`: Shared page chrome, toast overlay, menu/info/adjust rendering.
- `src/main.cpp`: Translate button events into `AppEvent`s and expire toast on a monotonic timer.
- `test/test_native_app_core/*`: Host-side doctest coverage for navigation and action generation.

### Build Strategy

- Keep all navigation logic in `src/app` so `pio test -e host -f test_native_app_core` remains the primary fast feedback loop.
- Only add Arduino/ESP-specific APIs under `src/adapters`, `src/ui`, or `src/main.cpp`.
- Verify embedded compatibility with `~/.platformio/penv/bin/pio run -e esp12e` after any task that changes `ports`, adapters, rendering, or the main loop.

---

### Task 1: UI Session Models And ViewModel Shell

**Files:**
- Create: `src/app/DiagnosticsSnapshot.h`
- Create: `src/app/UiSessionState.h`
- Modify: `src/app/AppViewModel.h`
- Test: `test/test_native_app_core/test_settings_model_defaults.cpp`

- [ ] **Step 1: Write the failing defaults test for settings/navigation models**

```cpp
// test/test_native_app_core/test_settings_model_defaults.cpp
#include <doctest.h>

#include "app/AppViewModel.h"
#include "app/UiSessionState.h"

TEST_CASE("ui session defaults to home route with no toast")
{
  app::UiSessionState ui;
  app::AppViewModel view;

  CHECK(ui.route == app::UiRoute::Home);
  CHECK(ui.selectedMenuIndex == 0);
  CHECK(ui.selectedBrightnessPresetIndex == 0);
  CHECK(ui.toastVisible == false);
  CHECK(ui.toastDeadlineMs == 0);
  CHECK(ui.diagnostics.valid == false);

  CHECK(view.main.pageKind == app::OperationalPageKind::Home);
  CHECK(view.main.footer.shortPressLabel == "");
  CHECK(view.main.footer.longPressLabel == "");
  CHECK(view.main.toast.visible == false);
  CHECK(view.main.menu.itemCount == 0);
  CHECK(view.main.info.rowCount == 0);
  CHECK(view.main.adjust.value == 0);
}
```

- [ ] **Step 2: Run the host tests to verify they fail**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: FAIL with errors such as `app/UiSessionState.h: No such file or directory` and missing `pageKind` / `footer` / `toast` fields in `AppViewModel`.

- [ ] **Step 3: Write the minimal pure-C++ settings models and shared page shell**

```cpp
// src/app/DiagnosticsSnapshot.h
#ifndef APP_DIAGNOSTICS_SNAPSHOT_H
#define APP_DIAGNOSTICS_SNAPSHOT_H

#include <cstdint>
#include <string>

namespace app
{

struct DiagnosticsSnapshot
{
  bool valid = false;
  uint32_t freeHeapBytes = 0;
  uint32_t programFlashUsedBytes = 0;
  uint32_t programFlashTotalBytes = 0;
  std::string wifiSsid;
  bool wifiConnected = false;
};

} // namespace app

#endif // APP_DIAGNOSTICS_SNAPSHOT_H
```

```cpp
// src/app/UiSessionState.h
#ifndef APP_UI_SESSION_STATE_H
#define APP_UI_SESSION_STATE_H

#include "DiagnosticsSnapshot.h"

#include <cstdint>

namespace app
{

enum class UiRoute
{
  Home,
  SettingsMenu,
  DiagnosticsPage,
  BrightnessAdjustPage,
  RebootConfirmMenu,
};

struct UiSessionState
{
  UiRoute route = UiRoute::Home;
  uint8_t selectedMenuIndex = 0;
  uint8_t selectedBrightnessPresetIndex = 0;
  bool toastVisible = false;
  uint32_t toastDeadlineMs = 0;
  DiagnosticsSnapshot diagnostics;
};

} // namespace app

#endif // APP_UI_SESSION_STATE_H
```

```cpp
// src/app/AppViewModel.h - extend MainViewData with a shared page shell
enum class OperationalPageKind
{
  Home,
  Menu,
  Info,
  Adjust,
};

struct FooterHints
{
  std::string shortPressLabel;
  std::string longPressLabel;
};

struct ToastData
{
  bool visible = false;
  std::string text;
};

struct MenuItemData
{
  std::string label;
  bool selected = false;
};

struct MenuBodyData
{
  std::string title;
  std::string subtitle;
  std::array<MenuItemData, 4> items{};
  size_t itemCount = 0;
};

struct InfoRowData
{
  std::string label;
  std::string value;
};

struct InfoBodyData
{
  std::string title;
  std::string subtitle;
  std::array<InfoRowData, 4> rows{};
  size_t rowCount = 0;
};

struct AdjustBodyData
{
  std::string title;
  std::string subtitle;
  int value = 0;
  int minValue = 0;
  int maxValue = 100;
  std::string unit = "%";
};

struct MainViewData
{
  OperationalPageKind pageKind = OperationalPageKind::Home;
  FooterHints footer;
  ToastData toast;
  MenuBodyData menu;
  InfoBodyData info;
  AdjustBodyData adjust;

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

- [ ] **Step 4: Run the host tests to verify they pass**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: PASS with the new `test_settings_model_defaults.cpp` plus all existing host tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/DiagnosticsSnapshot.h src/app/UiSessionState.h src/app/AppViewModel.h test/test_native_app_core/test_settings_model_defaults.cpp
git commit -m "test: add settings ui model scaffold"
```

### Task 2: Button Navigation, Toast, And Reboot Confirmation In AppCore

**Files:**
- Modify: `src/app/AppEvent.h`
- Modify: `src/app/AppAction.h`
- Modify: `src/app/AppCore.h`
- Modify: `src/app/AppCore.cpp`
- Test: `test/test_native_app_core/test_settings_navigation.cpp`

- [ ] **Step 1: Write the failing navigation tests**

```cpp
// test/test_native_app_core/test_settings_navigation.cpp
#include <doctest.h>

#include "app/AppCore.h"

namespace
{

app::AppCore operationalCore()
{
  app::AppCore core;
  core.handle(app::AppEvent::bootRequested());
  core.handle(app::AppEvent::wifiConnected());
  core.handle(app::AppEvent::timeSynced(1710000000));

  app::WeatherSnapshot weather;
  weather.valid = true;
  weather.cityName = "Shijiazhuang";
  weather.temperatureText = "26";
  weather.humidityText = "40%";
  weather.temperatureC = 26;
  weather.humidityPercent = 40;
  weather.aqi = 42;
  weather.weatherCode = 1;
  weather.bannerLines[0] = "Realtime weather clear";

  core.handle(app::AppEvent::weatherFetched(weather, 1710000000));
  return core;
}

} // namespace

TEST_CASE("short press on home only shows a debug toast")
{
  auto core = operationalCore();
  const auto actions = core.handle(app::AppEvent::shortPressed(5000));

  CHECK(actions.count == 1);
  CHECK(actions[0].type == app::AppActionType::RenderRequested);
  CHECK(core.ui().route == app::UiRoute::Home);
  CHECK(core.ui().toastVisible == true);
  CHECK(core.view().main.pageKind == app::OperationalPageKind::Home);
  CHECK(core.view().main.toast.visible == true);
}

TEST_CASE("long press on home opens the settings menu")
{
  auto core = operationalCore();
  const auto actions = core.handle(app::AppEvent::longPressed(5000));

  CHECK(actions.count == 1);
  CHECK(actions[0].type == app::AppActionType::RenderRequested);
  CHECK(core.ui().route == app::UiRoute::SettingsMenu);
  CHECK(core.view().main.pageKind == app::OperationalPageKind::Menu);
  CHECK(core.view().main.menu.itemCount == 4);
  CHECK(core.view().main.menu.items[0].label == "Back");
  CHECK(core.view().main.menu.items[0].selected == true);
  CHECK(core.view().main.footer.shortPressLabel == "Next");
  CHECK(core.view().main.footer.longPressLabel == "Enter");
}

TEST_CASE("reboot requires a confirmation menu before restart action")
{
  auto core = operationalCore();
  core.handle(app::AppEvent::longPressed(5000));
  core.handle(app::AppEvent::shortPressed(5001));
  core.handle(app::AppEvent::shortPressed(5002));
  core.handle(app::AppEvent::shortPressed(5003));

  const auto openConfirm = core.handle(app::AppEvent::longPressed(5004));
  CHECK(openConfirm.count == 1);
  CHECK(openConfirm[0].type == app::AppActionType::RenderRequested);
  CHECK(core.ui().route == app::UiRoute::RebootConfirmMenu);
  CHECK(core.view().main.menu.items[0].label == "Back");
  CHECK(core.view().main.menu.items[1].label == "Confirm Restart");

  core.handle(app::AppEvent::shortPressed(5005));
  const auto restart = core.handle(app::AppEvent::longPressed(5006));

  CHECK(restart.count == 1);
  CHECK(restart[0].type == app::AppActionType::RestartDevice);
}
```

- [ ] **Step 2: Run the host tests to verify they fail**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: FAIL with errors such as `AppEvent::shortPressed` not found, `AppActionType::RestartDevice` not found, and `AppCore::ui()` not found.

- [ ] **Step 3: Extend the event/action types and implement the navigation reducer in `AppCore`**

```cpp
// src/app/AppEvent.h - extend AppEventType and add monotonic button events
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
  ShortPressed,
  LongPressed,
  ToastExpired,
  DiagnosticsSnapshotCaptured,
};

struct AppEvent
{
  AppEventType type = AppEventType::BootRequested;
  uint32_t epochSeconds = 0;
  uint32_t monotonicMs = 0;
  WeatherSnapshot weather;
  DiagnosticsSnapshot diagnostics;

  static AppEvent shortPressed(uint32_t nowMs)
  {
    AppEvent event;
    event.type = AppEventType::ShortPressed;
    event.monotonicMs = nowMs;
    return event;
  }

  static AppEvent longPressed(uint32_t nowMs)
  {
    AppEvent event;
    event.type = AppEventType::LongPressed;
    event.monotonicMs = nowMs;
    return event;
  }

  static AppEvent toastExpired()
  {
    AppEvent event;
    event.type = AppEventType::ToastExpired;
    return event;
  }
};
```

```cpp
// src/app/AppAction.h - allow payloads and add navigation/platform actions
enum class AppActionType
{
  RenderRequested,
  ConnectWifi,
  ResolveCityCode,
  SyncTime,
  FetchWeather,
  WakeWifi,
  SleepWifi,
  PersistConfig,
  ResetWifiAndRestart,
  CaptureDiagnosticsSnapshot,
  PreviewBrightness,
  ApplyBrightness,
  RestartDevice,
};

struct AppAction
{
  AppActionType type = AppActionType::RenderRequested;
  uint32_t value = 0;
};

struct ActionList
{
  std::array<AppAction, 12> items{};
  std::size_t count = 0;

  void push(AppActionType type, uint32_t value = 0)
  {
    items[count].type = type;
    items[count].value = value;
    ++count;
  }
};
```

```cpp
// src/app/AppCore.h - expose ui state and add small helpers
class AppCore
{
public:
  ActionList handle(const AppEvent &event);
  const UiSessionState &ui() const { return ui_; }

private:
  void clearToast();
  void refreshOperationalView();
  void openSettingsMenu();
  void openRebootConfirmMenu();

  AppConfigData config_;
  AppRuntimeState runtime_;
  AppDataCache cache_;
  UiSessionState ui_;
  AppViewModel view_;
};
```

```cpp
// src/app/AppCore.cpp - add the pure navigation reducer
namespace
{

constexpr std::array<const char *, 4> kSettingsItems{
  "Back",
  "Diagnostics",
  "Brightness",
  "Restart",
};

constexpr std::array<const char *, 2> kRestartConfirmItems{
  "Back",
  "Confirm Restart",
};

} // namespace

void AppCore::clearToast()
{
  ui_.toastVisible = false;
  ui_.toastDeadlineMs = 0;
  view_.main.toast.visible = false;
  view_.main.toast.text.clear();
}

void AppCore::refreshOperationalView()
{
  view_.kind = ViewKind::Main;
  if (ui_.route == UiRoute::Home)
  {
    view_.main.pageKind = OperationalPageKind::Home;
    view_.main.footer = FooterHints{};
    view_.main.toast.visible = ui_.toastVisible;
    view_.main.toast.text = ui_.toastVisible ? "Debug shortcut" : "";
  }
}

void AppCore::openSettingsMenu()
{
  ui_.route = UiRoute::SettingsMenu;
  ui_.selectedMenuIndex = 0;
  view_.main.pageKind = OperationalPageKind::Menu;
  view_.main.menu.title = "Settings";
  view_.main.menu.subtitle = "Long press to enter";
  view_.main.menu.itemCount = 4;
  for (size_t i = 0; i < view_.main.menu.itemCount; ++i)
  {
    view_.main.menu.items[i].label = kSettingsItems[i];
    view_.main.menu.items[i].selected = (i == ui_.selectedMenuIndex);
  }
  view_.main.footer.shortPressLabel = "Next";
  view_.main.footer.longPressLabel = "Enter";
  clearToast();
}

void AppCore::openRebootConfirmMenu()
{
  ui_.route = UiRoute::RebootConfirmMenu;
  ui_.selectedMenuIndex = 0;
  view_.main.pageKind = OperationalPageKind::Menu;
  view_.main.menu.title = "Restart";
  view_.main.menu.subtitle = "Hold to execute";
  view_.main.menu.itemCount = 2;
  for (size_t i = 0; i < view_.main.menu.itemCount; ++i)
  {
    view_.main.menu.items[i].label = kRestartConfirmItems[i];
    view_.main.menu.items[i].selected = (i == ui_.selectedMenuIndex);
  }
  view_.main.footer.shortPressLabel = "Next";
  view_.main.footer.longPressLabel = "Enter";
  clearToast();
}

// inside AppCore::handle():
case AppEventType::ShortPressed:
  if (runtime_.mode != AppMode::Operational)
    break;
  if (ui_.route == UiRoute::Home)
  {
    ui_.toastVisible = true;
    ui_.toastDeadlineMs = event.monotonicMs + 1500U;
    refreshOperationalView();
    actions.push(AppActionType::RenderRequested);
  }
  else if (ui_.route == UiRoute::SettingsMenu || ui_.route == UiRoute::RebootConfirmMenu)
  {
    const size_t itemCount = (ui_.route == UiRoute::SettingsMenu) ? 4U : 2U;
    ui_.selectedMenuIndex = (ui_.selectedMenuIndex + 1U) % itemCount;
    if (ui_.route == UiRoute::SettingsMenu)
      openSettingsMenu();
    else
      openRebootConfirmMenu();
    actions.push(AppActionType::RenderRequested);
  }
  break;

case AppEventType::LongPressed:
  if (runtime_.mode != AppMode::Operational)
    break;
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
    else if (ui_.selectedMenuIndex == 3)
    {
      openRebootConfirmMenu();
      actions.push(AppActionType::RenderRequested);
    }
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

case AppEventType::ToastExpired:
  if (ui_.toastVisible)
  {
    clearToast();
    refreshOperationalView();
    actions.push(AppActionType::RenderRequested);
  }
  break;
```

- [ ] **Step 4: Run the host tests to verify they pass**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: PASS with `test_settings_navigation.cpp` plus all earlier tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/app/AppEvent.h src/app/AppAction.h src/app/AppCore.h src/app/AppCore.cpp test/test_native_app_core/test_settings_navigation.cpp
git commit -m "test: add settings navigation state machine"
```

### Task 3: Brightness Adjust Flow And Driver Brightness Hooks

**Files:**
- Modify: `src/app/AppCore.cpp`
- Modify: `src/app/AppDriver.cpp`
- Modify: `src/ports/DisplayPort.h`
- Modify: `src/ui/TftDisplayPort.h`
- Modify: `src/ui/TftDisplayPort.cpp`
- Modify: `test/test_native_app_core/test_driver_dispatch.cpp`
- Test: `test/test_native_app_core/test_brightness_adjust.cpp`
- Test: `test/test_native_app_core/test_driver_mapping.cpp`

- [ ] **Step 1: Write the failing brightness tests**

```cpp
// test/test_native_app_core/test_brightness_adjust.cpp
#include <doctest.h>

#include "app/AppCore.h"

namespace
{

app::AppCore brightnessCore()
{
  app::AppCore core;
  core.handle(app::AppEvent::bootRequested());
  core.handle(app::AppEvent::wifiConnected());
  core.handle(app::AppEvent::timeSynced(1710000000));

  app::WeatherSnapshot weather;
  weather.valid = true;
  weather.cityName = "Shijiazhuang";
  weather.temperatureText = "26";
  weather.humidityText = "40%";
  weather.temperatureC = 26;
  weather.humidityPercent = 40;
  weather.aqi = 42;
  weather.weatherCode = 1;
  core.handle(app::AppEvent::weatherFetched(weather, 1710000000));
  core.configMutable().lcdBrightness = 40;
  return core;
}

void enterBrightness(app::AppCore &core)
{
  core.handle(app::AppEvent::longPressed(1000));
  core.handle(app::AppEvent::shortPressed(1001));
  core.handle(app::AppEvent::shortPressed(1002));
  core.handle(app::AppEvent::longPressed(1003));
}

} // namespace

TEST_CASE("brightness page previews the next preset without persisting")
{
  auto core = brightnessCore();
  enterBrightness(core);

  const auto actions = core.handle(app::AppEvent::shortPressed(1004));

  CHECK(actions.count == 2);
  CHECK(actions[0].type == app::AppActionType::PreviewBrightness);
  CHECK(actions[0].value == 55);
  CHECK(actions[1].type == app::AppActionType::RenderRequested);
  CHECK(core.ui().route == app::UiRoute::BrightnessAdjustPage);
  CHECK(core.config().lcdBrightness == 40);
  CHECK(core.view().main.pageKind == app::OperationalPageKind::Adjust);
  CHECK(core.view().main.adjust.value == 55);
  CHECK(core.view().main.footer.shortPressLabel == "Cycle");
  CHECK(core.view().main.footer.longPressLabel == "Save");
}

TEST_CASE("long press on brightness page applies and saves the preset")
{
  auto core = brightnessCore();
  enterBrightness(core);
  core.handle(app::AppEvent::shortPressed(1004));

  const auto actions = core.handle(app::AppEvent::longPressed(1005));

  CHECK(actions.count == 2);
  CHECK(actions[0].type == app::AppActionType::ApplyBrightness);
  CHECK(actions[0].value == 55);
  CHECK(actions[1].type == app::AppActionType::RenderRequested);
  CHECK(core.config().lcdBrightness == 55);
  CHECK(core.ui().route == app::UiRoute::SettingsMenu);
}
```

```cpp
// test/test_native_app_core/test_driver_mapping.cpp - extend fake display and verify preview/apply hooks
struct FakeDisplayPort : ports::DisplayPort
{
  bool rendered = false;
  int brightness = -1;

  void render(const app::AppViewModel &) override { rendered = true; }
  void setBrightness(uint8_t percent) override { brightness = percent; }
};

// test/test_native_app_core/test_driver_dispatch.cpp - keep dispatch display fake host-constructible
struct DispatchDisplayPort : ports::DisplayPort
{
  int renderCount = 0;
  app::ViewKind lastKind = app::ViewKind::Splash;

  void render(const app::AppViewModel &view) override
  {
    ++renderCount;
    lastKind = view.kind;
  }

  void setBrightness(uint8_t) override {}
};

TEST_CASE("driver applies preview and persistent brightness actions")
{
  FakeDisplayPort display;
  FakeNetworkPort network;
  NullStoragePort storage;
  NullWeatherPort weather;
  NullTimeSyncPort timeSync;
  NullSensorPort sensor;
  app::AppDriver driver(storage, network, weather, timeSync, sensor, display, nullptr);

  app::ActionList actions;
  actions.push(app::AppActionType::PreviewBrightness, 55);
  actions.push(app::AppActionType::ApplyBrightness, 70);

  app::AppConfigData config;
  config.lcdBrightness = 70;
  app::AppViewModel view;
  driver.execute(actions, config, view);

  CHECK(display.brightness == 70);
}
```

- [ ] **Step 2: Run the host tests to verify they fail**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: FAIL because `PreviewBrightness` / `ApplyBrightness` are not emitted, `DisplayPort::setBrightness()` does not exist, and `AppDriver` cannot execute those actions.

- [ ] **Step 3: Implement the brightness adjust reducer and driver hooks**

```cpp
// src/ports/DisplayPort.h - extend the interface so preview/apply stay behind ports
class DisplayPort
{
public:
  virtual ~DisplayPort() {}
  virtual void render(const app::AppViewModel &view) = 0;
  virtual void setBrightness(uint8_t percent) = 0;
};
```

```cpp
// src/ui/TftDisplayPort.h/.cpp - wire the port method to the existing display helper
class TftDisplayPort : public ports::DisplayPort
{
public:
  void begin(uint8_t rotation, uint8_t brightness);
  void setBrightness(uint8_t brightness) override;
  void setRotation(uint8_t rotation);
  void tickClock();
  void tickBanner();
  void render(const app::AppViewModel &view) override;
};

void TftDisplayPort::setBrightness(uint8_t brightness)
{
  display::setBrightness(brightness);
}
```

```cpp
// src/app/AppCore.cpp - add preset-based brightness navigation
namespace
{

constexpr std::array<uint8_t, 7> kBrightnessPresets{{10, 25, 40, 55, 70, 85, 100}};

uint8_t nearestBrightnessPresetIndex(uint8_t brightness)
{
  uint8_t bestIndex = 0;
  uint8_t bestDistance = 255;
  for (uint8_t index = 0; index < kBrightnessPresets.size(); ++index)
  {
    const uint8_t value = kBrightnessPresets[index];
    const uint8_t distance = (value > brightness) ? (value - brightness) : (brightness - value);
    if (distance < bestDistance)
    {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

} // namespace

// when entering brightness from settings menu:
ui_.route = UiRoute::BrightnessAdjustPage;
ui_.selectedBrightnessPresetIndex = nearestBrightnessPresetIndex(config_.lcdBrightness);
view_.main.pageKind = OperationalPageKind::Adjust;
view_.main.adjust.title = "Brightness";
view_.main.adjust.subtitle = "Preview before save";
view_.main.adjust.value = kBrightnessPresets[ui_.selectedBrightnessPresetIndex];
view_.main.adjust.minValue = 10;
view_.main.adjust.maxValue = 100;
view_.main.adjust.unit = "%";
view_.main.footer.shortPressLabel = "Cycle";
view_.main.footer.longPressLabel = "Save";

// short press on brightness page:
ui_.selectedBrightnessPresetIndex =
  (ui_.selectedBrightnessPresetIndex + 1U) % kBrightnessPresets.size();
view_.main.adjust.value = kBrightnessPresets[ui_.selectedBrightnessPresetIndex];
actions.push(AppActionType::PreviewBrightness, view_.main.adjust.value);
actions.push(AppActionType::RenderRequested);

// long press on brightness page:
config_.lcdBrightness = kBrightnessPresets[ui_.selectedBrightnessPresetIndex];
actions.push(AppActionType::ApplyBrightness, config_.lcdBrightness);
openSettingsMenu();
actions.push(AppActionType::RenderRequested);
```

```cpp
// src/app/AppDriver.cpp - execute preview/apply
void AppDriver::appendActions(ActionList &target, const ActionList &source)
{
  for (std::size_t index = 0; index < source.count; ++index)
  {
    target.push(source[index].type, source[index].value);
  }
}

case AppActionType::PreviewBrightness:
  display_.setBrightness(static_cast<uint8_t>(actions[index].value));
  break;

case AppActionType::ApplyBrightness:
  display_.setBrightness(static_cast<uint8_t>(actions[index].value));
  storage_.save(config);
  break;
```

- [ ] **Step 4: Run the host tests to verify they pass**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: PASS with `test_brightness_adjust.cpp`, the expanded driver mapping test, and all previous host tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/AppCore.cpp src/app/AppDriver.cpp src/ports/DisplayPort.h src/ui/TftDisplayPort.h src/ui/TftDisplayPort.cpp test/test_native_app_core/test_brightness_adjust.cpp test/test_native_app_core/test_driver_dispatch.cpp test/test_native_app_core/test_driver_mapping.cpp
git commit -m "test: add brightness adjust flow"
```

### Task 4: Diagnostics Snapshot Port And Driver Dispatch

**Files:**
- Create: `src/ports/SystemStatusPort.h`
- Create: `src/adapters/Esp8266SystemStatusPort.h`
- Create: `src/adapters/Esp8266SystemStatusPort.cpp`
- Modify: `src/app/AppEvent.h`
- Modify: `src/app/AppCore.cpp`
- Modify: `src/app/AppDriver.h`
- Modify: `src/app/AppDriver.cpp`
- Modify: `src/ports/NetworkPort.h`
- Modify: `src/adapters/Esp8266NetworkPort.h`
- Modify: `src/adapters/Esp8266NetworkPort.cpp`
- Modify: `test/test_native_app_core/test_driver_mapping.cpp`
- Modify: `test/test_native_app_core/test_driver_dispatch.cpp`
- Test: `test/test_native_app_core/test_diagnostics_capture.cpp`

- [ ] **Step 1: Write the failing diagnostics and restart dispatch tests**

```cpp
// test/test_native_app_core/test_diagnostics_capture.cpp
#include <doctest.h>

#include "app/AppCore.h"
#include "app/AppDriver.h"

namespace
{

app::AppCore diagnosticsCore()
{
  app::AppCore core;
  core.handle(app::AppEvent::bootRequested());
  core.handle(app::AppEvent::wifiConnected());
  core.handle(app::AppEvent::timeSynced(1710000000));

  app::WeatherSnapshot weather;
  weather.valid = true;
  weather.cityName = "Shijiazhuang";
  weather.temperatureText = "26";
  weather.humidityText = "40%";
  weather.temperatureC = 26;
  weather.humidityPercent = 40;
  weather.aqi = 42;
  weather.weatherCode = 1;
  core.handle(app::AppEvent::weatherFetched(weather, 1710000000));
  return core;
}

} // namespace

TEST_CASE("diagnostics menu entry requests a single captured snapshot")
{
  auto core = diagnosticsCore();
  core.handle(app::AppEvent::longPressed(1000));
  core.handle(app::AppEvent::shortPressed(1001));

  const auto actions = core.handle(app::AppEvent::longPressed(1002));

  CHECK(actions.count == 1);
  CHECK(actions[0].type == app::AppActionType::CaptureDiagnosticsSnapshot);
}

TEST_CASE("captured snapshot renders the diagnostics info page")
{
  auto core = diagnosticsCore();
  core.handle(app::AppEvent::longPressed(1000));
  core.handle(app::AppEvent::shortPressed(1001));
  core.handle(app::AppEvent::longPressed(1002));

  app::DiagnosticsSnapshot snapshot;
  snapshot.valid = true;
  snapshot.freeHeapBytes = 32768;
  snapshot.programFlashUsedBytes = 846012;
  snapshot.programFlashTotalBytes = 1044464;
  snapshot.wifiConnected = true;
  snapshot.wifiSsid = "OfficeWiFi";

  const auto actions = core.handle(app::AppEvent::diagnosticsSnapshotCaptured(snapshot));

  CHECK(actions.count == 1);
  CHECK(actions[0].type == app::AppActionType::RenderRequested);
  CHECK(core.ui().route == app::UiRoute::DiagnosticsPage);
  CHECK(core.view().main.pageKind == app::OperationalPageKind::Info);
  CHECK(core.view().main.info.rowCount == 4);
  CHECK(core.view().main.info.rows[0].label == "Free Heap");
  CHECK(core.view().main.info.rows[3].value == "OfficeWiFi");
}
```

```cpp
// extend test/test_native_app_core/test_driver_mapping.cpp with diagnostics/restart execution
struct FakeSystemStatusPort : ports::SystemStatusPort
{
  app::DiagnosticsSnapshot capture() const override
  {
    app::DiagnosticsSnapshot snapshot;
    snapshot.valid = true;
    snapshot.freeHeapBytes = 1111;
    snapshot.programFlashUsedBytes = 2222;
    snapshot.programFlashTotalBytes = 3333;
    snapshot.wifiConnected = true;
    snapshot.wifiSsid = "LabWiFi";
    return snapshot;
  }
};

struct FakeNetworkPort : ports::NetworkPort
{
  bool restartCalled = false;
  bool connect(app::AppConfigData &) override { return true; }
  void wake() override {}
  void sleep() override {}
  void restart() override { restartCalled = true; }
  void resetAndRestart() override {}
};

TEST_CASE("driver dispatch routes diagnostics capture and restart")
{
  FakeDisplayPort display;
  FakeNetworkPort network;
  NullStoragePort storage;
  NullWeatherPort weather;
  NullTimeSyncPort timeSync;
  NullSensorPort sensor;
  FakeSystemStatusPort systemStatus;
  app::AppCore core = diagnosticsCore();
  app::AppDriver driver(storage, network, weather, timeSync, sensor, systemStatus, display, nullptr);

  app::ActionList diagnostics;
  diagnostics.push(app::AppActionType::CaptureDiagnosticsSnapshot);
  driver.dispatch(core, diagnostics);
  CHECK(core.ui().route == app::UiRoute::DiagnosticsPage);

  app::ActionList restart;
  restart.push(app::AppActionType::RestartDevice);
  driver.dispatch(core, restart);
  CHECK(network.restartCalled == true);
}
```

```cpp
// update test/test_native_app_core/test_driver_dispatch.cpp for the new constructor
struct NullSystemStatusPort : ports::SystemStatusPort
{
  app::DiagnosticsSnapshot capture() const override
  {
    return {};
  }
};

TEST_CASE("driver dispatch executes synchronous boot flow to operational")
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

  CHECK(core.runtime().mode == app::AppMode::Operational);
  CHECK(core.runtime().initialSyncComplete == true);
  CHECK(core.view().kind == app::ViewKind::Main);
  CHECK(display.renderCount >= 2);
}
```

- [ ] **Step 2: Run the host tests to verify they fail**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: FAIL because `SystemStatusPort` does not exist, `CaptureDiagnosticsSnapshot` is not dispatched, and `NetworkPort::restart()` is not implemented.

- [ ] **Step 3: Add the diagnostics port, snapshot event, and restart dispatch**

```cpp
// src/ports/SystemStatusPort.h
#ifndef PORTS_SYSTEM_STATUS_PORT_H
#define PORTS_SYSTEM_STATUS_PORT_H

#include "app/DiagnosticsSnapshot.h"

namespace ports
{

class SystemStatusPort
{
public:
  virtual ~SystemStatusPort() {}
  virtual app::DiagnosticsSnapshot capture() const = 0;
};

} // namespace ports

#endif // PORTS_SYSTEM_STATUS_PORT_H
```

```cpp
// src/adapters/Esp8266SystemStatusPort.cpp
#include "adapters/Esp8266SystemStatusPort.h"

#include <Arduino.h>
#include <ESP8266WiFi.h>

namespace adapters
{

app::DiagnosticsSnapshot Esp8266SystemStatusPort::capture() const
{
  app::DiagnosticsSnapshot snapshot;
  snapshot.valid = true;
  snapshot.freeHeapBytes = ESP.getFreeHeap();
  snapshot.programFlashUsedBytes = ESP.getSketchSize();
  snapshot.programFlashTotalBytes = ESP.getSketchSize() + ESP.getFreeSketchSpace();
  snapshot.wifiConnected = (WiFi.status() == WL_CONNECTED);
  if (snapshot.wifiConnected)
    snapshot.wifiSsid = WiFi.SSID().c_str();
  return snapshot;
}

} // namespace adapters
```

```cpp
// src/app/AppEvent.h - add snapshot delivery helper
static AppEvent diagnosticsSnapshotCaptured(const DiagnosticsSnapshot &snapshot)
{
  AppEvent event;
  event.type = AppEventType::DiagnosticsSnapshotCaptured;
  event.diagnostics = snapshot;
  return event;
}
```

```cpp
// src/app/AppCore.cpp - request capture from settings and render the info page when ready
// long press on Settings -> Diagnostics:
else if (ui_.selectedMenuIndex == 1)
{
  actions.push(AppActionType::CaptureDiagnosticsSnapshot);
}

// short or long press on Diagnostics returns to settings:
else if (ui_.route == UiRoute::DiagnosticsPage)
{
  openSettingsMenu();
  actions.push(AppActionType::RenderRequested);
}

case AppEventType::DiagnosticsSnapshotCaptured:
  ui_.diagnostics = event.diagnostics;
  ui_.route = UiRoute::DiagnosticsPage;
  view_.main.pageKind = OperationalPageKind::Info;
  view_.main.info.title = "Diagnostics";
  view_.main.info.subtitle = "Captured on entry";
  view_.main.info.rowCount = 4;
  view_.main.info.rows[0] = {"Free Heap", std::to_string(ui_.diagnostics.freeHeapBytes)};
  view_.main.info.rows[1] = {"Flash Used", std::to_string(ui_.diagnostics.programFlashUsedBytes)};
  view_.main.info.rows[2] = {"Flash Total", std::to_string(ui_.diagnostics.programFlashTotalBytes)};
  view_.main.info.rows[3] = {"WiFi", ui_.diagnostics.wifiConnected ? ui_.diagnostics.wifiSsid : "not connected"};
  view_.main.footer.shortPressLabel = "Back";
  view_.main.footer.longPressLabel = "Back";
  actions.push(AppActionType::RenderRequested);
  break;
```

```cpp
// src/app/AppDriver.h - add SystemStatusPort to constructor ownership
class AppDriver
{
public:
  AppDriver(ports::StoragePort &storage,
            ports::NetworkPort &network,
            ports::WeatherPort &weather,
            ports::TimeSyncPort &timeSync,
            ports::SensorPort &sensor,
            ports::SystemStatusPort &systemStatus,
            ports::DisplayPort &display,
            ports::ClockPort *clock);

private:
  ports::SystemStatusPort &systemStatus_;
};
```

```cpp
// src/app/AppDriver.cpp - dispatch diagnostics capture and plain restart
case AppActionType::CaptureDiagnosticsSnapshot:
  appendActions(next, core.handle(AppEvent::diagnosticsSnapshotCaptured(systemStatus_.capture())));
  break;

case AppActionType::RestartDevice:
  network_.restart();
  break;
```

```cpp
// src/ports/NetworkPort.h and src/adapters/Esp8266NetworkPort.cpp
virtual void restart() = 0;

void Esp8266NetworkPort::restart()
{
  ESP.restart();
}
```

- [ ] **Step 4: Run the host tests to verify they pass**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: PASS with diagnostics capture and extended driver dispatch coverage.

- [ ] **Step 5: Commit**

```bash
git add src/ports/SystemStatusPort.h src/adapters/Esp8266SystemStatusPort.h src/adapters/Esp8266SystemStatusPort.cpp src/app/AppEvent.h src/app/AppCore.cpp src/app/AppDriver.h src/app/AppDriver.cpp src/ports/NetworkPort.h src/adapters/Esp8266NetworkPort.h src/adapters/Esp8266NetworkPort.cpp test/test_native_app_core/test_diagnostics_capture.cpp test/test_native_app_core/test_driver_dispatch.cpp test/test_native_app_core/test_driver_mapping.cpp
git commit -m "test: add diagnostics capture and restart dispatch"
```

### Task 5: Shared Settings Chrome, Main-Loop Wiring, And Embedded Verification

**Files:**
- Modify: `src/Screen.h`
- Modify: `src/Screen.cpp`
- Modify: `src/ui/TftDisplayPort.cpp`
- Modify: `src/main.cpp`
- Modify: `README.md`
- Modify: `test/test_native_app_core/test_settings_navigation.cpp`

- [ ] **Step 1: Write the failing integration expectations**

```cpp
// append to test/test_native_app_core/test_settings_navigation.cpp
TEST_CASE("toast expiry clears the home debug message without leaving home")
{
  auto core = operationalCore();
  core.handle(app::AppEvent::shortPressed(5000));

  const auto actions = core.handle(app::AppEvent::toastExpired());

  CHECK(actions.count == 1);
  CHECK(actions[0].type == app::AppActionType::RenderRequested);
  CHECK(core.ui().route == app::UiRoute::Home);
  CHECK(core.ui().toastVisible == false);
  CHECK(core.view().main.toast.visible == false);
}
```

Run immediately after adding the test.

- [ ] **Step 2: Run the host tests to verify they fail**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: FAIL if `toastExpired` does not fully clear the view state or if screen-related changes are still missing.

- [ ] **Step 3: Implement the shared page chrome, settings rendering, and button-to-event wiring**

```cpp
// src/Screen.h - add shared rendering helpers
namespace screen
{

void refreshClock();
void refreshBanner();
void forceClockRedraw();
void drawSplashPage(const app::SplashViewData &view);
void drawErrorPage(const app::ErrorViewData &view);
void drawMainPage(const app::MainViewData &view);

} // namespace screen
```

```cpp
// src/Screen.cpp - keep one drawMainPage entry point but branch by page kind
namespace
{

void drawPageChrome(const std::string &title,
                    const std::string &subtitle,
                    const app::FooterHints &footer)
{
  // top title line
  // middle subtitle line
  // bottom short/long hint line
}

void drawToast(const app::ToastData &toast)
{
  if (!toast.visible)
    return;
  // draw a compact rounded bubble over the home page
}

void drawMenuPage(const app::MenuBodyData &menu, const app::FooterHints &footer)
{
  drawPageChrome(menu.title, menu.subtitle, footer);
  // draw each menu item and highlight the selected row
}

void drawInfoPage(const app::InfoBodyData &info, const app::FooterHints &footer)
{
  drawPageChrome(info.title, info.subtitle, footer);
  // draw label/value rows
}

void drawAdjustPage(const app::AdjustBodyData &adjust, const app::FooterHints &footer)
{
  drawPageChrome(adjust.title, adjust.subtitle, footer);
  // draw a large percent plus progress bar
}

} // namespace

void drawMainPage(const app::MainViewData &view)
{
  if (view.pageKind == app::OperationalPageKind::Home)
  {
    // existing weather/time page rendering
    drawToast(view.toast);
    return;
  }

  display::clear();
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
}
```

```cpp
// src/main.cpp - stop resetting directly on button events and forward them to AppCore
namespace
{

adapters::Esp8266SystemStatusPort g_systemStatus;
app::AppDriver g_driver(g_storage, g_network, g_weather, g_timeSync, g_sensor, g_systemStatus, g_display, nullptr);

void dispatch(const app::ActionList &actions)
{
  g_driver.dispatch(g_core, actions);
  animate::setDhtEnabled(g_core.config().dhtEnabled);
}

} // namespace

void loop()
{
  input::tick();
  const uint32_t nowMs = millis();

  switch (input::consumeEvent())
  {
    case input::ButtonEvent::ShortPress:
      dispatch(g_core.handle(app::AppEvent::shortPressed(nowMs)));
      break;
    case input::ButtonEvent::LongPress:
      dispatch(g_core.handle(app::AppEvent::longPressed(nowMs)));
      break;
    case input::ButtonEvent::None:
      break;
  }

  if (g_core.ui().toastVisible && nowMs >= g_core.ui().toastDeadlineMs)
  {
    dispatch(g_core.handle(app::AppEvent::toastExpired()));
  }

  cli::Command command;
  if (cli::poll(command))
  {
    applyCliCommand(command);
  }

  // keep the existing clock/banner/background-sync loop intact
}
```

```md
<!-- README.md - add the new button interaction summary -->
## Button Controls

- Home: short press shows a debug toast, long press opens settings
- Menu pages: short press selects next item, long press enters/executes
- Info pages: short press and long press both return
- Brightness page: short press previews the next preset, long press saves
```

- [ ] **Step 4: Run full verification on host and embedded targets**

Run: `~/.platformio/penv/bin/pio test -e host -f test_native_app_core`

Expected: PASS with the toast timeout case and all previous navigation tests.

Run: `~/.platformio/penv/bin/pio run -e esp12e`

Expected: PASS, confirming the new `SystemStatusPort`, settings rendering, and event-driven button loop compile on the ESP-12E firmware target.

- [ ] **Step 5: Commit**

```bash
git add src/Screen.h src/Screen.cpp src/ui/TftDisplayPort.cpp src/main.cpp README.md test/test_native_app_core/test_settings_navigation.cpp
git commit -m "feat: add single-button settings navigation"
```

## Self-Review Checklist

- Spec coverage:
  - Home short-press toast: Task 2 + Task 5.
  - Long-press settings entry: Task 2.
  - Menu/content/adjust page rules: Tasks 2-5.
  - Diagnostics snapshot on entry only: Task 4.
  - Brightness preview/save split: Task 3.
  - Reboot confirmation before restart: Task 2 + Task 4.
  - Shared footer hints/page chrome: Task 5.
  - Extensible `SystemStatusPort` and future setting structure: Tasks 1-4.
- Placeholder scan:
  - No `TODO`, `TBD`, or “similar to previous task” instructions remain.
  - Every code-changing step contains concrete code blocks and exact verification commands.
- Type consistency:
  - `UiRoute`, `OperationalPageKind`, `DiagnosticsSnapshot`, `CaptureDiagnosticsSnapshot`, `PreviewBrightness`, `ApplyBrightness`, and `RestartDevice` are used consistently across tasks.
  - `DisplayPort::setBrightness()`, `NetworkPort::restart()`, and the `AppDriver` constructor changes are introduced in the same tasks that update existing host-side fakes and driver tests.
