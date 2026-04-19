#include <doctest.h>

#include "app/AppConfigData.h"
#include "app/AppRuntimeState.h"
#include "app/AppViewModel.h"

TEST_CASE("default config uses firmware defaults for esp12e module")
{
  app::AppConfigData config;
  CHECK(config.cityCode == app_config::kDefaultCityCode);
  CHECK(config.weatherUpdateMinutes == app_config::kDefaultWeatherUpdateMinutes);
  CHECK(app_config::kWeatherFetchEnabled == true);
  CHECK(config.lcdBrightness == app_config::kDefaultLcdBrightness);
  CHECK(config.lcdRotation == app_config::kDefaultLcdRotation);
  CHECK(config.dhtEnabled == false);
}

TEST_CASE("default runtime starts in booting mode with splash view")
{
  app::AppRuntimeState runtime;
  app::AppViewModel view;

  CHECK(runtime.mode == app::AppMode::Booting);
  CHECK(runtime.blockingError == app::BlockingErrorReason::None);
  CHECK(runtime.backgroundSyncInProgress == false);
  CHECK(view.kind == app::ViewKind::Splash);
}
