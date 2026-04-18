#ifndef APP_APP_VIEW_MODEL_H
#define APP_APP_VIEW_MODEL_H

#include "AppConfig.h"
#include "AppRuntimeState.h"

#include <array>
#include <cstddef>
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

enum class OperationalPageKind
{
  Home,
  Menu,
  Info,
  Adjust,
};

struct FooterHints
{
  std::string shortPressLabel;
  std::string longPressLabel;
};

struct ToastData
{
  bool visible = false;
  std::string text;
};

struct MenuItemData
{
  std::string label;
  bool selected = false;
};

struct MenuBodyData
{
  std::string title;
  std::string subtitle;
  std::array<MenuItemData, 4> items{};
  std::size_t itemCount = 0;
};

struct InfoRowData
{
  std::string label;
  std::string value;
};

struct InfoBodyData
{
  std::string title;
  std::string subtitle;
  std::array<InfoRowData, 10> rows{};
  std::size_t rowCount = 0;
  std::size_t visibleRowCount = 4;
  std::size_t firstVisibleRowIndex = 0;
  std::size_t selectedRowIndex = 0;
};

struct HoldFeedbackViewData
{
  bool visible = false;
  bool armed = false;
  uint32_t pressStartedMs = 0;
  uint8_t progressPercent = 0;
};

struct AdjustBodyData
{
  std::string title;
  std::string subtitle;
  int value = 0;
  int minValue = 0;
  int maxValue = 100;
  std::string unit = "%";
};

struct MainViewData
{
  OperationalPageKind pageKind = OperationalPageKind::Home;
  FooterHints footer;
  ToastData toast;
  MenuBodyData menu;
  InfoBodyData info;
  AdjustBodyData adjust;
  HoldFeedbackViewData holdFeedback;
  bool homeAnimationEnabled = false;

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
