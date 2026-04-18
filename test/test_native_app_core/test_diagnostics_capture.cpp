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

struct FakeDisplayPort : ports::DisplayPort
{
  void render(const app::AppViewModel &) override {}
  void setBrightness(uint8_t) override {}
};

struct FakeNetworkPort : ports::NetworkPort
{
  bool restartCalled = false;

  bool connect(app::AppConfigData &) override
  {
    return true;
  }

  void wake() override {}
  void sleep() override {}
  void restart() override
  {
    restartCalled = true;
  }
  void resetAndRestart() override {}
};

struct NullStoragePort : ports::StoragePort
{
  bool load(app::AppConfigData &) override
  {
    return false;
  }

  void save(const app::AppConfigData &) override {}
};

struct NullWeatherPort : ports::WeatherPort
{
  bool resolveCityCode(std::string &) override
  {
    return false;
  }

  bool fetchWeather(const std::string &, app::WeatherSnapshot &) override
  {
    return false;
  }
};

struct NullTimeSyncPort : ports::TimeSyncPort
{
  bool sync(uint32_t &) override
  {
    return false;
  }
};

struct NullSensorPort : ports::SensorPort
{
  bool read(app::IndoorClimateSnapshot &) override
  {
    return false;
  }
};

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
