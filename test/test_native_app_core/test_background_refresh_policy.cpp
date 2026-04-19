#include <doctest.h>

#include "app/BackgroundRefreshPolicy.h"

TEST_CASE("scheduled blocking refresh only runs while home is idle")
{
  app::AppRuntimeState runtime;
  runtime.mode = app::AppMode::Operational;
  runtime.nextRefreshDueEpoch = 100;

  app::UiSessionState ui;

  CHECK(app::shouldTriggerScheduledRefresh(runtime, ui, 100) == true);

  runtime.backgroundSyncInProgress = true;
  CHECK(app::shouldTriggerScheduledRefresh(runtime, ui, 100) == false);

  runtime.backgroundSyncInProgress = false;
  ui.route = app::UiRoute::SettingsMenu;
  CHECK(app::shouldTriggerScheduledRefresh(runtime, ui, 100) == false);

  ui.route = app::UiRoute::Home;
  ui.holdFeedback.visible = true;
  CHECK(app::shouldTriggerScheduledRefresh(runtime, ui, 100) == false);

  ui.holdFeedback.visible = false;
  CHECK(app::shouldTriggerScheduledRefresh(runtime, ui, 99) == false);

  runtime.backgroundSyncInProgress = true;
  runtime.syncPhase = app::SyncPhase::FetchingWeather;
  ui.route = app::UiRoute::SettingsMenu;
  CHECK(app::shouldTriggerScheduledRefresh(runtime, ui, 100) == true);
}
