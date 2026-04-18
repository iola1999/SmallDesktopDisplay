#ifndef PORTS_CLOCK_PORT_H
#define PORTS_CLOCK_PORT_H

#include <cstdint>

namespace ports
{

class ClockPort
{
public:
  virtual ~ClockPort() {}
  virtual uint32_t nowEpochSeconds() const = 0;
};

} // namespace ports

#endif // PORTS_CLOCK_PORT_H
