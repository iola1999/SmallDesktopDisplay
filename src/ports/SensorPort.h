#ifndef PORTS_SENSOR_PORT_H
#define PORTS_SENSOR_PORT_H

#include "app/AppDataCache.h"

namespace ports
{

class SensorPort
{
public:
  virtual ~SensorPort() {}
  virtual bool read(app::IndoorClimateSnapshot &snapshot) = 0;
};

} // namespace ports

#endif // PORTS_SENSOR_PORT_H
