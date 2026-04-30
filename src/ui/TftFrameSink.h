#ifndef UI_TFT_FRAME_SINK_H
#define UI_TFT_FRAME_SINK_H

#include <cstdint>

namespace ui
{

class TftFrameSink
{
public:
  void drawRgb565Row(uint16_t x, uint16_t y, uint16_t width, const uint16_t *pixels);
};

} // namespace ui

#endif // UI_TFT_FRAME_SINK_H
