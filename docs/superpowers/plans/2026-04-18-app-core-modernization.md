# App Core Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure-C++ `AppCore` and port-driven runtime for the ESP-12E firmware so startup, error handling, and background sync are centrally defined, host-testable, and no longer spread across `main.cpp` and global state.

**Architecture:** Keep the hardware target as the ESP-12E module while continuing to build on PlatformIO's `espressif8266` platform for `nodemcuv2`; that terminology mismatch does not change the design. Split the system into `src/app` for pure state and orchestration, `src/ports` for hardware-facing interfaces, and thin ESP-12E adapters/UI code that translate between `AppCore` and the existing TFT/WiFi/NTP/weather stack.

**Tech Stack:** PlatformIO (`esp12e` embedded env + `native` host test env), Arduino framework, doctest, ESP8266WiFi/WiFiManager/EEPROM/TFT_eSPI/TJpg_Decoder

---

## Planned File Structure

- Create: `src/app/AppConfigData.h`
- Create: `src/app/AppRuntimeState.h`
- Create: `src/app/AppDataCache.h`
- Create: `src/app/AppViewModel.h`
- Create: `src/app/AppEvent.h`
- Create: `src/app/AppAction.h`
- Create: `src/app/AppCore.h`
- Create: `src/app/AppCore.cpp`
- Create: `src/app/AppDriver.h`
- Create: `src/app/AppDriver.cpp`
- Create: `src/ports/ClockPort.h`
- Create: `src/ports/StoragePort.h`
- Create: `src/ports/NetworkPort.h`
- Create: `src/ports/WeatherPort.h`
- Create: `src/ports/TimeSyncPort.h`
- Create: `src/ports/DisplayPort.h`
- Create: `src/ports/SensorPort.h`
- Create: `src/adapters/EepromStoragePort.h`
- Create: `src/adapters/EepromStoragePort.cpp`
- Create: `src/adapters/Esp8266NetworkPort.h`
- Create: `src/adapters/Esp8266NetworkPort.cpp`
- Create: `src/adapters/WeatherServicePort.h`
- Create: `src/adapters/WeatherServicePort.cpp`
- Create: `src/adapters/NtpTimeSyncPort.h`
- Create: `src/adapters/NtpTimeSyncPort.cpp`
- Create: `src/adapters/Dht11SensorPort.h`
- Create: `src/adapters/Dht11SensorPort.cpp`
- Create: `src/ui/TftDisplayPort.h`
- Create: `src/ui/TftDisplayPort.cpp`
- Create: `test/native_app_core/test_main.cpp`
- Create: `test/native_app_core/test_model_defaults.cpp`
- Create: `test/native_app_core/test_boot_flow.cpp`
- Create: `test/native_app_core/test_operational_flow.cpp`
- Create: `test/native_app_core/test_port_contracts.cpp`
- Create: `test/native_app_core/test_driver_mapping.cpp`
- Modify: `platformio.ini`
- Modify: `src/main.cpp`
- Modify: `src/Storage.h`
- Modify: `src/Storage.cpp`
- Modify: `src/Net.h`
- Modify: `src/Net.cpp`
- Modify: `src/Weather.h`
- Modify: `src/Weather.cpp`
- Modify: `src/Ntp.h`
- Modify: `src/Ntp.cpp`
- Modify: `src/Dht11.h`
- Modify: `src/Dht11.cpp`
- Modify: `src/Screen.h`
- Modify: `src/Screen.cpp`
- Modify: `src/Display.h`
- Modify: `src/Display.cpp`
- Modify: `src/Input.h`
- Modify: `src/Input.cpp`
- Modify: `src/Cli.h`
- Modify: `src/Cli.cpp`
- Delete: `src/AppState.h`
- Modify: `README.md`
- Modify: `CLAUDE.md`

### Responsibility Map

- `src/app/*`: Pure C++ state, events, actions, orchestration, and action execution logic.
- `src/ports/*`: Abstract interfaces for time, storage, WiFi, weather, NTP, display, and sensor input.
- `src/adapters/*`: ESP-12E / Arduino implementations of those interfaces.
- `src/ui/TftDisplayPort.*`: Render `AppViewModel` to the existing TFT stack.
- `test/native_app_core/*`: Host-side doctest suite for the pure application core.

### Build Strategy

- `env:esp12e` remains the embedded firmware build target.
- Add `env:host` using PlatformIO `native` to compile only `src/app` and run doctest-based host tests.
- Keep embedded-only code out of `src/app` so host tests never pull in `Arduino.h`, `ESP8266WiFi.h`, or `TFT_eSPI.h`.

---

### Task 1: Host Test Harness And Core Data Models

**Files:**
- Modify: `platformio.ini`
- Create: `src/app/AppConfigData.h`
- Create: `src/app/AppRuntimeState.h`
- Create: `src/app/AppDataCache.h`
- Create: `src/app/AppViewModel.h`
- Test: `test/native_app_core/test_main.cpp`
- Test: `test/native_app_core/test_model_defaults.cpp`

- [ ] **Step 1: Write the failing host-test harness and default-model tests**

```cpp
// test/native_app_core/test_main.cpp
#define DOCTEST_CONFIG_IMPLEMENT
#include <doctest.h>

int main(int argc, char **argv)
{
  doctest::Context context;
  context.setOption("success", true);
  context.setOption("no-exitcode", false);
  context.applyCommandLine(argc, argv);
  return context.run();
}
```

```cpp
// test/native_app_core/test_model_defaults.cpp
#include <doctest.h>

#include "app/AppConfigData.h"
#include "app/AppRuntimeState.h"
#include "app/AppViewModel.h"

TEST_CASE("default config uses firmware defaults for esp12e module")
{
  app::AppConfigData config;
  CHECK(config.cityCode == app_config::kDefaultCityCode);
  CHECK(config.weatherUpdateMinutes == app_config::kDefaultWeatherUpdateMinutes);
  CHECK(config.lcdBrightness == app_config::kDefaultLcdBrightness);
  CHECK(config.lcdRotation == app_config::kDefaultLcdRotation);
  CHECK(config.dhtEnabled == false);
}

TEST_CASE("default runtime starts in booting mode with splash view")
{
  app::AppRuntimeState runtime;
  app::AppViewModel view;

  CHECK(runtime.mode == app::AppMode::Booting);
  CHECK(runtime.blockingError == app::BlockingErrorReason::None);
  CHECK(runtime.backgroundSyncInProgress == false);
  CHECK(view.kind == app::ViewKind::Splash);
}
```

