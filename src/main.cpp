#include <Arduino.h>
#include <ESP8266WiFi.h>

#include "AppConfig.h"
#include "Display.h"
#include "Input.h"
#include "Net.h"
#include "Storage.h"
#include "app/DeviceStatusText.h"
#include "app/HoldInteraction.h"
#include "app/HoldProgress.h"
#include "remote/RemoteCommandClient.h"
#include "remote/HttpFrameClient.h"
#include "remote/RemoteInputClient.h"
#include "remote/RemoteStatusClient.h"
#include "ui/TftFrameSink.h"

namespace
{

app::AppConfigData g_config;
ui::TftFrameSink g_frameSink;
remote::HttpFrameClient g_frameClient(g_frameSink);
remote::RemoteInputClient g_inputClient;
remote::RemoteCommandClient g_commandClient;
remote::RemoteStatusClient g_statusClient;
uint32_t g_haveFrameId = 0;
uint32_t g_lastCommandId = 0;
uint32_t g_inputSequence = 0;
uint32_t g_lastFramePollMs = 0;
uint32_t g_lastCommandPollMs = 0;
uint32_t g_lastStatusSyncMs = 0;
uint32_t g_lastErrorDrawMs = 0;
bool g_statusSyncPending = true;
app::HoldInteractionState g_holdInteraction;
uint32_t g_holdStartedMs = 0;
uint16_t g_holdLastPixels = UINT16_MAX;

constexpr int16_t kHoldBarX = 18;
constexpr int16_t kHoldBarY = 0;
constexpr uint16_t kHoldBarWidth = 204;
constexpr uint16_t kHoldBarHeight = 5;

void drawStatus(const char *line1, const char *line2, const char *line3 = nullptr)
{
  display::tft.fillScreen(app_config::kColorBg);
  display::tft.setTextDatum(CC_DATUM);
  const int titleY = line3 == nullptr ? 96 : 78;
  const int detailY = line3 == nullptr ? 128 : 116;
  display::tft.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::tft.drawString(line1, 120, titleY, 2);
  display::tft.setTextColor(TFT_YELLOW, app_config::kColorBg);
  display::tft.drawString(line2, 120, detailY, 2);
  if (line3 != nullptr)
  {
    display::tft.setTextColor(TFT_WHITE, app_config::kColorBg);
    display::tft.drawString(line3, 120, 154, 2);
  }
}

std::string currentDeviceIpStatusLine()
{
  if (WiFi.status() != WL_CONNECTED)
  {
    return app::buildDeviceIpStatusLine("");
  }

  const String localIp = WiFi.localIP().toString();
  return app::buildDeviceIpStatusLine(localIp.c_str());
}

const char *eventName(input::ButtonEvent event)
{
  switch (event)
  {
  case input::ButtonEvent::ShortPress:
    return "short_press";

  case input::ButtonEvent::DoublePress:
    return "double_press";

  case input::ButtonEvent::LongPress:
    return "long_press";

  case input::ButtonEvent::None:
  case input::ButtonEvent::PressStarted:
  case input::ButtonEvent::LongPressArmed:
  case input::ButtonEvent::PressReleased:
  default:
    return nullptr;
  }
}

void postRemoteInput(const char *name, uint32_t nowMs)
{
  ++g_inputSequence;
  if (g_inputClient.postEvent(g_config.remoteBaseUrl.c_str(), g_config.remoteDeviceId.c_str(), g_inputSequence, name,
                              nowMs))
  {
    Serial.printf("[RemoteInput] posted seq=%lu event=%s\n", static_cast<unsigned long>(g_inputSequence), name);
    return;
  }

  Serial.printf("[RemoteInput] post failed seq=%lu event=%s\n", static_cast<unsigned long>(g_inputSequence), name);
}

void clearHoldOverlay()
{
  display::tft.fillRect(kHoldBarX, kHoldBarY, kHoldBarWidth, kHoldBarHeight, app_config::kColorBg);
  g_holdLastPixels = UINT16_MAX;
}

void updateHoldOverlay(uint32_t nowMs)
{
  if (!g_holdInteraction.active)
  {
    return;
  }

  const uint16_t progress = app::delayedHoldProgressPixels(nowMs - g_holdStartedMs, app_config::kHoldProgressDelayMs,
                                                           app_config::kButtonLongPressMs, kHoldBarWidth);
  if (progress == 0 && g_holdLastPixels == UINT16_MAX)
  {
    return;
  }
  if (progress == g_holdLastPixels)
  {
    return;
  }

  display::tft.fillRect(kHoldBarX, kHoldBarY, kHoldBarWidth, kHoldBarHeight, TFT_DARKGREY);
  if (progress > 0)
  {
    display::tft.fillRect(kHoldBarX, kHoldBarY, progress, kHoldBarHeight, TFT_CYAN);
    app::markHoldOverlayDrawn(g_holdInteraction);
  }
  g_holdLastPixels = progress;
}

void beginHold(uint32_t nowMs)
{
  const app::HoldInteractionAction action = app::applyHoldEvent(g_holdInteraction, app::HoldEvent::PressStarted);
  g_holdStartedMs = nowMs;
  if (action.resetOverlayProgress)
  {
    g_holdLastPixels = UINT16_MAX;
  }
}

void endHold(uint32_t nowMs)
{
  const app::HoldInteractionAction action = app::applyHoldEvent(g_holdInteraction, app::HoldEvent::PressReleased);
  if (action.clearOverlay)
  {
    clearHoldOverlay();
  }
  if (action.postLongPress)
  {
    postRemoteInput("long_press", nowMs);
  }
}

void handleButtonEvent(input::ButtonEvent event, uint32_t nowMs)
{
  switch (event)
  {
  case input::ButtonEvent::PressStarted:
    beginHold(nowMs);
    return;

  case input::ButtonEvent::PressReleased:
    endHold(nowMs);
    return;

  case input::ButtonEvent::LongPressArmed:
    app::applyHoldEvent(g_holdInteraction, app::HoldEvent::LongPressArmed);
    return;

  case input::ButtonEvent::LongPress:
    app::applyHoldEvent(g_holdInteraction, app::HoldEvent::LongPress);
    return;

  case input::ButtonEvent::ShortPress:
  case input::ButtonEvent::DoublePress:
  {
    const char *name = eventName(event);
    if (name != nullptr)
    {
      postRemoteInput(name, nowMs);
    }
    return;
  }

  case input::ButtonEvent::None:
  default:
    return;
  }
}

void processButtonEvents(uint32_t nowMs)
{
  input::ButtonEvent event = input::ButtonEvent::None;
  while (input::pollEvent(event))
  {
    handleButtonEvent(event, nowMs);
  }
}

bool pollFrame(uint32_t nowMs)
{
  if (nowMs - g_lastFramePollMs < app_config::kRemoteFramePollMs)
  {
    return true;
  }
  g_lastFramePollMs = nowMs;

  uint32_t nextFrameId = g_haveFrameId;
  const remote::FrameFetchResult result =
      g_frameClient.fetchLatest(g_config.remoteBaseUrl.c_str(), g_config.remoteDeviceId.c_str(), g_haveFrameId,
                                app_config::kRemoteFrameWaitMs, nextFrameId);

  if (result == remote::FrameFetchResult::Updated)
  {
    g_haveFrameId = nextFrameId;
    return true;
  }
  if (result == remote::FrameFetchResult::NotModified)
  {
    return true;
  }

  if (result == remote::FrameFetchResult::Failed && nowMs - g_lastErrorDrawMs > 3000U)
  {
    g_lastErrorDrawMs = nowMs;
    const std::string ipLine = currentDeviceIpStatusLine();
    drawStatus("Render server offline", g_config.remoteBaseUrl.c_str(), ipLine.c_str());
  }
  return false;
}

void applyRemoteCommand(const remote::DeviceCommand &command)
{
  if (command.type != remote::DeviceCommandType::SetBrightness)
  {
    g_lastCommandId = command.id;
    return;
  }

  display::setBrightness(command.value);
  if (command.persist)
  {
    if (g_config.lcdBrightness != command.value)
    {
      g_config.lcdBrightness = command.value;
      storage::saveConfig(g_config);
    }
  }
  else
  {
    g_config.lcdBrightness = command.value;
  }

  g_lastCommandId = command.id;
  g_statusSyncPending = true;
  Serial.printf("[RemoteCommand] applied id=%lu brightness=%u persist=%s\n", static_cast<unsigned long>(command.id),
                command.value, command.persist ? "true" : "false");
}

void pollCommand(uint32_t nowMs)
{
  if (nowMs - g_lastCommandPollMs < app_config::kRemoteCommandPollMs)
  {
    return;
  }
  g_lastCommandPollMs = nowMs;

  remote::DeviceCommand command;
  const remote::CommandFetchResult result = g_commandClient.fetchLatest(
      g_config.remoteBaseUrl.c_str(), g_config.remoteDeviceId.c_str(), g_lastCommandId, command);
  if (result == remote::CommandFetchResult::Updated)
  {
    applyRemoteCommand(command);
  }
}

void syncDeviceStatus(uint32_t nowMs)
{
  if (!g_statusSyncPending && nowMs - g_lastStatusSyncMs < app_config::kRemoteStatusSyncMs)
  {
    return;
  }
  g_lastStatusSyncMs = nowMs;

  if (g_statusClient.postStatus(g_config.remoteBaseUrl.c_str(), g_config.remoteDeviceId.c_str(), g_config.lcdBrightness,
                                nowMs))
  {
    g_statusSyncPending = false;
    Serial.printf("[RemoteStatus] posted brightness=%u\n", g_config.lcdBrightness);
    return;
  }

  g_statusSyncPending = true;
  Serial.println(F("[RemoteStatus] post failed"));
}

} // namespace

