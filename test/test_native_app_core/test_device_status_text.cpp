#include <doctest.h>

#include "app/DeviceStatusText.h"

TEST_CASE("device status text includes the assigned local ip")
{
  CHECK(app::buildDeviceIpStatusLine("192.168.1.23") == "Device IP: 192.168.1.23");
}

TEST_CASE("device status text keeps an explicit unavailable fallback")
{
  CHECK(app::buildDeviceIpStatusLine("") == "Device IP: unavailable");
}