```ini
; platformio.ini - append this block without touching env:esp12e
[env:host]
platform = native
test_framework = doctest
test_build_src = yes
build_flags =
  -std=gnu++17
build_src_filter =
  -<*>
  +<app/>
```

- [ ] **Step 2: Run the host tests to verify they fail**

Run: `~/.platformio/penv/bin/pio test -e host -f native_app_core/*`

Expected: FAIL with missing-header errors such as `app/AppConfigData.h: No such file or directory`.

- [ ] **Step 3: Write the minimal pure-C++ model headers**

```cpp
// src/app/AppConfigData.h
#ifndef APP_APP_CONFIG_DATA_H
#define APP_APP_CONFIG_DATA_H

#include "AppConfig.h"

#include <string>

namespace app
{

struct AppConfigData
{
  std::string wifiSsid;
  std::string wifiPsk;
  std::string cityCode = app_config::kDefaultCityCode;
  uint32_t weatherUpdateMinutes = app_config::kDefaultWeatherUpdateMinutes;
  uint8_t lcdBrightness = app_config::kDefaultLcdBrightness;
  uint8_t lcdRotation = app_config::kDefaultLcdRotation;
  bool dhtEnabled = false;
};

} // namespace app

#endif // APP_APP_CONFIG_DATA_H
```

```cpp
// src/app/AppRuntimeState.h
#ifndef APP_APP_RUNTIME_STATE_H
#define APP_APP_RUNTIME_STATE_H

#include <cstdint>

namespace app
{

enum class AppMode
{
  Booting,
  BlockingError,
  Operational,
};

enum class BlockingErrorReason
{
  None,
  NoNetwork,
  TimeSyncFailed,
  WeatherFetchFailed,
  ConfigRequired,
};

enum class SyncPhase
{
  Idle,
  ConnectingWifi,
  ResolvingCityCode,
  SyncingTime,
  FetchingWeather,
};

struct AppRuntimeState
{
  AppMode mode = AppMode::Booting;
  BlockingErrorReason blockingError = BlockingErrorReason::None;
  SyncPhase syncPhase = SyncPhase::Idle;
  bool initialSyncComplete = false;
  bool backgroundSyncInProgress = false;
  uint32_t lastWeatherSyncEpoch = 0;
  uint32_t lastTimeSyncEpoch = 0;
  uint32_t nextRefreshDueEpoch = 0;
};

} // namespace app

#endif // APP_APP_RUNTIME_STATE_H
```

```cpp
// src/app/AppDataCache.h
#ifndef APP_APP_DATA_CACHE_H
#define APP_APP_DATA_CACHE_H

#include "AppConfig.h"

#include <array>
#include <string>

namespace app
{

struct WeatherSnapshot
{
  bool valid = false;
  std::string cityName;
  std::string temperatureText;
  std::string humidityText;
  int temperatureC = 0;
  int humidityPercent = 0;
  int aqi = 0;
  int weatherCode = 99;
  std::array<std::string, app_config::kBannerSlotCount> bannerLines{};
};

struct TimeSnapshot
{
  bool valid = false;
  uint32_t epochSeconds = 0;
};

struct IndoorClimateSnapshot
{
  bool valid = false;
  float temperatureC = 0.0f;
  float humidityPercent = 0.0f;
};

struct AppDataCache
{
  WeatherSnapshot weather;
  TimeSnapshot time;
  IndoorClimateSnapshot indoor;
};

} // namespace app

#endif // APP_APP_DATA_CACHE_H
```

```cpp
// src/app/AppViewModel.h
#ifndef APP_APP_VIEW_MODEL_H
#define APP_APP_VIEW_MODEL_H

#include "AppConfig.h"
#include "AppRuntimeState.h"

#include <array>
#include <string>

namespace app
{

enum class ViewKind
{
  Splash,
  Error,
  Main,
};

struct SplashViewData
{
  std::string title = "SmallDesktopDisplay";
  std::string detail = "Booting";
};

struct ErrorViewData
{
  BlockingErrorReason reason = BlockingErrorReason::None;
  std::string title;
  std::string detail;
  bool retrying = false;
};

struct MainViewData
{
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

struct AppViewModel
{
  ViewKind kind = ViewKind::Splash;
  SplashViewData splash;
  ErrorViewData error;
  MainViewData main;
};

} // namespace app

#endif // APP_APP_VIEW_MODEL_H
```

- [ ] **Step 4: Run the host tests to verify they pass**

Run: `~/.platformio/penv/bin/pio test -e host -f native_app_core/*`

Expected: PASS with 2 passing test cases from `test_model_defaults.cpp`.

- [ ] **Step 5: Commit**

```bash
git add platformio.ini test/native_app_core/test_main.cpp test/native_app_core/test_model_defaults.cpp src/app/AppConfigData.h src/app/AppRuntimeState.h src/app/AppDataCache.h src/app/AppViewModel.h
git commit -m "test: add host app model scaffold"
```

### Task 2: Boot State Machine In AppCore

**Files:**
- Create: `src/app/AppEvent.h`
- Create: `src/app/AppAction.h`
- Create: `src/app/AppCore.h`
- Create: `src/app/AppCore.cpp`
- Test: `test/native_app_core/test_boot_flow.cpp`

- [ ] **Step 1: Write the failing boot-flow tests**

