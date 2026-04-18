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
  weather.bannerLines[0] = "Realtime weather clear";

  const auto actions = core.handle(app::AppEvent::weatherFetched(weather, 1710000000));

  CHECK(actions.count == 1);
  CHECK(actions[0].type == app::AppActionType::RenderRequested);
  CHECK(core.runtime().mode == app::AppMode::Operational);
  CHECK(core.runtime().initialSyncComplete == true);
  CHECK(core.view().kind == app::ViewKind::Main);
  CHECK(core.view().main.cityName == "Shijiazhuang");
}
