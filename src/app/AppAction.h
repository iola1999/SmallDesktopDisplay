#ifndef APP_APP_ACTION_H
#define APP_APP_ACTION_H

#include <array>
#include <cstddef>
#include <cstdint>

namespace app
{

enum class AppActionType
{
  RenderRequested,
  ConnectWifi,
  ResolveCityCode,
  SyncTime,
  FetchWeather,
  WakeWifi,
  SleepWifi,
  PersistConfig,
  ResetWifiAndRestart,
  CaptureDiagnosticsSnapshot,
  PreviewBrightness,
  ApplyBrightness,
  RestartDevice,
};

struct AppAction
{
  AppActionType type = AppActionType::RenderRequested;
  uint32_t value = 0;
};

struct ActionList
{
  std::array<AppAction, 12> items{};
  std::size_t count = 0;

  void push(AppActionType type, uint32_t value = 0)
  {
    items[count].type = type;
    items[count].value = value;
    ++count;
  }

  const AppAction &operator[](std::size_t index) const
  {
    return items[index];
  }
};

} // namespace app

#endif // APP_APP_ACTION_H