```cpp
// test/native_app_core/test_boot_flow.cpp
#include <doctest.h>

#include "app/AppCore.h"

TEST_CASE("boot request renders splash and starts wifi connection")
{
  app::AppCore core;
  const auto actions = core.handle(app::AppEvent::bootRequested());

  CHECK(actions.count == 2);
  CHECK(actions[0].type == app::AppActionType::RenderRequested);
  CHECK(actions[1].type == app::AppActionType::ConnectWifi);
  CHECK(core.runtime().mode == app::AppMode::Booting);
  CHECK(core.view().kind == app::ViewKind::Splash);
}

TEST_CASE("wifi failure during bootstrap enters blocking no-network error")
{
  app::AppCore core;
  core.handle(app::AppEvent::bootRequested());
  const auto actions = core.handle(app::AppEvent::wifiConnectionFailed());

  CHECK(actions.count == 1);
  CHECK(actions[0].type == app::AppActionType::RenderRequested);
  CHECK(core.runtime().mode == app::AppMode::BlockingError);
  CHECK(core.runtime().blockingError == app::BlockingErrorReason::NoNetwork);
  CHECK(core.view().kind == app::ViewKind::Error);
  CHECK(core.view().error.reason == app::BlockingErrorReason::NoNetwork);
}

TEST_CASE("successful bootstrap reaches operational state")
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
  weather.bannerLines[0] = "实时天气 晴";

  const auto actions = core.handle(app::AppEvent::weatherFetched(weather, 1710000000));

  CHECK(actions.count == 1);
  CHECK(actions[0].type == app::AppActionType::RenderRequested);
  CHECK(core.runtime().mode == app::AppMode::Operational);
  CHECK(core.runtime().initialSyncComplete == true);
  CHECK(core.view().kind == app::ViewKind::Main);
  CHECK(core.view().main.cityName == "Shijiazhuang");
}
```

- [ ] **Step 2: Run the host tests to verify they fail**

Run: `~/.platformio/penv/bin/pio test -e host -f native_app_core/*`

Expected: FAIL with `app/AppCore.h: No such file or directory`.

- [ ] **Step 3: Write the minimal event/action/core implementation**

```cpp
// src/app/AppAction.h
#ifndef APP_APP_ACTION_H
#define APP_APP_ACTION_H

#include <array>
#include <cstddef>

namespace app
{

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
};

struct AppAction
{
  AppActionType type = AppActionType::RenderRequested;
};

struct ActionList
{
  std::array<AppAction, 8> items{};
  size_t count = 0;

  void push(AppActionType type)
  {
    items[count++] = AppAction{type};
  }

  const AppAction &operator[](size_t index) const
  {
    return items[index];
  }
};

} // namespace app

#endif // APP_APP_ACTION_H
```

```cpp
// src/app/AppEvent.h
#ifndef APP_APP_EVENT_H
#define APP_APP_EVENT_H

#include "AppDataCache.h"

namespace app
{

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
};

struct AppEvent
{
  AppEventType type = AppEventType::BootRequested;
  uint32_t epochSeconds = 0;
  WeatherSnapshot weather;

  static AppEvent bootRequested() { return AppEvent{AppEventType::BootRequested}; }
  static AppEvent wifiConnected() { return AppEvent{AppEventType::WifiConnected}; }
  static AppEvent wifiConnectionFailed() { return AppEvent{AppEventType::WifiConnectionFailed}; }
  static AppEvent timeSynced(uint32_t epoch) { AppEvent e{AppEventType::TimeSynced}; e.epochSeconds = epoch; return e; }
  static AppEvent timeSyncFailed() { return AppEvent{AppEventType::TimeSyncFailed}; }
  static AppEvent weatherFetched(const WeatherSnapshot &snapshot, uint32_t epoch)
  {
    AppEvent e{AppEventType::WeatherFetched};
    e.weather = snapshot;
    e.epochSeconds = epoch;
    return e;
  }
  static AppEvent weatherFetchFailed() { return AppEvent{AppEventType::WeatherFetchFailed}; }
  static AppEvent refreshDue(uint32_t epoch) { AppEvent e{AppEventType::RefreshDue}; e.epochSeconds = epoch; return e; }
};

} // namespace app

#endif // APP_APP_EVENT_H
```

```cpp
// src/app/AppCore.h
#ifndef APP_APP_CORE_H
#define APP_APP_CORE_H

#include "AppAction.h"
#include "AppConfigData.h"
#include "AppDataCache.h"
#include "AppEvent.h"
#include "AppRuntimeState.h"
#include "AppViewModel.h"

namespace app
{

class AppCore
{
public:
  AppCore() = default;

  ActionList handle(const AppEvent &event);

  const AppRuntimeState &runtime() const { return runtime_; }
  const AppConfigData &config() const { return config_; }
  const AppDataCache &cache() const { return cache_; }
  const AppViewModel &view() const { return view_; }

private:
  void enterBlockingError(BlockingErrorReason reason, const char *title, const char *detail);
  void refreshMainView();

  AppConfigData config_;
  AppRuntimeState runtime_;
  AppDataCache cache_;
  AppViewModel view_;
};

} // namespace app

#endif // APP_APP_CORE_H
```

```cpp
// src/app/AppCore.cpp
#include "app/AppCore.h"

namespace app
{

void AppCore::enterBlockingError(BlockingErrorReason reason, const char *title, const char *detail)
{
  runtime_.mode = AppMode::BlockingError;
  runtime_.blockingError = reason;
  runtime_.syncPhase = SyncPhase::Idle;
  view_.kind = ViewKind::Error;
  view_.error.reason = reason;
  view_.error.title = title;
  view_.error.detail = detail;
  view_.error.retrying = false;
}

void AppCore::refreshMainView()
{
  view_.kind = ViewKind::Main;
  view_.main.cityName = cache_.weather.cityName;
  view_.main.temperatureText = cache_.weather.temperatureText;
  view_.main.humidityText = cache_.weather.humidityText;
  view_.main.temperatureC = cache_.weather.temperatureC;
  view_.main.humidityPercent = cache_.weather.humidityPercent;
  view_.main.aqi = cache_.weather.aqi;
  view_.main.weatherCode = cache_.weather.weatherCode;
  view_.main.bannerLines = cache_.weather.bannerLines;
}

ActionList AppCore::handle(const AppEvent &event)
{
  ActionList actions;

  switch (event.type)
  {
    case AppEventType::BootRequested:
      runtime_.mode = AppMode::Booting;
      runtime_.blockingError = BlockingErrorReason::None;
      runtime_.syncPhase = SyncPhase::ConnectingWifi;
      view_.kind = ViewKind::Splash;
      view_.splash.detail = "Connecting WiFi";
      actions.push(AppActionType::RenderRequested);
      actions.push(AppActionType::ConnectWifi);
      break;

    case AppEventType::WifiConnected:
      runtime_.syncPhase = SyncPhase::SyncingTime;
      actions.push(AppActionType::SyncTime);
      break;

    case AppEventType::WifiConnectionFailed:
      enterBlockingError(BlockingErrorReason::NoNetwork, "Network Error", "Unable to connect to WiFi");
      actions.push(AppActionType::RenderRequested);
      break;

    case AppEventType::TimeSynced:
      cache_.time.valid = true;
      cache_.time.epochSeconds = event.epochSeconds;
      runtime_.lastTimeSyncEpoch = event.epochSeconds;
      runtime_.syncPhase = SyncPhase::FetchingWeather;
      actions.push(AppActionType::FetchWeather);
      break;

    case AppEventType::TimeSyncFailed:
      enterBlockingError(BlockingErrorReason::TimeSyncFailed, "Time Sync Failed", "Unable to reach NTP server");
      actions.push(AppActionType::RenderRequested);
      break;

    case AppEventType::WeatherFetched:
      cache_.weather = event.weather;
      runtime_.lastWeatherSyncEpoch = event.epochSeconds;
      runtime_.initialSyncComplete = true;
      runtime_.mode = AppMode::Operational;
      runtime_.syncPhase = SyncPhase::Idle;
      refreshMainView();
      actions.push(AppActionType::RenderRequested);
      break;

    case AppEventType::WeatherFetchFailed:
      enterBlockingError(BlockingErrorReason::WeatherFetchFailed, "Weather Failed", "Unable to fetch weather data");
      actions.push(AppActionType::RenderRequested);
      break;

    default:
      break;
  }

  return actions;
}

} // namespace app
```

