#include "ui/TftFrameSink.h"

#include "Display.h"

namespace ui
{

void TftFrameSink::drawRgb565Row(uint16_t x, uint16_t y, uint16_t width, const uint16_t *pixels)
{
  display::tft.pushImage(x, y, width, 1, const_cast<uint16_t *>(pixels));
}

} // namespace ui
