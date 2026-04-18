#ifndef APP_TRANSIENT_UI_H
#define APP_TRANSIENT_UI_H

#include "AppConfig.h"

#include <cstdint>

namespace app
{

enum class GestureFeedbackKind
{
  None,
  Tap,
  Hold,
  Back,
};

inline uint8_t holdFeedbackProgressPercent(uint32_t pressStartedMs, bool armed, uint32_t nowMs)
{
  if (armed)
  {
    return 100;
  }

  if (app_config::kButtonLongPressMs <= app_config::kHoldFeedbackDelayMs)
  {
    return 0;
  }

  if (nowMs <= pressStartedMs + app_config::kHoldFeedbackDelayMs)
  {
    return 0;
  }

  const uint32_t activeElapsedMs = nowMs - pressStartedMs - app_config::kHoldFeedbackDelayMs;
  const uint32_t activeDurationMs = app_config::kButtonLongPressMs - app_config::kHoldFeedbackDelayMs;
  if (activeElapsedMs >= activeDurationMs)
  {
    return 100;
  }

  return static_cast<uint8_t>((activeElapsedMs * 100U) / activeDurationMs);
}

inline bool gestureFeedbackVisible(uint32_t triggeredMs, uint32_t nowMs)
{
  if (triggeredMs == 0 || nowMs < triggeredMs)
  {
    return false;
  }

  return (nowMs - triggeredMs) < app_config::kGestureFeedbackDurationMs;
}

} // namespace app

#endif // APP_TRANSIENT_UI_H
