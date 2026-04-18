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

struct UiSessionState
{
  UiRoute route = UiRoute::Home;
  uint8_t selectedMenuIndex = 0;
  uint8_t selectedBrightnessPresetIndex = 0;
  bool toastVisible = false;
  uint32_t toastDeadlineMs = 0;
  DiagnosticsSnapshot diagnostics;
};

} // namespace app

#endif // APP_UI_SESSION_STATE_H
