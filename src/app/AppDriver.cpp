#include "app/AppDriver.h"

#include "app/AppCore.h"

namespace app
{

namespace
{

bool isDeferredNetworkStage(AppActionType type)
{
  switch (type)
  {
    case AppActionType::ConnectWifi:
    case AppActionType::ResolveCityCode:
    case AppActionType::SyncTime:
    case AppActionType::FetchWeather:
      return true;

    case AppActionType::RenderRequested:
    case AppActionType::WakeWifi:
    case AppActionType::SleepWifi:
    case AppActionType::PersistConfig:
    case AppActionType::ResetWifiAndRestart:
    case AppActionType::CaptureDiagnosticsSnapshot:
    case AppActionType::PreviewBrightness:
    case AppActionType::ApplyBrightness:
    case AppActionType::RestartDevice:
    default:
      return false;
  }
}

} // namespace

void AppDriver::appendActions(ActionList &target, const ActionList &source)
{
  for (std::size_t index = 0; index < source.count; ++index)
  {
    if (source[index].type == AppActionType::ConnectWifi)
    {
      target.pushConnectWifi(source[index].payload.mode);
    }
    else
    {
      target.push(source[index].type, source[index].value);
    }
  }
}

bool AppDriver::containsDeferredNetworkStage(const ActionList &actions) const
{
  for (std::size_t index = 0; index < actions.count; ++index)
  {
    if (isDeferredNetworkStage(actions[index].type))
    {
      return true;
    }
  }

  return false;
}

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
      {
        AppConfigData configCopy = config;
        (void)network_.connect(configCopy, actions[index].payload.mode);
        break;
      }

      case AppActionType::WakeWifi:
        network_.wake();
        break;

      case AppActionType::SleepWifi:
        network_.sleep();
        break;

      case AppActionType::PersistConfig:
        storage_.save(config);
        break;

      case AppActionType::PreviewBrightness:
        display_.setBrightness(static_cast<uint8_t>(actions[index].value));
        break;

      case AppActionType::ApplyBrightness:
        display_.setBrightness(static_cast<uint8_t>(actions[index].value));
        storage_.save(config);
        break;

      case AppActionType::RestartDevice:
        network_.restart();
        break;

      case AppActionType::ResetWifiAndRestart:
        network_.resetAndRestart();
        break;

      case AppActionType::ResolveCityCode:
      case AppActionType::SyncTime:
      case AppActionType::FetchWeather:
      case AppActionType::CaptureDiagnosticsSnapshot:
      default:
        break;
    }
  }
}

void AppDriver::dispatch(AppCore &core, const ActionList &actions)
{
  ActionList pending = actions;

  while (pending.count > 0)
  {
    ActionList next;

    for (std::size_t index = 0; index < pending.count; ++index)
    {
      switch (pending[index].type)
      {
        case AppActionType::RenderRequested:
        {
          AppViewModel renderedView = core.view();
          if (renderedView.kind == ViewKind::Main && core.config().dhtEnabled)
          {
            IndoorClimateSnapshot indoor;
            if (sensor_.read(indoor))
            {
              renderedView.main.showIndoorClimate = indoor.valid;
              renderedView.main.indoorTemperatureC = indoor.temperatureC;
              renderedView.main.indoorHumidityPercent = indoor.humidityPercent;
            }
          }
          display_.render(renderedView);
          break;
        }

        case AppActionType::ConnectWifi:
          if (network_.connect(core.configMutable(), pending[index].payload.mode))
          {
            storage_.save(core.config());
            appendActions(next, core.handle(AppEvent::wifiConnected()));
          }
          else
          {
            appendActions(next, core.handle(AppEvent::wifiConnectionFailed()));
          }
          break;

        case AppActionType::SyncTime:
        {
          uint32_t epochSeconds = 0;
          if (timeSync_.sync(epochSeconds))
          {
            appendActions(next, core.handle(AppEvent::timeSynced(epochSeconds)));
          }
          else
          {
            appendActions(next, core.handle(AppEvent::timeSyncFailed()));
          }
          break;
        }

        case AppActionType::FetchWeather:
        {
          std::string cityCode = core.config().cityCode;
          if (cityCode.length() != 9 && weather_.resolveCityCode(cityCode))
          {
            core.configMutable().cityCode = cityCode;
            storage_.save(core.config());
          }

          WeatherSnapshot snapshot;
          if (weather_.fetchWeather(core.config().cityCode, snapshot))
          {
            appendActions(next, core.handle(AppEvent::weatherFetched(snapshot, core.runtime().lastTimeSyncEpoch)));
          }
          else
          {
            appendActions(next, core.handle(AppEvent::weatherFetchFailed()));
          }
          break;
        }

        case AppActionType::WakeWifi:
          network_.wake();
          break;

        case AppActionType::SleepWifi:
          network_.sleep();
          break;

        case AppActionType::PersistConfig:
          storage_.save(core.config());
          break;

        case AppActionType::PreviewBrightness:
          display_.setBrightness(static_cast<uint8_t>(pending[index].payload.value));
          break;

        case AppActionType::ApplyBrightness:
          display_.setBrightness(static_cast<uint8_t>(pending[index].payload.value));
          storage_.save(core.config());
          break;

        case AppActionType::CaptureDiagnosticsSnapshot:
          appendActions(
            next,
            core.handle(
              AppEvent::diagnosticsSnapshotCaptured(systemStatus_.capture(core.config(), core.runtime()))));
          break;

        case AppActionType::RestartDevice:
          network_.restart();
          break;

        case AppActionType::ResetWifiAndRestart:
          network_.resetAndRestart();
          break;

        case AppActionType::ResolveCityCode:
        default:
          break;
      }
    }

    if (containsDeferredNetworkStage(next))
    {
      appendActions(pending_, next);
      return;
    }

    pending = next;
  }
}

void AppDriver::dispatchPending(AppCore &core)
{
  ActionList pending = pending_;
  pending_ = ActionList{};
  dispatch(core, pending);
}

bool AppDriver::hasPendingActions() const
{
  return pending_.count > 0;
}

} // namespace app