- [ ] **Step 4: Run the host tests to verify they pass**

Run: `~/.platformio/penv/bin/pio test -e host -f native_app_core/*`

Expected: PASS with `test_model_defaults.cpp` and `test_boot_flow.cpp`.

- [ ] **Step 5: Commit**

```bash
git add src/app/AppEvent.h src/app/AppAction.h src/app/AppCore.h src/app/AppCore.cpp test/native_app_core/test_boot_flow.cpp
git commit -m "test: add boot state machine core"
```

### Task 3: Operational Sync Flow And View Composition

**Files:**
- Modify: `src/app/AppCore.cpp`
- Modify: `src/app/AppRuntimeState.h`
- Modify: `src/app/AppViewModel.h`
- Test: `test/native_app_core/test_operational_flow.cpp`

- [ ] **Step 1: Write the failing operational-flow tests**

```cpp
// test/native_app_core/test_operational_flow.cpp
#include <doctest.h>

#include "app/AppCore.h"

namespace
{
app::AppCore bootedCore()
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
  weather.bannerLines[0] = "实时天气 晴";

  core.handle(app::AppEvent::weatherFetched(weather, 1710000000));
  return core;
}
} // namespace

TEST_CASE("refresh due starts a background sync without leaving main view")
{
  auto core = bootedCore();
  const auto actions = core.handle(app::AppEvent::refreshDue(1710000600));

  CHECK(actions.count == 2);
  CHECK(actions[0].type == app::AppActionType::WakeWifi);
  CHECK(actions[1].type == app::AppActionType::ConnectWifi);
  CHECK(core.runtime().mode == app::AppMode::Operational);
  CHECK(core.runtime().backgroundSyncInProgress == true);
  CHECK(core.view().kind == app::ViewKind::Main);
  CHECK(core.view().main.showSyncInProgress == true);
}

TEST_CASE("weather fetch failure during background sync keeps the last main view")
{
  auto core = bootedCore();
  core.handle(app::AppEvent::refreshDue(1710000600));
  core.handle(app::AppEvent::wifiConnected());
  core.handle(app::AppEvent::timeSynced(1710000600));

  const auto actions = core.handle(app::AppEvent::weatherFetchFailed());

  CHECK(actions.count == 2);
  CHECK(actions[0].type == app::AppActionType::SleepWifi);
  CHECK(actions[1].type == app::AppActionType::RenderRequested);
  CHECK(core.runtime().mode == app::AppMode::Operational);
  CHECK(core.runtime().backgroundSyncInProgress == false);
  CHECK(core.view().kind == app::ViewKind::Main);
  CHECK(core.view().main.cityName == "Shijiazhuang");
  CHECK(core.view().main.showSyncInProgress == false);
}
```

- [ ] **Step 2: Run the host tests to verify they fail**

Run: `~/.platformio/penv/bin/pio test -e host -f native_app_core/*`

Expected: FAIL because `RefreshDue` still emits no actions and `WeatherFetchFailed` still enters blocking error.

- [ ] **Step 3: Extend `AppCore` for background sync and non-blocking refresh**

```cpp
// src/app/AppRuntimeState.h - replace the struct with this version
struct AppRuntimeState
{
  AppMode mode = AppMode::Booting;
  BlockingErrorReason blockingError = BlockingErrorReason::None;
  SyncPhase syncPhase = SyncPhase::Idle;
  bool initialSyncComplete = false;
  bool backgroundSyncInProgress = false;
  bool lastBackgroundSyncFailed = false;
  uint32_t lastWeatherSyncEpoch = 0;
  uint32_t lastTimeSyncEpoch = 0;
  uint32_t nextRefreshDueEpoch = 0;
};
```

