#ifndef PORTS_NETWORK_PORT_H
#define PORTS_NETWORK_PORT_H

#include "app/AppConfigData.h"

namespace ports
{

class NetworkPort
{
public:
  virtual ~NetworkPort() {}
  virtual void wake() = 0;
  virtual void sleep() = 0;
  virtual bool connect(app::AppConfigData &config) = 0;
  virtual void resetAndRestart() = 0;
};

} // namespace ports

#endif // PORTS_NETWORK_PORT_H
