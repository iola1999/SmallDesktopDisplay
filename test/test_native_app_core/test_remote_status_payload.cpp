#include <doctest.h>

#include "remote/DeviceStatusPayload.h"

TEST_CASE("device status payload serializes brightness and uptime")
{
  char buffer[64];

  const bool ok = remote::buildDeviceStatusPayload(80, 1234, buffer, sizeof(buffer));

  CHECK(ok);
  CHECK(std::string(buffer) == "{\"brightness\":80,\"uptime_ms\":1234}");
}

TEST_CASE("device status payload rejects invalid brightness or tiny buffers")
{
  char buffer[16];

  CHECK_FALSE(remote::buildDeviceStatusPayload(101, 1234, buffer, sizeof(buffer)));
  CHECK_FALSE(remote::buildDeviceStatusPayload(80, 1234, buffer, 8));
}
