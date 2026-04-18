#include "app/AppCore.h"

namespace app
{

void AppCore::enterBlockingError(BlockingErrorReason reason, const char *title, const char *detail)
{
  runtime_.mode = AppMode::BlockingError;
  runtime_.blockingError = reason;
  runtime_.syncPhase = SyncPhase::Idle;
  view_.kind = ViewKind::Error;
  view_.error.reason = reason;
  view_.error.title = title;
  view_.error.detail = detail;
  view_.error.retrying = false;
}

void AppCore::refreshMainView()
{
  view_.kind = ViewKind::Main;
  view_.main.cityName = cache_.weather.cityName;
  view_.main.temperatureText = cache_.weather.temperatureText;
  view_.main.humidityText = cache_.weather.humidityText;
  view_.main.temperatureC = cache_.weather.temperatureC;
  view_.main.humidityPercent = cache_.weather.humidityPercent;
  view_.main.aqi = cache_.weather.aqi;
  view_.main.weatherCode = cache_.weather.weatherCode;
  view_.main.bannerLines = cache_.weather.bannerLines;
}

ActionList AppCore::handle(const AppEvent &event)
{
  ActionList actions;

  switch (event.type)
  {
    case AppEventType::BootRequested:
      runtime_.mode = AppMode::Booting;
      runtime_.blockingError = BlockingErrorReason::None;
      runtime_.backgroundSyncInProgress = false;
      runtime_.lastBackgroundSyncFailed = false;
      runtime_.syncPhase = SyncPhase::ConnectingWifi;
      view_.kind = ViewKind::Splash;
      view_.splash.detail = "Connecting WiFi";
      actions.push(AppActionType::RenderRequested);
      actions.push(AppActionType::ConnectWifi);
      break;

    case AppEventType::RefreshDue:
      if (runtime_.mode == AppMode::Operational && !runtime_.backgroundSyncInProgress)
      {
        runtime_.backgroundSyncInProgress = true;
        runtime_.lastBackgroundSyncFailed = false;
        runtime_.syncPhase = SyncPhase::ConnectingWifi;
        view_.main.showSyncInProgress = true;
        actions.push(AppActionType::WakeWifi);
        actions.push(AppActionType::ConnectWifi);
      }
      break;

    case AppEventType::WifiConnected:
      runtime_.syncPhase = SyncPhase::SyncingTime;
      actions.push(AppActionType::SyncTime);
      break;

    case AppEventType::WifiConnectionFailed:
      if (runtime_.initialSyncComplete)
      {
        runtime_.backgroundSyncInProgress = false;
        runtime_.lastBackgroundSyncFailed = true;
        runtime_.syncPhase = SyncPhase::Idle;
        view_.main.showSyncInProgress = false;
        actions.push(AppActionType::SleepWifi);
        actions.push(AppActionType::RenderRequested);
      }
      else
      {
        enterBlockingError(
          BlockingErrorReason::NoNetwork,
          "Network Error",
          "Unable to connect to WiFi");
        actions.push(AppActionType::RenderRequested);
      }
      break;

    case AppEventType::TimeSynced:
      cache_.time.valid = true;
      cache_.time.epochSeconds = event.epochSeconds;
      runtime_.lastTimeSyncEpoch = event.epochSeconds;
      runtime_.syncPhase = SyncPhase::FetchingWeather;
      actions.push(AppActionType::FetchWeather);
      break;

    case AppEventType::TimeSyncFailed:
      if (runtime_.initialSyncComplete)
      {
        runtime_.backgroundSyncInProgress = false;
        runtime_.lastBackgroundSyncFailed = true;
        runtime_.syncPhase = SyncPhase::Idle;
        view_.main.showSyncInProgress = false;
        actions.push(AppActionType::SleepWifi);
        actions.push(AppActionType::RenderRequested);
      }
      else
      {
        enterBlockingError(
          BlockingErrorReason::TimeSyncFailed,
          "Time Sync Failed",
          "Unable to reach NTP server");
        actions.push(AppActionType::RenderRequested);
      }
      break;

    case AppEventType::WeatherFetched:
    {
      const bool wasBackgroundSync = runtime_.backgroundSyncInProgress;
      cache_.weather = event.weather;
      runtime_.lastWeatherSyncEpoch = event.epochSeconds;
      runtime_.initialSyncComplete = true;
      runtime_.backgroundSyncInProgress = false;
      runtime_.lastBackgroundSyncFailed = false;
      runtime_.mode = AppMode::Operational;
      runtime_.syncPhase = SyncPhase::Idle;
      runtime_.nextRefreshDueEpoch = event.epochSeconds + (config_.weatherUpdateMinutes * 60U);
      refreshMainView();
      view_.main.showSyncInProgress = false;
      if (wasBackgroundSync)
      {
        actions.push(AppActionType::SleepWifi);
      }
      actions.push(AppActionType::RenderRequested);
      break;
    }

    case AppEventType::WeatherFetchFailed:
      if (runtime_.initialSyncComplete)
      {
        runtime_.backgroundSyncInProgress = false;
        runtime_.lastBackgroundSyncFailed = true;
        runtime_.syncPhase = SyncPhase::Idle;
        view_.main.showSyncInProgress = false;
        actions.push(AppActionType::SleepWifi);
        actions.push(AppActionType::RenderRequested);
      }
      else
      {
        enterBlockingError(
          BlockingErrorReason::WeatherFetchFailed,
          "Weather Failed",
          "Unable to fetch weather data");
        actions.push(AppActionType::RenderRequested);
      }
      break;

    default:
      break;
  }

  return actions;
}

} // namespace app