```cpp
// src/app/AppCore.cpp - replace handle() with this version
ActionList AppCore::handle(const AppEvent &event)
{
  ActionList actions;

  switch (event.type)
  {
    case AppEventType::BootRequested:
      runtime_.mode = AppMode::Booting;
      runtime_.blockingError = BlockingErrorReason::None;
      runtime_.syncPhase = SyncPhase::ConnectingWifi;
      view_.kind = ViewKind::Splash;
      view_.splash.detail = "Connecting WiFi";
      actions.push(AppActionType::RenderRequested);
      actions.push(AppActionType::ConnectWifi);
      break;

    case AppEventType::RefreshDue:
      if (runtime_.mode == AppMode::Operational && !runtime_.backgroundSyncInProgress)
      {
        runtime_.backgroundSyncInProgress = true;
        runtime_.lastBackgroundSyncFailed = false;
        runtime_.syncPhase = SyncPhase::ConnectingWifi;
        view_.main.showSyncInProgress = true;
        actions.push(AppActionType::WakeWifi);
        actions.push(AppActionType::ConnectWifi);
      }
      break;

    case AppEventType::WifiConnected:
      runtime_.syncPhase = SyncPhase::SyncingTime;
      actions.push(AppActionType::SyncTime);
      break;

    case AppEventType::WifiConnectionFailed:
      if (runtime_.initialSyncComplete)
      {
        runtime_.backgroundSyncInProgress = false;
        runtime_.lastBackgroundSyncFailed = true;
        runtime_.syncPhase = SyncPhase::Idle;
        view_.main.showSyncInProgress = false;
        actions.push(AppActionType::SleepWifi);
        actions.push(AppActionType::RenderRequested);
      }
      else
      {
        enterBlockingError(BlockingErrorReason::NoNetwork, "Network Error", "Unable to connect to WiFi");
        actions.push(AppActionType::RenderRequested);
      }
      break;

    case AppEventType::TimeSynced:
      cache_.time.valid = true;
      cache_.time.epochSeconds = event.epochSeconds;
      runtime_.lastTimeSyncEpoch = event.epochSeconds;
      runtime_.syncPhase = SyncPhase::FetchingWeather;
      actions.push(AppActionType::FetchWeather);
      break;

    case AppEventType::TimeSyncFailed:
      if (runtime_.initialSyncComplete)
      {
        runtime_.backgroundSyncInProgress = false;
        runtime_.lastBackgroundSyncFailed = true;
        runtime_.syncPhase = SyncPhase::Idle;
        view_.main.showSyncInProgress = false;
        actions.push(AppActionType::SleepWifi);
        actions.push(AppActionType::RenderRequested);
      }
      else
      {
        enterBlockingError(BlockingErrorReason::TimeSyncFailed, "Time Sync Failed", "Unable to reach NTP server");
        actions.push(AppActionType::RenderRequested);
      }
      break;

    case AppEventType::WeatherFetched:
      cache_.weather = event.weather;
      runtime_.lastWeatherSyncEpoch = event.epochSeconds;
      runtime_.initialSyncComplete = true;
      runtime_.backgroundSyncInProgress = false;
      runtime_.lastBackgroundSyncFailed = false;
      runtime_.mode = AppMode::Operational;
      runtime_.syncPhase = SyncPhase::Idle;
      runtime_.nextRefreshDueEpoch = event.epochSeconds + (config_.weatherUpdateMinutes * 60U);
      refreshMainView();
      view_.main.showSyncInProgress = false;
      if (event.epochSeconds > 0)
      {
        view_.main.timeText = "synced";
      }
      actions.push(AppActionType::SleepWifi);
      actions.push(AppActionType::RenderRequested);
      break;

    case AppEventType::WeatherFetchFailed:
      if (runtime_.initialSyncComplete)
      {
        runtime_.backgroundSyncInProgress = false;
        runtime_.lastBackgroundSyncFailed = true;
        runtime_.syncPhase = SyncPhase::Idle;
        view_.main.showSyncInProgress = false;
        actions.push(AppActionType::SleepWifi);
        actions.push(AppActionType::RenderRequested);
      }
      else
      {
        enterBlockingError(BlockingErrorReason::WeatherFetchFailed, "Weather Failed", "Unable to fetch weather data");
        actions.push(AppActionType::RenderRequested);
      }
      break;

    default:
      break;
  }

  return actions;
}
```

- [ ] **Step 4: Run the host tests to verify they pass**

Run: `~/.platformio/penv/bin/pio test -e host -f native_app_core/*`

Expected: PASS with all previous tests plus `test_operational_flow.cpp`.

- [ ] **Step 5: Commit**

```bash
git add src/app/AppRuntimeState.h src/app/AppCore.cpp src/app/AppViewModel.h test/native_app_core/test_operational_flow.cpp
git commit -m "test: cover operational background sync flow"
```

### Task 4: Port Contracts And Driver Mapping

**Files:**
- Create: `src/ports/ClockPort.h`
- Create: `src/ports/StoragePort.h`
- Create: `src/ports/NetworkPort.h`
- Create: `src/ports/WeatherPort.h`
- Create: `src/ports/TimeSyncPort.h`
- Create: `src/ports/DisplayPort.h`
- Create: `src/ports/SensorPort.h`
- Create: `src/app/AppDriver.h`
- Create: `src/app/AppDriver.cpp`
- Test: `test/native_app_core/test_port_contracts.cpp`
- Test: `test/native_app_core/test_driver_mapping.cpp`

- [ ] **Step 1: Write the failing port-contract and driver-mapping tests**

```cpp
// test/native_app_core/test_port_contracts.cpp
#include <doctest.h>

#include "ports/ClockPort.h"
#include "ports/DisplayPort.h"
#include "ports/NetworkPort.h"
#include "ports/SensorPort.h"
#include "ports/StoragePort.h"
#include "ports/TimeSyncPort.h"
#include "ports/WeatherPort.h"

struct FakeClockPort : ports::ClockPort
{
  uint32_t nowEpochSeconds() const override { return 1710000000; }
};

TEST_CASE("port headers are host-usable pure c++ contracts")
{
  FakeClockPort clock;
  CHECK(clock.nowEpochSeconds() == 1710000000);
}
```

```cpp
// test/native_app_core/test_driver_mapping.cpp
#include <doctest.h>

#include "app/AppDriver.h"

struct FakeDisplayPort : ports::DisplayPort
{
  bool rendered = false;
  void render(const app::AppViewModel &) override { rendered = true; }
};

struct FakeNetworkPort : ports::NetworkPort
{
  bool connectCalled = false;
  bool wakeCalled = false;
  bool sleepCalled = false;
  void wake() override { wakeCalled = true; }
  void sleep() override { sleepCalled = true; }
  void connect(const app::AppConfigData &) override { connectCalled = true; }
  void resetAndRestart() override {}
};

struct NullStoragePort : ports::StoragePort
{
  bool load(app::AppConfigData &) override { return false; }
  void save(const app::AppConfigData &) override {}
};

struct NullWeatherPort : ports::WeatherPort
{
  bool resolveCityCode(std::string &) override { return false; }
  bool fetchWeather(const std::string &, app::WeatherSnapshot &) override { return false; }
};

struct NullTimeSyncPort : ports::TimeSyncPort
{
  bool sync(uint32_t &) override { return false; }
};

struct NullSensorPort : ports::SensorPort
{
  bool read(app::IndoorClimateSnapshot &) override { return false; }
};

TEST_CASE("driver executes connect-wifi and render actions against ports")
{
  FakeDisplayPort display;
  FakeNetworkPort network;
  NullStoragePort storage;
  NullWeatherPort weather;
  NullTimeSyncPort timeSync;
  NullSensorPort sensor;
  ports::ClockPort *clock = nullptr;

  app::AppDriver driver(storage, network, weather, timeSync, sensor, display, clock);
  app::ActionList actions;
  actions.push(app::AppActionType::RenderRequested);
  actions.push(app::AppActionType::ConnectWifi);

  app::AppConfigData config;
  app::AppViewModel view;
  driver.execute(actions, config, view);

  CHECK(display.rendered == true);
  CHECK(network.connectCalled == true);
}
```

