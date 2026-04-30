#include <Arduino.h>
#include <ESP8266WiFi.h>

#include "AppConfig.h"
#include "Display.h"
#include "Input.h"
#include "Net.h"
#include "Storage.h"
#include "app/DeviceStatusText.h"
#include "app/HoldProgress.h"
#include "remote/HttpFrameClient.h"
#include "remote/RemoteInputClient.h"
#include "ui/TftFrameSink.h"

namespace
{

app::AppConfigData g_config;
ui::TftFrameSink g_frameSink;
remote::HttpFrameClient g_frameClient(g_frameSink);
remote::RemoteInputClient g_inputClient;
uint32_t g_haveFrameId = 0;
uint32_t g_inputSequence = 0;
uint32_t g_lastFramePollMs = 0;
uint32_t g_lastErrorDrawMs = 0;
bool g_holdActive = false;
bool g_holdLongPressPosted = false;
uint32_t g_holdStartedMs = 0;
uint16_t g_holdLastPixels = UINT16_MAX;

constexpr int16_t kHoldBarX = 18;
constexpr int16_t kHoldBarY = 0;
constexpr uint16_t kHoldBarWidth = 204;
constexpr uint16_t kHoldBarHeight = 5;
constexpr uint32_t kHoldProgressDelayMs = 400;

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
  if (!g_holdActive)
  {
    return;
  }

  const uint16_t progress = app::delayedHoldProgressPixels(nowMs - g_holdStartedMs, kHoldProgressDelayMs,
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
  }
  g_holdLastPixels = progress;
}

void beginHold(uint32_t nowMs)
{
  g_holdActive = true;
  g_holdLongPressPosted = false;
  g_holdStartedMs = nowMs;
  g_holdLastPixels = UINT16_MAX;
}

void endHold()
{
  if (g_holdActive || g_holdLastPixels != UINT16_MAX)
  {
    clearHoldOverlay();
  }
  g_holdActive = false;
  g_holdLongPressPosted = false;
}

void postLongPressOnce(uint32_t nowMs)
{
  if (g_holdLongPressPosted)
  {
    return;
  }
  g_holdLongPressPosted = true;
  postRemoteInput("long_press", nowMs);
}

void handleButtonEvent(input::ButtonEvent event, uint32_t nowMs)
{
  switch (event)
  {
  case input::ButtonEvent::PressStarted:
    beginHold(nowMs);
    return;

  case input::ButtonEvent::PressReleased:
    endHold();
    return;

  case input::ButtonEvent::LongPressArmed:
    postLongPressOnce(nowMs);
    return;

  case input::ButtonEvent::LongPress:
    postLongPressOnce(nowMs);
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

void pollFrame(uint32_t nowMs)
{
  if (nowMs - g_lastFramePollMs < app_config::kRemoteFramePollMs)
  {
    return;
  }
  g_lastFramePollMs = nowMs;

  uint32_t nextFrameId = g_haveFrameId;
  const remote::FrameFetchResult result =
      g_frameClient.fetchLatest(g_config.remoteBaseUrl.c_str(), g_config.remoteDeviceId.c_str(), g_haveFrameId,
                                app_config::kRemoteFrameWaitMs, nextFrameId);

  if (result == remote::FrameFetchResult::Updated)
  {
    g_haveFrameId = nextFrameId;
    return;
  }

  if (result == remote::FrameFetchResult::Failed && nowMs - g_lastErrorDrawMs > 3000U)
  {
    g_lastErrorDrawMs = nowMs;
    const std::string ipLine = currentDeviceIpStatusLine();
    drawStatus("Render server offline", g_config.remoteBaseUrl.c_str(), ipLine.c_str());
  }
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
    pollFrame(nowMs);
  }
  else if (nowMs - g_lastErrorDrawMs > 3000U)
  {
    g_lastErrorDrawMs = nowMs;
    drawStatus("WiFi disconnected", "waiting");
  }

  updateHoldOverlay(nowMs);
}
