#ifndef APP_BACKLIGHT_PWM_H
#define APP_BACKLIGHT_PWM_H

#include <stdint.h>

namespace app
{

constexpr uint16_t kBacklightPwmRange = 1023;

uint16_t backlightPwmDutyForPercent(uint8_t percent);

} // namespace app

#endif // APP_BACKLIGHT_PWM_H
