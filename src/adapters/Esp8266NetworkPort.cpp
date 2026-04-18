#include "adapters/Esp8266NetworkPort.h"

#include "Net.h"

namespace adapters
{

bool Esp8266NetworkPort::connect(app::AppConfigData &config, app::WifiConnectMode mode)
{
  return net::connect(config, mode);
}

void Esp8266NetworkPort::wake()
{
  net::wake();
}

void Esp8266NetworkPort::sleep()
{
  net::sleep();
}

void Esp8266NetworkPort::restart()
{
  net::restart();
}

void Esp8266NetworkPort::resetAndRestart()
{
  net::resetAndRestart();
}

} // namespace adapters
