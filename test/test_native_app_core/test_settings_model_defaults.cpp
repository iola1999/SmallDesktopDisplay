#include <doctest.h>

#include "app/AppViewModel.h"
#include "app/UiSessionState.h"

TEST_CASE("ui session defaults to home route with no toast")
{
  app::UiSessionState ui;
  app::AppViewModel view;

  CHECK(ui.route == app::UiRoute::Home);
  CHECK(ui.selectedMenuIndex == 0);
  CHECK(ui.selectedBrightnessPresetIndex == 0);
  CHECK(ui.toastVisible == false);
  CHECK(ui.toastDeadlineMs == 0);
  CHECK(ui.diagnostics.valid == false);

  CHECK(view.main.pageKind == app::OperationalPageKind::Home);
  CHECK(view.main.footer.shortPressLabel == "");
  CHECK(view.main.footer.longPressLabel == "");
  CHECK(view.main.toast.visible == false);
  CHECK(view.main.menu.itemCount == 0);
  CHECK(view.main.info.rowCount == 0);
  CHECK(view.main.adjust.value == 0);
}
