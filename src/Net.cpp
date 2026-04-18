#include "Net.h"

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>

#include "AppState.h"
#include "Display.h"
#include "Ntp.h"
#include "Screen.h"
#include "Storage.h"
#include "Weather.h"

#if WM_EN
#include <WiFiManager.h>
#endif

namespace net
{

namespace
{

#if WM_EN
WiFiManager s_wm;
#endif

void loadingUntilConnected()
{
  uint8_t step = 1;
  while (WiFi.status() != WL_CONNECTED)
  {
    display::drawLoading(30, step);
    step = 1;
  }
  // 让动画走完
  for (int i = 0; i < 194; i++)
    display::drawLoading(1, 1);
}

#if WM_EN
void onSaveParam()
{
  Serial.println(F("[Net] saveParamCallback"));

#if DHT_EN
  g_app.dhtEnabled = String(s_wm.server->arg("DHT11_en")).toInt();
#endif
  g_app.weatherUpdateMinutes = String(s_wm.server->arg("WeaterUpdateTime")).toInt();
  long cc = String(s_wm.server->arg("CityCode")).toInt();
  g_app.lcdRotation = String(s_wm.server->arg("set_rotation")).toInt();
  g_app.lcdBrightness = String(s_wm.server->arg("LCDBL")).toInt();

  if ((cc >= 101000000 && cc <= 102000000) || cc == 0)
  {
    char buf[12];
    snprintf(buf, sizeof(buf), "%ld", cc);
    g_app.cityCode = String(buf);
  }

  storage::save(g_app);

  display::setRotation(g_app.lcdRotation);
  display::clear();
  screen::drawConfigFailed();

  display::setBrightness(g_app.lcdBrightness);
  Serial.printf("[Net] 亮度=%u 方向=%u 更新=%u 分钟 城市=%s\n",
                g_app.lcdBrightness, g_app.lcdRotation, g_app.weatherUpdateMinutes,
                g_app.cityCode.c_str());
}

void runWebConfig()
{
  WiFi.mode(WIFI_STA);
  delay(500);
  s_wm.resetSettings();

  const char *rotationHtml =
      "<br/><label for='set_rotation'>显示方向设置</label>"
      "<input type='radio' name='set_rotation' value='0' checked> USB接口朝下<br>"
      "<input type='radio' name='set_rotation' value='1'> USB接口朝右<br>"
      "<input type='radio' name='set_rotation' value='2'> USB接口朝上<br>"
      "<input type='radio' name='set_rotation' value='3'> USB接口朝左<br>";

  WiFiManagerParameter paramRotation(rotationHtml);
  WiFiManagerParameter paramBrightness("LCDBL", "屏幕亮度（1-100）", "10", 3);
#if DHT_EN
  WiFiManagerParameter paramDht("DHT11_en", "Enable DHT11 sensor", "0", 1);
#endif
  WiFiManagerParameter paramWeather("WeaterUpdateTime", "天气刷新时间（分钟）", "10", 3);
  WiFiManagerParameter paramCity("CityCode", "城市代码", "0", 9);
  WiFiManagerParameter br("<p></p>");

  s_wm.addParameter(&br);
  s_wm.addParameter(&paramCity);
  s_wm.addParameter(&br);
  s_wm.addParameter(&paramBrightness);
  s_wm.addParameter(&br);
  s_wm.addParameter(&paramWeather);
  s_wm.addParameter(&br);
  s_wm.addParameter(&paramRotation);
#if DHT_EN
  s_wm.addParameter(&br);
  s_wm.addParameter(&paramDht);
#endif
  s_wm.setSaveParamsCallback(onSaveParam);

  std::vector<const char *> menu = {"wifi", "restart"};
  s_wm.setMenu(menu);
  s_wm.setClass("invert");
  s_wm.setMinimumSignalQuality(20);

  bool ok = s_wm.autoConnect("AutoConnectAP");
  if (!ok)
  {
    Serial.println(F("[Net] WM autoConnect failed, restarting"));
    delay(1000);
    ESP.restart();
  }
}
#else
// SmartConfig 路径
void runSmartConfig()
{
  WiFi.mode(WIFI_STA);
  Serial.println(F("[Net] Wait for Smartconfig..."));
  WiFi.beginSmartConfig();
  while (true)
  {
    delay(100);
    if (WiFi.smartConfigDone())
    {
      Serial.println(F("[Net] SmartConfig done"));
      break;
    }
  }
}
#endif

} // namespace

void begin()
{
  WiFi.begin(g_app.wifi.ssid, g_app.wifi.psk);
  Serial.printf("[Net] connecting to %s\n", g_app.wifi.ssid);
}

bool ensureConnected()
{
  // 先等着普通连接
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 12000)
  {
    display::drawLoading(30, 1);
  }

  if (WiFi.status() != WL_CONNECTED)
  {
#if WM_EN
    runWebConfig();
#else
    runSmartConfig();
#endif
  }

  loadingUntilConnected();

  if (WiFi.status() == WL_CONNECTED)
  {
    strncpy(g_app.wifi.ssid, WiFi.SSID().c_str(), sizeof(g_app.wifi.ssid) - 1);
    strncpy(g_app.wifi.psk, WiFi.psk().c_str(), sizeof(g_app.wifi.psk) - 1);
    storage::saveWifi(g_app.wifi);
    Serial.printf("[Net] connected: %s\n", g_app.wifi.ssid);
    return true;
  }

  return false;
}

void sleep()
{
  WiFi.forceSleepBegin();
  g_app.wifiAwake = false;
  Serial.println(F("[Net] sleep"));
}

void wake()
{
  WiFi.forceSleepWake();
  g_app.wifiAwake = true;
  Serial.println(F("[Net] wake"));
}

bool awake()
{
  return g_app.wifiAwake;
}

void tickOnlineTasks()
{
  if (!g_app.wifiAwake)
    return;
  if (WiFi.status() != WL_CONNECTED)
    return;

  Serial.println(F("[Net] online, refresh data"));
  weather::fetchAndRender();
  ntp::syncOnce();
  sleep();
}

void resetAndRestart()
{
#if WM_EN
  s_wm.resetSettings();
#endif
  storage::clearWifi();
  delay(200);
  Serial.println(F("[Net] reset + restart"));
  ESP.restart();
}

} // namespace net
