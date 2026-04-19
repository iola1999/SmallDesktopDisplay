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

inline int16_t holdFeedbackFillWidth(uint8_t progressPercent, int16_t totalWidth)
{
  if (progressPercent >= 100)
  {
    return totalWidth;
  }

  return static_cast<int16_t>((static_cast<int32_t>(totalWidth) * progressPercent) / 100);
}

inline bool gestureFeedbackVisible(uint32_t triggeredMs, uint32_t nowMs)
{
  if (triggeredMs == 0 || nowMs < triggeredMs)
  {
    return false;
  }

  return (nowMs - triggeredMs) < app_config::kGestureFeedbackDurationMs;
}

inline bool gestureFeedbackShouldDraw(GestureFeedbackKind kind,
                                      uint32_t triggeredMs,
                                      uint32_t nowMs,
                                      bool alreadyDrawn)
{
  return kind != GestureFeedbackKind::None &&
         gestureFeedbackVisible(triggeredMs, nowMs) &&
         !alreadyDrawn;
}

inline bool holdFeedbackShouldClearWhenHidden(bool wasVisible,
                                              bool wasArmed,
                                              int lastFillWidth)
{
  return wasVisible || wasArmed || lastFillWidth >= 0;
}

} // namespace app

#endif // APP_TRANSIENT_UI_H
