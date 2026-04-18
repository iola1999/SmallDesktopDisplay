#include <doctest.h>

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
};

struct DispatchNetworkPort : ports::NetworkPort
{
  bool connect(app::AppConfigData &) override
  {
    return true;
  }

  void wake() override {}
  void sleep() override {}
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
  bool resolveCityCode(std::string &) override
  {
    return true;
  }

  bool fetchWeather(const std::string &, app::WeatherSnapshot &snapshot) override
  {
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
  bool sync(uint32_t &epochSeconds) override
  {
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

TEST_CASE("driver dispatch executes synchronous boot flow to operational")
{
  DispatchStoragePort storage;
  DispatchNetworkPort network;
  DispatchWeatherPort weather;
  DispatchTimeSyncPort timeSync;
  DispatchSensorPort sensor;
  DispatchDisplayPort display;

  app::AppCore core;
  app::AppDriver driver(storage, network, weather, timeSync, sensor, display, nullptr);

  driver.dispatch(core, core.handle(app::AppEvent::bootRequested()));

  CHECK(core.runtime().mode == app::AppMode::Operational);
  CHECK(core.runtime().initialSyncComplete == true);
  CHECK(core.view().kind == app::ViewKind::Main);
  CHECK(core.view().main.cityName == "Shijiazhuang");
  CHECK(display.renderCount >= 2);
  CHECK(display.lastKind == app::ViewKind::Main);
}
