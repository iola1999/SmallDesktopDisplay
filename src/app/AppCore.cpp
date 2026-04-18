#include "app/AppCore.h"

#include <cstdio>

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
constexpr std::size_t kInfoVisibleRows = 4;

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

std::string formatUint32(uint32_t value)
{
  char buffer[16];
  snprintf(buffer, sizeof(buffer), "%lu", static_cast<unsigned long>(value));
  return buffer;
}

std::string formatEpochCompact(uint32_t epochSeconds)
{
  if (epochSeconds == 0)
  {
    return "-";
  }
  return formatUint32(epochSeconds);
}

std::string textOrDash(const std::string &value)
{
  return value.empty() ? "-" : value;
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

void AppCore::beginHoldFeedback(uint32_t nowMs)
{
  ui_.holdFeedback.visible = true;
  ui_.holdFeedback.armed = false;
  ui_.holdFeedback.pressStartedMs = nowMs;
  ui_.holdFeedback.progressPercent = 0;
}

void AppCore::armHoldFeedback()
{
  ui_.holdFeedback.visible = true;
  ui_.holdFeedback.armed = true;
  ui_.holdFeedback.progressPercent = 100;
}

void AppCore::clearHoldFeedback()
{
  ui_.holdFeedback = HoldFeedbackState{};
}

void AppCore::clearToast()
{
  ui_.toastVisible = false;
  ui_.toastDeadlineMs = 0;
  view_.main.toast.visible = false;
  view_.main.toast.text.clear();
}

void AppCore::resetInfoPage()
{
  ui_.infoPage = InfoPageState{};
}

void AppCore::advanceInfoPage(std::size_t rowCount, std::size_t visibleRowCount)
{
  if (rowCount == 0)
  {
    return;
  }

  ui_.infoPage.selectedRowIndex =
    static_cast<uint8_t>((ui_.infoPage.selectedRowIndex + 1U) % rowCount);

  if (ui_.infoPage.selectedRowIndex == 0)
  {
    ui_.infoPage.firstVisibleRowIndex = 0;
    return;
  }

  const std::size_t lastVisible = ui_.infoPage.firstVisibleRowIndex + visibleRowCount - 1U;
  if (ui_.infoPage.selectedRowIndex > lastVisible)
  {
    ui_.infoPage.firstVisibleRowIndex =
      static_cast<uint8_t>(ui_.infoPage.selectedRowIndex - visibleRowCount + 1U);
  }
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
  view_.main.footer = FooterHints{};
  view_.main.toast.visible = false;
  view_.main.toast.text.clear();
  view_.main.menu = MenuBodyData{};
  view_.main.info = InfoBodyData{};
  view_.main.adjust = AdjustBodyData{};
  view_.main.info.visibleRowCount = kInfoVisibleRows;
  view_.main.holdFeedback.visible = ui_.holdFeedback.visible;
  view_.main.holdFeedback.armed = ui_.holdFeedback.armed;
  view_.main.holdFeedback.pressStartedMs = ui_.holdFeedback.pressStartedMs;
  view_.main.holdFeedback.progressPercent = ui_.holdFeedback.progressPercent;
  view_.main.homeAnimationEnabled = (ui_.route == UiRoute::Home);

  switch (ui_.route)
  {
    case UiRoute::Home:
      view_.main.pageKind = OperationalPageKind::Home;
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
      break;

    case UiRoute::DiagnosticsPage:
      view_.main.pageKind = OperationalPageKind::Info;
      view_.main.info.title = "Diagnostics";
      view_.main.info.subtitle = "Tap to scroll";
      view_.main.info.rowCount = 9;
      view_.main.info.firstVisibleRowIndex = ui_.infoPage.firstVisibleRowIndex;
      view_.main.info.selectedRowIndex = ui_.infoPage.selectedRowIndex;
      view_.main.info.rows[0].label = "Saved SSID";
      view_.main.info.rows[0].value = textOrDash(ui_.diagnostics.savedWifiSsid);
      view_.main.info.rows[1].label = "WiFi Radio";
      view_.main.info.rows[1].value = ui_.diagnostics.wifiRadioAwake ? "awake" : "sleeping";
      view_.main.info.rows[2].label = "WiFi Link";
      view_.main.info.rows[2].value = ui_.diagnostics.wifiLinkConnected ? "connected" : "disconnected";
      view_.main.info.rows[3].label = "Active SSID";
      view_.main.info.rows[3].value = textOrDash(ui_.diagnostics.activeWifiSsid);
      view_.main.info.rows[4].label = "Last Sync";
      view_.main.info.rows[4].value = formatEpochCompact(ui_.diagnostics.lastWeatherSyncEpoch);
      view_.main.info.rows[5].label = "Refresh";
      view_.main.info.rows[5].value = formatUint32(ui_.diagnostics.refreshIntervalMinutes) + "m";
      view_.main.info.rows[6].label = "Free Heap";
      view_.main.info.rows[6].value = formatUint32(ui_.diagnostics.freeHeapBytes);
      view_.main.info.rows[7].label = "Flash Used";
      view_.main.info.rows[7].value = formatUint32(ui_.diagnostics.programFlashUsedBytes);
      view_.main.info.rows[8].label = "Flash Total";
      view_.main.info.rows[8].value = formatUint32(ui_.diagnostics.programFlashTotalBytes);
      view_.main.footer.shortPressLabel = "Scroll";
      view_.main.footer.longPressLabel = "Back";
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
      break;
  }
}

void AppCore::openSettingsMenu()
{
  ui_.route = UiRoute::SettingsMenu;
  ui_.selectedMenuIndex = 0;
  resetInfoPage();
  clearToast();
  refreshOperationalView();
}

void AppCore::openRebootConfirmMenu()
{
  ui_.route = UiRoute::RebootConfirmMenu;
  ui_.selectedMenuIndex = 0;
  resetInfoPage();
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
      actions.pushConnectWifi(WifiConnectMode::ForegroundBlocking);
      break;

    case AppEventType::RefreshDue:
      if (runtime_.mode == AppMode::Operational && !runtime_.backgroundSyncInProgress)
      {
        runtime_.backgroundSyncInProgress = true;
        runtime_.lastBackgroundSyncFailed = false;
        runtime_.syncPhase = SyncPhase::ConnectingWifi;
        runtime_.nextRefreshDueEpoch = event.epochSeconds + (config_.weatherUpdateMinutes * 60U);
        view_.main.showSyncInProgress = false;
        actions.push(AppActionType::WakeWifi);
        actions.pushConnectWifi(WifiConnectMode::BackgroundSilent);
      }
      break;

    case AppEventType::PressStarted:
      if (runtime_.mode == AppMode::Operational)
      {
        beginHoldFeedback(event.monotonicMs);
        refreshOperationalView();
        actions.push(AppActionType::RenderRequested);
      }
      break;

    case AppEventType::LongPressArmed:
      if (runtime_.mode == AppMode::Operational && ui_.holdFeedback.visible)
      {
        armHoldFeedback();
        refreshOperationalView();
        actions.push(AppActionType::RenderRequested);
      }
      break;

    case AppEventType::PressReleased:
      if (runtime_.mode == AppMode::Operational && ui_.holdFeedback.visible)
      {
        clearHoldFeedback();
        refreshOperationalView();
        actions.push(AppActionType::RenderRequested);
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

      clearHoldFeedback();
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
      else if (ui_.route == UiRoute::DiagnosticsPage)
      {
        advanceInfoPage(view_.main.info.rowCount, kInfoVisibleRows);
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

      clearHoldFeedback();
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
        else if (ui_.selectedMenuIndex == 1)
        {
          actions.push(AppActionType::CaptureDiagnosticsSnapshot);
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
      else if (ui_.route == UiRoute::DiagnosticsPage)
      {
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
      ui_.diagnostics = event.diagnostics;
      ui_.route = UiRoute::DiagnosticsPage;
      resetInfoPage();
      refreshOperationalView();
      actions.push(AppActionType::RenderRequested);
      break;
  }

  return actions;
}

} // namespace app
