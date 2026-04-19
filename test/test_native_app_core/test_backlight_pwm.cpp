#include <doctest.h>

#include "app/BacklightPwm.h"

TEST_CASE("backlight pwm preserves legacy esp8266 10-bit mapping")
{
  CHECK(app::kBacklightPwmRange == 1023);
  CHECK(app::backlightPwmDutyForPercent(0) == 1023);
  CHECK(app::backlightPwmDutyForPercent(50) == 523);
  CHECK(app::backlightPwmDutyForPercent(100) == 23);
}

TEST_CASE("backlight pwm clamps values above 100 percent")
{
  CHECK(app::backlightPwmDutyForPercent(101) == 23);
  CHECK(app::backlightPwmDutyForPercent(255) == 23);
}
