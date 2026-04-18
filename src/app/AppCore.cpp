#include "app/AppCore.h"

namespace app
{

namespace
{

constexpr std::array<const char *, 4> kSettingsItems{
  "Back",
  "Diagnostics",
  "Brightness",
  "Restart",
};

constexpr std::array<const char *, 2> kRestartConfirmItems{
  "Back",
  "Confirm Restart",
};

constexpr std::array<uint8_t, 7> kBrightnessPresets{{10, 25, 40, 55, 70, 85, 100}};

uint8_t nearestBrightnessPresetIndex(uint8_t brightness)
{
  uint8_t bestIndex = 0;
  int bestDistance = 101;

  for (uint8_t index = 0; index < kBrightnessPresets.size(); ++index)
  {
    const int distance = (kBrightnessPresets[index] > brightness)
                           ? static_cast<int>(kBrightnessPresets[index] - brightness)
                           : static_cast<int>(brightness - kBrightnessPresets[index]);
    if (distance < bestDistance)
    {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

} // namespace

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

void AppCore::clearToast()
{
  ui_.toastVisible = false;
  ui_.toastDeadlineMs = 0;
  view_.main.toast.visible = false;
  view_.main.toast.text.clear();
}

void AppCore::refreshOperationalView()
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

  switch (ui_.route)
  {
    case UiRoute::Home:
      view_.main.pageKind = OperationalPageKind::Home;
      view_.main.footer = FooterHints{};
      view_.main.toast.visible = ui_.toastVisible;
      view_.main.toast.text = ui_.toastVisible ? "Debug shortcut" : "";
      break;

    case UiRoute::SettingsMenu:
      view_.main.pageKind = OperationalPageKind::Menu;
      view_.main.menu.title = "Settings";
      view_.main.menu.subtitle = "Long press to enter";
      view_.main.menu.itemCount = kSettingsItems.size();
      for (std::size_t index = 0; index < kSettingsItems.size(); ++index)
      {
        view_.main.menu.items[index].label = kSettingsItems[index];
        view_.main.menu.items[index].selected = (index == ui_.selectedMenuIndex);
      }
      view_.main.footer.shortPressLabel = "Next";
      view_.main.footer.longPressLabel = "Enter";
      view_.main.toast.visible = false;
      view_.main.toast.text.clear();
      break;

    case UiRoute::RebootConfirmMenu:
      view_.main.pageKind = OperationalPageKind::Menu;
      view_.main.menu.title = "Restart";
      view_.main.menu.subtitle = "Hold to execute";
      view_.main.menu.itemCount = kRestartConfirmItems.size();
      for (std::size_t index = 0; index < kRestartConfirmItems.size(); ++index)
      {
        view_.main.menu.items[index].label = kRestartConfirmItems[index];
        view_.main.menu.items[index].selected = (index == ui_.selectedMenuIndex);
      }
      for (std::size_t index = kRestartConfirmItems.size(); index < view_.main.menu.items.size(); ++index)
      {
        view_.main.menu.items[index] = MenuItemData{};
      }
      view_.main.footer.shortPressLabel = "Next";
      view_.main.footer.longPressLabel = "Enter";
      view_.main.toast.visible = false;
      view_.main.toast.text.clear();
      break;

    case UiRoute::DiagnosticsPage:
      break;

    case UiRoute::BrightnessAdjustPage:
      view_.main.pageKind = OperationalPageKind::Adjust;
      view_.main.adjust.title = "Brightness";
      view_.main.adjust.subtitle = "Preview before save";
      view_.main.adjust.value = kBrightnessPresets[ui_.selectedBrightnessPresetIndex];
      view_.main.adjust.minValue = kBrightnessPresets.front();
      view_.main.adjust.maxValue = kBrightnessPresets.back();
      view_.main.adjust.unit = "%";
      view_.main.footer.shortPressLabel = "Cycle";
      view_.main.footer.longPressLabel = "Save";
      view_.main.toast.visible = false;
      view_.main.toast.text.clear();
      break;
  }
}

void AppCore::openSettingsMenu()
{
  ui_.route = UiRoute::SettingsMenu;
  ui_.selectedMenuIndex = 0;
  clearToast();
  refreshOperationalView();
}

void AppCore::openRebootConfirmMenu()
{
  ui_.route = UiRoute::RebootConfirmMenu;
  ui_.selectedMenuIndex = 0;
  clearToast();
  refreshOperationalView();
}

ActionList AppCore::handle(const AppEvent &event)
{
  ActionList actions;

  switch (event.type)
  {
    case AppEventType::BootRequested:
      runtime_ = AppRuntimeState{};
      cache_ = AppDataCache{};
      ui_ = UiSessionState{};
      view_ = AppViewModel{};
      runtime_.mode = AppMode::Booting;
      runtime_.blockingError = BlockingErrorReason::None;
      runtime_.backgroundSyncInProgress = false;
      runtime_.lastBackgroundSyncFailed = false;
      runtime_.nextRefreshDueEpoch = 0;
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
        runtime_.nextRefreshDueEpoch = event.epochSeconds + (config_.weatherUpdateMinutes * 60U);
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
      refreshOperationalView();
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

    case AppEventType::ShortPressed:
      if (runtime_.mode != AppMode::Operational)
      {
        break;
      }

      if (ui_.route == UiRoute::Home)
      {
        ui_.toastVisible = true;
        ui_.toastDeadlineMs = event.monotonicMs + 1500U;
        refreshOperationalView();
        actions.push(AppActionType::RenderRequested);
      }
      else if (ui_.route == UiRoute::SettingsMenu)
      {
        ui_.selectedMenuIndex = static_cast<uint8_t>((ui_.selectedMenuIndex + 1U) % kSettingsItems.size());
        refreshOperationalView();
        actions.push(AppActionType::RenderRequested);
      }
      else if (ui_.route == UiRoute::BrightnessAdjustPage)
      {
        ui_.selectedBrightnessPresetIndex =
          static_cast<uint8_t>((ui_.selectedBrightnessPresetIndex + 1U) % kBrightnessPresets.size());
        refreshOperationalView();
        actions.push(AppActionType::PreviewBrightness, view_.main.adjust.value);
        actions.push(AppActionType::RenderRequested);
      }
      else if (ui_.route == UiRoute::RebootConfirmMenu)
      {
        ui_.selectedMenuIndex =
          static_cast<uint8_t>((ui_.selectedMenuIndex + 1U) % kRestartConfirmItems.size());
        refreshOperationalView();
        actions.push(AppActionType::RenderRequested);
      }
      break;

    case AppEventType::LongPressed:
      if (runtime_.mode != AppMode::Operational)
      {
        break;
      }

      if (ui_.route == UiRoute::Home)
      {
        openSettingsMenu();
        actions.push(AppActionType::RenderRequested);
      }
      else if (ui_.route == UiRoute::SettingsMenu)
      {
        if (ui_.selectedMenuIndex == 0)
        {
          ui_.route = UiRoute::Home;
          refreshOperationalView();
          actions.push(AppActionType::RenderRequested);
        }
        else if (ui_.selectedMenuIndex == 2)
        {
          ui_.route = UiRoute::BrightnessAdjustPage;
          ui_.selectedBrightnessPresetIndex = nearestBrightnessPresetIndex(config_.lcdBrightness);
          clearToast();
          refreshOperationalView();
          actions.push(AppActionType::RenderRequested);
        }
        else if (ui_.selectedMenuIndex == 3)
        {
          openRebootConfirmMenu();
          actions.push(AppActionType::RenderRequested);
        }
      }
      else if (ui_.route == UiRoute::BrightnessAdjustPage)
      {
        config_.lcdBrightness = kBrightnessPresets[ui_.selectedBrightnessPresetIndex];
        actions.push(AppActionType::ApplyBrightness, config_.lcdBrightness);
        openSettingsMenu();
        actions.push(AppActionType::RenderRequested);
      }
      else if (ui_.route == UiRoute::RebootConfirmMenu)
      {
        if (ui_.selectedMenuIndex == 0)
        {
          openSettingsMenu();
          actions.push(AppActionType::RenderRequested);
        }
        else
        {
          actions.push(AppActionType::RestartDevice);
        }
      }
      break;

    case AppEventType::ToastExpired:
      if (ui_.toastVisible)
      {
        clearToast();
        refreshOperationalView();
        actions.push(AppActionType::RenderRequested);
      }
      break;

    case AppEventType::DiagnosticsSnapshotCaptured:
      break;
  }

  return actions;
}

} // namespace app
