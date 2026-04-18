#include <Arduino.h>
#include <TimeLib.h>

#include "Animate/Animate.h"
#include "Cli.h"
#include "Input.h"
#include "adapters/Dht11SensorPort.h"
#include "adapters/EepromStoragePort.h"
#include "adapters/Esp8266NetworkPort.h"
#include "adapters/NtpTimeSyncPort.h"
#include "adapters/WeatherServicePort.h"
#include "app/AppCore.h"
#include "app/AppDriver.h"
#include "ui/TftDisplayPort.h"

namespace
{

adapters::EepromStoragePort g_storage;
adapters::Esp8266NetworkPort g_network;
adapters::WeatherServicePort g_weather;
adapters::NtpTimeSyncPort g_timeSync;
adapters::Dht11SensorPort g_sensor;
ui::TftDisplayPort g_display;
app::AppCore g_core;
app::AppDriver g_driver(g_storage, g_network, g_weather, g_timeSync, g_sensor, g_display, nullptr);

uint32_t g_lastSecondTickMs = 0;
uint32_t g_lastBannerTickMs = 0;

void dispatch(const app::ActionList &actions)
{
  g_driver.dispatch(g_core, actions);
  animate::setDhtEnabled(g_core.config().dhtEnabled);
}

void applyCliCommand(const cli::Command &command)
{
  app::AppConfigData &config = g_core.configMutable();

  switch (command.type)
  {
    case cli::CommandType::SetBrightness:
      config.lcdBrightness = static_cast<uint8_t>(command.value);
      g_storage.save(config);
      g_display.setBrightness(config.lcdBrightness);
      break;

    case cli::CommandType::SetRotation:
      config.lcdRotation = static_cast<uint8_t>(command.value);
      g_storage.save(config);
      g_display.setRotation(config.lcdRotation);
      g_display.render(g_core.view());
      break;

    case cli::CommandType::SetWeatherUpdateMinutes:
      config.weatherUpdateMinutes = static_cast<uint32_t>(command.value);
      g_storage.save(config);
      break;

    case cli::CommandType::SetCityCode:
      config.cityCode = command.text;
      g_storage.save(config);
      if (g_core.runtime().mode == app::AppMode::Operational)
      {
        dispatch(g_core.handle(app::AppEvent::refreshDue(static_cast<uint32_t>(now()))));
      }
      break;

    case cli::CommandType::AutoDetectCity:
      config.cityCode.clear();
      g_storage.save(config);
      if (g_core.runtime().mode == app::AppMode::Operational)
      {
        dispatch(g_core.handle(app::AppEvent::refreshDue(static_cast<uint32_t>(now()))));
      }
      break;

    case cli::CommandType::ResetWifi:
      g_network.resetAndRestart();
      break;

    case cli::CommandType::None:
      break;
  }
}

} // namespace

void setup()
{
  Serial.begin(115200);
  Serial.println();
  Serial.printf("[%s] booting\n", app_config::kVersion);

  input::begin();

  app::AppConfigData config;
  g_storage.load(config);
  g_core.setConfig(config);
  g_display.begin(config.lcdRotation, config.lcdBrightness);
  animate::setDhtEnabled(config.dhtEnabled);

  dispatch(g_core.handle(app::AppEvent::bootRequested()));
}

void loop()
{
  input::tick();

  switch (input::consumeEvent())
  {
    case input::ButtonEvent::ShortPress:
      ESP.reset();
      break;

    case input::ButtonEvent::LongPress:
      g_network.resetAndRestart();
      break;

    case input::ButtonEvent::None:
      break;
  }

  cli::Command command;
  if (cli::poll(command))
  {
    applyCliCommand(command);
  }

  const uint32_t nowMs = millis();
  if (nowMs - g_lastSecondTickMs >= app_config::kTickMs)
  {
    g_lastSecondTickMs = nowMs;
    g_display.tickClock();
  }

  if (nowMs - g_lastBannerTickMs >= app_config::kBannerRefreshMs)
  {
    g_lastBannerTickMs = nowMs;
    g_display.tickBanner();
  }

  animate::tick();

  const uint32_t nowEpoch = static_cast<uint32_t>(now());
  if (g_core.runtime().mode == app::AppMode::Operational &&
      !g_core.runtime().backgroundSyncInProgress &&
      g_core.runtime().nextRefreshDueEpoch > 0 &&
      nowEpoch >= g_core.runtime().nextRefreshDueEpoch)
  {
    dispatch(g_core.handle(app::AppEvent::refreshDue(nowEpoch)));
  }
}
