#include "Weather.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WiFi.h>
#include <TimeLib.h>

#include "AppConfig.h"
#include "AppState.h"
#include "Screen.h"

namespace weather
{

namespace
{

WiFiClient s_client;

// 通用 HTTP GET, 模拟 iPhone UA + Referer (接口要求)
int httpGet(const String &url, String &out)
{
  HTTPClient http;
  http.setTimeout(app_config::kWeatherHttpTimeoutMs);
  http.begin(s_client, url);
  http.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) "
                    "AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 "
                    "Mobile/15A372 Safari/604.1");
  http.addHeader("Referer", "http://www.weather.com.cn/");
  int code = http.GET();
  if (code == HTTP_CODE_OK)
    out = http.getString();
  http.end();
  return code;
}

bool renderPayload(const String &payload)
{
  int indexStart = payload.indexOf("weatherinfo\":");
  int indexEnd = payload.indexOf("};var alarmDZ");
  if (indexStart < 0 || indexEnd < 0)
    return false;
  String jsonCityDZ = payload.substring(indexStart + 13, indexEnd);

  indexStart = payload.indexOf("dataSK =");
  indexEnd = payload.indexOf(";var dataZS");
  if (indexStart < 0 || indexEnd < 0)
    return false;
  String jsonDataSK = payload.substring(indexStart + 8, indexEnd);

  indexStart = payload.indexOf("\"f\":[");
  indexEnd = payload.indexOf(",{\"fa");
  if (indexStart < 0 || indexEnd < 0)
    return false;
  String jsonFC = payload.substring(indexStart + 5, indexEnd);

  DynamicJsonDocument doc(1024);
  if (deserializeJson(doc, jsonDataSK))
    return false;
  JsonObject sk = doc.as<JsonObject>();

  int tempValue = sk["temp"].as<int>();
  int huminum = atoi((sk["SD"].as<String>()).substring(0, 2).c_str());
  int aqi = sk["aqi"].as<int>();
  String cityName = sk["cityname"].as<String>();
  int weatherCode = atoi((sk["weathercode"].as<String>()).substring(1, 3).c_str());
  String weatherText = sk["weather"].as<String>();
  String windDir = sk["WD"].as<String>();
  String windSpeed = sk["WS"].as<String>();

  screen::drawWeatherMain(sk["temp"].as<String>(), tempValue,
                          sk["SD"].as<String>(), huminum,
                          cityName, aqi, weatherCode);

  // 构造 banner 文本
  g_app.bannerText[0] = "实时天气 " + weatherText;
  const char *aqiTxt = "优";
  if (aqi > 200)
    aqiTxt = "重度";
  else if (aqi > 150)
    aqiTxt = "中度";
  else if (aqi > 100)
    aqiTxt = "轻度";
  else if (aqi > 50)
    aqiTxt = "良";
  g_app.bannerText[1] = String("空气质量 ") + aqiTxt;
  g_app.bannerText[2] = "风向 " + windDir + windSpeed;

  if (!deserializeJson(doc, jsonCityDZ))
  {
    JsonObject dz = doc.as<JsonObject>();
    g_app.bannerText[3] = "今日" + dz["weather"].as<String>();
  }
  if (!deserializeJson(doc, jsonFC))
  {
    JsonObject fc = doc.as<JsonObject>();
    g_app.bannerText[4] = "最低温度" + fc["fd"].as<String>() + "℃";
    g_app.bannerText[5] = "最高温度" + fc["fc"].as<String>() + "℃";
  }
  return true;
}

} // namespace

bool fetchCityCode(String &outCode)
{
  String url = String("http://wgeo.weather.com.cn/ip/?_=") + String(now());
  String payload;
  int code = httpGet(url, payload);
  if (code != HTTP_CODE_OK)
  {
    Serial.printf("[Weather] city code http %d\n", code);
    return false;
  }
  int p = payload.indexOf("id=");
  if (p < 0)
    return false;
  outCode = payload.substring(p + 4, p + 4 + 9);
  return true;
}

bool fetchAndRender()
{
  String url = String("http://d1.weather.com.cn/weather_index/") + g_app.cityCode +
               ".html?_=" + String(now());
  String payload;

  for (uint8_t attempt = 0; attempt < app_config::kWeatherMaxRetries; attempt++)
  {
    int code = httpGet(url, payload);
    if (code == HTTP_CODE_OK && renderPayload(payload))
    {
      Serial.println(F("[Weather] ok"));
      return true;
    }
    Serial.printf("[Weather] attempt %u failed (http %d)\n", attempt + 1, code);
    delay(500 * (attempt + 1));
  }
  screen::drawWeatherError("HTTP");
  return false;
}

} // namespace weather
