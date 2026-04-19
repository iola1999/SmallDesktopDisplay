#include <doctest.h>

#include "AppConfig.h"
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

TEST_CASE("background refresh stays on the current route and uses silent connect mode")
{
  auto core = bootedCore();
  core.handle(app::AppEvent::longPressed(1000));
  const auto actions = core.handle(app::AppEvent::refreshDue(1710000600));

  CHECK(actions.count == 2);
  CHECK(actions[0].type == app::AppActionType::WakeWifi);
  CHECK(actions[1].type == app::AppActionType::ConnectWifi);
  CHECK(actions[1].payload.mode == app::WifiConnectMode::BackgroundSilent);
  CHECK(core.runtime().mode == app::AppMode::Operational);
  CHECK(core.runtime().backgroundSyncInProgress == true);
  CHECK(core.ui().route == app::UiRoute::SettingsMenu);
  CHECK(core.view().main.pageKind == app::OperationalPageKind::Menu);
  CHECK(core.view().main.homeAnimationEnabled == false);
}

TEST_CASE("weather fetch failure during background sync keeps the last main view")
{
  auto core = bootedCore();
  core.handle(app::AppEvent::refreshDue(1710000600));
  core.handle(app::AppEvent::wifiConnected());
  const auto syncActions = core.handle(app::AppEvent::timeSynced(1710000600));
  CHECK(syncActions.count == 0);

  const auto weatherActions = core.handle(
    app::AppEvent::refreshDue(1710000600 + app_config::kPostTimeSyncWeatherDelaySec));
  CHECK(weatherActions.count == 1);
  CHECK(weatherActions[0].type == app::AppActionType::FetchWeather);

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

TEST_CASE("first delayed weather fetch failure does not leave the operational shell")
{
  app::AppCore core;
  core.handle(app::AppEvent::bootRequested());
  core.handle(app::AppEvent::wifiConnected());
  core.handle(app::AppEvent::timeSynced(1710000000));

  const auto refreshActions = core.handle(
    app::AppEvent::refreshDue(1710000000 + app_config::kStartupWeatherDelaySec));
  CHECK(refreshActions.count == 2);
  CHECK(refreshActions[0].type == app::AppActionType::WakeWifi);
  CHECK(refreshActions[1].type == app::AppActionType::ConnectWifi);

  core.handle(app::AppEvent::wifiConnected());
  const auto syncActions = core.handle(app::AppEvent::timeSynced(1710000010));
  CHECK(syncActions.count == 0);

  const auto weatherActions = core.handle(
    app::AppEvent::refreshDue(1710000010 + app_config::kPostTimeSyncWeatherDelaySec));
  CHECK(weatherActions.count == 1);
  CHECK(weatherActions[0].type == app::AppActionType::FetchWeather);

  const auto actions = core.handle(app::AppEvent::weatherFetchFailed());

  CHECK(actions.count == 2);
  CHECK(actions[0].type == app::AppActionType::SleepWifi);
  CHECK(actions[1].type == app::AppActionType::RenderRequested);
  CHECK(core.runtime().mode == app::AppMode::Operational);
  CHECK(core.runtime().initialSyncComplete == false);
  CHECK(core.runtime().backgroundSyncInProgress == false);
  CHECK(core.view().kind == app::ViewKind::Main);
}

TEST_CASE("background time sync defers weather fetch for a short settling delay")
{
  auto core = bootedCore();
  core.handle(app::AppEvent::refreshDue(1710000600));
  core.handle(app::AppEvent::wifiConnected());

  const auto syncActions = core.handle(app::AppEvent::timeSynced(1710000600));

  CHECK(syncActions.count == 0);
  CHECK(core.runtime().backgroundSyncInProgress == true);
  CHECK(core.runtime().syncPhase == app::SyncPhase::FetchingWeather);
  CHECK(core.runtime().nextRefreshDueEpoch == 1710000600 + app_config::kPostTimeSyncWeatherDelaySec);

  const auto earlyActions = core.handle(app::AppEvent::refreshDue(1710000600 + app_config::kPostTimeSyncWeatherDelaySec - 1));
  CHECK(earlyActions.count == 0);

  const auto dueActions = core.handle(
    app::AppEvent::refreshDue(1710000600 + app_config::kPostTimeSyncWeatherDelaySec));
  CHECK(dueActions.count == 1);
  CHECK(dueActions[0].type == app::AppActionType::FetchWeather);
}
