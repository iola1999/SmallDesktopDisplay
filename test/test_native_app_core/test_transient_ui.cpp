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
