#include "app/HoldProgress.h"

namespace app
{

uint16_t holdProgressPixels(uint32_t elapsedMs, uint32_t durationMs, uint16_t maxWidth)
{
  if (durationMs == 0U || elapsedMs >= durationMs)
  {
    return maxWidth;
  }

  return static_cast<uint16_t>((static_cast<uint32_t>(maxWidth) * elapsedMs) / durationMs);
}

uint16_t delayedHoldProgressPixels(uint32_t elapsedMs, uint32_t delayMs, uint32_t durationMs, uint16_t maxWidth)
{
  if (elapsedMs <= delayMs)
  {
    return 0;
  }

  if (durationMs <= delayMs)
  {
    return maxWidth;
  }

  return holdProgressPixels(elapsedMs - delayMs, durationMs - delayMs, maxWidth);
}

} // namespace app
