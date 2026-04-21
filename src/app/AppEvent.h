#ifndef APP_APP_EVENT_H
#define APP_APP_EVENT_H

#include "AppDataCache.h"
#include "DiagnosticsSnapshot.h"

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
  PressStarted,
  LongPressArmed,
  PressReleased,
  ShortPressed,
  DoublePressed,
  LongPressed,
  ToastExpired,
  DiagnosticsSnapshotCaptured,
};

struct AppEvent
{
  AppEventType type = AppEventType::BootRequested;
  uint32_t epochSeconds = 0;
  uint32_t monotonicMs = 0;
  WeatherSnapshot weather;
  DiagnosticsSnapshot diagnostics;

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

  static AppEvent refreshDue(uint32_t epoch, uint32_t nowMs)
  {
    AppEvent event = refreshDue(epoch);
    event.monotonicMs = nowMs;
    return event;
  }

  static AppEvent pressStarted(uint32_t nowMs)
  {
    AppEvent event;
    event.type = AppEventType::PressStarted;
    event.monotonicMs = nowMs;
    return event;
  }

  static AppEvent longPressArmed(uint32_t nowMs)
  {
    AppEvent event;
    event.type = AppEventType::LongPressArmed;
    event.monotonicMs = nowMs;
    return event;
  }

  static AppEvent pressReleased(uint32_t nowMs)
  {
    AppEvent event;
    event.type = AppEventType::PressReleased;
    event.monotonicMs = nowMs;
    return event;
  }

  static AppEvent shortPressed(uint32_t nowMs)
  {
    AppEvent event;
    event.type = AppEventType::ShortPressed;
    event.monotonicMs = nowMs;
    return event;
  }

  static AppEvent longPressed(uint32_t nowMs)
  {
    AppEvent event;
    event.type = AppEventType::LongPressed;
    event.monotonicMs = nowMs;
    return event;
  }

  static AppEvent doublePressed(uint32_t nowMs)
  {
    AppEvent event;
    event.type = AppEventType::DoublePressed;
    event.monotonicMs = nowMs;
    return event;
  }

  static AppEvent toastExpired()
  {
    AppEvent event;
    event.type = AppEventType::ToastExpired;
    return event;
  }

  static AppEvent diagnosticsSnapshotCaptured(const DiagnosticsSnapshot &snapshot)
  {
    AppEvent event;
    event.type = AppEventType::DiagnosticsSnapshotCaptured;
    event.diagnostics = snapshot;
    return event;
  }
};

} // namespace app

#endif // APP_APP_EVENT_H
