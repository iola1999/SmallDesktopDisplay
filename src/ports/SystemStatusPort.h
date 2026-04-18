#ifndef PORTS_SYSTEM_STATUS_PORT_H
#define PORTS_SYSTEM_STATUS_PORT_H

#include "app/AppConfigData.h"
#include "app/AppRuntimeState.h"
#include "app/DiagnosticsSnapshot.h"

namespace ports
{

class SystemStatusPort
{
public:
  virtual ~SystemStatusPort() {}
  virtual app::DiagnosticsSnapshot capture(const app::AppConfigData &config,
                                           const app::AppRuntimeState &runtime) const = 0;
};

} // namespace ports

#endif // PORTS_SYSTEM_STATUS_PORT_H
