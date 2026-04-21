#ifndef APP_BACKGROUND_REFRESH_POLICY_H
#define APP_BACKGROUND_REFRESH_POLICY_H

#include "AppRuntimeState.h"
#include "UiSessionState.h"

#include <cstdint>

namespace app
{

inline bool shouldTriggerScheduledRefresh(const AppRuntimeState &runtime,
                                          const UiSessionState &ui,
                                          uint32_t nowEpoch,
                                          uint32_t nowMs = 0)
{
  if (runtime.mode == AppMode::Operational &&
      ui.route == UiRoute::DiagnosticsPage &&
      !runtime.backgroundSyncInProgress &&
      ui.nextDiagnosticsRefreshMs > 0 &&
      nowMs >= ui.nextDiagnosticsRefreshMs)
  {
    return true;
  }

  if (runtime.mode != AppMode::Operational ||
      runtime.nextRefreshDueEpoch == 0 ||
      nowEpoch < runtime.nextRefreshDueEpoch)
  {
    return false;
  }

  if (runtime.backgroundSyncInProgress)
  {
    return runtime.syncPhase == SyncPhase::FetchingWeather;
  }

  return ui.route == UiRoute::Home && !ui.holdFeedback.visible;
}

} // namespace app

#endif // APP_BACKGROUND_REFRESH_POLICY_H
