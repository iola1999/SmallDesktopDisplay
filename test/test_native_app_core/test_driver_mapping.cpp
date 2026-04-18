#include <doctest.h>

#include "app/AppDriver.h"

struct FakeDisplayPort : ports::DisplayPort
{
  bool rendered = false;

  void render(const app::AppViewModel &) override
  {
    rendered = true;
  }
};

struct FakeNetworkPort : ports::NetworkPort
{
  bool connectCalled = false;
  bool wakeCalled = false;
  bool sleepCalled = false;

  void wake() override
  {
    wakeCalled = true;
  }

  void sleep() override
  {
    sleepCalled = true;
  }

  void connect(const app::AppConfigData &) override
  {
    connectCalled = true;
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
