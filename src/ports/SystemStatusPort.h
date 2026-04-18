#ifndef PORTS_SYSTEM_STATUS_PORT_H
#define PORTS_SYSTEM_STATUS_PORT_H

#include "app/DiagnosticsSnapshot.h"

namespace ports
{

class SystemStatusPort
{
public:
  virtual ~SystemStatusPort() {}
  virtual app::DiagnosticsSnapshot capture() const = 0;
};

} // namespace ports

#endif // PORTS_SYSTEM_STATUS_PORT_H
