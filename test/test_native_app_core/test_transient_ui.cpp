#include <doctest.h>

#include "app/TransientUi.h"

TEST_CASE("hold feedback stays hidden until the double-click window ends")
{
  CHECK(app::holdFeedbackProgressPercent(1000, false, 1299) == 0);
  CHECK(app::holdFeedbackProgressPercent(1000, false, 1300) == 0);
  CHECK(app::holdFeedbackProgressPercent(1000, false, 1400) == 50);
  CHECK(app::holdFeedbackProgressPercent(1000, true, 1100) == 100);
}

TEST_CASE("gesture feedback stays visible only for a short fixed duration")
{
  CHECK(app::gestureFeedbackVisible(2000, 2000) == true);
  CHECK(app::gestureFeedbackVisible(2000, 2419) == true);
  CHECK(app::gestureFeedbackVisible(2000, 2420) == false);
  CHECK(app::gestureFeedbackVisible(0, 50) == false);
}

TEST_CASE("gesture feedback redraws only once during its visible window")
{
  CHECK(app::gestureFeedbackShouldDraw(app::GestureFeedbackKind::Tap, 2000, 2000, false) == true);
  CHECK(app::gestureFeedbackShouldDraw(app::GestureFeedbackKind::Tap, 2000, 2100, true) == false);
  CHECK(app::gestureFeedbackShouldDraw(app::GestureFeedbackKind::Tap, 2000, 2419, true) == false);
  CHECK(app::gestureFeedbackShouldDraw(app::GestureFeedbackKind::Tap, 2000, 2420, false) == false);
  CHECK(app::gestureFeedbackShouldDraw(app::GestureFeedbackKind::None, 2000, 2000, false) == false);
}

TEST_CASE("hidden hold feedback only clears when a hold indicator was previously drawn")
{
  CHECK(app::holdFeedbackShouldClearWhenHidden(false, false, -1) == false);
  CHECK(app::holdFeedbackShouldClearWhenHidden(true, false, -1) == true);
  CHECK(app::holdFeedbackShouldClearWhenHidden(false, true, -1) == true);
  CHECK(app::holdFeedbackShouldClearWhenHidden(false, false, 12) == true);
}
