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
  std::string remoteBaseUrl = app_config::kDefaultRemoteRenderBaseUrl;
  std::string remoteDeviceId = app_config::kDefaultRemoteDeviceId;
  uint8_t lcdBrightness = app_config::kDefaultLcdBrightness;
  uint8_t lcdRotation = app_config::kDefaultLcdRotation;
};

} // namespace app

#endif // APP_APP_CONFIG_DATA_H
