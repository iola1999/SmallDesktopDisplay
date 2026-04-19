#include "Weather.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WiFi.h>
#include <TimeLib.h>

#include "AppConfig.h"

namespace weather
{

namespace
{

WiFiClient s_client;

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

int parseHumidityPercent(const String &humidityText)
{
  String value = humidityText;
  value.replace("%", "");
  return value.toInt();
}

const char *aqiText(int aqi)
{
  if (aqi > 200)
    return "重度";
  if (aqi > 150)
    return "中度";
  if (aqi > 100)
    return "轻度";
  if (aqi > 50)
    return "良";
  return "优";
}

bool parsePayload(const String &payload, app::WeatherSnapshot &snapshot)
{
  int indexStart = payload.indexOf("weatherinfo\":");
  int indexEnd = payload.indexOf("};var alarmDZ");
  if (indexStart < 0 || indexEnd < 0)
    return false;
  const String jsonCityDZ = payload.substring(indexStart + 13, indexEnd);

  indexStart = payload.indexOf("dataSK =");
  indexEnd = payload.indexOf(";var dataZS");
  if (indexStart < 0 || indexEnd < 0)
    return false;
  const String jsonDataSK = payload.substring(indexStart + 8, indexEnd);

  indexStart = payload.indexOf("\"f\":[");
  indexEnd = payload.indexOf(",{\"fa");
  if (indexStart < 0 || indexEnd < 0)
    return false;
  const String jsonForecast = payload.substring(indexStart + 5, indexEnd);

  DynamicJsonDocument doc(1024);
  if (deserializeJson(doc, jsonDataSK))
    return false;

  const JsonObject sk = doc.as<JsonObject>();
  const String temperatureText = sk["temp"].as<String>();
  const String humidityText = sk["SD"].as<String>();
  const String cityName = sk["cityname"].as<String>();
  const String weatherCodeText = sk["weathercode"].as<String>();
  const String weatherText = sk["weather"].as<String>();
  const String windDir = sk["WD"].as<String>();
  const String windSpeed = sk["WS"].as<String>();

  snapshot.valid = true;
  snapshot.cityName = cityName.c_str();
  snapshot.temperatureText = temperatureText.c_str();
  snapshot.humidityText = humidityText.c_str();
  snapshot.temperatureC = temperatureText.toInt();
  snapshot.humidityPercent = parseHumidityPercent(humidityText);
  snapshot.aqi = sk["aqi"].as<int>();
  snapshot.weatherCode = weatherCodeText.length() >= 3 ? weatherCodeText.substring(1, 3).toInt() : 99;

  for (size_t index = 0; index < snapshot.bannerLines.size(); ++index)
  {
    snapshot.bannerLines[index].clear();
  }

  snapshot.bannerLines[0] = (String("实时天气 ") + weatherText).c_str();
  snapshot.bannerLines[1] = (String("空气质量 ") + aqiText(snapshot.aqi)).c_str();
  snapshot.bannerLines[2] = (String("风向 ") + windDir + windSpeed).c_str();

  doc.clear();
  if (!deserializeJson(doc, jsonCityDZ))
  {
    const JsonObject dz = doc.as<JsonObject>();
    snapshot.bannerLines[3] = (String("今日") + dz["weather"].as<String>()).c_str();
  }

  doc.clear();
  if (!deserializeJson(doc, jsonForecast))
  {
    const JsonObject fc = doc.as<JsonObject>();
    snapshot.bannerLines[4] = (String("最低温度") + fc["fd"].as<String>() + "℃").c_str();
    snapshot.bannerLines[5] = (String("最高温度") + fc["fc"].as<String>() + "℃").c_str();
  }

  return true;
}

void fillSkippedWeatherSnapshot(app::WeatherSnapshot &snapshot)
{
  snapshot = app::WeatherSnapshot{};
}

} // namespace

bool fetchCityCode(String &outCode)
{
  if (!app_config::kWeatherFetchEnabled)
  {
    outCode.clear();
    return false;
  }

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

bool fetchWeatherData(const String &cityCode, app::WeatherSnapshot &snapshot)
{
  if (!app_config::kWeatherFetchEnabled)
  {
    fillSkippedWeatherSnapshot(snapshot);
    return true;
  }

  String url = String("http://d1.weather.com.cn/weather_index/") + cityCode +
               ".html?_=" + String(now());
  String payload;

  for (uint8_t attempt = 0; attempt < app_config::kWeatherMaxRetries; attempt++)
  {
    int code = httpGet(url, payload);
    if (code == HTTP_CODE_OK && parsePayload(payload, snapshot))
    {
      Serial.println(F("[Weather] ok"));
      return true;
    }
    Serial.printf("[Weather] attempt %u failed (http %d)\n", attempt + 1, code);
    delay(500 * (attempt + 1));
  }
  return false;
}

} // namespace weather
