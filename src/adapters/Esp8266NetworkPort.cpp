#include "adapters/Esp8266NetworkPort.h"

#include "Net.h"

namespace adapters
{

bool Esp8266NetworkPort::connect(app::AppConfigData &config)
{
  return net::connect(config);
}

void Esp8266NetworkPort::wake()
{
  net::wake();
}

void Esp8266NetworkPort::sleep()
{
  net::sleep();
}

void Esp8266NetworkPort::resetAndRestart()
{
  net::resetAndRestart();
}

} // namespace adapters