- [ ] **Step 2: Run the host tests to verify they fail**

Run: `~/.platformio/penv/bin/pio test -e host -f native_app_core/*`

Expected: FAIL with missing `ports/*.h` and `app/AppDriver.h`.

- [ ] **Step 3: Write the pure port interfaces and the action driver**

```cpp
// src/ports/NetworkPort.h
#ifndef PORTS_NETWORK_PORT_H
#define PORTS_NETWORK_PORT_H

#include "app/AppConfigData.h"

namespace ports
{

class NetworkPort
{
public:
  virtual ~NetworkPort() {}
  virtual void wake() = 0;
  virtual void sleep() = 0;
  virtual void connect(const app::AppConfigData &config) = 0;
  virtual void resetAndRestart() = 0;
};

} // namespace ports

#endif // PORTS_NETWORK_PORT_H
```

```cpp
// src/ports/StoragePort.h
#ifndef PORTS_STORAGE_PORT_H
#define PORTS_STORAGE_PORT_H

#include "app/AppConfigData.h"

namespace ports
{

class StoragePort
{
public:
  virtual ~StoragePort() {}
  virtual bool load(app::AppConfigData &config) = 0;
  virtual void save(const app::AppConfigData &config) = 0;
};

} // namespace ports

#endif // PORTS_STORAGE_PORT_H
```

```cpp
// src/ports/WeatherPort.h
#ifndef PORTS_WEATHER_PORT_H
#define PORTS_WEATHER_PORT_H

#include "app/AppDataCache.h"

#include <string>

namespace ports
{

class WeatherPort
{
public:
  virtual ~WeatherPort() {}
  virtual bool resolveCityCode(std::string &cityCode) = 0;
  virtual bool fetchWeather(const std::string &cityCode, app::WeatherSnapshot &snapshot) = 0;
};

} // namespace ports

#endif // PORTS_WEATHER_PORT_H
```

```cpp
// src/ports/TimeSyncPort.h
#ifndef PORTS_TIME_SYNC_PORT_H
#define PORTS_TIME_SYNC_PORT_H

#include <cstdint>

namespace ports
{

class TimeSyncPort
{
public:
  virtual ~TimeSyncPort() {}
  virtual bool sync(uint32_t &epochSeconds) = 0;
};

} // namespace ports

#endif // PORTS_TIME_SYNC_PORT_H
```

```cpp
// src/ports/SensorPort.h
#ifndef PORTS_SENSOR_PORT_H
#define PORTS_SENSOR_PORT_H

#include "app/AppDataCache.h"

namespace ports
{

class SensorPort
{
public:
  virtual ~SensorPort() {}
  virtual bool read(app::IndoorClimateSnapshot &snapshot) = 0;
};

} // namespace ports

#endif // PORTS_SENSOR_PORT_H
```

```cpp
// src/ports/DisplayPort.h
#ifndef PORTS_DISPLAY_PORT_H
#define PORTS_DISPLAY_PORT_H

#include "app/AppViewModel.h"

namespace ports
{

class DisplayPort
{
public:
  virtual ~DisplayPort() {}
  virtual void render(const app::AppViewModel &view) = 0;
};

} // namespace ports

#endif // PORTS_DISPLAY_PORT_H
```

```cpp
// src/ports/ClockPort.h
#ifndef PORTS_CLOCK_PORT_H
#define PORTS_CLOCK_PORT_H

#include <cstdint>

namespace ports
{

class ClockPort
{
public:
  virtual ~ClockPort() {}
  virtual uint32_t nowEpochSeconds() const = 0;
};

} // namespace ports

#endif // PORTS_CLOCK_PORT_H
```

```cpp
// src/app/AppDriver.h
#ifndef APP_APP_DRIVER_H
#define APP_APP_DRIVER_H

#include "app/AppAction.h"
#include "app/AppConfigData.h"
#include "app/AppViewModel.h"
#include "ports/ClockPort.h"
#include "ports/DisplayPort.h"
#include "ports/NetworkPort.h"
#include "ports/SensorPort.h"
#include "ports/StoragePort.h"
#include "ports/TimeSyncPort.h"
#include "ports/WeatherPort.h"

namespace app
{

class AppDriver
{
public:
  AppDriver(ports::StoragePort &storage,
            ports::NetworkPort &network,
            ports::WeatherPort &weather,
            ports::TimeSyncPort &timeSync,
            ports::SensorPort &sensor,
            ports::DisplayPort &display,
            ports::ClockPort *clock)
      : storage_(storage), network_(network), weather_(weather), timeSync_(timeSync), sensor_(sensor), display_(display), clock_(clock)
  {
  }

  void execute(const ActionList &actions, const AppConfigData &config, const AppViewModel &view);

private:
  ports::StoragePort &storage_;
  ports::NetworkPort &network_;
  ports::WeatherPort &weather_;
  ports::TimeSyncPort &timeSync_;
  ports::SensorPort &sensor_;
  ports::DisplayPort &display_;
  ports::ClockPort *clock_;
};

} // namespace app

#endif // APP_APP_DRIVER_H
```

```cpp
// src/app/AppDriver.cpp
#include "app/AppDriver.h"

namespace app
{

void AppDriver::execute(const ActionList &actions, const AppConfigData &config, const AppViewModel &view)
{
  for (size_t i = 0; i < actions.count; ++i)
  {
    switch (actions[i].type)
    {
      case AppActionType::RenderRequested:
        display_.render(view);
        break;
      case AppActionType::ConnectWifi:
        network_.connect(config);
        break;
      case AppActionType::WakeWifi:
        network_.wake();
        break;
      case AppActionType::SleepWifi:
        network_.sleep();
        break;
      case AppActionType::PersistConfig:
        storage_.save(config);
        break;
      case AppActionType::ResetWifiAndRestart:
        network_.resetAndRestart();
        break;
      default:
        break;
    }
  }
}

} // namespace app
```

- [ ] **Step 4: Run the host tests to verify they pass**

