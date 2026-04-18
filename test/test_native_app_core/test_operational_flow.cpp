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
  weather.bannerLines[0] = "Realtime weather clear";

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
