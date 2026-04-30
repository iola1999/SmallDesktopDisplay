#include <doctest.h>

#include "remote/DeviceStatusPayload.h"

TEST_CASE("device status payload serializes brightness and uptime")
{
  char buffer[160];

  const bool ok = remote::buildDeviceStatusPayload(80, 1234, 34560, 32000, 8, -48, buffer, sizeof(buffer));

  CHECK(ok);
  CHECK(std::string(buffer) == "{\"brightness\":80,\"uptime_ms\":1234,\"heap_free\":34560,\"heap_max_block\":32000,"
                               "\"heap_fragmentation\":8,\"wifi_rssi\":-48}");
}

TEST_CASE("device status payload rejects invalid brightness or tiny buffers")
{
  char buffer[16];

  CHECK_FALSE(remote::buildDeviceStatusPayload(101, 1234, 34560, 32000, 8, -48, buffer, sizeof(buffer)));
  CHECK_FALSE(remote::buildDeviceStatusPayload(80, 1234, 34560, 32000, 8, -48, buffer, 8));
}

TEST_CASE("device status payload rejects impossible heap fragmentation")
{
  char buffer[160];

  CHECK_FALSE(remote::buildDeviceStatusPayload(80, 1234, 34560, 32000, 101, -48, buffer, sizeof(buffer)));
}
