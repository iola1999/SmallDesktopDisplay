#include <doctest.h>

#include "AppConfig.h"
#include "app/AppCore.h"
#include "app/AppDriver.h"

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

struct DispatchNetworkPort : ports::NetworkPort
{
  int connectCalls = 0;
  app::WifiConnectMode lastMode = app::WifiConnectMode::ForegroundBlocking;

  bool connect(app::AppConfigData &, app::WifiConnectMode mode) override
  {
    ++connectCalls;
    lastMode = mode;
    return true;
  }

  void wake() override {}
  void sleep() override {}
  void restart() override {}
  void resetAndRestart() override {}
};

struct DispatchStoragePort : ports::StoragePort
{
  bool load(app::AppConfigData &) override
  {
    return false;
  }

  void save(const app::AppConfigData &) override {}
};

struct DispatchWeatherPort : ports::WeatherPort
{
  int fetchCalls = 0;

  bool resolveCityCode(std::string &) override
  {
    return true;
  }

  bool fetchWeather(const std::string &, app::WeatherSnapshot &snapshot) override
  {
    ++fetchCalls;
    snapshot.valid = true;
    snapshot.cityName = "Shijiazhuang";
    snapshot.temperatureText = "26";
    snapshot.humidityText = "40%";
    snapshot.temperatureC = 26;
    snapshot.humidityPercent = 40;
    snapshot.aqi = 42;
    snapshot.weatherCode = 1;
    snapshot.bannerLines[0] = "Realtime weather clear";
    return true;
  }
};

struct DispatchTimeSyncPort : ports::TimeSyncPort
{
  int syncCalls = 0;

  bool sync(uint32_t &epochSeconds) override
  {
    ++syncCalls;
    epochSeconds = 1710000000;
    return true;
  }
};

struct DispatchSensorPort : ports::SensorPort
{
  bool read(app::IndoorClimateSnapshot &) override
  {
    return false;
  }
};

struct NullSystemStatusPort : ports::SystemStatusPort
{
  app::DiagnosticsSnapshot capture(const app::AppConfigData &, const app::AppRuntimeState &) const override
  {
    return {};
  }
};

namespace
{

app::WeatherSnapshot sampleWeather()
{
  app::WeatherSnapshot snapshot;
  snapshot.valid = true;
  snapshot.cityName = "Shijiazhuang";
  snapshot.temperatureText = "26";
  snapshot.humidityText = "40%";
  snapshot.temperatureC = 26;
  snapshot.humidityPercent = 40;
  snapshot.aqi = 42;
  snapshot.weatherCode = 1;
  snapshot.bannerLines[0] = "Realtime weather clear";
  return snapshot;
}

} // namespace

TEST_CASE("driver dispatch defers the boot sync stage until the next pass")
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

  CHECK(network.connectCalls == 1);
  CHECK(network.lastMode == app::WifiConnectMode::ForegroundBlocking);
  CHECK(timeSync.syncCalls == 0);
  CHECK(weather.fetchCalls == 0);
  CHECK(core.runtime().mode == app::AppMode::Booting);
  CHECK(core.view().kind == app::ViewKind::Splash);
  CHECK(driver.hasPendingActions() == true);

  driver.dispatchPending(core);

  CHECK(timeSync.syncCalls == 1);
  CHECK(weather.fetchCalls == 0);
  CHECK(core.runtime().mode == app::AppMode::Operational);
  CHECK(core.runtime().initialSyncComplete == false);
  CHECK(core.view().kind == app::ViewKind::Main);
  CHECK(core.view().main.cityName.empty());
  CHECK(display.renderCount >= 2);
  CHECK(display.lastKind == app::ViewKind::Main);
  CHECK(driver.hasPendingActions() == false);
}

TEST_CASE("driver dispatch stages background sync across connect time and weather passes")
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
  driver.dispatchPending(core);
  core.handle(app::AppEvent::weatherFetched(sampleWeather(), 1710000000));

  driver.dispatch(core, core.handle(app::AppEvent::refreshDue(1710000600)));

  CHECK(network.connectCalls == 2);
  CHECK(timeSync.syncCalls == 1);
  CHECK(weather.fetchCalls == 0);
  CHECK(core.runtime().backgroundSyncInProgress == true);
  CHECK(driver.hasPendingActions() == true);

  driver.dispatchPending(core);

  CHECK(timeSync.syncCalls == 2);
  CHECK(weather.fetchCalls == 0);
  CHECK(core.runtime().backgroundSyncInProgress == true);
  CHECK(core.runtime().syncPhase == app::SyncPhase::FetchingWeather);
  CHECK(core.runtime().nextRefreshDueEpoch == 1710000000 + app_config::kPostTimeSyncWeatherDelaySec);
  CHECK(driver.hasPendingActions() == false);

  driver.dispatch(
    core,
    core.handle(app::AppEvent::refreshDue(1710000000 + app_config::kPostTimeSyncWeatherDelaySec)));

  CHECK(weather.fetchCalls == 1);
  CHECK(core.runtime().backgroundSyncInProgress == false);
  CHECK(core.runtime().mode == app::AppMode::Operational);
  CHECK(core.view().kind == app::ViewKind::Main);
  CHECK(driver.hasPendingActions() == false);
}
