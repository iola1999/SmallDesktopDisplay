#include "app/AppDriver.h"

namespace app
{

void AppDriver::execute(const ActionList &actions, const AppConfigData &config, const AppViewModel &view)
{
  for (std::size_t index = 0; index < actions.count; ++index)
  {
    switch (actions[index].type)
    {
      case AppActionType::RenderRequested:
        display_.render(view);
        break;

      case AppActionType::ConnectWifi:
        network_.connect(config);
        break;

      case AppActionType::WakeWifi:
        network_.wake();
        break;

      case AppActionType::SleepWifi:
        network_.sleep();
        break;

      case AppActionType::PersistConfig:
        storage_.save(config);
        break;

      case AppActionType::ResetWifiAndRestart:
        network_.resetAndRestart();
        break;

      case AppActionType::ResolveCityCode:
      case AppActionType::SyncTime:
      case AppActionType::FetchWeather:
      default:
        break;
    }
  }
}

} // namespace app
