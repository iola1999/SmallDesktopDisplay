#include "app/BacklightPwm.h"

namespace app
{

uint16_t backlightPwmDutyForPercent(uint8_t percent)
{
  if (percent > 100)
  {
    percent = 100;
  }

  return static_cast<uint16_t>(kBacklightPwmRange - (static_cast<uint16_t>(percent) * 10));
}

} // namespace app
