#ifndef APP_APP_ACTION_H
#define APP_APP_ACTION_H

#include <array>
#include <cstddef>
#include <cstdint>

namespace app
{

enum class WifiConnectMode
{
  ForegroundBlocking,
  BackgroundSilent,
};

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

struct AppActionPayload
{
  uint32_t value = 0;
  WifiConnectMode mode = WifiConnectMode::ForegroundBlocking;
};

struct AppAction
{
  AppActionType type = AppActionType::RenderRequested;
  uint32_t value = 0;
  AppActionPayload payload;
};

struct ActionList
{
  std::array<AppAction, 12> items{};
  std::size_t count = 0;

  void push(AppActionType type)
  {
    items[count].type = type;
    items[count].value = 0;
    items[count].payload = AppActionPayload{};
    ++count;
  }

  void push(AppActionType type, uint32_t value)
  {
    items[count].type = type;
    items[count].value = value;
    items[count].payload = AppActionPayload{};
    items[count].payload.value = value;
    ++count;
  }

  void pushValue(AppActionType type, uint32_t value)
  {
    push(type, value);
  }

  void pushConnectWifi(WifiConnectMode mode)
  {
    items[count].type = AppActionType::ConnectWifi;
    items[count].value = 0;
    items[count].payload = AppActionPayload{};
    items[count].payload.mode = mode;
    ++count;
  }

  const AppAction &operator[](std::size_t index) const
  {
    return items[index];
  }
};

} // namespace app

#endif // APP_APP_ACTION_H
