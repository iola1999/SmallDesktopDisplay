#ifndef APP_HOLD_PROGRESS_H
#define APP_HOLD_PROGRESS_H

#include <cstdint>

namespace app
{

uint16_t holdProgressPixels(uint32_t elapsedMs, uint32_t durationMs, uint16_t maxWidth);
uint16_t delayedHoldProgressPixels(uint32_t elapsedMs, uint32_t delayMs, uint32_t durationMs, uint16_t maxWidth);

} // namespace app

#endif // APP_HOLD_PROGRESS_H
