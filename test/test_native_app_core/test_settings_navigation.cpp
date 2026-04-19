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
  CHECK(core.view().main.menu.itemCount == 3);
  CHECK(core.view().main.menu.items[0].label == "Diagnostics");
  CHECK(core.view().main.menu.items[0].selected == true);
  CHECK(core.view().main.menu.subtitle == "");
  CHECK(core.view().main.footer.shortPressLabel == "Next");
  CHECK(core.view().main.footer.longPressLabel == "OK");
  CHECK(core.view().main.footer.doublePressLabel == "Back");
}

TEST_CASE("press lifecycle events drive hold feedback without changing route")
{
  auto core = operationalCore();

  const auto started = core.handle(app::AppEvent::pressStarted(1000));
  CHECK(started.count == 0);
  CHECK(core.ui().holdFeedback.visible == true);
  CHECK(core.view().main.holdFeedback.visible == true);
  CHECK(core.view().main.holdFeedback.pressStartedMs == 1000);

  const auto armed = core.handle(app::AppEvent::longPressArmed(1200));
  CHECK(armed.count == 0);
  CHECK(core.ui().holdFeedback.armed == true);
  CHECK(core.view().main.holdFeedback.progressPercent == 100);

  const auto released = core.handle(app::AppEvent::pressReleased(1230));
  CHECK(released.count == 0);
  CHECK(core.ui().holdFeedback.visible == false);
  CHECK(core.view().main.holdFeedback.visible == false);
  CHECK(core.ui().route == app::UiRoute::Home);
}

TEST_CASE("double press returns from settings menu to home but does nothing on home")
{
  auto core = operationalCore();

  const auto homeActions = core.handle(app::AppEvent::doublePressed(5000));
  CHECK(homeActions.count == 0);
  CHECK(core.ui().route == app::UiRoute::Home);

  core.handle(app::AppEvent::longPressed(5001));
  const auto backActions = core.handle(app::AppEvent::doublePressed(5002));

  CHECK(backActions.count == 1);
  CHECK(backActions[0].type == app::AppActionType::RenderRequested);
  CHECK(core.ui().route == app::UiRoute::Home);
  CHECK(core.view().main.pageKind == app::OperationalPageKind::Home);
}

TEST_CASE("double press returns from diagnostics to settings")
{
  auto core = operationalCore();
  core.handle(app::AppEvent::longPressed(5000));

  app::DiagnosticsSnapshot snapshot;
  snapshot.valid = true;
  snapshot.savedWifiSsid = "Lab";
  snapshot.activeWifiSsid = "Lab";
  snapshot.wifiRadioAwake = true;
  snapshot.wifiLinkConnected = true;
  snapshot.refreshIntervalMinutes = 1;
  core.handle(app::AppEvent::diagnosticsSnapshotCaptured(snapshot));

  REQUIRE(core.ui().route == app::UiRoute::DiagnosticsPage);
  CHECK(core.view().main.info.subtitle == "");
  CHECK(core.view().main.footer.shortPressLabel == "Scroll");
  CHECK(core.view().main.footer.longPressLabel == "OK");
  CHECK(core.view().main.footer.doublePressLabel == "Back");

  const auto actions = core.handle(app::AppEvent::doublePressed(5001));
  CHECK(actions.count == 1);
  CHECK(actions[0].type == app::AppActionType::RenderRequested);
  CHECK(core.ui().route == app::UiRoute::SettingsMenu);
  CHECK(core.view().main.pageKind == app::OperationalPageKind::Menu);
}

TEST_CASE("reboot requires a confirmation menu before restart action")
{
  auto core = operationalCore();
  core.handle(app::AppEvent::longPressed(5000));
  core.handle(app::AppEvent::shortPressed(5001));
  core.handle(app::AppEvent::shortPressed(5002));

  const auto openConfirm = core.handle(app::AppEvent::longPressed(5003));
  CHECK(openConfirm.count == 1);
  CHECK(openConfirm[0].type == app::AppActionType::RenderRequested);
  CHECK(core.ui().route == app::UiRoute::RebootConfirmMenu);
  CHECK(core.view().main.menu.items[0].label == "Back");
  CHECK(core.view().main.menu.items[1].label == "Confirm Restart");

  core.handle(app::AppEvent::shortPressed(5004));
  const auto restart = core.handle(app::AppEvent::longPressed(5005));

  CHECK(restart.count == 1);
  CHECK(restart[0].type == app::AppActionType::RestartDevice);
}

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
