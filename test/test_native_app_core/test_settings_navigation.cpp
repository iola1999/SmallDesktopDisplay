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
  CHECK(core.view().main.menu.itemCount == 4);
  CHECK(core.view().main.menu.items[0].label == "Back");
  CHECK(core.view().main.menu.items[0].selected == true);
  CHECK(core.view().main.footer.shortPressLabel == "Next");
  CHECK(core.view().main.footer.longPressLabel == "Enter");
}

TEST_CASE("press lifecycle events drive hold feedback without changing route")
{
  auto core = operationalCore();

  const auto started = core.handle(app::AppEvent::pressStarted(1000));
  CHECK(started.count == 1);
  CHECK(started[0].type == app::AppActionType::RenderRequested);
  CHECK(core.ui().holdFeedback.visible == true);
  CHECK(core.view().main.holdFeedback.visible == true);
  CHECK(core.view().main.holdFeedback.pressStartedMs == 1000);

  const auto armed = core.handle(app::AppEvent::longPressArmed(1200));
  CHECK(armed.count == 1);
  CHECK(core.ui().holdFeedback.armed == true);
  CHECK(core.view().main.holdFeedback.progressPercent == 100);

  const auto released = core.handle(app::AppEvent::pressReleased(1230));
  CHECK(released.count == 1);
  CHECK(core.ui().holdFeedback.visible == false);
  CHECK(core.view().main.holdFeedback.visible == false);
  CHECK(core.ui().route == app::UiRoute::Home);
}

TEST_CASE("home is the only page that enables the right-bottom animation")
{
  auto core = operationalCore();

  CHECK(core.view().main.homeAnimationEnabled == true);

  core.handle(app::AppEvent::longPressed(1000));
  CHECK(core.view().main.homeAnimationEnabled == false);
}

TEST_CASE("reboot requires a confirmation menu before restart action")
{
  auto core = operationalCore();
  core.handle(app::AppEvent::longPressed(5000));
  core.handle(app::AppEvent::shortPressed(5001));
  core.handle(app::AppEvent::shortPressed(5002));
  core.handle(app::AppEvent::shortPressed(5003));

  const auto openConfirm = core.handle(app::AppEvent::longPressed(5004));
  CHECK(openConfirm.count == 1);
  CHECK(openConfirm[0].type == app::AppActionType::RenderRequested);
  CHECK(core.ui().route == app::UiRoute::RebootConfirmMenu);
  CHECK(core.view().main.menu.items[0].label == "Back");
  CHECK(core.view().main.menu.items[1].label == "Confirm Restart");

  core.handle(app::AppEvent::shortPressed(5005));
  const auto restart = core.handle(app::AppEvent::longPressed(5006));

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
