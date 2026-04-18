#ifndef PORTS_TIME_SYNC_PORT_H
#define PORTS_TIME_SYNC_PORT_H

#include <cstdint>

namespace ports
{

class TimeSyncPort
{
public:
  virtual ~TimeSyncPort() {}
  virtual bool sync(uint32_t &epochSeconds) = 0;
};

} // namespace ports

#endif // PORTS_TIME_SYNC_PORT_H
