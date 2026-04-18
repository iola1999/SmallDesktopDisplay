#ifndef APP_APP_ACTION_H
#define APP_APP_ACTION_H

#include <array>
#include <cstddef>

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
};

struct AppAction
{
  AppActionType type = AppActionType::RenderRequested;
};

struct ActionList
{
  std::array<AppAction, 8> items{};
  std::size_t count = 0;

  void push(AppActionType type)
  {
    items[count].type = type;
    ++count;
  }

  const AppAction &operator[](std::size_t index) const
  {
    return items[index];
  }
};

} // namespace app

#endif // APP_APP_ACTION_H
