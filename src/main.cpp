#include <Arduino.h>
#include <ESP8266WiFi.h>

#include "AppConfig.h"
#include "Display.h"
#include "Input.h"
#include "Net.h"
#include "Storage.h"
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

void drawStatus(const char *line1, const char *line2)
{
  display::tft.fillScreen(app_config::kColorBg);
  display::tft.setTextDatum(CC_DATUM);
  display::tft.setTextColor(TFT_WHITE, app_config::kColorBg);
  display::tft.drawString(line1, 120, 96, 2);
  display::tft.setTextColor(TFT_YELLOW, app_config::kColorBg);
  display::tft.drawString(line2, 120, 128, 2);
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

void postButtonEvents(uint32_t nowMs)
{
  input::ButtonEvent event = input::ButtonEvent::None;
  while (input::pollEvent(event))
  {
    const char *name = eventName(event);
    if (name == nullptr)
    {
      continue;
    }

    ++g_inputSequence;
    if (!g_inputClient.postEvent(g_config.remoteBaseUrl.c_str(),
                                 g_config.remoteDeviceId.c_str(),
                                 g_inputSequence,
                                 name,
                                 nowMs))
    {
      Serial.printf("[RemoteInput] post failed seq=%lu event=%s\n",
                    static_cast<unsigned long>(g_inputSequence),
                    name);
    }
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
    g_frameClient.fetchLatest(g_config.remoteBaseUrl.c_str(),
                              g_config.remoteDeviceId.c_str(),
                              g_haveFrameId,
                              app_config::kRemoteFrameWaitMs,
                              nextFrameId);

  if (result == remote::FrameFetchResult::Updated)
  {
    g_haveFrameId = nextFrameId;
    return;
  }

  if (result == remote::FrameFetchResult::Failed &&
      nowMs - g_lastErrorDrawMs > 3000U)
  {
    g_lastErrorDrawMs = nowMs;
    drawStatus("Render server offline", g_config.remoteBaseUrl.c_str());
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

  Serial.printf("[Remote] server=%s device=%s ip=%s\n",
                g_config.remoteBaseUrl.c_str(),
                g_config.remoteDeviceId.c_str(),
                WiFi.localIP().toString().c_str());
  drawStatus("Remote renderer", g_config.remoteBaseUrl.c_str());
}

void loop()
{
  net::tick();
  input::tick();

  const uint32_t nowMs = millis();
  postButtonEvents(nowMs);

  if (WiFi.status() == WL_CONNECTED)
  {
    pollFrame(nowMs);
  }
  else if (nowMs - g_lastErrorDrawMs > 3000U)
  {
    g_lastErrorDrawMs = nowMs;
    drawStatus("WiFi disconnected", "waiting");
  }
}
