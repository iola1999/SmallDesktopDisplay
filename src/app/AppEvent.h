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
    AppEvent event;
    event.type = AppEventType::BootRequested;
    return event;
  }

  static AppEvent wifiConnected()
  {
    AppEvent event;
    event.type = AppEventType::WifiConnected;
    return event;
  }

  static AppEvent wifiConnectionFailed()
  {
    AppEvent event;
    event.type = AppEventType::WifiConnectionFailed;
    return event;
  }

  static AppEvent timeSynced(uint32_t epoch)
  {
    AppEvent event;
    event.type = AppEventType::TimeSynced;
    event.epochSeconds = epoch;
    return event;
  }

  static AppEvent timeSyncFailed()
  {
    AppEvent event;
    event.type = AppEventType::TimeSyncFailed;
    return event;
  }

  static AppEvent weatherFetched(const WeatherSnapshot &snapshot, uint32_t epoch)
  {
    AppEvent event;
    event.type = AppEventType::WeatherFetched;
    event.weather = snapshot;
    event.epochSeconds = epoch;
    return event;
  }

  static AppEvent weatherFetchFailed()
  {
    AppEvent event;
    event.type = AppEventType::WeatherFetchFailed;
    return event;
  }

  static AppEvent refreshDue(uint32_t epoch)
  {
    AppEvent event;
    event.type = AppEventType::RefreshDue;
    event.epochSeconds = epoch;
    return event;
  }
};

} // namespace app

#endif // APP_APP_EVENT_H
