#ifndef APP_APP_VIEW_MODEL_H
#define APP_APP_VIEW_MODEL_H

#include "AppConfig.h"
#include "AppRuntimeState.h"

#include <array>
#include <string>

namespace app
{

enum class ViewKind
{
  Splash,
  Error,
  Main,
};

struct SplashViewData
{
  std::string title = "SmallDesktopDisplay";
  std::string detail = "Booting";
};

struct ErrorViewData
{
  BlockingErrorReason reason = BlockingErrorReason::None;
  std::string title;
  std::string detail;
  bool retrying = false;
};

struct MainViewData
{
  std::string timeText = "--:--:--";
  std::string dateText;
  std::string cityName;
  std::string temperatureText;
  std::string humidityText;
  int temperatureC = 0;
  int humidityPercent = 0;
  int aqi = 0;
  int weatherCode = 99;
  std::array<std::string, app_config::kBannerSlotCount> bannerLines{};
  bool showSyncInProgress = false;
  bool showIndoorClimate = false;
  float indoorTemperatureC = 0.0f;
  float indoorHumidityPercent = 0.0f;
};

struct AppViewModel
{
  ViewKind kind = ViewKind::Splash;
  SplashViewData splash;
  ErrorViewData error;
  MainViewData main;
};

} // namespace app

#endif // APP_APP_VIEW_MODEL_H