void setup()
{
  Serial.begin(115200);
  Serial.println();
  Serial.printf("[%s] remote display boot\n", app_config::kVersion);

  storage::begin();
  storage::loadConfig(g_config);

  input::begin();
  display::begin(g_config.lcdRotation);
  display::setBrightness(g_config.lcdBrightness);
  drawStatus("Connecting WiFi", g_config.wifiSsid.empty() ? "setup portal" : g_config.wifiSsid.c_str());

  if (!net::connect(g_config, net::WifiConnectMode::ForegroundBlocking))
  {
    drawStatus("WiFi unavailable", "open setup portal");
    return;
  }

  Serial.printf("[Remote] server=%s device=%s ip=%s\n", g_config.remoteBaseUrl.c_str(), g_config.remoteDeviceId.c_str(),
                WiFi.localIP().toString().c_str());
  const std::string ipLine = currentDeviceIpStatusLine();
  drawStatus("Remote renderer", g_config.remoteBaseUrl.c_str(), ipLine.c_str());
}

void loop()
{
  net::tick();
  input::tick();

  const uint32_t nowMs = millis();
  processButtonEvents(nowMs);

  if (WiFi.status() == WL_CONNECTED)
  {
    if (pollFrame(nowMs))
    {
      pollCommand(nowMs);
      syncDeviceStatus(nowMs);
    }
  }
  else if (nowMs - g_lastErrorDrawMs > 3000U)
  {
    g_lastErrorDrawMs = nowMs;
    drawStatus("WiFi disconnected", "waiting");
  }

  updateHoldOverlay(nowMs);
}
