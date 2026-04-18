#include <doctest.h>

#include "app/AppCore.h"

namespace
{

app::AppCore brightnessCore()
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
  core.configMutable().lcdBrightness = 40;
  return core;
}

void enterBrightness(app::AppCore &core)
{
  core.handle(app::AppEvent::longPressed(1000));
  core.handle(app::AppEvent::shortPressed(1001));
  core.handle(app::AppEvent::shortPressed(1002));
  core.handle(app::AppEvent::longPressed(1003));
}

} // namespace

TEST_CASE("brightness page previews the next preset without persisting")
{
  auto core = brightnessCore();
  enterBrightness(core);

  const auto actions = core.handle(app::AppEvent::shortPressed(1004));

  CHECK(actions.count == 2);
  CHECK(actions[0].type == app::AppActionType::PreviewBrightness);
  CHECK(actions[0].value == 55);
  CHECK(actions[1].type == app::AppActionType::RenderRequested);
  CHECK(core.ui().route == app::UiRoute::BrightnessAdjustPage);
  CHECK(core.config().lcdBrightness == 40);
  CHECK(core.view().main.pageKind == app::OperationalPageKind::Adjust);
  CHECK(core.view().main.adjust.value == 55);
  CHECK(core.view().main.footer.shortPressLabel == "Cycle");
  CHECK(core.view().main.footer.longPressLabel == "Save");
}

TEST_CASE("long press on brightness page applies and saves the preset")
{
  auto core = brightnessCore();
  enterBrightness(core);
  core.handle(app::AppEvent::shortPressed(1004));

  const auto actions = core.handle(app::AppEvent::longPressed(1005));

  CHECK(actions.count == 2);
  CHECK(actions[0].type == app::AppActionType::ApplyBrightness);
  CHECK(actions[0].value == 55);
  CHECK(actions[1].type == app::AppActionType::RenderRequested);
  CHECK(core.config().lcdBrightness == 55);
  CHECK(core.ui().route == app::UiRoute::SettingsMenu);
}
