#include <doctest.h>

#include "app/RenderPlan.h"

namespace
{

app::AppViewModel makeMenuView(std::size_t selectedIndex)
{
  app::AppViewModel view;
  view.kind = app::ViewKind::Main;
  view.main.pageKind = app::OperationalPageKind::Menu;
  view.main.menu.title = "Settings";
  view.main.menu.itemCount = 3;
  view.main.menu.items[0].label = "Diagnostics";
  view.main.menu.items[1].label = "Brightness";
  view.main.menu.items[2].label = "Restart";
  view.main.menu.items[0].selected = (selectedIndex == 0);
  view.main.menu.items[1].selected = (selectedIndex == 1);
  view.main.menu.items[2].selected = (selectedIndex == 2);
  view.main.footer.shortPressLabel = "Next";
  view.main.footer.longPressLabel = "OK";
  view.main.footer.doublePressLabel = "Back";
  return view;
}

app::AppViewModel makeInfoView(std::size_t firstVisibleRowIndex, std::size_t selectedRowIndex)
{
  app::AppViewModel view;
  view.kind = app::ViewKind::Main;
  view.main.pageKind = app::OperationalPageKind::Info;
  view.main.info.title = "Diagnostics";
  view.main.info.rowCount = 5;
  view.main.info.visibleRowCount = 4;
  view.main.info.firstVisibleRowIndex = firstVisibleRowIndex;
  view.main.info.selectedRowIndex = selectedRowIndex;
  view.main.info.rows[0].label = "Saved SSID";
  view.main.info.rows[0].value = "wifi-a";
  view.main.info.rows[1].label = "WiFi Link";
  view.main.info.rows[1].value = "connected";
  view.main.info.rows[2].label = "Active SSID";
  view.main.info.rows[2].value = "wifi-a";
  view.main.info.rows[3].label = "Free Heap";
  view.main.info.rows[3].value = "12345";
  view.main.info.rows[4].label = "Flash Used";
  view.main.info.rows[4].value = "45678";
  view.main.footer.shortPressLabel = "Scroll";
  view.main.footer.longPressLabel = "OK";
  view.main.footer.doublePressLabel = "Back";
  return view;
}

app::AppViewModel makeAdjustView(int value)
{
  app::AppViewModel view;
  view.kind = app::ViewKind::Main;
  view.main.pageKind = app::OperationalPageKind::Adjust;
  view.main.adjust.title = "Brightness";
  view.main.adjust.value = value;
  view.main.adjust.minValue = 10;
  view.main.adjust.maxValue = 100;
  view.main.adjust.unit = "%";
  view.main.footer.shortPressLabel = "Next";
  view.main.footer.longPressLabel = "Save";
  view.main.footer.doublePressLabel = "Back";
  return view;
}

} // namespace

TEST_CASE("menu selection changes only invalidate the menu body")
{
  const app::AppViewModel previous = makeMenuView(0);
  const app::AppViewModel next = makeMenuView(1);

  const app::RenderPlan plan = app::planRender(true, previous, next);

  CHECK(plan.region == app::RenderRegion::MenuBody);
}

TEST_CASE("diagnostics scroll only invalidates the info body")
{
  const app::AppViewModel previous = makeInfoView(0, 0);
  const app::AppViewModel next = makeInfoView(1, 1);

  const app::RenderPlan plan = app::planRender(true, previous, next);

  CHECK(plan.region == app::RenderRegion::InfoBody);
}

TEST_CASE("diagnostics value updates only invalidate the info body")
{
  const app::AppViewModel previous = makeInfoView(0, 0);
  app::AppViewModel next = previous;
  next.main.info.rows[3].value = "12000";

  const app::RenderPlan plan = app::planRender(true, previous, next);

  CHECK(plan.region == app::RenderRegion::InfoBody);
}

TEST_CASE("brightness value change only invalidates the adjust body")
{
  const app::AppViewModel previous = makeAdjustView(30);
  const app::AppViewModel next = makeAdjustView(60);

  const app::RenderPlan plan = app::planRender(true, previous, next);

  CHECK(plan.region == app::RenderRegion::AdjustBody);
}

TEST_CASE("cross-page transitions still require a full render")
{
  const app::AppViewModel previous = makeMenuView(0);
  const app::AppViewModel next = makeInfoView(0, 0);

  const app::RenderPlan plan = app::planRender(true, previous, next);

  CHECK(plan.region == app::RenderRegion::FullScreen);
}

TEST_CASE("chrome changes force a full render")
{
  app::AppViewModel previous = makeMenuView(0);
  app::AppViewModel next = previous;
  next.main.footer.longPressLabel = "Enter";

  const app::RenderPlan plan = app::planRender(true, previous, next);

  CHECK(plan.region == app::RenderRegion::FullScreen);
}
