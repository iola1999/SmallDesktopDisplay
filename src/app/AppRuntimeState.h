#ifndef APP_APP_RUNTIME_STATE_H
#define APP_APP_RUNTIME_STATE_H

#include <cstdint>

namespace app
{

enum class AppMode
{
  Booting,
  BlockingError,
  Operational,
};

enum class BlockingErrorReason
{
  None,
  NoNetwork,
  TimeSyncFailed,
  WeatherFetchFailed,
  ConfigRequired,
};

enum class SyncPhase
{
  Idle,
  ConnectingWifi,
  ResolvingCityCode,
  SyncingTime,
  FetchingWeather,
};

struct AppRuntimeState
{
  AppMode mode = AppMode::Booting;
  BlockingErrorReason blockingError = BlockingErrorReason::None;
  SyncPhase syncPhase = SyncPhase::Idle;
  bool initialSyncComplete = false;
  bool backgroundSyncInProgress = false;
  uint32_t lastWeatherSyncEpoch = 0;
  uint32_t lastTimeSyncEpoch = 0;
  uint32_t nextRefreshDueEpoch = 0;
};

} // namespace app

#endif // APP_APP_RUNTIME_STATE_H
