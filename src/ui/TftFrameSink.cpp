#include "ui/TftFrameSink.h"

#include "Display.h"

namespace ui
{

void TftFrameSink::drawRgb565Row(uint16_t x, uint16_t y, uint16_t width, const uint16_t *pixels)
{
  const bool previousSwap = display::tft.getSwapBytes();
  display::tft.setSwapBytes(true);
  display::tft.pushImage(x, y, width, 1, const_cast<uint16_t *>(pixels));
  display::tft.setSwapBytes(previousSwap);
}

void TftFrameSink::drawRgb565Block(uint16_t x,
                                   uint16_t y,
                                   uint16_t width,
                                   uint16_t height,
                                   const uint16_t *pixels)
{
  const bool previousSwap = display::tft.getSwapBytes();
  display::tft.setSwapBytes(true);
  display::tft.pushImage(x, y, width, height, const_cast<uint16_t *>(pixels));
  display::tft.setSwapBytes(previousSwap);
}

} // namespace ui
