#include <Arduino.h>
#include <TimeLib.h>

#include "Cli.h"
#include "Input.h"
#include "Net.h"
#include "adapters/EepromStoragePort.h"
#include "adapters/Esp8266NetworkPort.h"
#include "adapters/Esp8266SystemStatusPort.h"
#include "adapters/NtpTimeSyncPort.h"
#include "adapters/WeatherServicePort.h"
#include "app/BackgroundRefreshPolicy.h"
#include "app/AppCore.h"
#include "app/AppDriver.h"
#include "ui/TftDisplayPort.h"

namespace
{

adapters::EepromStoragePort g_storage;
adapters::Esp8266NetworkPort g_network;
adapters::WeatherServicePort g_weather;
adapters::NtpTimeSyncPort g_timeSync;
adapters::Esp8266SystemStatusPort g_systemStatus;
ui::TftDisplayPort g_display;
app::AppCore g_core;
app::AppDriver g_driver(g_storage, g_network, g_weather, g_timeSync, g_systemStatus, g_display, nullptr);

uint32_t g_lastSecondTickMs = 0;
uint32_t g_lastBannerTickMs = 0;
uint32_t g_lastHoldFeedbackTickMs = 0;
uint32_t g_lastUiMotionTickMs = 0;

void dispatch(const app::ActionList &actions)
{
  g_driver.dispatch(g_core, actions);
}

void dispatchPending()
{
  g_driver.dispatchPending(g_core);
}

void showGestureFeedbackIfHandled(input::ButtonEvent inputEvent,
                                  const app::ActionList &actions,
                                  uint32_t nowMs)
{
  if (actions.count == 0)
  {
    return;
  }

  switch (inputEvent)
  {
    case input::ButtonEvent::ShortPress:
      g_display.showGestureFeedback(app::GestureFeedbackKind::Tap, nowMs);
      break;

    case input::ButtonEvent::DoublePress:
      g_display.showGestureFeedback(app::GestureFeedbackKind::Back, nowMs);
      break;

    case input::ButtonEvent::LongPress:
      g_display.showGestureFeedback(app::GestureFeedbackKind::Hold, nowMs);
      break;

    case input::ButtonEvent::None:
    case input::ButtonEvent::PressStarted:
    case input::ButtonEvent::LongPressArmed:
    case input::ButtonEvent::PressReleased:
      break;
  }
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
  Serial.printf("[Reset] %s\n", ESP.getResetInfo().c_str());

  input::begin();
  Serial.println(F("[Setup] input ready"));

  app::AppConfigData config;
  g_storage.load(config);
  g_core.setConfig(config);
  Serial.println(F("[Setup] display begin"));
  g_display.begin(config.lcdRotation, config.lcdBrightness);
  Serial.println(F("[Setup] display ready"));

  Serial.println(F("[Setup] boot dispatch"));
  dispatch(g_core.handle(app::AppEvent::bootRequested()));
  Serial.println(F("[Setup] boot dispatch done"));
}

void loop()
{
  net::tick();
  input::tick();
  const uint32_t nowMs = millis();

  input::ButtonEvent inputEvent = input::ButtonEvent::None;
  while (input::pollEvent(inputEvent))
  {
    switch (inputEvent)
    {
      case input::ButtonEvent::PressStarted:
        dispatch(g_core.handle(app::AppEvent::pressStarted(nowMs)));
        break;

      case input::ButtonEvent::LongPressArmed:
        dispatch(g_core.handle(app::AppEvent::longPressArmed(nowMs)));
        break;

      case input::ButtonEvent::PressReleased:
        dispatch(g_core.handle(app::AppEvent::pressReleased(nowMs)));
        break;

      case input::ButtonEvent::ShortPress:
      {
        const auto actions = g_core.handle(app::AppEvent::shortPressed(nowMs));
        dispatch(actions);
        showGestureFeedbackIfHandled(inputEvent, actions, nowMs);
        break;
      }

      case input::ButtonEvent::DoublePress:
      {
        const auto actions = g_core.handle(app::AppEvent::doublePressed(nowMs));
        dispatch(actions);
        showGestureFeedbackIfHandled(inputEvent, actions, nowMs);
        break;
      }

      case input::ButtonEvent::LongPress:
      {
        const auto actions = g_core.handle(app::AppEvent::longPressed(nowMs));
        dispatch(actions);
        showGestureFeedbackIfHandled(inputEvent, actions, nowMs);
        break;
      }

      case input::ButtonEvent::None:
        break;
    }
  }

  if (nowMs - g_lastHoldFeedbackTickMs >= app_config::kHoldFeedbackRefreshMs)
  {
    g_lastHoldFeedbackTickMs = nowMs;
    g_display.tickTransientUi(g_core.view(), nowMs);
  }

  if (nowMs - g_lastUiMotionTickMs >= app_config::kUiMotionTickMs)
  {
    g_lastUiMotionTickMs = nowMs;
    g_display.tickMotion(g_core.view(), nowMs);
  }

  if (g_core.ui().toastVisible && nowMs >= g_core.ui().toastDeadlineMs)
  {
    dispatch(g_core.handle(app::AppEvent::toastExpired()));
  }

  cli::Command command;
  if (cli::poll(command))
  {
    applyCliCommand(command);
  }

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

  const uint32_t nowEpoch = static_cast<uint32_t>(now());
  const app::AppRuntimeState &runtime = g_core.runtime();
  const app::UiSessionState &ui = g_core.ui();
  if (app::shouldTriggerScheduledRefresh(runtime, ui, nowEpoch))
  {
    dispatch(g_core.handle(app::AppEvent::refreshDue(nowEpoch)));
  }

  if (g_driver.hasPendingActions())
  {
    dispatchPending();
  }
}
