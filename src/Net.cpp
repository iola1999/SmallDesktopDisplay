#include "Net.h"

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>

#include "Display.h"
#include "Storage.h"

#if WM_EN
#include <WiFiManager.h>
#endif

namespace net
{

namespace
{

bool s_wifiAwake = true;
app::AppConfigData *s_config = nullptr;

#if WM_EN
WiFiManager s_wm;
#endif

long parseCityCode(const String &value)
{
  return value.toInt();
}

void loadingUntilConnected()
{
  uint8_t step = 1;
  while (WiFi.status() != WL_CONNECTED)
  {
    display::drawLoading(30, step);
    step = 1;
  }
  for (int index = 0; index < 194; ++index)
  {
    display::drawLoading(1, 1);
  }
}

#if WM_EN
void onSaveParam()
{
  if (!s_config)
    return;

  app::AppConfigData &config = *s_config;
#if DHT_EN
  config.dhtEnabled = String(s_wm.server->arg("DHT11_en")).toInt() != 0;
#endif
  config.weatherUpdateMinutes = String(s_wm.server->arg("WeaterUpdateTime")).toInt();
  config.lcdRotation = String(s_wm.server->arg("set_rotation")).toInt();
  config.lcdBrightness = String(s_wm.server->arg("LCDBL")).toInt();

  const long cityCode = parseCityCode(String(s_wm.server->arg("CityCode")));
  if (cityCode == 0)
  {
    config.cityCode.clear();
  }
  else if (cityCode >= 101000000L && cityCode <= 102000000L)
  {
    char buffer[12];
    snprintf(buffer, sizeof(buffer), "%ld", cityCode);
    config.cityCode = buffer;
  }

  storage::saveConfig(config);
  display::setRotation(config.lcdRotation);
  display::clear();
  display::setBrightness(config.lcdBrightness);
}

void runWebConfig(app::AppConfigData &config)
{
  s_config = &config;

  char brightness[4];
  char weatherUpdateMinutes[4];
  char cityCode[10];
#if DHT_EN
  char dhtEnabled[2];
  snprintf(dhtEnabled, sizeof(dhtEnabled), "%u", config.dhtEnabled ? 1 : 0);
#endif
  snprintf(brightness, sizeof(brightness), "%u", config.lcdBrightness);
  snprintf(weatherUpdateMinutes, sizeof(weatherUpdateMinutes), "%lu",
           static_cast<unsigned long>(config.weatherUpdateMinutes));
  strncpy(cityCode, config.cityCode.c_str(), sizeof(cityCode) - 1);
  cityCode[sizeof(cityCode) - 1] = '\0';

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
  WiFiManagerParameter paramBrightness("LCDBL", "屏幕亮度（1-100）", brightness, 3);
#if DHT_EN
  WiFiManagerParameter paramDht("DHT11_en", "Enable DHT11 sensor", dhtEnabled, 1);
#endif
  WiFiManagerParameter paramWeather("WeaterUpdateTime", "天气刷新时间（分钟）", weatherUpdateMinutes, 3);
  WiFiManagerParameter paramCity("CityCode", "城市代码", cityCode, 9);
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

  const bool ok = s_wm.autoConnect("AutoConnectAP");
  s_config = nullptr;
  if (!ok)
  {
    delay(1000);
    ESP.restart();
  }
}
#else
void runSmartConfig()
{
  WiFi.mode(WIFI_STA);
  WiFi.beginSmartConfig();
  while (true)
  {
    delay(100);
    if (WiFi.smartConfigDone())
    {
      break;
    }
  }
}
#endif

} // namespace

bool connect(app::AppConfigData &config)
{
  WiFi.begin(config.wifiSsid.c_str(), config.wifiPsk.c_str());

  const uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 12000)
  {
    display::drawLoading(30, 1);
  }

  if (WiFi.status() != WL_CONNECTED)
  {
#if WM_EN
    runWebConfig(config);
#else
    runSmartConfig();
#endif
  }

  loadingUntilConnected();

  if (WiFi.status() == WL_CONNECTED)
  {
    config.wifiSsid = WiFi.SSID().c_str();
    config.wifiPsk = WiFi.psk().c_str();
    storage::saveConfig(config);
    display::setRotation(config.lcdRotation);
    display::setBrightness(config.lcdBrightness);
    return true;
  }

  return false;
}

void sleep()
{
  WiFi.forceSleepBegin();
  s_wifiAwake = false;
}

void wake()
{
  WiFi.forceSleepWake();
  s_wifiAwake = true;
  delay(1);
}

void restart()
{
  ESP.restart();
}

void resetAndRestart()
{
#if WM_EN
  s_wm.resetSettings();
#endif
  storage::clearWifiCredentials();
  delay(200);
  ESP.restart();
}

} // namespace net