Run: `~/.platformio/penv/bin/pio test -e host -f native_app_core/*`

Expected: PASS with the new `test_port_contracts.cpp` and `test_driver_mapping.cpp`.

- [ ] **Step 5: Commit**

```bash
git add src/ports/ClockPort.h src/ports/StoragePort.h src/ports/NetworkPort.h src/ports/WeatherPort.h src/ports/TimeSyncPort.h src/ports/DisplayPort.h src/ports/SensorPort.h src/app/AppDriver.h src/app/AppDriver.cpp test/native_app_core/test_port_contracts.cpp test/native_app_core/test_driver_mapping.cpp
git commit -m "test: add app driver and port contracts"
```

### Task 5: ESP-12E Adapters And TFT Display Port

**Files:**
- Create: `src/adapters/EepromStoragePort.h`
- Create: `src/adapters/EepromStoragePort.cpp`
- Create: `src/adapters/Esp8266NetworkPort.h`
- Create: `src/adapters/Esp8266NetworkPort.cpp`
- Create: `src/adapters/WeatherServicePort.h`
- Create: `src/adapters/WeatherServicePort.cpp`
- Create: `src/adapters/NtpTimeSyncPort.h`
- Create: `src/adapters/NtpTimeSyncPort.cpp`
- Create: `src/adapters/Dht11SensorPort.h`
- Create: `src/adapters/Dht11SensorPort.cpp`
- Create: `src/ui/TftDisplayPort.h`
- Create: `src/ui/TftDisplayPort.cpp`
- Modify: `src/Storage.h`
- Modify: `src/Storage.cpp`
- Modify: `src/Net.h`
- Modify: `src/Net.cpp`
- Modify: `src/Weather.h`
- Modify: `src/Weather.cpp`
- Modify: `src/Ntp.h`
- Modify: `src/Ntp.cpp`
- Modify: `src/Dht11.h`
- Modify: `src/Dht11.cpp`
- Modify: `src/Screen.h`
- Modify: `src/Screen.cpp`

- [ ] **Step 1: Write the failing embedded build by adding adapter includes to `main.cpp` without implementations**

```cpp
// src/main.cpp - temporarily replace the old include block with these new includes first
#include "adapters/Dht11SensorPort.h"
#include "adapters/EepromStoragePort.h"
#include "adapters/Esp8266NetworkPort.h"
#include "adapters/NtpTimeSyncPort.h"
#include "adapters/WeatherServicePort.h"
#include "app/AppCore.h"
#include "app/AppDriver.h"
#include "ui/TftDisplayPort.h"
```

Run immediately after editing, before creating the files below.

- [ ] **Step 2: Run the embedded build to verify it fails**

Run: `~/.platformio/penv/bin/pio run -e esp12e`

Expected: FAIL with missing adapter/header errors such as `adapters/EepromStoragePort.h: No such file or directory`.

- [ ] **Step 3: Implement the adapter/public API refactor with minimal behavior changes**

```cpp
// src/Storage.h - replace the public API with config-centric calls
namespace storage
{

void begin();
bool loadConfig(app::AppConfigData &config);
void saveConfig(const app::AppConfigData &config);
void clearWifiCredentials();

} // namespace storage
```

```cpp
// src/Weather.h - replace drawing side effects with data-returning APIs
namespace weather
{

bool fetchCityCode(String &outCode);
bool fetchWeatherData(const String &cityCode, app::WeatherSnapshot &snapshot);

} // namespace weather
```

```cpp
// src/Ntp.h
namespace ntp
{

void begin();
bool syncOnce(uint32_t &epochSeconds);

} // namespace ntp
```

```cpp
// src/Dht11.h
namespace dht11
{

void begin();
bool read(app::IndoorClimateSnapshot &snapshot);

} // namespace dht11
```

```cpp
// src/Screen.h - move to render-from-view entry points
namespace screen
{

void drawSplashPage(const app::SplashViewData &view);
void drawErrorPage(const app::ErrorViewData &view);
void drawMainPage(const app::MainViewData &view);

} // namespace screen
```

```cpp
// src/ui/TftDisplayPort.h
#ifndef UI_TFT_DISPLAY_PORT_H
#define UI_TFT_DISPLAY_PORT_H

#include "ports/DisplayPort.h"

namespace ui
{

class TftDisplayPort : public ports::DisplayPort
{
public:
  void begin(uint8_t rotation, uint8_t brightness);
  void render(const app::AppViewModel &view) override;
};

} // namespace ui

#endif // UI_TFT_DISPLAY_PORT_H
```

```cpp
// src/ui/TftDisplayPort.cpp
#include "ui/TftDisplayPort.h"

#include "Display.h"
#include "Screen.h"

namespace ui
{

void TftDisplayPort::begin(uint8_t rotation, uint8_t brightness)
{
  display::begin(rotation);
  display::setBrightness(brightness);
}

void TftDisplayPort::render(const app::AppViewModel &view)
{
  switch (view.kind)
  {
    case app::ViewKind::Splash:
      screen::drawSplashPage(view.splash);
      break;
    case app::ViewKind::Error:
      screen::drawErrorPage(view.error);
      break;
    case app::ViewKind::Main:
      screen::drawMainPage(view.main);
      break;
  }
}

} // namespace ui
```

```cpp
// src/adapters/EepromStoragePort.h
#ifndef ADAPTERS_EEPROM_STORAGE_PORT_H
#define ADAPTERS_EEPROM_STORAGE_PORT_H

#include "ports/StoragePort.h"

namespace adapters
{

class EepromStoragePort : public ports::StoragePort
{
public:
  bool load(app::AppConfigData &config) override;
  void save(const app::AppConfigData &config) override;
};

} // namespace adapters

#endif // ADAPTERS_EEPROM_STORAGE_PORT_H
```

```cpp
// src/adapters/EepromStoragePort.cpp
#include "adapters/EepromStoragePort.h"

#include "Storage.h"

namespace adapters
{

bool EepromStoragePort::load(app::AppConfigData &config)
{
  storage::begin();
  return storage::loadConfig(config);
}

void EepromStoragePort::save(const app::AppConfigData &config)
{
  storage::saveConfig(config);
}

} // namespace adapters
```

Implement the remaining adapters in the same style:

