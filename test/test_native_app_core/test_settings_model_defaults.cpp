#include <doctest.h>

#include "app/AppAction.h"
#include "app/AppEvent.h"
#include "app/AppViewModel.h"
#include "app/UiSessionState.h"

TEST_CASE("ui session defaults to home route with no toast")
{
  app::UiSessionState ui;
  app::AppViewModel view;

  CHECK(app_config::kButtonLongPressMs == 500);
  CHECK(app_config::kButtonDoubleClickMs == 300);
  CHECK(app_config::kHoldFeedbackDelayMs == app_config::kButtonDoubleClickMs);
  CHECK(app_config::kKeepWifiAwake == true);
  CHECK(app_config::kGestureFeedbackDurationMs == 420);
  CHECK(ui.route == app::UiRoute::Home);
  CHECK(ui.selectedMenuIndex == 0);
  CHECK(ui.selectedBrightnessPresetIndex == 0);
  CHECK(ui.infoPage.selectedRowIndex == 0);
  CHECK(ui.infoPage.firstVisibleRowIndex == 0);
  CHECK(ui.holdFeedback.visible == false);
  CHECK(ui.holdFeedback.armed == false);
  CHECK(ui.holdFeedback.pressStartedMs == 0);
  CHECK(ui.holdFeedback.progressPercent == 0);
  CHECK(ui.toastVisible == false);
  CHECK(ui.toastDeadlineMs == 0);
  CHECK(ui.diagnostics.valid == false);

  CHECK(view.main.pageKind == app::OperationalPageKind::Home);
  CHECK(view.main.footer.shortPressLabel == "");
  CHECK(view.main.footer.longPressLabel == "");
  CHECK(view.main.footer.doublePressLabel == "");
  CHECK(view.main.toast.visible == false);
  CHECK(view.main.menu.itemCount == 0);
  CHECK(view.main.info.rowCount == 0);
  CHECK(view.main.info.visibleRowCount == 4);
  CHECK(view.main.info.selectedRowIndex == 0);
  CHECK(view.main.info.firstVisibleRowIndex == 0);
  CHECK(view.main.adjust.value == 0);
  CHECK(view.main.holdFeedback.visible == false);
  CHECK(view.main.holdFeedback.progressPercent == 0);
}

TEST_CASE("connect-wifi actions keep mode in a structured payload")
{
  app::ActionList actions;
  actions.pushConnectWifi(app::WifiConnectMode::BackgroundSilent);

  REQUIRE(actions.count == 1);
  CHECK(actions[0].type == app::AppActionType::ConnectWifi);
  CHECK(actions[0].payload.mode == app::WifiConnectMode::BackgroundSilent);
  CHECK(actions[0].payload.value == 0);
}

TEST_CASE("press lifecycle events preserve monotonic timestamps")
{
  const auto started = app::AppEvent::pressStarted(1000);
  const auto armed = app::AppEvent::longPressArmed(1180);
  const auto released = app::AppEvent::pressReleased(1230);

  CHECK(started.type == app::AppEventType::PressStarted);
  CHECK(started.monotonicMs == 1000);
  CHECK(armed.type == app::AppEventType::LongPressArmed);
  CHECK(armed.monotonicMs == 1180);
  CHECK(released.type == app::AppEventType::PressReleased);
  CHECK(released.monotonicMs == 1230);
}

TEST_CASE("double press events preserve monotonic timestamps")
{
  const auto event = app::AppEvent::doublePressed(1400);

  CHECK(event.type == app::AppEventType::DoublePressed);
  CHECK(event.monotonicMs == 1400);
}
