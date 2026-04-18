#ifndef ADAPTERS_DHT11_SENSOR_PORT_H
#define ADAPTERS_DHT11_SENSOR_PORT_H

#include "ports/SensorPort.h"

namespace adapters
{

class Dht11SensorPort : public ports::SensorPort
{
public:
  bool read(app::IndoorClimateSnapshot &snapshot) override;

private:
  bool started_ = false;
};

} // namespace adapters

#endif // ADAPTERS_DHT11_SENSOR_PORT_H
