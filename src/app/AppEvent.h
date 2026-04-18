#ifndef APP_APP_EVENT_H
#define APP_APP_EVENT_H

#include "AppDataCache.h"

#include <cstdint>

namespace app
{

enum class AppEventType
{
  BootRequested,
  WifiConnected,
  WifiConnectionFailed,
  TimeSynced,
  TimeSyncFailed,
  WeatherFetched,
  WeatherFetchFailed,
  RefreshDue,
};

struct AppEvent
{
  AppEventType type = AppEventType::BootRequested;
  uint32_t epochSeconds = 0;
  WeatherSnapshot weather;

  static AppEvent bootRequested()
  {
    return AppEvent{AppEventType::BootRequested};
  }

  static AppEvent wifiConnected()
  {
    return AppEvent{AppEventType::WifiConnected};
  }

  static AppEvent wifiConnectionFailed()
  {
    return AppEvent{AppEventType::WifiConnectionFailed};
  }

  static AppEvent timeSynced(uint32_t epoch)
  {
    AppEvent event{AppEventType::TimeSynced};
    event.epochSeconds = epoch;
    return event;
  }

  static AppEvent timeSyncFailed()
  {
    return AppEvent{AppEventType::TimeSyncFailed};
  }

  static AppEvent weatherFetched(const WeatherSnapshot &snapshot, uint32_t epoch)
  {
    AppEvent event{AppEventType::WeatherFetched};
    event.weather = snapshot;
    event.epochSeconds = epoch;
    return event;
  }

  static AppEvent weatherFetchFailed()
  {
    return AppEvent{AppEventType::WeatherFetchFailed};
  }

  static AppEvent refreshDue(uint32_t epoch)
  {
    AppEvent event{AppEventType::RefreshDue};
    event.epochSeconds = epoch;
    return event;
  }
};

} // namespace app

#endif // APP_APP_EVENT_H
