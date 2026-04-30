#include <doctest.h>

#include "app/HoldProgress.h"

TEST_CASE("hold progress pixels clamp to the configured width")
{
  CHECK(app::holdProgressPixels(0, 500, 204) == 0);
  CHECK(app::holdProgressPixels(125, 500, 204) == 51);
  CHECK(app::holdProgressPixels(250, 500, 204) == 102);
  CHECK(app::holdProgressPixels(500, 500, 204) == 204);
  CHECK(app::holdProgressPixels(700, 500, 204) == 204);
}

TEST_CASE("hold progress handles zero duration")
{
  CHECK(app::holdProgressPixels(10, 0, 204) == 204);
}

TEST_CASE("delayed hold progress stays hidden until late in the hold gesture")
{
  CHECK(app::delayedHoldProgressPixels(0, 400, 500, 204) == 0);
  CHECK(app::delayedHoldProgressPixels(399, 400, 500, 204) == 0);
  CHECK(app::delayedHoldProgressPixels(400, 400, 500, 204) == 0);
  CHECK(app::delayedHoldProgressPixels(450, 400, 500, 204) == 102);
  CHECK(app::delayedHoldProgressPixels(500, 400, 500, 204) == 204);
}
