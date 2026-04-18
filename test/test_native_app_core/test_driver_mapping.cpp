#include <doctest.h>

#include "app/AppDriver.h"

struct FakeDisplayPort : ports::DisplayPort
{
  bool rendered = false;
  int brightness = -1;

  void render(const app::AppViewModel &) override
  {
    rendered = true;
  }

  void setBrightness(uint8_t percent) override
  {
    brightness = percent;
  }
};

struct FakeNetworkPort : ports::NetworkPort
{
  bool connectCalled = false;
  bool wakeCalled = false;
  bool sleepCalled = false;
  bool restartCalled = false;
  app::WifiConnectMode lastMode = app::WifiConnectMode::ForegroundBlocking;

  void wake() override
  {
    wakeCalled = true;
  }

  void sleep() override
  {
    sleepCalled = true;
  }

  bool connect(app::AppConfigData &, app::WifiConnectMode mode) override
  {
    connectCalled = true;
    lastMode = mode;
    return true;
  }

  void restart() override
  {
    restartCalled = true;
  }

  void resetAndRestart() override {}
};

struct NullSystemStatusPort : ports::SystemStatusPort
{
  app::DiagnosticsSnapshot capture(const app::AppConfigData &, const app::AppRuntimeState &) const override
  {
    return {};
  }
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
  actions.push(app::AppActionType::RenderRequested);
  actions.pushConnectWifi(app::WifiConnectMode::BackgroundSilent);

  app::AppConfigData config;
  app::AppViewModel view;
  driver.execute(actions, config, view);

  CHECK(display.rendered == true);
  CHECK(network.connectCalled == true);
  CHECK(network.lastMode == app::WifiConnectMode::BackgroundSilent);
}

TEST_CASE("driver applies preview and persistent brightness actions")
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
  actions.push(app::AppActionType::PreviewBrightness, 55);
  actions.push(app::AppActionType::ApplyBrightness, 70);

  app::AppConfigData config;
  config.lcdBrightness = 70;
  app::AppViewModel view;
  driver.execute(actions, config, view);

  CHECK(display.brightness == 70);
}
