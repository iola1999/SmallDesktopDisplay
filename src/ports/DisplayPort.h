#ifndef PORTS_DISPLAY_PORT_H
#define PORTS_DISPLAY_PORT_H

#include "app/AppViewModel.h"

#include <cstdint>

namespace ports
{

class DisplayPort
{
public:
  virtual ~DisplayPort() {}
  virtual void render(const app::AppViewModel &view) = 0;
  virtual void setBrightness(uint8_t percent) = 0;
};

} // namespace ports

#endif // PORTS_DISPLAY_PORT_H
