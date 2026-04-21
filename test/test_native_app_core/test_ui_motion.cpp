#include <doctest.h>

#include "app/AppViewModel.h"
#include "app/UiMotion.h"

TEST_CASE("motion values ease toward their targets and settle inside snap distance")
{
  app::MotionValue value;
  app::snapMotion(value, 120);
  app::retargetMotion(value, 180);

  CHECK(app::advanceMotion(value, 4, 1) == true);
  CHECK(value.current > 120);
  CHECK(value.current < 180);
  CHECK(value.settled == false);

  while (app::advanceMotion(value, 4, 1))
  {
  }

  CHECK(value.current == 180);
  CHECK(value.target == 180);
  CHECK(value.settled == true);
}

TEST_CASE("motion values can be retargeted while still in flight")
{
  app::MotionValue value;
  app::snapMotion(value, 0);
  app::retargetMotion(value, 100);
  REQUIRE(app::advanceMotion(value, 4, 1) == true);
  const int16_t inFlight = value.current;

  app::retargetMotion(value, 40);

  while (app::advanceMotion(value, 4, 1))
  {
  }

  CHECK(inFlight > 0);
  CHECK(value.current == 40);
  CHECK(value.target == 40);
  CHECK(value.settled == true);
}

TEST_CASE("motion values use widened arithmetic for large deltas")
{
  app::MotionValue value;
  app::snapMotion(value, static_cast<int16_t>(-32768));
  app::retargetMotion(value, static_cast<int16_t>(32767));

  CHECK(app::advanceMotion(value, 4, 1) == true);
  CHECK(value.current > static_cast<int16_t>(-32768));
  CHECK(value.current < static_cast<int16_t>(32767));
  CHECK(value.settled == false);
}

TEST_CASE("ui motion geometry helpers stay aligned with the current layout")
{
  CHECK(app::spriteBufferBytes(240, 180, 4) == 21600);
  CHECK(app::spriteBufferBytes(212, 180, 4) == 19080);
  CHECK(app::spriteBufferBytes(240, 180, 8) == 43200);
  CHECK(app::spriteBufferBytes(240, 180, 16) == 86400);
  CHECK(app::spriteBufferBytes(239, 180, 4) == 21600);
  CHECK(app::spriteBufferBytes(0, 180, 4) == 0);
  CHECK(app::spriteBufferBytes(240, 0, 4) == 0);
  CHECK(app::menuBoxYForIndex(0) == 56);
  CHECK(app::menuBoxYForIndex(2) == 132);
  const app::MotionRect emptyMenuRect = app::menuBodyDirtyRect(0);
  CHECK(emptyMenuRect.x == 0);
  CHECK(emptyMenuRect.y == 0);
  CHECK(emptyMenuRect.width == 0);
  CHECK(emptyMenuRect.height == 0);
  const app::MotionRect singleMenuRect = app::menuBodyDirtyRect(1);
  CHECK(singleMenuRect.x == 16);
  CHECK(singleMenuRect.y == 56);
  CHECK(singleMenuRect.width == 208);
  CHECK(singleMenuRect.height == 30);
  const app::MotionRect fullMenuRect = app::menuBodyDirtyRect(4);
  CHECK(fullMenuRect.x == 16);
  CHECK(fullMenuRect.y == 56);
  CHECK(fullMenuRect.width == 208);
  CHECK(fullMenuRect.height == 144);
  const app::MotionRect menuSelectionRect = app::menuSelectionDirtyRect(56, 94);
  CHECK(menuSelectionRect.x == 16);
  CHECK(menuSelectionRect.y == 56);
  CHECK(menuSelectionRect.width == 208);
  CHECK(menuSelectionRect.height == 68);
  CHECK(app::infoScrollOffsetForFirstVisible(0) == 0);
  CHECK(app::infoScrollOffsetForFirstVisible(2) == 72);
  CHECK(app::infoSelectionBoxY(0, 0) == 52);
  CHECK(app::infoSelectionBoxY(1, 3) == 124);
  const app::MotionRect infoSelectionRect = app::infoSelectionDirtyRect(52, 124);
  CHECK(infoSelectionRect.x == 14);
  CHECK(infoSelectionRect.y == 52);
  CHECK(infoSelectionRect.width == 212);
  CHECK(infoSelectionRect.height == 102);
  const app::MotionRect infoStableRect = app::infoBodyDirtyRect(0, 0, 52, 88);
  CHECK(infoStableRect.x == 14);
  CHECK(infoStableRect.y == 52);
  CHECK(infoStableRect.width == 212);
  CHECK(infoStableRect.height == 66);
  const app::MotionRect infoScrollingRect = app::infoBodyDirtyRect(0, 36, 52, 160);
  CHECK(infoScrollingRect.x == 14);
  CHECK(infoScrollingRect.y == 44);
  CHECK(infoScrollingRect.width == 212);
  CHECK(infoScrollingRect.height == 180);
  CHECK(app::adjustFillWidth(10, 10, 100, 192) == 0);
  CHECK(app::adjustFillWidth(5, 10, 100, 192) == 0);
  CHECK(app::adjustFillWidth(55, 10, 100, 192) == 96);
  CHECK(app::adjustFillWidth(100, 10, 100, 192) == 192);
  CHECK(app::adjustFillWidth(120, 10, 100, 192) == 192);
  CHECK(app::adjustFillWidth(55, 10, 100, 0) == 0);
  CHECK(app::adjustFillWidth(55, 10, 10, 192) == 0);
}

TEST_CASE("home motion invalidation only triggers when leaving the main view")
{
  CHECK(app::shouldInvalidateHomeMotionOnViewTransition(app::ViewKind::Main, app::ViewKind::Splash) == true);
  CHECK(app::shouldInvalidateHomeMotionOnViewTransition(app::ViewKind::Main, app::ViewKind::Error) == true);
  CHECK(app::shouldInvalidateHomeMotionOnViewTransition(app::ViewKind::Main, app::ViewKind::Main) == false);
  CHECK(app::shouldInvalidateHomeMotionOnViewTransition(app::ViewKind::Splash, app::ViewKind::Main) == false);
  CHECK(app::shouldInvalidateHomeMotionOnViewTransition(app::ViewKind::Error, app::ViewKind::Main) == false);
}
