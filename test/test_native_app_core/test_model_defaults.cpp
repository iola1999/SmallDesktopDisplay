#include <doctest.h>

#include "app/AppConfigData.h"

TEST_CASE("default config uses firmware defaults for esp12e module")
{
  app::AppConfigData config;
  CHECK(config.lcdBrightness == app_config::kDefaultLcdBrightness);
  CHECK(config.lcdRotation == app_config::kDefaultLcdRotation);
  CHECK(config.remoteBaseUrl == app_config::kDefaultRemoteRenderBaseUrl);
  CHECK(config.remoteDeviceId == app_config::kDefaultRemoteDeviceId);
}

TEST_CASE("remote frame wait stays short enough for button sampling")
{
  CHECK(app_config::kRemoteFrameWaitMs <= 20);
}
