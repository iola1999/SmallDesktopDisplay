#include <doctest.h>

#include "app/AppDataCache.h"
#include "app/WeatherPayloadParser.h"

#include <string>

TEST_CASE("weather payload parser extracts current weather fields from upstream response")
{
  const std::string payload =
    R"PAYLOAD(var cityDZ ={"weatherinfo":{"city":"三河","cityname":"sanhe","temp":"999","tempn":"18","weather":"多云","wd":"东风转南风","ws":"3-4级","weathercode":"d1","weathercoden":"n1","fctime":"202604180800"}};var alarmDZ ={"w":[]};var dataSK ={"nameen":"sanhe","cityname":"三河","city":"101090609","temp":"16.5","tempf":"61.7","WD":"东风","wde":"E","WS":"1级","wse":"3km\/h","SD":"73%","sd":"73%","qy":"1007","njd":"9km","time":"02:30","rain":"0","rain24h":"0","aqi":"72","aqi_pm25":"72","weather":"晴","weathere":"Sunny","weathercode":"d00","limitnumber":"","date":"04月19日(星期日)"};var dataZS ={"zs":{"date":"2026041818"},"cn":"三河"};var fc ={"f":[{"fa":"01","fb":"01","fc":"26","fd":"14","fe":"东风","ff":"南风","fg":"3-4级","fh":"3-4级","fk":"2","fl":"4","fm":"80","fn":"61.3","fi":"4\/18","fj":"今天"},{"fa":"04","fb":"00","fc":"23","fd":"5","fe":"西北风","ff":"西北风","fg":"6-7级","fh":"4-5级","fk":"7","fl":"7","fm":"59.1","fn":"28.7","fi":"4\/19","fj":"星期日"}]};)PAYLOAD";

  app::WeatherSnapshot snapshot;
  CHECK(app::parseWeatherPayload(payload, snapshot) == true);
  CHECK(snapshot.valid == true);
  CHECK(snapshot.cityName == "三河");
  CHECK(snapshot.temperatureText == "16.5");
  CHECK(snapshot.humidityText == "73%");
  CHECK(snapshot.temperatureC == 16);
  CHECK(snapshot.humidityPercent == 73);
  CHECK(snapshot.aqi == 72);
  CHECK(snapshot.weatherCode == 0);
  CHECK(snapshot.bannerLines[0] == "实时天气 晴");
  CHECK(snapshot.bannerLines[1] == "空气质量 良");
  CHECK(snapshot.bannerLines[2] == "风向 东风1级");
  CHECK(snapshot.bannerLines[3] == "今日多云");
  CHECK(snapshot.bannerLines[4] == "最低温度14℃");
  CHECK(snapshot.bannerLines[5] == "最高温度26℃");
}

TEST_CASE("weather payload parser rejects payloads missing required sections")
{
  app::WeatherSnapshot snapshot;
  CHECK(app::parseWeatherPayload("{}", snapshot) == false);
}
