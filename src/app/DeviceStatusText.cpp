#include "app/DeviceStatusText.h"

namespace app
{

std::string buildDeviceIpStatusLine(const std::string &localIp)
{
  if (localIp.empty())
  {
    return "Device IP: unavailable";
  }

  return "Device IP: " + localIp;
}

} // namespace app
