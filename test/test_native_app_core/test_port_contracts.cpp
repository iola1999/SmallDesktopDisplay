#include <doctest.h>

#include "ports/ClockPort.h"
#include "ports/DisplayPort.h"
#include "ports/NetworkPort.h"
#include "ports/SensorPort.h"
#include "ports/StoragePort.h"
#include "ports/TimeSyncPort.h"
#include "ports/WeatherPort.h"

struct FakeClockPort : ports::ClockPort
{
  uint32_t nowEpochSeconds() const override
  {
    return 1710000000;
  }
};

TEST_CASE("port headers are host-usable pure c++ contracts")
{
  FakeClockPort clock;
  CHECK(clock.nowEpochSeconds() == 1710000000);
}
