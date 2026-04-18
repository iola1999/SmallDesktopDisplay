#ifndef APP_APP_DATA_CACHE_H
#define APP_APP_DATA_CACHE_H

#include "AppConfig.h"

#include <array>
#include <cstdint>
#include <string>

namespace app
{

struct WeatherSnapshot
{
  bool valid = false;
  std::string cityName;
  std::string temperatureText;
  std::string humidityText;
  int temperatureC = 0;
  int humidityPercent = 0;
  int aqi = 0;
  int weatherCode = 99;
  std::array<std::string, app_config::kBannerSlotCount> bannerLines{};
};

struct TimeSnapshot
{
  bool valid = false;
  uint32_t epochSeconds = 0;
};

struct IndoorClimateSnapshot
{
  bool valid = false;
  float temperatureC = 0.0f;
  float humidityPercent = 0.0f;
};

struct AppDataCache
{
  WeatherSnapshot weather;
  TimeSnapshot time;
  IndoorClimateSnapshot indoor;
};

} // namespace app

#endif // APP_APP_DATA_CACHE_H
