#ifndef APP_APP_CONFIG_DATA_H
#define APP_APP_CONFIG_DATA_H

#include "AppConfig.h"

#include <cstdint>
#include <string>

namespace app
{

struct AppConfigData
{
  std::string wifiSsid;
  std::string wifiPsk;
  std::string cityCode = app_config::kDefaultCityCode;
  uint32_t weatherUpdateMinutes = app_config::kDefaultWeatherUpdateMinutes;
  uint8_t lcdBrightness = app_config::kDefaultLcdBrightness;
  uint8_t lcdRotation = app_config::kDefaultLcdRotation;
  bool dhtEnabled = false;
};

} // namespace app

#endif // APP_APP_CONFIG_DATA_H
