#ifndef APP_UI_SESSION_STATE_H
#define APP_UI_SESSION_STATE_H

#include "DiagnosticsSnapshot.h"

#include <cstdint>

namespace app
{

enum class UiRoute
{
  Home,
  SettingsMenu,
  DiagnosticsPage,
  BrightnessAdjustPage,
  RebootConfirmMenu,
};

struct InfoPageState
{
  uint8_t selectedRowIndex = 0;
  uint8_t firstVisibleRowIndex = 0;
};

struct HoldFeedbackState
{
  bool visible = false;
  bool armed = false;
  uint32_t pressStartedMs = 0;
  uint8_t progressPercent = 0;
};

struct UiSessionState
{
  UiRoute route = UiRoute::Home;
  uint8_t selectedMenuIndex = 0;
  uint8_t selectedBrightnessPresetIndex = 0;
  bool toastVisible = false;
  uint32_t toastDeadlineMs = 0;
  uint32_t nextDiagnosticsRefreshMs = 0;
  DiagnosticsSnapshot diagnostics;
  InfoPageState infoPage;
  HoldFeedbackState holdFeedback;
};

} // namespace app

#endif // APP_UI_SESSION_STATE_H
