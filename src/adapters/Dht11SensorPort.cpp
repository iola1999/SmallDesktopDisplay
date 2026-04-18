#include "adapters/Dht11SensorPort.h"

#include "Dht11.h"

namespace adapters
{

bool Dht11SensorPort::read(app::IndoorClimateSnapshot &snapshot)
{
  if (!started_)
  {
    dht11::begin();
    started_ = true;
  }

  return dht11::read(snapshot);
}

} // namespace adapters
