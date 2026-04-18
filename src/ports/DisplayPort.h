#ifndef PORTS_DISPLAY_PORT_H
#define PORTS_DISPLAY_PORT_H

#include "app/AppViewModel.h"

namespace ports
{

class DisplayPort
{
public:
  virtual ~DisplayPort() {}
  virtual void render(const app::AppViewModel &view) = 0;
};

} // namespace ports

#endif // PORTS_DISPLAY_PORT_H
