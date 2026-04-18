#ifndef ADAPTERS_ESP8266_SYSTEM_STATUS_PORT_H
#define ADAPTERS_ESP8266_SYSTEM_STATUS_PORT_H

#include "ports/SystemStatusPort.h"

namespace adapters
{

class Esp8266SystemStatusPort : public ports::SystemStatusPort
{
public:
  app::DiagnosticsSnapshot capture(const app::AppConfigData &config,
                                   const app::AppRuntimeState &runtime) const override;
};

} // namespace adapters

#endif // ADAPTERS_ESP8266_SYSTEM_STATUS_PORT_H
