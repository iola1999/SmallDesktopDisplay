#ifndef ADAPTERS_ESP8266_NETWORK_PORT_H
#define ADAPTERS_ESP8266_NETWORK_PORT_H

#include "ports/NetworkPort.h"

namespace adapters
{

class Esp8266NetworkPort : public ports::NetworkPort
{
public:
  bool connect(app::AppConfigData &config) override;
  void wake() override;
  void sleep() override;
  void restart() override;
  void resetAndRestart() override;
};

} // namespace adapters

#endif // ADAPTERS_ESP8266_NETWORK_PORT_H