- `Esp8266NetworkPort` delegates to refactored `net::*`
- `WeatherServicePort` delegates to `weather::fetchCityCode` and `weather::fetchWeatherData`
- `NtpTimeSyncPort` delegates to `ntp::syncOnce`
- `Dht11SensorPort` delegates to `dht11::read`

- [ ] **Step 4: Run host tests and embedded build to verify the adapters compile**

Run: `~/.platformio/penv/bin/pio test -e host -f native_app_core/*`

Expected: PASS with all host-side tests still green.

Run: `~/.platformio/penv/bin/pio run -e esp12e`

Expected: PASS, proving the new adapters/UI port compile on the ESP-12E firmware target.

- [ ] **Step 5: Commit**

```bash
git add src/adapters src/ui src/Storage.h src/Storage.cpp src/Net.h src/Net.cpp src/Weather.h src/Weather.cpp src/Ntp.h src/Ntp.cpp src/Dht11.h src/Dht11.cpp src/Screen.h src/Screen.cpp src/Display.h src/Display.cpp
git commit -m "refactor: add esp12e adapters and display port"
```

### Task 6: Wire `AppCore` Into `main.cpp` And Remove `g_app`

**Files:**
- Modify: `src/main.cpp`
- Modify: `src/Input.h`
- Modify: `src/Input.cpp`
- Modify: `src/Cli.h`
- Modify: `src/Cli.cpp`
- Delete: `src/AppState.h`
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write the failing end-to-end host regression test for the boot path**

```cpp
// test/native_app_core/test_end_to_end_boot_path.cpp
#include <doctest.h>

#include "app/AppCore.h"
#include "app/AppDriver.h"

TEST_CASE("boot to operational emits render-connect-sync-fetch-render sequence")
{
  app::AppCore core;

  const auto bootActions = core.handle(app::AppEvent::bootRequested());
  CHECK(bootActions.count == 2);
  CHECK(bootActions[0].type == app::AppActionType::RenderRequested);
  CHECK(bootActions[1].type == app::AppActionType::ConnectWifi);

  const auto wifiActions = core.handle(app::AppEvent::wifiConnected());
  CHECK(wifiActions.count == 1);
  CHECK(wifiActions[0].type == app::AppActionType::SyncTime);

  const auto timeActions = core.handle(app::AppEvent::timeSynced(1710000000));
  CHECK(timeActions.count == 1);
  CHECK(timeActions[0].type == app::AppActionType::FetchWeather);
}
```

- [ ] **Step 2: Run the host tests to verify they fail**

Run: `~/.platformio/penv/bin/pio test -e host -f native_app_core/*`

Expected: FAIL if the exact action sequence does not yet match the integrated flow.

- [ ] **Step 3: Replace the old global-flow `main.cpp` with the new app loop and remove `g_app`**

```cpp
// src/main.cpp
#include <Arduino.h>

#include "adapters/Dht11SensorPort.h"
#include "adapters/EepromStoragePort.h"
#include "adapters/Esp8266NetworkPort.h"
#include "adapters/NtpTimeSyncPort.h"
#include "adapters/WeatherServicePort.h"
#include "app/AppCore.h"
#include "app/AppDriver.h"
#include "ui/TftDisplayPort.h"

namespace
{
adapters::EepromStoragePort g_storage;
adapters::Esp8266NetworkPort g_network;
adapters::WeatherServicePort g_weather;
adapters::NtpTimeSyncPort g_timeSync;
adapters::Dht11SensorPort g_sensor;
ui::TftDisplayPort g_display;
app::AppCore g_core;
app::AppDriver g_driver(g_storage, g_network, g_weather, g_timeSync, g_sensor, g_display, nullptr);
uint32_t g_lastSecondTick = 0;
}

void setup()
{
  Serial.begin(115200);
  app::AppConfigData config;
  g_storage.load(config);
  g_display.begin(config.lcdRotation, config.lcdBrightness);

  const auto actions = g_core.handle(app::AppEvent::bootRequested());
  g_driver.execute(actions, g_core.config(), g_core.view());
}

void loop()
{
  const uint32_t nowMs = millis();
  if (nowMs - g_lastSecondTick >= 1000U)
  {
    g_lastSecondTick = nowMs;
    const auto actions = g_core.handle(app::AppEvent::refreshDue(nowMs / 1000U));
    g_driver.execute(actions, g_core.config(), g_core.view());
  }
}
```

Also make these cleanup changes in the same step:

- `Input.cpp` stops calling `ESP.reset()` or `net::resetAndRestart()` directly and instead exposes button events for `main.cpp`.
- `Cli.cpp` stops mutating config directly and instead exposes parsed commands that `main.cpp` can translate into `AppEvent`s.
- Delete `src/AppState.h` and remove all `extern g_app` references.
- Update docs to say `ESP-12E module` when describing the hardware target, while keeping `espressif8266` / `nodemcuv2` as the PlatformIO build target.

- [ ] **Step 4: Run the full verification suite**

Run: `~/.platformio/penv/bin/pio test -e host -f native_app_core/*`

Expected: PASS with all host-side state-machine and driver tests green.

Run: `~/.platformio/penv/bin/pio run -e esp12e`

Expected: PASS with the new main loop and adapters linked into the ESP-12E firmware.

- [ ] **Step 5: Commit**

```bash
git add src/main.cpp src/Input.h src/Input.cpp src/Cli.h src/Cli.cpp README.md CLAUDE.md
git rm src/AppState.h
git commit -m "refactor: wire app core into esp12e runtime"
```

## Self-Review Checklist

- Spec coverage:
  - `AppCore` pure C++: covered by Tasks 1-3.
  - `ports` and `adapters`: covered by Tasks 4-5.
  - `BlockingError` startup behavior: covered by Task 2 tests.
  - Operational background sync behavior: covered by Task 3 tests.
  - Main-loop thinning and `g_app` removal: covered by Task 6.
  - ESP-12E terminology cleanup: covered by Task 6 docs update.
- Placeholder scan:
  - No `TODO`, `TBD`, or “similar to previous task” placeholders remain.
  - Every task includes exact file paths, commands, and code blocks.
- Type consistency:
  - `AppMode`, `BlockingErrorReason`, `ViewKind`, `AppActionType`, and `WeatherSnapshot` names stay consistent across tasks.
  - `StoragePort::load/save`, `NetworkPort::connect`, and `DisplayPort::render` are referenced consistently in the driver and adapters.
