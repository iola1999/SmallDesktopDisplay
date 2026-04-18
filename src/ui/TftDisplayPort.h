#ifndef UI_TFT_DISPLAY_PORT_H
#define UI_TFT_DISPLAY_PORT_H

#include "ports/DisplayPort.h"

#include <cstdint>

namespace ui
{

class TftDisplayPort : public ports::DisplayPort
{
public:
  void begin(uint8_t rotation, uint8_t brightness);
  void setBrightness(uint8_t brightness) override;
  void setRotation(uint8_t rotation);
  void tickClock();
  void tickBanner();
  void tickTransientUi(const app::AppViewModel &view, uint32_t nowMs);
  void render(const app::AppViewModel &view) override;
};

} // namespace ui

#endif // UI_TFT_DISPLAY_PORT_H
