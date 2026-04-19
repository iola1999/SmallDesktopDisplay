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
  CHECK(app::menuBoxYForIndex(0) == 56);
  CHECK(app::menuBoxYForIndex(2) == 132);
  CHECK(app::infoScrollOffsetForFirstVisible(0) == 0);
  CHECK(app::infoScrollOffsetForFirstVisible(2) == 72);
  CHECK(app::infoSelectionBoxY(0, 0) == 52);
  CHECK(app::infoSelectionBoxY(1, 3) == 124);
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
